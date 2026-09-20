// server/app.js — HTTP API & SSE streaming endpoints
//
// Routes:
//   POST /api/chat            — Submit a user message and start a run
//   GET  /api/runs/:runId     — Get run status and full event history
//   GET  /api/runs/:runId/stream — SSE stream with cursor-based resumption
//   POST /api/runs/:runId/fail  — Inject failure for demo/testing (AC5)
//
// SSE cursor protocol:
//   The client sends its last-seen sequence number via:
//     1. Query param: ?afterSeq=N
//     2. HTTP header: Last-Event-ID: N (standard SSE reconnection)
//   The server replays all persisted events with seq > N, then
//   seamlessly transitions to live broadcast. Server-side dedup
//   ensures no event is sent twice during the replay→live handover.

import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  startRun,
  getRun,
  getEventsAfterSeq,
  getMaxSeq,
  getEmitter,
  injectFailure,
  cancelRun,
} from './run-manager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(express.json());

  // Serve static frontend files
  app.use(express.static(join(__dirname, '..', 'client')));

  // ── POST /api/chat ──────────────────────────────────────────────────
  app.post('/api/chat', (req, res) => {
    const { content, conversationId, generatorOpts } = req.body;
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'content is required' });
    }

    try {
      const result = startRun({
        content: content.trim(),
        conversationId,
        generatorOpts,
      });
      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/runs/:runId ────────────────────────────────────────────
  app.get('/api/runs/:runId', (req, res) => {
    const run = getRun(req.params.runId);
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }
    const events = getEventsAfterSeq(run.id, 0);
    res.json({ ...run, events });
  });

  // ── GET /api/runs/:runId/stream ─────────────────────────────────────
  // SSE endpoint with cursor-based resumption.
  app.get('/api/runs/:runId/stream', (req, res) => {
    const { runId } = req.params;
    const run = getRun(runId);
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    // Determine cursor from query or Last-Event-ID header
    const rawCursor = req.query.afterSeq ?? req.headers['last-event-id'];
    const afterSeq = rawCursor != null ? parseInt(rawCursor, 10) : 0;

    if (isNaN(afterSeq) || afterSeq < 0) {
      return res.status(400).json({ error: 'Invalid cursor value' });
    }

    // AC6: Check if cursor is beyond known max seq
    const maxSeq = getMaxSeq(runId);
    if (afterSeq > maxSeq && maxSeq > 0) {
      return res.status(400).json({
        error: 'Cursor is beyond the latest known event',
        maxSeq,
        requestedAfterSeq: afterSeq,
        hint: 'Use afterSeq=0 to replay from the beginning, or use the maxSeq value',
      });
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering if proxied
    });

    // Helper to write an SSE event
    const writeSSE = (event) => {
      res.write(`id: ${event.seq}\n`);
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify({ seq: event.seq, payload: event.payload })}\n\n`);
    };

    const writeMeta = (eventName, data) => {
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Track highest seq sent to this client for dedup during replay→live transition
    let highestSentSeq = afterSeq;

    // ── Phase 1: Replay persisted events ────────────────────────────
    const replayEvents = getEventsAfterSeq(runId, afterSeq);
    for (const event of replayEvents) {
      writeSSE(event);
      highestSentSeq = Math.max(highestSentSeq, event.seq);
    }

    // Check if run is already in a terminal state — if so, send done and close
    const currentRun = getRun(runId);
    if (['completed', 'failed', 'interrupted', 'cancelled'].includes(currentRun.state)) {
      writeMeta('run_state', {
        state: currentRun.state,
        totalEvents: currentRun.total_events,
        error: currentRun.error || null,
      });
      res.end();
      return;
    }

    // ── Phase 2: Subscribe to live events ───────────────────────────
    const emitter = getEmitter(runId);
    if (!emitter) {
      // Run just finished between our check — re-read final state
      const finalRun = getRun(runId);
      writeMeta('run_state', {
        state: finalRun.state,
        totalEvents: finalRun.total_events,
        error: finalRun.error || null,
      });
      res.end();
      return;
    }

    const onEvent = (event) => {
      // Server-side dedup: only send events newer than what we already replayed
      if (event.seq > highestSentSeq) {
        writeSSE(event);
        highestSentSeq = event.seq;
      }
    };

    const onDone = (info) => {
      writeMeta('run_state', {
        state: info.state,
        totalEvents: info.totalEvents,
        error: info.error || null,
      });
      cleanup();
      res.end();
    };

    emitter.on('event', onEvent);
    emitter.on('done', onDone);

    // Handle client disconnect
    const cleanup = () => {
      emitter.off('event', onEvent);
      emitter.off('done', onDone);
    };

    req.on('close', cleanup);
  });

  // ── POST /api/runs/:runId/fail ──────────────────────────────────────
  // Demo/test endpoint to inject a failure on an active run (AC5).
  app.post('/api/runs/:runId/fail', (req, res) => {
    const run = getRun(req.params.runId);
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }
    if (run.state !== 'running') {
      return res.status(409).json({ error: `Run is already ${run.state}` });
    }
    injectFailure(req.params.runId);
    res.json({ ok: true, message: 'Failure injected' });
  });

  // ── POST /api/runs/:runId/cancel ────────────────────────────────────
  // User-initiated cancellation endpoint (Optional stretch work).
  app.post('/api/runs/:runId/cancel', (req, res) => {
    const run = getRun(req.params.runId);
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }
    if (!['queued', 'running'].includes(run.state)) {
      return res.status(409).json({ error: `Run cannot be cancelled because it is already ${run.state}` });
    }
    const cancelled = cancelRun(req.params.runId);
    res.json({ ok: cancelled, state: 'cancelled' });
  });

  return app;
}
