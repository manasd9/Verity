# 03 — Agent picker UI

**Status:** complete

**Blocked by:** None

## What this delivers

The evaluator connects an organization, chooses an agent by name, and uses it as the active LiveKit target.

## Acceptance criteria

- [x] Settings shows connect, reconnect, empty-list, and selected-agent states.
- [x] Agent names are escaped and selection persists.
- [x] Selecting an agent creates or updates one active LiveKit target.
- [x] Existing manual target setup remains usable.

## TDD target

- Public seam: Settings markup and selected target behavior.
- First behavior to test: selected agent appears as the LiveKit target after reload.

## Verification

- `npm test`
- `node --check app.js`

Result: passed on 2026-09-28.
