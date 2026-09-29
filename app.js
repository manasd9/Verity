const app = document.querySelector('#app');

let uploadedDocument = null;
let workspace = { documents: [], technicalDocuments: [], websites: [], websiteSnapshots: [], connections: [], flexAgentSession: null, datasets: [], evaluations: [], chats: [], agentConfigs: [] };
let flexAgentAgents = [];
let flexAgentOrganizations = [];
let workspaceMode = (() => { try { return localStorage.getItem('eval-workspace-mode') === 'flex' ? 'flex' : 'local'; } catch { return 'local'; } })();
let viewScope = null;
function selectedScope() {
  return workspaceMode === 'flex' && viewScope?.orgId && viewScope.agentId ? viewScope : null;
}
function canWriteWorkspace() {
  const scope = selectedScope(); const session = workspace.flexAgentSession;
  return workspaceMode === 'local' || Boolean(session?.connected && scope && scope.orgId === session.orgId && scope.agentId === session.selectedAgentId);
}
function inSelectedWorkspace(item) {
  const scope = selectedScope();
  return workspaceMode === 'local' ? !item.orgId && !item.agentId : Boolean(scope && item.orgId === scope.orgId && item.agentId === scope.agentId);
}
function scopeControls() {
  const session = workspace.flexAgentSession;
  const orgs = [...flexAgentOrganizations];
  const saved = [...workspace.documents, ...workspace.technicalDocuments, ...workspace.websites, ...workspace.websiteSnapshots, ...workspace.datasets, ...workspace.evaluations];
  for (const item of saved) if (item.orgId && !orgs.some(org => org.id === item.orgId)) orgs.push({ id: item.orgId, name: item.orgName || item.orgId });
  if (session?.orgId && !orgs.some(org => org.id === session.orgId)) orgs.push({ id: session.orgId, name: session.orgName || session.orgId });
  const agents = workspaceMode === 'flex' && viewScope?.orgId === session?.orgId ? [...flexAgentAgents] : [];
  for (const item of saved) if (workspaceMode === 'flex' && item.orgId === viewScope?.orgId && item.agentId && !agents.some(agent => agent.id === item.agentId)) agents.push({ id: item.agentId, name: item.agentName || item.agentId });
  if (workspaceMode === 'flex' && viewScope?.orgId === session?.orgId && session?.selectedAgentId && !agents.some(agent => agent.id === session.selectedAgentId)) agents.push({ id: session.selectedAgentId, name: session.selectedAgentName || session.selectedAgentId });
  const connected = Boolean(session?.connected);
  const orgOptions = `${workspaceMode === 'flex' && !viewScope?.orgId ? '<option value="" selected disabled>Choose an organization</option>' : ''}<option value="local" ${workspaceMode === 'local' ? 'selected' : ''}>Existing local workspace</option>${orgs.map(org => `<option value="${escapeHtml(org.id)}" ${workspaceMode === 'flex' && org.id === viewScope?.orgId ? 'selected' : ''}>${escapeHtml(org.name)}</option>`).join('')}`;
  const agentOptions = `<option value="">${workspaceMode === 'local' ? 'Local model / unassigned' : 'Choose an agent'}</option>${agents.map(agent => `<option value="${escapeHtml(agent.id)}" ${workspaceMode === 'flex' && agent.id === viewScope?.agentId ? 'selected' : ''}>${escapeHtml(agent.name)}</option>`).join('')}`;
  const help = workspaceMode === 'local' ? 'Existing unassigned sources and runs, including records created before agent selection was added.' : !connected ? 'You can view saved records. Reconnect FlexAgent in Settings to add sources or run evaluations.' : !viewScope?.orgId ? 'Choose an organization, then an agent.' : !viewScope.agentId ? 'Choose an agent to view its sources and evaluations.' : `Showing Eval Tool records for ${escapeHtml(agents.find(agent => agent.id === viewScope.agentId)?.name || viewScope.agentId)}. Clients manage this agent’s FlexAgent knowledge base separately.`;
  return `<section class="panel card-pad workspace-scope" aria-label="Evaluation workspace"><div class="form-grid"><div class="field"><label for="workspace-organization">Organization</label><select id="workspace-organization">${orgOptions}</select></div><div class="field"><label for="workspace-agent">Agent</label><select id="workspace-agent" ${workspaceMode !== 'flex' || !viewScope?.orgId ? 'disabled' : ''}>${agentOptions}</select></div></div><p class="help">${help}</p>${workspaceMode === 'flex' && !connected ? '<a href="#settings">Open Settings</a>' : ''}</section>`;
}
let reviewingDatasetId = null;
let viewingEvaluationId = null;
let activeChatId = null;
let chatDocumentId = null;
let chatTargetId = null;
let instructionDocumentId = null;
let instructionTargetId = null;
let settingsTab = 'openai';
let datasetDocumentId = null;
let viewingRetrievedChunks = null;
let technicalTab = 'overview';
let technicalUploadStatus = null;
const allDocuments = () => [...workspace.documents, ...(workspace.technicalDocuments || []), ...(workspace.websiteSnapshots || []).filter(item => ['complete', 'incomplete'].includes(item.status))];
const sidebarToggle = document.querySelector('#sidebar-toggle');
function setSidebarCollapsed(collapsed) {
  document.querySelector('.shell').classList.toggle('sidebar-collapsed', collapsed);
  sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
  sidebarToggle.setAttribute('aria-label', collapsed ? 'Show navigation' : 'Hide navigation');
  sidebarToggle.title = collapsed ? 'Show navigation' : 'Hide navigation';
  try { localStorage.setItem('sidebar-collapsed', String(collapsed)); } catch { /* Keep the control usable when storage is unavailable. */ }
}
sidebarToggle.addEventListener('click', () => setSidebarCollapsed(!document.querySelector('.shell').classList.contains('sidebar-collapsed')));
try { setSidebarCollapsed(localStorage.getItem('sidebar-collapsed') === 'true'); } catch { setSidebarCollapsed(false); }

function button(label, kind = 'secondary', extra = '') { return `<button class="button button-${kind} ${extra}" type="button">${label}</button>`; }
function status(text, kind) { return `<span class="status ${kind}">${text}</span>`; }
function header(title, subtitle, action = '') { return `<header class="page-top"><div><h1 class="page-title">${title}</h1><p class="page-subtitle">${subtitle}</p></div>${action}</header>`; }

function home() {
  const documents = allDocuments();
  const workflow = [{ page: 'documents', number: '01', title: 'Upload a source document', text: 'Add the policy, SOP, or technical blueprint that defines what good looks like.' }, { page: 'settings', number: '02', title: 'Connect your models', text: 'Set up the control model and, when available, the target connection.' }, { page: 'datasets', number: '03', title: 'Review the benchmark', text: 'Generate, check, and approve the golden scenarios and rubric.' }, { page: 'evaluation', number: '04', title: 'Run and share results', text: 'Evaluate a connected target or paste FlexAgent replies for scoring.' }];
  return `${header('Welcome to Verity', 'A practical workspace for testing whether an AI agent follows your source material.', button('Upload document', 'primary', 'js-upload'))}
    <section class="evaluation-hero welcome-hero"><span class="eyebrow">AGENT EVALUATION, MADE REVIEWABLE</span><h2>Build a benchmark before you judge an agent.</h2><p>Verity turns the documents your team trusts into source-backed scenarios, scoring criteria, and shareable evaluation reports.</p><div class="hero-actions button-row">${button('Upload a source document', 'primary', 'js-upload')}</div></section>
    <section class="workflow-guide" aria-labelledby="workflow-title"><div class="workflow-guide-head"><div><span class="eyebrow">YOUR WORKFLOW</span><h2 id="workflow-title">Four steps from source document to evidence.</h2></div><p>Each workspace section guides you through its next action.</p></div><ol>${workflow.map(step => `<li><a href="#${step.page}" data-page="${step.page}"><span class="workflow-number">${step.number}</span><span><strong>${step.title}</strong><small>${step.text}</small></span><i>→</i></a></li>`).join('')}</ol></section>
    <section class="metrics" aria-label="Workspace metrics"><article class="metric"><span class="metric-label">Documents</span><div class="metric-value">${documents.length}</div><span class="metric-note">${documents.length ? 'Ready for setup' : 'Start by uploading one'}</span></article><article class="metric"><span class="metric-label">Golden datasets</span><div class="metric-value">${workspace.datasets.length}</div><span class="metric-note">Create after reviewing your document</span></article><article class="metric"><span class="metric-label">Evaluations</span><div class="metric-value">${workspace.evaluations.length}</div><span class="metric-note">Your results will appear here</span></article><article class="metric"><span class="metric-label">Customer chats</span><div class="metric-value">${workspace.chats.length}</div><span class="metric-note">${workspace.chats.length ? 'Saved conversations' : 'Available after setup'}</span></article></section>`;
}

