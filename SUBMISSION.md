# Product Engineering Challenge Submission

## Candidate

- **Name:** Abhishek Tiwari
- **Email:** abhishektiwari6827@gmail.com
- **GitHub:** https://github.com/Abhishek6827/product-engineer-ps
- **Selected problem:** Problem 1: Resumable Realtime Conversation
- **Demo video:** [Link to Demo Video / Loom]

## Run the project

### Prerequisites
- Node.js >= 22.0.0 (Node 24 recommended for native `node:sqlite` support)
- npm >= 10.0.0

### Setup & Run
```bash
# Install dependencies
npm install

# Start the server (runs at http://localhost:3000)
npm run dev
```

Open your browser at `http://localhost:3000`.

### Scenarios to Trigger

1. **Successful Streaming Scenario**:
   - Type a prompt in the message box (e.g., *"Explain how airplanes fly"*) and click **Send** (or press Enter).
   - Watch the reply stream in real-time in both the chat bubble and the Event Inspector log on the right.
   - The connection badge will show **Connected**, and upon stream completion it transitions to **Completed**.

2. **Interruption & Resumption Scenario**:
   - Start a stream (or increase Chunk Count to 40 and Delay to 200ms in the settings under the input box).
   - Click the **Disconnect** button in the *Resilience Controls* panel mid-stream (e.g., around chunk 10).
   - Notice the connection badge updates to **Disconnected**, and the cursor freezes at the last sequence number received.
   - Click **Reconnect**. The client requests reconnection from `afterSeq=<cursor>`. The server streams missed chunks from durable storage and resumes live streaming seamlessly.
   - Notice that **Duplicates Rejected** stays `0` (or increments if overlapping live events arrived) and the entire response finishes with zero missing text.

3. **Simulated Failure Scenario**:
   - While a stream is running, click **Inject Failure** in the *Resilience Controls* panel.
   - The server aborts the run, marks the terminal state as `failed` with error metadata, and stops the stream.
   - All events persisted prior to the failure are preserved in SQLite and visible in the chat and history.

4. **Service Restart Recovery Scenario**:
   - Start a long run (e.g. 50 chunks, 300ms delay).
   - Kill the server process in the terminal (`Ctrl+C`).
   - Restart the server (`npm run dev`).
   - The server runs startup recovery: any run left in `running` or `queued` state is automatically recovered and marked as `interrupted` with `error: 'Process restarted while run was active'`, while all events generated prior to the restart are preserved intact.

## Run the tests

Run the deterministic automated test suite covering all 6 acceptance criteria (AC1–AC6):

```bash
npm test
```

## Acceptance scenarios and verification

All acceptance scenarios have been implemented and verified:
- **AC1 (Ordered live stream)**: Sequential chunks delivered with ascending `seq` identifiers ending in `completed` state.
- **AC2 (Cursor-based resumption)**: Client reconnects with `afterSeq=N` and receives all missed events without gaps.
- **AC3 (Overlap deduplication)**: When replay and live events overlap during reconnection, duplicate sequences are dropped both server-side and client-side.
- **AC4 (Restart recovery — completed)**: Completed runs remain readable and replayable from SQLite across process restarts.
- **AC4b (Restart recovery — in-progress)**: In-progress runs survive a sudden process restart and transition to `interrupted` with durable history intact.
- **AC5 (Failure resiliency)**: Generator errors or injected failures transition the run to `failed` while preserving all previous events.
- **AC6 (Out-of-range cursor validation)**: Reconnecting with a cursor beyond the maximum known sequence returns an explicit `400 Bad Request`.

### Problem-Specific Verification Benchmark

Execute the benchmark using:

```bash
npm run benchmark
```

### Observed Result

```text
╔══════════════════════════════════════════════════════════════╗
║       Resumable Realtime Conversation — Benchmark          ║
╚══════════════════════════════════════════════════════════════╝

→ Starting run with 40 chunks, 50ms delay
  Run ID: f7119330-c272-472e-b96f-e7b5c20675e9

→ Phase 1: Streaming until seq=15, then disconnecting
  Received 15 events, cursor at seq=15

→ Waiting 300ms while generation continues on server…

→ Phase 2: Reconnecting from cursor seq=15
  Received 25 events
  Final run state: completed

┌──────────────────────────────────────────────────────────┐
│                 BENCHMARK RESULTS                        │
├──────────────────────────────────────────────────────────┤
│  Expected events:           40
│  Phase 1 events:            15
│  Phase 2 events:            25
│  Total received:            40
│  Unique events:             40
│  Missing events:             0  ✓
│  Duplicate events:           0  ✓
│  Final run state:    completed
│  Disconnect at seq:         15
│  Resume cursor:             15
│  Duration:              2529ms
│  Reconstructed text:  878 chars
└──────────────────────────────────────────────────────────┘

✅ BENCHMARK PASSED
```

