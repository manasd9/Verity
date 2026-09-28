<p align="center">
  <img src="docs/verity-logo.svg" alt="Verity — source-grounded evaluation" width="560" />
</p>

<p align="center">
  Build reviewable, evidence-backed evaluations for RAG applications.
</p>

## What is Verity?

Verity is a local workspace for checking whether an AI assistant answers from
the source material it is supposed to know. It turns trusted documents into
reviewable golden scenarios, runs a target model against them, and has a
separate control model score the answers against explicit evidence and rubrics.

It is designed to make evaluation repeatable: every result can be traced back
to an expected answer, required and forbidden points, and supporting source
text.

## Current capabilities

- Upload PDF, DOCX, and TXT source documents.
- Use Customer chat to test a target model with retrieved source sections.
- Generate source-grounded draft scenarios with expected answers, required
  points, forbidden points, and evidence.
- Review, edit, approve, and run golden datasets.
- Score target answers with a separate control model and inspect the evidence
  and retrieval sections behind each result.
- Keep local customer-chat history and survey-memory evaluation cases.

## Evaluation flow

```text
Source document
      ↓
Reviewable golden scenarios
      ↓
Target model answers with retrieved source context
      ↓
Control model scores against the approved rubric
      ↓
Evidence-backed report
```

## Quick start

Requirements: a current Node.js LTS release and an API key for an
OpenAI-compatible model endpoint.

```bash
npm install
npx playwright install chromium
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173), then use **Settings** to
configure a customer-facing target model and a control model. Upload a source
document or crawl a public website, generate and approve a dataset, and run an
evaluation. The browser installation is required only for website sources.

Run the local regression checks with:

```bash
npm test
node --check server.js
node --check app.js
```

## Model roles

Verity deliberately separates the two roles in an evaluation:

- **Target model** — produces the customer-facing answer from retrieved source
  content.
- **Control model** — creates draft scenarios, supplies local retrieval
  embeddings, and judges answers against the approved rubric.

This separation helps avoid grading an answer only by the model that generated
it.

## Local data and secrets

Configuration and working data stay local:

- `.env` contains the local encryption key and must never be committed.
- `data/` contains the local workspace store and is ignored by Git.
- `node_modules/` is installed locally and is ignored by Git.

Use `.env.example` only as a configuration reference. Never place API keys or
other credentials in issues, pull requests, or chat.

## Roadmap

The following are planned and are not part of the current implementation:

- Website knowledge-base snapshots with source-page evidence.
- Additional external agent targets.
- Source-version and coverage comparison across evaluation runs.

## Project layout

```text
app.js       Browser UI
server.js    Local API, retrieval, and evaluation logic
test.mjs     Regression checks
docs/        Product and engineering notes
```

## Contributing

Keep changes small, preserve source evidence in evaluation artifacts, and run
the checks above before opening a pull request.
