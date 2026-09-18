# Problem 5: Reliable AI Conversation Runtime

## Context

A conversational product must control what happens around a model call. It needs to reject disallowed input before generation, stream useful output, stop promptly when cancelled, distinguish provider failure from completion, and persist only states the product can honestly represent.

A partial response that ends in timeout must not silently become a successful completed turn. Operational events must be inspectable without exposing private hidden reasoning.

## Your objective

Build a bounded runtime that manages one streamed conversational turn from request through terminal state.

This exercise evaluates orchestration, component boundaries, provider abstraction, safety gates, streaming, cancellation, timeout, persistence semantics, failure handling, and observability. It is not a prompt-quality or autonomous-agent exercise.

## Minimum runtime contract

Your implementation needs equivalent concepts for:

- A stable turn or run identifier
- A user input
- A pre-response policy decision
- Ordered operational events
- Streamed text chunks
- A terminal state such as completed, rejected, cancelled, timed out, or failed
- Persisted conversation records with clearly defined commit rules
- Trace fields sufficient to diagnose execution without hidden chain-of-thought

Use a deterministic fake model provider in tests. A live provider integration is optional.

## Required behaviour

Your runtime must support:

1. Accepting one conversational turn
2. Running a deterministic pre-response safety or policy check before the model provider is invoked
3. Streaming ordered response events from a provider abstraction
4. Persisting a successful completed turn according to a documented boundary
5. Cancelling an active turn and stopping further provider consumption promptly
6. Enforcing a configurable timeout
7. Handling provider errors explicitly
8. Ensuring rejected, cancelled, timed-out, and failed runs are not represented as successful completed turns
9. Producing an ordered operational trace containing states, provider activity, errors, and terminal outcome
10. Preventing secret values and hidden reasoning from appearing in the trace

A CLI, API with a small client, or basic interface is acceptable.

## Acceptance scenarios

### AC1: Successful streamed turn

- **Given** the policy accepts an input and the provider emits valid chunks
- **When** the runtime executes the turn
- **Then** chunks are streamed in order, the run completes once, and the documented conversation records are persisted

### AC2: Pre-response rejection

- **Given** the policy rejects an input
- **When** the runtime executes the turn
- **Then** the provider is never called, the rejection is visible, and no successful assistant response is persisted

### AC3: Cancellation

- **Given** the provider is still streaming
- **When** cancellation is requested
- **Then** provider consumption stops, the run becomes cancelled, and it cannot later transition to completed

### AC4: Timeout

- **Given** the provider does not finish within the configured duration
- **When** the deadline is reached
- **Then** execution stops, the run becomes timed out, and partial output follows the documented non-success persistence policy

### AC5: Provider failure

- **Given** the provider fails after emitting partial output
- **When** the error reaches the runtime
- **Then** the failure and partial-stream history are traceable without recording a successful completed response

### AC6: Terminal-state race

- **Given** completion, timeout, or cancellation can occur close together
- **When** more than one terminal transition is attempted
- **Then** exactly one valid terminal state wins and later transitions are rejected or ignored observably

### AC7: Safe operational trace

- **Given** a run reaches any terminal state
- **When** its trace is inspected
- **Then** ordered operational events explain what occurred without secrets or hidden model reasoning

## Required tests

Include deterministic automated tests for:

- Successful streaming and persistence
- Policy rejection proving that the provider was not invoked
- Cancellation during streaming
- Timeout using controlled time or a controllable fake provider
- Provider failure after partial output
- Competing terminal-state transitions
- Trace redaction or exclusion of a representative secret field

Automated tests must not require a paid model API or rely on arbitrary long sleeps.

## Verification benchmark

Provide one repeatable command that runs at least **10 iterations each** of these deterministic scenarios:

- Successful completion
- Policy rejection
- Cancellation during streaming
- Timeout
- Provider failure after partial output

The result must report terminal-state counts and verify:

- Each run has exactly one terminal state
- Rejected runs never invoke the provider
- Cancelled, timed-out, and failed runs never contain a successful persisted assistant response
- No events appear after a terminal event
- The benchmark is repeatable without a live model

This is a state-machine correctness benchmark, not a model latency or quality comparison.

## Demo checklist

In the demo video, show:

1. A successful streamed turn and its persisted records
2. A policy rejection that bypasses the provider
3. Cancellation or timeout during streaming
4. Provider failure after partial output
5. The ordered operational trace for contrasting outcomes
6. The verification benchmark and its result

## Decisions you must document

- The responsibilities and interfaces of policy, provider, orchestration, persistence, and presentation components
- The exact persistence boundary for user input, partial output, and completed output
- The allowed state transitions and how one terminal outcome wins
- How cancellation reaches the provider
- How timeouts are implemented and tested
- What belongs in the operational trace
- How secrets and private model reasoning are excluded
- How the same core runtime could operate behind a web or mobile client

## Out of scope

- Multiple autonomous agents
- General-purpose tool execution
- Code or browser sandboxes
- Long-term memory or semantic retrieval
- Prompt-quality evaluation
- Authentication and billing
- Cloud deployment or production observability infrastructure
- A polished chat interface

Optional work must remain secondary to bounded execution and correct terminal-state semantics.

### Optional stretch work

If the required behaviour is already reliable, you may validate and recover from malformed provider events. Optional work is not required for a strong score.

## What reviewers will pay attention to

- Clear separation between orchestration and provider-specific code
- A real state machine rather than scattered success flags
- The policy gate occurring before provider invocation
- Cancellation, timeout, and failure paths that cannot later become successful
- Persistence rules that match externally visible state
- Deterministic tests with controllable fakes
- Useful operational events without hidden reasoning or secrets
- Complexity appropriate for a 6–8-hour exercise

## Follow-up discussion

Be prepared to explain how you would change persistence if product requirements allowed a user to keep and continue from partial output after cancellation.
