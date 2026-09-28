# FlexAgent evaluation plan

## Goal

Evaluate FlexAgent in two separate areas:

1. Does it answer from the correct documents? (RAG)
2. Does it choose the correct tool and pass the correct information to it? (tool routing)

## Step 1 — Finish the RAG evaluation

**Owner:** Eval Tool evaluator

1. Generate a golden dataset in Eval Tool from the relevant document.
2. Ask each question in FlexAgent.
3. Paste FlexAgent's answer into Eval Tool.
4. Record the score for each answer and the overall score.

**Result:** A baseline showing how well FlexAgent answers questions from its knowledge base.

## Step 2 — Get the tool list

**Owner:** FlexAgent developer provides it; evaluator reviews it.

Ask for a list of every tool available to FlexAgent. For every tool, capture:

| Tool name | What it does | When it should be used | Required information |
|---|---|---|---|
| `example_tool` | Brief purpose | Example user request | Required fields |

**Result:** A clear definition of what “correct tool routing” means.

## Step 3 — Create a small tool-routing test sheet

**Owner:** Eval Tool evaluator

Create a spreadsheet or Markdown table with 5–10 important user requests. Each row is a pass/fail test case.

| User message | Expected tool order | Expected information sent | Expected final behavior | Result |
|---|---|---|---|---|
| “Cancel booking AB123” | `lookup_booking` → `cancel_booking` | `booking_id: AB123` | Confirms only after cancellation succeeds | |
| “Cancel my booking” | No action tool yet | None | Asks for booking number | |

Include cases for:

- one normal request per important tool;
- a request missing required information;
- a request that must not use a tool;
- a tool failure; and
- an unsafe or unauthorized request.

**Result:** The tool-routing equivalent of a golden dataset.

## Step 4 — Run the cases manually in LiveKit Agent Console

**Owner:** Eval Tool evaluator

1. Start FlexAgent in development mode.
2. Open LiveKit Agent Console.
3. Enter one test-sheet user message at a time.
4. In the Console Events pane, record:
   - tool name called;
   - arguments sent to the tool;
   - order of tool calls;
   - tool result or error; and
   - final FlexAgent response.
5. Mark each case **Pass** or **Fail**.

**Pass** means the correct tool(s) were called, in the correct order, with the correct information, and the final response matches the tool result.

**Result:** A manual evaluation report with reproducible failures.

## Step 5 — Send failures to the FlexAgent developer and retest

**Owner:** Evaluator reports; FlexAgent developer fixes.

Use this exact format for every failure:

```text
Test case: Cancel booking AB123
Expected: lookup_booking(booking_id=AB123) → cancel_booking(booking_id=AB123)
Actual: cancel_booking(booking_id=AB123) only
Result: Fail
```

After the developer changes the prompt, tool descriptions, or routing logic, repeat the same case in Agent Console.

**Result:** Confirmed fixes, rather than one-off manual observations.

## Step 6 — Turn stable cases into automated LiveKit tests

**Owner:** FlexAgent developer; evaluator supplies the approved test sheet.

For each approved manual case, add a LiveKit behavioral test in the FlexAgent repository. The test must:

1. Send the fixed user message to FlexAgent.
2. Assert the exact tool name and required arguments.
3. Assert the expected order when multiple tools are needed.
4. Use fake tools, so tests never change real customer data.
5. Assert that the final reply reflects the fake tool result.

Run these tests on every FlexAgent change. A test failure means tool routing has regressed.

**Result:** Tool-routing evaluation becomes automatic and repeatable.

## Tool-routing golden dataset and LiveKit conversion

The tool-routing test sheet in Step 3 is the golden dataset: the readable source of truth for expected tool behavior. Add these columns when creating it:

| ID | User message | Expected tool-call trace | Expected arguments | Mock result | Expected final behavior | Result |
|---|---|---|---|---|---|---|
| `cancel-known-id` | "Cancel booking AB123" | `lookup_booking` -> `cancel_booking` | `booking_id: AB123` | Booking found; cancellation successful | Confirms cancellation | |
| `cancel-missing-id` | "Cancel my booking" | No action tool | None | None | Asks for booking number | |

After manual validation, convert each approved row into a LiveKit test in the FlexAgent repository, next to its existing automated tests. The test must:

1. Send the row's user message.
2. Assert every expected tool call and arguments in order.
3. Replace real external tools with fakes that return the row's mock result.
4. Assert the final agent reply reflects that fake result.
5. Assert no events remain. This fails the test if an extra or wrong tool is called.

Illustrative test flow:

```text
send: "Cancel booking AB123"
expect: lookup_booking(booking_id="AB123")
expect: fake output "booking found"
expect: cancel_booking(booking_id="AB123")
expect: fake output "booking cancelled"
expect: assistant confirms cancellation
expect: no more events
```

The exact test syntax follows FlexAgent's implementation language and test runner. The evaluation plan stays in Eval Tool; executable LiveKit tests belong in the FlexAgent repository.

## Production evaluation for user-created agents

Production agents cannot use one universal dataset because each agent can have different tools. Evaluate each agent version using the tools configured for that agent.

When a creator adds or changes a tool, retain this contract with the agent version:

| Field | Example |
|---|---|
| Tool name | `cancel_order` |
| Purpose / call rule | Use only when a customer asks to cancel an order. |
| Input schema | `order_id: string` |
| Safe mock result | `{ "status": "cancelled" }` |
| Example request | "Please cancel order 123." |

For that agent version:

1. Snapshot the agent instructions, enabled tools, and tool contracts.
2. Create or generate a small test set for the configured tools; require creator review before generated expectations become pass/fail rules.
3. Run the test set in an evaluation sandbox where every external tool returns its safe mock result.
4. Compare the actual trace with the expected trace: tool names, arguments, order, tool outputs, final response, and no unexpected calls.
5. Store results against the agent version and rerun after its instructions or enabled tools change.

Without a tool purpose, input schema, and expected-use information, FlexAgent can run only generic health checks. It cannot determine whether selecting an unknown tool was correct.

## Not in scope yet

- Connecting Eval Tool to FlexAgent through an endpoint.
- Replacing Eval Tool with LiveKit.
- Voice-specific testing such as interruptions, speech recognition, or text-to-speech.

Add those only after RAG and text-based tool-routing tests are stable.