function evaluation() {
  const documents = allDocuments().filter(inSelectedWorkspace); const targets = workspace.connections.filter(connection => connection.role === 'target' && (workspaceMode === 'local' ? connection.kind !== 'flexagent-livekit' && connection.kind !== 'flexagent' : connection.kind === 'flexagent-livekit' && selectedScope()?.orgId === connection.orgId && selectedScope()?.agentId === connection.agentId)); const controls = workspace.connections.filter(connection => connection.role === 'control'); const approved = workspace.datasets.filter(dataset => dataset.status === 'approved' && inSelectedWorkspace(dataset)); const ready = canWriteWorkspace() && targets.length && controls.length && approved.length;
  const datasetLabel = item => `${documents.find(document => document.id === item.documentId)?.name || 'Unknown source'} · ${item.cases.length} scenarios`;
  const connectionField = (label, connections, id, role) => connections.length === 1 ? `<div class="field"><span class="connection-label">${label}</span><div class="connection-summary"><span class="connection-role">${role}</span><span><strong>${escapeHtml(connections[0].name)}</strong><small>${escapeHtml(connections[0].model)}</small></span></div><input id="${id}" type="hidden" value="${escapeHtml(connections[0].id)}" /></div>` : `<div class="field"><label for="${id}">${label}</label><select id="${id}">${connections.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}</select></div>`;
  const nextStep = workspaceMode === 'flex' ? !workspace.flexAgentSession?.connected ? 'Reconnect FlexAgent in Settings to run evaluations. Saved results remain available.' : !selectedScope() ? 'Choose an organization and agent above.' : !approved.length ? 'Add a source for this agent, generate a golden dataset, and approve it.' : !controls.length ? 'Connect a control model in Settings.' : 'Select this FlexAgent again to create its LiveKit target.' : 'Upload a source, connect target and control models in Settings, then approve a golden dataset.';
  const runner = ready ? `<section class="panel card-pad"><h2 class="minor-title">Run an approved evaluation</h2><form id="evaluation-form" class="form-grid"><div class="field"><label for="evaluation-dataset">Golden dataset</label><select id="evaluation-dataset">${approved.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(datasetLabel(item))}</option>`).join('')}</select></div>${connectionField('Target agent', targets, 'evaluation-target', 'AI')}${connectionField('Control model', controls, 'evaluation-control', 'QA')}<div class="field full"><button class="button button-primary" type="submit">Run evaluation</button><span class="help">The target agent answers each approved scenario, then the control model judges it against the saved rubric.</span></div></form></section>` : `<section class="panel card-pad"><h2 class="minor-title">Next step</h2><p class="page-subtitle">${nextStep}</p></section>`;
  const manualRunner = canWriteWorkspace() && approved.length && controls.length ? `<section class="manual-runner"><div class="manual-runner-intro"><span class="manual-runner-icon">↳</span><div><span class="eyebrow">MANUAL FLEXAGENT TEST</span><h2>Score pasted agent answers</h2><p>Collect replies in FlexAgent, paste them below, and score them against the approved benchmark.</p></div></div><ol class="manual-steps"><li><b>1</b><span>Ask each scenario</span></li><li><b>2</b><span>Paste each reply</span></li><li><b>3</b><span>Score with the control model</span></li></ol>${approved.map(dataset => `<details class="manual-evaluation"><summary><span><strong>${escapeHtml(datasetLabel(dataset))}</strong><small>Ready for ${dataset.cases.length} pasted replies</small></span><span class="manual-open">Open test <i>→</i></span></summary><form class="manual-evaluation-form form-grid" data-dataset-id="${escapeHtml(dataset.id)}"><div class="field full"><label>Control model<select name="controlConnectionId">${controls.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}</select></label></div>${dataset.cases.map((item, index) => `<div class="field full"><label for="manual-answer-${dataset.id}-${index}">Scenario ${index + 1}</label><p class="help">${escapeHtml(item.question)}</p><textarea id="manual-answer-${dataset.id}-${index}" name="answer" required placeholder="Paste the FlexAgent reply"></textarea></div>`).join('')}<div class="field full"><button class="button button-primary" type="submit">Score pasted answers</button><span class="help">One reply is required for each scenario.</span></div></form></details></section>`).join('')}</section>` : '';
  return `${header('Evaluation', 'Run an approved benchmark against a connected target or score replies collected from FlexAgent.')}${workspaceMode === 'flex' ? '<p class="help">The client uploads the matching source to this agent in FlexAgent separately.</p>' : ''}${runner}${manualRunner}`;
}

function documents() {
  const visibleDocuments = workspace.documents.filter(inSelectedWorkspace);
  const readyDocument = visibleDocuments.find(document => document.retrieval?.status === 'ready');
  const actions = `${canWriteWorkspace() ? button('Upload document', 'primary', 'js-upload') : ''}${workspaceMode === 'local' && readyDocument ? ` ${button('Try customer chat', 'secondary js-start-chat')}` : ''}${visibleDocuments.length ? ` ${button('Create golden dataset', 'secondary js-start-dataset')}` : ''}`;
  const content = visibleDocuments.length ? `<div class="document-list">${visibleDocuments.map(document => { const ready = document.retrieval?.status === 'ready'; return `<div class="document-item"><span class="document-icon">${escapeHtml(document.type)}</span><span><strong>${escapeHtml(document.name)}</strong><small>${document.characters.toLocaleString()} characters extracted · ${ready ? 'Retrieval ready.' : 'Retrieval unavailable — re-upload after connecting OpenAI.'}</small></span><span class="document-actions">${status(ready ? 'RAG ready' : 'Needs indexing', ready ? 'good' : 'draft')}<button class="button button-secondary button-small js-source-dataset" data-id="${escapeHtml(document.id)}" type="button">Generate dataset</button><button class="button button-secondary button-small js-remove-document" data-id="${escapeHtml(document.id)}" type="button">Remove</button></span></div>`; }).join('')}</div>` : '';
  const sites = (workspace.websites || []).filter(inSelectedWorkspace).map(site => { const snapshots = (workspace.websiteSnapshots || []).filter(snapshot => snapshot.websiteId === site.id); const latest = snapshots.at(-1); return `<div class="document-item"><span class="document-icon">WEB</span><span><strong>${escapeHtml(site.rootUrl)}</strong><small>${latest ? `${latest.pages.length} pages · ${escapeHtml(latest.status)}${latest.limit ? ` · ${escapeHtml(latest.limit)}` : ''}` : 'No completed crawl yet.'}</small></span><span class="document-actions">${latest ? status(latest.status === 'complete' ? 'Ready' : 'Incomplete', latest.status === 'complete' ? 'good' : 'draft') : ''}${latest ? `<button class="button button-secondary button-small js-source-dataset" data-id="${escapeHtml(latest.id)}" type="button">Generate dataset</button>` : ''}<button class="button button-secondary button-small js-recrawl-website" data-id="${escapeHtml(site.id)}" type="button">Re-crawl</button><button class="button button-secondary button-small js-remove-website" data-id="${escapeHtml(site.id)}" type="button">Remove</button></span></div>`; }).join('');
  return `${header('Sources', 'Upload a document or collect a public website as evidence for chat and evaluation.', `<div class="button-row">${actions}</div>`)}
    <div class="two-col"><section class="panel card-pad"><div class="file-drop"><label for="file-input">Upload document</label><input id="file-input" type="file" accept=".pdf,.docx,.txt" /></div>${content}<section class="website-source"><h2 class="minor-title">Website knowledge base</h2><form id="website-form" class="form-grid"><div class="field full"><label for="website-url">Public website URL</label><input id="website-url" required type="url" placeholder="https://example.com/help" /><span class="help">Verity collects the URL path and its public links into a saved snapshot.</span></div><div class="field full"><button class="button button-secondary" type="submit">Crawl website</button><span id="website-status" class="help" aria-live="polite"></span></div></form>${sites ? `<div class="document-list">${sites}</div>` : ''}</section></section>
    <aside class="callout"><h3>What happens next</h3><p>Your source becomes the evidence for the golden dataset, customer chat, and every evaluation result.</p></aside></div>`;
}

function technical() {
  const documents = workspace.technicalDocuments || []; const selected = documents.find(item => item.id === location.hash.split(':')[1]) || documents[0];
  const list = documents.map(item => `<button class="blueprint-file ${item.id === selected?.id ? 'active' : ''} js-open-technical" data-id="${escapeHtml(item.id)}" type="button"><span class="document-icon">${escapeHtml(item.type)}</span><span><strong>${escapeHtml(item.name)}</strong><small>${item.characters.toLocaleString()} characters · ${item.analysisStatus === 'ready' ? 'Blueprint ready' : 'Analysis unavailable'}</small></span></button>`).join('');
  const detail = selected?.analysisStatus === 'ready' ? technicalAnalysis(selected.analysis) : selected ? `<section class="blueprint-unavailable"><h2>Analysis unavailable</h2><p>${escapeHtml(selected.analysisError || 'Connect an OpenAI control model in Settings, then re-upload this document to create its blueprint.')}</p></section>` : `<section class="blueprint-unavailable"><h2>Start with a technical document</h2><p>Upload an engineering PDF, DOCX, or TXT file. It stays separate from policy chat and evaluations.</p></section>`;
  return `<div class="blueprint-top"><div><p class="breadcrumb">Your workspace <span>›</span> Technical Blueprint</p><div class="blueprint-title-row"><h1>Technical Blueprint</h1><span class="analysis-badge">● Source-grounded analysis</span></div><p>A plain-language map of how this system works.</p></div><div class="blueprint-actions"><label class="blueprint-search">⌕ <input id="technical-search" placeholder="Search this blueprint" aria-label="Search this blueprint" /></label><label class="button button-primary" for="technical-file-input">⇧ Upload technical document</label><input id="technical-file-input" type="file" accept=".pdf,.docx,.txt" /></div></div>
    <section class="blueprint-at-glance"><span class="at-glance-icon">◒</span><span><b>At a glance</b><small>This blueprint explains the system, its decisions, connections, and what still needs confirmation.</small></span></section>
    <div class="blueprint-layout"><aside class="blueprint-files"><h2>Documents</h2>${list || '<p>No technical documents yet.</p>'}</aside><main class="blueprint-detail">${detail}</main></div>`;
}
function technicalAnalysis(analysis) {
  const evidence = value => `<details class="blueprint-evidence"><summary>Source evidence</summary><p>${escapeHtml(value)}</p></details>`;
  const items = values => values?.length ? `<ul>${values.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ul>` : '<p>Not specified in this document.</p>';
  const pathway = item => /ticket|escalat|handoff|human/i.test(`${item.action} ${item.result}`) ? 'Escalation' : /api|call|live|query|service|data/i.test(`${item.action} ${item.result}`) ? 'Data source' : 'Knowledge or process';
  const paths = [...new Map(analysis.flows.map(item => [pathway(item), item])).entries()];
  const catalog = analysis.catalog || []; const groups = catalog.reduce((result, item) => { const name = item.dependencies && item.dependencies !== 'Not specified.' ? item.dependencies.split(/[;,]/)[0].trim() : 'Functions & components'; (result[name] ||= []).push(item); return result; }, {});
  const card = (icon, label, count, note, target) => `<a class="blueprint-stat" href="#${target}"><i>${icon}</i><span><b>${label}</b><strong>${count}</strong><small>${note}</small><em>View details →</em></span></a>`;
  const pathCards = paths.map(([label, item]) => `<article class="flow-path ${label === 'Escalation' ? 'escalation' : label === 'Data source' ? 'data-source' : ''}"><span>${label === 'Escalation' ? '↗' : label === 'Data source' ? '◈' : '▤'}</span><b>${escapeHtml(label)}</b><p>${escapeHtml(item.action)}</p><small>${escapeHtml(item.result)}</small>${evidence(item.sourceEvidence)}</article>`).join('');
  const catalogMarkup = Object.entries(groups).map(([group, entries]) => `<section class="catalog-group"><h3>${escapeHtml(group)}</h3>${entries.map(item => `<details data-search="${escapeHtml(`${item.name} ${item.purpose} ${item.whenToCall} ${item.dependencies}`)}"><summary><span><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.whenToCall)}</small></span><i>⌄</i></summary><dl><div><dt>Purpose</dt><dd>${escapeHtml(item.purpose)}</dd></div><div><dt>Inputs</dt><dd>${escapeHtml(item.inputs || 'Not specified')}</dd></div><div><dt>Outputs</dt><dd>${escapeHtml(item.outputs || 'Not specified')}</dd></div></dl>${evidence(item.sourceEvidence)}</details>`).join('')}</section>`).join('');
  return `<nav class="blueprint-tabs"><a href="#overview">Overview</a><a class="active" href="#how-it-works">How it works</a>${catalog.length ? '<a href="#apis">APIs & functions</a>' : ''}${analysis.examples?.length ? '<a href="#examples">Examples</a>' : ''}${analysis.overview.unknowns?.length ? '<a href="#questions">Open questions</a>' : ''}</nav>
  <section id="overview" class="blueprint-purpose"><div><span class="eyebrow">SYSTEM SUMMARY</span><h2>${escapeHtml(analysis.overview.purpose)}</h2>${evidence(analysis.overview.sourceEvidence)}</div><div class="blueprint-stats">${card('◇', 'Systems', analysis.overview.systems.length, 'Components and data sources', 'how-it-works')}${catalog.length ? card('⌘', 'APIs & functions', catalog.length, 'Calls, tools, and services', 'apis') : ''}${card('▤', 'Key rules', analysis.overview.keyRules.length, 'Documented decisions', 'how-it-works')}${analysis.overview.unknowns?.length ? card('?', 'Open questions', analysis.overview.unknowns.length, 'Items needing confirmation', 'questions') : ''}</div></section>
  <div class="blueprint-workspace"><section id="how-it-works" class="blueprint-flow-panel"><header><div><h2>How it works</h2><p>From a trigger to a final outcome, here is the path the document describes.</p></div><button class="js-show-overview" type="button">View source →</button></header><div class="flow-entry"><span>◎</span><b>Request or trigger</b><p>${escapeHtml(analysis.flows[0]?.trigger || 'A documented system event occurs.')}</p></div><div class="flow-arrow">↓</div><div class="flow-entry decision"><span>◉</span><b>Decision</b><p>The system selects the appropriate documented path.</p></div><div class="flow-branches">${pathCards || '<p>No branching path is documented.</p>'}</div><div class="flow-arrow">↓</div><div class="flow-entry result"><span>✓</span><b>Result</b><p>${escapeHtml(analysis.flows.at(-1)?.result || 'The documented outcome is returned.')}</p></div><div class="flow-details"><h3>All documented flows</h3>${analysis.flows.map((item, index) => `<details><summary><b>${index + 1}. ${escapeHtml(item.trigger)}</b><span>${escapeHtml(item.action)}</span></summary><p>${escapeHtml(item.result)}</p>${item.branch ? `<small>Condition: ${escapeHtml(item.branch)}</small>` : ''}${evidence(item.sourceEvidence)}</details>`).join('')}</div></section>
  <aside>${catalog.length ? `<section id="apis" class="blueprint-api-panel"><header><h2>APIs & functions</h2><label>⌕ <input class="js-catalog-search" placeholder="Search functions" aria-label="Search functions" /></label></header>${catalogMarkup}</section>` : ''}${analysis.overview.unknowns?.length ? `<section id="questions" class="blueprint-questions"><h2>Needs confirmation</h2>${analysis.overview.unknowns.map(item => `<details><summary><span>□</span>${escapeHtml(item)}</summary><p>Confirm this detail before treating it as an implementation rule.</p></details>`).join('')}</section>` : ''}</aside></div>
  ${analysis.examples?.length ? `<section id="examples" class="blueprint-example-panel"><h2>Examples</h2><p>Inputs and expected outcomes found in the document.</p>${analysis.examples.map(item => `<article><div><b>Input</b><p>${escapeHtml(item.input)}</p></div><span>→</span><div><b>System action / result</b><p>${escapeHtml(item.output)}</p></div>${evidence(item.sourceEvidence)}</article>`).join('')}</section>` : ''}`;
}

function technical() {
  const documents = workspace.technicalDocuments || [];
  const selected = documents.find(item => item.id === location.hash.split(':')[1]) || documents[0];
  const detail = selected?.analysisStatus === 'ready' ? technicalAnalysis(selected.analysis) : selected ? `<section class="blueprint-unavailable"><h2>Analysis unavailable</h2><p>${escapeHtml(selected.analysisError || 'Connect an OpenAI control model in Settings, then re-upload this document to create its blueprint.')}</p></section>` : `<section class="blueprint-unavailable"><h2>Start with a technical document</h2><p>Upload an engineering PDF, DOCX, or TXT file. It stays separate from policy chat and evaluations.</p></section>`;
  const uploadStatus = technicalUploadStatus ? `<p class="technical-upload-status ${technicalUploadStatus.kind}" role="status">${escapeHtml(technicalUploadStatus.message)}</p>` : selected ? `<p class="technical-upload-status ready" role="status">Blueprint ready: ${escapeHtml(selected.name)}</p>` : '';
  return `<div class="blueprint-simple-top"><div><div class="blueprint-title-row"><h1>Technical Blueprint</h1><span class="analysis-badge">Source-grounded</span></div><p>A plain-language guide to how this system works.</p>${selected ? `<p class="blueprint-document-name">Viewing: <strong>${escapeHtml(selected.name)}</strong></p>` : ''}${uploadStatus}</div><label class="button button-primary" for="technical-file-input">Upload document</label><input id="technical-file-input" type="file" accept=".pdf,.docx,.txt" /></div>${documents.length > 1 ? `<label class="blueprint-document-picker">Switch document <select id="technical-document-select">${documents.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === selected?.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>` : ''}${detail}`;
}

function technicalAnalysis(analysis) {
  const evidence = value => `<details class="blueprint-evidence"><summary>View source evidence</summary><p>${escapeHtml(value)}</p></details>`;
  const catalog = analysis.catalog || [];
  const groups = catalog.reduce((result, item) => { const name = item.dependencies && item.dependencies !== 'Not specified.' ? item.dependencies.split(/[;,]/)[0].trim() : 'Functions & components'; (result[name] ||= []).push(item); return result; }, {});
  const pathType = item => /ticket|escalat|handoff|human|queue|route.*incident/i.test(`${item.action} ${item.result}`) ? 'Escalation' : /api|call|live|query|service|data/i.test(`${item.action} ${item.result}`) ? 'Data source' : 'Knowledge or process';
  const paths = [...new Map(analysis.flows.map(item => [pathType(item), item])).entries()];
  const tabs = [['overview', 'Overview'], ['flow', 'How it works'], ...(catalog.length ? [['apis', 'APIs']] : []), ...(analysis.examples?.length ? [['examples', 'Examples']] : []), ...(analysis.overview.unknowns?.length ? [['questions', 'Open questions']] : [])];
  const tabButton = (id, label) => `<button class="js-technical-tab ${technicalTab === id ? 'active' : ''}" data-tab="${id}" type="button">${label}</button>`;
  const stat = (label, count, note, tab) => `<button class="blueprint-stat js-technical-tab" data-tab="${tab}" type="button"><b>${label}</b><strong>${count}</strong><small>${note}</small></button>`;
  const overview = `<section class="blueprint-guided overview"><span class="eyebrow">START HERE</span><h2>${escapeHtml(analysis.overview.purpose)}</h2><p>This document describes ${analysis.overview.systems.length} systems, ${catalog.length} APIs or functions, and ${analysis.overview.keyRules.length} important rules.</p>${evidence(analysis.overview.sourceEvidence)}<div class="blueprint-stats">${stat('Systems', analysis.overview.systems.length, 'Components and sources', 'flow')}${catalog.length ? stat('APIs', catalog.length, 'Tools and services', 'apis') : ''}${stat('Rules', analysis.overview.keyRules.length, 'Documented decisions', 'flow')}${analysis.overview.unknowns?.length ? stat('Open questions', analysis.overview.unknowns.length, 'Need confirmation', 'questions') : ''}</div><button class="button button-primary js-technical-tab" data-tab="flow" type="button">See how it works</button></section>`;
  const flow = `<section class="blueprint-guided"><header><h2>How it works</h2><p>Follow one path from the trigger to the result.</p></header><div class="flow-entry"><b>Request or trigger</b><p>${escapeHtml(analysis.flows[0]?.trigger || 'A documented system event occurs.')}</p></div><div class="flow-arrow">down</div><div class="flow-entry decision"><b>Decision</b><p>The system chooses the appropriate documented path.</p></div>${paths.length > 1 ? `<div class="flow-branches">${paths.map(([label, item]) => `<article class="flow-path"><b>${escapeHtml(label)}</b><p>${escapeHtml(item.action)}</p><small>${escapeHtml(item.result)}</small>${evidence(item.sourceEvidence)}</article>`).join('')}</div>` : `<div class="flow-path">${paths.map(([, item]) => `<b>${escapeHtml(item.action)}</b><p>${escapeHtml(item.result)}</p>${evidence(item.sourceEvidence)}`).join('')}</div>`}<div class="flow-arrow">down</div><div class="flow-entry result"><b>Result</b><p>${escapeHtml(analysis.flows.at(-1)?.result || 'The documented outcome is returned.')}</p></div><div class="flow-details"><h3>Explore each documented flow</h3>${analysis.flows.map((item, index) => `<details><summary><b>${index + 1}. ${escapeHtml(item.trigger)}</b></summary><p><b>Action:</b> ${escapeHtml(item.action)}</p><p>${escapeHtml(item.result)}</p>${item.branch ? `<small>Condition: ${escapeHtml(item.branch)}</small>` : ''}${evidence(item.sourceEvidence)}</details>`).join('')}</div></section>`;
  const apis = `<section class="blueprint-guided blueprint-api-panel"><header><div><h2>APIs & functions</h2><p>Open a function only when you need its details.</p></div><label>Search <input class="js-catalog-search" placeholder="Find a function" aria-label="Search functions" /></label></header>${Object.entries(groups).map(([group, entries]) => `<section class="catalog-group"><h3>${escapeHtml(group)}</h3>${entries.map(item => `<details data-search="${escapeHtml(`${item.name} ${item.purpose} ${item.whenToCall} ${item.dependencies}`)}"><summary><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.whenToCall)}</small></summary><dl><div><dt>Purpose</dt><dd>${escapeHtml(item.purpose)}</dd></div><div><dt>Inputs</dt><dd>${escapeHtml(item.inputs || 'Not specified')}</dd></div><div><dt>Outputs</dt><dd>${escapeHtml(item.outputs || 'Not specified')}</dd></div></dl>${evidence(item.sourceEvidence)}</details>`).join('')}</section>`).join('')}</section>`;
  const examples = `<section class="blueprint-guided blueprint-example-panel"><h2>Examples</h2><p>Inputs and outcomes found in this document.</p>${analysis.examples.map(item => `<article><div><b>Input</b><p>${escapeHtml(item.input)}</p></div><div><b>Result</b><p>${escapeHtml(item.output)}</p></div>${evidence(item.sourceEvidence)}</article>`).join('')}</section>`;
  const questions = `<section class="blueprint-guided blueprint-questions"><h2>Open questions</h2><p>Confirm these details before treating them as implementation rules.</p>${analysis.overview.unknowns.map(item => `<details><summary>${escapeHtml(item)}</summary><p>Confirm this with the document owner or supporting technical documentation.</p></details>`).join('')}</section>`;
  const content = { overview, flow, apis, examples, questions }[technicalTab] || overview;
  return `<nav class="blueprint-tabs">${tabs.map(([id, label]) => tabButton(id, label)).join('')}</nav>${content}`;
}

function technical() {
  const documents = (workspace.technicalDocuments || []).filter(inSelectedWorkspace);
  const selected = documents.find(item => item.id === location.hash.split(':')[1]) || documents[0];
  const detail = selected?.analysisStatus === 'ready' ? technicalAnalysis(selected.analysis) : selected ? `<section class="blueprint-unavailable"><h2>Analysis unavailable</h2><p>${escapeHtml(selected.analysisError || 'Connect an OpenAI control model in Settings, then re-upload this document to create its blueprint.')}</p></section>` : `<section class="blueprint-unavailable"><h2>Start with a technical document</h2><p>Upload an engineering PDF, DOCX, or TXT file.</p></section>`;
  const uploadStatus = technicalUploadStatus ? `<p class="technical-upload-status ${technicalUploadStatus.kind}" role="status">${escapeHtml(technicalUploadStatus.message)}</p>` : selected ? `<p class="technical-upload-status ready" role="status">Blueprint ready: ${escapeHtml(selected.name)}</p>` : '';
  const remove = documents.length ? `<section class="technical-document-list"><h2 class="minor-title">Technical documents</h2><div class="document-list">${documents.map(item => `<div class="document-item"><span class="document-icon">${escapeHtml(item.type)}</span><span><strong>${escapeHtml(item.name)}</strong><small>${item.characters.toLocaleString()} characters extracted · ${item.retrieval?.status === 'ready' ? 'Retrieval ready.' : 'Needs indexing.'}</small></span><span class="document-actions"><button class="button button-secondary button-small js-open-technical" data-id="${escapeHtml(item.id)}" type="button">Open</button><button class="button button-secondary button-small js-remove-technical-document" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}" type="button">Remove</button></span></div>`).join('')}</div></section>` : '';
  return `<div class="blueprint-simple-top"><div><div class="blueprint-title-row"><h1>Technical Blueprint</h1><span class="analysis-badge">Source-grounded</span></div><p>A plain-language guide to how this system works.</p>${selected ? `<p class="blueprint-document-name">Viewing: <strong>${escapeHtml(selected.name)}</strong></p>` : ''}${uploadStatus}</div><div class="button-row">${remove}<label class="button button-primary" for="technical-file-input">Upload document</label></div><input id="technical-file-input" type="file" accept=".pdf,.docx,.txt" /></div>${documents.length > 1 ? `<label class="blueprint-document-picker">Switch document <select id="technical-document-select">${documents.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === selected?.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>` : ''}${detail}`;
}

function technical() {
  const documents = workspace.technicalDocuments || [];
  const selected = documents.find(item => item.id === location.hash.split(':')[1]) || documents[0];
  const detail = selected?.analysisStatus === 'ready' ? technicalAnalysis(selected.analysis) : selected ? `<section class="blueprint-unavailable"><h2>Analysis unavailable</h2><p>${escapeHtml(selected.analysisError || 'Connect an OpenAI control model in Settings, then re-upload this document to create its blueprint.')}</p></section>` : `<section class="blueprint-unavailable"><h2>Start with a technical document</h2><p>Upload an engineering PDF, DOCX, or TXT file.</p></section>`;
  const rows = documents.map(item => `<div class="document-item ${item.id === selected?.id ? 'is-current' : ''}"><span class="document-icon">${escapeHtml(item.type)}</span><span><strong>${escapeHtml(item.name)}</strong><small>${item.characters.toLocaleString()} characters · ${item.retrieval?.status === 'ready' ? 'Retrieval ready' : 'Needs indexing'}</small></span><span class="document-actions"><button class="button button-secondary button-small js-open-technical" data-id="${escapeHtml(item.id)}" type="button">Open</button><button class="button button-secondary button-small js-remove-technical-document" data-id="${escapeHtml(item.id)}" type="button">Remove</button></span></div>`).join('');
  const list = rows ? `<details class="technical-library"><summary class="button button-secondary">Technical documents <span class="technical-library-count">${documents.length}</span></summary><section class="technical-library-menu" aria-label="Technical documents"><div class="technical-library-scroll">${rows}</div></section></details>` : '';
  const status = technicalUploadStatus ? `<p class="technical-upload-status ${technicalUploadStatus.kind}" role="status">${escapeHtml(technicalUploadStatus.message)}</p>` : selected ? `<p class="technical-upload-status ready" role="status">Viewing: ${escapeHtml(selected.name)}</p>` : '';
  return `<div class="blueprint-simple-top"><div><div class="blueprint-title-row"><h1>Technical Blueprint</h1><span class="analysis-badge">Source-grounded</span></div><p>A plain-language guide to how this system works.</p>${status}</div><div class="button-row blueprint-toolbar">${list}${selected ? `<button class="button button-secondary js-source-dataset" data-id="${escapeHtml(selected.id)}" type="button">Generate dataset</button>` : ''}<label class="button button-primary" for="technical-file-input">Upload document</label></div><input id="technical-file-input" type="file" accept=".pdf,.docx,.txt" /></div>${detail}`;
}

function datasets() {
  const controls = workspace.connections.filter(connection => connection.role === 'control');
  const documents = allDocuments(); const selectedDocumentId = documents.some(item => item.id === datasetDocumentId) ? datasetDocumentId : documents[0]?.id;
  const ready = documents.length && controls.length;
  const reviewing = workspace.datasets.find(dataset => dataset.id === reviewingDatasetId);
  if (reviewing) return datasetReview(reviewing);
  const drafts = workspace.datasets.map(dataset => { const document = documents.find(item => item.id === dataset.documentId); return `<div class="document-item"><span class="document-icon">SET</span><span><strong>${escapeHtml(document?.name || 'Unknown source')} · ${dataset.cases.length} scenarios</strong><small>${dataset.status === 'approved' ? 'Approved benchmark' : 'Draft ready for your review'}</small></span>${dataset.status === 'approved' ? `<span class="dataset-action">${status('Approved', 'good')}<button class="button button-secondary button-small js-review-dataset" data-id="${escapeHtml(dataset.id)}" type="button">View dataset</button></span>` : `<button class="button button-primary button-small js-review-dataset" data-id="${escapeHtml(dataset.id)}" type="button">Review draft</button>`}</div>`; }).join('');
  return `${header('Golden datasets', 'Your approved scenarios will define the correct standard for the target agent.')}
    <div class="two-col"><section class="panel card-pad">${ready ? `<h2 class="minor-title">Generate a draft dataset</h2><form id="generate-form" class="form-grid"><div class="field"><label for="dataset-document">Source</label><select id="dataset-document">${documents.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === selectedDocumentId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></div><div class="field"><label for="dataset-count">Scenarios</label><input id="dataset-count" type="number" min="1" max="30" value="10" /></div><div class="field full"><label for="dataset-control">Control model</label><select id="dataset-control">${controls.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}</select></div><div class="field full"><button class="button button-primary" type="submit">Generate draft scenarios</button><p id="generation-status" class="help" aria-live="polite">The control model will create a draft for you to review.</p></div></form>${drafts ? `<div class="document-list">${drafts}</div>` : ''}` : `<h2 class="minor-title">No golden datasets yet</h2><p class="page-subtitle">Add a source and a control-model connection in Settings first.</p>`}</section><aside class="callout"><h3>Your benchmark, not a guess</h3><p>Every approved case contains the customer scenario, expected outcome, required rules, and source evidence.</p></aside></div>`;
}

function datasetReview(dataset) {
  const editable = dataset.status !== 'approved';
  const cases = dataset.cases.map((item, index) => `<fieldset class="review-case"><legend>Scenario ${index + 1}</legend>${editable && dataset.cases.length > 1 ? `<button class="review-delete js-delete-scenario" data-index="${index}" type="button">Remove scenario</button>` : ''}<div class="form-grid"><div class="field full"><label>Customer question or scenario</label><textarea data-field="question" data-index="${index}" ${editable ? '' : 'readonly'}>${escapeHtml(item.question || '')}</textarea></div><div class="field full"><label>Expected answer</label><textarea data-field="expectedAnswer" data-index="${index}" ${editable ? '' : 'readonly'}>${escapeHtml(item.expectedAnswer || '')}</textarea></div><div class="field"><label>Required points (one per line)</label><textarea data-field="requiredPoints" data-index="${index}" ${editable ? '' : 'readonly'}>${escapeHtml((item.requiredPoints || []).join('\n'))}</textarea></div><div class="field"><label>Forbidden points (one per line)</label><textarea data-field="forbiddenPoints" data-index="${index}" ${editable ? '' : 'readonly'}>${escapeHtml((item.forbiddenPoints || []).join('\n'))}</textarea></div>${dataset.documentKind === 'website' ? `<div class="field full"><label>Website page URL</label><input data-field="sourceUrl" data-index="${index}" value="${escapeHtml(item.sourceUrl || '')}" ${editable ? '' : 'readonly'} /></div>` : ''}<div class="field full"><label>Source evidence</label><textarea data-field="sourceEvidence" data-index="${index}" ${editable ? '' : 'readonly'}>${escapeHtml(item.sourceEvidence || '')}</textarea></div><div class="field full"><label>Conversation turns (JSON, optional)</label><textarea data-field="turns" data-index="${index}" ${editable ? '' : 'readonly'} placeholder='[{"userMessage":"...","expectedAnswer":"...","requiredPoints":[],"forbiddenPoints":[],"sourceEvidence":"..."}]'>${escapeHtml((item.turns || []).length ? JSON.stringify(item.turns, null, 2) : '')}</textarea></div><div class="field full"><label>Expected final memory (JSON string array, optional)</label><textarea data-field="expectedFinalMemory" data-index="${index}" ${editable ? '' : 'readonly'} placeholder='["name: Sam", "city: Boston"]'>${escapeHtml((item.expectedFinalMemory || []).length ? JSON.stringify(item.expectedFinalMemory, null, 2) : '')}</textarea></div></div></fieldset>`).join('');
  const actions = editable ? `<div class="button-row"><button class="button button-secondary js-add-scenario" type="button">+ Add scenario</button><button class="button button-secondary" type="submit">Save changes</button><button class="button button-primary js-approve" data-id="${escapeHtml(dataset.id)}" type="button">Save & approve</button></div><p id="review-status" class="help" aria-live="polite">Write or verify the expected answer and evidence for every scenario before approving.</p>` : `<div class="review-footer"><p class="help">This benchmark is approved and ready to evaluate.</p><div class="button-row">${button('Back to datasets', 'primary', 'js-close-review')}${button('Go to evaluation', 'primary', 'js-go-evaluation')}</div></div>`;
  return `${header('Review golden dataset', `${dataset.cases.length} scenarios generated from your policy. Check the source evidence before approving.`, button('Back to datasets', 'primary', 'js-close-review'))}<section class="panel card-pad"><form id="dataset-review-form">${cases}${actions}</form></section>`;
}

function chat() {
  const targets = workspace.connections.filter(connection => connection.role === 'target' && connection.kind !== 'flexagent');
  const documents = allDocuments(); const ready = documents.length && targets.length;
  const active = workspace.chats.find(item => item.id === activeChatId);
  const documentId = active?.documentId || chatDocumentId || documents[0]?.id;
  const targetId = active?.connectionId || chatTargetId || targets[0]?.id;
  const messages = active?.messages?.length ? active.messages.map(message => `<article class="message ${message.role === 'user' ? 'user' : 'agent'}"><span class="who">${message.role === 'user' ? 'You' : 'Support agent'}</span><div class="bubble">${escapeHtml(message.content)}</div></article>`).join('') : '<p class="chat-empty">Ask a question to begin the conversation.</p>';
  const memory = (active?.surveyMemory?.facts || []).map(fact => `<li><strong>${escapeHtml(fact.kind === 'explicit' ? 'Answer' : 'Inference')}</strong> · ${escapeHtml(fact.value)} <small>${escapeHtml(fact.status)} · source ${escapeHtml(fact.sourceMessageId)}</small></li>`).join('') || '<li>No survey facts recorded yet.</li>';
  const history = workspace.chats.map(item => `<button class="history-item ${item.id === activeChatId ? 'active' : ''} js-open-chat" data-id="${escapeHtml(item.id)}" type="button"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(documents.find(document => document.id === item.documentId)?.name || 'Source')}</small></button>`).join('');
  return `${header('Customer chat', 'A live customer conversation, grounded in the selected source.')}${ready ? `<div class="chat-shell"><aside class="chat-history"><button class="button button-secondary js-new-chat" type="button">+ New chat</button><span class="history-label">RECENT CHATS</span>${history || '<p class="history-empty">Your conversations will appear here.</p>'}</aside><section class="panel chat-window"><div class="chat-title"><div><strong>Customer support</strong><span>Source-grounded agent</span></div><div class="chat-config"><label>Source<select id="chat-document">${documents.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === documentId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label><label>Agent<select id="chat-target">${targets.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === targetId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label></div></div><details class="survey-memory"><summary>Survey memory</summary><ul>${memory}</ul></details><div id="chat-messages" class="messages">${messages}</div><form id="customer-chat-form" class="chat-compose"><textarea id="customer-question" required rows="1" placeholder="Write a message…" aria-label="Message"></textarea><button class="button button-primary" type="submit">Send</button></form></section></div>` : `<section class="panel card-pad"><h2 class="minor-title">Customer chat is not configured yet</h2><p class="page-subtitle">Add a source and the target agent in Settings first.</p></section>`}`;
}

function gapDiagnosisMarkup(result) {
  if (result.pass || !result.gapDiagnosis) return '';
  const diagnosis = result.gapDiagnosis;
  return `<section class="gap-diagnosis"><h3>RAG investigation</h3><p><b>Likely issue:</b> ${diagnosis.categories.map(escapeHtml).join(' · ')}</p><p><b>Observed gap:</b> ${escapeHtml(diagnosis.why)}</p><p><b>What to inspect:</b> ${escapeHtml(diagnosis.teamFocus)}</p>${result.retrievalUnavailable ? '<small>Inferred from the answer and scoring rubric; no target retrieval trace was captured.</small>' : ''}</section>`;
}

function evaluationSummaryMarkup(evaluation) {
  const gaps = evaluation.results.map((result, index) => ({ result, number: index + 1 })).filter(item => !item.result.pass);
  if (!gaps.length) return '';
  const withCategory = category => gaps.filter(item => item.result.gapDiagnosis?.categories?.includes(category));
  const major = withCategory('Likely retrieval miss');
  const partial = withCategory('Partial retrieval coverage');
  const unsupported = withCategory('Unsupported or conflicting answer');
  const fallbacks = gaps.filter(item => /(?:do not|don't) have enough (?:confirmed )?information|cannot determine whether|unable to (?:confirm|determine)/i.test(item.result.answer || ''));
  const refs = items => items.map(item => `#${item.number}`).join(', ');
  const dominant = major.length >= 2 && major.length >= Math.ceil(gaps.length / 2);
  const finding = dominant
    ? `${major.length} of ${gaps.length} GAPs miss at least three quarters of their required points, across different questions.${fallbacks.length > 1 ? ` In ${fallbacks.length} GAPs, the agent says it lacks enough information.` : ''} The leading possibilities are missing retrieved evidence, evidence lost before generation, or an overly cautious fallback rule.`
    : `${gaps.length} scenarios have GAPs with a mix of missing information and unsupported content. The answer patterns do not point to one dominant failure mode.`;
  const firstCases = (major.length ? major : gaps).slice(0, 3);
  const traceNote = gaps.some(item => item.result.retrievalUnavailable) ? 'FlexAgent retrieval traces were not captured, so this is a hypothesis from the answers and rubrics.' : 'Confirm the hypothesis against the retrieved sections recorded for each scenario.';
  return `<section class="panel card-pad evaluation-diagnosis"><p class="eyebrow">ACROSS THIS EVALUATION</p><h2>Where to investigate first</h2><p class="evaluation-diagnosis-finding">${escapeHtml(finding)}</p><div class="evaluation-diagnosis-counts"><span><b>${major.length}</b> near-total misses</span><span><b>${partial.length}</b> partial coverage gaps</span><span><b>${fallbacks.length}</b> insufficient-info replies</span><span><b>${unsupported.length}</b> unsupported claims</span></div><ol><li><strong>Capture the evidence path.</strong> Replay representative scenarios ${escapeHtml(refs(firstCases))}; record the top retrieved chunks and the final context sent to the model.</li><li><strong>If the expected evidence is absent from retrieval,</strong> inspect document indexing, metadata filters, query matching, top-k, and ranking.</li><li><strong>If retrieval contains it,</strong> check context assembly and truncation. If it reaches the model but the agent still declines to answer, inspect grounding instructions and the fallback threshold.</li>${unsupported.length ? `<li><strong>Check unsupported content.</strong> For ${escapeHtml(refs(unsupported))}, compare the extra claim with the retrieved chunks and final context.</li>` : ''}</ol><p class="evaluation-diagnosis-limit">${escapeHtml(traceNote)} The exact internal cause needs the retrieved chunks and final prompt context.</p></section>`;
}

