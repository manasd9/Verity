# 02 — History-aware chat

**Status:** complete

**Blocked by:** None — task 01 is complete

## What this delivers

The target receives active survey memory, recent messages, and relevant older transcript excerpts, while every raw message remains stored locally.

## Acceptance criteria

- [x] New chat messages are embedded and stored as chat-scoped history chunks.
- [x] A question can retrieve an earlier answer that is outside the recent-message window.
- [x] Target context includes document rules, active memory, recent transcript, and older history evidence.
- [x] Explicit facts and inferred facts remain visibly distinct in the target context.

## TDD target

- Public seam: chat-history ranking and target-context construction helpers.
- First behavior to test: ranking returns only chunks from the requested chat and finds an older matching answer.

## Verification

- `node --check server.js` (passed)
- `node --check app.js` (passed)
- `npm test` (passed)
