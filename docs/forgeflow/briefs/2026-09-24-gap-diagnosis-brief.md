# Evaluation gap diagnosis

## Goal

Make failed evaluation scenarios actionable for the FlexAgent team without claiming access to, or knowledge of, FlexAgent's internal retrieval pipeline.

## Approved design

For each GAP result, show a compact **Likely retrieval issue & investigation focus** block in Results and the downloaded report. It will derive its content from the existing control-model verdict and rubric:

- **Observed answer gap:** a short answer-versus-rubric summary without reproducing document/policy details.
- **Likely retrieval issue:** one or more pipeline-oriented labels: **likely retrieval miss** when most required information is absent, **partial retrieval coverage** when some required information is present but material parts are absent, or **wrong or unsupported grounding** when the agent introduces a conflicting claim.
- **Investigation focus:** a concrete direction for the RAG team: inspect query representation, retrieval recall, ranking/reranking, context assembly, and answer grounding for the scenario. The wording must not prescribe policy content to the team.

For manual FlexAgent answers, state that this is an inference from the answer and rubric, not a confirmed retrieval trace.

## Scope

- Reuse existing verdict fields: `missingPoints`, `forbiddenClaims`, `rationale`, source evidence, and the required rubric. The control-model verdict classifies coverage by the proportion of required rubric points captured, rather than treating all omissions as merely incomplete.
- Build the structured diagnosis from the existing control-model verdict during scoring. Rebuild diagnoses from saved verdicts when loading earlier evaluations, so their Results and exports use the revised wording without a new model request.
- Render diagnoses only for GAP results in the UI and exported report.

## Boundaries

- Do not inspect, infer as fact, or require FlexAgent source code, chunks, embedding model, tokenization, or retrieval configuration.
- Do not show diagnoses for PASS results.
- Existing reports without the new diagnosis remain readable and show their existing rationale.

## Verification

- A failed manual evaluation stores and displays the retrieval-oriented label, answer-gap summary, investigation action, and inference disclaimer.
- An answer missing most required points is labeled as a likely retrieval miss; one containing a meaningful subset is labeled partial retrieval coverage.
- The report export includes the same GAP diagnosis.
- A pass result has no diagnosis block.
