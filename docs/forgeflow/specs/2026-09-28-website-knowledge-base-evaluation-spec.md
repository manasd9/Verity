# Website knowledge-base evaluation specification

## Outcome

An evaluator enters the same public website URL used as an agent knowledge
base, reviews Verity's crawl, then uses the existing Customer chat, golden
dataset, evaluation, and Results screens with that website as the source.
Document behavior and saved document records retain their current meaning.

## Scope and boundaries

- Website ingestion is independent of the evaluated agent. Version 1 sends no
  requests to an external agent and requires no external-agent connection.
- The answer-producing target for website chat and evaluation is an existing
  local model connection. The existing control connection creates draft cases,
  supplies embeddings, and scores target answers.
- Public, unauthenticated HTTP and HTTPS pages are supported. Login, cookies,
  custom request headers, linked documents, sitemaps, scheduled crawling, and
  source synchronization are outside version 1.
- A crawler snapshot describes what Verity successfully collected. It is not
  proof that another product indexed the same pages or text.

## User journey

1. An evaluator adds a website source by entering a root URL.
2. Verity validates the URL and crawls the root subtree. The source view lists
   collected pages, failed/skipped URLs and reasons, crawl time, and whether a
   safety or completeness limit was reached. The evaluator can read each
   collected page's extracted text before generating cases.
3. Each completed snapshot appears in the existing Customer chat source
   selector. Selecting it uses the existing local target model and retrieval
   flow, limited to chunks from that snapshot. Chat history stays associated
   with the selected snapshot.
4. The existing Golden datasets screen accepts a completed website snapshot.
   The control model drafts customer questions, expected answers, required
   points, forbidden points, and an exact supporting excerpt with its page
   URL. The evaluator edits and approves cases through the existing review
   workflow.
5. The existing Run evaluation action retrieves from the selected website
   snapshot, asks the selected local target model each approved question, and
   asks the control model to score its answer against the approved case.
   Results and exported reports show the target, snapshot identity, page URL,
   supporting excerpt, retrieved website chunks, and verdict.
6. Re-crawl is evaluator-triggered. It creates a new snapshot under the same
   website source. Existing chats, datasets, evaluations, and reports continue
   to refer to their original snapshot.

## Website collection

- Accept only absolute public `http:` or `https:` URLs. Reject credentials in
  URLs, loopback, private, link-local, multicast, and other non-public network
  destinations. Validate DNS results and every navigation, redirect, and page
  resource request; deny unsafe destinations before the browser accesses them.
- Restrict followed links to the input URL's origin and path subtree. Normalize
  fragments away and deduplicate discovered/final URLs. Reject redirects that
  leave the allowed scope. Query-string variants must not cause an unbounded
  crawl; visited URLs and request limits apply to them as well.
- Respect `robots.txt` for pages that may be crawled. If robots cannot be
  checked safely, report the affected page as skipped or failed rather than
  silently treating it as allowed.
- Render pages in a browser, wait for load, and perform bounded scrolling so
  JavaScript content can appear. Extract visible page content after removing
  scripts, metadata, and repeated header/footer chrome. Preserve page title,
  final URL, headings, and cleaned Markdown-like text. Do not follow or ingest
  media, archives, office files, or PDF links.
- Stop after 100 successfully collected pages, 300 attempted page URLs, or a
  ten-minute crawl budget, whichever occurs first. Use bounded per-page
  navigation, resource, and retry timeouts. Show which limit ended the crawl.
  A snapshot with at least one usable page may be marked `complete` or
  `incomplete`; a root-page failure yields `failed` and cannot be used.
- Store a content hash per collected page. If text is truncated to satisfy a
  storage or embedding budget, mark that page incomplete and exclude its
  omitted text from claims about coverage.

## Storage and source identity

- Store website sources, immutable snapshots, and per-page records in the
  existing local JSON store. A website source holds its root URL; each snapshot
  holds its source ID, crawl settings and timestamp, status, limits reached,
  and page IDs. Each page holds URL, title, extracted text, hash, status, and
  any failure/skip reason. Do not expose vectors or secrets in API responses.
- Website chunks use the existing JSON-backed vector collection and cosine
  ranking. Each chunk is tagged with snapshot ID, page URL, title, heading
  breadcrumb, chunk position, and content text. Split the cleaned page text
  by Markdown headings into approximately 4,096-character chunks. Embed with
  the existing OpenAI embedding connection. Chunking for uploaded documents
  remains unchanged.
- Chats and datasets refer to a snapshot ID. Evaluations retain the dataset's
  snapshot ID and target connection ID. Any API request that names a snapshot
  must verify it belongs to an existing website source and is usable.
- A new snapshot does not modify prior page records or chunk IDs. The UI shows
  snapshots by crawl time and labels incomplete ones.

## Golden-case integrity

- Website generation uses only saved page text from the selected snapshot.
  The prompt budget is bounded; selected source passages are distributed
  across pages and the dataset shows which pages produced cases. Generation
  never claims that a finite set of cases tests every page or fact.
- A website case stores `sourceUrl` and `sourceEvidence` in addition to the
  existing rubric fields. The excerpt must be a nonempty exact excerpt of the
  saved text of that URL in that snapshot. Generation rejects unsupported
  cases; saving or approving an edited website case validates its URL/excerpt
  again. Existing document-case validation and shape remain unchanged.
- The source URL and excerpt are passed to the control scorer and displayed in
  review, results, and downloaded reports. A model's claimed citation is not
  treated as evidence unless it matches the saved snapshot.

## Compatibility and errors

- Existing document routes, document chunking, document chat, and document
  evaluation keep their current responses and behavior. Website-specific
  fields are added only for website sources and cases.
- A website with no usable pages cannot be selected for chat, dataset
  generation, or evaluation. A partial crawl is usable only with an explicit
  `incomplete` label throughout the workflow.
- A crawl failure does not erase a previous snapshot. A failed embedding or
  store write leaves the new snapshot unusable and reports the error.
- The app must not silently route a website case through document-specific
  survey-memory logic or call an external target whose source corpus cannot
  be observed through the local retrieval path in this release.

## Acceptance checks

- A public test site can be crawled; page inventory, extracted text, URL
  provenance, and crawl limits appear in the UI.
- Website Customer chat retrieves only selected-snapshot chunks and receives
  an answer from the selected local target model.
- A website draft can be generated, edited, approved, run, and reported with
  expected answer, required/forbidden points, exact URL/excerpt evidence, and
  control-model scoring.
- Re-crawling preserves old snapshot IDs, case evidence, chats, and results.
- Tests reject unsafe URL forms, unsafe DNS/redirect/resource requests,
  out-of-scope links, invalid evidence, and retrieval across snapshots.
- `npm test`, `node --check server.js`, and `node --check app.js` pass for the
  existing document flows.
