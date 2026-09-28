# Survey conversation memory specification

## Problem and users

An evaluator needs to test a document-governed survey bot before integrating FlexAgent. The bot must remember a respondent's data over arbitrarily long conversations and follow the uploaded survey rules. Today, the Eval Tool persists full chat history but sends only the latest 20 messages to the target, and its approved datasets exercise one question at a time.

## Goal and success criteria

Provide durable, source-traceable conversation memory for normal chats and survey bots, plus sequential evaluation cases that verify memory and document-rule compliance.

Success means:

- No stored chat message is discarded because the conversation is long.
- A target receives usable prior-answer memory beyond the recent transcript window.
- The application distinguishes user statements from model inferences and links each to the original message.
- Evaluators can run and review an ordered conversation, including checkpoints and final memory expectations.
- The existing document retrieval and single-turn evaluation flows remain supported.

## In scope

- Extend a saved chat with an append-only survey-memory ledger.
- Update the ledger after user turns using the configured control model and a strict JSON response.
- Store facts with `kind` (`explicit` or `inferred`), `value`, `sourceMessageId`, `status` (`active`, `superseded`, or `unresolved`), and timestamps.
- Preserve corrections as new facts. The target receives both the active fact and its correction trail.
- Give the target agent: its document-specific instructions, retrieved document sections, active survey memory, recent chat history, and older history relevant to the current message.
- Add durable conversation-history chunks and embeddings for old-message retrieval, scoped to their chat.
- Extend dataset cases with an optional ordered `turns` array. Each turn has a user message and an optional expected response/rubric; the case has an optional expected final memory.
- Execute multi-turn cases in sequence and record response, retrieved history, and memory at each turn for result review.

## Out of scope

- FlexAgent endpoints, configuration, and evaluation behavior.
- A hosted database, vector database, background processor, new package, or user authentication.
- A hard-coded survey schema. The document, agent prompt, and approved test case define survey fields and rules.
- Automatic deletion, retention expiry, or cross-chat user identity matching.

## User-facing behavior

- Customer Chat continues to create and resume conversations. Its conversation record retains every message.
- The chat view shows a concise survey-memory section with sourced explicit answers, separately marked inferences, unresolved answers, and correction status.
- Dataset review lets an evaluator create either an existing single-turn case or a multi-turn conversation case.
- Results show each turn's answer, rubric verdict, history evidence, and survey-memory checkpoint; final results show whether expected memory was retained.
- When memory extraction or embedding fails, the turn returns an error and does not partially save a user message or a misleading memory update.

## Technical and architectural decisions

- `chat.messages` remains the immutable source-of-truth transcript. Give each newly persisted message a stable ID and timestamp.
- Add chat-scoped history chunks in the existing local JSON store. Use the existing OpenAI embedding connection and cosine-ranking helper; no new retrieval system.
- Maintain one compact, append-only `surveyMemory` ledger per chat. The control model extracts only facts supported by the transcript and document rules; it must return source message IDs and label inferences.
- Rebuild or validate survey memory from the raw transcript when a malformed ledger is detected, rather than silently trusting it.
- Keep the target context bounded: active ledger + recent turns + top relevant older chunks. Raw history remains retained and reviewable even when it cannot fit in a model request.
- The document rules apply to corrections, required fields, validation, skips, and completion. The target prompt must state that it must use the supplied survey memory and must not claim missing data exists.
- Keep existing single-turn dataset fields unchanged. `turns` and `expectedFinalMemory` are optional additions so older datasets continue to run.

## Data, API, and error-handling decisions

- `store.json` gains a top-level `chatChunks` collection. Records contain chat ID, message ID, text, embedding vector, and creation time.
- Chat records gain `surveyMemory` with versioned ledger entries. Existing chats initialize to an empty ledger; their stored messages remain untouched.
- `POST /api/chat` saves a new user message only after retrieval, target response, memory extraction, and history indexing succeed; failures return a descriptive 400 and leave the chat unchanged.
- `POST /api/evaluations` recognizes a case with `turns`, executes those messages against an isolated ephemeral chat state, and persists detailed per-turn results only after the complete case finishes.
- Deleting a document also deletes its chats and corresponding `chatChunks`, survey-memory records, datasets, and evaluations.
- JSON returned by a control model is schema-validated before it is persisted. Invalid output fails safely with no partial transcript update.

## Testing decisions

- Public seams: exported pure helpers for memory-ledger validation/formatting, history-chunk ranking, and multi-turn case normalization; HTTP routes remain covered by the existing `node test.mjs` style of checks.
- Behaviors that require tests: transcript preservation; old-message retrieval; explicit versus inferred facts; correction tracking; invalid extraction rollback; single-turn backwards compatibility; ordered multi-turn execution; final-memory rubric verdict; document cleanup of `chatChunks`.
- Existing testing patterns to follow: Node built-in `assert` in `test.mjs`, plus `node --check` for server and browser code. No test framework or fixture dependency.

## Risks, assumptions, and open questions

- An LLM cannot consume infinite context. The raw transcript is the authoritative permanent record; ledger and retrieval make it usable within a finite context window.
- Control-model fact extraction can be wrong. It is constrained to source-linked JSON, clearly marks inferences, and is reviewable against stored raw messages.
- The selected control connection must be OpenAI-compatible with embeddings for long-history retrieval, as the current RAG workflow already requires.
- “Never forget” means durable local retention and retrievable/summarized use within the tool; it does not create an account-level identity graph across separate chats.
