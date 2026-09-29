# Forgeflow state

## Initiative
- Name: Website knowledge-base evaluation
- Mode: Balanced
- Current stage: implementation plan written; pending review
- Execution mode: sequential
- Recommended model: strong reasoning for planning; strong Node.js coding for implementation

## Artifacts
- Idea brief: docs/forgeflow/briefs/2026-09-28-website-knowledge-base-evaluation-brief.md (approved)
- Spec: docs/forgeflow/specs/2026-09-28-website-knowledge-base-evaluation-spec.md (written; pending review)
- Implementation plan: docs/forgeflow/plans/website-knowledge-base-evaluation.md (written; pending review)
- Tasks: pending
- Review: pending

## Decisions
- Public website URL source with manual, immutable crawl snapshots.
- Use existing Customer chat, dataset, evaluation, and local vector storage paths.
- Keep document behavior intact; defer external-agent integration.
- Limit each crawl to 100 successful pages with additional request/time bounds.

## Current task
- Reference: docs/forgeflow/plans/website-knowledge-base-evaluation.md
- Status: not started
- Tests run: not applicable (specification only)

## Next approval
- Pending stage: to-tickets
- Confirmation asked: no; plan review pending

## Concurrent workflow
- Name: FlexAgent login and agent picker
- Mode: Balanced
- Current stage: implementation complete; review passed
- Spec: docs/forgeflow/specs/2026-09-28-flexagent-login-agent-picker-spec.md
- Implementation plan: docs/forgeflow/plans/flexagent-login-agent-picker.md (approved)
- Tasks: docs/forgeflow/tasks/flexagent-login-agent-picker/
- Decision: server-side FlexAgent login; encrypted access token retained across restarts; agent names loaded with `agent:list`; selected agent uses the existing RAG-only LiveKit widget path.
- Current task: all FlexAgent login and agent picker tasks complete
- Tests: `npm test`, `node --check server.js`, `node --check app.js` passed.
- Review: docs/forgeflow/reviews/flexagent-login-agent-picker.md (passed)
- Next approval: none; user authorized continuous implementation.
