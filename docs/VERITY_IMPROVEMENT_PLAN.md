# Verity improvement plan — 30 September 2026

## Why this plan

Verity tests FlexAgent agents from the outside. It asks questions through the LiveKit widget, reads the answers, and has a judge model score them against rubrics. It does not need access to the client's code.

Before Verity offers more kinds of tests or prompt versioning to clients, it needs to be trustworthy: a score must change only when the agent actually changed. Items 1 and 2 fix that. Items 3 and 4 are what clients will value most.

Tool-call evaluation is out of scope for this plan. It is built inside FlexAgent; see [FLEXAGENT_TOOL_EVALUATION_HANDOFF.md](FLEXAGENT_TOOL_EVALUATION_HANDOFF.md).

---

## Fix first: make scores trustworthy

### 1. Capture the full answer

**Problem.** Verity keeps the first message the agent sends after the question, then hangs up (`app.js:677-681`, `liveKitAnswer`). If a tool takes more than 1 second, FlexAgent first says a short filler line such as "One moment please…". This comes from `MATP\matp-backend-staging\src\packages\utilities\status-update.mjs` (`DELAY_MS = 1_000`) and is used by `search_knowledge` and HTTP tools. The filler arrives as its own message. Verity would then send only the filler to the judge, which scores it 0. The real answer never reaches the judge.

**Status.** This has not happened yet. The one saved FlexAgent run on 29 Sep had full answers of 160–340 characters. It will happen whenever the search or a client's API is slow.

**Fix.**
- Keep collecting every `lk.transcription` message after the question.
- Stop only when the agent has finished its turn: its `lk.agent.state` attribute returns to `listening` after it has been `thinking` or `speaking`.
- Add a short quiet period to be safe.
- Join all the text and send it to the judge. The judge can ignore the filler part.
- Keep the existing 90-second timeout.

**Done when:** a test with a forced slow tool produces the full answer, not just the filler.

### 2. Make the judge consistent

**Problem.** The judge can give the *same* answer different scores on different runs, for example 85 on Monday and 70 on Tuesday. Then a comparison like "prompt v1 scored 78%, v2 scored 72%" means nothing, because we can't tell whether the agent got worse or the judge graded more strictly. Verity does not set temperature for any model call (`server.js:215`, `callModel`), so the provider's default randomness applies.

**Fix.**
- **Temperature:** not a user choice. Always send the lowest value for judge calls. Some models do not accept a temperature setting, for example OpenAI reasoning models. Skip it for those rather than sending it and getting an error.
- **Reasoning level:** a Low / Medium / High option on the control connection, shown only for models that support it. Higher means more careful grading, but it is slower and more expensive.
- **Save the judge model, temperature and reasoning level with every evaluation run.**
- **Warn when comparing two runs** that used different judge settings.

**Done when:** scoring the same saved answer 5 times gives the same verdict, and the scores are equal or within a few points.

---

## Build next: most value for clients

### 3. "Questions the docs don't answer" tests

**Problem.** Every current test question is generated *from* the documents, so the answer always exists. We never test what the agent does when the answer is **not** there. An agent can score 100% and still make things up whenever it doesn't know. That is what clients fear most.

FlexAgent already tells every agent not to invent details: `lk-agent.mjs:89` says *"If the context does not contain the answer, say you do not know rather than inventing details."* Writing it in the prompt does not guarantee the agent follows it, so Verity checks whether it works.

**Fix: reuse the existing rubric system.**
- Add a new test-case type, "should decline":
  - Question: for example, "Do you have a rooftop pool?"
  - Required point: says it doesn't have that information, or offers to connect the user to staff.
  - Forbidden point: invents any details.
- `normalizeDatasetCase` (`server.js:141-155`) currently requires an expected answer and source evidence. It needs to allow this type.
- **Make it part of normal dataset generation, not a separate step.**
  - Today the generator requires every case to cite the passage that supports it (`server.js:478`, `sourceIndexedCases`), and cases without a source are dropped. Add a mixed mode.
  - By default, about **20%** of generated cases are "should decline", in three kinds:
    - **Close but missing** (the most important kind): the topic is covered, but the detail isn't. Example: "Do you have a rooftop pool?"
    - **Wrong assumption**: the question assumes something the documents don't say. Example: "Since breakfast is free, what time does it start?"
    - **Off-topic**: only a few needed.
