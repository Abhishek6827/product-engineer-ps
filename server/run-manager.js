// server/run-manager.js — Run lifecycle manager
//
// Owns the state machine for a run and the bridge between durable
// persistence (SQLite) and transient delivery (in-memory EventEmitter
// per active run).
//
// Key invariant: every event is written to SQLite BEFORE it is
// broadcast to live subscribers. This guarantees that a reconnecting
// client can always replay from the durable log even if the broadcast
// was missed.

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import {
  createConversation,
  getConversation,
  createMessage,
  createRun,
  updateRunState,
  getRun,
  insertEvent,
  getEventsAfterSeq,
  getMaxSeq,
  getEventCount,
} from './db.js';
import { generateReply } from './generator.js';

// Map of runId -> EventEmitter for live subscribers
const activeEmitters = new Map();
// Map of runId -> AbortController for cancellation
const activeControllers = new Map();
// Set of runIds that were abruptly killed (simulating crash/shutdown)
const killedRuns = new Set();

/**
 * Start a new conversational run.
 * @param {Object} params
 * @param {string} params.content - User message content
 * @param {string} [params.conversationId] - Existing conversation (creates one if absent)
 * @param {Object} [params.generatorOpts] - Options passed to the generator
 * @returns {{ conversationId: string, userMessageId: string, runId: string }}
 */
export function startRun({ content, conversationId, generatorOpts = {} }) {
  // Ensure conversation exists
  if (!conversationId || !getConversation(conversationId)) {
    conversationId = createConversation(conversationId);
  }

  const userMessageId = randomUUID();
  createMessage(userMessageId, conversationId, 'user', content);

  const runId = randomUUID();
  createRun(runId, conversationId, userMessageId);

  // Create emitter for live subscribers
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50); // allow many SSE clients
  activeEmitters.set(runId, emitter);

  const abortController = new AbortController();
  activeControllers.set(runId, abortController);

  // Transition to running
  updateRunState(runId, 'running');

  // Spawn async generator consumption (fire-and-forget)
  consumeGenerator(runId, emitter, abortController.signal, { ...generatorOpts, prompt: content });

  return { conversationId, userMessageId, runId };
}

/**
 * Consume generator output: persist each chunk, then broadcast.
 */
async function consumeGenerator(runId, emitter, signal, generatorOpts) {
  let seq = 0;
  try {
    for await (const chunk of generateReply({ ...generatorOpts, signal })) {
      seq++;
      const event = {
        run_id: runId,
        seq,
        type: 'text_chunk',
        payload: chunk.text,
      };

      // Persist FIRST — this is the durability guarantee.
      // If the DB is closed (server restart simulation in tests), bail out
      // silently — in production the process would have died.
      try {
        insertEvent(runId, seq, event.type, event.payload);
      } catch {
        return; // DB gone — process is "dead" from our perspective
      }

      // Broadcast to live subscribers
      emitter.emit('event', event);
    }

    // If killed abruptly (simulating crash), don't update DB — let recoverStaleRuns handle it
    if (killedRuns.has(runId)) {
      killedRuns.delete(runId);
      return;
    }

    // If aborted, don't mark as completed
    if (signal.aborted) {
      try {
        updateRunState(runId, 'interrupted', {
          completedAt: new Date().toISOString(),
          error: 'Run was cancelled',
          totalEvents: seq,
        });
      } catch { /* DB closed */ }
      emitter.emit('done', { state: 'interrupted', totalEvents: seq });
    } else {
      // Successful completion
      try {
        updateRunState(runId, 'completed', {
          completedAt: new Date().toISOString(),
          totalEvents: seq,
        });
      } catch { /* DB closed */ }
      emitter.emit('done', { state: 'completed', totalEvents: seq });
    }
  } catch (err) {
    if (killedRuns.has(runId)) {
      killedRuns.delete(runId);
      return;
    }
    // Generator failure (AC5) — run becomes failed, event history preserved
    try {
      updateRunState(runId, 'failed', {
        completedAt: new Date().toISOString(),
        error: err.message,
        totalEvents: seq,
      });
    } catch { /* DB closed */ }
    emitter.emit('done', { state: 'failed', error: err.message, totalEvents: seq });
  } finally {
    // Clean up after a short delay to let final SSE writes flush
    setTimeout(() => {
      activeEmitters.delete(runId);
      activeControllers.delete(runId);
    }, 2000);
  }
}

/**
 * Get the live emitter for a run, if still active.
 * @param {string} runId
 * @returns {EventEmitter|undefined}
 */
export function getEmitter(runId) {
  return activeEmitters.get(runId);
}

/**
 * Trigger a simulated failure on an active run (for demo/testing AC5).
 * @param {string} runId
 */
export function injectFailure(runId) {
  const controller = activeControllers.get(runId);
  if (controller) {
    controller.abort();
  }
  // Also update state directly as failed
  const run = getRun(runId);
  if (run && run.state === 'running') {
    updateRunState(runId, 'failed', {
      completedAt: new Date().toISOString(),
      error: 'Injected failure for testing',
    });
    const emitter = activeEmitters.get(runId);
    if (emitter) {
      emitter.emit('done', { state: 'failed', error: 'Injected failure for testing' });
    }
  }
}

/**
 * Abort all active in-flight runs and clear in-memory state.
 */
export function abortAllRuns() {
  for (const controller of activeControllers.values()) {
    try { controller.abort(); } catch {}
  }
  activeControllers.clear();
  activeEmitters.clear();
}

/**
 * Abruptly kill all active runs simulating a process crash (leaves DB state intact).
 */
export function killAllRuns() {
  for (const [runId, controller] of activeControllers.entries()) {
    killedRuns.add(runId);
    try { controller.abort(); } catch {}
  }
  activeControllers.clear();
  activeEmitters.clear();
}

// Re-export db query helpers for the API layer
export { getRun, getEventsAfterSeq, getMaxSeq, getEventCount };
