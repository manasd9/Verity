# Website knowledge-base evaluation brief

## Goal

Let evaluators use the same public website URL configured as an agent knowledge
base as a source in Verity. The evaluator can manually test it in existing
Customer chat, create evidence-backed golden scenarios, and run the existing
target-model/control-model evaluation flow.

## Product boundary

Verity remains an independent evaluator. It mirrors the publicly visible
website-source behavior relevant to fair evaluation, but it does not share a
crawler, queue, vector database, private traces, or deployment dependency with
the evaluated agent.

This feature does not add or change an external-agent API or LiveKit
integration. A configured external agent can use the resulting approved
datasets later through the existing target-connection work.

## Evaluator workflow

1. Add a public `http(s)` root URL as a website source.
2. Crawl it into an immutable snapshot, with pages, failures, skips, and crawl
   status visible to the evaluator.
3. Select a completed snapshot in existing Customer chat and ask the existing
   local target model questions from its retrieved website chunks.
4. Generate, review, edit, and approve the existing golden scenarios from that
   snapshot. Each case carries an exact page URL and source excerpt.
5. Run the existing evaluation flow: target model answers from website context;
   control model scores expected answer, required points, forbidden points, and
   source evidence.
6. Manually re-crawl when needed. Every re-crawl creates a new snapshot beneath
   the same website source; it never alters previous cases or results.

## Scope

- Public, unauthenticated websites only.
- Browser-rendered page content, matching the evaluated agent's known
  client-visible crawl behavior where practical.
- Root-subtree link scope, `robots.txt` respect, linked-document/media
  exclusions, chrome removal, Markdown cleanup, and heading-aware
  4,096-character website chunks.
- Maximum 100 successfully collected pages. Capped snapshots are usable but
  visibly incomplete.
- Existing local JSON vector storage, OpenAI embeddings, and cosine retrieval.
- Existing document upload, Customer chat, dataset, evaluation, scoring, and
  report behavior stays unchanged.

## Safety and exclusions

- Reject non-HTTP(S), private, loopback, link-local, and otherwise unsafe
  network destinations.
- Reject off-scope redirect destinations and record a skip reason.
- Use bounded page, time, and retry budgets to prevent unbounded work.
- Do not support login, cookies, custom headers, sitemaps, automatic scheduled
  refreshes, PDFs, or other linked-file ingestion in version 1.

## Data model

Add a website source with versioned snapshots, pages, and chunks. Chats,
datasets, and evaluations store the selected snapshot ID. Pages retain final
URL, title, cleaned text, crawl outcome, timestamps, and a content hash. Chunks
retain page provenance and heading breadcrumb so reports and scenarios show
exact evidence.

## Verification

- Existing regression checks still pass.
- Unit checks prove unsafe URL rejection, in-scope page filtering, page-cap
  behavior, snapshot immutability, page evidence provenance, and retrieval
  isolation by snapshot.
- A manual public-site smoke test proves Customer chat, scenario generation,
  approval, target-model evaluation, control-model score, and result evidence.
