# 04 — Multi-turn datasets

**Status:** complete

**Blocked by:** None — task 01 is complete

## What this delivers

Dataset review supports ordered survey conversations while retaining existing single-turn policy cases.

## Acceptance criteria

- [x] A case can optionally contain sequential user turns and expected final memory.
- [x] Existing single-turn cases remain valid and editable.
- [x] Draft validation rejects malformed ordered turns and final-memory expectations.
- [x] Approved datasets preserve multi-turn fields unchanged.

## TDD target

- Public seam: dataset-case normalization and validation helpers.
- First behavior to test: a legacy single-turn case normalizes without requiring `turns`.

## Verification

- `node --check server.js` (passed)
- `node --check app.js` (passed)
- `npm test` (passed)
