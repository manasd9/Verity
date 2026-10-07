const app = document.querySelector('#app');

let uploadedDocument = null;
let workspace = {
  documents: [],
  technicalDocuments: [],
  websites: [],
  websiteSnapshots: [],
  connections: [],
  flexAgentSession: null,
  datasets: [],
  evaluations: [],
  chats: [],
  agentConfigs: [],
};
let flexAgentAgents = [];
let flexAgentOrganizations = [];
let workspaceMode = (() => {
  try {
    return localStorage.getItem('eval-workspace-mode') === 'flex' ? 'flex' : 'local';
  } catch {
    return 'local';
  }
})();
let viewScope = null;
function selectedScope() {
  return workspaceMode === 'flex' && viewScope?.orgId && viewScope.agentId ? viewScope : null;
}
function canWriteWorkspace() {
  const scope = selectedScope();
  const session = workspace.flexAgentSession;
  return (
    workspaceMode === 'local' ||
    Boolean(session?.connected && scope && scope.orgId === session.orgId && scope.agentId === session.selectedAgentId)
  );
}
function inSelectedWorkspace(item) {
  const scope = selectedScope();
  return workspaceMode === 'local'
    ? !item.orgId && !item.agentId
    : Boolean(scope && item.orgId === scope.orgId && item.agentId === scope.agentId);
}
function scopeControls() {
  const session = workspace.flexAgentSession;
  const orgs = [...flexAgentOrganizations];
  const saved = [
    ...workspace.documents,
    ...workspace.technicalDocuments,
    ...workspace.websites,
    ...workspace.websiteSnapshots,
    ...workspace.datasets,
    ...workspace.evaluations,
  ];
  for (const item of saved)
    if (item.orgId && !orgs.some(org => org.id === item.orgId))
      orgs.push({ id: item.orgId, name: item.orgName || item.orgId });
  if (session?.orgId && !orgs.some(org => org.id === session.orgId))
    orgs.push({ id: session.orgId, name: session.orgName || session.orgId });
  const agents = workspaceMode === 'flex' && viewScope?.orgId === session?.orgId ? [...flexAgentAgents] : [];
  for (const item of saved)
    if (
      workspaceMode === 'flex' &&
      item.orgId === viewScope?.orgId &&
      item.agentId &&
      !agents.some(agent => agent.id === item.agentId)
    )
      agents.push({ id: item.agentId, name: item.agentName || item.agentId });
  if (
    workspaceMode === 'flex' &&
    viewScope?.orgId === session?.orgId &&
    session?.selectedAgentId &&
    !agents.some(agent => agent.id === session.selectedAgentId)
  )
    agents.push({ id: session.selectedAgentId, name: session.selectedAgentName || session.selectedAgentId });
  const connected = Boolean(session?.connected);
  const orgOptions = `${workspaceMode === 'flex' && !viewScope?.orgId ? '<option value="" selected disabled>Choose an organization</option>' : ''}<option value="local" ${workspaceMode === 'local' ? 'selected' : ''}>Existing local workspace</option>${orgs.map(org => `<option value="${escapeHtml(org.id)}" ${workspaceMode === 'flex' && org.id === viewScope?.orgId ? 'selected' : ''}>${escapeHtml(org.name)}</option>`).join('')}`;
  const agentOptions = `<option value="">${workspaceMode === 'local' ? 'Local model / unassigned' : 'Choose an agent'}</option>${agents.map(agent => `<option value="${escapeHtml(agent.id)}" ${workspaceMode === 'flex' && agent.id === viewScope?.agentId ? 'selected' : ''}>${escapeHtml(agent.name)}</option>`).join('')}`;
  const help =
    workspaceMode === 'local'
      ? 'Existing unassigned sources and runs, including records created before agent selection was added.'
      : !connected
        ? 'You can view saved records. Reconnect FlexAgent in Settings to add sources or run evaluations.'
        : !viewScope?.orgId
          ? 'Choose an organization, then an agent.'
          : !viewScope.agentId
            ? 'Choose an agent to view its sources and evaluations.'
            : `Showing Eval Tool records for ${escapeHtml(agents.find(agent => agent.id === viewScope.agentId)?.name || viewScope.agentId)}. Clients manage this agent’s FlexAgent knowledge base separately.`;
  return `<section class="workspace-scope" aria-label="Evaluation workspace"><div class="field"><label for="workspace-organization">Organization</label><select id="workspace-organization"><button type="button"><selectedcontent></selectedcontent></button>${orgOptions}</select></div><span class="workspace-scope-slash" aria-hidden="true">/</span><div class="field"><label for="workspace-agent">Agent</label><select id="workspace-agent" ${workspaceMode !== 'flex' || !viewScope?.orgId ? 'disabled' : ''}><button type="button"><selectedcontent></selectedcontent></button>${agentOptions}</select></div><p class="help">${help}</p>${workspaceMode === 'flex' && !connected ? '<a href="#settings">Open Settings</a>' : ''}</section>`;
}
let reviewingDatasetId = null;
let reviewScenarioIndex = 0;
let reviewScenarioDatasetId = null;
let viewingEvaluationId = null;
let activeChatId = null;
let chatDocumentId = null;
let chatTargetId = null;
let instructionDocumentId = null;
let instructionTargetId = null;
let settingsTab = 'openai';
let datasetDocumentId = null;
let viewingRetrievedChunks = null;
let resultScenarioIndex = 0;
let resultScenarioEvaluationId = null;
let resultFilter = 'all';
let technicalTab = 'overview';
let technicalUploadStatus = null;
const allDocuments = () => [
  ...workspace.documents,
  ...(workspace.technicalDocuments || []),
  ...(workspace.websiteSnapshots || []).filter(item => ['complete', 'incomplete'].includes(item.status)),
];
const sidebarToggle = document.querySelector('#sidebar-toggle');
function setSidebarCollapsed(collapsed) {
  document.querySelector('.shell').classList.toggle('sidebar-collapsed', collapsed);
  sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
  sidebarToggle.setAttribute('aria-label', collapsed ? 'Show navigation' : 'Hide navigation');
  sidebarToggle.title = collapsed ? 'Show navigation' : 'Hide navigation';
  try {
    localStorage.setItem('sidebar-collapsed', String(collapsed));
  } catch {
    /* Keep the control usable when storage is unavailable. */
  }
}
sidebarToggle.addEventListener('click', () =>
  setSidebarCollapsed(!document.querySelector('.shell').classList.contains('sidebar-collapsed')),
);
try {
  setSidebarCollapsed(localStorage.getItem('sidebar-collapsed') === 'true');
} catch {
  setSidebarCollapsed(false);
}

function button(label, kind = 'secondary', extra = '') {
  return `<button class="button button-${kind} ${extra}" type="button">${label}</button>`;
}
function status(text, kind) {
  return `<span class="status ${kind}">${text}</span>`;
}
function header(title, subtitle, action = '') {
  return `<header class="page-top"><div><h1 class="page-title">${title}</h1><p class="page-subtitle">${subtitle}</p></div>${action}</header>`;
}

function home() {
  const documents = allDocuments();
  const controls = workspace.connections.filter(connection => connection.role === 'control');
  const targets = workspace.connections.filter(connection => connection.role === 'target');
  const approved = workspace.datasets.filter(dataset => dataset.status === 'approved').length;
  const drafts = workspace.datasets.length - approved;
  const runs = workspace.evaluations.length;
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const workflow = [
    {
      page: 'settings',
      number: '1',
      title: 'Connect your models',
      text: 'Add your OpenAI key. The control model writes and grades the tests; the target is the agent you are testing.',
      action: 'Open Settings',
      status: controls.length
        ? `Control model ready${targets.length ? ` · ${plural(targets.length, 'target')}` : ' · no target yet'}`
        : 'Not connected yet',
      done: controls.length > 0,
    },
    {
      page: 'documents',
      number: '2',
      title: 'Upload a source document',
      text: 'The policy, SOP, website, or technical blueprint that defines the right answers.',
      action: 'Upload a source document',
      status: documents.length ? plural(documents.length, 'source') : 'No sources yet',
      done: documents.length > 0,
    },
    {
      page: 'datasets',
      number: '3',
      title: 'Build the golden dataset',
      text: 'The control model drafts questions with expected answers and source evidence. You edit and approve them.',
      action: 'Open Golden datasets',
      status: workspace.datasets.length ? `${approved} approved · ${plural(drafts, 'draft')}` : 'No datasets yet',
      done: approved > 0,
    },
    {
      page: 'evaluation',
      number: '4',
      title: 'Run the evaluation',
      text: 'The target agent answers every scenario and the control model scores each answer.',
      action: 'Open Evaluation',
      status: runs ? plural(runs, 'run') : 'No runs yet',
      done: runs > 0,
    },
    {
      page: 'results',
      number: '5',
      title: 'Review the results',
      text: 'Pass or gap for each scenario, with the reason and the source sections the agent used.',
      action: 'Open Results',
      status: runs ? 'Results ready' : 'Appears after a run',
      done: runs > 0,
    },
  ];
  const next = workflow.find(step => !step.done)?.number;
  const concepts = [
    ['Target agent', 'The AI agent being tested, such as your customer-support agent.'],
    ['Control model', 'A separate model that writes the test questions and grades the answers.'],
    [
      'Golden dataset',
      'The approved list of questions and correct answers. It is the benchmark every run is measured against.',
    ],
    ['Source evidence', 'The passage in your document that proves an expected answer is correct.'],
  ];
  const step = workflow.find(item => item.number === next);
  const nextPanel = step
    ? `<section class="home-next"><div><span class="home-next-step">Step ${step.number} of 5</span><h2>${step.title}</h2><p>${step.text}</p></div>${step.page === 'documents' ? button(step.action, 'primary', 'js-upload') : `<a class="button button-primary" href="#${step.page}" data-page="${step.page}">${step.action}</a>`}</section>`
    : `<section class="home-next"><div><span class="home-next-step">Ready</span><h2>Turn a trusted document into a test your agent has to pass.</h2><p>Every step is set up. Add a source to build a new test, or review your latest results.</p></div>${button('Upload a source document', 'primary', 'js-upload')}</section>`;
  return `${header('Welcome to Verity', 'Test whether an AI agent answers the way your documents say it should.')}
    ${nextPanel}
    <ol class="home-track" aria-label="Setup progress">${workflow.map((step, index) => `<li style="--i: ${index}" class="${step.done ? 'done' : ''} ${step.number === next ? 'is-next' : ''}"><a href="#${step.page}" data-page="${step.page}"><strong>${step.number}. ${step.title}</strong><small>${step.done ? '✓ ' : ''}${step.status}</small></a></li>`).join('')}</ol>
    <details class="home-terms"><summary>What do these terms mean?</summary><dl>${concepts.map(([term, meaning]) => `<div><dt>${term}</dt><dd>${meaning}</dd></div>`).join('')}</dl><p class="help">Can’t run your agent from Verity? Ask it each scenario yourself, then paste the replies on the Evaluation page to score them.</p></details>`;
}