- A human reviews them before approval, as with normal cases. They are clearly labelled "should decline".
- **Catch:** the question must not be answered in any of the client's *other* documents or website pages. Otherwise an agent that answered correctly would fail.
- **Always test alongside normal questions.** A stricter prompt can make the agent refuse things it *does* know, so report both scores:
  - "answers when it should" (normal questions);
  - "declines when it should" (the new type).

**Done when:** a dataset can mix both types, and results show a separate score for each.

### 3b. Suggest how many test cases to generate

**Problem.** Today the user picks a number: the default is 10 and the maximum is 30 (`server.js:767`, `server.js:478`). Clients won't know the right amount.
- Too few, and the score jumps around: with 10 cases, one failure moves the score by 10%, which makes version comparison unreliable.
- Too many costs review time (about 30–60 seconds per case), run time (roughly 10–20 seconds per case over the widget) and model cost.

**Fix.**
- Verity **suggests** the number and the client can change it. Aim for about 2 cases per topic in the source, using the existing chunks, plus about 20% "should decline" cases.
- Rough guide:
  - small source (FAQ, a few pages): 15–20;
  - medium (a manual, a small website): 30–50;
  - large: 50–100.
- For large sources, generate section by section so the 30-case limit per request isn't a blocker.
- Show a **coverage view** of which topics or sections have cases and which have none.

**Done when:** the generate form shows a suggested count with a short reason ("about 15 topics → 36 cases"), and results show which parts of the source are untested.

### 4. Prompt versioning with before/after comparison

**Goal.** Show whether a prompt change helped or hurt, and which questions changed.

**Approach.**
- FlexAgent stays the owner of prompts; it already stores prompt versions. Verity does **not** store or edit prompts.
- Each evaluation run is tagged with a version, either:
  - a label the user types, such as "v3 – shorter answers"; or, later,
  - the prompt version fetched from FlexAgent, which needs a small FlexAgent API.
- Also record the document version each run used, so a document change isn't blamed on the prompt.
- **Comparison view:** "v3 scored 82%, v2 scored 88%. These 4 questions got worse, these 2 got better." The two runs must use the same dataset and the same judge settings (see item 2).

**Done when:** two runs of the same dataset can be compared side by side, with a per-question better/worse/same result.

---

## Ask the FlexAgent team now

### 5. Mark test chats

Each Verity test joins the widget as a normal visitor and has a real conversation, so it shows up in:
- the client's History;
- usage numbers;
- possibly billing.

Example: 16 test questions every night means 16 fake "customers" a day in the client's reports.

FlexAgent decides the visitor's identity when it issues the widget token (`POST /v1/livekit/token`), so this change is on their side. The request: let Verity's token requests carry a "test" flag. FlexAgent then labels those conversations and can hide them from History, reports and billing, or show them under a "Tests" filter.

---

## Later

Once items 1–4 are stable, these test types can be added:

| Test | What it catches | Needs first |
|---|---|---|
| Same question, asked several times | Is the answer stable? Report a pass rate, e.g. "4 of 5". | Item 2 |
| Same question, different wording | Same facts for 3 rewordings? | Item 2; reviewed rewordings |
| Multi-turn memory | Remembers earlier messages | The widget path supports one question per room today (`app.js:690`, `server.js:891`) |
| Tricky / unsafe questions | Prompt injection, requests for other customers' data, rude or off-topic users | Client permission; multi-turn support |
| Tone and style | Follows the client's persona, length and brand rules | The rules as input, fetched from FlexAgent's agent settings or typed in |
| Other languages | Works for non-English users | Only if a client needs it |

Code note: scoring is written directly into three evaluation routes (`server.js:800-901`). Before adding several new test types, give each type its own scoring function and its own score, so they don't all end up in one average (`server.js:898`).
