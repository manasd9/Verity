# 01 — Secure local credential boundary

**Status:** complete

**Blocked by:** None

## What this delivers

The local Eval Tool can safely store an encrypted FlexAgent access token without serving the store or `.env` over HTTP.

## Acceptance criteria

- [x] Static UI assets load while `data/store.json` and `.env` are unreachable.
- [x] The local server binds to loopback by default.
- [x] Widget token requests contain only organization and agent IDs.
- [x] Existing public state does not expose connection secrets.

## TDD target

- Public seam: HTTP static paths and `flexAgentWidgetTokenRequest`.
- First behavior to test: the widget token request body omits `parentOrigin`.

## Verification

- `npm test`
- `node --check server.js`

Result: passed on 2026-09-28.
