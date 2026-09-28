# Evaluation gap diagnosis specification

## Problem and users

FlexAgent teams can see which scenarios fail, but a score and raw rubric do not quickly identify the likely source-grounding failure to investigate. They do not provide Eval Tool with their implementation, chunking, tokenization, embedding, reranking, or retrieval trace.

## Goal and success criteria

Make each GAP result actionable without overstating what Eval Tool can observe.

- Every newly scored GAP stores a structured, concise diagnosis.
- Results and downloaded reports show the diagnosis next to the failed scenario.
- The diagnosis differentiates missing policy detail, wrong or unsupported claims, and incomplete answers.
- External/manual FlexAgent results state that the diagnosis is inferred from the answer and rubric, not a confirmed retrieval trace.
- PASS results do not display a diagnosis.

## In scope

- Extend the existing control-model scoring response for both connected and manual evaluations with a `gapDiagnosis` object.
- Use the existing answer, expected answer, rubric, source evidence, missing points, forbidden claims, and rationale as scoring context.
- Persist the object on each evaluation result in the existing local JSON store.
- Add a compact **Likely cause & RAG focus** block to GAP results in Results and the downloadable HTML report.
- Add focused assertions to the existing `test.mjs` checks.

## Out of scope

- Accessing or inferring as fact FlexAgent code, chunks, chunking strategy, tokenization, embeddings, reranking, or retrieval settings.
- Retrieval-quality measurements or claims that a specific document section was not retrieved.
- Retrospective re-scoring of completed evaluations.
- A new database, report format, analytics dashboard, or separate model request.

## User-facing behavior

Each GAP result shows:

- **Why it failed:** the control-model explanation grounded in the missing required points and/or unsupported claims.
- **Likely RAG issue:** one or more of `Missing policy detail`, `Wrong or unsupported claim`, or `Incomplete answer`.
- **Team focus:** a specific generic action that matches the observed issue, such as improving retrieval coverage for the source concept, reranking terminology around the scenario, or enforcing answer grounding.

For results with no retrieval trace—manual pasted answers and FlexAgent targets—the block adds: “Inferred from the answer and scoring rubric; no FlexAgent retrieval trace was captured.” Existing evaluation records that lack `gapDiagnosis` retain their rationale and do not error.

## Technical and architectural decisions

- Reuse the existing control-model judgment call. Add `gapDiagnosis` to its JSON schema rather than making a second diagnosis request.
- Store `gapDiagnosis` as `{ categories: string[], why: string, teamFocus: string }` on each result. `categories` is limited to the three user-facing labels above.
- Require the scoring instruction to return a meaningful diagnosis for failed verdicts; tolerate a missing diagnosis from older records.
- Keep wording probabilistic: “likely”, “may”, and “focus”; never say a chunk was definitely missed unless a trace exists.
- UI and export rendering use the persisted diagnosis, keeping Results and reports consistent.

## Data, API, and error-handling decisions

- Evaluation route response shape gains the optional `gapDiagnosis` result field; no endpoint is added.
- Manual and FlexAgent results retain `retrievalUnavailable`; it controls the inference disclaimer.
- If the control model returns invalid diagnosis data, reject the evaluation as malformed rather than storing a fabricated diagnosis.
- Existing results remain compatible because diagnosis rendering is conditional.

## Testing decisions

- Public seams: `POST /api/evaluations`, `POST /api/evaluations/manual`, Results rendering, and `downloadEvaluationReport`.
- Behaviors that require tests: accepted structured diagnosis, GAP-only rendering/export, manual/FlexAgent inference wording, and legacy-result fallback.
- Existing testing patterns to follow: Node `assert` checks in `test.mjs`, importing small server helpers where deterministic validation is needed.

## Risks, assumptions, and open questions

- A diagnosis is an assessment of output behavior, not direct evidence of FlexAgent retrieval behavior. The mandated disclaimer handles this limitation.
- The existing control model is assumed capable of returning the extended JSON shape reliably; strict validation avoids silently misleading output.
- Exact retrieval root cause requires optional future inputs from FlexAgent: retrieved chunks/scores, source version, and retrieval configuration.

## September 24 wording revision

The FlexAgent team needs RAG investigation directions rather than document-specific policy corrections. The Results page and HTML export now call the block **RAG investigation** and show **Observed gap** and **What to inspect**. The diagnosis uses generic wording and suggests checks in indexing, query matching, ranking, context assembly, and grounding.

The scorer returns one `missingPoints` entry per substantially missed required rubric point. The server builds the diagnosis from that count: at least three quarters missing is a **Likely retrieval miss**, fewer missing points are **Partial retrieval coverage**, and unsupported claims add **Unsupported or conflicting answer**. These are hypotheses about the pipeline, not verified internal causes. Saved evaluations are normalized when read, so existing Results and exports receive the revised guidance without rescoring or changing their scores.
