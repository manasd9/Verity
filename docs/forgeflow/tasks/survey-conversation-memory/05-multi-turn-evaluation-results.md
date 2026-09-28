# 05 — Multi-turn evaluation and results

**Status:** complete

**Blocked by:** None — tasks 02 and 04 are complete

## What this delivers

Approved multi-turn cases run in order, evaluate rule compliance and retained memory, and display turn-by-turn evidence in Results.

## Acceptance criteria

- [x] The runner sequence and final-memory scoring helpers are covered for implementation.
- [x] The runner executes user turns in order using isolated ephemeral conversation state.
- [x] Each turn records the answer, document/history retrieval evidence, memory checkpoint, and rubric verdict.
- [x] Final-memory expectations are scored against the source-linked ledger.
- [x] Single-turn evaluation behavior remains unchanged.
- [x] Results display multi-turn checkpoints without breaking existing result views.

## TDD target

- Public seam: multi-turn case execution and final-memory rubric construction.
- First behavior to test: the second turn receives the first turn's explicit answer in its working memory.

## Verification

- `node --check server.js` (passed)
- `node --check app.js` (passed)
- `npm test` (passed)
