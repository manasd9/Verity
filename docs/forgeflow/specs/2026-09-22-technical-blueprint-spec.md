# Technical Blueprint specification

## Purpose

Allow an Eval Tool user to upload a technical engineering document and receive a clear, source-grounded visual explanation of the systems, APIs, functions, rules, connections, branches, and examples it contains. The feature is read-only knowledge discovery; it does not change how the tool chats, creates datasets, or evaluates agents.

## User journey

1. A user opens **Technical Blueprint** from the main navigation.
2. They upload a PDF, DOCX, or TXT technical document.
3. Eval Tool extracts and saves its source text as a technical blueprint, distinct from operational policy documents.
4. If a control-model connection exists, Eval Tool creates a structured, source-grounded analysis.
5. The user reads the overview, follows the ordered system flow, inspects APIs/functions and examples, and opens the evidence behind any finding.

## Document model

Technical blueprints are stored in their own collection, rather than the policy-document collection. Each blueprint stores the existing common document metadata plus:

- `kind: "technical"`;
- the extracted source text; and
- an optional `analysis` object with the time it was created and its structured findings.

Technical documents must never be added to the policy chunk collection or returned by existing dataset, chat, or evaluation routes.

## Analysis contract

When a control connection is configured, ask it to return JSON only. Its analysis must contain:

- `overview`: purpose, systems, key rules, and notable unknowns;
- `flows`: ordered steps containing a trigger, action/API/function, result, optional branch condition, and source evidence;
- `catalog`: APIs/functions containing name, purpose, when-to-call guidance, inputs, outputs, dependencies, and source evidence; and
- `examples`: source-supported input/output examples with source evidence.

Every visible finding must include a non-empty excerpt copied from the document text. The server rejects malformed model output, empty source evidence, non-array collections, and overlong fields. It does not silently create a partial or invented analysis.

## UI

The Technical Blueprint page contains:

- an upload card explaining supported formats and the read-only first-stage scope;
- an empty state when there are no technical documents;
- a document selector/list for uploaded blueprints;
- an at-a-glance area for purpose, systems, key rules, and unknowns;
- an ordered vertical flow map with clear trigger, action, result, and branch labels;
- expandable API/function catalog entries;
- expandable source-backed examples; and
- an analysis-unavailable state when there is no control connection or analysis fails.

The page follows the existing Eval Tool visual system and remains usable on narrow screens. Flow order and branch labels must not rely only on color.

## Upload and failure handling

Reuse the existing 15 MB in-memory upload limit and PDF/DOCX/TXT text extraction. Reject empty extracted text. Persist a valid upload before requesting analysis, so temporary model failures do not lose the file. Return a clear error if analysis is unavailable; no fallback summary is fabricated.

## Isolation rules

- Policy-document upload, chunking, retrieval, chat, scenarios, datasets, target prompts, and evaluations retain their current behavior.
- Technical documents have no chunks or retrieval-ready status for those features.
- Removing a technical blueprint removes only that blueprint and its analysis.

## Acceptance criteria

- Users can upload PDF, DOCX, and TXT technical documents on a dedicated page.
- A valid analysed document displays its overview, flows, catalog, examples, and source excerpts.
- Claims without source evidence are not displayed.
- A missing control connection or failed analysis leaves the upload intact and presents an actionable unavailable state.
- Technical documents cannot be selected in policy chat, scenario, dataset, or evaluation workflows.
- Existing policy upload and evaluation checks remain green.

## Out of scope

- Technical-document chat or search.
- Scenario or golden-dataset generation from technical documents.
- Combining technical and operational documents in retrieval or evaluation.
- Interactive graph editing, manual annotations, or cross-document dependency graphs.
