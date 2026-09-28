# 01 · FlexAgent evaluation boundary

## Outcome

FlexAgent has the private evaluation configuration, Bearer-token guard, and request validator required by the later answer endpoint.

## Scope

- Add one server-only evaluation service-token setting and document it in the local environment sample.
- Add Bearer-token authentication and request validation for `orgId`, `agentId`, and an 8,000-character maximum question.
- Keep these building blocks independent of public embed and LiveKit token flows.

## Done when

Missing/invalid credentials and malformed requests fail safely without leaking credentials. Task 03 wires these building blocks to the endpoint after Task 02 supplies answer generation.

## Depends on

None.

## TDD status

Complete. Added local Node tests for Bearer-token rejection and payload isolation. Verified with `node --test test/evaluation-auth.test.mjs` and syntax checks for the new configuration, authentication, and DTO modules.

## Implementation status

Complete. The local FlexAgent checkout now contains the environment setting, configuration field, constant-time Bearer-token guard, and strict allowlist DTO. Endpoint wiring remains intentionally deferred to Task 03 after Task 02 provides answer generation.
