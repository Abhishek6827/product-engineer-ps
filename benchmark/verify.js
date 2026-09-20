// benchmark/verify.js — Verification benchmark
//
// Generates 30+ ordered text events for one run, interrupts and
// reconnects the client at least once while generation is active,
// reconstructs the expected final response, and asserts zero missing
// and zero duplicate events.
//
// Usage: node benchmark/verify.js

import { initDb, closeDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CHUNK_COUNT = 40;
const DELAY_MS = 50;
const DISCONNECT_AT = 15; // Disconnect after receiving seq 15

async function consumeSSE(url, opts = {}) {
  const { stopAfterSeq, timeout = 30000 } = opts;
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
        buffer = lines.pop();

        let currentEventType = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            if (currentEventType === 'text_chunk') {
              events.push(data);
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

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       Resumable Realtime Conversation — Benchmark          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();

  const tmpDir = join(__dirname, '..', 'data', 'benchmark-' + randomUUID().slice(0, 8));
  mkdirSync(tmpDir, { recursive: true });
  const dbPath = join(tmpDir, 'bench.db');

  initDb(dbPath);
  const app = createApp();
  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  const startTime = Date.now();

  try {
    // 1. Start a run with 40 chunks
    console.log(`→ Starting run with ${CHUNK_COUNT} chunks, ${DELAY_MS}ms delay`);
    const chatRes = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'Benchmark test message',
        generatorOpts: { chunkCount: CHUNK_COUNT, delayMs: DELAY_MS },
      }),
    });
    const { runId } = await chatRes.json();
    console.log(`  Run ID: ${runId}`);

    // 2. Phase 1: Stream until disconnect point
    console.log(`\n→ Phase 1: Streaming until seq=${DISCONNECT_AT}, then disconnecting`);
    const phase1 = await consumeSSE(
      `${baseUrl}/api/runs/${runId}/stream`,
      { stopAfterSeq: DISCONNECT_AT }
    );
    const cursor = phase1.events[phase1.events.length - 1].seq;
    console.log(`  Received ${phase1.events.length} events, cursor at seq=${cursor}`);

    // 3. Wait a bit while generation continues
    console.log('\n→ Waiting 300ms while generation continues on server…');
    await new Promise(r => setTimeout(r, 300));

    // 4. Phase 2: Reconnect from cursor
    console.log(`\n→ Phase 2: Reconnecting from cursor seq=${cursor}`);
    const phase2 = await consumeSSE(
      `${baseUrl}/api/runs/${runId}/stream?afterSeq=${cursor}`
    );
    console.log(`  Received ${phase2.events.length} events`);
    console.log(`  Final run state: ${phase2.runState?.state}`);

    // 5. Verify
    const allEvents = [...phase1.events, ...phase2.events];
    const allSeqs = allEvents.map(e => e.seq);
    const uniqueSeqs = [...new Set(allSeqs)].sort((a, b) => a - b);
    const duplicateCount = allSeqs.length - uniqueSeqs.length;

    // Check for gaps
    let missingCount = 0;
    const missing = [];
    for (let i = 1; i <= CHUNK_COUNT; i++) {
      if (!uniqueSeqs.includes(i)) {
        missingCount++;
        missing.push(i);
      }
    }

    // Reconstruct full text
    const sortedEvents = allEvents
      .filter((e, i, arr) => arr.findIndex(x => x.seq === e.seq) === i)
      .sort((a, b) => a.seq - b.seq);
    const fullText = sortedEvents.map(e => e.payload).join('');

    const elapsed = Date.now() - startTime;

    console.log('\n┌──────────────────────────────────────────────────────────┐');
    console.log('│                 BENCHMARK RESULTS                        │');
    console.log('├──────────────────────────────────────────────────────────┤');
    console.log(`│  Expected events:       ${CHUNK_COUNT.toString().padStart(6)}`);
    console.log(`│  Phase 1 events:        ${phase1.events.length.toString().padStart(6)}`);
    console.log(`│  Phase 2 events:        ${phase2.events.length.toString().padStart(6)}`);
    console.log(`│  Total received:        ${allSeqs.length.toString().padStart(6)}`);
    console.log(`│  Unique events:         ${uniqueSeqs.length.toString().padStart(6)}`);
    console.log(`│  Missing events:        ${missingCount.toString().padStart(6)}  ${missingCount === 0 ? '✓' : '✗ ' + missing.join(',')}`);
    console.log(`│  Duplicate events:      ${duplicateCount.toString().padStart(6)}  ${duplicateCount === 0 ? '✓' : '✗'}`);
    console.log(`│  Final run state:   ${(phase2.runState?.state || 'unknown').padStart(10)}`);
    console.log(`│  Disconnect at seq:     ${DISCONNECT_AT.toString().padStart(6)}`);
    console.log(`│  Resume cursor:         ${cursor.toString().padStart(6)}`);
    console.log(`│  Duration:              ${(elapsed + 'ms').padStart(6)}`);
    console.log(`│  Reconstructed text: ${(fullText.length + ' chars').padStart(10)}`);
    console.log('└──────────────────────────────────────────────────────────┘');

    // Assertions
    const pass = missingCount === 0 && duplicateCount === 0 && phase2.runState?.state === 'completed';
    console.log(`\n${pass ? '✅ BENCHMARK PASSED' : '❌ BENCHMARK FAILED'}`);

    if (!pass) {
      process.exitCode = 1;
    }
  } finally {
    server.close();
    closeDb();
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

main().catch(err => {
  console.error('Benchmark crashed:', err);
  process.exitCode = 1;
});
