# Technical-document chat and evaluation

## Goal

Extend Technical Blueprint documents so users can ask the configured target agent questions about a selected technical document and evaluate that agent with a final score, using the same target/control roles as operational-document evaluation.

## Scope

- Keep Technical Blueprint uploads and source-grounded visual analysis unchanged.
- Add retrieval chunks for technical documents only; do not mix them with operational-policy chunks.
- Make technical retrieval section-aware: preserve a detected heading with its following content, and keep fenced code blocks, request/response examples, tables, and API signatures together where possible. Split only oversized sections using the existing modest overlap.
- Reuse the configured target connection for technical chat answers.
- Reuse the configured control connection to generate reviewable technical test scenarios and grade target answers.
- Display the existing final evaluation score and per-scenario results for a technical-document run.

## Boundaries

- Do not change embedding models, add a tokenizer dependency, or build a separate vector store.
- Technical and operational documents remain isolated in upload selection, chunks, chats, datasets, and evaluations; every record carries its document kind or resolves through a document-specific lookup.
- Technical answers are grounded only in retrieved technical sections and must say when the document does not support an answer.
- Existing Technical Blueprint analysis remains read-only and does not become part of the answer context unless its source text is retrieved.

## Data flow

1. Upload or select a technical document.
2. Create and embed section-aware technical chunks after extraction.
3. For chat, embed the question, retrieve the best technical chunks, and send those plus the user question to the target agent.
4. For evaluation, the control model drafts source-evidenced technical scenarios; the user reviews and approves them; the target agent answers; the control model grades them; the existing aggregate score is shown.

## Error handling

- A technical document without successful embeddings is visibly unavailable for chat/evaluation.
- Missing target or control connections block only the action that needs them with the existing actionable messaging.
- Malformed generated scenarios and unsupported citations are rejected before persistence.
- The existing operational policy workflow is unchanged.

## Verification

- Add focused Node assertions for heading/code-aware section splitting and technical/operational retrieval isolation.
- Add endpoint and UI contract checks for technical chat, reviewed scenario generation, and scored evaluation.
- Run `node --check server.js`, `node --check app.js`, and `npm test`.

## Deferred

- Cross-document retrieval.
- A new tokenization library or per-model token budgeting.
- Combined policy-and-technical evaluations.
