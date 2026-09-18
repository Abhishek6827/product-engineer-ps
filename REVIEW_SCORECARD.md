# Caygnus Challenge Review Scorecard

Use this scorecard to evaluate every submission consistently. Read the selected problem brief before reviewing the implementation.

The challenge score is one hiring signal, not an automatic hiring decision. Do not reward a preferred technology stack, the amount of code written, visual polish, or undisclosed assumptions about how the solution “should” have been built.

## 1. Completeness check

Record each item as yes or no before scoring:

- [ ] The fork is accessible.
- [ ] The selected problem is clearly identified.
- [ ] Setup and run instructions are present.
- [ ] `SUBMISSION.md` is complete.
- [ ] The demo video is accessible and shows the required scenarios.
- [ ] The relevant source code is included.
- [ ] Focused automated tests are included and runnable.
- [ ] The core acceptance scenario can be demonstrated.
- [ ] A problem-specific failure or recovery scenario can be demonstrated.
- [ ] The verification benchmark includes a reproducible command or documented sequence and observed results.
- [ ] AI usage is disclosed.
- [ ] The credibility note identifies the candidate's contribution to a previously shipped system.
- [ ] No secrets or private credentials are committed.

If a submission is incomplete, record the exact missing evidence. An administrative issue such as video permissions is different from missing implementation work and should be treated accordingly.

## 2. Rating scale

Rate each scored area from 0 to 5:

| Rating | Meaning |
| ---: | --- |
| 0 | No relevant evidence is present. |
| 1 | The area is materially incomplete or misunderstood. |
| 2 | Some relevant work exists, but important behavior is missing or fragile. |
| 3 | Meets the stated expectations with a sound, understandable solution. |
| 4 | Strong implementation with thoughtful handling of non-obvious concerns. |
| 5 | Exceptional judgment that addresses meaningful risk simply and convincingly. |

Calculate each weighted result as `(rating / 5) × weight`.

## 3. Scored review

| Area | Weight | Rating (0–5) | Weighted result |
| --- | ---: | ---: | ---: |
| Core correctness | 25 |  |  |
| Software architecture and decomposition | 25 |  |  |
| Coding patterns and maintainability | 20 |  |  |
| Failure handling | 15 |  |  |
| Testing | 10 |  |  |
| Communication and trade-offs | 5 |  |  |
| **Total** | **100** |  |  |

### Core correctness — 25%

- Are all required acceptance scenarios implemented?
- Does the demo match the submitted code?
- Are state transitions and externally visible outcomes correct?
- Can the reviewer reproduce the primary behavior?
- Does the problem-specific verification benchmark support the candidate's claims?

### Software architecture and decomposition — 25%

- Are responsibilities separated at useful boundaries?
- Are interfaces and data flow explicit?
- Is state owned by the right components?
- Can important components be changed or tested independently?
- Does the architecture fit the size of the exercise?

### Coding patterns and maintainability — 20%

- Is the code idiomatic for the selected stack?
- Are names, types, and control flow clear?
- Are abstractions useful rather than ceremonial?
- Is repeated or complex logic handled consistently?
- Can a reviewer locate and modify the core behavior without excessive effort?

### Failure handling — 15%

- Are the problem-specific failure scenarios handled deliberately?
- Are failures visible enough to diagnose?
- Are retry and termination behaviors bounded?
- Does the solution preserve data and valid state during partial failure?

### Testing — 10%

- Do tests cover valuable behavior rather than implementation trivia?
- Is at least one relevant failure or recovery path tested?
- Are tests deterministic and reasonably isolated?
- Can tests run without paid external services?
- Does the benchmark expose incorrect ordering, duplication, recovery, or terminal-state behavior where relevant?

### Communication and trade-offs — 5%

- Are setup instructions accurate and concise?
- Are assumptions, limitations, and unfinished work stated honestly?
- Are important decisions and alternatives explained?
- Does the candidate distinguish current behavior from proposed production improvements?

## 4. Credibility signal

Assess the credibility note separately from the implementation score:

| Signal | Description |
| --- | --- |
| Insufficient | The candidate does not make their personal contribution or the system complexity clear. |
| Plausible | The candidate describes a shipped system, their role, and at least one concrete scale or operational constraint. |
| Strong | The candidate provides concrete evidence, clearly owns specific decisions, and explains a difficult trade-off or incident with depth. |

Confidential work does not require exact metrics or public source code. Look for specificity and coherent reasoning rather than famous company names or unusually large numbers.

## 5. Follow-up discussion

Use the discussion to validate ownership and understanding, including when AI tools were used:

1. Ask the candidate to walk through the core data flow.
2. Select one failure scenario and ask why the implementation behaves that way.
3. Ask what they intentionally did not build.
4. Ask them to make or describe one small requirement change.
5. Discuss one production-scale concern from their `SUBMISSION.md`.

Do not ask candidates to reproduce memorized syntax. The goal is to verify that they understand, can critique, and can evolve the submitted design.

### Problem-specific change prompts

Choose one small change matching the submitted problem:

- **Resumable realtime conversation:** Ask how the design behaves when the requested cursor is older than retained history, then change or describe the recovery response.
- **Offline mobile conversation:** Change the ordering policy so one permanently failing message does not block later messages.
- **Durable reminders and follow-ups:** Reschedule an item after a worker has claimed its previous version and explain which outcome should win.
- **Trustworthy long-term memory:** Add a fact that returns to a previously superseded value and preserve an understandable history.
- **Reliable AI conversation runtime:** Allow cancelled partial output to be retained without representing the turn as successfully completed.

The candidate may implement the change or describe it using concrete files, state transitions, and tests. Evaluate ownership and reasoning, not typing speed.

## 6. Recommendation

- **Challenge score:** /100
- **Credibility signal:** Insufficient / Plausible / Strong
- **Recommended next step:** Advance / Discuss / Do not advance
- **Strongest evidence:**
- **Primary concern:**
- **Follow-up question:**

A recommendation should cite evidence from the submission. Avoid using a score alone when one unusually strong or weak dimension materially changes the hiring signal.
