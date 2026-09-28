# Survey conversation memory implementation plan

## Goal

Implement permanent source-of-truth chat transcripts, bounded but durable survey memory, and multi-turn survey evaluation in the existing local Eval Tool.

## Preconditions and risks

- The current store uses `data/store.json`; existing records must remain readable.
- Chat and document retrieval already depend on an OpenAI-compatible control connection for embeddings.
- Target and control model JSON can be malformed. Validate before writing so a failed turn never produces half-persisted memory.
- Full history cannot fit in an LLM request. The transcript remains complete, while the target uses compact memory, recent turns, and relevant older chunks.

## Ordered steps

### 1. Define and test the durable chat-memory helpers

- Purpose: establish a stable, testable shape for message IDs, source-linked ledger facts, correction status, bounded prompt memory, and multi-turn dataset case normalization.
- Areas affected: `server.js`, `test.mjs`.
- Dependencies: none; reuse current ID generation and cosine ranking.
- Verification: assert valid ledger formatting and rejection of malformed or source-less facts; assert old and new dataset case shapes normalize correctly.

### 2. Extend local-store cleanup and chat writes

- Purpose: add `chatChunks` and versioned `surveyMemory` without breaking existing chats; create atomic state changes for a chat turn.
- Areas affected: `server.js`, `test.mjs`.
- Dependencies: Step 1 data helpers.
- Verification: assert existing chats initialize with empty memory, all message IDs persist, document deletion removes related chat chunks, and failed-memory updates do not save a partial turn.

### 3. Build history-aware chat context

- Purpose: index each stored chat message, retrieve relevant older messages for the current question, and combine those with document RAG, recent turns, and survey memory in the target request.
- Areas affected: `server.js`, `test.mjs`.
- Dependencies: Steps 1–2 and the existing `embed`, `retrieveChunks`, and `policyContext` helpers.
- Verification: a later question retrieves a fact from outside the recent-message limit; target context distinguishes explicit facts from inferences and exposes source references.

### 4. Extract and present survey memory

- Purpose: ask the control model for source-grounded structured facts after a successful target reply, save the append-only ledger, and make memory reviewable in Customer Chat.
- Areas affected: `server.js`, `app.js`, `test.mjs`.
- Dependencies: Steps 1–3.
- Verification: an explicit user answer, a model inference, an unresolved answer, and a user correction render distinctly; invalid model JSON returns an error and leaves the prior chat state unchanged.

### 5. Support multi-turn golden cases and execution

- Purpose: preserve current single-turn dataset behavior while allowing an approved case to define ordered user messages, per-turn rubrics, and expected final memory.
- Areas affected: `server.js`, `app.js`, `test.mjs`.
- Dependencies: Steps 1–4.
- Verification: a multi-turn case executes in order against isolated ephemeral chat state, records per-turn response/retrieval/memory evidence, scores final remembered data, and continues running legacy single-turn cases unchanged.

### 6. Surface results and complete regression checks

- Purpose: show multi-turn memory checkpoints and final-memory verdicts clearly in Results, while preserving current result views.
- Areas affected: `app.js`, `test.mjs`.
- Dependencies: Step 5.
- Verification: `node --check server.js`, `node --check app.js`, and `npm test`; manually exercise a long survey chat with a correction and a multi-turn evaluation.

## Test strategy

- Continue with Node built-in `assert` in `test.mjs`; add only focused tests at the pure-helper and route-contract seams.
- Mock model calls through small exported/request-construction helpers where necessary rather than adding a testing dependency.
- Cover transcript preservation, history retrieval, fact provenance, correction behavior, extraction failure rollback, legacy cases, ordered turn execution, final memory scoring, and cleanup.

## Rollout or migration notes

- Store migrations are additive. Old chat records receive empty `surveyMemory` and no `chatChunks`; they become history-indexed as new turns occur.
- No data deletion or FlexAgent changes are required.
- Existing single-turn datasets remain valid because multi-turn fields are optional.
