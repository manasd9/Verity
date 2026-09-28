# FlexAgent tool-routing golden dataset

Agent: `Transit Planner by IT Curves` (`6ab3f456a31dd1e01a89ef33`)  
Organization: `AI Dev Lab` (`6aa1562861347fe1a3087d63`)  
Status: baseline run recorded for the original eight questions; expanded cases are ready for manual testing.

## How to use this sheet

For a manual run, use the FlexAgent History transcript. For each case, record every tool call, its arguments, its result or error, and the final agent reply. A manual test checks the live system; its reply must reflect the live result, not the mock text below. The mock result is for a later automated test, where the external HTTP tool is replaced with a fake.

`feed="BFT"` is intentionally supplied where the tool accepts it, to avoid cross-region matches. Values written as `<...>` come from an earlier tool result in the same turn; do not invent them.

| ID | Type | User message / scenario | Expected tool calls, in order | Expected arguments | Mock tool result | Expected final behavior | Result |
|---|---|---|---|---|---|---|---|
| `TR-01-stop-search` | Manual + automated | "Find the 22nd Ave Transit Center stop in BFT." | `stops_search` | `q="22nd Ave Transit Center"`, `feed="BFT"` | One match: `BFT:PA001`, 22nd Ave Transit Center. | Identifies the stop and ID; does not invent departures. | Pass (manual) |
| `TR-02-route-search` | Manual + automated | "Which BFT routes serve Queensgate?" | `route_search` | `q="Queensgate"`, `feed="BFT"` | Queensgate Transit Center is served by `27X`, `123`, `123s`, `170`, and `10`. | Lists routes from the result; does not provide an unrequested timetable. | Pass (manual) |
| `TR-03-route-detail` | Manual + automated | "What stops does BFT Route 10 serve?" | `route_detail` | `short_name="10"`, `feed="BFT"` | Route 10 returns its stops by direction. | Lists only stops returned by the tool; does not claim departure times. | Pending |
| `TR-04-next-departure-realistic` | Manual + automated | "When is the next Route 10 bus from 22nd Ave Transit Center?" | `stops_search` -> `next_departures_by_stop_id` | First: `q="22nd Ave Transit Center"`, `feed="BFT"`. Then: `stop_id="<ID returned by stops_search>"`, `route="10"`. | The stop lookup returns `BFT:PA001`; the departure tool returns Route 10's next departure. | States the returned Route 10 departure and whether it is scheduled or live; does not guess after an error. | Pending |
| `TR-05-missing-route` | Manual + automated | "What stops does the route serve?" | No tool call | None | None | Asks for the route number or name. | Pass (manual) |
| `TR-06-no-tool` | Manual + automated | "Hi, what can you help me with?" | No tool call | None | None | Briefly explains the available transit help without fabricating live data. | Pass (manual) |
| `TR-07-tool-error` | Automated only | "Find the 22nd Ave Transit Center stop in BFT." The fake search tool fails. | `stops_search` | `q="22nd Ave Transit Center"`, `feed="BFT"` | `ERROR: transit stop search unavailable.` | Says it cannot retrieve stop data now; does not claim a current stop result. | Pending - requires fake tool |
| `TR-08-unsupported-action` | Manual + automated | "Change Route 10's published schedule so it leaves earlier." | No tool call | None | None | States it cannot modify published schedules; may offer to look up the current schedule. | Pass (manual) |
| `TR-09-next-departure-by-name` | Manual + automated | "What is the next bus from 22nd Ave Transit Center in BFT?" | `next_departures_by_stop_name` | `stop_name="22nd Ave Transit Center"`, `feed="BFT"` | Next departures for the named stop. | Reports only departures returned by the tool. | Pending |
| `TR-10-last-departure` | Manual + automated | "When is the last bus tonight from 22nd Ave Transit Center?" | `stops_search` -> `first_last_departure` | First: `q="22nd Ave Transit Center"`, `feed="BFT"`. Then: `stop_id="<ID returned by stops_search>"`; omit `date` for today. | The first/last tool returns the last scheduled departure for the stop. | States the last departure from the returned data and makes clear it is scheduled unless the result says otherwise. | Pending |
| `TR-11-route-timetable` | Manual + automated | "Show me BFT Route 10's timetable for today." | `route_schedule` | `short_name="10"`, `feed="BFT"`; omit `date` for today. | Route 10's timetable by direction. | Provides the returned timetable or a concise summary, not merely its stop list. | Pending |
| `TR-12-live-vehicle` | Manual + automated | "Where is BFT Route 10 right now?" | `vehicles` | `route="10"`, `feed="BFT"` | Current Route 10 vehicle locations, or an empty list. | Reports locations only if returned; if none, says live location data is unavailable. | Pending |
| `TR-13-service-alert` | Manual + automated | "Are there any service alerts for Route 10?" | `alerts` | `route="10"` | Active alerts for Route 10, or an empty list. | Lists active alerts, or clearly says none were returned. | Pending |
| `TR-14-trip-plan` | Manual + automated | "What is the fastest transit trip from 22nd Ave Transit Center to Queensgate Transit Center?" | `stops_search` -> `stops_search` -> `plan_transit_trip` | Search each named place with `feed="BFT"`. Then send `origin_lat`, `origin_lon`, `destination_lat`, and `destination_lon` from the selected stop results. | One or more itineraries with duration, legs, and transfers. | Summarizes the best returned itinerary; does not invent routes, times, or transfers. | Pending |
| `TR-15-missing-date` | Manual + automated | "If I take Route 10 from 22nd Ave Transit Center to Queensgate, will I arrive by 9 AM?" | No tool call yet | None | None | Asks which date the user means before checking a time-dependent trip. | Pending |
| `TR-16-no-match` | Manual + automated | "Find Imaginary Station in BFT." | `stops_search` | `q="Imaginary Station"`, `feed="BFT"` | Empty stop list. | Says it could not find a matching stop and asks for another name or nearby landmark. | Pending |

