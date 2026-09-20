// client/app.js — SSE client with cursor-based resumption and deduplication
//
// State machine: idle → connected → disconnected → reconnecting → connected → completed|failed
//
// Key design:
// - Tracks `lastSeenSeq` as the client cursor (highest contiguous seq received)
// - On reconnect, sends afterSeq=lastSeenSeq to the SSE endpoint
// - Client-side dedup: drops any event with seq <= lastSeenSeq
// - UI shows connection state, event inspector, and duplicate rejection count

(function () {
  'use strict';

  // ── DOM References ──────────────────────────────────────────────────
  const messageInput    = document.getElementById('messageInput');
  const sendBtn         = document.getElementById('sendBtn');
  const messagesEl      = document.getElementById('messages');
  const welcomeMessage  = document.getElementById('welcomeMessage');
  const connectionBadge = document.getElementById('connectionBadge');
  const connectionLabel = document.getElementById('connectionLabel');
  const disconnectBtn   = document.getElementById('disconnectBtn');
  const reconnectBtn    = document.getElementById('reconnectBtn');
  const failBtn         = document.getElementById('failBtn');
  const resetBtn        = document.getElementById('resetBtn');
  const chunkCountInput = document.getElementById('chunkCountInput');
  const delayInput      = document.getElementById('delayInput');

  // Status indicators
  const statusRunId     = document.getElementById('statusRunId');
  const statusRunState  = document.getElementById('statusRunState');
  const statusCursor    = document.getElementById('statusCursor');
  const statusEvents    = document.getElementById('statusEvents');
  const statusDuplicates = document.getElementById('statusDuplicates');

  // Event log
  const eventLog = document.getElementById('eventLog');

  // ── Application State ───────────────────────────────────────────────
  let currentRunId = null;
  let eventSource  = null;       // Current EventSource (SSE connection)
  let lastSeenSeq  = 0;          // Client cursor — highest seq received
  let totalReceived = 0;         // Count of events actually rendered
  let duplicatesRejected = 0;    // Count of dedup rejections
  let assistantBubble = null;    // Current assistant message bubble DOM node
  let connectionState = 'idle';  // idle|connected|reconnecting|disconnected|completed|failed|interrupted
  let isReplayPhase = true;      // Tracks whether we're in replay or live phase

  // ── Connection State Management ─────────────────────────────────────
  function setConnectionState(state) {
    connectionState = state;
    connectionBadge.setAttribute('data-state', state);

    const labels = {
      idle: 'Idle',
      connected: 'Connected',
      reconnecting: 'Reconnecting…',
      disconnected: 'Disconnected',
      completed: 'Completed',
      failed: 'Failed',
      interrupted: 'Interrupted',
    };
    connectionLabel.textContent = labels[state] || state;

    // Update button states
    const isStreaming = state === 'connected';
    const isDisconnected = state === 'disconnected';
    const isTerminal = ['completed', 'failed', 'interrupted'].includes(state);

    disconnectBtn.disabled = !isStreaming;
    reconnectBtn.disabled  = !isDisconnected;
    failBtn.disabled       = !isStreaming;
    sendBtn.disabled       = isStreaming || state === 'reconnecting';
  }

  function updateStatus() {
    statusRunId.textContent     = currentRunId ? currentRunId.slice(0, 8) + '…' : '—';
    statusRunState.textContent  = connectionState;
    statusCursor.textContent    = lastSeenSeq;
    statusEvents.textContent    = totalReceived;
    statusDuplicates.textContent = duplicatesRejected;
  }

  // ── Event Log ───────────────────────────────────────────────────────
  function logEvent(seq, type, payload, tag) {
    // Remove placeholder
    const placeholder = eventLog.querySelector('.event-log-placeholder');
    if (placeholder) placeholder.remove();

    const entry = document.createElement('div');
    entry.className = 'log-entry';

    const seqEl = document.createElement('span');
    seqEl.className = 'log-seq';
    seqEl.textContent = `#${seq}`;

    const typeEl = document.createElement('span');
    typeEl.className = 'log-type';
    typeEl.textContent = type;

    const payloadEl = document.createElement('span');
    payloadEl.className = 'log-payload';
    payloadEl.textContent = payload;

    entry.appendChild(seqEl);

    if (tag) {
      const tagEl = document.createElement('span');
      tagEl.className = `log-tag log-tag-${tag}`;
      tagEl.textContent = tag;
      entry.appendChild(tagEl);
    }

    entry.appendChild(typeEl);
    entry.appendChild(payloadEl);

    eventLog.appendChild(entry);
    eventLog.scrollTop = eventLog.scrollHeight;
  }

  function logMeta(message) {
    const placeholder = eventLog.querySelector('.event-log-placeholder');
    if (placeholder) placeholder.remove();

    const entry = document.createElement('div');
    entry.className = 'log-entry';

    const tagEl = document.createElement('span');
    tagEl.className = 'log-tag log-tag-meta';
    tagEl.textContent = 'meta';

    const msgEl = document.createElement('span');
    msgEl.className = 'log-payload';
    msgEl.textContent = message;

    entry.appendChild(tagEl);
    entry.appendChild(msgEl);
    eventLog.appendChild(entry);
    eventLog.scrollTop = eventLog.scrollHeight;
  }

  // ── Message Rendering ──────────────────────────────────────────────
  function addUserMessage(content) {
    if (welcomeMessage) welcomeMessage.remove();

    const msgDiv = document.createElement('div');
    msgDiv.className = 'message message-user';

    const label = document.createElement('div');
    label.className = 'message-label';
    label.textContent = 'You';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = content;

    msgDiv.appendChild(label);
    msgDiv.appendChild(bubble);
    messagesEl.appendChild(msgDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function ensureAssistantBubble() {
    if (!assistantBubble) {
      if (welcomeMessage) welcomeMessage.remove();

      const msgDiv = document.createElement('div');
      msgDiv.className = 'message message-assistant';

      const label = document.createElement('div');
      label.className = 'message-label';
      label.textContent = 'Assistant';

      assistantBubble = document.createElement('div');
      assistantBubble.className = 'message-bubble';

      msgDiv.appendChild(label);
      msgDiv.appendChild(assistantBubble);
      messagesEl.appendChild(msgDiv);
    }
    return assistantBubble;
  }

  function appendToAssistant(text) {
    const bubble = ensureAssistantBubble();
    // Remove cursor if present
    const cursor = bubble.querySelector('.typing-cursor');
    if (cursor) cursor.remove();

    bubble.appendChild(document.createTextNode(text));

    // Add typing cursor back
    const newCursor = document.createElement('span');
    newCursor.className = 'typing-cursor';
    bubble.appendChild(newCursor);

    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeTypingCursor() {
    if (assistantBubble) {
      const cursor = assistantBubble.querySelector('.typing-cursor');
      if (cursor) cursor.remove();
    }
  }

  // ── SSE Connection ─────────────────────────────────────────────────
  function connectSSE(runId, afterSeq) {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    isReplayPhase = afterSeq > 0; // If resuming, we start in replay mode
    const url = `/api/runs/${runId}/stream?afterSeq=${afterSeq}`;
    logMeta(`Connecting to SSE: afterSeq=${afterSeq}`);
    setConnectionState(afterSeq > 0 ? 'reconnecting' : 'connected');

    eventSource = new EventSource(url);

    eventSource.addEventListener('text_chunk', (e) => {
      const data = JSON.parse(e.data);
      const seq = data.seq;

      // CLIENT-SIDE DEDUP: reject events we've already seen
      if (seq <= lastSeenSeq) {
        duplicatesRejected++;
        logEvent(seq, 'text', data.payload, 'dedup');
        updateStatus();
        return;
      }

      // Accept and render
      lastSeenSeq = seq;
      totalReceived++;

      // Determine if this is replay or live
      const tag = isReplayPhase ? 'replay' : 'live';

      appendToAssistant(data.payload);
      logEvent(seq, 'text', data.payload, tag);
      updateStatus();
    });

    eventSource.addEventListener('run_state', (e) => {
      const data = JSON.parse(e.data);
      logMeta(`Run state: ${data.state} (total: ${data.totalEvents}${data.error ? ', error: ' + data.error : ''})`);
      removeTypingCursor();
      removeReconnectBanner();
      setConnectionState(data.state);
      updateStatus();

      // Close the EventSource on terminal state
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    });

    eventSource.onopen = () => {
      setConnectionState('connected');
      isReplayPhase = false; // Once open, transition to live
      logMeta('SSE connection opened');
      updateStatus();
    };

    eventSource.onerror = (e) => {
      // EventSource auto-reconnects, but we show the state
      // If the connection is fully closed (readyState=2), it means the server closed it
      if (eventSource && eventSource.readyState === EventSource.CLOSED) {
        // Only set disconnected if not already in a terminal state
        if (!['completed', 'failed', 'interrupted'].includes(connectionState)) {
          setConnectionState('disconnected');
          logMeta('SSE connection closed unexpectedly');
        }
      }
      updateStatus();
    };
  }

  function showReconnectBanner() {
    removeReconnectBanner();
    const banner = document.createElement('div');
    banner.className = 'reconnect-banner';
    banner.id = 'reconnectBanner';
    banner.innerHTML = `
      <div class="banner-content">
        <span class="banner-icon">⚡</span>
        <span class="banner-text">Stream disconnected at cursor <strong>#${lastSeenSeq}</strong>. Reconnect to resume without missing content.</span>
      </div>
      <button class="banner-reconnect-btn" id="bannerReconnectBtn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 4v6h6"></path><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
        Reconnect from #${lastSeenSeq}
      </button>
    `;
    messagesEl.appendChild(banner);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    const btn = banner.querySelector('#bannerReconnectBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        removeReconnectBanner();
        reconnect();
      });
    }
  }

  function removeReconnectBanner() {
    const existing = document.getElementById('reconnectBanner');
    if (existing) existing.remove();
  }

  // ── Disconnect (simulate network drop) ─────────────────────────────
  function disconnect() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    setConnectionState('disconnected');
    logMeta(`Disconnected at cursor seq=${lastSeenSeq}`);
    showReconnectBanner();
    updateStatus();
  }

  // ── Reconnect from cursor ──────────────────────────────────────────
  function reconnect() {
    if (!currentRunId) return;
    removeReconnectBanner();
    logMeta(`Reconnecting from cursor seq=${lastSeenSeq}…`);
    connectSSE(currentRunId, lastSeenSeq);
  }

  // ── Send Message ───────────────────────────────────────────────────
  async function sendMessage() {
    const content = messageInput.value.trim();
    if (!content) return;

    const chunkCount = parseInt(chunkCountInput.value, 10) || 30;
    const delayMs = parseInt(delayInput.value, 10) || 120;

    messageInput.value = '';
    removeReconnectBanner();
    addUserMessage(content);

    // Reset state for new run
    lastSeenSeq = 0;
    totalReceived = 0;
    duplicatesRejected = 0;
    assistantBubble = null;
    eventLog.innerHTML = '<div class="event-log-placeholder">Events will appear here during streaming…</div>';

    sendBtn.disabled = true;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          generatorOpts: { chunkCount, delayMs },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to start chat');
      }

      const { runId } = await res.json();
      currentRunId = runId;
      updateStatus();

      // Start SSE stream
      connectSSE(runId, 0);
    } catch (err) {
      logMeta(`Error: ${err.message}`);
      setConnectionState('failed');
      sendBtn.disabled = false;
    }
  }

  // ── Inject Failure ─────────────────────────────────────────────────
  async function triggerFailure() {
    if (!currentRunId) return;
    try {
      await fetch(`/api/runs/${currentRunId}/fail`, { method: 'POST' });
      logMeta('Failure injection requested');
    } catch (err) {
      logMeta(`Failed to inject failure: ${err.message}`);
    }
  }

  // ── Reset Chat ─────────────────────────────────────────────────────
  function resetChat() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    currentRunId = null;
    lastSeenSeq = 0;
    totalReceived = 0;
    duplicatesRejected = 0;
    assistantBubble = null;
    removeReconnectBanner();

    messagesEl.innerHTML = `
      <div class="welcome-message" id="welcomeMessage">
        <div class="welcome-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
            <line x1="9" y1="9" x2="9.01" y2="9"></line>
            <line x1="15" y1="9" x2="15.01" y2="9"></line>
          </svg>
        </div>
        <h2>Send a message to start streaming</h2>
        <p>Watch the reply stream in real-time, then test interruption and recovery using the controls panel.</p>
      </div>
    `;
    eventLog.innerHTML = '<div class="event-log-placeholder">Events will appear here during streaming…</div>';

    setConnectionState('idle');
    updateStatus();
  }

  // ── Event Listeners ────────────────────────────────────────────────
  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !sendBtn.disabled) sendMessage();
  });
  disconnectBtn.addEventListener('click', disconnect);
  reconnectBtn.addEventListener('click', reconnect);
  failBtn.addEventListener('click', triggerFailure);
  resetBtn.addEventListener('click', resetChat);

  // Initialize
  setConnectionState('idle');
  updateStatus();
})();
