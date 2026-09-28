# FlexAgent Transit Planner tool-routing test report

Date: 25 September 2026  
Agent: Transit Planner by IT Curves  
Evidence source: FlexAgent History transcripts and the approved golden dataset.

## Purpose

Evaluate whether the agent selects the intended tool, sends appropriate arguments, executes the tool successfully, and gives a final reply grounded in the tool result.

## Scoring scope

The preliminary score includes these eight completed, valid cases:

- `TR-01` stop search
- `TR-02` route search
- `TR-05` missing route clarification
- `TR-06` no-tool capability question
- `TR-08` unsupported schedule-change request
- `TR-09` next departures by stop name
- `TR-10` last departure from a known stop
- `TR-16` no matching stop

Excluded from the score:

- Route 10 scenarios: live evidence was inconsistent and they need separate confirmation before becoming acceptance cases.
- `TR-07`: a real dashboard conversation cannot force an HTTP failure; this needs a fake tool in an automated test.
- `TR-14`: it ran in a conversation containing earlier stop lookups, so memory could change the expected tool-call order.

## Preliminary scores

| Measure | Score | Interpretation |
|---|---:|---|
| Tool routing | 93.75% (7.5/8) | The agent usually selected the right tool. `TR-10` received partial credit because it made the expected calls plus an extra fallback call. |
| Tool execution / task completion | 87.5% (7/8) | `TR-10` could not retrieve the requested schedule because path substitution failed. |
| Final-answer grounding | 100% (8/8) | Within the scored cases, the replies reflected the actual tool result or accurately said the data could not be retrieved. |
| Final-answer quality | 93.75% (7.5/8) | In `TR-16`, the agent correctly reported no match but did not ask for an alternative name or landmark. |

These are a preliminary baseline, not a platform-wide score. They apply only to the scoped completed cases above.

## Observed results

| Case | Trace summary | Outcome |
|---|---|---|
| `TR-01` | `stops_search(q="22nd Ave Transit Center", feed="BFT", limit=5)` returned `BFT:PA001`; reply named the returned stop and coordinates. | Pass |
| `TR-02` | `route_search(q="Queensgate", feed="BFT", limit=5)` returned routes and reply reflected them. | Pass |
| `TR-05` | No tool call; agent asked for a route number or name. | Pass |
| `TR-06` | No tool call; agent described its capabilities. | Pass |
| `TR-08` | No tool call; agent declined to modify a published schedule. | Pass |
| `TR-09` | `next_departures_by_stop_name(stop_name="22nd Ave Transit Center", count=3, feed="BFT")` returned departures; reply reflected them. | Pass |
| `TR-10` | `stops_search` returned `BFT:PA001`; `first_last_departure(stop_id="BFT:PA001")` failed; a `departures_for_date` fallback failed too. | Execution fail; error reply was appropriate |
| `TR-16` | `stops_search(q="Imaginary Station", feed="BFT")` returned an empty list; reply correctly reported no match. | Partial pass |

## Findings

### 1. Path-based HTTP tools fail to substitute URL placeholders

The model supplied the correct argument, for example:

```json
{"stop_id":"BFT:PA001"}
```

But the upstream API reported that it received the literal placeholder:

```text
invalid feed-scoped-id: {stop_id}
```

The same pattern was observed for `next_departures_by_stop_id` and `first_last_departure`. Earlier route-detail calls also returned an error containing literal `{short_name}`.

Impact: this can affect any user-created custom HTTP tool whose configured URL contains path placeholders, such as `/stops/{stop_id}`, `/routes/{short_name}`, or `/trips/{trip_id}/schedule`.

### 2. Error replies must not invent an explanation

In one earlier departure test, the API returned a 502 request failure, but the agent said that the requested route was unavailable. The tool error did not prove that transit fact.

Required behavior: when a tool returns an HTTP or API error, the agent should say it could not retrieve the requested information. It should only state a domain fact when the tool result explicitly supplies that fact.

### 3. Manual routing tests need a fresh conversation per case

When multiple questions were placed in one test conversation, the agent reused earlier stop information. For example, the trip-planning request searched only the destination because it already knew the origin from an earlier message.

Impact: the evaluator cannot fairly judge expected tool order or arguments in a reused conversation. Start a new Test Agent conversation for every dataset row.

### 4. Live manual testing cannot inject a tool error

Putting words such as "the search tool fails" in a user message does not make the real tool fail. It just runs the real API.

Impact: failure scenarios need mocked tools in the later automated LiveKit tests.

## Recommended platform fix

In the shared custom HTTP tool executor:

1. Replace every `{parameter_name}` in the configured URL with the matching tool argument before the HTTP request.
2. URL-encode the path value.
3. Do not append a consumed path parameter again as a query parameter.
4. Fail clearly before the request if a required path placeholder has no argument.
5. Preserve current behavior for standard query parameters and JSON request bodies.

Add shared regression tests for GET and POST tools with path parameters, path-plus-query parameters, missing path values, and URL-encoded values.

## Next evaluation steps

1. Developer deploys the shared path-parameter fix and standardizes tool-error handling.
2. Evaluator reruns the affected cases in new Test Agent conversations.
3. Evaluator checks full History traces: tool name, arguments, order, result/error, and final reply.
4. Developer converts verified cases into automated mocked tests.
