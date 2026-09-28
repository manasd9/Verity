# Technical Blueprint deletion

## Goal

Let users remove a selected Technical Blueprint document from its page, including its chunks, chats, datasets, evaluations, and document-specific settings.

## Scope

- Add a **Remove document** button to the selected Technical Blueprint view.
- Use a native confirmation prompt that clearly states the deletion is permanent and includes related chat and evaluation data.
- On confirmation, call the existing `DELETE /api/technical-documents/:id` endpoint.
- On success, remove the technical document and its related datasets, evaluations, chats, and agent configurations from the browser state, clear active technical selection, and render the next available document or empty state.

## Boundaries

- Reuse `removeTechnicalDocumentData`; do not create another delete route or store representation.
- Do not affect operational documents or their related records.
- A cancelled confirmation makes no request and changes no UI state.

## Verification

- Add static UI assertions for the technical remove control, confirmation, delete request, and local-state cleanup.
- Run `node --check app.js` and `npm test`.
