# 05 · Eval Tool evaluation dispatch

## Outcome

An approved Eval Tool dataset calls FlexAgent once per question, stores each returned answer, and uses the existing control-model scoring path.

## Scope

- Dispatch by target type in the evaluation runner.
- Send only FlexAgent organization ID, agent ID, and customer question.
- Do not send Eval Tool retrieval chunks, policy context, or rubric data to FlexAgent.
- Keep the existing OpenAI target path unchanged.
- Mark Eval Tool retrieval evidence unavailable for FlexAgent results.

## Done when

Failed FlexAgent calls show a clear evaluation failure and never create a fabricated answer or score.

## Depends on

Task 04.

## TDD status

Complete. `test.mjs` now defines the FlexAgent dispatch payload: only `orgId`, `agentId`, and the approved customer question may be sent to `/v1/evaluation/answer`. It currently fails as expected because the dispatch helper and evaluation-runner branch do not exist.

## Implementation status

Complete. FlexAgent targets use the private answer endpoint once per approved case, then the existing control-model scoring flow evaluates that returned text. A failed FlexAgent request stops the run before any evaluation record is saved. OpenAI targets retain their existing local retrieval path; FlexAgent results identify their retrieval evidence as unavailable in Eval Tool.
