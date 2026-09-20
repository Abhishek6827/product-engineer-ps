// server/generator.js — Deterministic fake response generator
//
// Produces a sequence of text chunks that form a coherent reply.
// Designed for testability: no LLM calls, configurable chunk count,
// configurable delay, and injectable failure point.
//
// The generator is an async generator so the run manager can consume
// chunks one at a time, persist each, then broadcast — ensuring
// durability before delivery.

/**
 * @typedef {Object} GeneratorOptions
 * @property {number}  [chunkCount=20]   - Total text chunks to emit
 * @property {number}  [delayMs=80]      - Milliseconds between chunks
 * @property {number}  [failAtChunk]     - If set, throws after emitting this many chunks
 * @property {AbortSignal} [signal]      - Cancellation signal
 */

const SAMPLE_WORDS = [
  'The', 'persistent', 'conversational', 'companion', 'remembers',
  'useful', 'context,', 'continues', 'conversations', 'across',
  'devices,', 'follows', 'up', 'at', 'the', 'right', 'time,',
  'and', 'remains', 'dependable', 'when', 'networks,', 'processes,',
  'or', 'model', 'providers', 'fail.', 'Building', 'that',
  'experience', 'involves', 'more', 'than', 'calling', 'a',
  'language', 'model.', 'It', 'requires', 'thoughtful', 'client',
  'state,', 'realtime', 'protocols,', 'durable', 'workflows,',
  'trustworthy', 'memory,', 'and', 'a', 'reliable', 'AI', 'runtime.',
  'Streaming', 'enables', 'the', 'user', 'to', 'read', 'replies',
  'as', 'they', 'are', 'generated,', 'providing', 'immediate',
  'feedback', 'and', 'a', 'responsive', 'experience.', 'Recovery',
  'from', 'interruptions', 'ensures', 'no', 'content', 'is',
  'lost', 'or', 'duplicated.', 'Each', 'event', 'carries', 'a',
  'monotonic', 'sequence', 'number', 'that', 'the', 'client',
  'uses', 'as', 'a', 'cursor', 'for', 'resumption.',
];

/**
 * Yields text chunks with configurable behaviour.
 * @param {GeneratorOptions} [opts]
 * @yields {{ text: string, index: number }}
 */
export async function* generateReply(opts = {}) {
  const {
    chunkCount = 20,
    delayMs = 80,
    failAtChunk,
    signal,
  } = opts;

  for (let i = 0; i < chunkCount; i++) {
    if (signal?.aborted) {
      return;
    }

    // Simulate failure at a specific chunk for testing AC5
    if (failAtChunk !== undefined && i >= failAtChunk) {
      throw new Error(`Generator failure injected at chunk ${i}`);
    }

    // Pick words deterministically based on index
    const wordsPerChunk = 3;
    const startWord = (i * wordsPerChunk) % SAMPLE_WORDS.length;
    const words = [];
    for (let w = 0; w < wordsPerChunk; w++) {
      words.push(SAMPLE_WORDS[(startWord + w) % SAMPLE_WORDS.length]);
    }
    const text = words.join(' ') + ' ';

    yield { text, index: i };

    // Simulate generation latency
    if (delayMs > 0) {
      await sleep(delayMs, signal);
    }
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve(); // Resolve rather than reject — the loop checks signal.aborted
    }, { once: true });
  });
}