## Architecture and data flow

```text
  [Browser Client]
         │
         │  POST /api/chat { content, generatorOpts }
         ▼
  [Run Manager]  ──▶  Inserts Conversation & Run into [SQLite (WAL)]
         │
         │  Spawns async generator
         ▼
  [Mock Generator] ──(yield chunk)──▶ [Run Manager]
                                             │
                       1. Persist FIRST      ▼
                       [SQLite: events (run_id, seq, payload)]
                                             │
                       2. Broadcast SECOND   ▼
                       [EventEmitter (runId)]
                                             │
         ┌───────────────────────────────────┴───────────────────────┐
         │                                                           │
         ▼                                                           ▼
  [Client 1: Live SSE]                                      [Client 2: Replay SSE]
  GET /api/runs/:id/stream                                  GET /api/runs/:id/stream?afterSeq=10
         │                                                           │
         │ (receives events 1..N)                                    ├─ 1. Subscribes to live emitter
         │                                                           ├─ 2. Reads missed events (seq > 10) from DB
         │                                                           ├─ 3. Flushes backlog to client
         │                                                           └─ 4. Seamlessly forwards live events (deduped)
```

### Components
1. **Durable Storage Layer (`server/db.js`)**:
   - Uses Node 24 native SQLite (`node:sqlite`). Configured in WAL mode (`journal_mode = WAL`, `synchronous = NORMAL`).
   - Tables: `conversations`, `messages`, `runs`, and `events` (with `UNIQUE(run_id, seq)` index).
2. **Run Lifecycle Manager (`server/run-manager.js`)**:
   - Coordinates the run state machine (`queued` → `running` → `completed` | `interrupted` | `failed`).
   - Maintains an in-memory `EventEmitter` per active run for live SSE subscribers.
   - Enforces the core invariant: **events are persisted to SQLite before broadcast**.
3. **HTTP / SSE Layer (`server/app.js`)**:
   - Serves REST endpoints (`POST /api/chat`, `GET /api/runs/:runId`, `POST /api/runs/:runId/fail`).
   - SSE streaming endpoint (`GET /api/runs/:runId/stream`) with cursor support via `?afterSeq=N`.
   - Replay-to-live handover: registers the subscriber to the live event emitter first, queries SQLite for historical events where `seq > afterSeq`, flushes the backlog, and transitions to live events while discarding any duplicate sequences.
4. **Client Application (`client/app.js`, `index.html`, `style.css`)**:
   - Modern dark-mode UI with no external frontend dependencies.
   - State machine tracking `idle`, `connected`, `reconnecting`, `disconnected`, `completed`, `failed`, `interrupted`.
   - Tracks `lastSeenSeq` as the client cursor and passes it on reconnect.
   - Performs client-side deduplication to ignore any event with `seq <= lastSeenSeq`.

## Technology choices

- **Runtime & Language**: Node.js 24 (ES Modules).
  - *Why*: Node 24 includes production-grade native SQLite (`node:sqlite`) and built-in test runner (`node:test`), eliminating native build toolchains (`node-gyp`), external binary bindings, and heavyweight test frameworks.
- **Server Framework**: Express 5.
  - *Why*: Minimal, fast, and gives complete low-level control over HTTP response streams for Server-Sent Events without framework overhead.
- **Protocol**: Server-Sent Events (SSE) over HTTP.
  - *Why*: SSE is unidirectional (server-to-client), text-based, operates over standard HTTP/1.1 or HTTP/2, easily traverses proxies and firewalls, and fits the conversational streaming model much better than bidirectional WebSockets which require custom heartbeat and reconnection framing.
- **Frontend**: Vanilla HTML5, CSS3, and JavaScript.
  - *Why*: Zero build steps, instant load time, maximum transparency for reviewers, and total control over DOM and EventSource lifecycles.

## Important decisions

1. **Transport Selection (SSE over HTTP)**:
   - Evaluated Server-Sent Events vs WebSockets vs Long-Polling. Selected SSE because AI assistant responses are strictly unidirectional (server-to-client stream). SSE runs over standard HTTP/1.1 or HTTP/2, easily passes enterprise proxies/firewalls, supports native reconnection headers (`Last-Event-ID`), and avoids WebSocket framing, heartbeat, and protocol negotiation overhead.

2. **Event and Cursor Definition**:
   - **Event**: A discrete, numbered unit of generation `{ run_id, seq, type: 'text_chunk', payload: string }`.
   - **Cursor (`afterSeq` / `lastSeenSeq`)**: The highest contiguous integer sequence number successfully received and processed by the client. It represents the point *past which* the client needs events upon reconnection.

