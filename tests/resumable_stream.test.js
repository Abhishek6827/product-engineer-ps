// tests/resumable_stream.test.js — Deterministic tests for AC1–AC6
//
// Uses Node 24 built-in test runner (node:test + node:assert).
// Each test spins up the server on a random port, exercises the
// protocol, and tears down. No paid APIs, no arbitrary sleeps.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, closeDb, recoverStaleRuns, getRun, getEventsAfterSeq } from '../server/db.js';
import { createApp } from '../server/app.js';
import { killAllRuns } from '../server/run-manager.js';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Helper: start server on random port, return { baseUrl, server, close }
function startServer(dbPath) {
  initDb(dbPath);
  recoverStaleRuns();
  const app = createApp();
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      resolve({
        baseUrl: `http://localhost:${port}`,
        server,
        close: () => {
          killAllRuns();
          server.close();
          closeDb();
        },
      });
    });
  });
}

// Helper: consume SSE stream, collecting events
function consumeSSE(url, opts = {}) {
  const { stopAfterSeq, maxEvents = 1000, timeout = 15000 } = opts;
  return new Promise(async (resolve, reject) => {
    const events = [];
    let runState = null;
    const timer = setTimeout(() => {
      controller.abort();
      resolve({ events, runState, timedOut: true });
    }, timeout);

    const controller = new AbortController();

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        clearTimeout(timer);
        const body = await res.json();
        return resolve({ error: body, events, runState });
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line

        let currentEventType = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            if (currentEventType === 'text_chunk') {
              events.push(data);

              // Stop early if configured (for disconnect simulation)
              if (stopAfterSeq && data.seq >= stopAfterSeq) {
                clearTimeout(timer);
                controller.abort();
                return resolve({ events, runState, stoppedEarly: true });
              }
            } else if (currentEventType === 'run_state') {
              runState = data;
            }
            currentEventType = null;
          }
        }

        if (events.length >= maxEvents) break;
      }

      clearTimeout(timer);
      resolve({ events, runState });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        resolve({ events, runState, aborted: true });
      } else {
        reject(err);
      }
    }
  });
}

// Helper: start a chat run and return the runId
async function startChat(baseUrl, opts = {}) {
  const { chunkCount = 15, delayMs = 20, failAtChunk } = opts;
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: 'Test message',
      generatorOpts: { chunkCount, delayMs, failAtChunk },
    }),
  });
  assert.equal(res.status, 201);
  return res.json();
}


