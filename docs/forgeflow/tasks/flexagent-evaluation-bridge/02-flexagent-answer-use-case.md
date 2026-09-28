# 02 · FlexAgent answer use case

## Outcome

FlexAgent produces one text answer from the selected agent's saved configuration and organization-scoped knowledge base.

## Scope

- Load the selected organization and agent.
- Use FlexAgent's existing LLM configuration and `KnowledgeRetrievalService` for that exact agent.
- Return only the customer-facing answer and a trace ID.
- Do not create LiveKit rooms or use audio components.

## Done when

The use case cannot receive policy text, rubrics, expected answers, or other scoring data from Eval Tool.

## Depends on

Task 01.

## TDD status

Complete. `test/evaluation-answer.test.mjs` defines the public answer-path behavior: load the requested organization and agent, retrieve only that agent's scoped knowledge, use its saved LLM settings, and return answer text with a trace ID. It currently fails as expected because the use case has not been implemented.

## Implementation status

Complete. `src/packages/use-cases/evaluation-answer.mjs` uses the selected FlexAgent's persisted configuration, `KnowledgeRetrievalService`, and LLM factory. It does not create a LiveKit room or accept Eval Tool policy or scoring data.
