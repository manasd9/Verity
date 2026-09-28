# 04 · Eval Tool FlexAgent target

## Outcome

Eval Tool can locally store and select a FlexAgent target without exposing its service token.

## Scope

- Add the FlexAgent target fields: base URL, encrypted service token, organization ID, and agent ID.
- Extend Settings and evaluation target selection.
- Preserve current OpenAI target and control-model configuration.

## Done when

`/api/state` omits the service token and the browser can select the configured FlexAgent target.

## Depends on

FlexAgent endpoint contract from Task 03.

## TDD status

Complete. `test.mjs` now defines the local FlexAgent target record and UI contract: a dedicated target route, settings form, evaluation selection, and a public-state record that omits the encrypted service token. It currently fails as expected because the target route and form have not been implemented.

## Implementation status

Complete. Eval Tool saves FlexAgent API URL, organization ID, agent ID, and the encrypted service token as a local target connection. `/api/state` omits the token through the existing public connection mapper. The target appears in evaluation selection while the OpenAI customer-chat path remains unchanged.