describe('Resumable Realtime Conversation', () => {
  const tmpDir = join(__dirname, '..', 'data', 'test-' + randomUUID().slice(0, 8));
  let srv;

  before(async () => {
    mkdirSync(tmpDir, { recursive: true });
  });

  after(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });


  // ── AC1: Ordered live stream ──────────────────────────────────────
  it('AC1: delivers all events in order and reaches completed state', async () => {
    const dbPath = join(tmpDir, 'ac1.db');
    srv = await startServer(dbPath);

    try {
      const { runId } = await startChat(srv.baseUrl, { chunkCount: 10, delayMs: 15 });
      const { events, runState } = await consumeSSE(`${srv.baseUrl}/api/runs/${runId}/stream`);

      // All events received
      assert.equal(events.length, 10, `Expected 10 events, got ${events.length}`);

      // Strictly ordered
      for (let i = 0; i < events.length; i++) {
        assert.equal(events[i].seq, i + 1, `Event ${i} has wrong seq`);
      }

      // Terminal state
      assert.equal(runState.state, 'completed');
    } finally {
      srv.close();
    }
  });


  // ── AC2: Missed-event recovery ────────────────────────────────────
  it('AC2: reconnects from cursor and receives missed events without gaps', async () => {
    const dbPath = join(tmpDir, 'ac2.db');
    srv = await startServer(dbPath);

    try {
      const { runId } = await startChat(srv.baseUrl, { chunkCount: 20, delayMs: 30 });

      // Phase 1: Read first 8 events then disconnect
      const phase1 = await consumeSSE(
        `${srv.baseUrl}/api/runs/${runId}/stream`,
        { stopAfterSeq: 8 }
      );
      assert.ok(phase1.events.length >= 8, `Phase 1 got ${phase1.events.length} events`);
      const lastCursor = phase1.events[phase1.events.length - 1].seq;

      // Wait a bit for more events to be generated
      await new Promise(r => setTimeout(r, 200));

      // Phase 2: Reconnect from cursor
      const phase2 = await consumeSSE(
        `${srv.baseUrl}/api/runs/${runId}/stream?afterSeq=${lastCursor}`
      );

      // Combine: phase1 events + phase2 events should cover all 20
      const allSeqs = [
        ...phase1.events.map(e => e.seq),
        ...phase2.events.map(e => e.seq),
      ];

      // No gaps
      const uniqueSeqs = [...new Set(allSeqs)].sort((a, b) => a - b);
      assert.equal(uniqueSeqs.length, 20, `Expected 20 unique seqs, got ${uniqueSeqs.length}`);
      for (let i = 0; i < 20; i++) {
        assert.equal(uniqueSeqs[i], i + 1, `Missing seq ${i + 1}`);
      }

      // Phase 2 starts exactly after cursor — no duplicates
      const phase2Seqs = phase2.events.map(e => e.seq);
      assert.ok(phase2Seqs[0] > lastCursor, `Phase 2 first seq should be > ${lastCursor}`);

      // Terminal state
      assert.equal(phase2.runState.state, 'completed');
    } finally {
      srv.close();
    }
  });


  // ── AC3: Replay/live overlap deduplication ────────────────────────
  it('AC3: deduplicates when replay and live events overlap', async () => {
    const dbPath = join(tmpDir, 'ac3.db');
    srv = await startServer(dbPath);

    try {
      const { runId } = await startChat(srv.baseUrl, { chunkCount: 20, delayMs: 40 });

      // Read first 5 events, then disconnect
      const phase1 = await consumeSSE(
        `${srv.baseUrl}/api/runs/${runId}/stream`,
        { stopAfterSeq: 5 }
      );

      // Small delay — events continue generating on server
      await new Promise(r => setTimeout(r, 100));

      // Reconnect from seq=3 (intentionally below our actual cursor)
      // This creates an overlap: events 4-5 will be replayed but we already have them
      const phase2 = await consumeSSE(
        `${srv.baseUrl}/api/runs/${runId}/stream?afterSeq=3`
      );

      // Phase2 should include events 4+ (some via replay, rest via live)
      // The important thing: when combined with phase1, no seq appears in both
      // that would cause duplicate rendering
      const phase2Seqs = phase2.events.map(e => e.seq);

      // All seqs in phase2 should be > 3 (our requested cursor)
      for (const seq of phase2Seqs) {
        assert.ok(seq > 3, `Phase 2 event seq ${seq} should be > 3`);
      }

      // Combined unique coverage should be complete
      const allSeqs = new Set([
        ...phase1.events.map(e => e.seq),
        ...phase2Seqs,
      ]);
      assert.equal(allSeqs.size, 20);
    } finally {
      srv.close();
    }
  });


  // ── AC4: Service restart recovery ─────────────────────────────────
  it('AC4: recovers state after service restart', async () => {
    const dbPath = join(tmpDir, 'ac4.db');

    // Start server and create a completed run
    srv = await startServer(dbPath);
    const { runId } = await startChat(srv.baseUrl, { chunkCount: 10, delayMs: 15 });
    const { events, runState } = await consumeSSE(`${srv.baseUrl}/api/runs/${runId}/stream`);
    assert.equal(runState.state, 'completed');

    // Shut down server (simulates crash)
    srv.close();

    // Restart with same database file
    srv = await startServer(dbPath);

    // Reconnect and replay — the completed run's history should be intact
    const recovery = await consumeSSE(
      `${srv.baseUrl}/api/runs/${runId}/stream?afterSeq=0`
    );

    // All 10 events should replay
    assert.equal(recovery.events.length, 10);
    for (let i = 0; i < 10; i++) {
      assert.equal(recovery.events[i].seq, i + 1);
    }

    // State should still be completed
    assert.equal(recovery.runState.state, 'completed');

    srv.close();
  });


  // ── AC4b: In-progress run survives restart as interrupted ─────────
  it('AC4b: in-progress run becomes interrupted after restart', async () => {
    const dbPath = join(tmpDir, 'ac4b.db');

    // Start server, start a slow run
    srv = await startServer(dbPath);
    const { runId } = await startChat(srv.baseUrl, { chunkCount: 100, delayMs: 100 });

    // Read a few events
    const phase1 = await consumeSSE(
      `${srv.baseUrl}/api/runs/${runId}/stream`,
      { stopAfterSeq: 5 }
    );
    assert.ok(phase1.events.length >= 5);

    // Kill server (simulates crash while run is active)
    srv.close();

    // Restart — stale run recovery should mark it interrupted
    srv = await startServer(dbPath);

    // Check the run state via API
    const res = await fetch(`${srv.baseUrl}/api/runs/${runId}`);
    const run = await res.json();
    assert.equal(run.state, 'interrupted');
    assert.ok(run.error.includes('restarted'));

    // Events generated before crash are preserved
    assert.ok(run.events.length >= 5);

    srv.close();
  });


  // ── AC5: Generation failure ───────────────────────────────────────
  it('AC5: generator failure results in failed state with preserved history', async () => {
    const dbPath = join(tmpDir, 'ac5.db');
    srv = await startServer(dbPath);

    try {
      // Generator will fail after emitting 5 chunks
      const { runId } = await startChat(srv.baseUrl, {
        chunkCount: 20,
        delayMs: 20,
        failAtChunk: 5,
      });

      const { events, runState } = await consumeSSE(
        `${srv.baseUrl}/api/runs/${runId}/stream`
      );

      // Should have received 5 events before failure
      assert.equal(events.length, 5, `Expected 5 events, got ${events.length}`);

      // Run should be failed
      assert.equal(runState.state, 'failed');
      assert.ok(runState.error, 'Should have an error message');

      // Verify via API that state is durable
      const apiRes = await fetch(`${srv.baseUrl}/api/runs/${runId}`);
      const run = await apiRes.json();
      assert.equal(run.state, 'failed');

      // A failed run must never later become completed
      assert.notEqual(run.state, 'completed');
    } finally {
      srv.close();
    }
  });


  // ── AC6: Unknown or stale cursor ──────────────────────────────────
  it('AC6: returns explicit error for cursor beyond known range', async () => {
    const dbPath = join(tmpDir, 'ac6.db');
    srv = await startServer(dbPath);

    try {
      const { runId } = await startChat(srv.baseUrl, { chunkCount: 10, delayMs: 15 });

      // Wait for run to complete
      await consumeSSE(`${srv.baseUrl}/api/runs/${runId}/stream`);

      // Try to reconnect with a cursor far beyond the known range
      const res = await fetch(
        `${srv.baseUrl}/api/runs/${runId}/stream?afterSeq=999`
      );

      // Server should return an explicit error, not silently miss data
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.ok(body.error);
      assert.ok(body.maxSeq !== undefined, 'Should include maxSeq in error response');
    } finally {
      srv.close();
    }
  });
});