function evaluation() {
  const documents = allDocuments().filter(inSelectedWorkspace);
  const targets = workspace.connections.filter(
    connection =>
      connection.role === 'target' &&
      (workspaceMode === 'local'
        ? connection.kind !== 'flexagent-livekit' && connection.kind !== 'flexagent'
        : connection.kind === 'flexagent-livekit' &&
          selectedScope()?.orgId === connection.orgId &&
          selectedScope()?.agentId === connection.agentId),
  );
  const controls = workspace.connections.filter(connection => connection.role === 'control');
  const approved = workspace.datasets.filter(dataset => dataset.status === 'approved' && inSelectedWorkspace(dataset));
  const ready = canWriteWorkspace() && targets.length && controls.length && approved.length;
  const datasetLabel = item =>
    `${documents.find(document => document.id === item.documentId)?.name || 'Unknown source'} · ${item.cases.length} scenarios`;
  const connectionField = (label, connections, id, role) =>
    connections.length === 1
      ? `<div class="field"><span class="connection-label">${label}</span><div class="connection-summary"><span class="connection-role">${role}</span><span><strong>${escapeHtml(connections[0].name)}</strong><small>${escapeHtml(connections[0].model)}</small></span></div><input id="${id}" type="hidden" value="${escapeHtml(connections[0].id)}" /></div>`
      : `<div class="field"><label for="${id}">${label}</label><select id="${id}">${connections.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}</select></div>`;
  const nextStep =
    workspaceMode === 'flex'
      ? !workspace.flexAgentSession?.connected
        ? 'Reconnect FlexAgent in Settings to run evaluations. Saved results remain available.'
        : !selectedScope()
          ? 'Choose an organization and agent above.'
          : !approved.length
            ? 'Add a source for this agent, generate a golden dataset, and approve it.'
            : !controls.length
              ? 'Connect a control model in Settings.'
              : 'Select this FlexAgent again to create its LiveKit target.'
      : 'Upload a source, connect target and control models in Settings, then approve a golden dataset.';
  // The dataset picker sits outside #evaluation-form: runEvaluation takes the form's first button as Run.
  const runner = ready
    ? `<div class="field"><label for="evaluation-dataset">Golden dataset</label><select id="evaluation-dataset"><button type="button"><selectedcontent></selectedcontent></button>${approved.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(datasetLabel(item))}</option>`).join('')}</select></div><form id="evaluation-form" class="evaluation-form">${connectionField('Agent being tested', targets, 'evaluation-target', 'AI')}${connectionField('Graded by', controls, 'evaluation-control', 'QA')}<button class="button button-primary" type="submit">Run evaluation</button><p class="help">Your agent answers every scenario, then the control model grades each answer.</p></form>`
    : `<div class="evaluation-blocked"><strong>Not ready to run yet</strong><p>${nextStep}</p></div>`;
  const manualRunner =
    canWriteWorkspace() && approved.length && controls.length
      ? `<div class="manual-backup"><h2>Score pasted answers</h2><p>Can’t run your agent from Verity? Ask it each scenario yourself, paste the replies, and the control model scores them.</p><div class="manual-backup-list">${approved.map((dataset, index) => `<details class="manual-evaluation" style="--i: ${index}"><summary><span><strong>${escapeHtml(documents.find(document => document.id === dataset.documentId)?.name || 'Unknown source')}</strong><small>${dataset.cases.length} ${dataset.cases.length === 1 ? 'scenario' : 'scenarios'} to answer</small></span><span class="manual-open">Paste answers</span></summary><form class="manual-evaluation-form" data-dataset-id="${escapeHtml(dataset.id)}"><div class="field"><label for="manual-control-${escapeHtml(dataset.id)}">Graded by</label><select id="manual-control-${escapeHtml(dataset.id)}" name="controlConnectionId">${controls.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}</select></div>${dataset.cases.map((item, index) => `<div class="manual-question"><span class="manual-question-number">${index + 1}</span><div><label class="manual-question-text" for="manual-answer-${dataset.id}-${index}">${escapeHtml(item.question)}</label><textarea id="manual-answer-${dataset.id}-${index}" name="answer" required placeholder="Paste the agent’s reply"></textarea></div></div>`).join('')}<div class="manual-evaluation-foot"><span class="help">One reply is required for each scenario.</span><button class="button button-primary" type="submit">Score pasted answers</button></div></form></details>`).join('')}</div></div>`
      : '';
  return `${header('Evaluation', 'Run an approved golden dataset against your agent, or score answers you collected yourself.')}${workspaceMode === 'flex' ? '<p class="help">The client uploads the matching source to this agent in FlexAgent separately.</p>' : ''}<div class="evaluation-layout ${manualRunner ? '' : 'is-single'}">${manualRunner ? `<section class="evaluation-manual">${manualRunner}</section>` : ''}<aside class="evaluation-run"><h2>Run an evaluation</h2>${runner}</aside></div>`;
}

function documents() {
  const visibleDocuments = workspace.documents.filter(inSelectedWorkspace);
  const readyDocument = visibleDocuments.find(document => document.retrieval?.status === 'ready');
  const actions =
    workspaceMode === 'local' && readyDocument ? button('Try customer chat', 'secondary js-start-chat') : '';
  const sourceState = (text, ready) => `<span class="sources-state ${ready ? '' : 'warn'}">${text}</span>`;
  const datasetButton = id =>
    `<button class="button button-secondary button-small js-source-dataset" data-id="${escapeHtml(id)}" type="button">Generate dataset</button>`;
  const files = visibleDocuments.map((document, index) => {
    const ready = document.retrieval?.status === 'ready';
    return `<article class="sources-item" style="--i: ${index}"><span class="sources-badge">${escapeHtml(document.type)}</span><div><strong>${escapeHtml(document.name)}</strong><small>${document.characters.toLocaleString()} characters extracted${ready ? '' : ' · Re-upload after connecting OpenAI to make it searchable.'}</small><div class="sources-item-actions">${datasetButton(document.id)}<button class="sources-quiet danger js-remove-document" data-id="${escapeHtml(document.id)}" type="button">Remove</button></div></div>${sourceState(ready ? 'Ready for search' : 'Needs indexing', ready)}</article>`;
  });
  const sites = (workspace.websites || []).filter(inSelectedWorkspace).map((site, index) => {
    const snapshots = (workspace.websiteSnapshots || []).filter(snapshot => snapshot.websiteId === site.id);
    const latest = snapshots.at(-1);
    const complete = latest?.status === 'complete';
    return `<article class="sources-item" style="--i: ${files.length + index}"><span class="sources-badge web">WEB</span><div><strong>${escapeHtml(site.rootUrl)}</strong><small>${latest ? `${latest.pages.length} ${latest.pages.length === 1 ? 'page' : 'pages'} collected${latest.limit ? ` · ${escapeHtml(latest.limit)}` : ''}` : 'No completed crawl yet.'}</small><div class="sources-item-actions">${latest ? datasetButton(latest.id) : ''}<button class="sources-quiet js-recrawl-website" data-id="${escapeHtml(site.id)}" type="button">Re-crawl</button><button class="sources-quiet danger js-remove-website" data-id="${escapeHtml(site.id)}" type="button">Remove</button></div></div>${latest ? sourceState(complete ? 'Ready for search' : 'Incomplete', complete) : ''}</article>`;
  });
  const items = [...files, ...sites];
  return `${header('Sources', 'Upload a document or collect a public website as evidence for chat and evaluation.', `<div class="button-row">${actions}</div>`)}
    <div class="sources-layout"><section class="sources-list" aria-label="Your sources">${items.length ? items.join('') : '<article class="sources-empty"><strong>No sources yet</strong>Add a policy, SOP, or website. It becomes the evidence your agent is tested against.</article>'}</section>
    <aside class="sources-add"><div><h2>Add a source</h2><p>Your source becomes the evidence for datasets, chat, and every result.</p></div><div class="file-drop"><label for="file-input">Upload document</label><input id="file-input" type="file" accept=".pdf,.docx,.txt" /><p><strong>Choose a file</strong> to upload. PDF, DOCX, or TXT.</p></div><hr /><form id="website-form" class="sources-website"><div class="field"><label for="website-url">Public website URL</label><input id="website-url" required type="url" placeholder="https://example.com/help" /></div><button class="button button-secondary" type="submit">Crawl website</button><span id="website-status" class="help" aria-live="polite"></span><span class="help">Verity collects the page and its public links into a saved snapshot.</span></form></aside></div>`;
}

function technicalAnalysis(analysis) {
  const evidence = value =>
    `<details class="blueprint-evidence"><summary>View source evidence</summary><p>${escapeHtml(value)}</p></details>`;
  const catalog = analysis.catalog || [];
  const groups = catalog.reduce((result, item) => {
    const name =
      item.dependencies && item.dependencies !== 'Not specified.'
        ? item.dependencies.split(/[;,]/)[0].trim()
        : 'Functions & components';
    (result[name] ||= []).push(item);
    return result;
  }, {});
  const pathType = item =>
    /ticket|escalat|handoff|human|queue|route.*incident/i.test(`${item.action} ${item.result}`)
      ? 'Escalation'
      : /api|call|live|query|service|data/i.test(`${item.action} ${item.result}`)
        ? 'Data source'
        : 'Knowledge or process';
  const paths = [...new Map(analysis.flows.map(item => [pathType(item), item])).entries()];
  const tabs = [
    ['overview', 'Overview'],
    ['flow', 'How it works'],
    ...(catalog.length ? [['apis', 'APIs']] : []),
    ...(analysis.examples?.length ? [['examples', 'Examples']] : []),
    ...(analysis.overview.unknowns?.length ? [['questions', 'Open questions']] : []),
  ];
  const tabButton = (id, label) =>
    `<button class="js-technical-tab ${technicalTab === id ? 'active' : ''}" data-tab="${id}" type="button">${label}</button>`;
  const stat = (label, count, note, tab) =>
    `<button class="blueprint-stat js-technical-tab" data-tab="${tab}" type="button"><b>${label}</b><strong>${count}</strong><small>${note}</small></button>`;
  const overview = `<section class="blueprint-guided overview"><h2>What this system does</h2><p class="blueprint-purpose">${escapeHtml(analysis.overview.purpose)}</p>${evidence(analysis.overview.sourceEvidence)}<h3 class="blueprint-section-title">At a glance</h3><div class="blueprint-stats">${stat('Systems', analysis.overview.systems.length, 'Components and sources', 'flow')}${catalog.length ? stat('APIs', catalog.length, 'Tools and services', 'apis') : ''}${stat('Rules', analysis.overview.keyRules.length, 'Documented decisions', 'flow')}${analysis.overview.unknowns?.length ? stat('Open questions', analysis.overview.unknowns.length, 'Need confirmation', 'questions') : ''}</div>${analysis.overview.systems.length ? `<h3 class="blueprint-section-title">Systems described</h3><div class="blueprint-systems">${analysis.overview.systems.map(system => `<span>${escapeHtml(system)}</span>`).join('')}</div>` : ''}</section>`;
  const flow = `<section class="blueprint-guided"><header><h2>How it works</h2><p>Follow one path from the trigger to the result.</p></header><div class="flow-entry"><b>Request or trigger</b><p>${escapeHtml(analysis.flows[0]?.trigger || 'A documented system event occurs.')}</p></div>${paths.length > 1 ? `<div class="flow-arrow" aria-hidden="true">↓</div><div class="flow-branches">${paths.map(([label, item], index) => `<article class="flow-path ${label === 'Escalation' ? 'is-escalation' : label === 'Data source' ? 'is-data' : 'is-knowledge'}" style="--i: ${index}"><b>${escapeHtml(label)}</b><p>${escapeHtml(item.action)}</p><small>${escapeHtml(item.result)}</small>${evidence(item.sourceEvidence)}</article>`).join('')}</div>` : `<div class="flow-arrow" aria-hidden="true">↓</div><div class="flow-path">${paths.map(([, item]) => `<b>${escapeHtml(item.action)}</b><p>${escapeHtml(item.result)}</p>${evidence(item.sourceEvidence)}`).join('')}</div>`}<div class="flow-arrow" aria-hidden="true">↓</div><div class="flow-entry result"><b>Result</b><p>${escapeHtml(analysis.flows.at(-1)?.result || 'The documented outcome is returned.')}</p></div><div class="flow-details"><h3>Explore each documented flow</h3>${analysis.flows.map((item, index) => `<details><summary><b>${index + 1}. ${escapeHtml(item.trigger)}</b></summary><p><b>Action:</b> ${escapeHtml(item.action)}</p><p>${escapeHtml(item.result)}</p>${item.branch ? `<small>Condition: ${escapeHtml(item.branch)}</small>` : ''}${evidence(item.sourceEvidence)}</details>`).join('')}</div></section>`;
  const apis = `<section class="blueprint-guided blueprint-api-panel"><header><h2>APIs & functions</h2><p>Open a function only when you need its details.</p></header><input class="js-catalog-search blueprint-search" placeholder="Find a function" aria-label="Search functions" />${Object.entries(
    groups,
  )
    .map(
      ([group, entries], index) =>
        `<section class="catalog-group" style="--i: ${index}"><h3>${escapeHtml(group)}</h3>${entries.map(item => `<details data-search="${escapeHtml(`${item.name} ${item.purpose} ${item.whenToCall} ${item.dependencies}`)}"><summary><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.whenToCall)}</small></summary><dl><div><dt>Purpose</dt><dd>${escapeHtml(item.purpose)}</dd></div><div><dt>Inputs</dt><dd>${escapeHtml(item.inputs || 'Not specified')}</dd></div><div><dt>Outputs</dt><dd>${escapeHtml(item.outputs || 'Not specified')}</dd></div></dl>${evidence(item.sourceEvidence)}</details>`).join('')}</section>`,
    )
    .join('')}</section>`;
  const examples = `<section class="blueprint-guided blueprint-example-panel"><h2>Examples</h2><p>Inputs and outcomes found in this document.</p>${analysis.examples.map(item => `<article><div><b>Input</b><p>${escapeHtml(item.input)}</p></div><div><b>Result</b><p>${escapeHtml(item.output)}</p></div>${evidence(item.sourceEvidence)}</article>`).join('')}</section>`;
  const questions = `<section class="blueprint-guided blueprint-questions"><h2>Open questions</h2><p>Confirm these details before treating them as implementation rules.</p>${analysis.overview.unknowns.map(item => `<details><summary>${escapeHtml(item)}</summary><p>Confirm this with the document owner or supporting technical documentation.</p></details>`).join('')}</section>`;
  const content = { overview, flow, apis, examples, questions }[technicalTab] || overview;
  return `<nav class="blueprint-tabs">${tabs.map(([id, label]) => tabButton(id, label)).join('')}</nav>${content}`;
}

function technical() {
  const documents = (workspace.technicalDocuments || []).filter(inSelectedWorkspace);
  const selected = documents.find(item => item.id === location.hash.split(':')[1]) || documents[0];
  const detail =
    selected?.analysisStatus === 'ready'
      ? technicalAnalysis(selected.analysis)
      : selected
        ? `<section class="blueprint-unavailable"><h2>Analysis unavailable</h2><p>${escapeHtml(selected.analysisError || 'Connect an OpenAI control model in Settings, then re-upload this document to create its blueprint.')}</p></section>`
        : `<section class="blueprint-unavailable"><h2>Start with a technical document</h2><p>Upload an engineering PDF, DOCX, or TXT file.</p></section>`;
  const rows = documents
    .map(
      item =>
        `<div class="blueprint-doc ${item.id === selected?.id ? 'is-current' : ''}"><button class="blueprint-doc-open js-open-technical" data-id="${escapeHtml(item.id)}" type="button" ${item.id === selected?.id ? 'aria-current="true"' : ''}><strong>${escapeHtml(item.name)}</strong><small>${item.characters.toLocaleString()} characters · ${item.retrieval?.status === 'ready' ? 'Ready for search' : 'Needs indexing'}</small></button><button class="blueprint-quiet js-remove-technical-document" data-id="${escapeHtml(item.id)}" type="button">Remove</button></div>`,
    )
    .join('');
  const list =
    rows || '<p class="blueprint-rail-empty">No technical documents yet. Upload one to see how its system works.</p>';
  const status = technicalUploadStatus
    ? `<p class="technical-upload-status ${technicalUploadStatus.kind}" role="status">${escapeHtml(technicalUploadStatus.message)}</p>`
    : '';
  return `${header('Technical Blueprint', 'A plain-language guide to how a system works, taken from its technical document.')}<div class="blueprint-page"><div class="blueprint-main">${detail}</div><aside class="blueprint-rail" aria-label="Technical documents"><h2>Technical documents</h2><div class="blueprint-docs">${list}</div><label class="button button-primary" for="technical-file-input">Upload document</label><input id="technical-file-input" type="file" accept=".pdf,.docx,.txt" />${selected ? `<button class="button button-secondary js-source-dataset" data-id="${escapeHtml(selected.id)}" type="button">Generate dataset</button>` : ''}${status}</aside></div>`;
}

function reviewScenarioLabel(item) {
  return String(item.question || item.turns?.[0]?.userMessage || '').trim() || 'New scenario';
}
const DECLINE_KIND_LABELS = {
  'close-but-missing': 'Close but missing',
  'wrong-assumption': 'Wrong assumption',
  'off-topic': 'Off-topic',
};
function isDecline(item) {
  return item?.caseType === 'decline';
}
function declineTag(item) {
  return isDecline(item)
    ? `<span class="decline-tag">Should decline · ${escapeHtml(DECLINE_KIND_LABELS[item.declineKind] || 'Close but missing')}</span>`
    : '';
}
function reviewScenarioIncomplete(item) {
  return (
    !(item.turns || []).length &&
    ![item.question, item.expectedAnswer, ...(isDecline(item) ? [] : [item.sourceEvidence])].every(value =>
      String(value || '').trim(),
    )
  );
}
// What the "not answered by another source" check did for this draft.
// Which sections (or pages) of the source have at least one question. Should-decline questions do not count.
function coverageMarkup(coverage) {
  if (!coverage?.total) return '';
  const [one, many] = coverage.unit === 'pages' ? ['page', 'pages'] : ['section', 'sections'];
  const untested = coverage.sections.filter(section => !section.cases.length);
  const summary = untested.length
    ? untested.length + ' ' + (untested.length === 1 ? one + ' has' : many + ' have') + ' no questions yet.'
    : 'Every ' + one + ' has at least one question.'; // Plain text; escaped below.
  const unmatched = coverage.unmatched?.length
    ? ` ${coverage.unmatched.map(number => `#${number}`).join(', ')} could not be matched to a ${one}; its evidence may have been edited.`
    : '';
  const rows = coverage.sections
    .map(
      section =>
        `<li class="${section.cases.length ? 'is-covered' : 'is-untested'}"><span>${escapeHtml(section.title)}</span><span>${escapeHtml(section.cases.length ? section.cases.map(number => `#${number}`).join(', ') : 'No questions')}</span></li>`,
    )
    .join('');
  return `<section class="coverage" aria-label="Source coverage"><p><b>${escapeHtml(`Covered ${coverage.covered} of ${coverage.total} ${coverage.total === 1 ? one : many}.`)}</b> ${escapeHtml(summary + unmatched)}</p><details><summary>${escapeHtml(`Show every ${one}`)}</summary><ul>${rows}</ul></details></section>`;
}
// Rubric check: whether each required point is backed by the evidence and asked by the question. Results apply only
// while the question and its evidence are unchanged; an edited point simply has no check.
function rubricCheckFor(dataset, item) {
  return dataset.rubricCheck?.cases?.find(
    entry => entry.question === item.question && entry.sourceEvidence === item.sourceEvidence,
  );
}
// Checks saved before 7 October 2026 call this flag asked.
function pointNeeded(point) {
  return point.needed ?? point.asked !== false;
}
function pointBacked(point) {
  return point.supported || point.startsBefore || point.continues;
}
function rubricWarningCount(entry) {
  return (entry?.points || []).filter(
    point => !point.kept && !point.removed && (!pointBacked(point) || !pointNeeded(point)),
  ).length;
}
function rubricCheckMarkup(entry, index, editable) {
  const points = (entry?.points || []).filter(point => !point.removed);
  if (!points.length) return '';
  const rows = points
    .map(point => {
      const flags = point.kept
        ? []
        : [
            pointBacked(point) ? '' : 'Not in the evidence',
            pointNeeded(point) ? '' : 'Not needed for this request',
          ].filter(Boolean);
      const actions =
        flags.length && editable
          ? `<span class="rubric-actions"><button class="rubric-remove js-rubric-remove" data-index="${index}" data-point="${escapeHtml(point.point)}" type="button">Remove point</button><button class="rubric-keep js-rubric-keep" data-index="${index}" data-point="${escapeHtml(point.point)}" type="button">Keep</button></span>`
          : '';
      const where = point.kept
        ? 'Kept for testing'
        : point.startsBefore && point.continues
          ? 'Uses the passages before and after'
          : point.startsBefore
            ? 'In the previous passage'
            : point.continues
              ? 'In the next passage'
              : '';
      return `<li class="${flags.length ? 'is-flagged' : 'is-ok'}"><span>${escapeHtml(point.point)}</span>${point.quote ? `<q>${escapeHtml(point.quote)}</q>` : ''}${where ? `<small>${escapeHtml(where)}</small>` : ''}${flags.length ? `<b>${escapeHtml(flags.join(' · '))}</b>` : ''}${actions}</li>`;
    })
    .join('');
  return `<section id="rubric-check-${index}" class="rubric-check field full" aria-label="Rubric check"><p><b>Rubric check</b> Remove a flagged point, or keep it if you want it tested.</p><ul>${rows}</ul></section>`;
}
// The scenario number in the review list, ringed in amber while its rubric needs a look (truncated text cannot hide it).
function reviewListNumber(dataset, item, index) {
  return rubricWarningCount(rubricCheckFor(dataset, item))
    ? `<span class="review-list-number has-rubric-flag" title="Rubric needs a look">${index + 1}<span class="visually-hidden"> (rubric needs a look)</span></span>`
    : `<span class="review-list-number">${index + 1}</span>`;
}
function rubricCheckNote(dataset, editable = false) {
  const check = dataset.rubricCheck;
  const recheck = editable
    ? ` <button class="button button-secondary button-small js-rubric-recheck" type="button">${check ? 'Re-check rubric' : 'Run rubric check'}</button>`
    : '';
  if (!check)
    return editable
      ? `<p id="rubric-note" class="rubric-note" role="note"><b>Rubric check:</b> not run on this draft yet.${recheck}</p>`
      : '';
  if (check.error)
    return `<p class="rubric-note" role="note">The rubric check could not run on this draft (${escapeHtml(check.error)}). Compare each rubric with its evidence by hand.${recheck}</p>`;
  const counts = (check.cases || []).map(rubricWarningCount);
  const points = counts.reduce((sum, count) => sum + count, 0);
  const questions = counts.filter(Boolean).length;
  const flagged = (dataset.cases || [])
    .map((item, index) => (rubricWarningCount(rubricCheckFor(dataset, item)) ? index : -1))
    .filter(index => index >= 0);
  const links = flagged
    .map(
      index => `<button class="rubric-jump js-review-jump" data-index="${index}" type="button">#${index + 1}</button>`,
    )
    .join(', ');
  const summary = points
    ? points +
      (points === 1 ? ' point' : ' points') +
      ' in ' +
      questions +
      (questions === 1 ? ' question' : ' questions') +
      (points === 1 ? ' needs' : ' need') +
      ' a look: not in the evidence, or not needed for this request.'
    : 'Every checked required point is backed by its evidence and needed for its request.'; // Plain text; escaped below.
  return `<p id="rubric-note" class="rubric-note" role="note"><b>Rubric check:</b> ${escapeHtml(summary)}${links ? ` Check ${flagged.length === 1 ? 'scenario' : 'scenarios'} ${links}.` : ''}${recheck}</p>`;
}
function declineCheckNote(dataset) {
  const check = dataset.declineCheck;
  if (!check) return '';
  if (check.error)
    return `<p class="decline-check" role="note">Verity could not add “should decline” questions to this draft (${escapeHtml(check.error)}). Generate the draft again to add them.</p>`;
  const dropped = check.dropped?.length
    ? ` ${check.dropped.length} ${check.dropped.length === 1 ? 'was' : 'were'} dropped because another source answers ${check.dropped.length === 1 ? 'it' : 'them'}.`
    : '';
  const weak = check.keywordOnlySources?.length
    ? ` Checked by keyword only (no search index): ${escapeHtml(check.keywordOnlySources.join(', '))}.`
    : '';
  return `<p class="decline-check" role="note"><b>${check.kept} “should decline” ${check.kept === 1 ? 'question' : 'questions'}</b> checked against ${check.checkedSources?.length || 0} ${check.checkedSources?.length === 1 ? 'source' : 'sources'} in Verity.${dropped}${weak} Verity only sees sources uploaded here, so confirm each is not answered anywhere in the agent’s knowledge base.</p>`;
}
function datasetReview(dataset) {
  const editable = dataset.status !== 'approved';
  if (reviewScenarioDatasetId !== dataset.id) {
    reviewScenarioDatasetId = dataset.id;
    reviewScenarioIndex = 0;
  }
  reviewScenarioIndex = Math.min(Math.max(reviewScenarioIndex, 0), dataset.cases.length - 1);
  const active = reviewScenarioIndex;
  const hasAdvanced = item => Boolean((item.turns || []).length || (item.expectedFinalMemory || []).length);
  const cases = dataset.cases
    .map(
      (item, index) =>
        `<fieldset id="review-case-${index}" class="review-case" ${index === active ? '' : 'hidden'}><legend>Scenario ${index + 1} of ${dataset.cases.length}</legend>${isDecline(item) ? `${declineTag(item)}<input type="hidden" data-field="caseType" data-index="${index}" value="decline" /><input type="hidden" data-field="declineKind" data-index="${index}" value="${escapeHtml(item.declineKind || 'close-but-missing')}" /><p class="help">The agent should say it does not have this information, or offer to connect the customer with staff, without inventing details. Check it is not answered anywhere in the agent’s knowledge base, including sources Verity does not have.</p>` : ''}${editable && dataset.cases.length > 1 ? `<button class="review-delete js-delete-scenario" data-index="${index}" type="button">Remove scenario</button>` : ''}<div class="form-grid"><div class="field full"><label>Customer question or scenario</label><textarea data-field="question" data-index="${index}" ${editable ? '' : 'readonly'}>${escapeHtml(item.question || '')}</textarea></div><div class="field full"><label>Expected answer</label><textarea data-field="expectedAnswer" data-index="${index}" ${editable ? '' : 'readonly'}>${escapeHtml(item.expectedAnswer || '')}</textarea></div><div class="field"><label>Required points (one per line)</label><textarea data-field="requiredPoints" data-index="${index}" ${editable ? '' : 'readonly'}>${escapeHtml((item.requiredPoints || []).join('\n'))}</textarea></div><div class="field"><label>Forbidden points (one per line)</label><textarea data-field="forbiddenPoints" data-index="${index}" ${editable ? '' : 'readonly'}>${escapeHtml((item.forbiddenPoints || []).join('\n'))}</textarea></div>${rubricCheckMarkup(rubricCheckFor(dataset, item), index, editable)}${dataset.documentKind === 'website' ? `<div class="field full"><label>Website page URL${isDecline(item) ? ' (optional)' : ''}</label><input data-field="sourceUrl" data-index="${index}" value="${escapeHtml(item.sourceUrl || '')}" ${editable ? '' : 'readonly'} /></div>` : ''}<div class="field full"><label>${isDecline(item) ? 'Nearby passage (optional, the closest thing the source does say)' : 'Source evidence'}</label><textarea data-field="sourceEvidence" data-index="${index}" ${editable ? '' : 'readonly'}>${escapeHtml(item.sourceEvidence || '')}</textarea></div><details class="review-advanced" ${hasAdvanced(item) ? 'open' : ''}><summary>Advanced: multi-turn conversation (optional)</summary><div class="form-grid"><div class="field full"><label>Conversation turns (JSON, optional)</label><textarea data-field="turns" data-index="${index}" ${editable ? '' : 'readonly'} placeholder='[{"userMessage":"...","expectedAnswer":"...","requiredPoints":[],"forbiddenPoints":[],"sourceEvidence":"..."}]'>${escapeHtml((item.turns || []).length ? JSON.stringify(item.turns, null, 2) : '')}</textarea></div><div class="field full"><label>Expected final memory (JSON string array, optional)</label><textarea data-field="expectedFinalMemory" data-index="${index}" ${editable ? '' : 'readonly'} placeholder='["name: Sam", "city: Boston"]'>${escapeHtml((item.expectedFinalMemory || []).length ? JSON.stringify(item.expectedFinalMemory, null, 2) : '')}</textarea></div></div></details></div></fieldset>`,
    )
    .join('');
  const list = dataset.cases
    .map(
      (item, index) =>
        `<button class="review-list-item js-review-pick" data-index="${index}" type="button" ${index === active ? 'aria-current="true"' : ''}>${reviewListNumber(dataset, item, index)}<span class="review-list-text">${escapeHtml(reviewScenarioLabel(item))}${isDecline(item) ? '<span class="review-list-flag decline-flag">Should decline</span>' : ''}</span>${reviewScenarioIncomplete(item) ? '<span class="review-list-flag" title="Question, expected answer, or source evidence is empty">Needs input</span>' : ''}</button>`,
    )
    .join('');
  const pager = `<div class="review-pager"><span id="review-position">Scenario ${active + 1} of ${dataset.cases.length}</span><div class="button-row"><button class="button button-secondary button-small js-review-step" data-step="-1" type="button" ${active === 0 ? 'disabled' : ''}>‹ Previous</button><button class="button button-secondary button-small js-review-step" data-step="1" type="button" ${active === dataset.cases.length - 1 ? 'disabled' : ''}>Next ›</button></div></div>`;
  const actions = editable
    ? `<div class="button-row"><button class="button button-secondary" type="submit">Save changes</button><button class="button button-primary js-approve" data-id="${escapeHtml(dataset.id)}" type="button">Save & approve</button></div><p id="review-status" class="help" aria-live="polite">Write or verify the expected answer and evidence for every scenario before approving.</p>`
    : `<div class="review-footer"><p class="help">This benchmark is approved and ready to evaluate.</p><div class="button-row">${button('Go to evaluation', 'primary', 'js-go-evaluation')}</div></div>`;
  return `${header('Review golden dataset', `${dataset.cases.length} ${dataset.cases.length === 1 ? 'scenario' : 'scenarios'} generated from your policy. Check the source evidence before approving.`, button('Back to datasets', 'secondary', 'js-close-review'))}<form id="dataset-review-form" class="review-layout"><nav class="panel review-list" aria-label="Scenarios"><div class="review-list-head"><strong>Scenarios</strong><span>${dataset.cases.length}</span></div><div class="review-list-scroll">${list}</div>${editable ? '<button class="button button-secondary js-add-scenario" type="button">+ Add scenario</button>' : ''}</nav><section class="panel card-pad review-detail">${declineCheckNote(dataset)}${rubricCheckNote(dataset, editable)}${coverageMarkup(dataset.coverage)}${pager}${cases}<div class="review-actions">${actions}</div></section></form>`;
}