## Baseline manual run: 25 September 2026

The original eight questions were run in the FlexAgent History transcript. These are observations, not mocked tests.

| Original case | Observed trace | Outcome |
|---|---|---|
| `TR-01` | `stops_search(q="22nd Ave Transit Center", feed="BFT", limit=5)` returned `BFT:PA001`; reply accurately named the stop and coordinates. | Pass |
| `TR-02` | `route_search(q="Queensgate", feed="BFT", limit=5)` returned Queensgate routes `27X`, `123`, `123s`, `170`, and `10`; reply reflected them. | Pass |
| Original Route 1 detail question | `route_detail(short_name="1", feed="BFT")` returned 404 `Unknown route`; reply correctly reported that Route 1 does not exist. This was replaced by current `TR-03` because Route 10 is a valid BFT route. | Historical observation |
| Original raw-ID departure question | `next_departures_by_stop_id(stop_id="BFT:PA001", route="1", count=2)` returned 502 with `invalid feed-scoped-id: {stop_id}`. The reply incorrectly turned that system error into a Route 1-not-found answer. This was replaced by current `TR-04`, which is a realistic user request and should expose the same path-substitution defect if it remains. | Fail - execution and error handling |
| `TR-05` | No tool call; agent asked for a route number or name. | Pass |
| `TR-06` | No tool call; agent described available transit assistance. | Pass |
| Original manual attempt at `TR-07` | The live search tool succeeded. A real dashboard session cannot force the desired error response. | Not executed as an error test |
| `TR-08` | No tool call; agent declined to modify a published schedule. | Pass |

## Notes for the developer

- `next_departures_by_stop_id` received the right model arguments but the upstream error included literal `{stop_id}`. Verify path-parameter replacement in the HTTP tool executor before treating `TR-04` or `TR-10` as stable.
- A manual History run verifies the live agent's trace. The later LiveKit unit test must fake tool outputs so `TR-07` and exact response grounding are repeatable.
