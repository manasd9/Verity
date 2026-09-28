# 01 — Durable chat memory

**Status:** complete

**Blocked by:** None — can start immediately

## What this delivers

Every saved chat retains immutable, identified messages and a source-linked survey-memory ledger. Related history chunks are cleaned up with the document.

## Acceptance criteria

- [x] New chat messages have stable IDs and timestamps; existing stored messages remain readable.
- [x] Survey facts distinguish explicit data, inferences, unresolved data, and corrections with source message IDs.
- [x] Chat history chunks and survey memory are removed when their document is deleted.
- [x] Invalid memory data cannot partially persist a chat turn.

## TDD target

- Public seam: memory-ledger validation/formatting and document cleanup helpers.
- First behavior to test: a valid explicit fact references an existing source message and survives a store read/write cycle.

## Verification

- `node --check server.js` (passed)
- `node --check app.js` (passed)
- `npm test` (passed)
