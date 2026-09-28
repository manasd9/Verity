# Technical-document chat and evaluation specification

## Purpose

Let an evaluator chat with a Technical Blueprint document through the configured target agent, create reviewable technical test cases with the configured control model, and run those cases to obtain the existing final score and per-case results.

## User journey

1. A user uploads or selects a Technical Blueprint document.
2. The tool shows it as chat/evaluation ready when its source has been embedded.
3. The user selects the document and target connection, asks a question, and receives a source-grounded answer from the target agent.
4. The user asks the control connection to draft technical evaluation cases, reviews and approves them, selects the target and control connections, and runs the evaluation.
5. The Results view shows the same aggregate score, per-case verdicts, target answers, rubrics, and retrieved source sections used for operational documents.

## Storage and isolation

- `technicalDocuments` remains the source of truth for technical document metadata, source text, and blueprint analysis.
- Store technical retrieval chunks in the existing `chunks` collection with `documentId` and a required `documentKind: "technical"`; operational chunks retain `documentKind: "policy"` after normalization.
- Datasets, chats, evaluations, and agent configurations may reference either document kind, but each handler resolves the document ID against exactly one allowed collection and rejects unknown or cross-kind references.
- Document cleanup removes records and chunks for its own document ID only. It must never remove unrelated policy or technical records.

## Section-aware technical chunking

- Do not add a tokenizer or change the embedding model.
- Keep the current embedding and cosine-retrieval implementation.
- Add a technical-only splitter that groups a recognized heading with subsequent body text.
- Preserve fenced code blocks, request/response examples, tables, and API/function-signature lines in one chunk whenever they fit within the chunk ceiling.
- Use a 1,400-character nominal ceiling and 180-character overlap only when a grouped section exceeds the ceiling. A forced split uses the existing sentence/whitespace boundary fallback without dropping text.
- Operational policies continue using the current generic `chunkText` behavior.

## Chat behavior

- Technical chat uses the selected technical document's retrieved chunks only.
- Embed the question with the existing control OpenAI-compatible embedding connection, retrieve up to five chunks for that technical document, and call the selected target connection using the existing target request path.
- The target system prompt states that it must answer solely from the supplied technical sections, quote or identify the relevant source section when useful, and state clearly when the source does not support an answer.
- Technical chat does not use survey memory or chat-history extraction. Existing policy/survey chat behavior stays unchanged.
- Persist technical chats with document ID and kind; the UI labels them as Technical document chats and only lists them under their technical document.

## Dataset and evaluation behavior

- Technical scenario generation uses a technical-specific control prompt that asks for technically realistic questions, expected answers, required and forbidden points, and exact evidence copied from source sections.
- Generated cases use the existing review-and-approval UI and the current case schema. Multi-turn survey-only fields are not generated for this work.
- A technical evaluation executes the existing evaluation scoring flow against the selected target agent, supplying technical retrieved chunks instead of policy chunks.
- The aggregate calculation and final score formatting remain unchanged. Results retain target answer, rubric verdict, and retrieved source sections.
- Control-generated evidence is validated against the raw technical source before it is persisted; invalid cases are rejected rather than silently repaired.

## UI

- Technical Blueprint gains a clearly labeled **Ask & evaluate** area, visible only for a selected technical document.
- It exposes the same minimal controls already used operationally: target selection and question input for chat; control selection and draft-case action; approved dataset selection and run-evaluation action.
- Technical documents do not appear in operational-policy selectors. Operational documents do not appear in technical selectors.
- Unavailable state explains whether embeddings, a target connection, a control connection, or approved cases are missing.

## Failure handling

- Upload is still durable if technical embedding fails; the document is marked unavailable for chat/evaluation with an actionable error.
- A failed embedding, target call, control call, malformed draft, or invalid source evidence does not persist a partial chat, dataset, or evaluation.
- The tool reports the existing safe error messages and never fabricates a technical answer, evidence, scenario, or score.

## Acceptance criteria

- A technical document receives section-aware retrieval chunks after upload without affecting policy chunks.
- A target agent can answer a technical-document question from retrieved source chunks and declines unsupported questions.
- Evaluators can generate, review, approve, and run technical-document cases using the existing target/control roles.
- A technical evaluation produces the existing final aggregate score and inspectable per-case results.
- Technical and policy documents stay isolated across retrieval, chat selectors, datasets, and evaluations.
- `node --check server.js`, `node --check app.js`, and `npm test` pass with focused technical isolation and chunking assertions.

## Out of scope

- New tokenization or vector-database dependencies.
- Cross-document retrieval or combined technical/policy scenarios.
- Technical-document survey memory, annotations, editing, or graph changes.
