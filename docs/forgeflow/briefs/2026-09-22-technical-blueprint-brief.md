# Technical Blueprint documents

## Goal

Let a user upload a technical engineering document and understand its operational mechanics without needing to read it end to end. This is a separate knowledge type from the existing operational policy documents.

## Scope

- Add a dedicated **Technical Blueprint** area to the evaluation tool.
- Accept the existing supported file formats: PDF, DOCX, and TXT.
- Extract document text through the existing upload/extraction path.
- Produce a source-grounded structured overview using the configured control model.
- Present a readable visual breakdown of:
  - document purpose, participating systems, key rules, and missing/unclear details;
  - ordered flows, including triggers, APIs/functions, results, and branches/sub-flows;
  - an API/function catalog with when-to-call guidance, inputs, outputs, and dependencies;
  - examples of requests, responses, or expected outputs where present in the source;
  - source excerpts for every displayed finding.
- Make the overview useful to both technical and non-technical readers.

## Boundaries

- Technical documents do not enter policy retrieval, chat context, scenario generation, golden-dataset generation, target-agent prompts, or evaluations.
- The system must not invent APIs, call order, inputs, outputs, or connections not supported by the uploaded document.
- Existing operational-document behavior remains unchanged.

## Data and flow

1. User uploads a technical PDF, DOCX, or TXT file.
2. Server extracts text with the existing parsers and persists the raw document separately as a technical blueprint.
3. The control model returns a constrained structured analysis with source evidence for each item.
4. The client renders the analysis as overview cards, flow steps with branch labels, catalog rows, examples, and expandable source evidence.
5. If no control connection is available or analysis fails, preserve the upload and show an actionable analysis-unavailable state rather than fabricated content.

## UX

- A dedicated page keeps technical material distinct from operational policy documents.
- The upload panel uses the existing upload affordance and copy, adapted to explain that the file will be mapped into systems, calls, rules, and examples.
- Flow maps use a simple ordered vertical sequence with explicit branch labels. This is clearer and lower-risk than an interactive graph for the first release.
- Catalog and examples use expandable rows/cards so complex documents are readable without overwhelming the page.
- Every generated claim carries concise source evidence that can be opened inline.

## Verification

- Add a focused automated check for technical-document persistence, analysis validation, and isolation from policy/evaluation data.
- Confirm the existing test suite still passes.

## Deferred

- Asking questions of technical documents.
- Scenario or golden-dataset generation from technical documents.
- Combining policy and technical documents for evaluations.
- Cross-document graphs, editing generated analyses, and manual annotations.