3. **Component Owning Ordering**:
   - The **server database layer** strictly owns ordering. Sequence numbers (`seq = 1, 2, 3...`) are monotonically incremented and assigned by the server runtime before insertion into SQLite. SQLite enforces `UNIQUE(run_id, seq)` so that no two events can ever share an ordering position.

4. **Replay-to-Live Handover (Subscribe-Before-Read)**:
   - When a client reconnects with `afterSeq=N`, a naive read-then-subscribe creates a race window where events emitted between reading the DB and subscribing to the emitter are dropped.
   - We solve this via **Subscribe-Before-Read**:
     1. Attach listener to live `EventEmitter` first; buffer newly arriving live events in a temporary queue.
     2. Query SQLite for all persisted events where `seq > afterSeq`.
     3. Stream the replay backlog to the HTTP response.
     4. Flush the buffered live events, discarding any whose `seq <= highest replayed seq`.
     5. Forward subsequent live events directly.

5. **Deduplication Strategy (Dual-Layer)**:
   - **Server-Side**: The replay-to-live handler maintains `lastDispatchedSeq`. If an overlapping live event arrives with `seq <= lastDispatchedSeq`, the server immediately drops it.
   - **Client-Side**: The client tracks `lastSeenSeq`. Any incoming chunk with `seq <= lastSeenSeq` is filtered out and tracked as a rejected duplicate without rendering twice.

6. **State Surviving Service Restarts**:
   - Durable data on disk in SQLite (WAL) survives: all `conversations`, `messages`, `runs`, and emitted `events`.
   - Transient in-memory emitters and controllers are lost on crash.
   - On reboot, `recoverStaleRuns()` marks all runs left in `running` or `queued` as `interrupted` with `error: 'Process restarted while run was active'`. Completed runs remain `completed`.

7. **Reconnection Delay and Bounding**:
   - In browser `EventSource`, the server sends `retry: 1500\n\n` to instruct a 1.5-second backoff.
   - The custom client state machine caps exponential backoff (e.g. 1s, 2s, 4s up to 10s max) and exposes explicit manual **Disconnect** / **Reconnect** controls so users have full agency during interruptions.

8. **State Retention, Expiration, and Follow-Up Discussion**:
   - In-memory event emitters are cleared 2 seconds after run completion or cancellation.
   - *Follow-Up Question (50 events retention)*: If the server only retains the last 50 events and a client reconnects with an older cursor (e.g., `afterSeq=10` on a 100-event run where `minSeq=51`):
     - The server detects `afterSeq < minAvailableSeq` and returns HTTP `410 Gone` or `400 Bad Request` with `{ error: 'cursor_expired', minAvailableSeq: 51 }`.
     - The client cannot safely replay without gaps; it notifies the user, falls back to fetching the compiled snapshot text from `GET /api/runs/:runId`, resets its cursor to the snapshot end, and resumes streaming from that point forward.

## Assumptions and limitations

- **Single Node Prototype**: In-memory event emitters are local to the process. For multi-node horizontal scaling, a pub/sub backbone (e.g. Redis Pub/Sub or Postgres LISTEN/NOTIFY) would broadcast events across instances.
- **Local SQLite Storage**: Suitable for single-server deployment. For distributed systems, PostgreSQL with write replication would be used.
- **Linear Message Sequences**: Each run produces a strictly ordered sequence of chunks indexed `1..N`.

## Production and scale

If this system were taken to production at scale:
1. **Distributed Event Broker**: Replace in-memory `EventEmitter` with Redis Streams or Apache Kafka. Redis Streams provides both durable cursor replay (`XREAD`) and consumer-group distribution.
2. **Distributed Persistence**: Migrate from SQLite to PostgreSQL with read replicas, partitioned by `conversation_id` or `run_id`.
3. **Connection Multiplexing / Gateway**: Put an edge layer (e.g. Envoy or Cloudflare Workers) in front of the streaming endpoints to handle connection termination, keep-alives, and automatic client reconnects.
4. **Heartbeats / Ping frames**: Add periodic SSE comment pings (`: ping\n\n`) every 15s to keep idle connections through stateful firewalls.

## AI usage

An agentic AI coding assistant was used to scaffold boilerplate, assist in designing the SSE replay handover logic, implement the dark-mode CSS design system, and create deterministic test fixtures. All generated code, database constraints, state transitions, and test assertions were reviewed line-by-line and validated against the assessment criteria.


## Credibility note

Describe one product or system you previously helped ship:

- The problem it solved
- Your personal contribution
- The scale or operational complexity involved
- One difficult engineering or product decision
- A public link or other evidence, when available

Confidential details may be anonymized and figures may be approximate.
