# FlexAgent evaluation bridge

## Goal

Evaluate a configured FlexAgent against a human-reviewed golden dataset created in Eval Tool, while FlexAgent answers only from its own agent configuration and knowledge base.

## Approved boundary

Eval Tool owns:

- the source policy used to create the golden dataset;
- test questions, expected answers, rubric, and scoring; and
- the display and persistence of evaluation results.

FlexAgent owns:

- the selected organization and agent;
- its agent prompt, model configuration, and knowledge retrieval; and
- producing the answer to one customer question.

Eval Tool sends FlexAgent only an agent identifier and customer question. It must not send source-policy text, retrieved chunks, expected answers, rubric fields, or control-model output.

## Integration

Add a protected FlexAgent HTTP endpoint for evaluation. It accepts a trusted service credential, organization ID, agent ID, and one question. It runs the same FlexAgent agent configuration and knowledge retrieval used for customer answers, then returns the text answer and an optional request ID for tracing.

Eval Tool adds FlexAgent as a target type. During a FlexAgent evaluation, Eval Tool calls this endpoint once per approved dataset case, stores the returned answer, and asks the existing control model to score it against the saved rubric. The existing OpenAI target-model path remains unchanged.

## Explicit non-goals

- Do not connect Eval Tool to the LiveKit WebSocket or create fake LiveKit customer rooms.
- Do not call FlexAgent's underlying LLM directly.
- Do not copy FlexAgent policies or knowledge-base content into Eval Tool at answer time.
- Do not expose the evaluation endpoint to public embed users.

## Success criteria

- A selected FlexAgent answers every approved case using its own knowledge base.
- Eval Tool receives one answer per question and scores it using the existing rubric flow.
- FlexAgent credentials and the service credential never appear in browser responses or stored evaluation results.
- Existing Eval Tool model-to-model evaluations continue to work.

## Verification

Use a known FlexAgent and policy already present in its knowledge base. Run one approved golden dataset through the bridge, verify that Eval Tool stores FlexAgent answers and control-model verdicts, and verify that a normal OpenAI target evaluation still runs.
