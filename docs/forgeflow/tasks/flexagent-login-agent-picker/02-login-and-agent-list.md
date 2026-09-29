# 02 — FlexAgent login and agent list

**Status:** complete

**Blocked by:** None

## What this delivers

Eval Tool can log in to FlexAgent and return a safe list of agent IDs and names for one organization.

## Acceptance criteria

- [x] Login forwards credentials once and persists only an encrypted access token.
- [x] Agent-list request uses the stored token server-side.
- [x] Browser receives only agent IDs and names.
- [x] Authorization expiry clears the stored token and preserves connection metadata.

## TDD target

- Public seam: local login and agent-list endpoints.
- First behavior to test: successful login stores no password and agent listing projects `{ id, name }`.

## Verification

- `npm test`
- `node --check server.js`

Result: passed with mocked FlexAgent responses on 2026-09-28.