function gapDiagnosisMarkup(result) {
  if (result.pass || !result.gapDiagnosis) return '';
  const diagnosis = result.gapDiagnosis;
  return `<section class="gap-diagnosis"><h3>RAG investigation</h3><p><b>Likely issue:</b> ${diagnosis.categories.map(escapeHtml).join(' · ')}</p><p><b>Observed gap:</b> ${escapeHtml(diagnosis.why)}</p><p><b>What to inspect:</b> ${escapeHtml(diagnosis.teamFocus)}</p>${result.retrievalUnavailable ? '<small>Inferred from the answer and scoring rubric; no target retrieval trace was captured.</small>' : ''}</section>`;
}

// Flagged answers still count in the overall score, but are left out of the diagnosis: their GAP may be a lost answer, not the agent.
function incompleteAnswersMarkup(evaluation) {
  const flagged = evaluation.results
    .map((result, index) => ({ result, number: index + 1 }))
    .filter(item => item.result.answerMayBeIncomplete);
  if (!flagged.length) return '';
  return `<section class="panel card-pad evaluation-incomplete" role="note"><p><b>${flagged.length} ${flagged.length === 1 ? 'answer' : 'answers'} may be incomplete — re-run the evaluation.</b></p><p>Scenarios ${escapeHtml(flagged.map(item => `#${item.number}`).join(', '))} got only a short or filler-like reply from FlexAgent. They still count in the overall score but are left out of “Where to investigate first”.</p></section>`;
}
function evaluationSummaryMarkup(evaluation) {
  const incomplete = incompleteAnswersMarkup(evaluation) + declineSummaryMarkup(evaluation);
  const gaps = evaluation.results
    .map((result, index) => ({ result, number: index + 1 }))
    .filter(item => !item.result.pass && !item.result.answerMayBeIncomplete && !isDecline(item.result.case));
  if (!gaps.length) return incomplete;
  const withCategory = category => gaps.filter(item => item.result.gapDiagnosis?.categories?.includes(category));
  const major = withCategory('Likely retrieval miss');
  const partial = withCategory('Partial retrieval coverage');
  const unsupported = withCategory('Unsupported or conflicting answer');
  const fallbacks = gaps.filter(item =>
    /(?:do not|don't) have enough (?:confirmed )?information|cannot determine whether|unable to (?:confirm|determine)/i.test(
      item.result.answer || '',
    ),
  );
  const refs = items => items.map(item => `#${item.number}`).join(', ');
  const dominant = major.length >= 2 && major.length >= Math.ceil(gaps.length / 2);
  const finding = dominant
    ? `${major.length} of ${gaps.length} GAPs miss at least three quarters of their required points, across different questions.${fallbacks.length > 1 ? ` In ${fallbacks.length} GAPs, the agent says it lacks enough information.` : ''} The leading possibilities are missing retrieved evidence, evidence lost before generation, or an overly cautious fallback rule.`
    : `${gaps.length} scenarios have GAPs with a mix of missing information and unsupported content. The answer patterns do not point to one dominant failure mode.`;
  const firstCases = (major.length ? major : gaps).slice(0, 3);
  const traceNote = gaps.some(item => item.result.retrievalUnavailable)
    ? 'FlexAgent retrieval traces were not captured, so this is a hypothesis from the answers and rubrics.'
    : 'Confirm the hypothesis against the retrieved sections recorded for each scenario.';
  return `${incomplete}<section class="panel card-pad evaluation-diagnosis"><p class="eyebrow">ACROSS THIS EVALUATION</p><h2>Where to investigate first</h2><p class="evaluation-diagnosis-finding">${escapeHtml(finding)}</p><div class="evaluation-diagnosis-counts"><span><b>${major.length}</b> near-total misses</span><span><b>${partial.length}</b> partial coverage gaps</span><span><b>${fallbacks.length}</b> insufficient-info replies</span><span><b>${unsupported.length}</b> unsupported claims</span></div><ol><li><strong>Capture the evidence path.</strong> Replay representative scenarios ${escapeHtml(refs(firstCases))}; record the top retrieved chunks and the final context sent to the model.</li><li><strong>If the expected evidence is absent from retrieval,</strong> inspect document indexing, metadata filters, query matching, top-k, and ranking.</li><li><strong>If retrieval contains it,</strong> check context assembly and truncation. If it reaches the model but the agent still declines to answer, inspect grounding instructions and the fallback threshold.</li>${unsupported.length ? `<li><strong>Check unsupported content.</strong> For ${escapeHtml(refs(unsupported))}, compare the extra claim with the retrieved chunks and final context.</li>` : ''}</ol><p class="evaluation-diagnosis-limit">${escapeHtml(traceNote)} The exact internal cause needs the retrieved chunks and final prompt context.</p></section>`;
}