function evaluationSourceName(evaluation) { const dataset = workspace.datasets.find(item => item.id === evaluation.datasetId); return allDocuments().find(item => item.id === dataset?.documentId)?.name || 'Source'; }
function evaluationRunType(evaluation) { if (evaluation.manual) return 'Pasted answers'; if (evaluation.livekit) return evaluation.agentName || 'LiveKit widget'; return workspace.connections.find(item => item.id === evaluation.targetConnectionId)?.name || 'Target model'; }
function results() {
  const visibleRuns = workspace.evaluations.filter(inSelectedWorkspace);
  const latest = visibleRuns.find(item => item.id === viewingEvaluationId);
  const download = latest ? button('Download report', 'secondary', 'js-download-evaluation') : '';
  const label = evaluation => `${evaluationSourceName(evaluation)} · ${evaluationRunType(evaluation)} · ${evaluation.results.length} scenarios`;
  const picker = visibleRuns.length ? `<section class="panel evaluation-switcher"><label for="evaluation-history-select">${latest ? 'Viewing evaluation' : 'Open a saved evaluation'}</label><select id="evaluation-history-select"><option value="">Choose an evaluation</option>${visibleRuns.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === latest?.id ? 'selected' : ''}>${escapeHtml(label(item))} · ${escapeHtml(item.score)}% · ${new Date(item.createdAt).toLocaleString()}</option>`).join('')}</select></section>` : '';
  const detail = result => `<div class="evaluation-detail">${gapDiagnosisMarkup(result)}<section><b>Target answer</b><p>${escapeHtml(result.answer)}</p></section><section><b>Expected answer</b><p>${escapeHtml(result.case.expectedAnswer)}</p></section><section><b>Source evidence</b><p>${escapeHtml(result.case.sourceEvidence)}</p>${result.case.sourceUrl ? `<p>${sourceLink(result.case.sourceUrl, ' target="_blank" rel="noreferrer"')}</p>` : ''}</section><section><b>Rubric</b><p>Required:\n${escapeHtml((result.case.requiredPoints || []).join('\n') || 'None')}\n\nForbidden:\n${escapeHtml((result.case.forbiddenPoints || []).join('\n') || 'None')}</p></section>${result.turns ? `<section><b>Survey turns</b><p>${result.turns.map((turn, index) => `Turn ${index + 1}: ${turn.pass ? 'PASS' : 'GAP'} — ${escapeHtml(turn.answer)}`).join('\n')}</p><p>Final memory: ${result.memoryVerdict?.pass ? 'PASS' : `Missing ${escapeHtml(result.memoryVerdict?.missing?.join(', ') || 'values')}`}</p></section>` : ''}${result.retrievalUnavailable ? '<section><b>Retrieval</b><p>FlexAgent used its own knowledge base; Eval Tool has no retrieval evidence to display.</p></section>' : ''}</div>`;
  const selected = viewingRetrievedChunks && visibleRuns.find(item => item.id === viewingRetrievedChunks.evaluationId)?.results[viewingRetrievedChunks.resultIndex];
  const retrievalPanel = selected ? `<div class="retrieval-overlay"><section class="retrieval-panel" role="dialog" aria-modal="true" aria-labelledby="retrieval-title"><div class="retrieval-panel-head"><div><p class="eyebrow">RETRIEVAL EVIDENCE</p><h2 id="retrieval-title">Source sections sent to the target</h2><p>${escapeHtml(selected.case.question)}</p></div><button class="button button-secondary button-small js-close-retrieval" type="button">Close</button></div><div class="retrieval-list">${(selected.retrievedChunks || []).map((chunk, index) => `<details ${index === 0 ? 'open' : ''}><summary>Section ${index + 1}<span>${Number(chunk.score || 0).toFixed(2)} match</span></summary>${chunk.sourceUrl ? sourceLink(chunk.sourceUrl, ' target="_blank" rel="noreferrer"') : ''}<p>${escapeHtml(chunk.text)}</p></details>`).join('') || '<p>No retrieval evidence was recorded for this evaluation.</p>'}</div></section></div>` : '';
  return `${header('Results', 'Completed evaluations will appear here, with the target answer, rubric, score, and supporting source evidence.', download)}
    ${latest ? `${picker}<section class="panel card-pad"><h2 class="minor-title">Evaluation: ${escapeHtml(latest.score)}%</h2><p class="page-subtitle">${escapeHtml(label(latest))} · ${new Date(latest.createdAt).toLocaleString()}</p></section>${evaluationSummaryMarkup(latest)}<section class="panel card-pad"><h2 class="minor-title">Scenario results</h2><div class="document-list">${latest.results.map((result, index) => `<article class="evaluation-result ${result.pass ? 'is-pass' : 'is-gap'}"><div class="document-item"><span class="document-icon ${result.pass ? 'result-pass' : 'result-gap'}">${result.pass ? 'PASS' : 'GAP'}</span><span><strong>${escapeHtml(result.case.question)}</strong><small>${escapeHtml(result.rationale || 'No rationale returned.')}</small></span><strong class="score ${result.pass ? 'score-pass' : 'score-gap'}">${escapeHtml(result.score)}%</strong></div><div class="retrieval-trigger"><button class="button button-secondary button-small js-view-retrieval" data-evaluation-id="${escapeHtml(latest.id)}" data-result-index="${index}" type="button">View retrieved policy sections (${(result.retrievedChunks || []).length})</button></div>${detail(result)}</article>`).join('')}</div></section>${retrievalPanel}` : `<section class="panel card-pad"><h2 class="minor-title">No results yet</h2><p class="page-subtitle">Once you run an approved golden dataset against your target agent, this area will make every pass, gap, and unsupported claim easy to review.</p></section>`}`;
}

// Switches panels in place so unsaved input in other panels is kept.
function showSettingsTab(key) {
  settingsTab = key;
  document.querySelectorAll('.js-settings-tab').forEach(tab => { const active = tab.dataset.tab === key; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; });
  document.querySelectorAll('.settings-layout [role="tabpanel"]').forEach(panel => { panel.hidden = panel.id !== `settings-panel-${key}`; });
}
function settings() {
  const targets = workspace.connections.filter(connection => connection.role === 'target' && connection.kind !== 'flexagent');
  const target = targets.find(connection => connection.id === instructionTargetId) || targets[0];
  const document = workspace.documents.find(item => item.id === instructionDocumentId) || workspace.documents[0];
  const config = document && target && workspace.agentConfigs.find(item => item.documentId === document.id && item.connectionId === target.id);
  const connections = workspace.connections.length ? `<div class="document-list">${workspace.connections.map(connection => `<div class="document-item"><span class="document-icon">${connection.role === 'target' ? 'AI' : 'QA'}</span><span><strong>${escapeHtml(connection.name)}</strong><small>${connection.role === 'target' ? 'Target agent' : 'Control model'} · ${escapeHtml(connection.model)}</small></span><button class="button button-secondary button-small js-remove-connection" data-id="${escapeHtml(connection.id)}" type="button">Remove</button></div>`).join('')}</div>` : '';
  const promptForm = target && document ? `<form id="agent-prompt-form" class="form-grid agent-prompt"><div class="field"><label for="instruction-document">Policy document</label><select id="instruction-document">${workspace.documents.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === document.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></div><div class="field"><label for="instruction-target">Target agent</label><select id="instruction-target">${targets.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === target.id ? 'selected' : ''}>${escapeHtml(item.name)} · ${escapeHtml(item.model)}</option>`).join('')}</select></div><div class="field full"><label for="agent-system-prompt">Instructions for this policy</label><textarea id="agent-system-prompt" required>${escapeHtml(config?.systemPrompt || target.systemPrompt || 'Follow the policy document. Do not invent information. If it does not answer the question, say so clearly.')}</textarea><span class="help">Only used when this policy document is selected in customer chat or evaluation.</span></div><div class="field full form-actions"><button class="button button-secondary" type="submit">Save instructions for this policy</button></div></form>` : '';
  const session = workspace.flexAgentSession;
  const selectedAgent = session?.selectedAgentId;
  const flexAgentLogin = session?.connected ? `<h2 class="minor-title">FlexAgent connection</h2><section class="flexagent-connection" aria-label="FlexAgent connection status"><div class="flexagent-connection-status"><span class="status good">Connected</span></div><dl><div><dt>Organization</dt><dd>${escapeHtml(session.orgId)}</dd></div><div><dt>API</dt><dd>${escapeHtml(session.baseUrl)}</dd></div></dl></section><div class="form-grid"><div class="field full"><label for="flexagent-agent-picker">Choose FlexAgent</label><select id="flexagent-agent-picker" ${flexAgentAgents.length ? '' : 'disabled'}><option value="">${flexAgentAgents.length ? 'Choose an agent' : 'Load agents first'}</option>${flexAgentAgents.map(agent => `<option value="${escapeHtml(agent.id)}" ${agent.id === selectedAgent ? 'selected' : ''}>${escapeHtml(agent.name)}</option>`).join('')}</select><span class="help">${session.selectedAgentName ? `Selected: ${escapeHtml(session.selectedAgentName)}` : 'Each selected agent must allowlist this Eval Tool origin in FlexAgent Embed settings.'}</span></div><div class="field full"><div class="button-row"><button id="flexagent-load-agents" class="button button-secondary" type="button">Load agents</button><button id="flexagent-reconnect" class="button button-secondary" type="button">Reconnect FlexAgent</button></div></div></div>` : `<h2 class="minor-title">Connect FlexAgent</h2><form id="flexagent-login-form" class="form-grid"><div class="field"><label for="flexagent-login-url">FlexAgent API URL</label><input id="flexagent-login-url" required type="url" value="https://api-staging.flexagents.ai" /></div><div class="field"><label for="flexagent-login-org-id">Organization ID</label><input id="flexagent-login-org-id" required placeholder="FlexAgent organization ID" /></div><div class="field"><label for="flexagent-login-email">FlexAgent email</label><input id="flexagent-login-email" required type="email" autocomplete="username" /></div><div class="field"><label for="flexagent-login-password">FlexAgent password</label><input id="flexagent-login-password" required type="password" autocomplete="current-password" /></div><div class="field"><label for="flexagent-login-origin">Eval Tool origin</label><input id="flexagent-login-origin" required type="url" value="http://127.0.0.1:4173" /><span class="help">This exact origin must be allowed in the selected agent’s FlexAgent Embed settings.</span></div><div class="field full"><button class="button button-secondary" type="submit">Connect FlexAgent</button><span class="help">Your password is used only to sign in. Eval Tool stores the returned access token encrypted on this computer.</span></div></form>`;
  const flexAgentForm = `${flexAgentLogin}<details><summary>Manual FlexAgent target</summary><form id="flexagent-form" class="form-grid"><div class="field"><label for="flexagent-name">Name</label><input id="flexagent-name" value="FlexAgent target" /></div><div class="field"><label for="flexagent-url">FlexAgent API URL</label><input id="flexagent-url" required type="url" placeholder="https://flexagent.example.com" /></div><div class="field"><label for="flexagent-mode">Connection method</label><select id="flexagent-mode"><option value="api">Private evaluation API</option><option value="livekit">LiveKit widget path</option></select></div><div class="field"><label for="flexagent-org-id">Organization ID</label><input id="flexagent-org-id" required placeholder="FlexAgent organization ID" /></div><div class="field"><label for="flexagent-agent-id">Agent ID</label><input id="flexagent-agent-id" required placeholder="FlexAgent agent ID" /></div><div class="field"><label for="flexagent-origin">Eval Tool origin</label><input id="flexagent-origin" type="url" value="http://127.0.0.1:4173" /></div><div class="field full"><label for="flexagent-token">Evaluation service token</label><input id="flexagent-token" type="password" autocomplete="off" placeholder="Only required for Private evaluation API" /></div><div class="field full"><button class="button button-secondary" type="submit">Save FlexAgent target</button></div></form></details>`;
  const tabs = [['openai', 'OpenAI', true], ['flexagent', 'FlexAgent', true], ['instructions', 'Agent instructions', Boolean(promptForm)], ['models', `Connected models${workspace.connections.length ? ` (${workspace.connections.length})` : ''}`, Boolean(connections)]].filter(([, , available]) => available);
  const activeTab = tabs.some(([key]) => key === settingsTab) ? settingsTab : 'openai';
  const panel = (key, content) => `<section id="settings-panel-${key}" class="panel card-pad settings-card" role="tabpanel" aria-labelledby="settings-tab-${key}" ${key === activeTab ? '' : 'hidden'}>${content}</section>`;
  const tabList = `<div class="settings-tabs" role="tablist" aria-label="Settings sections">${tabs.map(([key, name]) => `<button id="settings-tab-${key}" class="settings-tab js-settings-tab" data-tab="${key}" type="button" role="tab" aria-controls="settings-panel-${key}" aria-selected="${key === activeTab}" tabindex="${key === activeTab ? 0 : -1}">${escapeHtml(name)}</button>`).join('')}</div>`;
  return `${header('Settings', 'Connect OpenAI once, then choose the models used for your customer agent and evaluation.') }<div class="two-col settings-layout"><div class="settings-stack">${tabList}${panel('openai', `<h2 class="minor-title">Connect OpenAI</h2><form id="openai-form" class="form-grid"><div class="field full"><label for="openai-key">OpenAI API key</label><input id="openai-key" required type="password" autocomplete="off" placeholder="Paste your OpenAI API key" /><span class="help">It is encrypted by the server and never shown again.</span></div><div class="field"><label for="target-model">Target model</label><input id="target-model" required value="gpt-5.6-luna" placeholder="Model that answers customers" /></div><div class="field"><label for="control-model">Control model</label><input id="control-model" required value="gpt-5.6-terra" placeholder="Model that creates and judges datasets" /></div><div class="field full form-actions"><button class="button button-primary" type="submit">Save OpenAI setup</button><span class="help">Saving replaces the existing OpenAI setup. A model request will confirm that your account has available API credits.</span></div></form>`)}${panel('flexagent', flexAgentForm)}${promptForm ? panel('instructions', `<h2 class="minor-title">Agent instructions</h2>${promptForm}`) : ''}${connections ? panel('models', `<h2 class="minor-title">Connected models</h2>${connections}`) : ''}</div><aside class="callout"><h3>One key, two jobs</h3><p>Your customer-facing target model answers questions. The control model creates golden datasets, judges answers, and creates local retrieval embeddings.</p></aside></div>`;
}

