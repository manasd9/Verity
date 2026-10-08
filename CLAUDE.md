# Verity

Local-only tool that evaluates FlexAgent agents (Node 24, http://127.0.0.1:4173). Scope and progress: the Status section of `docs/VERITY_IMPROVEMENT_PLAN.md`.

- **Gate:** `npm run check` (formatting, syntax, tests) must pass; the pre-commit hook runs it. `npm run format` fixes formatting.
- **Dev server:** `npm run dev` restarts on server-code edits; a request during the restart fails with "Failed to fetch".
- **Page scripts** load in order `shared/answer-checks.js` → `ui/livekit-capture.js` → `app.js` (see `index.html`). Files in `shared/` and `ui/` are plain scripts that also `require()` in Node; `server.js` serves each from an explicit route list.
- **Page refactors:** `npm run compare-render -- <base-commit>` proves every page renders the same HTML.
- **Tests:** `test.mjs` reaches helpers still inside `app.js` through `topLevel(js, name)`; about 130 checks match exact source text, so a pure rewording can fail them.
- **Data:** `data/store.json` (gitignored) holds client data and encrypted keys; read it with a script that prints only the fields you need.
- **FlexAgent backend:** `C:\Users\mdani\Documents\MATP\matp-backend-staging`, read-only reference.