function evaluationSourceName(evaluation) {
  const dataset = workspace.datasets.find(item => item.id === evaluation.datasetId);
  return allDocuments().find(item => item.id === dataset?.documentId)?.name || 'Source';
}
function evaluationRunType(evaluation) {
  if (evaluation.manual) return 'Pasted answers';
  if (evaluation.livekit) return evaluation.agentName || 'LiveKit widget';
  return workspace.connections.find(item => item.id === evaluation.targetConnectionId)?.name || 'Target model';
}
// Shows one scenario result in place; Previous/Next move through the scenarios the current filter shows.
function showResultScenario(index) {
  const cards = [...document.querySelectorAll('.result-detail')];
  if (!cards[index]) return;
  resultScenarioIndex = index;
  cards.forEach((card, position) => {
    card.hidden = position !== index;
  });
  document.querySelectorAll('.js-result-pick').forEach(item => {
    if (Number(item.dataset.index) === index) {
      item.setAttribute('aria-current', 'true');
      item.scrollIntoView({ block: 'nearest' });
    } else item.removeAttribute('aria-current');
  });
  const position = document.querySelector('#result-position');
  if (position) position.textContent = `Scenario ${index + 1} of ${cards.length}`;
  const visible = [...document.querySelectorAll('.js-result-pick:not([hidden])')].map(item =>
    Number(item.dataset.index),
  );
  const at = visible.indexOf(index);
  document.querySelectorAll('.js-result-step').forEach(button => {
    button.disabled = Number(button.dataset.step) < 0 ? at <= 0 : at < 0 || at >= visible.length - 1;
  });
  const panel = document.querySelector('.result-panel');
  if (panel && panel.getBoundingClientRect().top < 0) panel.scrollIntoView({ block: 'start' });
}
function stepResultScenario(step) {
  const visible = [...document.querySelectorAll('.js-result-pick:not([hidden])')].map(item =>
    Number(item.dataset.index),
  );
  if (!visible.length) return;
  const at = visible.indexOf(resultScenarioIndex);
  const next = at < 0 ? visible[0] : visible[Math.min(Math.max(at + step, 0), visible.length - 1)];
  showResultScenario(next);
  return next;
}
function filterResultScenarios(filter) {
  resultFilter = filter;
  document
    .querySelectorAll('.js-result-filter')
    .forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
  document.querySelectorAll('.js-result-pick').forEach(item => {
    item.hidden = filter !== 'all' && item.dataset.outcome !== filter;
  });
  const current = document.querySelector(`.js-result-pick[data-index="${resultScenarioIndex}"]`);
  const first = document.querySelector('.js-result-pick:not([hidden])');
  showResultScenario(
    current && !current.hidden ? resultScenarioIndex : first ? Number(first.dataset.index) : resultScenarioIndex,
  );
}
const REASONING_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };
// Plain text; callers escape it.
function judgeSupportLabel(connection) {
  const support = connection.judgeSupport;
  if (!support) return 'Grading settings not checked yet';
  if (!support.reasoningEffort && !support.temperature)
    return 'Grading: provider defaults — scores may vary more between runs';
  const reasoning = support.reasoningEffort
    ? 'reasoning ' + (REASONING_LABELS[connection.reasoningEffort] || 'Medium')
    : '';
  return (
    'Grading: ' +
    [reasoning, support.temperature ? 'temperature 0' : reasoning ? 'temperature not supported by this model' : '']
      .filter(Boolean)
      .join(' · ')
  );
}
// Plain text; callers escape it. Runs from before this was recorded show nothing.
function verityLabel(verity) {
  return verity?.commit
    ? 'Scored by Verity ' + verity.commit + (verity.uncommittedChanges ? ' with uncommitted changes' : '')
    : '';
}
function judgeSettingsLabel(judge) {
  if (!judge) return 'Judge settings not recorded';
  return [
    'Judge: ' + judge.model,
    judge.reasoningEffort ? 'reasoning ' + (REASONING_LABELS[judge.reasoningEffort] || judge.reasoningEffort) : '',
    judge.temperature === null || judge.temperature === undefined
      ? 'temperature not supported'
      : 'temperature ' + judge.temperature,
  ]
    .filter(Boolean)
    .join(' · '); // Plain text; callers escape it.
}
// Which judge settings differ between two runs: null when they match, 'not-recorded' when either run lacks them.
// Item 4's comparison view should reuse this.
function judgeSettingsDifference(a, b) {
  if (!a || !b) return 'not-recorded';
  const differ = ['model', 'host', 'reasoningEffort', 'temperature'].filter(
    key => (a[key] ?? null) !== (b[key] ?? null),
  );
  return differ.length ? differ : null;
}
function judgeComparisonNote(evaluation, runs) {
  if (!evaluation.judge) return '';
  const previous = runs
    .filter(
      item =>
        item.datasetId === evaluation.datasetId && item.id !== evaluation.id && item.createdAt < evaluation.createdAt,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const difference = previous && judgeSettingsDifference(evaluation.judge, previous.judge);
  if (!difference) return '';
  const run = `The previous run of this dataset (${new Date(previous.createdAt).toLocaleString()}, ${previous.score}%)`;
  const text =
    difference === 'not-recorded'
      ? `${run} has no recorded judge settings, so a score difference may come from the judge rather than the agent.`
      : `${run} was graded with different judge settings (${judgeSettingsLabel(previous.judge)}), so a score difference may come from the judge rather than the agent.`;
  return `<p class="judge-note" role="note">${escapeHtml(text)}</p>`;
}
// Plain text; callers escape it.
function subScoresLabel(evaluation) {
  return evaluation.declineScore === undefined
    ? ''
    : [
        evaluation.answerScore === undefined ? '' : `Answers when it should: ${evaluation.answerScore}%`,
        `Declines when it should: ${evaluation.declineScore}%`,
      ]
        .filter(Boolean)
        .join(' · ');
}
function declineSummaryMarkup(evaluation) {
  const declines = evaluation.results
    .map((result, index) => ({ result, number: index + 1 }))
    .filter(item => isDecline(item.result.case));
  if (!declines.length) return '';
  const invented = declines.filter(item => !item.result.pass);
  return `<section class="panel card-pad evaluation-decline" role="note"><p><b>${declines.length - invented.length} of ${declines.length} “should decline” ${declines.length === 1 ? 'question was' : 'questions were'} handled correctly.</b></p>${invented.length ? `<p>Invented or unsupported answers: ${escapeHtml(invented.map(item => `#${item.number}`).join(', '))}. Check the agent’s instruction to say it does not know rather than invent details.</p>` : ''}</section>`;
}
function incompleteAnswerNote(result) {
  return result.answerMayBeIncomplete
    ? '<p class="result-incomplete" role="note"><b>Answer may be incomplete.</b> FlexAgent sent only a short or filler-like reply, so this score may reflect a lost answer rather than the agent. Re-run the evaluation before acting on it.</p>'
    : '';
}
function results() {
  const visibleRuns = workspace.evaluations.filter(inSelectedWorkspace);
  const latest = visibleRuns.find(item => item.id === viewingEvaluationId);
  const label = evaluation =>
    `${evaluationSourceName(evaluation)} · ${evaluationRunType(evaluation)} · ${evaluation.results.length} scenarios`;
  const picker = visibleRuns.length
    ? `<div class="results-switch"><label for="evaluation-history-select">Switch run</label><select id="evaluation-history-select"><button type="button"><selectedcontent></selectedcontent></button><option value="">Choose an evaluation</option>${visibleRuns.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === latest?.id ? 'selected' : ''}>${escapeHtml(label(item))} · ${escapeHtml(item.score)}% · ${new Date(item.createdAt).toLocaleString()}</option>`).join('')}</select></div>`
    : '';
  const points = (items, empty) =>
    (items || []).length
      ? `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      : `<p class="help">${empty}</p>`;
  const detail = (result, index) =>
    `<article id="result-case-${index}" class="result-detail ${result.pass ? 'is-pass' : 'is-gap'}" ${index === resultScenarioIndex ? '' : 'hidden'}><header class="result-detail-head"><div>${declineTag(result.case)}<h3>${escapeHtml(result.case.question)}</h3></div><div class="result-detail-score"><span class="document-icon ${result.pass ? 'result-pass' : 'result-gap'}">${result.pass ? 'PASS' : 'GAP'}</span><strong class="score ${result.pass ? 'score-pass' : 'score-gap'}">${escapeHtml(result.score)}%</strong></div></header><section class="result-why"><b>Why this score</b><p>${escapeHtml(result.rationale || 'No rationale returned.')}</p></section>${incompleteAnswerNote(result)}${gapDiagnosisMarkup(result)}<div class="result-compare"><section><b>Tested agent’s answer</b><p>${escapeHtml(result.answer)}</p></section><section><b>Expected answer <span>from the golden dataset</span></b><p>${escapeHtml(result.case.expectedAnswer)}</p></section></div><div class="result-compare"><section><b>Rubric · must include</b>${points(result.case.requiredPoints, 'No required points.')}</section><section><b>Rubric · must not say</b>${points(result.case.forbiddenPoints, 'No forbidden points.')}</section></div>${result.turns ? `<section class="result-block"><b>Conversation turns</b><p>${result.turns.map((turn, turnIndex) => `Turn ${turnIndex + 1}: ${turn.pass ? 'PASS' : 'GAP'} — ${escapeHtml(turn.answer)}`).join('\n')}</p><p>Final memory: ${result.memoryVerdict?.pass ? 'PASS' : `Missing ${escapeHtml(result.memoryVerdict?.missing?.join(', ') || 'values')}`}</p></section>` : ''}<details class="result-evidence"><summary>${isDecline(result.case) ? 'Nearby passage' : 'Source evidence'}</summary><p>${escapeHtml(result.case.sourceEvidence)}</p>${result.case.sourceUrl ? `<p>${sourceLink(result.case.sourceUrl, ' target="_blank" rel="noreferrer"')}</p>` : ''}</details><div class="retrieval-trigger"><button class="button button-secondary button-small js-view-retrieval" data-evaluation-id="${escapeHtml(latest.id)}" data-result-index="${index}" type="button">View retrieved policy sections (${(result.retrievedChunks || []).length})</button></div></article>`;
  const selected =
    viewingRetrievedChunks &&
    visibleRuns.find(item => item.id === viewingRetrievedChunks.evaluationId)?.results[
      viewingRetrievedChunks.resultIndex
    ];
  const retrievalPanel = selected
    ? `<div class="retrieval-overlay"><section class="retrieval-panel" role="dialog" aria-modal="true" aria-labelledby="retrieval-title"><div class="retrieval-panel-head"><div><p class="eyebrow">RETRIEVAL EVIDENCE</p><h2 id="retrieval-title">Source sections sent to the tested agent</h2><p>${escapeHtml(selected.case.question)}</p></div><button class="button button-secondary button-small js-close-retrieval" type="button">Close</button></div><div class="retrieval-list">${(selected.retrievedChunks || []).map((chunk, index) => `<details ${index === 0 ? 'open' : ''}><summary>Section ${index + 1}<span>${Number(chunk.score || 0).toFixed(2)} match</span></summary>${chunk.sourceUrl ? sourceLink(chunk.sourceUrl, ' target="_blank" rel="noreferrer"') : ''}<p>${escapeHtml(chunk.text)}</p></details>`).join('') || '<p>No retrieval evidence was recorded for this evaluation.</p>'}</div></section></div>`
    : '';
  const gapCount = latest ? latest.results.filter(result => !result.pass).length : 0;
  const filters = [
    ['all', 'All', latest?.results.length || 0],
    ['gap', 'Gaps', gapCount],
    ['pass', 'Passes', (latest?.results.length || 0) - gapCount],
  ];
  const scenarioResults = evaluation => {
    if (resultScenarioEvaluationId !== evaluation.id) {
      resultScenarioEvaluationId = evaluation.id;
      resultFilter = 'all';
      const firstGap = evaluation.results.findIndex(result => !result.pass);
      resultScenarioIndex = firstGap >= 0 ? firstGap : 0;
    }
    resultScenarioIndex = Math.min(Math.max(resultScenarioIndex, 0), evaluation.results.length - 1);
    const shown = result => resultFilter === 'all' || (resultFilter === 'gap' ? !result.pass : result.pass);
    const list = evaluation.results
      .map(
        (result, index) =>
          `<button class="result-list-item js-result-pick ${result.pass ? 'is-pass' : 'is-gap'}" style="--i: ${index}" data-index="${index}" data-outcome="${result.pass ? 'pass' : 'gap'}" type="button" ${index === resultScenarioIndex ? 'aria-current="true"' : ''} ${shown(result) ? '' : 'hidden'}><span class="result-list-badge">${result.pass ? 'PASS' : 'GAP'}</span><span class="result-list-text"><span>${index + 1}. ${escapeHtml(result.case.question)}</span>${isDecline(result.case) ? '<span class="review-list-flag decline-flag">Should decline</span>' : ''}${result.answerMayBeIncomplete ? '<span class="review-list-flag">Answer may be incomplete</span>' : ''}</span><span class="result-list-score">${escapeHtml(result.score)}%</span></button>`,
      )
      .join('');
    return `<div class="result-layout"><nav class="panel result-list" aria-label="Scenario results"><div class="result-list-head"><strong>Scenario results</strong><div class="result-filters" role="group" aria-label="Filter scenarios">${filters.map(([key, name, count]) => `<button class="result-filter js-result-filter" data-filter="${key}" type="button" aria-pressed="${key === resultFilter}">${escapeHtml(name)} <span>${count}</span></button>`).join('')}</div></div><div class="result-list-scroll">${list}</div></nav><section class="panel card-pad result-panel"><div class="review-pager"><span id="result-position">Scenario ${resultScenarioIndex + 1} of ${evaluation.results.length}</span><div class="button-row"><button class="button button-secondary button-small js-result-step" data-step="-1" type="button">‹ Previous</button><button class="button button-secondary button-small js-result-step" data-step="1" type="button">Next ›</button></div></div>${evaluation.results.map((result, index) => detail(result, index)).join('')}</section></div>`;
  };
  const summary = latest ? evaluationSummaryMarkup(latest) : '';
  return `${header('Results', 'Each run keeps the agent’s answer, the expected answer, the score, and the source evidence for every scenario.')}
    ${latest ? `<section class="results-head"><div class="results-score">${escapeHtml(latest.score)}%<small>Overall score</small></div><div class="results-run"><h2>${escapeHtml(evaluationSourceName(latest))}</h2><p>${escapeHtml(`${evaluationRunType(latest)} · ${latest.results.length} ${latest.results.length === 1 ? 'scenario' : 'scenarios'} · ${new Date(latest.createdAt).toLocaleString()}`)}</p>${subScoresLabel(latest) ? `<p class="sub-scores">${escapeHtml(subScoresLabel(latest))}</p>` : ''}<div class="results-counts"><span class="results-chip pass">${latest.results.length - gapCount} passed</span><span class="results-chip gap">${gapCount} ${gapCount === 1 ? 'gap' : 'gaps'}</span></div></div><div class="results-actions">${picker}${button('Download report', 'secondary', 'js-download-evaluation')}</div></section>${summary ? `<details class="results-section"><summary>Summary and where to investigate</summary><div>${summary}</div></details>` : ''}<details class="results-section"><summary>Run details and source coverage</summary><div><p class="judge-settings">${escapeHtml(judgeSettingsLabel(latest.judge))}</p>${verityLabel(latest.verity) ? `<p class="judge-settings">${escapeHtml(verityLabel(latest.verity))}</p>` : ''}${judgeComparisonNote(latest, visibleRuns)}${coverageMarkup(workspace.datasets.find(item => item.id === latest.datasetId)?.coverage)}</div></details><h2 class="results-title">Scenario results</h2>${scenarioResults(latest)}${retrievalPanel}` : `<section class="panel card-pad"><h2 class="minor-title">No results yet</h2><p class="page-subtitle">Once you run an approved golden dataset against your target agent, this area will make every pass, gap, and unsupported claim easy to review.</p></section>`}`;
}
function showSettingsTab(key) {
  settingsTab = key;
  document.querySelectorAll('.js-settings-tab').forEach(tab => {
    const active = tab.dataset.tab === key;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('.settings-layout [role="tabpanel"]').forEach(panel => {
    panel.hidden = panel.id !== `settings-panel-${key}`;
  });
}
function settings() {
  const targets = workspace.connections.filter(
    connection => connection.role === 'target' && connection.kind !== 'flexagent',
  );
  const target = targets.find(connection => connection.id === instructionTargetId) || targets[0];
  const document = workspace.documents.find(item => item.id === instructionDocumentId) || workspace.documents[0];
  const config =
    document &&
    target &&
    workspace.agentConfigs.find(item => item.documentId === document.id && item.connectionId === target.id);
  const connections = workspace.connections.length
    ? `<div class="settings-models">${workspace.connections
        .map(
          (connection, index) =>
            `<div class="settings-model" style="--i: ${index}"><div><span class="settings-role ${connection.role === 'target' ? '' : 'grader'}">${connection.role === 'target' ? 'Agent being tested' : 'Grader'}</span><strong>${escapeHtml(connection.name)}</strong><small>${escapeHtml(connection.model)}</small>${connection.role === 'control' ? `<small>${escapeHtml(judgeSupportLabel(connection))}</small>` : ''}</div><div class="settings-model-actions">${
              connection.judgeSupport?.reasoningEffort
                ? `<label class="reasoning-field" title="Higher reasoning grades more carefully but is slower and costs more."><span>Reasoning</span><select class="js-reasoning" data-id="${escapeHtml(connection.id)}"><button type="button"><selectedcontent></selectedcontent></button>${Object.entries(
                    REASONING_LABELS,
                  )
                    .map(
                      ([value, name]) =>
                        `<option value="${escapeHtml(value)}" ${(connection.reasoningEffort || 'medium') === value ? 'selected' : ''}>${escapeHtml(name)}</option>`,
                    )
                    .join('')}</select></label>`
                : ''
            }${connection.role === 'control' ? `<button class="button button-secondary button-small js-check-judge" data-id="${escapeHtml(connection.id)}" type="button">Check model</button>` : ''}<button class="settings-quiet js-remove-connection" data-id="${escapeHtml(connection.id)}" type="button">Remove</button></div></div>`,
        )
        .join('')}</div>`
    : '';
  const promptForm =
    target && document
      ? `<div class="form-grid agent-prompt-pickers"><div class="field"><label for="instruction-document">Policy document</label><select id="instruction-document"><button type="button"><selectedcontent></selectedcontent></button>${workspace.documents.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === document.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></div><div class="field"><label for="instruction-target">Target agent</label><select id="instruction-target"><button type="button"><selectedcontent></selectedcontent></button>${targets.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === target.id ? 'selected' : ''}>${escapeHtml(item.name)} · ${escapeHtml(item.model)}</option>`).join('')}</select></div></div><form id="agent-prompt-form" class="form-grid agent-prompt"><div class="field full"><label for="agent-system-prompt">Instructions for this policy</label><textarea id="agent-system-prompt" required>${escapeHtml(config?.systemPrompt || target.systemPrompt || 'Follow the policy document. Do not invent information. If it does not answer the question, say so clearly.')}</textarea></div><div class="field full form-actions"><button class="button button-secondary" type="submit">Save instructions for this policy</button></div></form>`
      : '';
  const session = workspace.flexAgentSession;
  const selectedAgent = session?.selectedAgentId;
  const flexAgentLogin = session?.connected
    ? `<h2 class="minor-title">FlexAgent connection</h2><section class="flexagent-connection" aria-label="FlexAgent connection status"><div class="flexagent-connection-status"><span class="status good">Connected</span></div><dl><div><dt>Organization</dt><dd>${escapeHtml(session.orgId)}</dd></div><div><dt>API</dt><dd>${escapeHtml(session.baseUrl)}</dd></div></dl></section><div class="form-grid"><div class="field full"><label for="flexagent-agent-picker">Choose FlexAgent</label><select id="flexagent-agent-picker" ${flexAgentAgents.length ? '' : 'disabled'}><button type="button"><selectedcontent></selectedcontent></button><option value="">${flexAgentAgents.length ? 'Choose an agent' : 'Load agents first'}</option>${flexAgentAgents.map(agent => `<option value="${escapeHtml(agent.id)}" ${agent.id === selectedAgent ? 'selected' : ''}>${escapeHtml(agent.name)}</option>`).join('')}</select><span class="help">${session.selectedAgentName ? `Selected: ${escapeHtml(session.selectedAgentName)}` : 'Each selected agent must allowlist this Eval Tool origin in FlexAgent Embed settings.'}</span></div><div class="field full"><div class="button-row"><button id="flexagent-load-agents" class="button button-secondary" type="button">Load agents</button><button id="flexagent-reconnect" class="button button-secondary" type="button">Reconnect FlexAgent</button></div></div></div>`
    : `<h2 class="minor-title">Connect FlexAgent</h2><form id="flexagent-login-form" class="form-grid"><div class="field"><label for="flexagent-login-url">FlexAgent API URL</label><input id="flexagent-login-url" required type="url" value="https://api-staging.flexagents.ai" /></div><div class="field"><label for="flexagent-login-org-id">Organization ID</label><input id="flexagent-login-org-id" required placeholder="FlexAgent organization ID" /></div><div class="field"><label for="flexagent-login-email">FlexAgent email</label><input id="flexagent-login-email" required type="email" autocomplete="username" /></div><div class="field"><label for="flexagent-login-password">FlexAgent password</label><input id="flexagent-login-password" required type="password" autocomplete="current-password" /></div><div class="field"><label for="flexagent-login-origin">Eval Tool origin</label><input id="flexagent-login-origin" required type="url" value="http://127.0.0.1:4173" /><span class="help">This exact origin must be allowed in the selected agent’s FlexAgent Embed settings.</span></div><div class="field full"><button class="button button-primary" type="submit">Connect FlexAgent</button><span class="help">Your password is used only to sign in. Eval Tool stores the returned access token encrypted on this computer.</span></div></form>`;
  const flexAgentForm = `${flexAgentLogin}<details><summary>Manual FlexAgent target</summary><form id="flexagent-form" class="form-grid"><div class="field"><label for="flexagent-name">Name</label><input id="flexagent-name" value="FlexAgent target" /></div><div class="field"><label for="flexagent-url">FlexAgent API URL</label><input id="flexagent-url" required type="url" placeholder="https://flexagent.example.com" /></div><div class="field"><label for="flexagent-mode">Connection method</label><select id="flexagent-mode"><button type="button"><selectedcontent></selectedcontent></button><option value="api">Private evaluation API</option><option value="livekit">LiveKit widget path</option></select></div><div class="field"><label for="flexagent-org-id">Organization ID</label><input id="flexagent-org-id" required placeholder="FlexAgent organization ID" /></div><div class="field"><label for="flexagent-agent-id">Agent ID</label><input id="flexagent-agent-id" required placeholder="FlexAgent agent ID" /></div><div class="field"><label for="flexagent-origin">Eval Tool origin</label><input id="flexagent-origin" type="url" value="http://127.0.0.1:4173" /></div><div class="field full"><label for="flexagent-token">Evaluation service token</label><input id="flexagent-token" type="password" autocomplete="off" placeholder="Only required for Private evaluation API" /></div><div class="field full"><button class="button button-secondary" type="submit">Save FlexAgent target</button></div></form></details>`;
  const tabs = [
    ['openai', 'OpenAI', true, 'API key and default models'],
    ['flexagent', 'FlexAgent', true, 'Sign in and pick an agent'],
    ['instructions', 'Agent instructions', Boolean(promptForm), 'How the agent answers per policy'],
    [
      'models',
      `Connected models${workspace.connections.length ? ` (${workspace.connections.length})` : ''}`,
      Boolean(connections),
      'Agents and grader in use',
    ],
  ].filter(([, , available]) => available);
  const activeTab = tabs.some(([key]) => key === settingsTab) ? settingsTab : 'openai';
  const panel = (key, content) =>
    `<section id="settings-panel-${key}" class="panel card-pad settings-card" role="tabpanel" aria-labelledby="settings-tab-${key}" ${key === activeTab ? '' : 'hidden'}>${content}</section>`;
  const tabList = `<div class="settings-tabs" role="tablist" aria-label="Settings sections" aria-orientation="vertical">${tabs.map(([key, name, , description]) => `<button id="settings-tab-${key}" class="settings-tab js-settings-tab" data-tab="${key}" type="button" role="tab" aria-controls="settings-panel-${key}" aria-selected="${key === activeTab}" tabindex="${key === activeTab ? 0 : -1}"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(description)}</small></button>`).join('')}</div>`;
  return `${header('Settings', 'Connect OpenAI once, then choose the models used for your customer agent and evaluation.')}<div class="settings-layout">${tabList}<div class="settings-stack">${panel('openai', `<h2 class="minor-title">Connect OpenAI</h2><p class="settings-intro">One key, two jobs: the target model answers customers, and the control model writes golden datasets, grades answers, and powers source search.</p><form id="openai-form" class="form-grid"><div class="field full"><label for="openai-key">OpenAI API key</label><input id="openai-key" required type="password" autocomplete="off" placeholder="Paste your OpenAI API key" /><span class="help">It is encrypted by the server and never shown again.</span></div><div class="field"><label for="target-model">Target model</label><input id="target-model" required value="gpt-5.6-luna" placeholder="Model that answers customers" /></div><div class="field"><label for="control-model">Control model</label><input id="control-model" required value="gpt-5.6-terra" placeholder="Model that creates and judges datasets" /></div><div class="field full form-actions"><button class="button button-primary" type="submit">Save OpenAI setup</button><span class="help">Saving replaces the existing OpenAI setup. A model request will confirm that your account has available API credits.</span></div></form>`)}${panel('flexagent', flexAgentForm)}${promptForm ? panel('instructions', `<h2 class="minor-title">Agent instructions</h2><p class="settings-intro">Only used when this policy document is selected in customer chat or evaluation.</p>${promptForm}`) : ''}${connections ? panel('models', `<h2 class="minor-title">Connected models</h2><p class="settings-intro">The agents Verity can test, and the model that grades their answers.</p>${connections}`) : ''}</div></div>`;
}

function datasets() {
  const documents = allDocuments().filter(inSelectedWorkspace);
  const controls = workspace.connections.filter(connection => connection.role === 'control');
  const selectedDocumentId = documents.some(item => item.id === datasetDocumentId)
    ? datasetDocumentId
    : documents[0]?.id;
  const reviewing = workspace.datasets.find(
    dataset => dataset.id === reviewingDatasetId && inSelectedWorkspace(dataset),
  );
  if (reviewing) return datasetReview(reviewing);
  const kindLabel = item =>
    item.kind === 'website'
      ? 'Website snapshot'
      : item.kind === 'technical'
        ? 'Technical Blueprint'
        : 'Operational document';
  const visibleDatasets = workspace.datasets.filter(inSelectedWorkspace);
  const cards = [
    ...visibleDatasets.filter(dataset => dataset.status !== 'approved'),
    ...visibleDatasets.filter(dataset => dataset.status === 'approved'),
  ]
    .map((dataset, index) => {
      const source = documents.find(item => item.id === dataset.documentId);
      const approved = dataset.status === 'approved';
      const name = source?.name || 'Unknown document';
      return `<article class="datasets-card ${approved ? '' : 'is-draft'}" style="--i: ${index}"><span><strong title="${escapeHtml(name).replace(/"/g, '&quot;')}">${escapeHtml(name)}</strong><small>${source ? `${escapeHtml(kindLabel(source))} · ` : ''}${dataset.cases.length} ${dataset.cases.length === 1 ? 'scenario' : 'scenarios'}</small></span><span class="datasets-state ${approved ? '' : 'warn'}">${approved ? 'Approved' : 'Needs review'}</span><div class="datasets-card-actions"><button class="button ${approved ? 'button-secondary' : 'button-primary'} button-small js-review-dataset" data-id="${escapeHtml(dataset.id)}" type="button">${approved ? 'View dataset' : 'Review draft'}</button><button class="datasets-quiet js-remove-dataset" data-id="${escapeHtml(dataset.id)}" type="button">Remove</button></div></article>`;
    })
    .join('');
  const library =
    cards ||
    '<article class="datasets-empty"><strong>No golden datasets yet</strong><p>A golden dataset is the approved list of questions and correct answers your agent is tested against.</p><ol><li>Generate a draft from a source.</li><li>Check each expected answer and its evidence.</li><li>Approve it for evaluation.</li></ol></article>';
  const sourceLabel = item =>
    item.kind === 'website'
      ? `${item.name} (Website snapshot)`
      : `${item.name} (${item.kind === 'technical' ? 'Technical Blueprint' : 'Operational document'})`;
  return `${header('Golden datasets', 'Create reviewable scenarios from a selected source.')}<div class="datasets-layout"><section class="datasets-list" aria-label="Your golden datasets">${library}</section><aside class="datasets-generate"><h2>Generate a draft dataset</h2>${documents.length && controls.length ? `<form id="generate-form" class="datasets-form"><div class="field"><label for="dataset-document">Source</label><select id="dataset-document"><button type="button"><selectedcontent></selectedcontent></button>${documents.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === selectedDocumentId ? 'selected' : ''}>${escapeHtml(sourceLabel(item))}</option>`).join('')}</select></div><div class="datasets-pair"><div class="field"><label for="dataset-count">Scenarios</label><input id="dataset-count" type="number" min="1" max="30" value="10" /></div><div class="field"><label for="dataset-decline-share">Should decline (%)</label><input id="dataset-decline-share" type="number" min="0" max="50" value="20" /></div></div><span class="help">Questions the source can’t answer, to check the agent doesn’t invent details. 0 turns them off.</span><div class="field"><label for="dataset-control">Control model</label><select id="dataset-control"><button type="button"><selectedcontent></selectedcontent></button>${controls.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}</select></div><button class="button button-primary" type="submit">Generate draft scenarios</button><p id="generation-status" class="help" aria-live="polite">The control model drafts source-backed scenarios for review.</p></form>` : '<p>Add a source, and a control-model connection in Settings, to generate a draft.</p>'}</aside></div>`;
}

function chat() {
  const documents = [
    ...workspace.documents.filter(item => item.retrieval?.status === 'ready'),
    ...workspace.technicalDocuments,
    ...(workspace.websiteSnapshots || []).filter(
      item => ['complete', 'incomplete'].includes(item.status) && item.retrieval?.status === 'ready',
    ),
  ];
  const targets = workspace.connections.filter(
    connection => connection.role === 'target' && connection.kind !== 'flexagent',
  );
  const active = workspace.chats.find(item => item.id === activeChatId);
  const documentId = active?.documentId || chatDocumentId || documents[0]?.id;
  const targetId = active?.connectionId || chatTargetId || targets[0]?.id;
  const examples = [
    'What can you help me with?',
    'How do I cancel or change a booking?',
    'Who do I contact if something goes wrong?',
  ];
  // The empty state stays in #chat-messages and hides itself once askCustomerAgent adds a message.
  const messages = active?.messages?.length
    ? active.messages
        .map(
          message =>
            `<article class="message ${message.role === 'user' ? 'user' : 'agent'}"><span class="who">${message.role === 'user' ? 'You' : 'Agent'}</span><div class="bubble">${escapeHtml(message.content)}</div></article>`,
        )
        .join('')
    : `<div class="chat-empty"><strong>Ask your first question</strong><p>Ask what a real customer would ask. The agent answers using only the selected source.</p><div class="chat-examples">${examples.map(example => `<button class="chat-example js-chat-example" type="button">${example}</button>`).join('')}</div></div>`;
  const history = workspace.chats
    .map(item => {
      const sourceName = allDocuments().find(document => document.id === item.documentId)?.name || 'Document';
      return `<button class="history-item ${item.id === activeChatId ? 'active' : ''} js-open-chat" data-id="${escapeHtml(item.id)}" type="button" title="${escapeHtml(`${item.title}\n${sourceName}`).replace(/"/g, '&quot;')}"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(sourceName)}</small></button>`;
    })
    .join('');
  const label = item =>
    item.kind === 'website'
      ? `${item.name} (Website snapshot)`
      : `${item.name} (${item.kind === 'technical' ? 'Technical Blueprint' : 'Operational document'})`;
  const selectedTarget = targets.find(item => item.id === targetId);
  const selectedDocument = documents.find(item => item.id === documentId);
  return `${header('Customer chat', 'Talk to an agent as a customer would, with answers grounded in the source you pick.')}${documents.length && targets.length ? `<div class="chat-shell"><section class="panel chat-window"><div class="chat-title"><span class="connection-role">AI</span><div><strong>${escapeHtml(selectedTarget?.name || 'Agent')}</strong><small>Answers from ${escapeHtml(selectedDocument?.name || 'the selected source')}</small></div></div><div id="chat-messages" class="messages">${messages}</div><form id="customer-chat-form" class="chat-compose"><textarea id="customer-question" required rows="1" placeholder="Ask a question…" aria-label="Message"></textarea><button class="button button-primary" type="submit">Send</button></form></section><aside class="chat-setup"><h2>Chat setup</h2><div class="field"><label for="chat-target">Agent</label><select id="chat-target"><button type="button"><selectedcontent></selectedcontent></button>${targets.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === targetId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></div><div class="field"><label for="chat-document">Answers from</label><select id="chat-document"><button type="button"><selectedcontent></selectedcontent></button>${documents.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === documentId ? 'selected' : ''}>${escapeHtml(label(item))}</option>`).join('')}</select></div><button class="button button-secondary js-new-chat" type="button">+ New chat</button><hr /><div class="chat-history"><span class="history-label">Recent chats</span>${history || '<p class="chat-history-empty">No chats yet. Your conversations will appear here.</p>'}</div></aside></div>` : '<section class="panel card-pad"><h2 class="minor-title">Customer chat is not configured yet</h2><p class="page-subtitle">Add a source and a model target in Settings.</p></section>'}`;
}

const pages = { home, evaluation, documents, technical, datasets, chat, results, settings };
let renderedPage = null;
let renderedBody = null;
// refresh: true is for background loads (the FlexAgent organization and agent lists). When the page body is unchanged,
// only the Organization / Agent strip is swapped, so the page doesn't redraw and replay its entrance animation.
function render(page = location.hash.slice(1).split(':')[0] || 'home', { refresh = false } = {}) {
  const scopedPages = new Set(['documents', 'datasets', 'evaluation', 'results', 'technical']);
  const scope = scopedPages.has(page) ? scopeControls() : '';
  const body = pages[page] ? pages[page]() : pages.home();
  if (refresh && page === renderedPage && body === renderedBody) {
    const strip = app.querySelector('.workspace-scope');
    if (strip && strip.outerHTML !== scope) {
      strip.outerHTML = scope;
      bindScope(page);
    }
    return;
  }
  renderedPage = page;
  renderedBody = body;
  app.innerHTML = `${scope}${body}`;
  if (!canWriteWorkspace())
    app
      .querySelectorAll(
        '#file-input, #technical-file-input, .js-remove-dataset, #website-form input, #website-form button, #generate-form button, .manual-evaluation-form button, .js-source-dataset, .js-remove-document, .js-recrawl-website, .js-remove-website, .js-remove-technical-document, .js-approve, .js-add-scenario, .js-delete-scenario, #dataset-review-form button[type="submit"], #dataset-review-form textarea, #dataset-review-form input',
      )
      .forEach(input => {
        input.disabled = true;
        input.title = 'Reconnect FlexAgent in Settings to change this agent’s sources, datasets, or evaluations.';
      });
  document.querySelectorAll('.nav-link').forEach(link => link.classList.toggle('active', link.dataset.page === page));
  bind(page);
}

function bindScope(page) {
  document.querySelector('#workspace-organization')?.addEventListener('change', async event => {
    const orgId = event.target.value;
    if (orgId === 'local') {
      workspaceMode = 'local';
      try {
        localStorage.setItem('eval-workspace-mode', 'local');
      } catch {}
      reviewingDatasetId = null;
      viewingEvaluationId = null;
      render(page);
      return;
    }
    workspaceMode = 'flex';
    try {
      localStorage.setItem('eval-workspace-mode', 'flex');
    } catch {}
    reviewingDatasetId = null;
    viewingEvaluationId = null;
    if (!workspace.flexAgentSession?.connected) {
      viewScope = { orgId, agentId: null };
      render(page);
    } else if (orgId !== workspace.flexAgentSession.orgId)
      await selectFlexAgentOrganization({ target: { value: orgId } });
    else {
      viewScope = { orgId, agentId: workspace.flexAgentSession.selectedAgentId || null };
      render(page);
    }
  });
  document.querySelector('#workspace-agent')?.addEventListener('change', event => {
    if (!workspace.flexAgentSession?.connected) {
      viewScope = { orgId: viewScope.orgId, agentId: event.target.value || null };
      reviewingDatasetId = null;
      viewingEvaluationId = null;
      render(page);
    } else selectFlexAgent(event);
  });
}

function bind(page) {
  bindScope(page);
  document.querySelectorAll('[data-page]').forEach(link =>
    link.addEventListener('click', event => {
      event.preventDefault();
      if (link.dataset.page === 'results') viewingEvaluationId = null;
      location.hash = link.dataset.page;
    }),
  );
  if (page === 'results' && !viewingEvaluationId) {
    const overview = app.querySelector('.panel.card-pad:not(.workspace-scope)');
    if (overview) {
      overview.classList.add('results-overview');
      const visibleRuns = workspace.evaluations.filter(inSelectedWorkspace);
      const visibleBenchmarks = workspace.datasets.filter(
        item => inSelectedWorkspace(item) && item.status === 'approved',
      );
      overview.innerHTML = `<span class="eyebrow">EVALUATION RECORDS</span><h2 class="minor-title">Review evidence, not just a score.</h2><p class="page-subtitle">Each saved evaluation keeps the target answer, expected answer, source evidence, rubric, and control-model verdict for every scenario.</p><div class="results-overview-facts"><span><b>${visibleRuns.length}</b> saved evaluation${visibleRuns.length === 1 ? '' : 's'}</span><span><b>${visibleBenchmarks.length}</b> approved benchmark${visibleBenchmarks.length === 1 ? '' : 's'}</span></div>`;
      if (visibleRuns.length)
        overview.insertAdjacentHTML(
          'afterend',
          `<section class="panel evaluation-switcher"><label for="evaluation-history-select">Open a saved evaluation</label><select id="evaluation-history-select"><option value="">Choose an evaluation</option>${visibleRuns.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(`${evaluationSourceName(item)} · ${evaluationRunType(item)}`)} · ${escapeHtml(item.score)}% · ${new Date(item.createdAt).toLocaleString()}</option>`).join('')}</select><button class="button button-secondary button-small js-view-evaluation" data-id="${escapeHtml(visibleRuns[0].id)}" type="button">View latest evaluation</button></section>`,
        );
    }
  }
  document
    .querySelectorAll('.js-toast')
    .forEach(el =>
      el.addEventListener('click', () => toast('Connection setup will be available with the secure backend.')),
    );
  document.querySelectorAll('.js-upload').forEach(el =>
    el.addEventListener('click', () => {
      const input = document.querySelector('#file-input');
      if (input) input.click();
      else location.hash = 'documents';
    }),
  );
  document.querySelector('#file-input')?.addEventListener('change', event => uploadDocument(event.target.files[0]));
  document.querySelector('#website-form')?.addEventListener('submit', crawlWebsiteSource);
  document
    .querySelectorAll('.js-recrawl-website')
    .forEach(button => button.addEventListener('click', () => recrawlWebsiteSource(button.dataset.id)));
  document
    .querySelectorAll('.js-remove-website')
    .forEach(button => button.addEventListener('click', () => removeWebsiteSource(button.dataset.id)));
  document
    .querySelector('#technical-file-input')
    ?.addEventListener('change', event => uploadTechnicalDocument(event.target.files[0]));
  document.querySelector('#technical-search')?.addEventListener('input', event => {
    const query = event.target.value.toLowerCase();
    document
      .querySelectorAll(
        '[data-search], .flow-details details, .blueprint-example-panel article, .blueprint-questions details',
      )
      .forEach(item => {
        item.hidden = !item.textContent.toLowerCase().includes(query);
      });
  });
  document.querySelector('.js-catalog-search')?.addEventListener('input', event => {
    const query = event.target.value.toLowerCase();
    document.querySelectorAll('[data-search]').forEach(item => {
      item.hidden = !item.dataset.search.toLowerCase().includes(query);
    });
  });
  document.querySelector('.js-show-overview')?.addEventListener('click', () => {
    const source = document.querySelector('#overview .blueprint-evidence');
    source.open = true;
    source.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  document
    .querySelectorAll('.js-remove-document')
    .forEach(button => button.addEventListener('click', () => removeDocument(button.dataset.id)));
  document
    .querySelectorAll('.js-remove-technical-document')
    .forEach(button => button.addEventListener('click', () => removeTechnicalDocument(button.dataset.id)));
  document.querySelectorAll('.js-open-technical').forEach(button =>
    button.addEventListener('click', () => {
      document.querySelector('.technical-library')?.removeAttribute('open');
      location.hash = `technical:${button.dataset.id}`;
      render('technical');
    }),
  );
  document.querySelectorAll('.js-technical-tab').forEach(button =>
    button.addEventListener('click', () => {
      technicalTab = button.dataset.tab;
      render('technical');
    }),
  );
  document.querySelector('#technical-document-select')?.addEventListener('change', event => {
    technicalTab = 'overview';
    location.hash = `technical:${event.target.value}`;
  });
  document.querySelectorAll('.js-start-chat').forEach(button =>
    button.addEventListener('click', () => {
      activeChatId = null;
      chatDocumentId = allDocuments().find(item => item.retrieval?.status === 'ready')?.id;
      location.hash = 'chat';
    }),
  );
  document.querySelectorAll('.js-source-dataset').forEach(button =>
    button.addEventListener('click', () => {
      datasetDocumentId = button.dataset.id;
      location.hash = 'datasets';
      render('datasets');
    }),
  );
  document.querySelector('#openai-form')?.addEventListener('submit', saveOpenAISetup);
  document
    .querySelectorAll('.js-settings-tab')
    .forEach(tab => tab.addEventListener('click', () => showSettingsTab(tab.dataset.tab)));
  document.querySelector('.settings-tabs')?.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...document.querySelectorAll('.js-settings-tab')];
    const current = tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true');
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (current + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    showSettingsTab(tabs[next].dataset.tab);
    tabs[next].focus();
  });
  document.querySelector('#flexagent-login-form')?.addEventListener('submit', connectFlexAgent);
  document.querySelector('#flexagent-form')?.addEventListener('submit', saveFlexAgentTarget);
  document.querySelector('#flexagent-load-organizations')?.addEventListener('click', loadFlexAgentOrganizations);
  document.querySelector('#flexagent-organization-picker')?.addEventListener('change', selectFlexAgentOrganization);
  document.querySelector('#flexagent-load-agents')?.addEventListener('click', loadFlexAgentAgents);
  document.querySelector('#flexagent-reconnect')?.addEventListener('click', () => {
    workspace.flexAgentSession = null;
    flexAgentAgents = [];
    flexAgentOrganizations = [];
    render('settings');
  });
  document.querySelector('#flexagent-agent-picker')?.addEventListener('change', selectFlexAgent);
  enhanceFlexAgentSettings();
  document.querySelector('#agent-prompt-form')?.addEventListener('submit', saveAgentPrompt);
  document.querySelector('#instruction-document')?.addEventListener('change', event => {
    instructionDocumentId = event.target.value;
    render('settings');
  });
  document.querySelector('#instruction-target')?.addEventListener('change', event => {
    instructionTargetId = event.target.value;
    render('settings');
  });
  document
    .querySelectorAll('.js-remove-connection')
    .forEach(button => button.addEventListener('click', () => removeConnection(button.dataset.id)));
  document
    .querySelectorAll('.js-reasoning')
    .forEach(select => select.addEventListener('change', () => setReasoningEffort(select)));
  document
    .querySelectorAll('.js-check-judge')
    .forEach(button => button.addEventListener('click', () => checkJudgeModel(button)));
  document.querySelector('#generate-form')?.addEventListener('submit', generateDataset);
  showGenerationProgress();
  document.querySelector('#dataset-document')?.addEventListener('change', event => {
    datasetDocumentId = event.target.value;
  });
  document
    .querySelectorAll('.js-remove-dataset')
    .forEach(button => button.addEventListener('click', () => removeDataset(button.dataset.id)));
  document.querySelectorAll('.js-review-dataset').forEach(button =>
    button.addEventListener('click', () => {
      reviewingDatasetId = button.dataset.id;
      render('datasets');
    }),
  );
  document.querySelectorAll('.js-view-evaluation').forEach(button =>
    button.addEventListener('click', () => {
      viewingEvaluationId = button.dataset.id;
      render('results');
    }),
  );
  document.querySelector('#evaluation-history-select')?.addEventListener('change', event => {
    viewingEvaluationId = event.target.value || null;
    render('results');
  });
  document.querySelector('.js-download-evaluation')?.addEventListener('click', downloadEvaluationReport);
  const viewedEvaluation =
    workspace.evaluations.find(item => item.id === viewingEvaluationId && inSelectedWorkspace(item)) ||
    workspace.evaluations.find(inSelectedWorkspace);
  document.querySelectorAll('.evaluation-detail').forEach((detail, index) => {
    if (!viewedEvaluation?.results[index]?.manual) return;
    const retrieval = Array.from(detail.querySelectorAll('section')).find(
      section => section.querySelector('b')?.textContent === 'Retrieval',
    );
    if (retrieval)
      retrieval.querySelector('p').textContent =
        'This evaluation used pasted answers, so no retrieval trace was captured.';
  });
  document
    .querySelectorAll('.js-result-pick')
    .forEach(item => item.addEventListener('click', () => showResultScenario(Number(item.dataset.index))));
  document
    .querySelectorAll('.js-result-step')
    .forEach(button => button.addEventListener('click', () => stepResultScenario(Number(button.dataset.step))));
  document
    .querySelectorAll('.js-result-filter')
    .forEach(button => button.addEventListener('click', () => filterResultScenarios(button.dataset.filter)));
  document.querySelector('.result-list-scroll')?.addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = stepResultScenario(
      event.key === 'Home' ? -Infinity : event.key === 'End' ? Infinity : event.key === 'ArrowDown' ? 1 : -1,
    );
    document.querySelector(`.js-result-pick[data-index="${next}"]`)?.focus();
  });
  if (document.querySelector('.result-detail')) filterResultScenarios(resultFilter);
  document.querySelectorAll('.js-view-retrieval').forEach(button => {
    const result = workspace.evaluations.find(item => item.id === button.dataset.evaluationId)?.results[
      Number(button.dataset.resultIndex)
    ];
    if (result?.retrievalUnavailable) {
      button.parentElement.innerHTML = `<p class="help">${result.manual ? 'This evaluation used pasted answers, so no retrieval trace was captured.' : 'FlexAgent used its own knowledge base, so no retrieval trace is available here.'}</p>`;
      return;
    }
    button.addEventListener('click', () => {
      viewingRetrievedChunks = {
        evaluationId: button.dataset.evaluationId,
        resultIndex: Number(button.dataset.resultIndex),
      };
      render('results');
    });
  });
  document.querySelector('.js-close-retrieval')?.addEventListener('click', () => {
    viewingRetrievedChunks = null;
    render('results');
  });
  document.querySelectorAll('.js-close-review').forEach(button =>
    button.addEventListener('click', () => {
      reviewingDatasetId = null;
      render('datasets');
    }),
  );
  document.querySelector('.js-go-evaluation')?.addEventListener('click', () => {
    reviewingDatasetId = null;
    location.hash = 'evaluation';
  });
  document.querySelector('#dataset-review-form')?.addEventListener('submit', saveDatasetReview);
  document.querySelector('.js-add-scenario')?.addEventListener('click', addDatasetScenario);
  document
    .querySelectorAll('.js-review-pick')
    .forEach(item => item.addEventListener('click', () => showReviewScenario(Number(item.dataset.index))));
  document
    .querySelectorAll('.js-review-step')
    .forEach(button =>
      button.addEventListener('click', () => showReviewScenario(reviewScenarioIndex + Number(button.dataset.step))),
    );
  document.querySelector('.review-list-scroll')?.addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const count = document.querySelectorAll('.js-review-pick').length;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? count - 1
          : reviewScenarioIndex + (event.key === 'ArrowDown' ? 1 : -1);
    event.preventDefault();
    showReviewScenario(next);
    document.querySelector(`.js-review-pick[data-index="${reviewScenarioIndex}"]`)?.focus();
  });
  document.querySelector('#dataset-review-form')?.addEventListener('click', event => {
    const target = event.target.closest('.js-review-jump, .js-rubric-remove, .js-rubric-keep, .js-rubric-recheck');
    if (!target) return;
    const index = Number(target.dataset.index);
    if (target.matches('.js-rubric-recheck')) recheckRubric(target);
    else if (target.matches('.js-review-jump')) showReviewScenario(index);
    else if (target.matches('.js-rubric-remove')) removeRubricPoint(index, target.dataset.point);
    else
      updateRubricFlag(index, target.dataset.point, point => {
        point.kept = true;
      });
  });
  document.querySelector('#dataset-review-form')?.addEventListener('input', event => {
    const index = event.target.dataset?.index;
    if (
      ['question', 'expectedAnswer', 'sourceEvidence', 'turns'].includes(event.target.dataset?.field) &&
      index !== undefined
    )
      refreshReviewListItem(index);
  });
  document
    .querySelectorAll('.js-delete-scenario')
    .forEach(button => button.addEventListener('click', () => deleteDatasetScenario(Number(button.dataset.index))));
  document
    .querySelectorAll('.js-approve')
    .forEach(button => button.addEventListener('click', () => approveDataset(button.dataset.id)));
  const chatMessages = document.querySelector('#chat-messages');
  if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight; // Open a chat at its newest message.
  document.querySelector('#customer-chat-form')?.addEventListener('submit', askCustomerAgent);
  document.querySelector('#customer-question')?.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form.requestSubmit();
    }
  });
  document.querySelectorAll('.js-open-chat').forEach(button =>
    button.addEventListener('click', () => {
      activeChatId = button.dataset.id;
      const chat = workspace.chats.find(item => item.id === activeChatId);
      chatDocumentId = chat.documentId;
      chatTargetId = chat.connectionId;
      render('chat');
    }),
  );
  document.querySelectorAll('.js-chat-example').forEach(button =>
    button.addEventListener('click', () => {
      const input = document.querySelector('#customer-question');
      input.value = button.textContent;
      input.focus();
    }),
  );
  document.querySelector('.js-new-chat')?.addEventListener('click', () => {
    activeChatId = null;
    render('chat');
  });
  document.querySelector('#chat-document')?.addEventListener('change', event => {
    activeChatId = null;
    chatDocumentId = event.target.value;
    render('chat');
  });
  document.querySelector('#chat-target')?.addEventListener('change', event => {
    activeChatId = null;
    chatTargetId = event.target.value;
    render('chat');
  });
  document.querySelector('#evaluation-form')?.addEventListener('submit', runEvaluation);
  document
    .querySelectorAll('.manual-evaluation-form')
    .forEach(form => form.addEventListener('submit', runManualEvaluation));
}