function datasets() {
  const documents = allDocuments().filter(inSelectedWorkspace); const controls = workspace.connections.filter(connection => connection.role === 'control');
  const selectedDocumentId = documents.some(item => item.id === datasetDocumentId) ? datasetDocumentId : documents[0]?.id;
  const reviewing = workspace.datasets.find(dataset => dataset.id === reviewingDatasetId && inSelectedWorkspace(dataset));
  if (reviewing) return datasetReview(reviewing);
  const drafts = workspace.datasets.filter(inSelectedWorkspace).map(dataset => { const source = documents.find(item => item.id === dataset.documentId); return `<div class="document-item"><span class="document-icon">SET</span><span><strong title="${escapeHtml(source?.name || 'Unknown document').replace(/"/g, '&quot;')}">${escapeHtml(source?.name || 'Unknown document')} · ${dataset.cases.length} scenarios</strong><small>${dataset.status === 'approved' ? 'Approved benchmark' : 'Draft ready for review'}</small></span><button class="button button-secondary button-small js-review-dataset" data-id="${escapeHtml(dataset.id)}" type="button">${dataset.status === 'approved' ? 'View dataset' : 'Review draft'}</button></div>`; }).join('');
  const library = drafts ? `<section class="panel card-pad dataset-library"><span class="eyebrow">YOUR BENCHMARKS</span><h2 class="minor-title">Golden datasets</h2><div class="document-list">${drafts}</div></section>` : `<aside class="callout dataset-guide"><span class="eyebrow">WHAT YOU WILL CREATE</span><h2>Your benchmark, not a guess</h2><p>Every approved case contains the customer scenario, expected outcome, required rules, and source evidence.</p><ol><li>Generate a draft from your document.</li><li>Check each expected answer and evidence.</li><li>Approve it for evaluation.</li></ol></aside>`;
  const sourceLabel = item => item.kind === 'website' ? `${item.name} (Website snapshot)` : `${item.name} (${item.kind === 'technical' ? 'Technical Blueprint' : 'Operational document'})`;
  return `${header('Golden datasets', 'Create reviewable scenarios from a selected source.')}<div class="dataset-workspace"><section class="panel card-pad">${documents.length && controls.length ? `<h2 class="minor-title">Generate a draft dataset</h2><form id="generate-form" class="form-grid"><div class="field"><label for="dataset-document">Source</label><select id="dataset-document">${documents.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === selectedDocumentId ? 'selected' : ''}>${escapeHtml(sourceLabel(item))}</option>`).join('')}</select></div><div class="field"><label for="dataset-count">Scenarios</label><input id="dataset-count" type="number" min="1" max="30" value="10" /></div><div class="field full"><label for="dataset-control">Control model</label><select id="dataset-control">${controls.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}</select></div><div class="field full"><button class="button button-primary" type="submit">Generate draft scenarios</button><p id="generation-status" class="help" aria-live="polite">The control model drafts source-backed scenarios for review.</p></div></form>` : '<h2 class="minor-title">No sources or control model yet</h2><p class="page-subtitle">Add a source and a control-model connection in Settings.</p>'}</section>${library}</div>`;
}

function chat() {
  const documents = [...workspace.documents.filter(item => item.retrieval?.status === 'ready'), ...workspace.technicalDocuments, ...(workspace.websiteSnapshots || []).filter(item => ['complete', 'incomplete'].includes(item.status) && item.retrieval?.status === 'ready')]; const targets = workspace.connections.filter(connection => connection.role === 'target' && connection.kind !== 'flexagent');
  const active = workspace.chats.find(item => item.id === activeChatId); const documentId = active?.documentId || chatDocumentId || documents[0]?.id; const targetId = active?.connectionId || chatTargetId || targets[0]?.id;
  const messages = active?.messages?.length ? active.messages.map(message => `<article class="message ${message.role === 'user' ? 'user' : 'agent'}"><span class="who">${message.role === 'user' ? 'You' : 'Agent'}</span><div class="bubble">${escapeHtml(message.content)}</div></article>`).join('') : '<p class="chat-empty">Ask a question about the selected document.</p>';
  const history = workspace.chats.map(item => { const sourceName = allDocuments().find(document => document.id === item.documentId)?.name || 'Document'; return `<button class="history-item ${item.id === activeChatId ? 'active' : ''} js-open-chat" data-id="${escapeHtml(item.id)}" type="button" title="${escapeHtml(`${item.title}\n${sourceName}`).replace(/"/g, '&quot;')}"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(sourceName)}</small></button>`; }).join('');
  const label = item => item.kind === 'website' ? `${item.name} (Website snapshot)` : `${item.name} (${item.kind === 'technical' ? 'Technical Blueprint' : 'Operational document'})`;
  return `${header('Customer chat', 'Ask a target agent questions grounded in the selected source.')}${documents.length && targets.length ? `<div class="chat-shell"><aside class="chat-history"><button class="button button-secondary js-new-chat" type="button">+ New chat</button><span class="history-label">RECENT CHATS</span>${history}</aside><section class="panel chat-window"><div class="chat-title"><div><strong>Grounded agent</strong><span>Source-backed answers</span></div><div class="chat-config"><label>Source<select id="chat-document">${documents.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === documentId ? 'selected' : ''}>${escapeHtml(label(item))}</option>`).join('')}</select></label><label>Agent<select id="chat-target">${targets.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === targetId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label></div></div><div id="chat-messages" class="messages">${messages}</div><form id="customer-chat-form" class="chat-compose"><textarea id="customer-question" required rows="1" placeholder="Ask a question…" aria-label="Message"></textarea><button class="button button-primary" type="submit">Send</button></form></section></div>` : '<section class="panel card-pad"><h2 class="minor-title">Customer chat is not configured yet</h2><p class="page-subtitle">Add a source and a model target in Settings.</p></section>'}`;
}

const pages = { home, evaluation, documents, technical, datasets, chat, results, settings };
function render(page = location.hash.slice(1).split(':')[0] || 'home') {
  const scopedPages = new Set(['documents', 'datasets', 'evaluation', 'results', 'technical']);
  app.innerHTML = `${scopedPages.has(page) ? scopeControls() : ''}${pages[page] ? pages[page]() : pages.home()}`;
  if (!canWriteWorkspace()) app.querySelectorAll('#file-input, #technical-file-input, #website-form input, #website-form button, #generate-form button, .manual-evaluation-form button, .js-source-dataset, .js-remove-document, .js-recrawl-website, .js-remove-website, .js-remove-technical-document, .js-approve, .js-add-scenario, .js-delete-scenario, #dataset-review-form button[type="submit"], #dataset-review-form textarea, #dataset-review-form input').forEach(input => { input.disabled = true; });
  document.querySelectorAll('.nav-link').forEach(link => link.classList.toggle('active', link.dataset.page === page));
  bind(page);
}

function bind(page) {
  document.querySelector('#workspace-organization')?.addEventListener('change', async event => {
    const orgId = event.target.value;
    if (orgId === 'local') { workspaceMode = 'local'; try { localStorage.setItem('eval-workspace-mode', 'local'); } catch {} reviewingDatasetId = null; viewingEvaluationId = null; render(page); return; }
    workspaceMode = 'flex'; try { localStorage.setItem('eval-workspace-mode', 'flex'); } catch {}
    reviewingDatasetId = null; viewingEvaluationId = null;
    if (!workspace.flexAgentSession?.connected) { viewScope = { orgId, agentId: null }; render(page); }
    else if (orgId !== workspace.flexAgentSession.orgId) await selectFlexAgentOrganization({ target: { value: orgId } });
    else { viewScope = { orgId, agentId: workspace.flexAgentSession.selectedAgentId || null }; render(page); }
  });
  document.querySelector('#workspace-agent')?.addEventListener('change', event => {
    if (!workspace.flexAgentSession?.connected) { viewScope = { orgId: viewScope.orgId, agentId: event.target.value || null }; reviewingDatasetId = null; viewingEvaluationId = null; render(page); }
    else selectFlexAgent(event);
  });
  document.querySelectorAll('[data-page]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); if (link.dataset.page === 'results') viewingEvaluationId = null; location.hash = link.dataset.page; }));
  if (page === 'results' && !viewingEvaluationId) {
    const overview = app.querySelector('.panel.card-pad:not(.workspace-scope)');
    if (overview) {
      overview.classList.add('results-overview');
      const visibleRuns = workspace.evaluations.filter(inSelectedWorkspace);
      const visibleBenchmarks = workspace.datasets.filter(item => inSelectedWorkspace(item) && item.status === 'approved');
      overview.innerHTML = `<span class="eyebrow">EVALUATION RECORDS</span><h2 class="minor-title">Review evidence, not just a score.</h2><p class="page-subtitle">Each saved evaluation keeps the target answer, expected answer, source evidence, rubric, and control-model verdict for every scenario.</p><div class="results-overview-facts"><span><b>${visibleRuns.length}</b> saved evaluation${visibleRuns.length === 1 ? '' : 's'}</span><span><b>${visibleBenchmarks.length}</b> approved benchmark${visibleBenchmarks.length === 1 ? '' : 's'}</span></div>`;
      if (visibleRuns.length) overview.insertAdjacentHTML('afterend', `<section class="panel evaluation-switcher"><label for="evaluation-history-select">Open a saved evaluation</label><select id="evaluation-history-select"><option value="">Choose an evaluation</option>${visibleRuns.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(`${evaluationSourceName(item)} · ${evaluationRunType(item)}`)} · ${escapeHtml(item.score)}% · ${new Date(item.createdAt).toLocaleString()}</option>`).join('')}</select><button class="button button-secondary button-small js-view-evaluation" data-id="${escapeHtml(visibleRuns[0].id)}" type="button">View latest evaluation</button></section>`);
    }
  }
  document.querySelectorAll('.js-toast').forEach(el => el.addEventListener('click', () => toast('Connection setup will be available with the secure backend.')));
  document.querySelectorAll('.js-upload').forEach(el => el.addEventListener('click', () => {
    const input = document.querySelector('#file-input');
    if (input) input.click(); else location.hash = 'documents';
  }));
  document.querySelector('#file-input')?.addEventListener('change', event => uploadDocument(event.target.files[0]));
  document.querySelector('#website-form')?.addEventListener('submit', crawlWebsiteSource);
  document.querySelectorAll('.js-recrawl-website').forEach(button => button.addEventListener('click', () => recrawlWebsiteSource(button.dataset.id)));
  document.querySelectorAll('.js-remove-website').forEach(button => button.addEventListener('click', () => removeWebsiteSource(button.dataset.id)));
  document.querySelector('#technical-file-input')?.addEventListener('change', event => uploadTechnicalDocument(event.target.files[0]));
  document.querySelector('#technical-search')?.addEventListener('input', event => { const query = event.target.value.toLowerCase(); document.querySelectorAll('[data-search], .flow-details details, .blueprint-example-panel article, .blueprint-questions details').forEach(item => { item.hidden = !item.textContent.toLowerCase().includes(query); }); });
  document.querySelector('.js-catalog-search')?.addEventListener('input', event => { const query = event.target.value.toLowerCase(); document.querySelectorAll('[data-search]').forEach(item => { item.hidden = !item.dataset.search.toLowerCase().includes(query); }); });
  document.querySelector('.js-show-overview')?.addEventListener('click', () => { const source = document.querySelector('#overview .blueprint-evidence'); source.open = true; source.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  document.querySelectorAll('.js-remove-document').forEach(button => button.addEventListener('click', () => removeDocument(button.dataset.id)));
  document.querySelectorAll('.js-remove-technical-document').forEach(button => button.addEventListener('click', () => removeTechnicalDocument(button.dataset.id)));
  document.querySelectorAll('.js-open-technical').forEach(button => button.addEventListener('click', () => { document.querySelector('.technical-library')?.removeAttribute('open'); location.hash = `technical:${button.dataset.id}`; render('technical'); }));
  document.querySelectorAll('.js-technical-tab').forEach(button => button.addEventListener('click', () => { technicalTab = button.dataset.tab; render('technical'); }));
  document.querySelector('#technical-document-select')?.addEventListener('change', event => { technicalTab = 'overview'; location.hash = `technical:${event.target.value}`; });
  document.querySelectorAll('.js-start-chat').forEach(button => button.addEventListener('click', () => { activeChatId = null; chatDocumentId = allDocuments().find(item => item.retrieval?.status === 'ready')?.id; location.hash = 'chat'; }));
  document.querySelectorAll('.js-start-dataset').forEach(button => button.addEventListener('click', () => { datasetDocumentId = allDocuments().find(item => inSelectedWorkspace(item) && item.retrieval?.status === 'ready')?.id; location.hash = 'datasets'; }));
  document.querySelectorAll('.js-source-dataset').forEach(button => button.addEventListener('click', () => { datasetDocumentId = button.dataset.id; location.hash = 'datasets'; render('datasets'); }));
  document.querySelector('#openai-form')?.addEventListener('submit', saveOpenAISetup);
  document.querySelectorAll('.js-settings-tab').forEach(tab => tab.addEventListener('click', () => showSettingsTab(tab.dataset.tab)));
  document.querySelector('.settings-tabs')?.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...document.querySelectorAll('.js-settings-tab')]; const current = tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true');
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault(); showSettingsTab(tabs[next].dataset.tab); tabs[next].focus();
  });
  document.querySelector('#flexagent-login-form')?.addEventListener('submit', connectFlexAgent);
  document.querySelector('#flexagent-form')?.addEventListener('submit', saveFlexAgentTarget);
  document.querySelector('#flexagent-load-organizations')?.addEventListener('click', loadFlexAgentOrganizations);
  document.querySelector('#flexagent-organization-picker')?.addEventListener('change', selectFlexAgentOrganization);
  document.querySelector('#flexagent-load-agents')?.addEventListener('click', loadFlexAgentAgents);
  document.querySelector('#flexagent-reconnect')?.addEventListener('click', () => { workspace.flexAgentSession = null; flexAgentAgents = []; flexAgentOrganizations = []; render('settings'); });
  document.querySelector('#flexagent-agent-picker')?.addEventListener('change', selectFlexAgent);
  enhanceFlexAgentSettings();
  document.querySelector('#agent-prompt-form')?.addEventListener('submit', saveAgentPrompt);
  document.querySelector('#instruction-document')?.addEventListener('change', event => { instructionDocumentId = event.target.value; render('settings'); });
  document.querySelector('#instruction-target')?.addEventListener('change', event => { instructionTargetId = event.target.value; render('settings'); });
  document.querySelectorAll('.js-remove-connection').forEach(button => button.addEventListener('click', () => removeConnection(button.dataset.id)));
  document.querySelector('#generate-form')?.addEventListener('submit', generateDataset);
  document.querySelector('#dataset-document')?.addEventListener('change', event => { datasetDocumentId = event.target.value; });
  document.querySelectorAll('.js-review-dataset').forEach(button => button.addEventListener('click', () => { reviewingDatasetId = button.dataset.id; render('datasets'); }));
  document.querySelectorAll('.js-view-evaluation').forEach(button => button.addEventListener('click', () => { viewingEvaluationId = button.dataset.id; render('results'); }));
  document.querySelector('#evaluation-history-select')?.addEventListener('change', event => { viewingEvaluationId = event.target.value || null; render('results'); });
  document.querySelector('.js-download-evaluation')?.addEventListener('click', downloadEvaluationReport);
  const viewedEvaluation = workspace.evaluations.find(item => item.id === viewingEvaluationId && inSelectedWorkspace(item)) || workspace.evaluations.find(inSelectedWorkspace);
  document.querySelectorAll('.evaluation-detail').forEach((detail, index) => {
    if (!viewedEvaluation?.results[index]?.manual) return;
    const retrieval = Array.from(detail.querySelectorAll('section')).find(section => section.querySelector('b')?.textContent === 'Retrieval');
    if (retrieval) retrieval.querySelector('p').textContent = 'This evaluation used pasted answers, so no retrieval trace was captured.';
  });
  document.querySelectorAll('.js-view-retrieval').forEach(button => {
    const result = workspace.evaluations.find(item => item.id === button.dataset.evaluationId)?.results[Number(button.dataset.resultIndex)];
    if (result?.retrievalUnavailable) { button.parentElement.innerHTML = `<p class="help">${result.manual ? 'This evaluation used pasted answers, so no retrieval trace was captured.' : 'FlexAgent used its own knowledge base, so no retrieval trace is available here.'}</p>`; return; }
    button.addEventListener('click', () => { viewingRetrievedChunks = { evaluationId: button.dataset.evaluationId, resultIndex: Number(button.dataset.resultIndex) }; render('results'); });
  });
  document.querySelector('.js-close-retrieval')?.addEventListener('click', () => { viewingRetrievedChunks = null; render('results'); });
  document.querySelectorAll('.js-close-review').forEach(button => button.addEventListener('click', () => { reviewingDatasetId = null; render('datasets'); }));
  document.querySelector('.js-go-evaluation')?.addEventListener('click', () => { reviewingDatasetId = null; location.hash = 'evaluation'; });
  document.querySelector('#dataset-review-form')?.addEventListener('submit', saveDatasetReview);
  document.querySelector('.js-add-scenario')?.addEventListener('click', addDatasetScenario);
  document.querySelectorAll('.js-delete-scenario').forEach(button => button.addEventListener('click', () => deleteDatasetScenario(Number(button.dataset.index))));
  document.querySelectorAll('.js-approve').forEach(button => button.addEventListener('click', () => approveDataset(button.dataset.id)));
  document.querySelector('#customer-chat-form')?.addEventListener('submit', askCustomerAgent);
  document.querySelector('#customer-question')?.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form.requestSubmit(); }
  });
  document.querySelectorAll('.js-open-chat').forEach(button => button.addEventListener('click', () => { activeChatId = button.dataset.id; const chat = workspace.chats.find(item => item.id === activeChatId); chatDocumentId = chat.documentId; chatTargetId = chat.connectionId; render('chat'); }));
  document.querySelector('.js-new-chat')?.addEventListener('click', () => { activeChatId = null; render('chat'); });
  document.querySelector('#chat-document')?.addEventListener('change', event => { activeChatId = null; chatDocumentId = event.target.value; render('chat'); });
  document.querySelector('#chat-target')?.addEventListener('change', event => { activeChatId = null; chatTargetId = event.target.value; render('chat'); });
  document.querySelector('#evaluation-form')?.addEventListener('submit', runEvaluation);
  document.querySelectorAll('.manual-evaluation-form').forEach(form => form.addEventListener('submit', runManualEvaluation));
}

