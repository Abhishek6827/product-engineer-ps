# Problem 4: Trustworthy Long-Term Memory

## Context

A persistent conversational companion becomes useful when it remembers relevant details over time. It becomes untrustworthy when it repeats outdated facts, cannot show where a memory came from, or keeps information the user asked it to forget.

For example, “I live in Pune” may later be corrected by “I moved to Mumbai.” The earlier statement can remain in history, but it must not be presented as the user’s current city.

## Your objective

Build a small memory engine that stores conversational memories, retrieves relevant current context, and handles corrections and deletion.

This exercise evaluates data modelling, provenance, retrieval, lifecycle rules, explainability, and user control. It is not a model-training or large-scale vector-database exercise.

## Minimum memory contract

Each memory should have equivalent concepts for:

- A stable identifier
- Normalized memory content or structured fact
- Source provenance linking back to the originating message or fixture
- Creation and update times
- A lifecycle state such as active, superseded, or deleted
- A link to the memory it supersedes or is superseded by when applicable
- Retrieval evidence such as a score, matched fields, or documented rule

You may use structured facts, text memories, or a justified combination.

## Required behaviour

Your engine must support:

1. Storing a memory with stable identity and source provenance
2. Retrieving a bounded set of relevant active memories for a new message
3. Correcting or superseding an outdated memory without losing understandable history
4. Excluding superseded memories from current context by default
5. Deleting a memory so it no longer appears in retrieval
6. Inspecting a memory’s source and lifecycle
7. Explaining why each result was selected using observable evidence
8. Producing deterministic results for a fixed evaluation fixture

Memory extraction from free-form conversation is optional. You may accept structured memory candidates or provide a deterministic extractor. If you use a model, tests must use a fake, recorded, or local deterministic substitute.

## Acceptance scenarios

### AC1: Store with provenance

- **Given** a source message contains a useful fact
- **When** the fact is stored as memory
- **Then** the memory has stable identity and the original source can be inspected

### AC2: Relevant retrieval

- **Given** active memories cover different topics
- **When** a new message asks about one topic
- **Then** the bounded result contains relevant current memories with selection evidence

### AC3: Explicit correction

- **Given** an active memory says the user lives in Pune
- **When** a later sourced memory says the user moved to Mumbai
- **Then** Mumbai becomes current, Pune is visibly superseded, and normal retrieval does not present both as simultaneously current

### AC4: Uncertain contradiction

- **Given** a new candidate appears inconsistent but does not clearly replace an active memory
- **When** it is processed
- **Then** the engine follows a documented conservative policy rather than silently destroying history

### AC5: Deletion

- **Given** an active memory exists
- **When** the user deletes it
- **Then** it no longer appears in current retrieval and its deletion semantics are documented

### AC6: Stable evaluation

- **Given** the same fixed fixture and query set
- **When** the evaluation is run repeatedly
- **Then** it produces deterministic, inspectable results without a paid external service

## Required tests

Include deterministic automated tests for:

- Storage and provenance
- Bounded relevant retrieval
- Explicit correction and supersession
- Exclusion of superseded facts
- Deletion from current retrieval
- At least one ambiguous or non-replacement case

Avoid assertions based only on opaque model prose. Test the memory states and selection behaviour your code owns.

## Verification benchmark

Provide a version-controlled fixture containing:

- At least **30 memories** across several topics
- At least **five explicit correction or supersession chains**
- At least **two ambiguous potential conflicts**
- At least **20 fixed retrieval queries**, each with version-controlled expected inclusions and exclusions

Provide one repeatable command that runs the fixture and compares actual results with those expected inclusions and exclusions. It must fail when an expected relevant memory is missing or when a superseded, deleted, or explicitly excluded memory appears as current. Report per-query results and an overall pass count.

This benchmark evaluates predictable product behaviour, not leaderboard-quality information retrieval.

## Demo checklist

In the demo video, show:

1. Storing a memory and inspecting its source
2. Retrieving relevant context for a new message
3. Correcting a fact and inspecting the supersession history
4. Showing that the outdated fact is absent from current retrieval
5. Deleting a memory
6. The deterministic verification benchmark and its result

## Decisions you must document

- What qualifies as a memory in your model
- How memory identity is determined
- How relevance is calculated
- How explicit corrections differ from uncertain contradictions
- Whether deletion is hard or soft and why
- Which evidence is exposed to explain retrieval
- How sensitive or high-risk memories would be treated in production
- What would change as memory volume grows

## Out of scope

- A complete chat application
- A live model dependency
- Production-scale embeddings or vector infrastructure
- Automatic extraction of every possible fact
- Image, audio, or document memories
- Multi-user sharing
- A polished memory-management interface
- Training or fine-tuning a model

Optional work must remain secondary to provenance, lifecycle correctness, and deterministic retrieval.

## What reviewers will pay attention to

- A data model that makes provenance and lifecycle explicit
- Clear rules for current, superseded, and deleted information
- Conservative handling of ambiguous conflicts
- Retrieval that is bounded and explainable
- Deterministic fixtures that expose real failure modes
- Separation between extraction, storage, reconciliation, and retrieval
- Honest limitations rather than inflated AI claims
- Complexity appropriate for a 6–8-hour exercise

## Follow-up discussion

Be prepared to explain how your design would handle a user saying, “I moved back to Pune,” after the Pune-to-Mumbai correction chain.
