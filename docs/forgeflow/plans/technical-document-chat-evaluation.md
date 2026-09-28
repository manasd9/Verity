# Technical-document chat and evaluation implementation plan

## Goal

Make each indexed Technical Blueprint document available for grounded target-agent chat and for reviewable, scored technical evaluations, without changing the existing operational-policy workflow.

## Preconditions and risks

- The existing control connection provides embeddings; a technical upload without it remains stored but cannot be queried or evaluated until indexed.
- Technical documents need structural retrieval context. A heading, signature, and request/response example must not be separated unless the source itself exceeds the safe chunk ceiling.
- A FlexAgent endpoint cannot receive supplied source sections through its current `answer` endpoint. Technical chat and grounded technical evaluation must therefore use OpenAI-compatible model targets; the UI must mark FlexAgent unavailable rather than claim document grounding.
- Existing chats carry survey-memory behavior. Technical chats need a simpler branch, not a second chat store or migration.

## Ordered steps

### 1. Normalize document kind and add technical indexing

- Purpose: give every chunk and downstream record a reliable document kind, then make technical source text retrievable.
- Areas affected: `server.js` store normalization, technical upload route, technical delete route, public state shape, and exported helper seams.
- Work: normalize legacy policy documents/chunks; add `documentKind` to newly stored chunks; run technical source through a new section-aware splitter and the existing `embedAll` path after a successful upload; expose a retrieval-ready/unavailable status without exposing raw source text.
- Dependencies: existing extraction, encrypted OpenAI control connection, local JSON store.
- Risks: embedding failure must leave the technical document durable and avoid orphan chunks.
- Verification: focused assertions prove legacy policy normalization, technical chunk creation, no technical/policy cross-retrieval, and technical delete cleanup.

### 2. Generalize grounded target calls by document kind

- Purpose: reuse the target model and retrieval machinery while keeping policy survey behavior untouched.
- Areas affected: `server.js` document resolver, retrieval/context helpers, `POST /api/chat`, and chat persistence.
- Work: resolve a requested document as policy or technical; select only same-kind chunks; construct a technical system context that requires source-only answers and clear unsupported-answer handling; bypass survey-memory extraction/history indexing for technical chats; tag the chat kind and preserve the existing policy path exactly.
- Dependencies: indexed technical chunks from step 1.
- Risks: reject a target that cannot accept supplied context (currently FlexAgent) before any chat is persisted.
- Verification: helper assertions cover technical context wording, chunk isolation, no survey-memory side effect, and rollback on failed model calls.

### 3. Make reviewed datasets technical-aware

- Purpose: let evaluators create quality technical questions using the established review workflow.
- Areas affected: `server.js` `POST /api/datasets/generate`, dataset validation/approval, and state payloads.
- Work: resolve technical documents in dataset generation; use a technical-specific source-evidence prompt for API behavior, constraints, inputs/outputs, branches, and unsupported-question cases; store `documentKind` on the dataset; validate every evidence excerpt against the source before saving; retain the existing generic case schema and manual review route.
- Dependencies: document-kind resolver from step 2.
- Risks: disallow multi-turn survey-memory fields in generated technical cases, while retaining backward compatibility for existing policy datasets.
- Verification: generated/persisted technical dataset validation and evidence checks; policy dataset regressions remain green.

### 4. Run technical evaluations through the existing scoring engine

- Purpose: produce the current final aggregate score and result details from technical cases.
- Areas affected: `server.js` `POST /api/evaluations`, target-context creation, result metadata, and cleanup.
- Work: resolve the dataset's technical source; retrieve technical chunks for each case; call an OpenAI-compatible target with technical source context; reuse the current control-model rubric verdict and aggregate calculation; store document kind with the evaluation and retrieved technical chunks in results.
- Dependencies: steps 1–3.
- Risks: prevent datasets, targets, and documents from being mixed across kinds; retain the current FlexAgent policy-only behavior rather than presenting it as retrieval-grounded.
- Verification: one technical evaluation fixture validates final-score calculation, retrieved section traceability, and kind mismatch rejection.

### 5. Add the Technical Blueprint chat/evaluation controls

- Purpose: make the new behavior discoverable where users already inspect the technical document.
- Areas affected: `app.js`, `index.html` only if new semantic hooks are needed, and `styles.css` only for existing-component composition gaps.
- Work: add an **Ask & evaluate** tab or panel for the selected technical document; reuse the existing chat composer, scenario review, evaluation form, and result renderer with a technical-document filter and copy; show precise unavailable states for missing indexing, model target, control connection, or approved dataset.
- Dependencies: API/state changes from steps 1–4.
- Risks: selectors must never offer policy documents in technical flows or technical documents in policy flows.
- Verification: static UI contract assertions plus a browser smoke check of a ready and unavailable technical document.

### 6. Run regression checks

- Purpose: leave the smallest durable safety net for the new non-trivial branches.
- Areas affected: `test.mjs` and exported pure helpers.
- Work: add direct Node assertions for section-aware chunking, kind-aware retrieval, technical context, cleanup isolation, and static endpoint/UI wiring; preserve the existing dependency-free test style.
- Verification: `node --check server.js`, `node --check app.js`, and `npm test`.

## Test strategy

- Unit-level `node:assert` checks exercise chunk boundaries with headings and fenced code, collection isolation, source-evidence validation, and score aggregation.
- Route-level behavior is covered through existing pure seams and static endpoint contracts; external model calls are not required for the suite.
- Manual smoke test: upload a short technical TXT after connecting the control model, ask a source-supported and unsupported question through a model target, approve generated cases, run an evaluation, and inspect the final score and retrieved sections.

## Rollout or migration notes

- No database migration: JSON-store reads normalize legacy policy records and chunks on load/save.
- Existing policy documents and results remain usable. New kind fields are additive.
- If technical indexing fails, re-uploading after connecting a control model is the smallest recovery path; no background job or retry subsystem is introduced.
