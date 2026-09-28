const app = document.querySelector('#app');

let uploadedDocument = null;
let workspace = { documents: [], technicalDocuments: [], connections: [], datasets: [], evaluations: [], chats: [], agentConfigs: [] };
let reviewingDatasetId = null;
let viewingEvaluationId = null;
let activeChatId = null;
let chatDocumentId = null;
let chatTargetId = null;
let instructionDocumentId = null;
let instructionTargetId = null;
let datasetDocumentId = null;
let viewingRetrievedChunks = null;
let technicalTab = 'overview';
let technicalUploadStatus = null;
const allDocuments = () => [...workspace.documents, ...(workspace.technicalDocuments || [])];
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
  const documents = allDocuments(); const targets = workspace.connections.filter(connection => connection.role === 'target'); const controls = workspace.connections.filter(connection => connection.role === 'control'); const approved = workspace.datasets.filter(dataset => dataset.status === 'approved'); const ready = targets.length && controls.length && approved.length;
  const datasetLabel = item => `${documents.find(document => document.id === item.documentId)?.name || 'Unknown document'} · ${item.cases.length} scenarios`;
  const connectionField = (label, connections, id, role) => connections.length === 1 ? `<div class="field"><span class="connection-label">${label}</span><div class="connection-summary"><span class="connection-role">${role}</span><span><strong>${escapeHtml(connections[0].name)}</strong><small>${escapeHtml(connections[0].model)}</small></span></div><input id="${id}" type="hidden" value="${connections[0].id}" /></div>` : `<div class="field"><label for="${id}">${label}</label><select id="${id}">${connections.map(item => `<option value="${item.id}">${item.name}</option>`).join('')}</select></div>`;
  const runner = ready ? `<section class="panel card-pad"><h2 class="minor-title">Run an approved evaluation</h2><form id="evaluation-form" class="form-grid"><div class="field"><label for="evaluation-dataset">Golden dataset</label><select id="evaluation-dataset">${approved.map(item => `<option value="${item.id}">${datasetLabel(item)}</option>`).join('')}</select></div>${connectionField('Target agent', targets, 'evaluation-target', 'AI')}${connectionField('Control model', controls, 'evaluation-control', 'QA')}<div class="field full"><button class="button button-primary" type="submit">Run evaluation</button><span class="help">The target agent answers each approved scenario, then the control model judges it against the saved rubric.</span></div></form></section>` : `<section class="panel card-pad"><h2 class="minor-title">Your setup path</h2><ul class="rule-list"><li><b>1. Upload a document</b><span>Use an operational document or technical blueprint as the source for this evaluation.</span></li><li><b>2. Add target and control-model connections</b><span>Store each key once in Settings. The server encrypts it.</span></li><li><b>3. Create and approve your golden dataset</b><span>Review scenarios before running the target agent against them.</span></li></ul></section>`;
  const manualRunner = approved.length && controls.length ? `<section class="manual-runner"><div class="manual-runner-intro"><span class="manual-runner-icon">↳</span><div><span class="eyebrow">MANUAL FLEXAGENT TEST</span><h2>Score pasted agent answers</h2><p>Collect replies in FlexAgents, paste them below, and score them against the approved benchmark.</p></div></div><ol class="manual-steps"><li><b>1</b><span>Ask each scenario</span></li><li><b>2</b><span>Paste each reply</span></li><li><b>3</b><span>Score with the control model</span></li></ol>${approved.map(dataset => `<details class="manual-evaluation"><summary><span><strong>${escapeHtml(datasetLabel(dataset))}</strong><small>Ready for ${dataset.cases.length} pasted replies</small></span><span class="manual-open">Open test <i>→</i></span></summary><form class="manual-evaluation-form form-grid" data-dataset-id="${dataset.id}"><div class="field full"><label>Control model<select name="controlConnectionId">${controls.map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('')}</select></label></div>${dataset.cases.map((item, index) => `<div class="field full"><label for="manual-answer-${dataset.id}-${index}">Scenario ${index + 1}</label><p class="help">${escapeHtml(item.question)}</p><textarea id="manual-answer-${dataset.id}-${index}" name="answer" required placeholder="Paste the FlexAgents reply"></textarea></div>`).join('')}<div class="field full"><button class="button button-primary" type="submit">Score pasted answers</button><span class="help">One reply is required for each scenario.</span></div></form></details></section>`).join('')}</section>` : '';
  return `${header('Evaluation', 'Run an approved benchmark against a connected target or score replies collected from FlexAgents.')}${runner}${manualRunner}`;
}

function documents() {
  const readyDocument = workspace.documents.find(document => document.retrieval?.status === 'ready');
  const actions = `${button('Upload document', 'primary', 'js-upload')}${readyDocument ? ` ${button('Try customer chat', 'secondary js-start-chat')}` : ''}${workspace.documents.length ? ` ${button('Create golden dataset', 'secondary js-start-dataset')}` : ''}`;
  const content = workspace.documents.length ? `<div class="document-list">${workspace.documents.map(document => { const ready = document.retrieval?.status === 'ready'; return `<div class="document-item"><span class="document-icon">${document.type}</span><span><strong>${document.name}</strong><small>${document.characters.toLocaleString()} characters extracted · ${ready ? 'Retrieval ready.' : 'Retrieval unavailable — re-upload after connecting OpenAI.'}</small></span><span class="document-actions">${status(ready ? 'RAG ready' : 'Needs indexing', ready ? 'good' : 'draft')}<button class="button button-secondary button-small js-remove-document" data-id="${document.id}" type="button">Remove</button></span></div>`; }).join('')}</div>` : '';
  return `${header('Documents', 'Upload the policy document that will become the source of truth for your agent.', `<div class="button-row">${actions}</div>`)}
    <div class="two-col"><section class="panel card-pad"><div class="file-drop"><label for="file-input">Upload document</label><input id="file-input" type="file" accept=".pdf,.docx" /></div>${content}</section>
    <aside class="callout"><h3>What happens next</h3><p>Your document becomes the evidence source for the golden dataset, customer-facing agent, and every evaluation result.</p></aside></div>`;
}