async function uploadDocument(file) {
  if (!file) return;
  if (!canWriteWorkspace()) {
    toast('Connect FlexAgent and choose an organization and agent first.');
    return;
  }
  const form = new FormData();
  form.append('document', file);
  if (selectedScope()) {
    form.append('orgId', selectedScope().orgId);
    form.append('agentId', selectedScope().agentId);
  }
  try {
    const response = await fetch('/api/documents', { method: 'POST', body: form });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    workspace.documents.push(body);
    uploadedDocument = body;
    render('documents');
    toast(`${body.name} uploaded and text extracted.`);
  } catch (error) {
    toast(error.message || 'Document upload failed. Start the server with npm start.');
  }
}
async function uploadTechnicalDocument(file) {
  if (!file) return;
  if (!canWriteWorkspace()) {
    toast('Connect FlexAgent and choose an organization and agent first.');
    return;
  }
  const form = new FormData();
  form.append('document', file);
  if (selectedScope()) {
    form.append('orgId', selectedScope().orgId);
    form.append('agentId', selectedScope().agentId);
  }
  technicalUploadStatus = {
    kind: 'working',
    message: `Processing ${file.name}: extracting text and building its blueprint…`,
  };
  render('technical');
  try {
    const response = await fetch('/api/technical-documents', { method: 'POST', body: form });
    const body = await response
      .json()
      .catch(() => ({ error: 'Technical uploads need the updated server. Restart Eval Tool, then try again.' }));
    if (!response.ok) throw new Error(body.error);
    workspace.technicalDocuments = [...workspace.technicalDocuments.filter(item => item.id !== body.id), body];
    technicalUploadStatus = {
      kind: body.analysisStatus === 'ready' ? 'ready' : 'warning',
      message:
        body.analysisStatus === 'ready'
          ? `${body.name} is ready to explore.`
          : `${body.name} uploaded, but its analysis is unavailable.`,
    };
    location.hash = `technical:${body.id}`;
    render('technical');
    toast(
      body.analysisStatus === 'ready' ? 'Technical blueprint created.' : 'Document uploaded. Analysis is unavailable.',
    );
  } catch (error) {
    technicalUploadStatus = {
      kind: 'error',
      message: `Upload failed: ${error.message || 'Technical document could not be processed.'}`,
    };
    render('technical');
    toast(error.message || 'Technical document upload failed.');
  }
}

