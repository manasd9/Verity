# Local JSON RAG MVP

## Goal

Replace full-policy prompting for customer chat and target-agent evaluation with local, document-scoped retrieval. Keep full-document prompting only for one-time golden-dataset generation.

## Approved design

- Store retrieval chunks in `data/store.json` as a top-level `chunks` collection, keyed by `documentId`.
- On upload, extract the existing PDF, DOCX, or TXT text; split it into overlapping, boundary-aware chunks of roughly 1,000 characters; embed each with OpenAI `text-embedding-3-small`; and persist text, index, offsets, and vector.
- For chat and each evaluation case, embed the question, rank that document's chunks with cosine similarity, and send the best five chunks as the policy context.
- Reuse the selected control-model connection's encrypted OpenAI key for embeddings. Do not add UI configuration or overwrite saved target/control models or API keys.
- Store retrieved chunks with each evaluation result as admin-facing retrieval evidence. The target receives only the policy-specific prompt, retrieved context, and customer question; it never receives expected answers or rubric fields.
- Keep dataset generation on the existing full-document path.
- Removing a document also removes its chunks, alongside existing datasets, evaluations, chats, and agent configurations.

## Scope boundaries

- No Docker, vector database, WebSocket support, or new dependency.
- Existing documents that have no chunks will not silently fall back to full-document prompting; users can re-upload them to enable retrieval.
- Add focused tests for chunking, cosine retrieval, and chunk deletion cleanup, then run `node --check server.js`, `node --check app.js`, and `npm test`.

## Document next steps

- A RAG-ready document shows two small next-step actions: customer chat and golden-dataset creation.
- Documents awaiting indexing show no next-step actions, avoiding links into unavailable retrieval workflows.
