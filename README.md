# Caygnus Product Engineering Challenge

> **Before you begin:** Read this README and your selected problem brief completely before starting. If anything is unclear, contact us using whichever option you prefer: [hr@caygnus.com](mailto:hr@caygnus.com) or [Omkar Sonawane on LinkedIn](https://www.linkedin.com/in/omkar-sonawane-ss/).

We are hiring a **Product Engineer / Full-Stack Developer** to build and ship products in the AI space at Caygnus. The role is available in a **remote or hybrid** working arrangement.

We care less about years of experience than evidence: what you have shipped, the complexity or scale you have handled, and how you make engineering and product decisions.

## The product context

Imagine a persistent conversational companion that remembers useful context, continues conversations across devices, follows up at the right time, and remains dependable when networks, processes, or model providers fail.

Building that experience involves more than calling a language model. It requires thoughtful client state, realtime protocols, durable workflows, trustworthy memory, and a reliable AI runtime.

Choose **one** of the following focused problems. You are not expected to build the complete companion.

| Problem | Primary signal | Detailed brief |
| --- | --- | --- |
| Resumable realtime conversation | Streaming, reconnection, ordering, durable event history, and frontend state | [View problem 1](problems/01-resumable-realtime-conversation/README.md) |
| Offline-capable mobile conversation | Mobile state, local persistence, synchronization, and idempotency | [View problem 2](problems/02-offline-mobile-conversation/README.md) |
| Durable reminders and follow-ups | Scheduling, workflow durability, retries, time zones, and cancellation | [View problem 3](problems/03-durable-reminders/README.md) |
| Trustworthy long-term memory | Data modelling, provenance, retrieval, correction, and user control | [View problem 4](problems/04-trustworthy-memory/README.md) |
| Reliable AI conversation runtime | Orchestration, streaming, safety gates, cancellation, and observability | [View problem 5](problems/05-reliable-conversation-runtime/README.md) |

Read this page first, then read the complete brief for your selected problem. The problem-specific brief is the source of truth for its acceptance criteria.

## What this challenge is—and is not

This is a focused credibility exercise, not a request for a production-ready product or unpaid product work. We want to understand how you:

- Identify the important part of a problem
- Structure software into clear responsibilities
- Choose appropriate data structures and interfaces
- Handle realistic failure and recovery cases
- Write maintainable, idiomatic code
- Test important behaviour
- Explain decisions, trade-offs, and deliberately omitted scope

We do **not** expect authentication, production infrastructure, elaborate visual design, or a long feature list. Extra scope does not compensate for an unreliable core implementation.

## Time and technology

- Submit your solution within **3–4 calendar days** of receiving the challenge.
- We recommend spending approximately **6–8 hours** of active work. You are not expected to spend the entire submission window building.
- You may use **any appropriate language, framework, database, infrastructure, or model provider**.
- For the mobile problem, produce a runnable mobile experience using React Native, Flutter, or a native platform.
- Explain why you selected your stack and its important trade-offs.
- An incomplete but well-reasoned submission is better than a large, overbuilt submission.

If a requirement is unclear, make a reasonable assumption, document it, and continue. We evaluate the quality of your decision—not whether you guessed an unstated preference.

## How to complete the challenge

1. Fork this repository.
2. Choose one problem from the table above.
3. Build your solution in your fork using any structure appropriate for your stack.
4. Copy [SUBMISSION_TEMPLATE.md](SUBMISSION_TEMPLATE.md) to `SUBMISSION.md` and complete every section.
5. Add focused automated tests.
6. Run the problem-specific verification benchmark.
7. Record the required demo video.
8. Verify that setup instructions and video permissions work for someone outside your account.
9. Submit the link to your fork.

Do not modify the problem statement to make your implementation appear compliant. If you intentionally interpret a requirement differently, explain the interpretation in `SUBMISSION.md`.

## Required submission evidence

A submission is complete only when it contains all of the following.

### 1. Runnable source code

The reviewer must be able to run the selected acceptance scenarios. Never commit API keys, credentials, access tokens, private datasets, or other secrets.

### 2. Completed `SUBMISSION.md`

Use the provided [submission template](SUBMISSION_TEMPLATE.md). It asks for setup and test instructions, architecture, technology choices, completed acceptance scenarios, benchmark evidence, assumptions, limitations, AI usage, and a credibility note.

Aim for setup instructions that a reviewer can follow within approximately 10 minutes.

### 3. Focused tests

At minimum, include one important successful path, one relevant failure or recovery path, and any deterministic tests required by the selected problem brief.

We value meaningful tests over a high coverage percentage. Tests must not depend on paid external services.

### 4. Demo video

Attach a **3–5 minute demo video** using Loom, YouTube, Google Drive, or another accessible service. Put the link near the top of `SUBMISSION.md`.

The video must show the project running, the required successful scenario, at least one failure or recovery scenario, the problem-specific benchmark, a brief architecture explanation, and one important trade-off.

A straightforward screen recording with narration is sufficient. Production-quality editing is not expected. A submission without an accessible demo video is incomplete.

### 5. Credibility note

Briefly describe one product or system you previously helped ship:

- What problem it solved
- Your personal contribution
- The scale or operational complexity involved
- One difficult engineering or product decision you made
- A public link, repository, case study, or other evidence when available

You may anonymize confidential details and use approximate figures. Scale can be demonstrated through users, traffic, concurrency, data volume, latency, reliability, cost, deployment complexity, or operational responsibility.

## Using AI tools

You may use AI tools while completing this challenge. AI usage will not reduce your score.

Disclose which tools you used, what they helped with, and how you reviewed their output. You remain responsible for everything in your submission. We are not evaluating how much code you typed manually; we are evaluating the software you chose to submit and your understanding of it.

During review, we will consider decomposition, component boundaries, data structures, state transitions, coding patterns, maintainability, failure recovery, useful abstractions, and meaningful tests. You should be able to explain any part of the submission. In a follow-up discussion, we may ask you to make or describe a small change.

## How we evaluate submissions

Reviewers use the same public [review scorecard](REVIEW_SCORECARD.md) for every technology stack and problem choice.

| Area | Weight | What we look for |
| --- | ---: | --- |
| Core correctness | 25% | The selected acceptance scenarios and verification benchmark work consistently. |
| Software architecture and decomposition | 25% | Responsibilities, boundaries, interfaces, state ownership, and data flow are clear. |
| Coding patterns and maintainability | 20% | The code is readable, consistent, idiomatic, and no more complicated than necessary. |
| Failure handling | 15% | Important failures are identified, observable, bounded, and recoverable. |
| Testing | 10% | Tests focus on valuable success, failure, and recovery behaviour. |
| Communication and trade-offs | 5% | Decisions, assumptions, limitations, and alternatives are explained clearly. |

We do not award additional points for visual polish, deployment, fashionable technology choices, raw code volume, or unrelated features unless they materially improve the selected capability.

## Reasons a submission may be incomplete

- The repository or demo video is inaccessible.
- Setup instructions are absent or cannot reasonably be followed.
- The selected problem is not identified.
- The core acceptance scenario or required benchmark is not demonstrated.
- Secrets or private credentials are committed.
- Large portions of submitted code cannot be explained by the candidate.

An incomplete optional feature is not a reason for rejection. Clearly label unfinished work and prioritize the required behaviour.

## How to apply

Submit your repository through [the submission form](https://binary.so/u2QOfUx), or email it to [caygnus@gmail.com](mailto:caygnus@gmail.com).

Include your resume and links to products or projects you have worked on or shipped.

We look forward to seeing how you think and build.
