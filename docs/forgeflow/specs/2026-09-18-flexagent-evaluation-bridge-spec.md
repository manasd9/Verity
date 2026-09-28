# FlexAgent evaluation bridge specification

## Purpose

Allow Eval Tool to evaluate a selected FlexAgent using approved golden-dataset questions. FlexAgent returns each answer using its configured model, prompt, and organization-scoped knowledge base. Eval Tool scores those answers with its existing control-model rubric.

## User journey

1. An administrator uploads a policy to Eval Tool, generates scenarios, reviews them, and approves the dataset.
2. The administrator selects a configured FlexAgent target and runs the approved dataset.
3. For each scenario, Eval Tool sends the exact customer question, FlexAgent organization ID, and FlexAgent agent ID to FlexAgent.
4. FlexAgent retrieves knowledge only from that agent's own organization-scoped knowledge base and returns one customer-facing text answer.
5. Eval Tool stores the answer and submits it with the existing expected answer and rubric to the selected control model.
6. Eval Tool displays the per-scenario verdict and overall score using its existing Results page.

## FlexAgent service contract

### Endpoint

`POST /v1/evaluation/answer`

This endpoint is private. It is not available to public embed visitors and does not mint a LiveKit token.

### Authentication

Require `Authorization: Bearer <evaluation-service-token>`. FlexAgent reads this dedicated service token from its server environment. It is distinct from end-user JWTs, LiveKit credentials, and model-provider keys.

### Request

```json
{
  "orgId": "FlexAgent organization ObjectId",
  "agentId": "FlexAgent agent ObjectId",
  "question": "Exact approved golden-dataset question"
}
```

Reject missing, malformed, or unauthorized input. Limit `question` to 8,000 characters.

### Response

```json
{
  "answer": "Customer-facing FlexAgent response",
  "requestId": "Trace identifier"
}
```

Return a non-success status with a safe error message when the organization or agent does not exist, the credential is invalid, or FlexAgent cannot produce an answer.

### Answer behavior

The endpoint must use the selected FlexAgent's persisted agent configuration, including its instructions, selected LLM settings, response settings, and `KnowledgeRetrievalService` with that agent's `orgId` and `agentId`. It must not accept or use policy text, expected answers, required points, forbidden points, or scoring information from Eval Tool.

The endpoint does not create a LiveKit room, join a WebSocket, use speech-to-text, or use text-to-speech. It returns the agent's text result only.

## Eval Tool changes

Add a FlexAgent target configuration with:

- FlexAgent API base URL;
- evaluation service token, encrypted with the existing local AES-256-GCM mechanism;
- FlexAgent organization ID; and
- FlexAgent agent ID.

When this target is selected, the evaluation runner calls `POST /v1/evaluation/answer` once per approved case. It sends only `orgId`, `agentId`, and `question`, then stores the returned `answer` alongside the existing case, verdict, and score.

The existing OpenAI target-model path keeps its current retrieval behavior. The FlexAgent path must not attach Eval Tool's retrieved chunks or `RETRIEVED POLICY SECTIONS` to the FlexAgent request.

## Boundaries

- Eval Tool remains the owner of golden datasets, evaluation records, and control-model scoring.
- FlexAgent remains the owner of policy content, knowledge retrieval, agent configuration, and answer generation.
- The policy used to produce a dataset must already be represented in the selected FlexAgent's knowledge base before an evaluation runs.
- A missing or unindexed FlexAgent knowledge base is an operator setup error, not a reason for Eval Tool to supply policy text.

## Security and data handling

- Never return the evaluation service token, provider API keys, LiveKit tokens, policy chunks, or internal prompts to Eval Tool's browser UI.
- Eval Tool stores its FlexAgent credential only in the existing encrypted local store.
- FlexAgent logs a request ID and identifiers needed for diagnosis, but not credentials or full policy content.
- Do not expose the endpoint through the public website embed or allow arbitrary unauthenticated callers.

## Acceptance criteria

- A valid protected request returns an answer from the selected FlexAgent.
- The answer comes from the selected agent's own configuration and organization-scoped retrieval.
- Eval Tool runs every approved case against FlexAgent, stores each returned answer, and produces its normal per-case and overall scores.
- Eval Tool sends no policy context or scoring data to FlexAgent.
- Invalid credentials, invalid IDs, and failed FlexAgent requests produce a clear evaluation failure without storing a fabricated answer.
- Existing OpenAI target evaluations continue to pass their current checks.

## Out of scope

- LiveKit WebSocket, room, voice, STT, TTS, or simulated-caller integration.
- Direct calls from Eval Tool to the FlexAgent LLM provider.
- Public access to the evaluation endpoint.
- Changes to FlexAgent's customer embed behavior.
