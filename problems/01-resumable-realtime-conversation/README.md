# Problem 1: Resumable Realtime Conversation

## Context

A conversational companion streams replies so the user can read them as they are generated. Connections can drop, browsers can sleep, mobile networks can change, and the service can restart while a reply is still in progress.

A reconnect must not restart the reply, repeat already displayed text, silently skip content, or leave the client pretending it is current.

## Your objective

Build a small chat client and service that stream a generated reply and recover correctly after an interruption.

This exercise evaluates realtime protocol design, durable event history, ordering, reconnection, deduplication, and frontend state. It is not a visual-design or model-quality exercise.

## Minimum conversation contract

Your implementation needs equivalent concepts for:

- A stable conversation identifier
- A stable user-message identifier
- A stable run identifier for the generated reply
- An ordered position for every streamed event
- A client cursor or checkpoint used to resume
- Explicit run states such as running, completed, and failed

Events may contain text chunks or a different documented representation. Field names and wire format are your choice.

## Required behaviour

Your prototype must support:

1. Submitting a user message and starting one generated reply
2. Streaming ordered reply events through SSE, WebSockets, or another justified transport
3. Persisting enough run state and history to resume after a connection interruption
4. Reconnecting from a client-provided cursor or equivalent checkpoint
5. Recovering missed events without gaps or duplicate display
6. Keeping replayed history and newly generated live events in a deterministic order
7. Preserving completed or resumable state across a service restart
8. Exposing connected, reconnecting, disconnected, completed, and failed states where applicable

Use a deterministic fake response generator in tests and in at least one documented demo path. A real model integration is optional.

## Acceptance scenarios

### AC1: Ordered live stream

- **Given** a client starts a reply
- **When** the service generates multiple events
- **Then** the client displays each event once in the server-defined order and reaches completed state

### AC2: Missed-event recovery

- **Given** a client has received events through a known cursor
- **When** its connection drops while the run continues and it later reconnects
- **Then** it receives every event after that cursor without losing or repeating content

### AC3: Replay/live overlap

- **Given** a reconnect occurs while the run is still producing events
- **When** persisted replay and live delivery overlap
- **Then** the client constructs one correctly ordered response without duplicate logical events

### AC4: Service restart

- **Given** a run has persisted events
- **When** the service process restarts
- **Then** a client can reconnect and recover the durable state rather than silently starting an unrelated run

Document whether an in-progress generator itself resumes or transitions to a clear failed/interrupted state. Either policy is acceptable if the persisted history remains correct.

### AC5: Generation failure

- **Given** the response generator fails after emitting some events
- **When** the failure reaches the service
- **Then** the run becomes failed, its durable event history remains inspectable, and it does not later become completed

### AC6: Unknown or stale cursor

- **Given** a client requests an invalid, expired, or unavailable cursor
- **When** the service cannot safely replay from it
- **Then** the client receives an explicit recoverable response rather than silently missing data

## Required tests

Include deterministic automated tests for:

- Ordered live event delivery
- Replay after a cursor
- Deduplication when replay and live delivery overlap
- Generator failure after partial output
- State recovery or explicit interruption after a service restart

Tests must not call a paid model API and should not depend on arbitrary long sleeps.

## Verification benchmark

Provide one repeatable command or documented sequence that:

1. Generates at least **30 ordered text events** for one run
2. Interrupts and reconnects the client at least **once** while generation is active
3. Reconstructs the expected final response with **zero missing and zero duplicate events**
4. Reports the observed event count and final run state

This is a correctness benchmark, not a throughput competition. A deterministic automated test is ideal.

## Demo checklist

In the demo video, show:

1. A streamed reply and visible connection-state changes
2. Events generated during one interruption
3. Reconnection from a cursor without duplicate content
4. One generation-failure or service-restart recovery path
5. The verification benchmark, architecture, and one important trade-off

## Decisions you must document

- Why you selected the transport
- What an event and cursor represent
- Which component owns ordering
- How replay transitions safely into live delivery
- Where deduplication occurs
- What survives a service restart
- How reconnect attempts are delayed or bounded
- What state would be retained or expired in production

## Out of scope

- Authentication, authorization, and multi-tenancy
- A real model provider
- Multiple simultaneous assistant runs in one conversation
- User-initiated cancellation
- Message editing, reactions, attachments, or presence
- Multiple production servers or multi-region ordering
- Rich visual design
- Internet-scale load testing

Optional work must remain secondary to the required recovery behaviour.

### Optional stretch work

If the required behaviour is already reliable, you may add user-initiated cancellation. Optional work is not required for a strong score.

## What reviewers will pay attention to

- Separation between durable run history and transient connection delivery
- Explicit event identity, ordering, and terminal-state rules
- Races between replay and live events
- Failed runs that cannot later become successful completion
- Honest restart semantics
- Observable connection failures rather than silent stale state
- Tests focused on protocol behaviour instead of framework details
- Complexity appropriate for a 6–8-hour exercise

## Follow-up discussion

Be prepared to explain what would change if the server retained only the most recent 50 events and a client reconnected with an older cursor.
