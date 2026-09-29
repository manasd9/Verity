# FlexAgent login and agent picker review

## Scope

Reviewed the FlexAgent login and picker changes in `server.js`, `app.js`, and `test.mjs` against `d00c0d0cfec0a3ea61944daac70e20212496efa9`.

Pre-existing uncommitted website-evaluation changes in the same working tree were excluded from this review.

## Standards

No documented repository coding standard exists beyond the established single-file Express and browser-JavaScript style. The new code follows the existing local encrypted-store pattern and Node `assert` test pattern.

No material code-smell issue found in the reviewed scope. The new functionality remains in the existing `server.js` and `app.js` boundaries rather than introducing a new framework or dependency.

## Specification

All approved requirements are implemented:

- Login is server-mediated and does not return the FlexAgent access token to the browser.
- The local store holds only an encrypted token; the password is not persisted.
- Agent discovery uses the supplied `/v1/agent/list` contract and returns only agent ID/name.
- Agent selection creates or updates one LiveKit target and persists it.
- Expired authorization clears the stored token while keeping selected-agent metadata.
- Widget token requests now use only `orgId` and `agentId`.
- The local server serves an explicit UI file allowlist and binds to loopback, protecting the store and `.env` from static HTTP access.
- Existing manual FlexAgent target setup remains available.

## Verification

- `npm test` passed.
- `node --check server.js` passed.
- `node --check app.js` passed.
- `git diff --check` found no whitespace errors; it emitted only existing line-ending warnings.

## Outcome

No blocking findings.
