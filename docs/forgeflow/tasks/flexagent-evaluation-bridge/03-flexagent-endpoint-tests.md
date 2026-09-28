# 03 · FlexAgent endpoint tests

## Outcome

The private FlexAgent answer endpoint has focused coverage for its security and failure behavior.

## Scope

- Test successful request/response mapping.
- Test invalid service token, malformed IDs, oversized question, unknown agent, and answer-generation failure.
- Assert logs and responses omit secrets and policy content.

## Done when

The endpoint contract is stable enough for Eval Tool to call.

## Depends on

Tasks 01 and 02.

## TDD status

Complete. `test/evaluation-endpoint.test.mjs` defines the protected endpoint contract: valid requests return only answer text and a trace ID; invalid credentials, malformed IDs, and oversized questions are rejected; unexpected generation failures have a safe response. It currently fails as expected because the endpoint route has not been implemented.

## Implementation status

Complete. The local FlexAgent API now exposes only `POST /v1/evaluation/answer`, protects it with the dedicated service token, and wires the answer use case to FlexAgent's own retrieval and model configuration. No public embed, LiveKit room, or WebSocket route was added.
