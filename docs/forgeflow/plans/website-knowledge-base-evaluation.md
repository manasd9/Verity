# Website knowledge-base evaluation implementation plan

## Goal

Add public website snapshots as sources for the existing Customer chat,
golden-dataset, local target-model evaluation, and Results workflow. Keep
document behavior and the external-agent connection paths unchanged.

## Preconditions and risks

- The approved specification is
  `docs/forgeflow/specs/2026-09-28-website-knowledge-base-evaluation-spec.md`.
- The current app stores all workspace state and embeddings in `data/store.json`.
  New snapshot fields must load safely when older stores lack them. A crawl
  should build and index a candidate snapshot before publishing it as usable;
  failures must not overwrite prior snapshots.
- Browser rendering needs a browser runtime absent from `package.json`. Use
  one maintained Node browser package and document its Chromium setup. Avoid
  adding a crawl framework, vector database, queue, or second persistence layer.
- The browser must never make an unchecked network request. A guarded request
  path validates URL, scope, DNS addresses, redirects, and subresources before
  traffic is sent; tests must exercise that boundary. Disable browser service
  workers and nonessential browser network features that bypass interception.
- The current document dataset generator sends source passages in one prompt.
  Website generation needs a finite, cross-page passage selection and visible
  coverage, or a large site will exceed the model context and suggest false
  completeness.

## Ordered steps

### 1. Build a bounded public website collector

- Purpose: safely collect browser-rendered text from one URL subtree.
- Areas affected: a focused website-crawl module, browser dependency/runtime
  setup, and direct tests in `test.mjs` or a small Node test file.
- Work: normalize input and discovered URLs; enforce origin/path scope; guard
  DNS and every browser request, including redirects and resources; respect
  `robots.txt`; disable unauthorized request paths; exclude linked files;
  deduplicate pages; render and scroll within timeouts; remove page chrome and
  convert the visible content to heading-preserving text. Return collected,
  skipped, and failed page records with reasons and limit flags. Enforce the
  100-successful-page, 300-attempted-URL, and ten-minute limits.
- Dependencies: Node network primitives and the browser runtime. No model
  connection is required for collection.
- Risk: DNS rebinding or a browser request that bypasses the guard would make
  URL validation ineffective. Treat this as a blocking security check before
  exposing the route.
- Verification: deterministic tests for URL/DNS classes, path boundaries,
  redirects, resource blocking, robots failures, duplicate/query URLs, and
  each stopping limit; local browser smoke test on a controlled public site.

### 2. Persist versioned snapshots and website chunks

- Purpose: make each crawl an inspectable, immutable source version.
- Areas affected: `server.js` store defaults and serialization, new website
  create/re-crawl/read routes, existing `chunks` collection, and source
  selection metadata returned by `/api/state`.
- Work: add website, snapshot, and page records without changing legacy
  document shapes. Retain title, final URL, text, status/reason, hash, crawl
  time, and limit metadata. Apply heading-aware approximately 4,096-character
  website splitting; embed through the existing OpenAI control connection and
  store vectors tagged by snapshot and page. Publish a snapshot as usable only
  after its pages and chunks are durable. A failed re-crawl preserves older
  snapshots. Keep vectors and full page text out of the general state payload;
  provide an explicit page-text read endpoint for inspection.
- Dependencies: collector from step 1 and the existing embedding connection.
- Risk: embedding a large crawl can be slow or costly; cap text and total
  work, and visibly mark truncation/incompleteness. Do not silently replace a
  previous snapshot when indexing fails.
- Verification: legacy-store load, snapshot immutability, re-crawl versioning,
  failure recovery, per-page provenance, and retrieval isolation by snapshot.

### 3. Add website source controls to the existing UI

- Purpose: let an evaluator add a URL, inspect the crawl, and choose a version.
- Areas affected: `app.js` source/library view, shared source selectors, and
  `styles.css` only where existing components cannot show website metadata.
