// server/generator.js — Deterministic fake response generator
//
// Produces a sequence of text chunks that form a complete, coherent reply.
// Designed for testability: no external API calls, configurable chunk count,
// configurable delay, and injectable failure point.
//
// Topic-aware: delivers topical answers (quantum computing, AI, space, or
// companion streaming) partitioned smoothly across chunkCount so the response
// always starts at the beginning and ends with a complete sentence.

/**
 * @typedef {Object} GeneratorOptions
 * @property {number}  [chunkCount=20]   - Total text chunks to emit
 * @property {number}  [delayMs=80]      - Milliseconds between chunks
 * @property {number}  [failAtChunk]     - If set, throws after emitting this many chunks
 * @property {AbortSignal} [signal]      - Cancellation signal
 * @property {string}  [prompt]          - User message content for topic matching
 */

const TOPIC_TEXTS = {
  quantum:
    'Quantum computing represents a revolutionary paradigm in modern information science. ' +
    'Rather than relying on conventional binary bits that remain strictly zero or one, quantum processors harness quantum bits or qubits. ' +
    'These qubits leverage the quantum principles of superposition and entanglement to evaluate vast solution spaces simultaneously. ' +
    'This exponential computational capability enables breakthroughs in complex cryptographic algorithms, advanced material synthesis, ' +
    'molecular drug discovery, and combinatorial optimization that remain fundamentally intractable for traditional supercomputers.',

  ai:
    'Artificial intelligence represents a transformative frontier in computer science and automated reasoning. ' +
    'Modern artificial intelligence systems utilize deep neural networks trained on extensive datasets to recognize intricate patterns, ' +
    'synthesize natural language, and assist human experts across diverse disciplines. ' +
    'By combining statistical learning models with resilient, durable distributed architectures, conversational AI companions ' +
    'deliver responsive, context-aware assistance while remaining dependable across intermittent network conditions and system restarts.',

  space:
    'Space exploration embodies humanity\'s enduring ambition to discover the fundamental secrets of our cosmos and venture beyond our planetary cradle. ' +
    'From early orbital satellites and the historic Apollo lunar missions to sophisticated robotic rovers currently traversing the surface of Mars, ' +
    'each endeavor expands our scientific horizons. ' +
    'Modern space science utilizes deep space observatories, autonomous spacecraft, and reusable orbital rockets to investigate cosmic evolution, ' +
    'planetary geology, and the possibilities of extraterrestrial life.',

  default:
    'The persistent conversational companion remembers useful context, continues conversations across devices, ' +
    'follows up at the right time, and remains dependable when networks, processes, or model providers fail. ' +
    'Building that experience involves more than calling a language model. ' +
    'It requires thoughtful client state, realtime protocols, durable workflows, trustworthy memory, and a reliable AI runtime. ' +
    'By persisting every streamed chunk into durable write-ahead storage before live broadcast, ' +
    'the architecture guarantees complete resilience against network drops and process interruptions. ' +
    'Reconnecting clients seamlessly resume from their exact checkpoint with zero lost or duplicated content, ' +
    'ensuring a trustworthy and responsive user experience.',
};

/**
 * Select appropriate text based on prompt keywords.
 * @param {string} prompt
 * @returns {string[]} Array of words
 */
function getWordsForPrompt(prompt = '') {
  const p = prompt.toLowerCase();
  let text = TOPIC_TEXTS.default;

  if (p.includes('quantum') || p.includes('qubit') || p.includes('computing')) {
    text = TOPIC_TEXTS.quantum;
  } else if (p.includes('ai') || p.includes('artificial') || p.includes('intelligence') || p.includes('neural')) {
    text = TOPIC_TEXTS.ai;
  } else if (p.includes('space') || p.includes('exploration') || p.includes('planet') || p.includes('universe') || p.includes('star')) {
    text = TOPIC_TEXTS.space;
  }

  return text.split(/\s+/).filter(Boolean);
}

/**
 * Yields text chunks with configurable behaviour.
 * Partition the words so that exactly `chunkCount` chunks are produced,
 * and the final chunk always concludes the thought with clean punctuation.
 *
 * @param {GeneratorOptions} [opts]
 * @yields {{ text: string, index: number }}
 */
export async function* generateReply(opts = {}) {
  const {
    chunkCount = 20,
    delayMs = 80,
    failAtChunk,
    signal,
    prompt = '',
  } = opts;

  const words = getWordsForPrompt(prompt);

  for (let i = 0; i < chunkCount; i++) {
    if (signal?.aborted) {
      return;
    }

    // Simulate failure at a specific chunk for testing AC5
    if (failAtChunk !== undefined && i >= failAtChunk) {
      throw new Error(`Generator failure injected at chunk ${i}`);
    }

    // Partition words evenly across chunkCount
    let chunkWords;
    if (chunkCount <= words.length) {
      const start = Math.floor((i * words.length) / chunkCount);
      const end = Math.floor(((i + 1) * words.length) / chunkCount);
      chunkWords = words.slice(start, Math.max(end, start + 1));
    } else {
      // If chunks exceed words, cycle gracefully
      const idx = i % words.length;
      chunkWords = [words[idx]];
    }

    let text = chunkWords.join(' ');

    if (i < chunkCount - 1) {
      text += ' ';
    } else {
      // The final chunk always finishes with a clean full stop
      text = text.trimEnd().replace(/[.,;:]+$/, '') + '.';
    }

    yield { text, index: i };

    // Simulate generation latency
    if (delayMs > 0) {
      await sleep(delayMs, signal);
    }
  }
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve(); // Resolve rather than reject — loop checks signal.aborted
    }, { once: true });
  });
}
