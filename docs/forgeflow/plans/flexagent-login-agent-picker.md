# FlexAgent login and agent picker implementation plan

## Goal

Let the evaluator sign in to FlexAgent staging from Eval Tool, choose an agent by name from the authorized organization, and run the existing single-turn RAG evaluation through that agent's normal LiveKit widget session.

## Preconditions and risks

- Approved source: `docs/forgeflow/specs/2026-09-28-flexagent-login-agent-picker-spec.md`.
- The existing Settings form accepts manual FlexAgent IDs; `server.js` already encrypts connection secrets and proxies normal widget token requests. Preserve existing saved targets and local-model evaluation.
- `server.js` currently uses `express.static(root)`. That may expose `data/store.json` through the local web server. Restrict static serving to the needed public files before persisting a FlexAgent login token; verify private files are unreachable over HTTP. The server currently listens without an explicit loopback address, so bind the local app to loopback for this workflow.
- An arbitrary API URL would receive the evaluator's password. Require an HTTPS FlexAgent API URL, display the destination before login, and validate the URL server-side. Do not log credentials, bearer tokens, or remote response bodies.
- The real `/v1/livekit/token` request contains only `orgId` and `agentId`. `flexAgentWidgetTokenRequest` currently adds `parentOrigin`; its test currently expects that extra field. The manual target route also references `parentOrigin` without destructuring it. Correct both paths while preserving locally stored origin checks.
- The pasted example LiveKit token and personal bearer token are credentials; neither belongs in source, tests, documentation, or logs.

## Ordered steps

### 1. Protect the local credential boundary

- Purpose: ensure a stored FlexAgent access token cannot be fetched as a static file or returned in workspace state.
- Areas affected: `server.js` static-file configuration, local server binding, and public state serialization.
- Work: serve only the UI assets and explicit vendor script; keep `.env` and `data/` outside static access. Bind `npm start` to `127.0.0.1` unless an explicit deployment requirement later changes it. Reuse AES-256-GCM encryption for the token, and return only connection status and non-secret configuration to the browser.
- Dependencies: existing encryption key and local store.
- Verification: HTTP requests for `/data/store.json` and `/.env` fail; `/`, `/app.js`, `/styles.css`, and `/vendor/livekit-client.js` still work; `/api/state` contains no decrypted or encrypted FlexAgent token.

### 2. Add server-side FlexAgent login and agent discovery

- Purpose: obtain and retain the caller's FlexAgent access token, then fetch agents they can see.
- Areas affected: `server.js` store defaults and local API routes.
- Work: save one FlexAgent connection configuration with HTTPS API URL and org ID; add a login route that forwards email/password to `/v1/auth/login`, validates `accessToken`, encrypts it, and never persists the password. Add an agent-list route that decrypts the token only server-side, calls `/v1/agent/list` with the authorized org ID and `page: 1, limit: 100`, and returns only `{ id, name }` entries plus connection status. Validate IDs and response shape. On a genuine remote authorization failure, clear only the stored access token and return a reconnect status; keep configuration and chosen agent.
- Dependencies: step 1.
- Verification: mocked remote login/list requests prove URL, payload, bearer header, password non-persistence, token non-disclosure, list projection, and reconnect handling. Malformed or failed remote replies produce safe errors.

### 3. Connect the agent picker to the existing LiveKit target

- Purpose: make a selected agent available on the current Evaluation screen.
- Areas affected: `server.js` target-save logic and `app.js` Settings flow.
- Work: render the connected organization and agent-name dropdown. On selection, save the agent's name and ID as the active `flexagent-livekit` target; replace that picker's previous active target rather than creating duplicates. Keep existing manually saved targets intact. Preserve selection across reload/restart. Escape agent names before inserting them into HTML. Show empty-list and reconnect states. Keep the private evaluation API form available for existing users.
- Dependencies: step 2.
- Verification: a fixture list displays names; selecting Transit Planner stores its known ID and causes it to appear as the target on Evaluation; reload retains selection; an empty list cannot create a target.

### 4. Align and verify the widget request

- Purpose: use the same token request contract as the working FlexAgent widget.
- Areas affected: `flexAgentWidgetTokenRequest`, `/api/flexagent-livekit-token`, the manual target origin parsing, and focused tests.
- Work: send exactly `{ orgId, agentId }` to `/v1/livekit/token`; retain the local browser-origin check and per-agent embed allowlist guidance. Fix the missing `parentOrigin` destructuring in the manual target route. Continue using a fresh LiveKit token for each case, `lk.chat` for questions, and finalized `lk.transcription` for answers.
- Dependencies: step 3.
- Verification: request-builder and mocked HTTP checks for exact body; `npm test`; one locally controlled end-to-end evaluation when valid staging credentials, an allowlisted agent, and an approved RAG dataset are available.

## Test strategy

- Extend the existing Node `assert` checks with a focused HTTP-level fixture for login, listing, selection, and token requests. Stub FlexAgent responses; automated tests must not require a real password or contact staging.
- Assert the negative security cases directly: private files unreachable, password absent from `data/store.json`, token absent from `/api/state` and list responses, and expired-token handling preserves configuration.
- Run `npm test`, `node --check server.js`, and `node --check app.js` once after implementation. Perform one browser walkthrough for login, dropdown selection, reload, and a single-turn LiveKit RAG case when credentials are available.

## Rollout or migration notes

- Add a new optional FlexAgent connection object to the existing JSON store; older stores load with no connected organization. Do not rewrite datasets, evaluations, or existing manual targets.
- No FlexAgent backend code change or staging deployment is required for these endpoints; they already exist in staging. Each selected agent still needs the local Eval Tool origin allowed in its Embed settings.
- Leave website-source evaluation and tool-routing/unit-test work outside this change. Website evaluation can use the same selected target only when its existing external-agent restriction is lifted in a separate approved change.
