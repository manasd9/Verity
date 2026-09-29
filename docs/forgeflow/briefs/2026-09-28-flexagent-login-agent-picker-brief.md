# FlexAgent login and agent picker

## Purpose

Let an evaluator connect the local Eval Tool to a FlexAgent staging organization, choose an existing FlexAgent by name, and run the existing RAG-only LiveKit widget evaluation against that agent.

## Confirmed FlexAgent API contract

Base URL:

```text
https://api-staging.flexagents.ai
```

Login:

```text
POST /v1/auth/login
{ "email": "...", "password": "..." }
```

The response includes an access token.

List agents:

```text
POST /v1/agent/list
Authorization: Bearer <access token>
{ "pagination": { "page": 1, "limit": 100 }, "orgId": "<org id>" }
```

Only `agents[].id` and `agents[].name` are needed by Eval Tool.

Create a normal widget LiveKit token:

```text
POST /v1/livekit/token
{ "orgId": "<org id>", "agentId": "<agent id>" }
```

The response contains a short-lived LiveKit token and `wsUrl`.

## User flow

1. In Eval Tool Settings, the evaluator enters the FlexAgent API base URL and organization ID.
2. The evaluator presses **Connect FlexAgent**, enters an email and password, and Eval Tool's local server forwards them once to the FlexAgent login endpoint.
3. Eval Tool receives the access token, encrypts it in its existing local store, and discards the password. The browser never receives the access token.
4. Eval Tool loads the first 100 agents for that organization and displays agent names in a dropdown.
5. The evaluator selects one agent. Eval Tool stores its name and ID as the LiveKit target.
6. Existing RAG evaluation requests a fresh normal widget token using only the org ID and selected agent ID, joins the returned LiveKit room, sends each single-turn dataset question, receives the agent answer, and scores it using the existing control-model workflow.
7. If an agent does not allowlist `http://127.0.0.1:4173`, FlexAgent rejects its widget token request. Eval Tool displays that error and tells the evaluator to allowlist the origin in that agent's Embed settings.

## Security and expiry

- Never persist the evaluator's FlexAgent password.
- Keep the returned FlexAgent access token server-side only, encrypted using the existing local-secret mechanism.
- Do not return or render the access token in the browser.
- If agent listing returns an authorization failure, remove the expired stored token and show **Reconnect FlexAgent**. Preserve the API base URL, organization ID, and previous selected agent ID/name.
- The stored token must be used only for FlexAgent agent-list requests. The LiveKit token request continues without it, matching the existing widget flow.

## Scope

Included:

- Login form, encrypted local access-token storage, agent-name dropdown, selected-agent target setup, expiry/reconnect handling.
- Correct the normal widget-token request body to send only `orgId` and `agentId`.

Excluded:

- Persisting FlexAgent passwords.
- Tool-routing, tool-call history, tool handoff, agent simulations, or the discarded private evaluation-session feature.
- Synchronizing FlexAgent knowledge sources with Eval Tool; evaluators remain responsible for using the same document or website source/version in both systems.
- Production deployment.

## Acceptance checks

1. An evaluator can log in without the browser seeing an access token.
2. The agent picker shows only names and IDs from the selected organization.
3. Selecting Transit Planner causes the normal LiveKit request to use its known org ID and agent ID.
4. A successful single-turn RAG evaluation receives FlexAgent answers and produces the existing Eval Tool score/result.
5. An expired access token shows a reconnect state and does not require re-entering the API URL, organization ID, or agent selection.
6. Existing local-model and saved FlexAgent target flows continue to work.
