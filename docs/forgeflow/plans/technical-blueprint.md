# Technical Blueprint implementation plan

## Goal

Ship a separate Technical Blueprint upload and visual explanation workflow for PDF, DOCX, and TXT engineering documents, while preserving complete isolation from policy retrieval, chat, datasets, and evaluations.

## Preconditions and risks

- Reuse the configured control-model connection for analysis. The feature must surface an unavailable state if none exists.
- Model output is untrusted. Validate its complete shape and source evidence before persistence or rendering.
- The current `documents` collection owns policy documents and downstream records. Technical blueprints must remain in a separate collection rather than relying on UI-only filtering.
- Existing `data/store.json` documents have no kind; treat those as operational policy documents for backward compatibility.

## Ordered steps

### 1. Add technical-document model and analysis validation

- Purpose: introduce the minimum durable representation for a technical blueprint and safely handle model output.
- Areas affected: `server.js` store normalization, public document shaping, document removal helpers, and module exports used by `test.mjs`.
- Dependencies: existing text extraction and encrypted control connection.
- Work: default legacy documents to `kind: "policy"`; add a strict parser/normalizer for the Technical Blueprint analysis contract; validate bounded strings, arrays, and source evidence; ensure deletion removes only related technical data.
- Verification: focused assertions for legacy normalization, valid analysis parsing, malformed/missing-evidence rejection, and removal isolation.

### 2. Add technical upload and analysis API

- Purpose: accept a technical file, persist its extracted text, then optionally attach a source-grounded analysis.
- Areas affected: `server.js` upload routes and `/api/state` response.
- Dependencies: step 1; existing 15 MB multer configuration; `extractText`; `callModel`.
- Work: add a dedicated technical-blueprint upload route using the existing PDF/DOCX/TXT parser; save the technical document before analysis; request constrained JSON from the control model; expose technical documents and analyses through state without exposing raw source text unnecessarily; return clear unavailable/error information when analysis cannot run.
- Verification: test valid upload classification, no chunk creation, analysis contract validation, persistence-before-analysis failure behavior, and source-safe public payloads.

### 3. Enforce policy-workflow isolation server-side

- Purpose: prevent technical IDs from entering all existing policy-only flows, even if a client is modified or called directly.
- Areas affected: policy document upload compatibility, agent configuration, chat, dataset generation, and evaluation handlers in `server.js`.
- Dependencies: step 1.
- Work: keep technical blueprints in a separate store collection and API route, leaving existing policy routes unable to resolve their IDs; leave technical documents unchunked and unavailable to retrieval.
- Verification: assertions that technical analysis is independent of policy chunks and existing retrieval tests stay green.

### 4. Build the Technical Blueprint page and interactions

- Purpose: make a technical document understandable to technical and non-technical users.
- Areas affected: `index.html`, `app.js`, and `styles.css`.
- Dependencies: step 2 state/API shapes.
- Work: add a separate navigation item and page renderer; keep a separate technical-document client collection; upload files to the new route; render empty, loading, unavailable, and populated states; present overview, system/rule lists, an accessible ordered flow map with explicit branch labels, expandable catalog entries, examples, and evidence excerpts; add mobile layout rules using existing visual tokens/components.
- Verification: static UI assertions for route/page, upload action, flow/categorised output, evidence, and unavailable state; manual browser pass at desktop and narrow widths.

### 5. Extend regression checks and run the suite

- Purpose: leave one small runnable check behind for the new validation and isolation logic.
- Areas affected: `test.mjs`.
- Dependencies: steps 1–4.
- Work: add focused helper assertions plus static-contract checks for the new endpoint and UI; preserve the current low-dependency Node test style.
- Verification: `node --check server.js`, `node --check app.js`, and `npm test`.

## Test strategy

- Unit-level Node assertions cover analysis parsing/validation, legacy document compatibility, technical deletion, and policy-flow rejection.
- Static UI assertions verify the new page and controls are wired to the dedicated endpoint.
- Manual smoke test uploads one small TXT document with a configured control model, then confirms its facts appear only on Technical Blueprint and cannot be selected in policy pages.

## Rollout or migration notes

- No data migration is required: documents without `kind` normalize to policy documents.
- No dependency or database changes are needed.
- Existing documents, chunks, chats, datasets, evaluations, and agent configurations remain untouched.
- A failed model analysis is recoverable: the uploaded document stays stored and the UI explains that analysis is unavailable.
