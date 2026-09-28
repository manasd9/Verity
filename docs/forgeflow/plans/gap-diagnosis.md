# Evaluation gap diagnosis implementation plan

## Goal

Add an actionable, appropriately qualified diagnosis to each newly scored GAP result and show it in Results and the downloaded report.

## Preconditions and risks

- The approved specification is `docs/forgeflow/specs/2026-09-24-gap-diagnosis-spec.md`.
- `server.js` has three scoring sites: connected single-turn, connected multi-turn, and manual pasted answers. All must produce consistent diagnoses.
- The control model may return malformed or overly confident text. Validate the diagnosis before saving and keep the wording tied to observable answer-versus-rubric differences.
- Multi-turn cases may fail because of a turn or final memory. The top-level diagnosis must represent the actual failed component, not just the last answer.

## Ordered steps

### 1. Extend and validate scoring output

- Purpose: Obtain one structured diagnosis within the existing control-model judgment call, with no extra model round trip.
- Areas affected: scoring prompt/schema and one shared verdict parser in `server.js`.
- Dependencies: existing `missingPoints`, `forbiddenClaims`, `rationale`, rubric, and source evidence.
- Verification: deterministic checks for valid GAP categories, non-empty explanation/action, PASS handling, and malformed output rejection.

### 2. Attach diagnoses across evaluation paths

- Purpose: Persist diagnoses for connected and manual evaluations, including FlexAgent targets and multi-turn cases.
- Areas affected: the existing evaluation routes in `server.js`; result objects in `data/store.json` gain an optional `gapDiagnosis` field through normal saves.
- Dependencies: step 1.
- Verification: exercise the shared parser through each scoring path; check that a failed multi-turn or memory result describes its actual failure.

### 3. Show the diagnosis and export it

- Purpose: Let reviewers see why a case failed and where the team should investigate.
- Areas affected: Results markup and HTML report builder in `app.js`, plus a small style addition in `styles.css`.
- Dependencies: step 2.
- Verification: GAP shows categories, reason, action, and the no-trace qualification for manual/FlexAgent results; PASS and legacy records render normally. Downloaded HTML contains the same information.

## Test strategy

Use the existing Node assertion suite (`npm test`) for the shared validation boundary and rendering markers. Run `node --check server.js`, `node --check app.js`, and a browser check of Results with an existing record; use a controlled example for the new diagnosis path if the live control model is unavailable. Avoid a real scoring request unless needed to resolve a concrete integration risk.

## Rollout or migration notes

No data migration. Older evaluation records lack `gapDiagnosis` and keep their existing rationale. New results are written through the existing local JSON store and returned by the existing API routes.