async function uploadDocument(file) {
  if (!file) return;
  if (!canWriteWorkspace()) { toast('Connect FlexAgent and choose an organization and agent first.'); return; }
  const form = new FormData(); form.append('document', file); if (selectedScope()) { form.append('orgId', selectedScope().orgId); form.append('agentId', selectedScope().agentId); }
  try {
    const response = await fetch('/api/documents', { method: 'POST', body: form }); const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    workspace.documents.push(body); uploadedDocument = body; render('documents'); toast(`${body.name} uploaded and text extracted.`);
  } catch (error) { toast(error.message || 'Document upload failed. Start the server with npm start.'); }
}
async function uploadTechnicalDocument(file) {
  if (!file) return;
  if (!canWriteWorkspace()) { toast('Connect FlexAgent and choose an organization and agent first.'); return; }
  const form = new FormData(); form.append('document', file); if (selectedScope()) { form.append('orgId', selectedScope().orgId); form.append('agentId', selectedScope().agentId); }
  technicalUploadStatus = { kind: 'working', message: `Processing ${file.name}: extracting text and building its blueprint…` }; render('technical');
  try {
    const response = await fetch('/api/technical-documents', { method: 'POST', body: form }); const body = await response.json().catch(() => ({ error: 'Technical uploads need the updated server. Restart Eval Tool, then try again.' }));
    if (!response.ok) throw new Error(body.error);
    workspace.technicalDocuments = [...workspace.technicalDocuments.filter(item => item.id !== body.id), body]; technicalUploadStatus = { kind: body.analysisStatus === 'ready' ? 'ready' : 'warning', message: body.analysisStatus === 'ready' ? `${body.name} is ready to explore.` : `${body.name} uploaded, but its analysis is unavailable.` }; location.hash = `technical:${body.id}`; render('technical'); toast(body.analysisStatus === 'ready' ? 'Technical blueprint created.' : 'Document uploaded. Analysis is unavailable.');
  } catch (error) { technicalUploadStatus = { kind: 'error', message: `Upload failed: ${error.message || 'Technical document could not be processed.'}` }; render('technical'); toast(error.message || 'Technical document upload failed.'); }
}

