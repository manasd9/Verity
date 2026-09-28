# FlexAgent tool-routing evaluation brief

## Goal

Make tool-routing checks repeatable for developer-built and user-created FlexAgent agents.

## Agreed design

- Use a golden tool-routing dataset as the readable source of truth.
- Convert approved rows into LiveKit tests in the FlexAgent repository.
- Use fake tool outputs and require an exact expected event trace.
- Evaluate production agents per agent version using their configured-tool contracts.
- Do not call real write-capable customer tools during evaluation.

## Success criteria

- A stable golden row becomes one executable LiveKit test.
- Extra or incorrect tool calls fail automatically.
- A new customer agent can be evaluated after its tool contracts are supplied.

## Out of scope

- Replacing RAG evaluation.
- Voice-specific evaluation before text routing is stable.