async function removeDocument(id) {
  try {
    const response = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.error);
    }
    const datasetIds = new Set(workspace.datasets.filter(item => item.documentId === id).map(item => item.id));
    workspace.documents = workspace.documents.filter(item => item.id !== id);
    workspace.datasets = workspace.datasets.filter(item => item.documentId !== id);
    workspace.evaluations = workspace.evaluations.filter(item => !datasetIds.has(item.datasetId));
    workspace.chats = workspace.chats.filter(item => item.documentId !== id);
    workspace.agentConfigs = workspace.agentConfigs.filter(item => item.documentId !== id);
    render('documents');
    toast('Document and its related data removed.');
  } catch (error) {
    toast(error.message || 'Document could not be removed.');
  }
}

async function removeDataset(id) {
  const dataset = workspace.datasets.find(item => item.id === id);
  const name = allDocuments().find(item => item.id === dataset?.documentId)?.name || 'Unknown document';
  const runs = workspace.evaluations.filter(item => item.datasetId === id).length;
  const runNote = runs ? ` and its ${runs} evaluation ${runs === 1 ? 'run' : 'runs'}` : '';
  if (!confirm(`This permanently removes the golden dataset for "${name}"${runNote}. Continue?`)) return;
  try {
    const response = await fetch(`/api/datasets/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.error);
    }
    workspace.datasets = workspace.datasets.filter(item => item.id !== id);
    workspace.evaluations = workspace.evaluations.filter(item => item.datasetId !== id);
    if (reviewingDatasetId === id) reviewingDatasetId = null;
    if (viewingEvaluationId && !workspace.evaluations.some(item => item.id === viewingEvaluationId))
      viewingEvaluationId = null;
    render('datasets');
    toast(runs ? 'Golden dataset and its evaluation runs removed.' : 'Golden dataset removed.');
  } catch (error) {
    toast(error.message || 'Golden dataset could not be removed.');
  }
}
async function removeTechnicalDocument(id) {
  const name = workspace.technicalDocuments.find(item => item.id === id)?.name;
  if (!name) return;
  if (
    !confirm(`This permanently removes "${name}" and its related chats, datasets, evaluations, and settings. Continue?`)
  )
    return;
  try {
    const response = await fetch(`/api/technical-documents/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.error);
    }
    const datasetIds = new Set(workspace.datasets.filter(item => item.documentId === id).map(item => item.id));
    workspace.technicalDocuments = workspace.technicalDocuments.filter(item => item.id !== id);
    workspace.datasets = workspace.datasets.filter(item => item.documentId !== id);
    workspace.evaluations = workspace.evaluations.filter(item => !datasetIds.has(item.datasetId));
    workspace.chats = workspace.chats.filter(item => item.documentId !== id);
    workspace.agentConfigs = workspace.agentConfigs.filter(item => item.documentId !== id);
    if (activeChatId && !workspace.chats.some(item => item.id === activeChatId)) activeChatId = null;
    const next = workspace.technicalDocuments.find(inSelectedWorkspace);
    location.hash = next ? `technical:${next.id}` : 'technical';
    render('technical');
    toast('Technical document and its related data removed.');
  } catch (error) {
    toast(error.message || 'Technical document could not be removed.');
  }
}

