# Handoff: tool-routing & tool-calling evaluation for FlexAgent

You are working in the FlexAgent backend. The goal is to build a way to check that FlexAgent agents **pick the right tool, send it the right arguments, and answer from what the tool returned**. This was planned in a separate Eval Tool session; this brief contains everything decided there.

**Start by investigating and proposing a plan. Do not write code until the user approves it.**

## 1. Background

- FlexAgent is a multi-tenant platform. Clients create agents and add their own tools, which are HTTP API tools.
- The first agent to evaluate is **Transit Planner by IT Curves**:
  - agent ID `6ab3f456a31dd1e01a89ef33`
  - org **AI Dev Lab**, ID `6aa1562861347fe1a3087d63`
  - Confirm with the user that this is still the right agent before using it.
- A separate app, **Eval Tool (Verity)**, at `C:\Users\mdani\Documents\Eval Tool`, already checks FlexAgent's document (RAG) answers. It talks to FlexAgent through the LiveKit widget and sees only the final reply text, never tool calls.
- **Decision: tool evaluation lives in FlexAgent, not in Eval Tool.** LiveKit's testing tools must run next to the agent's own code (factory, toolsets, LLM setup), which Eval Tool can't reach. Eval Tool stays RAG-only.
- The long-term plan is a "Test your agent" feature in the FlexAgent platform, where clients write test cases for their own agents and tools and see the results.

## 2. LiveKit's testing docs (read these first)

- Overview: https://docs.livekit.io/testing/overview/
- CLI Agent Debugger: https://docs.livekit.io/testing/debugger/
- Debugger command reference and JSON format: https://docs.livekit.io/reference/developer-tools/livekit-cli/debugger/
- Unit tests: https://docs.livekit.io/testing/unit-tests/
- Agent Console: https://docs.livekit.io/testing/agent-console/
- Agent Simulations (later, not now): https://docs.livekit.io/testing/simulations/

Summary of the three options:

| Option | What it is | Verdict |
|---|---|---|
| Agent Console | A person types to the agent in a browser and watches tool calls | Skip for tool checks. It is manual; keep it for voice checks later. |
| **CLI Agent Debugger** (`lk agent debugger`, CLI ≥ v2.18.8) | Runs the agent locally in text mode with no room. A script or Claude sends turns. `say --json` returns ordered `tool_call` events (`name`, `arguments` as a JSON string, `output`, `is_error`) plus `reply`. | **Do first.** It is fast and uses real tools. |
| **Unit tests** (`voice.testing` in Node: `session.run`, `result.expect`, `isFunctionCall`, `isFunctionCallOutput`, `noMoreEvents`, `judge`, mock tools) | Runs inside the test process with tools replaced by fakes | **Do second.** It is deterministic, can test tool errors, suits CI, and is the basis for the client feature. |

## 3. What we found about FlexAgent (from a read-only look — verify it)

- **Which checkout:** the only copy with database-backed client tools is `C:\Users\mdani\Documents\MATP\matp-backend-staging`. Other copies are `C:\Users\mdani\Documents\Flex Agent\matp-backend-main` and `...\Flex Agent\matp-backend`. **Ask the user which repo and branch is the real source.**
- **Language and LiveKit version:** it is Node ESM using `@livekit/agents`. `package.json` declares `^1.7.0`, but **1.5.0 is installed** in MATP staging. Check the version before relying on the debugger or `voice.testing`.
- **Agents and tools are database config, not code:**
  - `src/packages/factories/lk-agent.mjs` has `build({agent, prompt, tools})`, which calls `voice.Agent.create(...)`.
  - Client tools are `api_request` records: `name`, `description`, `parameters` (JSON Schema), and `config{url, method, headers, queryParams, body, timeoutMs}`.
  - They are turned into tools in `src/packages/toolsets/http-request.mjs`. For GET, arguments become query parameters; otherwise they go into the JSON body.
  - `resolveTools` in `src/apps/lk-worker/lib/service.mjs` loads each agent's tools.
  - Built-in tools: `search_knowledge` (Weaviate), `get_current_datetime`, and end-call.
- **One agent per room.** There are no handoffs or router agents, so "routing" means choosing the tool.
- **The worker gets the org and agent from the room name** (`room_<orgId>_<agentId>_<phone>_<hash>`, via `parseRoomName`). It then waits for a widget participant (`src/packages/handlers/voice-agent.mjs`) and greets the user.
- **Tool calls are already saved:** at shutdown, `Conversation.createFromSessionReport` stores ToolCallRequest/Response (`domains/entities/conversation.mjs`). That is where the History page gets its data.
- **No existing tests** use LiveKit test helpers, and `package.json` has no `test` script.
- **Do not touch** the uncommitted experimental work in `matp-backend-staging`:
  - `routes/livekit/evaluation-session.mjs`
  - `utilities/tool-trace.mjs`
  - the evaluator-participant changes

  The user decided not to use it. Start from a fresh branch off the committed upstream branch.

## 4. The plan

### Phase 0: checks before any code
1. Confirm the repo, branch and agent with the user.
2. Resolve the `@livekit/agents` version, and confirm that the debugger and `voice.testing` work with the Node version in use.
3. Work out how to run a **single chosen agent in text mode** without a room. For example, a debug mode that reads `FLEXAGENT_DEBUG_ORG_ID` / `FLEXAGENT_DEBUG_AGENT_ID`, skips `waitForWidgetParticipant` and room connection, and possibly skips the greeting.
4. Check what can break or add noise in text mode, and propose how to handle each:
   - `utilities/status-update.mjs` filler speech (it would add extra message events);
   - `getJobContext()` usage;
   - the end-call tool.
