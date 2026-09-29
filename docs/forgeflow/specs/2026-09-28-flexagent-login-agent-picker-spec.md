# FlexAgent login and agent picker specification

## Problem and users

An evaluator can currently connect Eval Tool to a FlexAgent LiveKit widget only by manually copying an organization ID and agent ID. This is error-prone and does not let the evaluator choose an existing FlexAgent by name.

The user is an evaluator running RAG/document or website answer checks against FlexAgent staging. They need to connect once to their permitted organization, select an existing agent, and retain that selection across local Eval Tool restarts.

## Goal and success criteria

Provide a server-mediated FlexAgent login and a named-agent picker for the existing RAG-only LiveKit widget path.

Success means:

1. The evaluator can log in to FlexAgent staging from Eval Tool without the browser ever receiving a FlexAgent access token.
2. Eval Tool lists the first 100 agents in the chosen organization by name.
3. Selecting an agent stores its name and ID as the LiveKit evaluation target.
4. The existing LiveKit evaluation flow requests a normal widget token with the selected organization ID and agent ID, receives the agent answer, and applies the existing RAG score/report workflow.
5. When the access token is expired or rejected, Eval Tool clears only that token and asks the evaluator to reconnect.
6. Existing local model targets, manual FlexAgent targets, documents, and website evaluation continue to work.

## In scope

- FlexAgent Settings fields for API base URL and organization ID.
- A login form that submits an evaluator email/password to Eval Tool's local server.
- Server-side call to `POST /v1/auth/login`.
- Encrypted local persistence of the returned access token using the existing encryption mechanism; no password persistence.
- Server-side call to `POST /v1/agent/list` with `Authorization: Bearer <access token>` and `{ pagination: { page: 1, limit: 100 }, orgId }`.
- A dropdown displaying `agents[].name` and storing `agents[].id` for the selected organization.
- A selected agent becoming a normal `flexagent-livekit` target.
- Widget-token request body corrected to `{ orgId, agentId }` only.
- Friendly reconnect and allowlist errors.

## Out of scope

- Persisting or displaying FlexAgent passwords or access tokens.
- Creating, editing, deleting, or managing FlexAgent agents.
- Tool-routing, tool calls, handoffs, Agent Simulations, or private tool-trace endpoints.
- FlexAgent knowledge-source synchronization; the evaluator ensures both systems use the same document/website source version.
- Evaluation of multi-turn LiveKit cases; the existing single-turn constraint remains.
- Production deployment.

## User-facing behavior

### Connect

Settings shows a FlexAgent connection area with API URL and organization ID. The evaluator selects **Connect FlexAgent**, enters email and password, and submits.

On success, Eval Tool displays a connected state and loads a **Choose FlexAgent** dropdown containing agent names from that organization. It does not show the access token, password, or additional agent configuration.

### Select and evaluate

Selecting an agent creates or updates the saved LiveKit target using its name, ID, configured API URL, organization ID, and the existing allowlisted local Eval Tool origin (`http://127.0.0.1:4173`). The existing Evaluation screen can then select the target and run an approved single-turn RAG dataset.

For each case, Eval Tool asks FlexAgent for a fresh LiveKit widget token, joins the returned room as the visitor, sends the case question on the normal widget path, collects the final answer, and scores it through the existing control model.

### Failure states

- Invalid email/password: show a connection error; do not save credentials.
- Expired/rejected list token: delete the encrypted stored token, preserve API URL/org/selected agent metadata, and show **Reconnect FlexAgent**.
- No accessible agents: show an empty state rather than an empty unnamed target.
- Widget token rejected: show that the selected agent must allowlist `http://127.0.0.1:4173` in FlexAgent Embed settings.
- Existing LiveKit timeouts and empty-answer errors remain visible as evaluation failures.

## Technical and architectural decisions

- Eval Tool's local Express server, rather than browser JavaScript, owns FlexAgent authentication and agent-list requests. This prevents access-token exposure to the browser.
- Reuse the existing encrypted local-store mechanism for the access token. Passwords are only held long enough to forward the login request and are never placed in the persistent store.
- Use only `id` and `name` from the agent-list response. Do not copy persona, business description, model, tool, or other FlexAgent configuration into Eval Tool.
- Keep a single connected FlexAgent organization configuration. Selecting another agent replaces the active LiveKit target instead of introducing a new agent-management system.
- Keep the public widget-token flow separate from authenticated agent discovery. `/v1/livekit/token` receives only `orgId` and `agentId` to match the observed widget request.
- Page size is 100. Current staging organization has fewer than 100 agents. Pagination beyond 100 is deferred until needed.

## Data, API, and error-handling decisions

### Local persisted data

Persist the FlexAgent API base URL, organization ID, selected agent `{ id, name }`, local widget origin, and an encrypted access token. Do not persist the FlexAgent password.

### Remote API calls

```text
POST {baseUrl}/v1/auth/login
body: { email, password }
response: accessToken

POST {baseUrl}/v1/agent/list
Authorization: Bearer <decrypted access token>
body: { pagination: { page: 1, limit: 100 }, orgId }
response used: agents[].id, agents[].name

POST {baseUrl}/v1/livekit/token
body: { orgId, agentId }
response used: token, wsUrl
```

Any remote response that is not successful must be transformed into a safe message without including request passwords, access tokens, or response secrets. Authentication failures must clear only the encrypted access token.

## Testing decisions

- Public seams: existing local Express endpoints, exported request builders, and the Settings form behavior.
- Behaviors that require tests:
  - login saves an encrypted access token but not a password;
  - agent list request has the bearer header and uses the configured organization ID;
  - only name/ID reach the browser response;
  - expired authorization clears the encrypted token and preserves selected agent metadata;
  - widget-token request body has only org ID and agent ID;
  - existing non-FlexAgent and LiveKit checks continue to pass.
- Existing testing pattern to follow: extend the small Node `assert` checks in `test.mjs`; use mocked `fetch` for FlexAgent HTTP behavior so tests do not call staging.

## Risks, assumptions, and open questions

- Assumption: FlexAgent's login response continues to provide an access token valid for `agent:list`.
- Assumption: the evaluator's logged-in user is allowed to list the selected organization. Eval Tool must show the remote authorization error if not.
- Risk: the returned token currently reflects the evaluator's FlexAgent permissions. Keeping it encrypted server-side limits browser exposure but does not make it a least-privilege service credential.
- Risk: an agent may appear in the picker but not allowlist the Eval Tool local origin. This is checked only when requesting the widget token.
- Deferred: pagination beyond 100 agents, multiple simultaneously saved organizations, refresh-token support, and a dedicated least-privilege service credential.