async function removeDocument(id) {
  try {
    const response = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    if (!response.ok) { const body = await response.json(); throw new Error(body.error); }
    const datasetIds = new Set(workspace.datasets.filter(item => item.documentId === id).map(item => item.id));
    workspace.documents = workspace.documents.filter(item => item.id !== id); workspace.datasets = workspace.datasets.filter(item => item.documentId !== id); workspace.evaluations = workspace.evaluations.filter(item => !datasetIds.has(item.datasetId)); workspace.chats = workspace.chats.filter(item => item.documentId !== id); workspace.agentConfigs = workspace.agentConfigs.filter(item => item.documentId !== id);
    render('documents'); toast('Document and its related data removed.');
  } catch (error) { toast(error.message || 'Document could not be removed.'); }
}

async function removeTechnicalDocument(id) {
  const name = workspace.technicalDocuments.find(item => item.id === id)?.name;
  if (!name) return;
  if (!confirm(`This permanently removes "${name}" and its related chats, datasets, evaluations, and settings. Continue?`)) return;
  try {
    const response = await fetch(`/api/technical-documents/${id}`, { method: 'DELETE' });
    if (!response.ok) { const body = await response.json(); throw new Error(body.error); }
    const datasetIds = new Set(workspace.datasets.filter(item => item.documentId === id).map(item => item.id));
    workspace.technicalDocuments = workspace.technicalDocuments.filter(item => item.id !== id);
    workspace.datasets = workspace.datasets.filter(item => item.documentId !== id);
    workspace.evaluations = workspace.evaluations.filter(item => !datasetIds.has(item.datasetId));
    workspace.chats = workspace.chats.filter(item => item.documentId !== id);
    workspace.agentConfigs = workspace.agentConfigs.filter(item => item.documentId !== id);
    if (activeChatId && !workspace.chats.some(item => item.id === activeChatId)) activeChatId = null;
    location.hash = workspace.technicalDocuments[0] ? `technical:${workspace.technicalDocuments[0].id}` : 'technical';
    render('technical'); toast('Technical document and its related data removed.');
  } catch (error) { toast(error.message || 'Technical document could not be removed.'); }
}