5. Check whether `isFunctionCall({arguments})` requires exact equality. The model may add optional arguments such as `limit=5`.

### Phase 1a: CLI Debugger, used two ways (the user chose both)
- **Claude as the user.** Use `lk agent debugger start / say / logs / chat-history / restart / stop` to chat like a customer, try different wordings, and find the root causes of failures.
- **A script as the user.** Loop over the golden cases:
  1. `say --json` for each turn;
  2. compare the tool-call events with the expected result;
  3. `restart` between cases;
  4. write a pass/fail report (JSON and markdown).

  Every new bug found while exploring becomes a new case.
- Tools run live here. That is acceptable only because the Transit Planner tools are read-only GETs.
- Credentials stay in FlexAgent's own `.env`. Never ask the user to paste keys or tokens into chat.

### Phase 1b: unit tests with fake tools (`node:test`)
- Write **one generic, data-driven runner, not a hand-written test per case**. It:
  1. loads the agent, its latest prompt and its enabled tools, or a snapshot of them;
  2. builds the agent with the same `lk-agent.mjs` factory;
  3. creates `voice.AgentSession({ llm })` and calls `session.start({ agent })` with no room;
  4. runs each case from a case file;
  5. asserts the results and outputs structured results.
- **Fake the HTTP layer inside `http-request.mjs`, not the tool's `execute`.** The real code then still builds the URL and body, so you can assert the outgoing request. That is what catches the placeholder bug. `withMockTools(AgentClass, …)` may not work with `voice.Agent.create(...)` instances, so verify before using it.
- Fake `search_knowledge` too.
- Run each case N times (for example 5) and report a pass rate, because LLMs are not deterministic.

### Phase 2: cases for new client agents
Tool records currently have no mock result or example request. For now, keep these in a per-agent case file.

Optional: an LLM drafts cases from each tool's `description` and `parameters`, and a human approves them before they count.

### Phase 3: client feature
- Store cases and runs in MongoDB, keyed by org, agent and agent version (prompt version plus a hash of the tool set).
- Add `POST /v1/evaluation/tool-routing/run`, protected by `ProtectRoute` and `EnforceOrgAccess`, running as an async job on BullMQ.
- Add a "Test your agent" dashboard tab; the frontend lives in another repo.
- Rerun when an agent's prompt or tools change.

### Later
Agent Simulations (needs LiveKit Cloud and Node Agents 1.6+), voice testing, and scoring production conversations from the stored tool-call records.

## 5. What each case checks

1. **Right tool**, or correctly no tool: asks for missing information instead of guessing.
2. **Right arguments.** Match each argument with one of these rules:
   - `exact`;
   - `subset` (ignore extra optional arguments);
   - `normalized` (case and whitespace);
   - `fromPrevious` (for example, `stop_id` must be the ID the previous tool returned);
   - `judge` (semantic).
3. **Right order** when several tools are chained.
4. **No unexpected extra calls.**
5. **Well-formed outgoing HTTP request.**
6. **Tool errors handled** without inventing results.
7. **Final reply grounded** in the tool output (LLM judge).
8. **Stable** across repeated runs; also report latency and cost per case.

## 6. Test cases and known issues

- Golden cases (16, TR-01 to TR-16), each with the expected tools, arguments, mock results and final behavior:
  `C:\Users\mdani\Documents\Eval Tool\docs\FLEXAGENT_TOOL_ROUTING_GOLDEN_DATASET_DRAFT.md`
- Manual baseline report (routing 93.75%, execution 87.5%):
  `C:\Users\mdani\Documents\Eval Tool\docs\FLEXAGENT_TRANSIT_PLANNER_TOOL_ROUTING_TEST_REPORT.md`
- Original evaluation plan: `C:\Users\mdani\Documents\Eval Tool\FLEXAGENT_EVALUATION_PLAN.md`
- Transit tools: `stops_search`, `route_search`, `route_detail`, `next_departures_by_stop_id`, `next_departures_by_stop_name`, `first_last_departure`, `route_schedule`, `vehicles`, `alerts`, `plan_transit_trip`.
- **Known bug:** `next_departures_by_stop_id` sent a literal `{stop_id}` in the URL (upstream 502), so path placeholders are not substituted. Add a direct regression test for the HTTP tool executor. TR-04 and TR-10 depend on it.
- Suggested first cases: **TR-01** (stop search) and **TR-05** (missing route, so no tool call). Then the rest.
- Treat those Eval Tool files as read-only references. Do not edit the Eval Tool repo.

## 7. Rules

- Don't deploy anything, and don't push to shared branches, without the user's approval.
- Don't touch the uncommitted experiment in `matp-backend-staging`.
- Never ask for secrets in chat.
- Tests must never change real customer data. Tools that write data must be faked.

## 8. Done for Phase 1a / 1b

- **Phase 1a:** the debugger script runs all 16 cases on Transit Planner and produces a pass/fail report. The `{stop_id}` bug shows up in TR-04.
- **Phase 1b:** these unit tests pass reliably over 5 runs:
  - TR-01, TR-02, TR-05, TR-06 and TR-08;
  - TR-07, with a forced tool error, which checks that the reply doesn't invent data.

  A deliberately broken tool description lowers the pass rate, which shows the tests catch regressions.
