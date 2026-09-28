# 06 · Local integration verification

## Outcome

The two local applications complete one real staging-backed evaluation without modifying GitHub.

## Scope

- Configure the local Eval Tool connection with staging values supplied by the operator.
- Use a FlexAgent whose knowledge base already contains the dataset policy.
- Run an approved ten-scenario dataset and inspect every stored answer and verdict.
- Run one existing OpenAI target evaluation as a regression check.

## Done when

Both flows complete locally, results remain reviewable, and no credentials appear in browser responses, logs, or Git changes.

## Depends on

Tasks 03 and 05.

## Verification status

Focused local checks pass for Eval Tool and FlexAgent. The required staging-backed run is pending operator-provided staging configuration and a FlexAgent knowledge base that already contains the evaluated policy. No staging request has been made and no credentials have been stored in this workspace by this task.