async function crawlWebsiteSource(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const status = document.querySelector('#website-status');
  const url = document.querySelector('#website-url').value.trim();
  button.disabled = true;
  button.textContent = 'Crawling website…';
  status.textContent = 'Rendering and collecting public pages. This may take a few minutes.';
  try {
    const response = await fetch('/api/websites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, ...selectedScope() }),
    });
    const snapshot = await response.json();
    if (!response.ok) throw new Error(snapshot.error);
    const website = {
      id: snapshot.websiteId,
      rootUrl: snapshot.rootUrl,
      ...(snapshot.orgId ? { orgId: snapshot.orgId, agentId: snapshot.agentId } : {}),
    };
    workspace.websites = [...workspace.websites.filter(item => item.id !== website.id), website];
    workspace.websiteSnapshots.push(snapshot);
    render('documents');
    toast(`Website snapshot ready with ${snapshot.pages.length} pages.`);
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Crawl website';
    status.textContent = error.message || 'Website crawl failed.';
  }
}
async function removeWebsiteSource(websiteId) {
  const site = workspace.websites.find(item => item.id === websiteId);
  if (!site) return;
  if (
    !confirm(
      `This permanently removes "${site.rootUrl}", all of its snapshots, and its related chats, datasets, evaluations, and settings. Continue?`,
    )
  )
    return;
  try {
    const response = await fetch(`/api/websites/${websiteId}`, { method: 'DELETE' });
    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.error);
    }
    const snapshotIds = new Set(
      workspace.websiteSnapshots.filter(item => item.websiteId === websiteId).map(item => item.id),
    );
    const datasetIds = new Set(
      workspace.datasets.filter(item => snapshotIds.has(item.documentId)).map(item => item.id),
    );
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
    if (viewingEvaluationId && !workspace.evaluations.some(item => item.id === viewingEvaluationId))
      viewingEvaluationId = null;
    render('documents');
    toast('Website and its related data removed.');
  } catch (error) {
    toast(error.message || 'Website could not be removed.');
  }
}
async function recrawlWebsiteSource(websiteId) {
  const button = document.querySelector(`.js-recrawl-website[data-id="${websiteId}"]`);
  if (button) {
    button.disabled = true;
    button.textContent = 'Re-crawling…';
  }
  try {
    const response = await fetch(`/api/websites/${websiteId}/recrawl`, { method: 'POST' });
    const snapshot = await response.json();
    if (!response.ok) throw new Error(snapshot.error);
    workspace.websiteSnapshots.push(snapshot);
    render('documents');
    toast(`New website snapshot ready with ${snapshot.pages.length} pages.`);
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = 'Re-crawl';
    }
    toast(error.message || 'Website re-crawl failed.');
  }
}

