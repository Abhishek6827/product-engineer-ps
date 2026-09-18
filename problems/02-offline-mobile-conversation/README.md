# Problem 2: Offline-Capable Mobile Conversation

## Context

A conversational companion should not lose a message when a user enters a lift, changes networks, backgrounds the app, or force-closes it before synchronization completes.

Mobile connectivity is uncertain: a request can reach the server even when its acknowledgement never reaches the client. Retrying must preserve the user's message without creating multiple logical copies.

## Your objective

Build a minimal mobile conversation experience that accepts outgoing messages offline and synchronizes them safely when connectivity returns.

This exercise evaluates mobile state ownership, local durability, synchronization, idempotency, ordering, and recovery. It is not a visual-design exercise.

Use React Native, Flutter, or a native mobile platform. A mocked or minimal backend is acceptable.

## Minimum message contract

Each outgoing message should have equivalent concepts for:

- A stable client-generated identifier
- A conversation identifier
- Message content
- A local creation time or ordering value
- A visible delivery state such as pending, sending, failed, or delivered

You may add server identifiers or attempt metadata when they help your design.

## Required behaviour

Your prototype must support:

1. Writing and sending a message while offline
2. Showing the message immediately with an honest pending state
3. Persisting the outbox and its delivery state across app termination
4. Synchronizing pending messages when connectivity returns
5. Preserving a documented ordering policy for multiple pending messages
6. Showing pending, sending, failed, and delivered states
7. Applying a bounded automatic retry policy for temporary failures
8. Allowing a failed message to be retried manually
9. Preventing an uncertain acknowledgement or repeated request from creating duplicate server-side messages
10. Keeping synchronization logic testable without requiring a physical network change

Document how a reviewer can simulate online, offline, slow, failed, and acknowledgement-lost behaviour.

## Acceptance scenarios

### AC1: Offline send

- **Given** the device has no connectivity
- **When** the user sends a valid message
- **Then** it remains visible, is stored locally, and is marked pending rather than lost or falsely delivered

### AC2: Force-close durability

- **Given** one or more messages are pending
- **When** the app is terminated and opened again before synchronization
- **Then** the same logical messages and delivery states are restored from durable local storage

### AC3: Reconnection synchronization

- **Given** pending messages exist
- **When** connectivity returns
- **Then** synchronization sends them according to the documented ordering policy and marks acknowledged messages delivered

### AC4: Temporary failure and retry

- **Given** the backend returns a documented temporary failure
- **When** synchronization runs
- **Then** the message is retained, failure is visible, automatic retry is bounded, and manual retry remains possible

### AC5: Uncertain acknowledgement

- **Given** the backend accepts a message but its acknowledgement is lost
- **When** the client retries the same message identifier
- **Then** the backend contains one logical message and the client eventually reconciles it as delivered

## Required tests

Include focused automated tests for:

- Local outbox restoration after an app lifecycle restart
- Multiple pending messages synchronized in the documented order
- A temporary failure followed by successful retry
- Uncertain acknowledgement followed by idempotent retry
- Retry limits or transition into a manually recoverable failed state

Tests may target domain and persistence layers without automating the entire operating-system lifecycle.

## Verification benchmark

Provide one repeatable command or documented sequence that:

1. Queues at least **10 messages** while offline
2. Restarts or reloads the application before synchronization
3. Simulates at least one temporary failure and one lost acknowledgement
4. Restores connectivity and completes synchronization
5. Shows that every logical message exists exactly once on the backend in the documented order

This benchmark evaluates correctness and recovery, not raw synchronization speed.

## Demo checklist

In the demo video, show:

1. How connectivity and backend failures are simulated
2. A message retained through offline creation and app restart
3. A temporary failure followed by successful synchronization
4. A repeated request that does not create a duplicate
5. The verification benchmark, architecture, and one important trade-off

## Decisions you must document

- Which layer owns the durable outbox
- The allowed delivery-state transitions
- Your ordering policy and its product trade-offs
- How connectivity changes trigger synchronization
- Which failures are retried automatically
- Where idempotency is enforced
- How concurrent send and synchronization operations avoid corrupting state
- What would change for background synchronization in production

## Out of scope

- Authentication and user profiles
- Incoming assistant-response streaming
- Push notifications
- App-store packaging or deployment
- Background execution while the app is terminated
- Attachments, audio, image uploads, or rich message types
- Elaborate UI, animation, or a design system
- A production backend

Optional work must remain secondary to the durable outbox and synchronization behaviour.

### Optional stretch work

If the required behaviour is already reliable, you may handle messages added while synchronization is in progress. Optional work is not required for a strong score.

## What reviewers will pay attention to

- Separation between screen state, durable outbox state, and synchronization logic
- Stable identifiers and idempotent backend behaviour
- Explicit, valid delivery-state transitions
- Handling of partial and uncertain failures
- Concurrency control around synchronization
- Tests around recovery rather than only online sending
- A mobile experience that a reviewer can run without excessive setup
- Complexity appropriate for a 6–8-hour exercise

## Follow-up discussion

Be prepared to explain how you would change the ordering policy if one permanently failing message must not block later messages forever.
