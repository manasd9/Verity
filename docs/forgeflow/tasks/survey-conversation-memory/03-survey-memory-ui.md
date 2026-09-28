# 03 — Survey-memory review UI

**Status:** complete

**Blocked by:** None — task 02 is complete

## What this delivers

After each turn, Customer Chat extracts source-linked survey memory and exposes explicit answers, marked inferences, unresolved values, and corrections.

## Acceptance criteria

- [x] The active chat shows a concise survey-memory panel.
- [x] The control model extracts only source-linked facts after a successful chat turn.
- [x] Explicit answers, inferences, unresolved items, and superseded corrections have distinct labels.
- [x] Each displayed fact identifies its originating conversation message.
- [x] Existing chat rendering remains usable when memory is empty.
- [x] Invalid extraction JSON leaves the chat and its history chunks unchanged.

## TDD target

- Public seam: source-linked extraction validation and client-side memory rendering from a chat record.
- First behavior to test: extraction rejects a fact that does not cite a stored message; an empty ledger renders an intentional empty state rather than an error.

## Verification

- `node --check server.js` (passed)
- `node --check app.js` (passed)
- `npm test` (passed)