async function saveOpenAISetup(event) {
  event.preventDefault();
  const data = {
    apiKey: document.querySelector('#openai-key').value,
    targetModel: document.querySelector('#target-model').value,
    controlModel: document.querySelector('#control-model').value,
  };
  try {
    const response = await fetch('/api/openai-setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    workspace.connections.push(...body);
    render('settings');
    const checkError = body.find(connection => connection.judgeCheckError)?.judgeCheckError;
    toast(
      checkError
        ? `OpenAI setup saved. The control model could not be checked yet (${checkError}); it will be checked on its first scoring call.`
        : 'OpenAI setup saved securely.',
    );
  } catch (error) {
    toast(error.message || 'OpenAI setup could not be saved. Start the server with npm start.');
  }
}

async function saveFlexAgentTarget(event) {
  event.preventDefault();
  const data = {
    name: document.querySelector('#flexagent-name').value,
    baseUrl: document.querySelector('#flexagent-url').value,
    orgId: document.querySelector('#flexagent-org-id').value,
    agentId: document.querySelector('#flexagent-agent-id').value,
    serviceToken: document.querySelector('#flexagent-token').value,
    mode: document.querySelector('#flexagent-mode').value,
    parentOrigin: document.querySelector('#flexagent-origin').value,
  };
  try {
    const response = await fetch('/api/flexagent-target', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    workspace.connections.push(body);
    render('settings');
    toast('FlexAgent target saved securely.');
  } catch (error) {
    toast(error.message || 'FlexAgent target could not be saved.');
  }
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
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Connecting…';
  const data = {
    baseUrl: document.querySelector('#flexagent-login-url').value,
    email: document.querySelector('#flexagent-login-email').value,
    password: document.querySelector('#flexagent-login-password').value,
    parentOrigin: document.querySelector('#flexagent-login-origin').value,
  };
  try {
    const response = await fetch('/api/flexagent/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    workspace.flexAgentSession = body.session;
    viewScope = null;
    workspaceMode = 'flex';
    try {
      localStorage.setItem('eval-workspace-mode', 'flex');
    } catch {}
    flexAgentAgents = [];
    flexAgentOrganizations = [];
    await loadFlexAgentOrganizations(false);
    toast('FlexAgent connected. Choose an organization.');
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Connect FlexAgent';
    toast(error.message || 'FlexAgent could not be connected.');
  }
}

async function loadFlexAgentOrganizations(showToast = true) {
  try {
    const response = await fetch('/api/flexagent/organizations', { method: 'POST' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    flexAgentOrganizations = body.organizations;
    await loadWorkspace();
    render(undefined, { refresh: true });
    if (showToast) toast(`${body.organizations.length} organizations loaded.`);
    if (workspace.flexAgentSession?.orgId) await loadFlexAgentAgents(false);
    return true;
  } catch (error) {
    await loadWorkspace();
    flexAgentOrganizations = [];
    render(undefined, { refresh: true });
    toast(error.message || 'FlexAgent organizations could not be loaded.');
    return false;
  }
}

async function selectFlexAgentOrganization(event) {
  const orgId = event.target.value;
  if (!orgId) return;
  try {
    const response = await fetch('/api/flexagent/select-organization', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    workspace.flexAgentSession = body.session;
    viewScope = { orgId: body.session.orgId, agentId: body.session.selectedAgentId || null };
    workspaceMode = 'flex';
    try {
      localStorage.setItem('eval-workspace-mode', 'flex');
    } catch {}
    flexAgentAgents = [];
    reviewingDatasetId = null;
    viewingEvaluationId = null;
    await loadWorkspace();
    await loadFlexAgentAgents(false);
    render();
    toast(`${body.session.orgName} selected. Choose an agent next.`);
  } catch (error) {
    await loadWorkspace();
    render();
    toast(error.message || 'Organization could not be selected.');
  }
}

async function loadFlexAgentAgents(showToast = true) {
  try {
    const response = await fetch('/api/flexagent/agents', { method: 'POST' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    flexAgentAgents = body.agents;
    await loadWorkspace();
    render(undefined, { refresh: true });
    if (showToast) toast(`${body.agents.length} FlexAgents loaded.`);
    return true;
  } catch (error) {
    await loadWorkspace();
    flexAgentAgents = [];
    render(undefined, { refresh: true });
    toast(error.message || 'FlexAgent agents could not be loaded.');
    return false;
  }
}

async function selectFlexAgent(event) {
  const agentId = event.target.value;
  if (!agentId) return;
  try {
    const response = await fetch('/api/flexagent/select-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    workspace.flexAgentSession = body.session;
    viewScope = { orgId: body.session.orgId, agentId: body.session.selectedAgentId };
    workspaceMode = 'flex';
    try {
      localStorage.setItem('eval-workspace-mode', 'flex');
    } catch {}
    reviewingDatasetId = null;
    viewingEvaluationId = null;
    workspace.connections = [
      ...workspace.connections.filter(connection => connection.id !== body.target.id),
      body.target,
    ];
    render();
    toast(`${body.target.name} is ready for LiveKit evaluation.`);
  } catch (error) {
    await loadWorkspace();
    render();
    toast(error.message || 'FlexAgent could not be selected.');
  }
}

function waitForLiveKitAgent(room) {
  const state = participant => participant?.attributes?.['lk.agent.state'];
  const ready = participant => state(participant) && state(participant) !== 'initializing';
  if ([...room.remoteParticipants.values()].some(ready)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => done(new Error('FlexAgent did not start within 60 seconds.')), 60000);
    const onParticipant = participant => {
      if (ready(participant)) done();
    };
    const onAttributes = (attributes, participant) => {
      if (ready(participant)) done();
    };
    const done = error => {
      clearTimeout(timeout);
      room.off(window.LivekitClient.RoomEvent.ParticipantConnected, onParticipant);
      room.off(window.LivekitClient.RoomEvent.ParticipantAttributesChanged, onAttributes);
      error ? reject(error) : resolve();
    };
    room.on(window.LivekitClient.RoomEvent.ParticipantConnected, onParticipant);
    room.on(window.LivekitClient.RoomEvent.ParticipantAttributesChanged, onAttributes);
  });
}

async function liveKitAnswer(targetConnectionId, question, { expectShortReply = false } = {}) {
  if (!window.LivekitClient)
    return Promise.reject(new Error('LiveKit client did not load. Restart Eval Tool and try again.'));
  const tokenResponse = await fetch('/api/flexagent-livekit-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetConnectionId }),
  });
  const credentials = await tokenResponse.json();
  if (!tokenResponse.ok) throw new Error(credentials.error || 'FlexAgent did not issue a LiveKit token.');
  const room = new window.LivekitClient.Room();
  const events = window.LivekitClient.RoomEvent;
  try {
    await room.connect(credentials.wsUrl, credentials.token);
    await waitForLiveKitAgent(room);
    await waitForLiveKitGreeting(room, events);
    return await collectLiveKitAnswer(room, question, events, { expectShortReply });
  } finally {
    await room.disconnect().catch(() => {});
  }
}

async function runLiveKitEvaluation(datasetId, targetConnectionId, controlConnectionId, button, help) {
  const dataset = workspace.datasets.find(item => item.id === datasetId);
  if (dataset.cases.some(item => item.turns?.length))
    throw new Error('LiveKit widget evaluation currently supports single-turn scenarios only.');
  help.textContent = `Connecting to FlexAgent and running 0 of ${dataset.cases.length} scenarios…`;
  const answers = [];
  for (const [index, item] of dataset.cases.entries()) {
    help.textContent = `Connecting to FlexAgent and running ${index + 1} of ${dataset.cases.length} scenarios…`;
    answers.push(await liveKitAnswer(targetConnectionId, item.question, { expectShortReply: isDecline(item) }));
  }
  const response = await fetch('/api/evaluations/livekit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ datasetId, targetConnectionId, controlConnectionId, answers }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'LiveKit evaluation could not be scored.');
  workspace.evaluations.unshift(body);
  viewingEvaluationId = body.id;
  render('results');
  toast('LiveKit evaluation completed.');
}

async function saveAgentPrompt(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const documentId = document.querySelector('#instruction-document').value;
  const connectionId = document.querySelector('#instruction-target').value;
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const response = await fetch('/api/agent-configs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId,
        connectionId,
        systemPrompt: document.querySelector('#agent-system-prompt').value,
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    instructionDocumentId = documentId;
    instructionTargetId = connectionId;
    workspace.agentConfigs = [...workspace.agentConfigs.filter(item => item.id !== body.id), body];
    render('settings');
    toast('Instructions saved for this policy.');
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Save instructions for this policy';
    toast(error.message || 'Instructions could not be saved.');
  }
}

async function checkJudgeModel(button) {
  button.disabled = true;
  button.textContent = 'Checking…';
  try {
    const response = await fetch(`/api/connections/${button.dataset.id}/check-judge`, { method: 'POST' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    workspace.connections = workspace.connections.map(connection => (connection.id === body.id ? body : connection));
    render('settings');
    toast(`${body.model}: ${judgeSupportLabel(body)}.`);
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Check model';
    toast(error.message || 'The model could not be checked.');
  }
}

async function setReasoningEffort(select) {
  select.disabled = true;
  try {
    const response = await fetch(`/api/connections/${select.dataset.id}/reasoning`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reasoningEffort: select.value }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    workspace.connections = workspace.connections.map(connection => (connection.id === body.id ? body : connection));
    render('settings');
    toast(
      `Reasoning set to ${REASONING_LABELS[body.reasoningEffort]}. New evaluations use it; earlier results keep the level they were graded with.`,
    );
  } catch (error) {
    select.disabled = false;
    toast(error.message || 'Reasoning level could not be saved.');
  }
}

async function removeConnection(id) {
  try {
    const response = await fetch(`/api/connections/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.error);
    }
    workspace.connections = workspace.connections.filter(connection => connection.id !== id);
    render('settings');
    toast('Model connection removed.');
  } catch (error) {
    toast(error.message || 'Connection could not be removed.');
  }
}

// The draft being generated. Kept outside the page so leaving Golden datasets and coming back shows it still running.
let generation = null;
const generationFields = ['dataset-document', 'dataset-count', 'dataset-decline-share', 'dataset-control'];

// Lock the form and show the progress card for the running generation. Called again after every render.
function showGenerationProgress() {
  const form = document.querySelector('#generate-form');
  if (!generation || !form || form.querySelector('.datasets-progress')) return;
  for (const id of generationFields) {
    const field = form.querySelector(`#${id}`);
    if (!field) continue;
    field.value = generation.values[id];
    if (field.disabled) continue;
    field.disabled = true;
    field.dataset.generationLocked = '';
  }
  const submit = form.querySelector('button[type="submit"]');
  const progress = form.querySelector('#generation-status');
  submit.hidden = true;
  progress.hidden = true;
  progress.classList.remove('is-cancelled');
  submit.insertAdjacentHTML(
    'afterend',
    `<div class="datasets-progress" role="status"><div class="datasets-progress-top"><strong>Generating ${escapeHtml(generation.count)} ${generation.count === 1 ? 'scenario' : 'scenarios'}…</strong><button class="datasets-cancel js-cancel-generation" type="button">Cancel</button></div><div class="datasets-progress-bar"><span></span></div><p>Reading the selected document and creating the draft. This can take a minute.</p></div>`,
  );
  const cancelButton = form.querySelector('.js-cancel-generation');
  cancelButton.disabled = generation.answered;
  cancelButton.addEventListener('click', () => generation?.cancel.abort());
}

// Unlock the form on whatever Golden datasets page is showing now, if any.
function hideGenerationProgress(message) {
  const form = document.querySelector('#generate-form');
  if (!form) return null;
  form.querySelector('.datasets-progress')?.remove();
  form.querySelectorAll('[data-generation-locked]').forEach(field => {
    field.disabled = false;
    delete field.dataset.generationLocked;
  });
  form.querySelector('button[type="submit"]').hidden = false;
  const progress = form.querySelector('#generation-status');
  progress.hidden = false;
  progress.textContent = message;
  return progress;
}

async function generateDataset(event) {
  event.preventDefault();
  if (generation) return;
  const values = Object.fromEntries(generationFields.map(id => [id, document.querySelector(`#${id}`).value]));
  const cancel = new AbortController();
  generation = { cancel, values, count: Number(values['dataset-count']) || 10, answered: false };
  showGenerationProgress();
  try {
    const response = await fetch('/api/datasets/generate', {
      method: 'POST',
      signal: cancel.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: values['dataset-document'],
        connectionId: values['dataset-control'],
        count: values['dataset-count'],
        declineShare: values['dataset-decline-share'],
      }),
    });
    // The server has answered, so the draft may already be saved: too late to cancel.
    generation.answered = true;
    const cancelButton = document.querySelector('.js-cancel-generation');
    if (cancelButton) cancelButton.disabled = true;
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    generation = null;
    workspace.datasets.push(body);
    reviewingDatasetId = body.id;
    if ((location.hash.slice(1).split(':')[0] || 'home') === 'datasets') {
      render('datasets');
      toast('Draft generated. Review the scenarios before approving.');
    } else toast('Draft ready in Golden datasets. Review the scenarios before approving.');
  } catch (error) {
    generation = null;
    if (error.name === 'AbortError') {
      hideGenerationProgress('Generation cancelled. Nothing was saved.')?.classList.add('is-cancelled');
      return;
    }
    const message = error.message || 'Dataset generation failed. Please try again.';
    hideGenerationProgress(message)?.setAttribute('role', 'alert');
    toast(message);
  }
}

function reviewedCases(form, dataset) {
  return dataset.cases.map((item, index) => {
    const value = field => form.querySelector(`[data-field="${field}"][data-index="${index}"]`).value.trim();
    const json = field => {
      const raw = value(field);
      return raw ? JSON.parse(raw) : [];
    };
    const sourceUrl = form.querySelector(`[data-field="sourceUrl"][data-index="${index}"]`)?.value.trim();
    const declineKind =
      form.querySelector(`[data-field="caseType"][data-index="${index}"]`)?.value === 'decline'
        ? form.querySelector(`[data-field="declineKind"][data-index="${index}"]`)?.value
        : null;
    return {
      question: value('question'),
      expectedAnswer: value('expectedAnswer'),
      requiredPoints: value('requiredPoints')
        .split('\n')
        .map(text => text.trim())
        .filter(Boolean),
      forbiddenPoints: value('forbiddenPoints')
        .split('\n')
        .map(text => text.trim())
        .filter(Boolean),
      sourceEvidence: value('sourceEvidence'),
      ...(sourceUrl ? { sourceUrl } : {}),
      turns: json('turns'),
      expectedFinalMemory: json('expectedFinalMemory'),
      ...(declineKind ? { caseType: 'decline', declineKind } : {}),
    };
  });
}

function keptRubricPoints(dataset) {
  return (dataset.rubricCheck?.cases || []).flatMap(entry =>
    entry.points
      .filter(point => point.kept)
      .map(point => ({ question: entry.question, sourceEvidence: entry.sourceEvidence, point: point.point })),
  );
}
// Remove and Keep change only the rubric panel, the note and the list marker, so unsaved edits elsewhere survive.
function updateRubricFlag(index, pointText, change) {
  const dataset = workspace.datasets.find(item => item.id === reviewingDatasetId);
  const item = dataset?.cases[index];
  const entry = item && rubricCheckFor(dataset, item);
  const point = entry?.points.find(candidate => candidate.point === pointText);
  if (!point) return;
  change(point);
  const panel = document.querySelector(`#rubric-check-${index}`);
  if (panel) panel.outerHTML = rubricCheckMarkup(entry, index, dataset.status !== 'approved');
  const note = document.querySelector('#rubric-note');
  if (note) note.outerHTML = rubricCheckNote(dataset, dataset.status !== 'approved');
  const number = document.querySelector(`.js-review-pick[data-index="${index}"] .review-list-number`);
  if (number) number.outerHTML = reviewListNumber(dataset, item, index);
}
function removeRubricPoint(index, pointText) {
  if (
    !window.confirm(`Remove the required point "${pointText}" from scenario ${index + 1}? It is removed when you save.`)
  )
    return;
  const field = document.querySelector(`[data-field="requiredPoints"][data-index="${index}"]`);
  if (field)
    field.value = field.value
      .split('\n')
      .filter(line => line.trim() !== pointText)
      .join('\n');
  updateRubricFlag(index, pointText, point => {
    point.removed = true;
  });
}

// Saves the review, then re-runs the rubric check on what was saved, so the check always matches the stored draft.
async function recheckRubric(button) {
  const form = document.querySelector('#dataset-review-form');
  const dataset = workspace.datasets.find(item => item.id === reviewingDatasetId);
  if (!form || !dataset) return;
  button.disabled = true;
  button.textContent = 'Saving and checking…';
  try {
    await persistDatasetReview(form, dataset);
    const response = await fetch(`/api/datasets/${dataset.id}/recheck-rubric`, { method: 'POST' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    workspace.datasets = workspace.datasets.map(item => (item.id === body.id ? body : item));
    render('datasets');
    toast(
      body.rubricCheck?.error ? 'The rubric check could not run. Try again.' : 'Review saved and rubric re-checked.',
    );
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Re-check rubric';
    toast(error.message || 'The rubric could not be re-checked.');
  }
}

async function persistDatasetReview(form, dataset) {
  const response = await fetch(`/api/datasets/${dataset.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cases: reviewedCases(form, dataset), keptRubricPoints: keptRubricPoints(dataset) }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  workspace.datasets = workspace.datasets.map(item => (item.id === body.id ? body : item));
  return body;
}

// Shows one scenario in place; all scenarios stay in the form so Save and Approve read every field.
function showReviewScenario(index) {
  const cards = [...document.querySelectorAll('.review-case')];
  if (!cards.length) return;
  reviewScenarioIndex = Math.min(Math.max(index, 0), cards.length - 1);
  cards.forEach((card, position) => {
    card.hidden = position !== reviewScenarioIndex;
  });
  document.querySelectorAll('.js-review-pick').forEach(item => {
    if (Number(item.dataset.index) === reviewScenarioIndex) {
      item.setAttribute('aria-current', 'true');
      item.scrollIntoView({ block: 'nearest' });
    } else item.removeAttribute('aria-current');
  });
  const position = document.querySelector('#review-position');
  if (position) position.textContent = `Scenario ${reviewScenarioIndex + 1} of ${cards.length}`;
  document.querySelectorAll('.js-review-step').forEach(button => {
    const step = Number(button.dataset.step);
    button.disabled = step < 0 ? reviewScenarioIndex === 0 : reviewScenarioIndex === cards.length - 1;
  });
  const detail = document.querySelector('.review-detail');
  if (detail && detail.getBoundingClientRect().top < 0) detail.scrollIntoView({ block: 'start' });
}
function refreshReviewListItem(index) {
  const item = document.querySelector(`.js-review-pick[data-index="${index}"]`);
  const form = document.querySelector('#dataset-review-form');
  if (!item || !form) return;
  const value = field => form.querySelector(`[data-field="${field}"][data-index="${index}"]`)?.value || '';
  let turns = [];
  try {
    turns = value('turns').trim() ? JSON.parse(value('turns')) : [];
  } catch {}
  const draft = {
    question: value('question'),
    expectedAnswer: value('expectedAnswer'),
    sourceEvidence: value('sourceEvidence'),
    turns: Array.isArray(turns) ? turns : [],
    ...(value('caseType') === 'decline' ? { caseType: 'decline' } : {}),
  };
  item.querySelector('.review-list-text').textContent = reviewScenarioLabel(draft);
  const flag = item.querySelector('.review-list-flag');
  const incomplete = reviewScenarioIncomplete(draft);
  if (incomplete && !flag)
    item.insertAdjacentHTML(
      'beforeend',
      '<span class="review-list-flag" title="Question, expected answer, or source evidence is empty">Needs input</span>',
    );
  if (!incomplete && flag) flag.remove();
}
function addDatasetScenario() {
  const dataset = workspace.datasets.find(item => item.id === reviewingDatasetId);
  dataset.cases.push({
    question: '',
    expectedAnswer: '',
    requiredPoints: [],
    forbiddenPoints: [],
    sourceEvidence: '',
    turns: [],
    expectedFinalMemory: [],
  });
  reviewScenarioIndex = dataset.cases.length - 1;
  render('datasets');
}

function deleteDatasetScenario(index) {
  const dataset = workspace.datasets.find(item => item.id === reviewingDatasetId);
  if (dataset.cases.length < 2) return;
  dataset.cases.splice(index, 1);
  if (reviewScenarioIndex >= index && reviewScenarioIndex > 0) reviewScenarioIndex -= 1;
  render('datasets');
}

async function saveDatasetReview(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const dataset = workspace.datasets.find(item => item.id === reviewingDatasetId);
  const submit = form.querySelector('button[type="submit"]');
  const note = document.querySelector('#review-status');
  submit.disabled = true;
  submit.textContent = 'Saving…';
  note.textContent = 'Saving your reviewed scenarios.';
  try {
    await persistDatasetReview(form, dataset);
    render('datasets');
    toast('Review changes saved.');
  } catch (error) {
    submit.disabled = false;
    submit.textContent = 'Save changes';
    note.textContent = error.message || 'Changes could not be saved.';
  }
}

async function approveDataset(id) {
  const form = document.querySelector('#dataset-review-form');
  const button = document.querySelector('.js-approve');
  const note = document.querySelector('#review-status');
  try {
    if (form) {
      button.disabled = true;
      button.textContent = 'Saving and approving…';
      note.textContent = 'Saving your reviewed answers, then approving the benchmark.';
      await persistDatasetReview(
        form,
        workspace.datasets.find(item => item.id === id),
      );
    }
    const response = await fetch(`/api/datasets/${id}/approve`, { method: 'POST' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    workspace.datasets = workspace.datasets.map(item => (item.id === body.id ? body : item));
    render('datasets');
    toast('Golden dataset approved.');
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = 'Save & approve';
    }
    if (note) note.textContent = error.message || 'Dataset approval failed.';
    else toast(error.message || 'Dataset approval failed.');
  }
}

async function askCustomerAgent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = document.querySelector('#customer-question');
  const question = input.value.trim();
  if (!question) return;
  input.value = '';
  render('chat');
  const output = document.querySelector('#chat-messages');
  output.insertAdjacentHTML(
    'beforeend',
    `<article class="message user"><span class="who">You</span><div class="bubble">${escapeHtml(question)}</div></article><article class="message agent"><span class="who">Support agent</span><div class="bubble is-thinking" role="status" aria-label="Thinking"><span></span><span></span><span></span></div></article>`,
  );
  output.scrollTop = output.scrollHeight;
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: document.querySelector('#chat-document').value,
        connectionId: document.querySelector('#chat-target').value,
        question,
        chatId: activeChatId,
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    activeChatId = body.chat.id;
    workspace.chats = [body.chat, ...workspace.chats.filter(item => item.id !== body.chat.id)];
    const technicalDocument = workspace.technicalDocuments.find(item => item.id === body.chat.documentId);
    if (technicalDocument) technicalDocument.retrieval = { status: 'ready' };
  } catch (error) {
    toast(error.message || 'Customer chat failed.');
  }
  render('chat');
  const messages = document.querySelector('#chat-messages');
  messages.scrollTop = messages.scrollHeight;
  document.querySelector('#customer-question')?.focus();
}

async function runEvaluation(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const help = form.querySelector('.help');
  button.disabled = true;
  button.textContent = 'Running evaluation…';
  help.textContent = 'Checking each scenario. This can take a minute.';
  try {
    const datasetId = document.querySelector('#evaluation-dataset').value;
    const targetConnectionId = document.querySelector('#evaluation-target').value;
    const controlConnectionId = document.querySelector('#evaluation-control').value;
    const target = workspace.connections.find(connection => connection.id === targetConnectionId);
    if (target?.kind === 'flexagent-livekit')
      return await runLiveKitEvaluation(datasetId, targetConnectionId, controlConnectionId, button, help);
    const response = await fetch('/api/evaluations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datasetId, targetConnectionId, controlConnectionId }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    workspace.evaluations.unshift(body);
    viewingEvaluationId = body.id;
    render('results');
    toast('Evaluation completed.');
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Run evaluation';
    toast(error.message || 'Evaluation failed.');
  }
}

async function runManualEvaluation(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const help = form.querySelector('.help');
  button.disabled = true;
  button.textContent = 'Scoring pasted answers…';
  help.textContent = 'The control model is judging the pasted replies.';
  try {
    const response = await fetch('/api/evaluations/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        datasetId: form.dataset.datasetId,
        controlConnectionId: form.elements.controlConnectionId.value,
        answers: [...form.querySelectorAll('[name="answer"]')].map(input => input.value.trim()),
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    workspace.evaluations.unshift(body);
    viewingEvaluationId = body.id;
    render('results');
    toast('Pasted answers scored.');
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Score pasted answers';
    help.textContent = error.message || 'Pasted answers could not be scored.';
  }
}

function downloadEvaluationReport() {
  const evaluation =
    workspace.evaluations.find(item => item.id === viewingEvaluationId && inSelectedWorkspace(item)) ||
    workspace.evaluations.find(inSelectedWorkspace);
  const dataset = workspace.datasets.find(item => item.id === evaluation?.datasetId);
  const source = allDocuments().find(item => item.id === dataset?.documentId);
  if (!evaluation || !dataset) return;
  const result = item =>
    `<article>${isDecline(item.case) ? '<p><b>Should decline</b></p>' : ''}<h2>${escapeHtml(item.case.question)}</h2><p class="verdict ${item.pass ? 'pass' : 'gap'}">${item.pass ? 'PASS' : 'GAP'} · ${escapeHtml(item.score)}%</p>${incompleteAnswerNote(item)}${gapDiagnosisMarkup(item)}<h3>Tested agent’s answer</h3><p>${escapeHtml(item.answer)}</p><h3>Expected answer</h3><p>${escapeHtml(item.case.expectedAnswer)}</p><h3>${isDecline(item.case) ? 'Nearby passage' : 'Source evidence'}</h3><p>${escapeHtml(item.case.sourceEvidence)}</p>${item.case.sourceUrl ? `<p>${sourceLink(item.case.sourceUrl, ' rel="noreferrer"')}</p>` : ''}<h3>Required points</h3><ul>${(item.case.requiredPoints || []).map(point => `<li>${escapeHtml(point)}</li>`).join('') || '<li>None</li>'}</ul><h3>Forbidden points</h3><ul>${(item.case.forbiddenPoints || []).map(point => `<li>${escapeHtml(point)}</li>`).join('') || '<li>None</li>'}</ul><h3>Rationale</h3><p>${escapeHtml(item.rationale || 'No rationale returned.')}</p></article>`;
  const report = `<!doctype html><html><head><meta charset="utf-8"><title>Evaluation report</title><style>body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;color:#182338;line-height:1.5}header,article{border-bottom:1px solid #d8dee8;padding:0 0 24px;margin-bottom:28px}h1{margin-bottom:4px}h2{font-size:18px}h3{font-size:14px;margin-bottom:4px}p{white-space:pre-wrap}.score{font-size:32px;font-weight:700}.verdict{font-weight:700}.pass{color:#087443}.gap{color:#b42318}.evaluation-incomplete{background:#fff7e8;border:1px solid #f0dcb4;padding:12px 16px;margin:0 0 20px}.evaluation-incomplete p{margin:4px 0}.result-incomplete{background:#fff7e8;border-left:3px solid #c98a1b;padding:12px 16px;margin:16px 0}.coverage{border-left:3px solid #6b8f84;padding:10px 16px;margin:0 0 20px}.coverage ul{padding-left:18px}.coverage li span+span{color:#586b66;margin-left:8px}.coverage .is-untested{color:#8b6419}.evaluation-decline{background:#f4f6fc;border-left:3px solid #5566b8;padding:12px 16px;margin:0 0 20px}.evaluation-decline p{margin:4px 0}.gap-diagnosis{background:#fff5f2;border-left:3px solid #b42318;padding:12px 16px;margin:16px 0}.gap-diagnosis h3{margin:0 0 8px}.gap-diagnosis p{margin:6px 0}.gap-diagnosis small{color:#684b45}.evaluation-diagnosis{background:#f4f8f6;border:1px solid #d8e7df;padding:20px;margin:0 0 28px;break-inside:avoid}.evaluation-diagnosis h2{margin:5px 0 8px}.evaluation-diagnosis ol{padding-left:22px}.evaluation-diagnosis li{margin:8px 0}.evaluation-diagnosis-counts{display:flex;gap:18px;flex-wrap:wrap;font-size:13px}.evaluation-diagnosis-counts b{font-size:18px}.evaluation-diagnosis-limit{color:#586b66;font-size:12px}@media print{body{margin:20px;max-width:none}article{break-inside:avoid}}</style></head><body><header><h1>Evaluation report</h1><p>${escapeHtml(source?.name || 'Source document')} · ${escapeHtml(new Date(evaluation.createdAt).toLocaleString())}</p><p class="score">${escapeHtml(evaluation.score)}%</p>${subScoresLabel(evaluation) ? `<p>${escapeHtml(subScoresLabel(evaluation))}</p>` : ''}<p>${escapeHtml(judgeSettingsLabel(evaluation.judge))}</p>${verityLabel(evaluation.verity) ? `<p>${escapeHtml(verityLabel(evaluation.verity))}</p>` : ''}<p>${evaluation.manual ? 'The tested agent’s answers were pasted from a manual test.' : 'The tested agent’s answers were generated through the configured model connection.'}</p></header>${coverageMarkup(dataset.coverage)}${evaluationSummaryMarkup(evaluation)}${evaluation.results.map(result).join('')}</body></html>`;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([report], { type: 'text/html' }));
  link.download = `evaluation-report-${evaluation.createdAt.slice(0, 10)}.html`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => HTML_ESCAPES[character]);
}
function safeHttpUrl(value) {
  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}
function sourceLink(value, attributes = '') {
  const href = safeHttpUrl(value);
  return href ? `<a href="${escapeHtml(href)}"${attributes}>${escapeHtml(value)}</a>` : escapeHtml(value);
}

async function loadWorkspace() {
  try {
    const response = await fetch('/api/state');
    if (response.ok) {
      workspace = await response.json();
      if (!viewScope && workspace.flexAgentSession?.orgId)
        viewScope = {
          orgId: workspace.flexAgentSession.orgId,
          agentId: workspace.flexAgentSession.selectedAgentId || null,
        };
    }
  } catch {
    /* The static preview is allowed before the local server starts. */
  }
}

function toast(message) {
  const element = document.querySelector('#toast');
  element.textContent = message;
  element.classList.add('show');
  setTimeout(() => element.classList.remove('show'), 3100);
}
window.addEventListener('hashchange', () => render());
// Out-of-date page check: the page notes the version it started with and offers a reload once the server or page files change.
let loadedVersion = null;
function versionChanged(loaded, current) {
  return (
    Boolean(loaded && current) &&
    (loaded.startedAt !== current.startedAt || loaded.pageUpdatedAt !== current.pageUpdatedAt)
  );
}
async function checkForNewVersion() {
  try {
    const current = await fetch('/api/version', { cache: 'no-store' }).then(response => response.json());
    if (!loadedVersion) {
      loadedVersion = current;
      return;
    }
    if (!versionChanged(loadedVersion, current) || document.querySelector('#update-banner')) return;
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div id="update-banner" class="update-banner" role="status">Verity was updated. Reload to use the latest version. <button class="button button-primary button-small" type="button">Reload</button></div>',
    );
    document.querySelector('#update-banner button').addEventListener('click', () => location.reload());
  } catch {}
}
checkForNewVersion();
setInterval(checkForNewVersion, 60000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForNewVersion();
});
loadWorkspace().finally(() => {
  render();
  if (workspace.flexAgentSession?.connected) loadFlexAgentOrganizations(false);
});