async function crawlWebsiteSource(event) {
  event.preventDefault(); const button = event.currentTarget.querySelector('button'); const status = document.querySelector('#website-status'); const url = document.querySelector('#website-url').value.trim();
  button.disabled = true; button.textContent = 'Crawling website…'; status.textContent = 'Rendering and collecting public pages. This may take a few minutes.';
  try {
    const response = await fetch('/api/websites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, ...selectedScope() }) }); const snapshot = await response.json();
    if (!response.ok) throw new Error(snapshot.error);
    const website = { id: snapshot.websiteId, rootUrl: snapshot.rootUrl, ...(snapshot.orgId ? { orgId: snapshot.orgId, agentId: snapshot.agentId } : {}) }; workspace.websites = [...workspace.websites.filter(item => item.id !== website.id), website]; workspace.websiteSnapshots.push(snapshot);
    render('documents'); toast(`Website snapshot ready with ${snapshot.pages.length} pages.`);
  } catch (error) { button.disabled = false; button.textContent = 'Crawl website'; status.textContent = error.message || 'Website crawl failed.'; }
}
async function removeWebsiteSource(websiteId) {
  const site = workspace.websites.find(item => item.id === websiteId);
  if (!site) return;
  if (!confirm(`This permanently removes "${site.rootUrl}", all of its snapshots, and its related chats, datasets, evaluations, and settings. Continue?`)) return;
  try {
    const response = await fetch(`/api/websites/${websiteId}`, { method: 'DELETE' });
    if (!response.ok) { const body = await response.json(); throw new Error(body.error); }
    const snapshotIds = new Set(workspace.websiteSnapshots.filter(item => item.websiteId === websiteId).map(item => item.id));
    const datasetIds = new Set(workspace.datasets.filter(item => snapshotIds.has(item.documentId)).map(item => item.id));
    workspace.websites = workspace.websites.filter(item => item.id !== websiteId);
    workspace.websiteSnapshots = workspace.websiteSnapshots.filter(item => item.websiteId !== websiteId);
    workspace.datasets = workspace.datasets.filter(item => !datasetIds.has(item.id));
    workspace.evaluations = workspace.evaluations.filter(item => !datasetIds.has(item.datasetId));
    workspace.chats = workspace.chats.filter(item => !snapshotIds.has(item.documentId));
    workspace.agentConfigs = workspace.agentConfigs.filter(item => !snapshotIds.has(item.documentId));
    if (activeChatId && !workspace.chats.some(item => item.id === activeChatId)) activeChatId = null;
    if (snapshotIds.has(chatDocumentId)) chatDocumentId = null;
    if (snapshotIds.has(datasetDocumentId)) datasetDocumentId = null;
    if (datasetIds.has(reviewingDatasetId)) reviewingDatasetId = null;
    if (viewingEvaluationId && !workspace.evaluations.some(item => item.id === viewingEvaluationId)) viewingEvaluationId = null;
    render('documents'); toast('Website and its related data removed.');
  } catch (error) { toast(error.message || 'Website could not be removed.'); }
}
async function recrawlWebsiteSource(websiteId) {
  const button = document.querySelector(`.js-recrawl-website[data-id="${websiteId}"]`); if (button) { button.disabled = true; button.textContent = 'Re-crawling…'; }
  try {
    const response = await fetch(`/api/websites/${websiteId}/recrawl`, { method: 'POST' }); const snapshot = await response.json();
    if (!response.ok) throw new Error(snapshot.error);
    workspace.websiteSnapshots.push(snapshot); render('documents'); toast(`New website snapshot ready with ${snapshot.pages.length} pages.`);
  } catch (error) { if (button) { button.disabled = false; button.textContent = 'Re-crawl'; } toast(error.message || 'Website re-crawl failed.'); }
}

async function saveOpenAISetup(event) {
  event.preventDefault();
  const data = { apiKey: document.querySelector('#openai-key').value, targetModel: document.querySelector('#target-model').value, controlModel: document.querySelector('#control-model').value };
  try {
    const response = await fetch('/api/openai-setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    workspace.connections.push(...body); render('settings'); toast('OpenAI setup saved securely.');
  } catch (error) { toast(error.message || 'OpenAI setup could not be saved. Start the server with npm start.'); }
}

async function saveFlexAgentTarget(event) {
  event.preventDefault();
  const data = { name: document.querySelector('#flexagent-name').value, baseUrl: document.querySelector('#flexagent-url').value, orgId: document.querySelector('#flexagent-org-id').value, agentId: document.querySelector('#flexagent-agent-id').value, serviceToken: document.querySelector('#flexagent-token').value, mode: document.querySelector('#flexagent-mode').value, parentOrigin: document.querySelector('#flexagent-origin').value };
  try {
    const response = await fetch('/api/flexagent-target', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    workspace.connections.push(body); render('settings'); toast('FlexAgent target saved securely.');
  } catch (error) { toast(error.message || 'FlexAgent target could not be saved.'); }
}

function enhanceFlexAgentSettings() {
  const loginOrganization = document.querySelector('#flexagent-login-org-id')?.closest('.field');
  if (loginOrganization) loginOrganization.remove();
  const session = workspace.flexAgentSession;
  const status = document.querySelector('.flexagent-connection dl dd');
  if (!session?.connected || !status) return;
  status.textContent = session.orgName || 'Choose an organization';
  const picker = document.createElement('div');
  picker.className = 'field full';
  picker.innerHTML = `<label for="flexagent-organization-picker">Choose organization</label><select id="flexagent-organization-picker" ${flexAgentOrganizations.length ? '' : 'disabled'}><option value="">${flexAgentOrganizations.length ? 'Choose an organization' : 'Load organizations first'}</option>${flexAgentOrganizations.map(org => `<option value="${escapeHtml(org.id)}" ${org.id === session.orgId ? 'selected' : ''}>${escapeHtml(org.name)}</option>`).join('')}</select><span class="help">Choose the organization before loading its agents.</span><div class="button-row"><button id="flexagent-load-organizations" class="button button-secondary" type="button">Load organizations</button></div>`;
  document.querySelector('.flexagent-connection')?.insertAdjacentElement('afterend', picker);
  picker.querySelector('#flexagent-load-organizations').addEventListener('click', loadFlexAgentOrganizations);
  picker.querySelector('#flexagent-organization-picker').addEventListener('change', selectFlexAgentOrganization);
  const agentField = document.querySelector('#flexagent-agent-picker')?.closest('.field');
  const agentButton = document.querySelector('#flexagent-load-agents');
  if (!session.orgName) {
    if (agentField) agentField.hidden = true;
    if (agentButton) agentButton.disabled = true;
  }
}

async function connectFlexAgent(event) {
  event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true; button.textContent = 'Connecting…';
  const data = { baseUrl: document.querySelector('#flexagent-login-url').value, email: document.querySelector('#flexagent-login-email').value, password: document.querySelector('#flexagent-login-password').value, parentOrigin: document.querySelector('#flexagent-login-origin').value };
  try {
    const response = await fetch('/api/flexagent/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    workspace.flexAgentSession = body.session; viewScope = null; workspaceMode = 'flex'; try { localStorage.setItem('eval-workspace-mode', 'flex'); } catch {} flexAgentAgents = []; flexAgentOrganizations = []; await loadFlexAgentOrganizations(false); toast('FlexAgent connected. Choose an organization.');
  } catch (error) { button.disabled = false; button.textContent = 'Connect FlexAgent'; toast(error.message || 'FlexAgent could not be connected.'); }
}

async function loadFlexAgentOrganizations(showToast = true) {
  try {
    const response = await fetch('/api/flexagent/organizations', { method: 'POST' }); const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    flexAgentOrganizations = body.organizations; await loadWorkspace(); render(); if (showToast) toast(`${body.organizations.length} organizations loaded.`); if (workspace.flexAgentSession?.orgId) await loadFlexAgentAgents(false); return true;
  } catch (error) { await loadWorkspace(); flexAgentOrganizations = []; render(); toast(error.message || 'FlexAgent organizations could not be loaded.'); return false; }
}

async function selectFlexAgentOrganization(event) {
  const orgId = event.target.value; if (!orgId) return;
  try {
    const response = await fetch('/api/flexagent/select-organization', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId }) }); const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    workspace.flexAgentSession = body.session; viewScope = { orgId: body.session.orgId, agentId: body.session.selectedAgentId || null }; workspaceMode = 'flex'; try { localStorage.setItem('eval-workspace-mode', 'flex'); } catch {} flexAgentAgents = []; reviewingDatasetId = null; viewingEvaluationId = null; await loadWorkspace(); await loadFlexAgentAgents(false); render(); toast(`${body.session.orgName} selected. Choose an agent next.`);
  } catch (error) { await loadWorkspace(); render(); toast(error.message || 'Organization could not be selected.'); }
}

async function loadFlexAgentAgents(showToast = true) {
  try {
    const response = await fetch('/api/flexagent/agents', { method: 'POST' }); const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    flexAgentAgents = body.agents; await loadWorkspace(); render(); if (showToast) toast(`${body.agents.length} FlexAgents loaded.`); return true;
  } catch (error) { await loadWorkspace(); flexAgentAgents = []; render(); toast(error.message || 'FlexAgent agents could not be loaded.'); return false; }
}

async function selectFlexAgent(event) {
  const agentId = event.target.value; if (!agentId) return;
  try {
    const response = await fetch('/api/flexagent/select-agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentId }) }); const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    workspace.flexAgentSession = body.session; viewScope = { orgId: body.session.orgId, agentId: body.session.selectedAgentId }; workspaceMode = 'flex'; try { localStorage.setItem('eval-workspace-mode', 'flex'); } catch {} reviewingDatasetId = null; viewingEvaluationId = null;
    workspace.connections = [...workspace.connections.filter(connection => connection.id !== body.target.id), body.target];
    render(); toast(`${body.target.name} is ready for LiveKit evaluation.`);
  } catch (error) { await loadWorkspace(); render(); toast(error.message || 'FlexAgent could not be selected.'); }
}

function waitForLiveKitAgent(room) {
  const state = participant => participant?.attributes?.['lk.agent.state'];
  const ready = participant => state(participant) && state(participant) !== 'initializing';
  if ([...room.remoteParticipants.values()].some(ready)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => done(new Error('FlexAgent did not start within 60 seconds.')), 60000);
    const onParticipant = participant => { if (ready(participant)) done(); };
    const onAttributes = (attributes, participant) => { if (ready(participant)) done(); };
    const done = error => { clearTimeout(timeout); room.off(window.LivekitClient.RoomEvent.ParticipantConnected, onParticipant); room.off(window.LivekitClient.RoomEvent.ParticipantAttributesChanged, onAttributes); error ? reject(error) : resolve(); };
    room.on(window.LivekitClient.RoomEvent.ParticipantConnected, onParticipant);
    room.on(window.LivekitClient.RoomEvent.ParticipantAttributesChanged, onAttributes);
  });
}

async function liveKitAnswer(targetConnectionId, question) {
  if (!window.LivekitClient) return Promise.reject(new Error('LiveKit client did not load. Restart Eval Tool and try again.'));
  const tokenResponse = await fetch('/api/flexagent-livekit-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetConnectionId }) });
  const credentials = await tokenResponse.json();
  if (!tokenResponse.ok) throw new Error(credentials.error || 'FlexAgent did not issue a LiveKit token.');
  const room = new window.LivekitClient.Room();
  try {
    const answer = await new Promise(async (resolve, reject) => {
      let active = false; let settled = false;
      const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timeout); error ? reject(error) : resolve(value); };
      const timeout = setTimeout(() => finish(new Error('FlexAgent did not return a final answer within 90 seconds.')), 90000);
      room.registerTextStreamHandler('lk.transcription', async reader => {
        const afterQuestion = active;
        const text = (await reader.readAll()).trim();
        if (afterQuestion && text) finish(null, text);
      });
      try { await room.connect(credentials.wsUrl, credentials.token); await waitForLiveKitAgent(room); if (!settled) { active = true; await room.localParticipant.sendText(question, { topic: 'lk.chat' }); } } catch (error) { finish(error); }
    });
    return answer;
  } finally { await room.disconnect().catch(() => {}); }
}