- Work: add a website URL form and re-crawl action; show snapshot time,
  collected/failed/skipped counts, cap and incomplete warnings, a page list,
  and extracted-page text. Add completed website snapshots to the existing
  Customer chat and Golden datasets selectors, clearly distinguished from
  uploaded documents. Keep old document labels and options functional.
- Dependencies: snapshot read routes from step 2.
- Verification: browser walkthrough for a successful and incomplete crawl,
  old snapshot selection after re-crawl, and existing document selector flow.

### 4. Route Customer chat and local evaluation through the selected snapshot

- Purpose: reuse target answering and control scoring while retrieving only
  the selected website's chunks.
- Areas affected: `server.js` source resolver, `/api/chat`,
  `/api/evaluations`, prompt/context formatting, `app.js` existing chat and
  evaluation forms.
- Work: resolve a website snapshot as an eligible source; reuse embedding and
  cosine ranking filtered by snapshot ID; provide URL/title/heading provenance
  with retrieved chunks to the local target model; save chat and evaluation
  source identity. Keep website chats out of policy-specific survey-memory
  processing. Reject unsupported external target modes for website runs in
  this release. Preserve current document branches.
- Dependencies: indexed snapshots from step 2 and source selection from step 3.
- Verification: a selected website chat answers from its own chunks; another
  snapshot cannot leak into retrieval; an unsupported target fails before a
  result is saved; document chat and evaluation checks remain green.

### 5. Generate and review URL-backed golden cases

- Purpose: create evaluable website scenarios with verifiable page evidence.
- Areas affected: `server.js` dataset generation/save/approval and
  `app.js` dataset review, Results, and report export.
- Work: choose a bounded spread of saved page passages; generate the existing
  case fields plus `sourceUrl`; validate that each excerpt appears on that URL
  in the chosen snapshot at generation, edit, and approval time. Record and
  show which pages contributed cases, without presenting the dataset as full
  site coverage. Use the existing scorer and aggregate result calculation;
  display source URL, excerpt, snapshot, target, and retrieved chunks in the
  result and downloaded report. Preserve document-case schema and editing.
- Dependencies: steps 2 and 4.
- Verification: unsupported URL/excerpt rejection, edited-case validation,
  dataset approval, target answer/control verdict, Results rendering, and
  report provenance.

### 6. Verify the complete workflow

- Purpose: prove the user journey works and the original document flow still
  behaves as before.
- Areas affected: focused regression checks and setup guidance in `README.md`.
- Work: document browser installation and website safety/coverage limits;
  exercise a small public site through add, crawl, inspect, Customer chat,
  golden-case generation/edit/approval, evaluation, report, and re-crawl. Use
  controlled model fixtures or existing test seams for automated checks;
  avoid requiring live credentials in CI.
- Dependencies: steps 1-5.
- Verification: `npm test`, `node --check server.js`, `node --check app.js`,
  and one manual end-to-end website run plus a document regression run.

## Test strategy

- Prioritize deterministic safety tests at the crawler boundary and source
  evidence checks at the dataset boundary. Both prevent misleading or unsafe
  evaluations.
- Use the existing Node `assert` test style and small pure helpers for URL
  scope, case validation, splitting, and snapshot filtering. Exercise a
  controlled local HTTP fixture through an injected test transport; keep the
  production collector's private-address rejection active. Never make the
  automated suite depend on a third-party website or model API.
- Keep a small browser smoke test for rendered content and the full UI flow.
  The run report should say which pages and snapshot were tested.

## Rollout or migration notes

- Additive JSON fields default to empty collections when older stores load.
  Existing document IDs, datasets, chats, and evaluations are not rewritten.
- A website source can be created before a model connection exists, but chat,
  scenario generation, and evaluation require the same target/control setup
  used today. An incomplete crawl remains labelled throughout those flows.
- No automatic schedule, external-agent call, or FlexAgent repository change is
  part of this plan.
