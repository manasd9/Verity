# Survey conversation memory and multi-turn evaluation

## Goal

Make the local Eval Tool a reliable survey-bot test bed. It must retain all conversation data for any length of conversation, apply uploaded-document rules during the survey, and evaluate multi-turn survey behavior before any FlexAgent integration is used.

## Approved design

- Keep an immutable, complete transcript for every chat in the local store. Existing messages are never truncated or overwritten.
- Add a survey-memory record to each chat. It records explicit user answers verbatim, model inferences separately, source message IDs, unresolved or invalid answers, and the current survey stage.
- Treat a correction as a new record linked to the earlier answer. The latest answer applies only when the uploaded document's rules allow it.
- On each turn, send the target agent the document prompt and retrieved policy sections, survey memory, recent messages, and relevant older transcript excerpts.
- The transcript is the source of truth; survey memory is a working representation that makes an unbounded record usable within a model's finite context window.
- Add sequential evaluation cases. Each case contains a conversation turn sequence and checks both per-turn behavior and final remembered survey state.

## Scope

- Apply the durable memory path to ordinary chatbot conversations as well as survey chats.
- Make survey memory available to the target agent on each turn, while retaining source links for review.
- Test document-rule adherence, recalls across long conversations, answer corrections, missing or invalid answers, skips where permitted, and correct survey completion.
- Do not use or modify the FlexAgent endpoint.
- Do not add a database, vector database, dependency, or background worker. Reuse the current JSON store, document retrieval, and model connections.

## Acceptance criteria

- A chat retains its full transcript after arbitrary numbers of messages.
- A later turn can use a prior user answer even after it falls outside the recent-message window.
- Explicit answers and inferences are distinguishable and traceable to original messages.
- A multi-turn evaluation executes a turn sequence in order and records the bot response and memory state at each checkpoint.
- Evaluation marks rule violations and missing/correctly remembered data against an approved, document-grounded rubric.
- Existing single-turn policy evaluation continues to work.

## Constraints and risks

- No model can receive an unbounded prompt. Complete history remains durable, while compact survey memory and relevant transcript retrieval form the model context.
- Survey memory is derived by a model and can be wrong; source-linked raw messages remain reviewable and are the authority for corrections.
- Survey-specific field requirements come from the uploaded document and the approved multi-turn test cases, rather than a hard-coded survey schema.