function technical() {
  const documents = workspace.technicalDocuments || []; const selected = documents.find(item => item.id === location.hash.split(':')[1]) || documents[0];
  const list = documents.map(item => `<button class="blueprint-file ${item.id === selected?.id ? 'active' : ''} js-open-technical" data-id="${item.id}" type="button"><span class="document-icon">${item.type}</span><span><strong>${escapeHtml(item.name)}</strong><small>${item.characters.toLocaleString()} characters · ${item.analysisStatus === 'ready' ? 'Blueprint ready' : 'Analysis unavailable'}</small></span></button>`).join('');
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
  return `<div class="blueprint-simple-top"><div><div class="blueprint-title-row"><h1>Technical Blueprint</h1><span class="analysis-badge">Source-grounded</span></div><p>A plain-language guide to how this system works.</p>${selected ? `<p class="blueprint-document-name">Viewing: <strong>${escapeHtml(selected.name)}</strong></p>` : ''}${uploadStatus}</div><label class="button button-primary" for="technical-file-input">Upload document</label><input id="technical-file-input" type="file" accept=".pdf,.docx,.txt" /></div>${documents.length > 1 ? `<label class="blueprint-document-picker">Switch document <select id="technical-document-select">${documents.map(item => `<option value="${item.id}" ${item.id === selected?.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>` : ''}${detail}`;
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
  const documents = workspace.technicalDocuments || [];
  const selected = documents.find(item => item.id === location.hash.split(':')[1]) || documents[0];
  const detail = selected?.analysisStatus === 'ready' ? technicalAnalysis(selected.analysis) : selected ? `<section class="blueprint-unavailable"><h2>Analysis unavailable</h2><p>${escapeHtml(selected.analysisError || 'Connect an OpenAI control model in Settings, then re-upload this document to create its blueprint.')}</p></section>` : `<section class="blueprint-unavailable"><h2>Start with a technical document</h2><p>Upload an engineering PDF, DOCX, or TXT file.</p></section>`;
  const uploadStatus = technicalUploadStatus ? `<p class="technical-upload-status ${technicalUploadStatus.kind}" role="status">${escapeHtml(technicalUploadStatus.message)}</p>` : selected ? `<p class="technical-upload-status ready" role="status">Blueprint ready: ${escapeHtml(selected.name)}</p>` : '';
  const remove = documents.length ? `<section class="technical-document-list"><h2 class="minor-title">Technical documents</h2><div class="document-list">${documents.map(item => `<div class="document-item"><span class="document-icon">${escapeHtml(item.type)}</span><span><strong>${escapeHtml(item.name)}</strong><small>${item.characters.toLocaleString()} characters extracted · ${item.retrieval?.status === 'ready' ? 'Retrieval ready.' : 'Needs indexing.'}</small></span><span class="document-actions"><button class="button button-secondary button-small js-open-technical" data-id="${item.id}" type="button">Open</button><button class="button button-secondary button-small js-remove-technical-document" data-id="${item.id}" data-name="${escapeHtml(item.name)}" type="button">Remove</button></span></div>`).join('')}</div></section>` : '';
  return `<div class="blueprint-simple-top"><div><div class="blueprint-title-row"><h1>Technical Blueprint</h1><span class="analysis-badge">Source-grounded</span></div><p>A plain-language guide to how this system works.</p>${selected ? `<p class="blueprint-document-name">Viewing: <strong>${escapeHtml(selected.name)}</strong></p>` : ''}${uploadStatus}</div><div class="button-row">${remove}<label class="button button-primary" for="technical-file-input">Upload document</label></div><input id="technical-file-input" type="file" accept=".pdf,.docx,.txt" /></div>${documents.length > 1 ? `<label class="blueprint-document-picker">Switch document <select id="technical-document-select">${documents.map(item => `<option value="${item.id}" ${item.id === selected?.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>` : ''}${detail}`;
}

function technical() {
  const documents = workspace.technicalDocuments || [];
  const selected = documents.find(item => item.id === location.hash.split(':')[1]) || documents[0];
  const detail = selected?.analysisStatus === 'ready' ? technicalAnalysis(selected.analysis) : selected ? `<section class="blueprint-unavailable"><h2>Analysis unavailable</h2><p>${escapeHtml(selected.analysisError || 'Connect an OpenAI control model in Settings, then re-upload this document to create its blueprint.')}</p></section>` : `<section class="blueprint-unavailable"><h2>Start with a technical document</h2><p>Upload an engineering PDF, DOCX, or TXT file.</p></section>`;
  const rows = documents.map(item => `<div class="document-item ${item.id === selected?.id ? 'is-current' : ''}"><span class="document-icon">${escapeHtml(item.type)}</span><span><strong>${escapeHtml(item.name)}</strong><small>${item.characters.toLocaleString()} characters · ${item.retrieval?.status === 'ready' ? 'Retrieval ready' : 'Needs indexing'}</small></span><span class="document-actions"><button class="button button-secondary button-small js-open-technical" data-id="${item.id}" type="button">Open</button><button class="button button-secondary button-small js-remove-technical-document" data-id="${item.id}" type="button">Remove</button></span></div>`).join('');
  const list = rows ? `<details class="technical-library"><summary class="button button-secondary">Technical documents <span class="technical-library-count">${documents.length}</span></summary><section class="technical-library-menu" aria-label="Technical documents"><div class="technical-library-scroll">${rows}</div></section></details>` : '';
  const status = technicalUploadStatus ? `<p class="technical-upload-status ${technicalUploadStatus.kind}" role="status">${escapeHtml(technicalUploadStatus.message)}</p>` : selected ? `<p class="technical-upload-status ready" role="status">Viewing: ${escapeHtml(selected.name)}</p>` : '';
  return `<div class="blueprint-simple-top"><div><div class="blueprint-title-row"><h1>Technical Blueprint</h1><span class="analysis-badge">Source-grounded</span></div><p>A plain-language guide to how this system works.</p>${status}</div><div class="button-row blueprint-toolbar">${list}<label class="button button-primary" for="technical-file-input">Upload document</label></div><input id="technical-file-input" type="file" accept=".pdf,.docx,.txt" /></div>${detail}`;
}

function datasets() {
  const controls = workspace.connections.filter(connection => connection.role === 'control');
  const documents = allDocuments(); const selectedDocumentId = documents.some(item => item.id === datasetDocumentId) ? datasetDocumentId : documents[0]?.id;
  const ready = documents.length && controls.length;
  const reviewing = workspace.datasets.find(dataset => dataset.id === reviewingDatasetId);
  if (reviewing) return datasetReview(reviewing);
  const drafts = workspace.datasets.map(dataset => { const document = workspace.documents.find(item => item.id === dataset.documentId); return `<div class="document-item"><span class="document-icon">SET</span><span><strong>${escapeHtml(document?.name || 'Unknown policy document')} · ${dataset.cases.length} scenarios</strong><small>${dataset.status === 'approved' ? 'Approved benchmark' : 'Draft ready for your review'}</small></span>${dataset.status === 'approved' ? `<span class="dataset-action">${status('Approved', 'good')}<button class="button button-secondary button-small js-review-dataset" data-id="${dataset.id}" type="button">View dataset</button></span>` : `<button class="button button-primary button-small js-review-dataset" data-id="${dataset.id}" type="button">Review draft</button>`}</div>`; }).join('');
  return `${header('Golden datasets', 'Your approved scenarios will define the correct standard for the target agent.')}
    <div class="two-col"><section class="panel card-pad">${ready ? `<h2 class="minor-title">Generate a draft dataset</h2><form id="generate-form" class="form-grid"><div class="field"><label for="dataset-document">Policy document</label><select id="dataset-document">${workspace.documents.map(item => `<option value="${item.id}" ${item.id === selectedDocumentId ? 'selected' : ''}>${item.name}</option>`).join('')}</select></div><div class="field"><label for="dataset-count">Scenarios</label><input id="dataset-count" type="number" min="1" max="30" value="10" /></div><div class="field full"><label for="dataset-control">Control model</label><select id="dataset-control">${controls.map(item => `<option value="${item.id}">${item.name}</option>`).join('')}</select></div><div class="field full"><button class="button button-primary" type="submit">Generate draft scenarios</button><p id="generation-status" class="help" aria-live="polite">The control model will create a draft for you to review.</p></div></form>${drafts ? `<div class="document-list">${drafts}</div>` : ''}` : `<h2 class="minor-title">No golden datasets yet</h2><p class="page-subtitle">Upload a policy document and add a control-model connection in Settings first.</p>`}</section><aside class="callout"><h3>Your benchmark, not a guess</h3><p>Every approved case contains the customer scenario, expected outcome, required rules, and policy evidence.</p></aside></div>`;
}

function datasetReview(dataset) {
  const editable = dataset.status !== 'approved';
  const cases = dataset.cases.map((item, index) => `<fieldset class="review-case"><legend>Scenario ${index + 1}</legend>${editable && dataset.cases.length > 1 ? `<button class="review-delete js-delete-scenario" data-index="${index}" type="button">Remove scenario</button>` : ''}<div class="form-grid"><div class="field full"><label>Customer question or scenario</label><textarea data-field="question" data-index="${index}" ${editable ? '' : 'readonly'}>${escapeHtml(item.question || '')}</textarea></div><div class="field full"><label>Expected answer</label><textarea data-field="expectedAnswer" data-index="${index}" ${editable ? '' : 'readonly'}>${escapeHtml(item.expectedAnswer || '')}</textarea></div><div class="field"><label>Required points (one per line)</label><textarea data-field="requiredPoints" data-index="${index}" ${editable ? '' : 'readonly'}>${escapeHtml((item.requiredPoints || []).join('\n'))}</textarea></div><div class="field"><label>Forbidden points (one per line)</label><textarea data-field="forbiddenPoints" data-index="${index}" ${editable ? '' : 'readonly'}>${escapeHtml((item.forbiddenPoints || []).join('\n'))}</textarea></div><div class="field full"><label>Policy evidence</label><textarea data-field="sourceEvidence" data-index="${index}" ${editable ? '' : 'readonly'}>${escapeHtml(item.sourceEvidence || '')}</textarea></div><div class="field full"><label>Conversation turns (JSON, optional)</label><textarea data-field="turns" data-index="${index}" ${editable ? '' : 'readonly'} placeholder='[{"userMessage":"...","expectedAnswer":"...","requiredPoints":[],"forbiddenPoints":[],"sourceEvidence":"..."}]'>${escapeHtml((item.turns || []).length ? JSON.stringify(item.turns, null, 2) : '')}</textarea></div><div class="field full"><label>Expected final memory (JSON string array, optional)</label><textarea data-field="expectedFinalMemory" data-index="${index}" ${editable ? '' : 'readonly'} placeholder='["name: Sam", "city: Boston"]'>${escapeHtml((item.expectedFinalMemory || []).length ? JSON.stringify(item.expectedFinalMemory, null, 2) : '')}</textarea></div></div></fieldset>`).join('');
  const actions = editable ? `<div class="button-row"><button class="button button-secondary js-add-scenario" type="button">+ Add scenario</button><button class="button button-secondary" type="submit">Save changes</button><button class="button button-primary js-approve" data-id="${dataset.id}" type="button">Save & approve</button></div><p id="review-status" class="help" aria-live="polite">Write or verify the expected answer and evidence for every scenario before approving.</p>` : `<div class="review-footer"><p class="help">This benchmark is approved and ready to evaluate.</p><div class="button-row">${button('Back to datasets', 'primary', 'js-close-review')}${button('Go to evaluation', 'primary', 'js-go-evaluation')}</div></div>`;
  return `${header('Review golden dataset', `${dataset.cases.length} scenarios generated from your policy. Check the source evidence before approving.`, button('Back to datasets', 'primary', 'js-close-review'))}<section class="panel card-pad"><form id="dataset-review-form">${cases}${actions}</form></section>`;
}

function chat() {
  const targets = workspace.connections.filter(connection => connection.role === 'target' && connection.kind !== 'flexagent');
  const ready = workspace.documents.length && targets.length;
  const active = workspace.chats.find(item => item.id === activeChatId);
  const documentId = active?.documentId || chatDocumentId || workspace.documents[0]?.id;
  const targetId = active?.connectionId || chatTargetId || targets[0]?.id;
  const messages = active?.messages?.length ? active.messages.map(message => `<article class="message ${message.role === 'user' ? 'user' : 'agent'}"><span class="who">${message.role === 'user' ? 'You' : 'Support agent'}</span><div class="bubble">${escapeHtml(message.content)}</div></article>`).join('') : '<p class="chat-empty">Ask a question to begin the conversation.</p>';
  const memory = (active?.surveyMemory?.facts || []).map(fact => `<li><strong>${escapeHtml(fact.kind === 'explicit' ? 'Answer' : 'Inference')}</strong> · ${escapeHtml(fact.value)} <small>${escapeHtml(fact.status)} · source ${escapeHtml(fact.sourceMessageId)}</small></li>`).join('') || '<li>No survey facts recorded yet.</li>';
  const history = workspace.chats.map(item => `<button class="history-item ${item.id === activeChatId ? 'active' : ''} js-open-chat" data-id="${item.id}" type="button"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(workspace.documents.find(document => document.id === item.documentId)?.name || 'Policy document')}</small></button>`).join('');
  return `${header('Customer chat', 'A live customer conversation, grounded in the policy your client has uploaded.')}${ready ? `<div class="chat-shell"><aside class="chat-history"><button class="button button-secondary js-new-chat" type="button">+ New chat</button><span class="history-label">RECENT CHATS</span>${history || '<p class="history-empty">Your conversations will appear here.</p>'}</aside><section class="panel chat-window"><div class="chat-title"><div><strong>Customer support</strong><span>Policy-guided agent</span></div><div class="chat-config"><label>Policy<select id="chat-document">${workspace.documents.map(item => `<option value="${item.id}" ${item.id === documentId ? 'selected' : ''}>${item.name}</option>`).join('')}</select></label><label>Agent<select id="chat-target">${targets.map(item => `<option value="${item.id}" ${item.id === targetId ? 'selected' : ''}>${item.name}</option>`).join('')}</select></label></div></div><details class="survey-memory"><summary>Survey memory</summary><ul>${memory}</ul></details><div id="chat-messages" class="messages">${messages}</div><form id="customer-chat-form" class="chat-compose"><textarea id="customer-question" required rows="1" placeholder="Write a message…" aria-label="Message"></textarea><button class="button button-primary" type="submit">Send</button></form></section></div>` : `<section class="panel card-pad"><h2 class="minor-title">Customer chat is not configured yet</h2><p class="page-subtitle">Upload a policy document and add the target agent in Settings. Then this space becomes the clean chat your client’s customers will use.</p></section>`}`;
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

function results() {
  const latest = workspace.evaluations.find(item => item.id === viewingEvaluationId);
  const download = latest ? button('Download report', 'secondary', 'js-download-evaluation') : '';
  const label = evaluation => { const dataset = workspace.datasets.find(item => item.id === evaluation.datasetId); const document = workspace.documents.find(item => item.id === dataset?.documentId); return `${document?.name || 'Policy document'} · ${evaluation.results.length} scenarios`; };
  const picker = workspace.evaluations.length ? `<section class="panel evaluation-switcher"><label for="evaluation-history-select">${latest ? 'Viewing evaluation' : 'Open a saved evaluation'}</label><select id="evaluation-history-select"><option value="">Choose an evaluation</option>${workspace.evaluations.map(item => `<option value="${item.id}" ${item.id === latest?.id ? 'selected' : ''}>${label(item)} · ${item.score}% · ${new Date(item.createdAt).toLocaleString()}</option>`).join('')}</select></section>` : '';
  const detail = result => `<div class="evaluation-detail">${gapDiagnosisMarkup(result)}<section><b>Target answer</b><p>${escapeHtml(result.answer)}</p></section><section><b>Expected answer</b><p>${escapeHtml(result.case.expectedAnswer)}</p></section><section><b>Policy evidence</b><p>${escapeHtml(result.case.sourceEvidence)}</p></section><section><b>Rubric</b><p>Required:\n${escapeHtml((result.case.requiredPoints || []).join('\n') || 'None')}\n\nForbidden:\n${escapeHtml((result.case.forbiddenPoints || []).join('\n') || 'None')}</p></section>${result.turns ? `<section><b>Survey turns</b><p>${result.turns.map((turn, index) => `Turn ${index + 1}: ${turn.pass ? 'PASS' : 'GAP'} — ${turn.answer}`).join('\n')}</p><p>Final memory: ${result.memoryVerdict?.pass ? 'PASS' : `Missing ${result.memoryVerdict?.missing?.join(', ') || 'values'}`}</p></section>` : ''}${result.retrievalUnavailable ? '<section><b>Retrieval</b><p>FlexAgent used its own knowledge base; Eval Tool has no retrieval evidence to display.</p></section>' : ''}</div>`;
  const selected = viewingRetrievedChunks && workspace.evaluations.find(item => item.id === viewingRetrievedChunks.evaluationId)?.results[viewingRetrievedChunks.resultIndex];
  const retrievalPanel = selected ? `<div class="retrieval-overlay"><section class="retrieval-panel" role="dialog" aria-modal="true" aria-labelledby="retrieval-title"><div class="retrieval-panel-head"><div><p class="eyebrow">RETRIEVAL EVIDENCE</p><h2 id="retrieval-title">Policy sections sent to the target</h2><p>${escapeHtml(selected.case.question)}</p></div><button class="button button-secondary button-small js-close-retrieval" type="button">Close</button></div><div class="retrieval-list">${(selected.retrievedChunks || []).map((chunk, index) => `<details ${index === 0 ? 'open' : ''}><summary>Section ${index + 1}<span>${Number(chunk.score || 0).toFixed(2)} match</span></summary><p>${escapeHtml(chunk.text)}</p></details>`).join('') || '<p>No retrieval evidence was recorded for this evaluation.</p>'}</div></section></div>` : '';
  return `${header('Results', 'Completed evaluations will appear here, with the target answer, rubric, score, and supporting policy evidence.', download)}
    ${latest ? `${picker}<section class="panel card-pad"><h2 class="minor-title">Evaluation: ${latest.score}%</h2><p class="page-subtitle">${label(latest)} · ${new Date(latest.createdAt).toLocaleString()}</p></section>${evaluationSummaryMarkup(latest)}<section class="panel card-pad"><h2 class="minor-title">Scenario results</h2><div class="document-list">${latest.results.map((result, index) => `<article class="evaluation-result ${result.pass ? 'is-pass' : 'is-gap'}"><div class="document-item"><span class="document-icon ${result.pass ? 'result-pass' : 'result-gap'}">${result.pass ? 'PASS' : 'GAP'}</span><span><strong>${escapeHtml(result.case.question)}</strong><small>${escapeHtml(result.rationale || 'No rationale returned.')}</small></span><strong class="score ${result.pass ? 'score-pass' : 'score-gap'}">${result.score}%</strong></div><div class="retrieval-trigger"><button class="button button-secondary button-small js-view-retrieval" data-evaluation-id="${latest.id}" data-result-index="${index}" type="button">View retrieved policy sections (${(result.retrievedChunks || []).length})</button></div>${detail(result)}</article>`).join('')}</div></section>${retrievalPanel}` : `<section class="panel card-pad"><h2 class="minor-title">No results yet</h2><p class="page-subtitle">Once you run an approved golden dataset against your target agent, this area will make every pass, gap, and unsupported claim easy to review.</p></section>`}`;
}

function settings() {
  const targets = workspace.connections.filter(connection => connection.role === 'target' && connection.kind !== 'flexagent');
  const target = targets.find(connection => connection.id === instructionTargetId) || targets[0];
  const document = workspace.documents.find(item => item.id === instructionDocumentId) || workspace.documents[0];
  const config = document && target && workspace.agentConfigs.find(item => item.documentId === document.id && item.connectionId === target.id);
  const connections = workspace.connections.length ? `<div class="document-list">${workspace.connections.map(connection => `<div class="document-item"><span class="document-icon">${connection.role === 'target' ? 'AI' : 'QA'}</span><span><strong>${connection.name}</strong><small>${connection.role === 'target' ? 'Target agent' : 'Control model'} · ${connection.model}</small></span><button class="button button-secondary button-small js-remove-connection" data-id="${connection.id}" type="button">Remove</button></div>`).join('')}</div>` : '';
  const promptForm = target && document ? `<form id="agent-prompt-form" class="form-grid agent-prompt"><div class="field"><label for="instruction-document">Policy document</label><select id="instruction-document">${workspace.documents.map(item => `<option value="${item.id}" ${item.id === document.id ? 'selected' : ''}>${item.name}</option>`).join('')}</select></div><div class="field"><label for="instruction-target">Target agent</label><select id="instruction-target">${targets.map(item => `<option value="${item.id}" ${item.id === target.id ? 'selected' : ''}>${item.name} · ${item.model}</option>`).join('')}</select></div><div class="field full"><label for="agent-system-prompt">Instructions for this policy</label><textarea id="agent-system-prompt" required>${escapeHtml(config?.systemPrompt || target.systemPrompt || 'Follow the policy document. Do not invent information. If it does not answer the question, say so clearly.')}</textarea><span class="help">Only used when this policy document is selected in customer chat or evaluation.</span></div><div class="field full"><button class="button button-secondary" type="submit">Save instructions for this policy</button></div></form>` : '';
  const flexAgentForm = `<h2 class="minor-title">FlexAgent target</h2><form id="flexagent-form" class="form-grid"><div class="field"><label for="flexagent-name">Name</label><input id="flexagent-name" value="FlexAgent target" /></div><div class="field"><label for="flexagent-url">FlexAgent API URL</label><input id="flexagent-url" required type="url" placeholder="https://flexagent.example.com" /></div><div class="field"><label for="flexagent-mode">Connection method</label><select id="flexagent-mode"><option value="api">Private evaluation API</option><option value="livekit">LiveKit widget path</option></select></div><div class="field"><label for="flexagent-org-id">Organization ID</label><input id="flexagent-org-id" required placeholder="FlexAgent organization ID" /></div><div class="field"><label for="flexagent-agent-id">Agent ID</label><input id="flexagent-agent-id" required placeholder="FlexAgent agent ID" /></div><div class="field"><label for="flexagent-origin">Eval Tool origin</label><input id="flexagent-origin" type="url" value="http://127.0.0.1:4173" /><span class="help">For LiveKit, this exact origin must be whitelisted as a widget domain.</span></div><div class="field full"><label for="flexagent-token">Evaluation service token</label><input id="flexagent-token" type="password" autocomplete="off" placeholder="Only required for Private evaluation API" /><span class="help">Stored encrypted locally and never shown again. LiveKit widget mode does not use this token.</span></div><div class="field full"><button class="button button-secondary" type="submit">Save FlexAgent target</button></div></form>`;
  return `${header('Settings', 'Connect OpenAI once, then choose the models used for your customer agent and evaluation.') }<div class="two-col"><section class="panel card-pad"><h2 class="minor-title">Connect OpenAI</h2><form id="openai-form" class="form-grid"><div class="field full"><label for="openai-key">OpenAI API key</label><input id="openai-key" required type="password" autocomplete="off" placeholder="Paste your OpenAI API key" /><span class="help">It is encrypted by the server and never shown again.</span></div><div class="field"><label for="target-model">Target model</label><input id="target-model" required value="gpt-5.6-luna" placeholder="Model that answers customers" /></div><div class="field"><label for="control-model">Control model</label><input id="control-model" required value="gpt-5.6-terra" placeholder="Model that creates and judges datasets" /></div><div class="field full"><button class="button button-primary" type="submit">Save OpenAI setup</button><span class="help">Saving replaces the existing OpenAI setup. A model request will confirm that your account has available API credits.</span></div></form>${flexAgentForm}${promptForm}${connections}</section><aside class="callout"><h3>One key, two jobs</h3><p>Your customer-facing target model answers questions. The control model creates golden datasets, judges answers, and creates local retrieval embeddings.</p></aside></div>`;
}

function datasets() {
  const documents = allDocuments(); const controls = workspace.connections.filter(connection => connection.role === 'control');
  const selectedDocumentId = documents.some(item => item.id === datasetDocumentId) ? datasetDocumentId : documents[0]?.id;
  const reviewing = workspace.datasets.find(dataset => dataset.id === reviewingDatasetId);
  if (reviewing) return datasetReview(reviewing);
  const drafts = workspace.datasets.map(dataset => { const source = documents.find(item => item.id === dataset.documentId); return `<div class="document-item"><span class="document-icon">SET</span><span><strong>${escapeHtml(source?.name || 'Unknown document')} · ${dataset.cases.length} scenarios</strong><small>${dataset.status === 'approved' ? 'Approved benchmark' : 'Draft ready for review'}</small></span><button class="button button-secondary button-small js-review-dataset" data-id="${dataset.id}" type="button">${dataset.status === 'approved' ? 'View dataset' : 'Review draft'}</button></div>`; }).join('');
  const library = drafts ? `<section class="panel card-pad dataset-library"><span class="eyebrow">YOUR BENCHMARKS</span><h2 class="minor-title">Golden datasets</h2><div class="document-list">${drafts}</div></section>` : `<aside class="callout dataset-guide"><span class="eyebrow">WHAT YOU WILL CREATE</span><h2>Your benchmark, not a guess</h2><p>Every approved case contains the customer scenario, expected outcome, required rules, and source evidence.</p><ol><li>Generate a draft from your document.</li><li>Check each expected answer and evidence.</li><li>Approve it for evaluation.</li></ol></aside>`;
  return `${header('Golden datasets', 'Create reviewable scenarios from an operational or technical document.')}<div class="dataset-workspace"><section class="panel card-pad">${documents.length && controls.length ? `<h2 class="minor-title">Generate a draft dataset</h2><form id="generate-form" class="form-grid"><div class="field"><label for="dataset-document">Document</label><select id="dataset-document">${documents.map(item => `<option value="${item.id}" ${item.id === selectedDocumentId ? 'selected' : ''}>${escapeHtml(`${item.name} (${item.kind === 'technical' ? 'Technical Blueprint' : 'Operational document'})`)}</option>`).join('')}</select></div><div class="field"><label for="dataset-count">Scenarios</label><input id="dataset-count" type="number" min="1" max="30" value="10" /></div><div class="field full"><label for="dataset-control">Control model</label><select id="dataset-control">${controls.map(item => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('')}</select></div><div class="field full"><button class="button button-primary" type="submit">Generate draft scenarios</button><p id="generation-status" class="help" aria-live="polite">The control model drafts source-backed scenarios for review.</p></div></form>` : '<h2 class="minor-title">No documents or control model yet</h2><p class="page-subtitle">Upload a document and add a control-model connection in Settings.</p>'}</section>${library}</div>`;
}

function chat() {
  const documents = [...workspace.documents.filter(item => item.retrieval?.status === 'ready'), ...workspace.technicalDocuments]; const targets = workspace.connections.filter(connection => connection.role === 'target' && connection.kind !== 'flexagent');
  const active = workspace.chats.find(item => item.id === activeChatId); const documentId = active?.documentId || chatDocumentId || documents[0]?.id; const targetId = active?.connectionId || chatTargetId || targets[0]?.id;
  const messages = active?.messages?.length ? active.messages.map(message => `<article class="message ${message.role === 'user' ? 'user' : 'agent'}"><span class="who">${message.role === 'user' ? 'You' : 'Agent'}</span><div class="bubble">${escapeHtml(message.content)}</div></article>`).join('') : '<p class="chat-empty">Ask a question about the selected document.</p>';
  const history = workspace.chats.map(item => `<button class="history-item ${item.id === activeChatId ? 'active' : ''} js-open-chat" data-id="${item.id}" type="button"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(allDocuments().find(document => document.id === item.documentId)?.name || 'Document')}</small></button>`).join('');
  return `${header('Document chat', 'Ask a target agent questions grounded in the selected operational or technical document.')}${documents.length && targets.length ? `<div class="chat-shell"><aside class="chat-history"><button class="button button-secondary js-new-chat" type="button">+ New chat</button><span class="history-label">RECENT CHATS</span>${history}</aside><section class="panel chat-window"><div class="chat-title"><div><strong>Grounded agent</strong><span>Source-backed answers</span></div><div class="chat-config"><label>Document<select id="chat-document">${documents.map(item => `<option value="${item.id}" ${item.id === documentId ? 'selected' : ''}>${escapeHtml(`${item.name} (${item.kind === 'technical' ? 'Technical Blueprint' : 'Operational document'})`)}</option>`).join('')}</select></label><label>Agent<select id="chat-target">${targets.map(item => `<option value="${item.id}" ${item.id === targetId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label></div></div><div id="chat-messages" class="messages">${messages}</div><form id="customer-chat-form" class="chat-compose"><textarea id="customer-question" required rows="1" placeholder="Ask a question…" aria-label="Message"></textarea><button class="button button-primary" type="submit">Send</button></form></section></div>` : '<section class="panel card-pad"><h2 class="minor-title">Document chat is not configured yet</h2><p class="page-subtitle">Upload a document and add a model target in Settings.</p></section>'}`;
}

const pages = { home, evaluation, documents, technical, datasets, chat, results, settings };
function render(page = location.hash.slice(1).split(':')[0] || 'home') {
  app.innerHTML = pages[page] ? pages[page]() : pages.home();
  document.querySelectorAll('.nav-link').forEach(link => link.classList.toggle('active', link.dataset.page === page));
  bind(page);
}

function bind(page) {
  document.querySelectorAll('[data-page]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); if (link.dataset.page === 'results') viewingEvaluationId = null; location.hash = link.dataset.page; }));
  if (page === 'results' && !viewingEvaluationId) {
    const overview = app.querySelector('.panel.card-pad');
    if (overview) {
      overview.classList.add('results-overview');
      overview.innerHTML = `<span class="eyebrow">EVALUATION RECORDS</span><h2 class="minor-title">Review evidence, not just a score.</h2><p class="page-subtitle">Each saved evaluation keeps the target answer, expected answer, source evidence, rubric, and control-model verdict for every scenario.</p><div class="results-overview-facts"><span><b>${workspace.evaluations.length}</b> saved evaluation${workspace.evaluations.length === 1 ? '' : 's'}</span><span><b>${workspace.datasets.filter(item => item.status === 'approved').length}</b> approved benchmark${workspace.datasets.filter(item => item.status === 'approved').length === 1 ? '' : 's'}</span></div>`;
      if (workspace.evaluations.length) overview.insertAdjacentHTML('afterend', `<section class="panel evaluation-switcher"><label for="evaluation-history-select">Open a saved evaluation</label><select id="evaluation-history-select"><option value="">Choose an evaluation</option>${workspace.evaluations.map(item => { const dataset = workspace.datasets.find(dataset => dataset.id === item.datasetId); const document = workspace.documents.find(document => document.id === dataset?.documentId); return `<option value="${item.id}">${escapeHtml(document?.name || 'Source document')} · ${item.score}% · ${new Date(item.createdAt).toLocaleString()}</option>`; }).join('')}</select></section>`);
    }
  }
  document.querySelectorAll('.js-toast').forEach(el => el.addEventListener('click', () => toast('Connection setup will be available with the secure backend.')));
  document.querySelectorAll('.js-upload').forEach(el => el.addEventListener('click', () => {
    const input = document.querySelector('#file-input');
    if (input) input.click(); else location.hash = 'documents';
  }));
  document.querySelector('#file-input')?.addEventListener('change', event => uploadDocument(event.target.files[0]));
  document.querySelector('#technical-file-input')?.addEventListener('change', event => uploadTechnicalDocument(event.target.files[0]));
  document.querySelector('#technical-search')?.addEventListener('input', event => { const query = event.target.value.toLowerCase(); document.querySelectorAll('[data-search], .flow-details details, .blueprint-example-panel article, .blueprint-questions details').forEach(item => { item.hidden = !item.textContent.toLowerCase().includes(query); }); });
  document.querySelector('.js-catalog-search')?.addEventListener('input', event => { const query = event.target.value.toLowerCase(); document.querySelectorAll('[data-search]').forEach(item => { item.hidden = !item.dataset.search.toLowerCase().includes(query); }); });
  document.querySelector('.js-show-overview')?.addEventListener('click', () => { const source = document.querySelector('#overview .blueprint-evidence'); source.open = true; source.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  document.querySelectorAll('.js-remove-document').forEach(button => button.addEventListener('click', () => removeDocument(button.dataset.id)));
  document.querySelectorAll('.js-remove-technical-document').forEach(button => button.addEventListener('click', () => removeTechnicalDocument(button.dataset.id)));
  document.querySelectorAll('.js-open-technical').forEach(button => button.addEventListener('click', () => { document.querySelector('.technical-library')?.removeAttribute('open'); location.hash = `technical:${button.dataset.id}`; render('technical'); }));
  document.querySelectorAll('.js-technical-tab').forEach(button => button.addEventListener('click', () => { technicalTab = button.dataset.tab; render('technical'); }));
  document.querySelector('#technical-document-select')?.addEventListener('change', event => { technicalTab = 'overview'; location.hash = `technical:${event.target.value}`; });
  document.querySelectorAll('.js-start-chat').forEach(button => button.addEventListener('click', () => { activeChatId = null; chatDocumentId = workspace.documents.find(item => item.retrieval?.status === 'ready')?.id; location.hash = 'chat'; }));
  document.querySelectorAll('.js-start-dataset').forEach(button => button.addEventListener('click', () => { datasetDocumentId = workspace.documents.find(item => item.retrieval?.status === 'ready')?.id; location.hash = 'datasets'; }));
  document.querySelector('#openai-form')?.addEventListener('submit', saveOpenAISetup);
  document.querySelector('#flexagent-form')?.addEventListener('submit', saveFlexAgentTarget);
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
  const viewedEvaluation = workspace.evaluations.find(item => item.id === viewingEvaluationId) || workspace.evaluations[0];
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
  const form = new FormData(); form.append('document', file);
  try {
    const response = await fetch('/api/documents', { method: 'POST', body: form }); const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    workspace.documents.push(body); uploadedDocument = body; render('documents'); toast(`${body.name} uploaded and text extracted.`);
  } catch (error) { toast(error.message || 'Document upload failed. Start the server with npm start.'); }
}
async function uploadTechnicalDocument(file) {
  if (!file) return;
  const form = new FormData(); form.append('document', file);
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

async function liveKitAnswer(targetConnectionId, question) {
  if (!window.LivekitClient) return Promise.reject(new Error('LiveKit client did not load. Restart Eval Tool and try again.'));
  const tokenResponse = await fetch('/api/flexagent-livekit-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetConnectionId }) });
  const credentials = await tokenResponse.json();
  if (!tokenResponse.ok) throw new Error(credentials.error || 'FlexAgent did not issue a LiveKit token.');
  const room = new window.LivekitClient.Room();
  try {
    const answer = await new Promise(async (resolve, reject) => {
      let active = false;
      const timeout = setTimeout(() => reject(new Error('FlexAgent did not return a final answer within 45 seconds.')), 45000);
      room.registerTextStreamHandler('lk.transcription', async reader => {
        const text = (await reader.readAll()).trim();
        if (active && reader.info.attributes?.['lk.transcription_final'] === 'true' && text) { clearTimeout(timeout); resolve(text); }
      });
      try { await room.connect(credentials.wsUrl, credentials.token); active = true; await room.localParticipant.sendText(question, { topic: 'lk.chat' }); } catch (error) { clearTimeout(timeout); reject(error); }
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
    return { question: value('question'), expectedAnswer: value('expectedAnswer'), requiredPoints: value('requiredPoints').split('\n').map(text => text.trim()).filter(Boolean), forbiddenPoints: value('forbiddenPoints').split('\n').map(text => text.trim()).filter(Boolean), sourceEvidence: value('sourceEvidence'), turns: json('turns'), expectedFinalMemory: json('expectedFinalMemory') };
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
  const evaluation = workspace.evaluations.find(item => item.id === viewingEvaluationId) || workspace.evaluations[0];
  const dataset = workspace.datasets.find(item => item.id === evaluation?.datasetId); const source = allDocuments().find(item => item.id === dataset?.documentId);
  if (!evaluation || !dataset) return;
  const result = item => `<article><h2>${escapeHtml(item.case.question)}</h2><p class="verdict ${item.pass ? 'pass' : 'gap'}">${item.pass ? 'PASS' : 'GAP'} · ${item.score}%</p>${gapDiagnosisMarkup(item)}<h3>Target answer</h3><p>${escapeHtml(item.answer)}</p><h3>Expected answer</h3><p>${escapeHtml(item.case.expectedAnswer)}</p><h3>Policy evidence</h3><p>${escapeHtml(item.case.sourceEvidence)}</p><h3>Required points</h3><ul>${(item.case.requiredPoints || []).map(point => `<li>${escapeHtml(point)}</li>`).join('') || '<li>None</li>'}</ul><h3>Forbidden points</h3><ul>${(item.case.forbiddenPoints || []).map(point => `<li>${escapeHtml(point)}</li>`).join('') || '<li>None</li>'}</ul><h3>Rationale</h3><p>${escapeHtml(item.rationale || 'No rationale returned.')}</p></article>`;
  const report = `<!doctype html><html><head><meta charset="utf-8"><title>Evaluation report</title><style>body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;color:#182338;line-height:1.5}header,article{border-bottom:1px solid #d8dee8;padding:0 0 24px;margin-bottom:28px}h1{margin-bottom:4px}h2{font-size:18px}h3{font-size:14px;margin-bottom:4px}p{white-space:pre-wrap}.score{font-size:32px;font-weight:700}.verdict{font-weight:700}.pass{color:#087443}.gap{color:#b42318}.gap-diagnosis{background:#fff5f2;border-left:3px solid #b42318;padding:12px 16px;margin:16px 0}.gap-diagnosis h3{margin:0 0 8px}.gap-diagnosis p{margin:6px 0}.gap-diagnosis small{color:#684b45}.evaluation-diagnosis{background:#f4f8f6;border:1px solid #d8e7df;padding:20px;margin:0 0 28px;break-inside:avoid}.evaluation-diagnosis h2{margin:5px 0 8px}.evaluation-diagnosis ol{padding-left:22px}.evaluation-diagnosis li{margin:8px 0}.evaluation-diagnosis-counts{display:flex;gap:18px;flex-wrap:wrap;font-size:13px}.evaluation-diagnosis-counts b{font-size:18px}.evaluation-diagnosis-limit{color:#586b66;font-size:12px}@media print{body{margin:20px;max-width:none}article{break-inside:avoid}}</style></head><body><header><h1>Evaluation report</h1><p>${escapeHtml(source?.name || 'Source document')} · ${escapeHtml(new Date(evaluation.createdAt).toLocaleString())}</p><p class="score">${evaluation.score}%</p><p>${evaluation.manual ? 'Target answers were pasted from a manual agent test.' : 'Target answers were generated through the configured model connection.'}</p></header>${evaluationSummaryMarkup(evaluation)}${evaluation.results.map(result).join('')}</body></html>`;
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([report], { type: 'text/html' })); link.download = `evaluation-report-${evaluation.createdAt.slice(0, 10)}.html`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

function escapeHtml(value) { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }

async function loadWorkspace() {
  try { const response = await fetch('/api/state'); if (response.ok) workspace = await response.json(); } catch { /* The static preview is allowed before the local server starts. */ }
}

function toast(message) { const element = document.querySelector('#toast'); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 3100); }
window.addEventListener('hashchange', () => render());
loadWorkspace().finally(render);