async function runLiveKitEvaluation(datasetId, targetConnectionId, controlConnectionId, button, help) {
  const dataset = workspace.datasets.find(item => item.id === datasetId);
  if (dataset.cases.some(item => item.turns?.length)) throw new Error('LiveKit widget evaluation currently supports single-turn scenarios only.');
  help.textContent = `Connecting to FlexAgent and running 0 of ${dataset.cases.length} scenarios…`;
  const answers = [];
  for (const [index, item] of dataset.cases.entries()) {
    help.textContent = `Connecting to FlexAgent and running ${index + 1} of ${dataset.cases.length} scenarios…`;
    answers.push(await liveKitAnswer(targetConnectionId, item.question));
  }
  const response = await fetch('/api/evaluations/livekit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ datasetId, targetConnectionId, controlConnectionId, answers }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'LiveKit evaluation could not be scored.');
  workspace.evaluations.unshift(body); viewingEvaluationId = body.id; render('results'); toast('LiveKit evaluation completed.');
}

async function saveAgentPrompt(event) {
  event.preventDefault(); const button = event.currentTarget.querySelector('button'); const documentId = document.querySelector('#instruction-document').value; const connectionId = document.querySelector('#instruction-target').value; button.disabled = true; button.textContent = 'Saving…';
  try {
    const response = await fetch('/api/agent-configs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId, connectionId, systemPrompt: document.querySelector('#agent-system-prompt').value }) }); const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    instructionDocumentId = documentId; instructionTargetId = connectionId; workspace.agentConfigs = [...workspace.agentConfigs.filter(item => item.id !== body.id), body]; render('settings'); toast('Instructions saved for this policy.');
  } catch (error) { button.disabled = false; button.textContent = 'Save instructions for this policy'; toast(error.message || 'Instructions could not be saved.'); }
}

async function removeConnection(id) {
  try {
    const response = await fetch(`/api/connections/${id}`, { method: 'DELETE' });
    if (!response.ok) { const body = await response.json(); throw new Error(body.error); }
    workspace.connections = workspace.connections.filter(connection => connection.id !== id); render('settings'); toast('Model connection removed.');
  } catch (error) { toast(error.message || 'Connection could not be removed.'); }
}

async function generateDataset(event) {
  event.preventDefault(); const form = event.currentTarget; const submit = form.querySelector('button[type="submit"]'); const progress = document.querySelector('#generation-status'); submit.disabled = true; submit.textContent = 'Generating scenarios…'; progress.textContent = 'Reading the selected document and creating the draft. This can take a minute.';
  try {
    const response = await fetch('/api/datasets/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: document.querySelector('#dataset-document').value, connectionId: document.querySelector('#dataset-control').value, count: document.querySelector('#dataset-count').value }) }); const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    workspace.datasets.push(body); reviewingDatasetId = body.id; render('datasets'); toast('Draft generated. Review the scenarios before approving.');
  } catch (error) { submit.disabled = false; submit.textContent = 'Generate draft scenarios'; progress.textContent = error.message || 'Dataset generation failed. Please try again.'; progress.setAttribute('role', 'alert'); toast(progress.textContent); }
}

function reviewedCases(form, dataset) {
  return dataset.cases.map((item, index) => {
    const value = field => form.querySelector(`[data-field="${field}"][data-index="${index}"]`).value.trim();
    const json = field => { const raw = value(field); return raw ? JSON.parse(raw) : []; };
    const sourceUrl = form.querySelector(`[data-field="sourceUrl"][data-index="${index}"]`)?.value.trim();
    return { question: value('question'), expectedAnswer: value('expectedAnswer'), requiredPoints: value('requiredPoints').split('\n').map(text => text.trim()).filter(Boolean), forbiddenPoints: value('forbiddenPoints').split('\n').map(text => text.trim()).filter(Boolean), sourceEvidence: value('sourceEvidence'), ...(sourceUrl ? { sourceUrl } : {}), turns: json('turns'), expectedFinalMemory: json('expectedFinalMemory') };
  });
}

async function persistDatasetReview(form, dataset) {
  const response = await fetch(`/api/datasets/${dataset.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cases: reviewedCases(form, dataset) }) }); const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  workspace.datasets = workspace.datasets.map(item => item.id === body.id ? body : item); return body;
}

function addDatasetScenario() {
  const dataset = workspace.datasets.find(item => item.id === reviewingDatasetId);
  dataset.cases.push({ question: '', expectedAnswer: '', requiredPoints: [], forbiddenPoints: [], sourceEvidence: '', turns: [], expectedFinalMemory: [] }); render('datasets');
}

function deleteDatasetScenario(index) {
  const dataset = workspace.datasets.find(item => item.id === reviewingDatasetId);
  if (dataset.cases.length < 2) return;
  dataset.cases.splice(index, 1); render('datasets');
}

async function saveDatasetReview(event) {
  event.preventDefault(); const form = event.currentTarget; const dataset = workspace.datasets.find(item => item.id === reviewingDatasetId); const submit = form.querySelector('button[type="submit"]'); const note = document.querySelector('#review-status');
  submit.disabled = true; submit.textContent = 'Saving…'; note.textContent = 'Saving your reviewed scenarios.';
  try {
    await persistDatasetReview(form, dataset); render('datasets'); toast('Review changes saved.');
  } catch (error) { submit.disabled = false; submit.textContent = 'Save changes'; note.textContent = error.message || 'Changes could not be saved.'; }
}

async function approveDataset(id) {
  const form = document.querySelector('#dataset-review-form'); const button = document.querySelector('.js-approve'); const note = document.querySelector('#review-status');
  try {
    if (form) { button.disabled = true; button.textContent = 'Saving and approving…'; note.textContent = 'Saving your reviewed answers, then approving the benchmark.'; await persistDatasetReview(form, workspace.datasets.find(item => item.id === id)); }
    const response = await fetch(`/api/datasets/${id}/approve`, { method: 'POST' }); const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    workspace.datasets = workspace.datasets.map(item => item.id === body.id ? body : item); render('datasets'); toast('Golden dataset approved.');
  } catch (error) { if (button) { button.disabled = false; button.textContent = 'Save & approve'; } if (note) note.textContent = error.message || 'Dataset approval failed.'; else toast(error.message || 'Dataset approval failed.'); }
}

async function askCustomerAgent(event) {
  event.preventDefault(); const form = event.currentTarget; const input = document.querySelector('#customer-question'); const question = input.value.trim(); if (!question) return;
  input.value = ''; render('chat');
  const output = document.querySelector('#chat-messages'); output.insertAdjacentHTML('beforeend', `<article class="message user"><span class="who">You</span><div class="bubble">${escapeHtml(question)}</div></article><article class="message agent"><span class="who">Support agent</span><div class="bubble">Thinking…</div></article>`); output.scrollTop = output.scrollHeight;
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: document.querySelector('#chat-document').value, connectionId: document.querySelector('#chat-target').value, question, chatId: activeChatId }) }); const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    activeChatId = body.chat.id; workspace.chats = [body.chat, ...workspace.chats.filter(item => item.id !== body.chat.id)];
    const technicalDocument = workspace.technicalDocuments.find(item => item.id === body.chat.documentId);
    if (technicalDocument) technicalDocument.retrieval = { status: 'ready' };
  } catch (error) { toast(error.message || 'Customer chat failed.'); }
  render('chat'); const messages = document.querySelector('#chat-messages'); messages.scrollTop = messages.scrollHeight; document.querySelector('#customer-question')?.focus();
}

async function runEvaluation(event) {
  event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button'); const help = form.querySelector('.help'); button.disabled = true; button.textContent = 'Running evaluation…'; help.textContent = 'Checking each scenario—your policy is getting a careful read.';
  try {
    const datasetId = document.querySelector('#evaluation-dataset').value; const targetConnectionId = document.querySelector('#evaluation-target').value; const controlConnectionId = document.querySelector('#evaluation-control').value;
    const target = workspace.connections.find(connection => connection.id === targetConnectionId);
    if (target?.kind === 'flexagent-livekit') return await runLiveKitEvaluation(datasetId, targetConnectionId, controlConnectionId, button, help);
    const response = await fetch('/api/evaluations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ datasetId, targetConnectionId, controlConnectionId }) }); const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    workspace.evaluations.unshift(body); viewingEvaluationId = body.id; render('results'); toast('Evaluation completed.');
  } catch (error) { button.disabled = false; button.textContent = 'Run evaluation'; toast(error.message || 'Evaluation failed.'); }
}

async function runManualEvaluation(event) {
  event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button'); const help = form.querySelector('.help');
  button.disabled = true; button.textContent = 'Scoring pasted answers…'; help.textContent = 'The control model is judging the pasted replies.';
  try {
    const response = await fetch('/api/evaluations/manual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ datasetId: form.dataset.datasetId, controlConnectionId: form.elements.controlConnectionId.value, answers: [...form.querySelectorAll('[name="answer"]')].map(input => input.value.trim()) }) }); const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    workspace.evaluations.unshift(body); viewingEvaluationId = body.id; render('results'); toast('Pasted answers scored.');
  } catch (error) { button.disabled = false; button.textContent = 'Score pasted answers'; help.textContent = error.message || 'Pasted answers could not be scored.'; }
}

function downloadEvaluationReport() {
  const evaluation = workspace.evaluations.find(item => item.id === viewingEvaluationId && inSelectedWorkspace(item)) || workspace.evaluations.find(inSelectedWorkspace);
  const dataset = workspace.datasets.find(item => item.id === evaluation?.datasetId); const source = allDocuments().find(item => item.id === dataset?.documentId);
  if (!evaluation || !dataset) return;
  const result = item => `<article><h2>${escapeHtml(item.case.question)}</h2><p class="verdict ${item.pass ? 'pass' : 'gap'}">${item.pass ? 'PASS' : 'GAP'} · ${escapeHtml(item.score)}%</p>${gapDiagnosisMarkup(item)}<h3>Target answer</h3><p>${escapeHtml(item.answer)}</p><h3>Expected answer</h3><p>${escapeHtml(item.case.expectedAnswer)}</p><h3>Source evidence</h3><p>${escapeHtml(item.case.sourceEvidence)}</p>${item.case.sourceUrl ? `<p>${sourceLink(item.case.sourceUrl, ' rel="noreferrer"')}</p>` : ''}<h3>Required points</h3><ul>${(item.case.requiredPoints || []).map(point => `<li>${escapeHtml(point)}</li>`).join('') || '<li>None</li>'}</ul><h3>Forbidden points</h3><ul>${(item.case.forbiddenPoints || []).map(point => `<li>${escapeHtml(point)}</li>`).join('') || '<li>None</li>'}</ul><h3>Rationale</h3><p>${escapeHtml(item.rationale || 'No rationale returned.')}</p></article>`;
  const report = `<!doctype html><html><head><meta charset="utf-8"><title>Evaluation report</title><style>body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;color:#182338;line-height:1.5}header,article{border-bottom:1px solid #d8dee8;padding:0 0 24px;margin-bottom:28px}h1{margin-bottom:4px}h2{font-size:18px}h3{font-size:14px;margin-bottom:4px}p{white-space:pre-wrap}.score{font-size:32px;font-weight:700}.verdict{font-weight:700}.pass{color:#087443}.gap{color:#b42318}.gap-diagnosis{background:#fff5f2;border-left:3px solid #b42318;padding:12px 16px;margin:16px 0}.gap-diagnosis h3{margin:0 0 8px}.gap-diagnosis p{margin:6px 0}.gap-diagnosis small{color:#684b45}.evaluation-diagnosis{background:#f4f8f6;border:1px solid #d8e7df;padding:20px;margin:0 0 28px;break-inside:avoid}.evaluation-diagnosis h2{margin:5px 0 8px}.evaluation-diagnosis ol{padding-left:22px}.evaluation-diagnosis li{margin:8px 0}.evaluation-diagnosis-counts{display:flex;gap:18px;flex-wrap:wrap;font-size:13px}.evaluation-diagnosis-counts b{font-size:18px}.evaluation-diagnosis-limit{color:#586b66;font-size:12px}@media print{body{margin:20px;max-width:none}article{break-inside:avoid}}</style></head><body><header><h1>Evaluation report</h1><p>${escapeHtml(source?.name || 'Source document')} · ${escapeHtml(new Date(evaluation.createdAt).toLocaleString())}</p><p class="score">${escapeHtml(evaluation.score)}%</p><p>${evaluation.manual ? 'Target answers were pasted from a manual agent test.' : 'Target answers were generated through the configured model connection.'}</p></header>${evaluationSummaryMarkup(evaluation)}${evaluation.results.map(result).join('')}</body></html>`;
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([report], { type: 'text/html' })); link.download = `evaluation-report-${evaluation.createdAt.slice(0, 10)}.html`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, character => HTML_ESCAPES[character]); }
function safeHttpUrl(value) { try { const url = new URL(String(value)); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } }
function sourceLink(value, attributes = '') { const href = safeHttpUrl(value); return href ? `<a href="${escapeHtml(href)}"${attributes}>${escapeHtml(value)}</a>` : escapeHtml(value); }

async function loadWorkspace() {
  try { const response = await fetch('/api/state'); if (response.ok) { workspace = await response.json(); if (!viewScope && workspace.flexAgentSession?.orgId) viewScope = { orgId: workspace.flexAgentSession.orgId, agentId: workspace.flexAgentSession.selectedAgentId || null }; } } catch { /* The static preview is allowed before the local server starts. */ }
}

function toast(message) { const element = document.querySelector('#toast'); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 3100); }
window.addEventListener('hashchange', () => render());
loadWorkspace().finally(() => { render(); if (workspace.flexAgentSession?.connected) loadFlexAgentOrganizations(false); });
