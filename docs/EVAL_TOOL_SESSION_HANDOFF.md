# Eval Tool handoff — 28 September 2026

## Purpose and ownership

Eval Tool is now **RAG/document-following evaluation only**. It is not the home for LiveKit tool-routing tests or Agent Simulations.

- Eval Tool: evaluator-owned document upload, golden-dataset creation/review, end-to-end FlexAgent widget testing, answer scoring, and reports.
- FlexAgent repository: LiveKit unit tests for exact tool calls/arguments/errors/handoffs, plus later Agent Simulations for multi-turn behavior.

Do not add tool-routing assertions, evaluator participants, or tool traces to Eval Tool unless the user explicitly changes this decision.

## Current Eval Tool implementation

The normal local target-model flow is unchanged. A FlexAgent target can use either:

- `Private evaluation API`: existing private FlexAgent answer endpoint.
- `LiveKit widget path`: RAG-only external/widget test path.

The LiveKit widget path:

1. Eval Tool server requests FlexAgent's existing `POST /v1/livekit/token` endpoint with `orgId`, `agentId`, and `parentOrigin`.
2. Browser joins the returned room as one normal widget visitor.
3. It sends each question on `lk.chat`.
4. It collects the final answer from `lk.transcription`.
5. Eval Tool's control model scores the answer against the approved RAG golden dataset.

There is no custom FlexAgent deployment dependency for this path. The FlexAgent team must whitelist the exact Eval Tool origin, normally:

```text
http://127.0.0.1:4173
```

The same source document/version must be uploaded and indexed in FlexAgent separately. Eval Tool does not sync documents to FlexAgent.

## Important files

- `server.js`: FlexAgent target save route, normal widget-token proxy, and RAG evaluation scoring.
- `app.js`: Settings UI and one-room LiveKit widget answer collection.
- `test.mjs`: local regression checks.
- `docs/FLEXAGENT_TOOL_ROUTING_GOLDEN_DATASET_DRAFT.md`: evaluator-owned Transit Planner tool-routing cases; do not use this for current Eval Tool RAG work.
- `docs/FLEXAGENT_TRANSIT_PLANNER_TOOL_ROUTING_TEST_REPORT.md`: manual Transit Planner baseline and known HTTP path-placeholder defect.

## Verification and local startup

Run:

```powershell
npm test
node --check server.js
node --check app.js
npm start
```

Open:

```text
http://127.0.0.1:4173/#settings
```

To configure a FlexAgent RAG target, select `LiveKit widget path`, provide the FlexAgent API base URL, org ID, agent ID, and the whitelisted Eval Tool origin. The service-token field is not used for widget mode.

## Do not revive/deploy the discarded FlexAgent trace work

A separate local `matp-backend-staging` checkout contains uncommitted/untracked experimental files for `/v1/livekit/evaluation-session`, an evaluator participant, and private tool traces. The user decided not to deploy or use that work because tool routing will be tested natively inside FlexAgent instead.

Leave that FlexAgent working tree untouched unless the user explicitly requests otherwise.

## FlexAgent testing context (for reference only)

The user owns LiveKit unit-test and Agent Simulation work in FlexAgent.

- Unit tests are feasible with the installed LiveKit Agents API and Node's built-in `node:test`; they should use the existing tool-routing draft as the source of truth.
- Agent Simulations are not ready: the installed `@livekit/agents` tree was reported as `1.5.0` while the lockfile resolves `1.9.0`; LiveKit simulations require Node Agents `1.6+`, the LiveKit CLI, a Cloud project, and later fixture-specific worker wiring.
- First intended unit cases: `TR-01-stop-search` and `TR-05-missing-route`.
- The known `{stop_id}` / `{short_name}` path-placeholder bug belongs in a direct HTTP-tool-executor regression test, not Eval Tool.

## Safety and status

- Never ask the user to paste bearer tokens, API keys, or `.env` values into chat.
- Do not deploy FlexAgent changes without the required approval.
- Existing FlexAgent IDs seen in earlier investigation refer to different agents; do not assume an ID. Ask the user which configured FlexAgent agent should be evaluated.
