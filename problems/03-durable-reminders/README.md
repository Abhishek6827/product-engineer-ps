# Problem 3: Durable Reminders and Follow-Ups

## Context

A conversational companion may promise, “I’ll remind you tomorrow morning” or “Let’s continue this conversation on Friday.” That promise must survive a process restart, respect the user’s time zone, and remain correct when delivery fails or the user edits or cancels it.

A scheduler firing twice is normal in many systems. The product must still avoid two logical notifications for the same scheduled occurrence.

## Your objective

Build a small service for reminders and scheduled conversational follow-ups that remains correct across restarts and retries.

This exercise evaluates durable workflow state, scheduling, time handling, idempotency, retry policy, cancellation, and operational history. A distributed workflow platform is not expected.

## Minimum scheduled-work contract

Each item should have equivalent concepts for:

- A stable identifier
- Reminder or follow-up content
- A scheduled instant and an IANA time-zone identifier such as `Asia/Kolkata` or `America/New_York`
- A state such as scheduled, running, delivered, cancelled, or failed
- A version or equivalent mechanism for safe edits
- Ordered execution-attempt history
- A stable delivery key for idempotency

Use an injectable clock and a fake or local notification destination so reviewers can run time-dependent behaviour quickly and deterministically.

## Required behaviour

Your service must support:

1. Creating and inspecting scheduled work
2. Editing the time or content before delivery
3. Cancelling scheduled work before delivery
4. Interpreting and retaining an IANA time zone, with a documented policy for ambiguous or nonexistent local times
5. Discovering and executing due work after a service restart
6. Recording every delivery attempt and its outcome
7. Retrying documented temporary failures with a bounded policy
8. Reaching a visible terminal state when retries are exhausted
9. Preventing duplicate logical delivery when the same occurrence is executed more than once
10. Defining deterministic behaviour for an edit or cancellation racing with execution

A REST API, CLI, small interface, or combination is acceptable.

## Acceptance scenarios

### AC1: Scheduled delivery

- **Given** an active reminder in a named time zone
- **When** the injected clock reaches its scheduled instant
- **Then** one notification is delivered and the item reaches delivered state with recorded history

### AC2: Restart recovery

- **Given** an active reminder becomes due while the service is stopped
- **When** the service restarts
- **Then** it discovers and processes the overdue work according to a documented policy

### AC3: Temporary failure

- **Given** the notification destination temporarily fails
- **When** delivery is attempted
- **Then** the failure is recorded, retry is bounded, and eventual success or terminal failure is visible

### AC4: Duplicate execution

- **Given** the same scheduled occurrence is claimed or executed more than once
- **When** the delivery path runs repeatedly
- **Then** the destination observes one logical notification for that occurrence

### AC5: Edit before execution

- **Given** a scheduled item has not completed
- **When** the user changes its time or content
- **Then** the effective version is clear and the superseded schedule does not later produce an unexpected notification

### AC6: Cancellation

- **Given** an active item is cancelled before delivery commits
- **When** workers continue polling or retrying
- **Then** the documented cancellation policy is enforced and no later successful delivery is incorrectly recorded

### AC7: Time-zone boundary

- **Given** reminders use different IANA time zones, including one daylight-saving boundary
- **When** their local requested times are converted
- **Then** their execution instants are deterministic and documented

## Required tests

Include deterministic automated tests for:

- Due-work discovery using an injected clock
- Restart recovery for overdue work
- Temporary failure followed by retry
- Retry exhaustion
- Duplicate execution or duplicate acknowledgement
- Editing and cancelling before execution
- At least two IANA time zones and one daylight-saving boundary case

Tests should not wait for real minutes to pass or call a paid notification provider.

## Verification benchmark

Provide one repeatable command or documented sequence that:

1. Creates at least **20 scheduled items** across at least **two IANA time zones**
2. Includes delivered, edited, cancelled, temporarily failing, and permanently failing items
3. Stops and restarts the service before processing all due work
4. Simulates duplicate execution for at least one occurrence
5. Advances an injected clock until processing settles
6. Reports counts by terminal state and demonstrates that every active successful occurrence produced exactly one logical notification

This is a deterministic workflow-correctness benchmark, not a throughput target.

## Demo checklist

In the demo video, show:

1. Creating a scheduled item and advancing controlled time to deliver it
2. Restart recovery for overdue work
3. One temporary-failure or edit/cancellation recovery path
4. Duplicate execution without duplicate logical notification
5. The verification benchmark, architecture, and one important trade-off

## Decisions you must document

- How local time and time zones become an execution instant
- How due work is discovered and claimed
- Which failures are retryable and why
- The retry limit and delay policy
- What creates a unique scheduled occurrence
- How idempotency is enforced at the delivery boundary
- The edit/cancellation race policy
- What guarantees change with multiple workers

## Out of scope

- Natural-language date parsing
- Recurring schedules
- Real push, email, SMS, or calendar providers
- Authentication and multi-tenancy
- A distributed queue or workflow engine
- Multi-region scheduling
- A management dashboard
- Production secret management

Optional work must remain secondary to durable scheduling and recovery.

## What reviewers will pay attention to

- Explicit scheduled-work states and valid transitions
- Separation between schedule storage, due-work discovery, and delivery
- Durable state rather than in-memory timers as the sole source of truth
- Idempotency at realistic failure boundaries
- Correct, explainable time-zone handling
- Race handling for edit, cancellation, and execution
- Tests that use controlled time instead of arbitrary sleeps
- Complexity appropriate for a 6–8-hour exercise

## Follow-up discussion

Be prepared to explain what happens if a user reschedules an item at the same moment a worker has already claimed its previous version.
