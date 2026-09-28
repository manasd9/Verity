# FlexAgent evaluation bridge implementation plan

## Goal

Let Eval Tool send every approved golden-dataset question to one configured FlexAgent, receive the text answer generated with that FlexAgent's own retrieval, and score it through Eval Tool's existing control-model workflow.

## Preconditions and risks

- The chosen policy must already be indexed in the selected FlexAgent's organization-scoped knowledge base.
- An operator needs the FlexAgent staging API base URL, a generated evaluation service token, organization ID, and agent ID.
- The two repositories remain separate. No code, dependency, or Git history is copied between them.
- The direct evaluation path intentionally excludes LiveKit room, audio, and transport behavior. It tests the configured agent answer and knowledge retrieval.
- FlexAgent must use the same persisted agent configuration and retrieval service as its customer agent. A separate prompt or a request-supplied policy context would invalidate the result.

## Ordered steps

### 1. Add the private FlexAgent evaluation boundary

- Purpose: Define an authenticated server-to-server endpoint without exposing it to the public embed or LiveKit layer.
- Areas affected: FlexAgent API configuration, environment sample, request validation, route controller, and API error handling.
- API: `POST /v1/evaluation/answer` with Bearer service-token authentication and `{ orgId, agentId, question }` request body.
- Dependencies: FlexAgent's existing API service route auto-loader and exception conventions.
- Verification: Request validation rejects a missing/invalid service token, malformed identifiers, missing question, and a question longer than 8,000 characters.

### 2. Build the FlexAgent text-answer use case

- Purpose: Produce one answer using the selected agent's saved prompt, LLM settings, response settings, and organization-scoped `KnowledgeRetrievalService`.
- Areas affected: FlexAgent agent lookup, LLM factory, knowledge retrieval service/tooling, and a new focused evaluation-answer use case.
- Behavior: Fetch the agent by `orgId` and `agentId`, retrieve only that agent's relevant knowledge, generate one text answer, and return it with a request ID. Do not create a LiveKit room or use STT/TTS.
- Dependencies: Step 1 supplies the trusted input boundary; existing agent, vector, and LLM abstractions supply configuration and retrieval.
- Verification: A fixture or stubbed use-case test proves the selected IDs reach retrieval, unknown agents fail safely, and request-supplied policy/rubric fields cannot affect the answer.

### 3. Expose and test the FlexAgent endpoint

- Purpose: Wire the controller to the use case and preserve safe observability.
- Areas affected: FlexAgent evaluation route, response mapper, logging, and tests.
- Behavior: Return `{ answer, requestId }`; log identifiers and request ID only. Map known failures to safe client messages and leave unexpected details server-side.
- Dependencies: Steps 1 and 2.
- Verification: An endpoint-level test covers a successful answer, unauthorized request, invalid agent, and upstream answer failure.

### 4. Add a FlexAgent target configuration to Eval Tool

- Purpose: Store exactly the details needed to call one FlexAgent without exposing its service credential to the browser.
- Areas affected: Eval Tool `server.js`, `app.js`, local store connection representation, and Settings UI.
- Data: target kind `flexagent`, API base URL, encrypted evaluation service token, FlexAgent organization ID, and FlexAgent agent ID. Public state excludes the token.
- Dependencies: The FlexAgent endpoint contract from steps 1 through 3.
- Verification: Eval Tool accepts only valid HTTPS/HTTP base URLs and non-empty IDs/token, encrypts the token with its existing AES-256-GCM helper, and omits it from `/api/state`.

### 5. Dispatch FlexAgent evaluations without Eval Tool retrieval context

- Purpose: Reuse Eval Tool's dataset loop and control-model scoring while calling FlexAgent for answers.
- Areas affected: Eval Tool evaluation runner and target-answer helper in `server.js`.
- Behavior: For an OpenAI target, preserve the current retrieval-and-prompt path. For a FlexAgent target, call `/v1/evaluation/answer` once per approved case with only the FlexAgent IDs and case question. Store the returned answer, then run the existing control-model verdict request.
- Dependencies: Steps 3 and 4.
- Verification: A mocked FlexAgent response proves all approved questions are sent in order, no `RETRIEVED POLICY SECTIONS` or rubric data appears in the FlexAgent payload, and a failed FlexAgent call ends the evaluation with a clear error instead of a fabricated answer.

### 6. Make the Eval Tool result and setup flow clear

- Purpose: Let an administrator select FlexAgent intentionally and understand what results represent.
- Areas affected: Eval Tool Settings, evaluation target selector, and Results retrieval-evidence affordance.
- Behavior: Identify the target as FlexAgent and display its configured agent/org reference. FlexAgent results show the returned answer and verdict. The Eval Tool retrieval-evidence control is hidden or marked unavailable for FlexAgent results because FlexAgent owns and does not disclose its retrieval chunks.
- Dependencies: Steps 4 and 5.
- Verification: Manual browser check confirms token fields never render after saving, FlexAgent can be selected for evaluation, and the Results page remains readable without Eval Tool retrieval evidence.

### 7. Verify both paths and document staging setup

- Purpose: Prove the bridge works without regressing the current OpenAI target workflow.
- Areas affected: Both repositories' focused tests and local operator documentation.
- Behavior: Use a known FlexAgent whose knowledge base contains the same policy used for the approved Eval Tool dataset. Run one full FlexAgent evaluation and one existing OpenAI target evaluation.
- Dependencies: Steps 1 through 6 and valid staging configuration.
- Verification: Run each repository's existing checks plus focused endpoint/dispatch tests. Confirm each case has a stored answer and verdict, the overall score is computed, and neither repository exposes the service token.

## Test strategy

- FlexAgent: unit tests for token authentication, DTO validation, agent/retrieval selection, and answer failure mapping; an endpoint integration test with provider calls mocked.
- Eval Tool: focused tests for encrypted FlexAgent connection storage, target dispatch, payload isolation, failed calls, and preserved OpenAI behavior.
- Manual staging: a ten-scenario approved dataset against one FlexAgent with the matching knowledge base, followed by an ordinary OpenAI target run.

## Rollout or migration notes

- Add the FlexAgent service token to staging environment configuration before enabling the Eval Tool connection.
- No data migration is required. Existing Eval Tool connections and evaluations remain valid.
- Disable the FlexAgent target by removing its local Eval Tool connection or rotating the FlexAgent service token. No public endpoint or customer embed behavior changes.
