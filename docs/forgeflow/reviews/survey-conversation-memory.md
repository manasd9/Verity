# Survey conversation memory review

Full-state review against `docs/forgeflow/specs/survey-conversation-memory.md`. A Git baseline was unavailable, so this reviews the current implementation rather than a change-only diff.

## Standards

- **High — duplicate active facts:** `server.js:50-63, 174-181`. Every extraction receives the full transcript, while `appendSurveyFacts` accepts the same fact repeatedly. A valid extractor can therefore append duplicate active facts forever. Reject an existing `(kind, value, sourceMessageId)` or restrict extraction to the new turn and correction links.
- **High — unbounded retrieved history:** `server.js:174-181`. Retrieved older chat chunks are inserted in full, with no per-chunk or total history budget. A long earlier answer can exceed the model context despite the bounded-context design. Cap both chunk text and total history content.
- **High — missing conversation-history evidence:** `server.js:354-367; app.js:74-78`. Multi-turn evaluation computes history but does not store or render it. This prevents diagnosis of a memory-retrieval failure.
- **Medium — malformed memory is trusted:** `server.js:38-45`. Existing `surveyMemory` is defaulted only when absent; malformed ledgers are sent directly to the target. Validate/rebuild from transcript before use.
- **Medium — local data exposure:** `server.js:215-217, 392`. Serving the project root makes `data/store.json` publicly reachable if the process is reachable. Serve only UI files and bind local-only unless authentication is added.
- **Medium — stale browser connections:** `app.js:156-163`. Re-running OpenAI setup replaces saved target/control connections but appends new entries in browser state, leaving stale IDs selectable.
- **Test gap:** `test.mjs` needs route-level coverage for rollback, duplicate facts, bounded history, and multi-turn history evidence.

## Spec

- **High — malformed ledger recovery missing:** `server.js:33-44, 174-181`. The specification requires validating or rebuilding malformed survey memory from the transcript; the current code does neither.
- **High — memory updates after the target response:** `server.js:303-309, 359-365`. The new user answer is in recent transcript but is not in structured memory when the target is called. Extraction failure also happens after target generation.
- **Medium — per-turn history evidence is omitted:** `server.js:367; app.js:74`. Policy chunks and memory snapshots are stored, but the retrieved older history is not.
- **Medium — correction validation is ambiguous:** `server.js:57-63`. A `superseded` new fact need not name a predecessor, and duplicate supersession links are accepted.

Summary: 7 standards findings (worst: duplicate facts/unbounded context/missing evidence); 4 spec findings (worst: malformed-ledger recovery and update ordering).
