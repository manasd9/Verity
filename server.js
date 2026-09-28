const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');
const DEFAULT_TARGET_PROMPT = 'Follow the policy document. Do not invent information. If it does not answer the question, say so clearly.';

const root = __dirname;
const dataDir = path.join(root, 'data');
const storePath = path.join(dataDir, 'store.json');
const envPath = path.join(root, '.env');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const [key, ...value] = line.split('=');
    if (key && value.length && !process.env[key]) process.env[key] = value.join('=').trim();
  }
}
if (!process.env.APP_ENCRYPTION_KEY) {
  process.env.APP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(envPath, `APP_ENCRYPTION_KEY=${process.env.APP_ENCRYPTION_KEY}\nPORT=4173\n`);
  console.warn('Created .env with a local encryption key. Keep this file private.');
}
const key = Buffer.from(process.env.APP_ENCRYPTION_KEY, 'hex');
if (key.length !== 32) throw new Error('APP_ENCRYPTION_KEY must be 64 hexadecimal characters.');

function readStore() {
  const empty = { documents: [], technicalDocuments: [], chunks: [], chatChunks: [], connections: [], datasets: [], evaluations: [], chats: [], agentConfigs: [] };
  if (!fs.existsSync(storePath)) return empty;
  const store = { ...empty, ...JSON.parse(fs.readFileSync(storePath, 'utf8')) };
  store.documents = store.documents.map(document => ({ ...document, kind: 'policy' }));
  store.technicalDocuments = store.technicalDocuments.map(document => ({ ...document, kind: 'technical' }));
  store.chunks = store.chunks.map(chunk => ({ ...chunk, documentKind: chunk.documentKind || (store.technicalDocuments.some(document => document.id === chunk.documentId) ? 'technical' : 'policy') }));
  store.chats = store.chats.map(normalizeChat);
  store.evaluations = store.evaluations.map(evaluation => ({ ...evaluation, results: evaluation.results.map(result => result.pass ? result : { ...result, gapDiagnosis: result.turns ? multiTurnGapDiagnosis(result.turns, result.memoryVerdict || { pass: true, missing: [] }) : gapDiagnosisForVerdict(result, result.case) }) }));
  return store;
}
function saveStore(store) { fs.writeFileSync(storePath, JSON.stringify(store, null, 2)); }
function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function normalizeChat(chat) {
  const messages = (chat.messages || []).map((message, index) => ({
    ...message,
    id: message.id || `msg_legacy_${crypto.createHash('sha256').update(`${chat.id}:${index}:${message.role}:${message.content}`).digest('hex').slice(0, 16)}`,
    createdAt: message.createdAt || chat.createdAt,
  }));
  return { ...chat, messages, surveyMemory: chat.surveyMemory || { version: 1, facts: [] } };
}
function appendChatMessage(chat, role, content, createdAt = new Date().toISOString()) {
  if (!['user', 'assistant'].includes(role) || !String(content || '').trim()) throw new Error('A chat message needs a valid role and content.');
  return { ...chat, messages: [...(chat.messages || []), { id: id('msg'), role, content: String(content).trim(), createdAt }] };
}
function appendSurveyFacts(chat, facts, createdAt = new Date().toISOString()) {
  if (!Array.isArray(facts)) throw new Error('Survey facts must be an array.');
  const sourceIds = new Set((chat.messages || []).map(message => message.id));
  const previous = chat.surveyMemory?.facts || [];
  const previousIds = new Set(previous.map(fact => fact.id));
  const allowedKinds = new Set(['explicit', 'inferred']);
  const allowedStatuses = new Set(['active', 'superseded', 'unresolved']);
  const additions = facts.map((fact, index) => {
    if (!allowedKinds.has(fact?.kind) || !String(fact.value || '').trim() || !sourceIds.has(fact.sourceMessageId) || !allowedStatuses.has(fact.status)) throw new Error('Every survey fact needs a valid kind, value, source message, and status.');
    if (fact.supersedes && !previousIds.has(fact.supersedes)) throw new Error('A survey fact can only supersede an existing fact.');
    return { id: `memory_${previous.length + index + 1}`, kind: fact.kind, value: String(fact.value).trim(), sourceMessageId: fact.sourceMessageId, status: fact.status, ...(fact.supersedes ? { supersedes: fact.supersedes } : {}), createdAt };
  });
  const superseded = new Set(additions.map(fact => fact.supersedes).filter(Boolean));
  return { ...chat, surveyMemory: { version: 1, facts: [...previous.map(fact => superseded.has(fact.id) ? { ...fact, status: 'superseded' } : fact), ...additions] } };
}
function encrypt(value) {
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  return { iv: iv.toString('base64'), tag: Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]).toString('base64'), authTag: cipher.getAuthTag().toString('base64') };
}
function decrypt(secret) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(secret.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(secret.authTag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(secret.tag, 'base64')), decipher.final()]).toString('utf8');
}
function publicConnection(connection) { const { secret, ...safe } = connection; return safe; }
function publicDocument(document, chunks = []) { const { text, ...safe } = document; return { ...safe, retrieval: { status: chunks.some(item => item.documentId === document.id) ? 'ready' : 'unavailable' } }; }
function agentPrompt(store, documentId, connection) { return store.agentConfigs.find(item => item.documentId === documentId && item.connectionId === connection.id)?.systemPrompt || connection.systemPrompt || DEFAULT_TARGET_PROMPT; }
function hasSourceEvidence(source, evidence) { const excerpt = String(evidence || '').replace(/\s+/g, ' ').trim(); return Boolean(excerpt) && String(source || '').replace(/\s+/g, ' ').includes(excerpt); }
function sourceIndexedCases(raw, sources) {
  const cases = JSON.parse(raw).cases;
  if (!Array.isArray(cases)) throw new Error('The control model did not return a scenario list. Please try again.');
  return cases.filter(item => Number.isInteger(Number(item.sourceIndex)) && Number(item.sourceIndex) > 0 && Number(item.sourceIndex) <= sources.length)
    .map(item => normalizeDatasetCase({ ...item, sourceEvidence: sources[Number(item.sourceIndex) - 1].text }));
}
function normalizeDatasetCase(item) {
  const text = value => String(value || '').trim();
  const points = value => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
  if (item.turns !== undefined && !Array.isArray(item.turns)) throw new Error('Conversation turns must be an array.');
  const turns = (item.turns || []).map(turn => {
    const userMessage = text(turn.userMessage);
    if (!userMessage) throw new Error('Every conversation turn needs a user message.');
    return { userMessage, expectedAnswer: text(turn.expectedAnswer), requiredPoints: points(turn.requiredPoints), forbiddenPoints: points(turn.forbiddenPoints), sourceEvidence: text(turn.sourceEvidence) };
  });
  if (item.expectedFinalMemory !== undefined && !Array.isArray(item.expectedFinalMemory)) throw new Error('Expected final memory must be an array.');
  const expectedFinalMemory = (item.expectedFinalMemory || []).map(text).filter(Boolean);
  const normalized = { question: text(item.question), expectedAnswer: text(item.expectedAnswer), requiredPoints: points(item.requiredPoints), forbiddenPoints: points(item.forbiddenPoints), sourceEvidence: text(item.sourceEvidence), turns, expectedFinalMemory };
  if (!turns.length && (!normalized.question || !normalized.expectedAnswer || !normalized.sourceEvidence)) throw new Error('Each single-turn scenario needs a question, expected answer, and policy evidence.');
  return normalized;
}
function evaluationTurns(item) {
  return item.turns?.length ? item.turns : [{ userMessage: item.question, expectedAnswer: item.expectedAnswer, requiredPoints: item.requiredPoints, forbiddenPoints: item.forbiddenPoints, sourceEvidence: item.sourceEvidence }];
}
function scoreExpectedMemory(expected, surveyMemory) {
  const values = new Set((surveyMemory?.facts || []).filter(fact => fact.status === 'active').map(fact => fact.value.toLowerCase()));
  const missing = expected.filter(value => !values.has(value.toLowerCase()));
  return { pass: !missing.length, missing };
}
function gapDiagnosisForVerdict(verdict, rubric = {}) {
  if (verdict.pass) return undefined;
  const total = rubric.requiredPoints?.length || 0;
  const missing = Math.min(verdict.missingPoints?.length || 0, total);
  const unsupported = Boolean(verdict.forbiddenClaims?.length);
  const coverage = total && missing / total >= 0.75 ? 'Likely retrieval miss' : missing ? 'Partial retrieval coverage' : 'Answer grounding gap';
  const categories = [coverage, ...(unsupported ? ['Unsupported or conflicting answer'] : [])];
  const why = total ? `The answer misses ${missing} of ${total} required rubric points${unsupported ? ' and includes an unsupported or conflicting claim' : ''}.` : `The answer does not satisfy the rubric${unsupported ? ' and includes an unsupported or conflicting claim' : ''}.`;
  const focus = coverage === 'Likely retrieval miss'
    ? 'Check whether the expected source evidence appears in the top retrieved chunks for this question.'
    : coverage === 'Partial retrieval coverage'
      ? 'Check whether all required evidence reaches the final model context for this question.'
      : 'Check whether the answer is supported by the context supplied to the agent.';
  return { categories, why, teamFocus: `${focus}${unsupported && coverage !== 'Answer grounding gap' ? ' Check whether the extra claim is supported by a retrieved chunk.' : ''}` };
}
function parseScoredVerdict(raw) {
  const verdict = JSON.parse(raw);
  if (!verdict || typeof verdict.pass !== 'boolean' || !['number', 'string'].includes(typeof verdict.score) || String(verdict.score).trim() === '' || !Number.isFinite(Number(verdict.score)) || Number(verdict.score) < 0 || Number(verdict.score) > 100) throw new Error('Control model returned an invalid evaluation verdict.');
  verdict.score = Number(verdict.score);
  verdict.missingPoints = Array.isArray(verdict.missingPoints) ? verdict.missingPoints : [];
  verdict.forbiddenClaims = Array.isArray(verdict.forbiddenClaims) ? verdict.forbiddenClaims : [];
  verdict.rationale = typeof verdict.rationale === 'string' ? verdict.rationale : '';
  delete verdict.gapDiagnosis;
  return verdict;
}
async function scoreAnswer(control, answer, rubric) {
  const schema = { score: '0-100 number', pass: 'boolean', missingPoints: 'string[] (one entry for each substantially missed required rubric point)', forbiddenClaims: 'string[]', rationale: 'string' };
  const messages = [{ role: 'system', content: 'Judge answers strictly against the supplied rubric. Return JSON only. Put one entry in missingPoints for each substantially missed required point; do not combine points. List unsupported or conflicting claims in forbiddenClaims. The score is an overall judgment, not a count of covered points.' }, { role: 'user', content: JSON.stringify({ answer, rubric, schema }) }];
  const verdict = parseScoredVerdict(await callModel(control, messages, true));
  return { ...verdict, ...(!verdict.pass ? { gapDiagnosis: gapDiagnosisForVerdict(verdict, rubric) } : {}) };
}
function multiTurnGapDiagnosis(turnResults, memoryVerdict) {
  const failedTurn = turnResults.find(turn => !turn.pass);
  const failed = failedTurn && gapDiagnosisForVerdict(failedTurn, failedTurn.turn);
  if (memoryVerdict.pass) return failed;
  return {
    categories: [...new Set([...(failed?.categories || []), 'Conversation memory gap'])],
    why: `${failed?.why ? `${failed.why} ` : ''}The final response omits ${memoryVerdict.missing.length} expected conversation detail(s).`,
    teamFocus: `${failed?.teamFocus ? `${failed.teamFocus} ` : ''}Inspect how earlier turns are retrieved and included in the final prompt context.`,
  };
}
async function extractText(file) {
  const extension = path.extname(file.originalname).toLowerCase();
  if (extension === '.docx') return (await mammoth.extractRawText({ buffer: file.buffer })).value;
  if (extension === '.pdf') { const parser = new PDFParse({ data: file.buffer }); try { return (await parser.getText()).text; } finally { await parser.destroy(); } }
  if (extension === '.txt') return file.buffer.toString('utf8');
  throw new Error('Only PDF, DOCX, and TXT files are supported.');
}
async function callModel(connection, messages, json = false) {
  const base = connection.baseUrl.replace(/\/$/, '');
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${decrypt(connection.secret)}` },
    body: JSON.stringify({ model: connection.model, messages, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
  });
  if (!response.ok) throw new Error(`Model request failed: ${response.status} ${await response.text()}`);
  const body = await response.json();
  return body.choices?.[0]?.message?.content || '';
}
function parseSurveyFacts(raw) {
  const facts = JSON.parse(raw).facts;
  if (!Array.isArray(facts)) throw new Error('Survey-memory extraction must return a facts array.');
  return facts;
}
function parseTechnicalAnalysis(raw, sourceText) {
  const value = JSON.parse(raw); const text = item => String(item || '').trim(); const list = (items, fields, required) => {
    if (!Array.isArray(items)) throw new Error('Technical analysis contains an invalid list.');
    return items.slice(0, 40).map(item => {
      if (!item || typeof item !== 'object') throw new Error('Technical analysis contains an invalid item.');
      const result = Object.fromEntries(fields.map(field => [field, text(item[field])]).filter(([, itemValue]) => itemValue));
      if (!required.every(field => result[field])) throw new Error('Technical analysis is missing required detail.');
      if (!hasSourceEvidence(sourceText, result.sourceEvidence)) throw new Error('Technical analysis must use exact source evidence from the document.');
      return result;
    });
  };
  if (!value || typeof value !== 'object' || !value.overview || typeof value.overview !== 'object') throw new Error('Technical analysis needs an overview.');
  const overview = {
    purpose: text(value.overview.purpose),
    systems: Array.isArray(value.overview.systems) ? value.overview.systems.map(text).filter(Boolean).slice(0, 20) : [],
    keyRules: Array.isArray(value.overview.keyRules) ? value.overview.keyRules.map(text).filter(Boolean).slice(0, 20) : [],
    unknowns: Array.isArray(value.overview.unknowns) ? value.overview.unknowns.map(text).filter(Boolean).slice(0, 20) : [], sourceEvidence: text(value.overview.sourceEvidence),
  };
  if (!overview.purpose || !hasSourceEvidence(sourceText, overview.sourceEvidence)) throw new Error('Technical analysis needs source-grounded overview evidence.');
  return { overview, flows: list(value.flows, ['trigger', 'action', 'result', 'branch', 'sourceEvidence'], ['trigger', 'action', 'result', 'sourceEvidence']), catalog: list(value.catalog, ['name', 'purpose', 'whenToCall', 'inputs', 'outputs', 'dependencies', 'sourceEvidence'], ['name', 'purpose', 'whenToCall', 'sourceEvidence']), examples: list(value.examples, ['input', 'output', 'sourceEvidence'], ['input', 'output', 'sourceEvidence']) };
}
async function analyzeTechnicalDocument(control, text) {
  const prompt = `Map this technical document without inventing details. Return JSON only: {"overview":{"purpose":"","systems":[""],"keyRules":[""],"unknowns":[""],"sourceEvidence":"exact excerpt from source"},"flows":[{"trigger":"","action":"","result":"","branch":"optional","sourceEvidence":"exact excerpt from source"}],"catalog":[{"name":"","purpose":"","whenToCall":"","inputs":"","outputs":"","dependencies":"","sourceEvidence":"exact excerpt from source"}],"examples":[{"input":"","output":"","sourceEvidence":"exact excerpt from source"}]}. Include only findings supported by the document. Source evidence must be an exact, non-empty excerpt from the source.\n\n${text}`;
  return parseTechnicalAnalysis(await callModel(control, [{ role: 'system', content: 'You create precise, source-grounded technical blueprints for mixed technical and non-technical audiences.' }, { role: 'user', content: prompt }], true), text);
}
async function extractSurveyFacts(control, chat) {
  const raw = await callModel(control, [{ role: 'system', content: 'Extract only new, source-grounded survey facts. Return JSON only: {"facts":[{"kind":"explicit|inferred","value":"","sourceMessageId":"","status":"active|superseded|unresolved","supersedes":"optional memory ID"}]}. Never invent a source message ID. Mark user statements explicit; mark conclusions inferred.' }, { role: 'user', content: JSON.stringify({ messages: chat.messages, existingFacts: chat.surveyMemory?.facts || [] }) }], true);
  return parseSurveyFacts(raw);
}
function flexAgentRequest(target, question) {
  return {
    url: `${target.baseUrl.replace(/\/$/, '')}/v1/evaluation/answer`,
    body: { orgId: target.orgId, agentId: target.agentId, question }
  };
}
function flexAgentWidgetTokenRequest(target) {
  return {
    url: `${target.baseUrl.replace(/\/$/, '')}/v1/livekit/token`,
    body: { orgId: target.orgId, agentId: target.agentId, parentOrigin: target.parentOrigin }
  };
}
async function callFlexAgent(target, question) {
  const request = flexAgentRequest(target, question);
  const response = await fetch(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${decrypt(target.secret)}` },
    body: JSON.stringify(request.body)
  });
  if (!response.ok) throw new Error(`FlexAgent request failed (${response.status}).`);
  const body = await response.json();
  if (typeof body.answer !== 'string' || !body.answer.trim()) throw new Error('FlexAgent returned an empty answer.');
  return body.answer;
}
function chunkText(text, size = 1000, overlap = 180) {
  const chunks = []; let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf('. ', end), text.lastIndexOf(' ', end));
      if (boundary > start + Math.floor(size / 2)) end = boundary + (text[boundary] === '.' ? 1 : 0);
    }
    const content = text.slice(start, end).trim();
    if (content) chunks.push({ index: chunks.length, start, end, text: content });
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}
function chunkTechnicalText(text, size = 1400, overlap = 180) {
  const sections = text.split(/(?=^#{1,6}\s+|^[A-Z][A-Z0-9 /&()_-]{2,}:?\s*$)/m).map(section => section.trim()).filter(Boolean);
  const chunks = [];
  for (const section of sections.length ? sections : [text]) {
    if (section.length <= size) chunks.push(section);
    else chunks.push(...chunkText(section, size, overlap).map(chunk => chunk.text));
  }
  return chunks.map((text, index) => ({ index, start: 0, end: text.length, text }));
}
function cosineSimilarity(a, b) {
  let dot = 0; let aLength = 0; let bLength = 0;
  for (let index = 0; index < a.length && index < b.length; index += 1) { dot += a[index] * b[index]; aLength += a[index] ** 2; bLength += b[index] ** 2; }
  return aLength && bLength ? dot / Math.sqrt(aLength * bLength) : 0;
}
function retrieveChunks(chunks, documentId, vector, limit = 5, documentKind) {
  return chunks.filter(item => item.documentId === documentId && (!documentKind || item.documentKind === documentKind)).map(item => ({ ...item, score: cosineSimilarity(vector, item.vector) })).sort((a, b) => b.score - a.score).slice(0, limit);
}
function retrieveChatChunks(chunks, chatId, vector, limit = 5) {
  return chunks.filter(item => item.chatId === chatId).map(item => ({ ...item, score: cosineSimilarity(vector, item.vector) })).sort((a, b) => b.score - a.score).slice(0, limit);
}
function chatChunksForMessages(chat, documentId, messages, vectors, createdAt = new Date().toISOString()) {
  if (messages.length !== vectors.length) throw new Error('Each chat message needs one embedding.');
  return messages.map((message, index) => ({ id: id('chat_chunk'), documentId, chatId: chat.id, messageId: message.id, text: message.content, vector: vectors[index], createdAt }));
}
function surveyMemoryContext(chat) {
  const facts = chat.surveyMemory?.facts || [];
  const format = kind => facts.filter(fact => fact.kind === kind).map(fact => `- ${fact.value} (source ${fact.sourceMessageId}; ${fact.status})`).join('\n') || '- None recorded.';
  return `EXPLICIT SURVEY MEMORY:\n${format('explicit')}\n\nINFERRED SURVEY MEMORY:\n${format('inferred')}`;
}
function targetChatMessages(prompt, policyChunks, chat, historyChunks) {
  const history = historyChunks.map(chunk => `- ${chunk.text}`).join('\n') || '- None retrieved.';
  return [{ role: 'system', content: `${prompt}\n\nRETRIEVED POLICY SECTIONS:\n${policyContext(policyChunks)}\n\n${surveyMemoryContext(chat)}\n\nRELEVANT EARLIER CONVERSATION:\n${history}` }, ...chat.messages.slice(-20).map(message => ({ role: message.role, content: message.content.slice(0, 8000) }))];
}
function technicalTargetMessages(prompt, chunks, question) {
  return [{ role: 'system', content: `${prompt}\n\nAnswer only from the retrieved technical sections. If the document does not support the answer, say so clearly.\n\nRETRIEVED TECHNICAL SECTIONS:\n${policyContext(chunks)}` }, { role: 'user', content: question }];
}
function resolveDocument(store, documentId) {
  const policy = store.documents.find(item => item.id === documentId);
  if (policy) return policy;
  return store.technicalDocuments.find(item => item.id === documentId);
}
function removeDocumentData(store, documentId) {
  const document = store.documents.find(item => item.id === documentId);
  if (!document) return false;
  const datasetIds = new Set(store.datasets.filter(item => item.documentId === document.id).map(item => item.id));
  store.documents = store.documents.filter(item => item.id !== document.id);
  store.chunks = store.chunks.filter(item => item.documentId !== document.id);
  store.datasets = store.datasets.filter(item => item.documentId !== document.id);
  store.evaluations = store.evaluations.filter(item => !datasetIds.has(item.datasetId));
  store.chats = store.chats.filter(item => item.documentId !== document.id);
  store.chatChunks = (store.chatChunks || []).filter(item => item.documentId !== document.id);
  store.agentConfigs = store.agentConfigs.filter(item => item.documentId !== document.id);
  return true;
}
function removeTechnicalDocumentData(store, documentId) {
  const document = store.technicalDocuments.find(item => item.id === documentId);
  if (!document) return false;
  const datasetIds = new Set(store.datasets.filter(item => item.documentId === documentId).map(item => item.id));
  store.technicalDocuments = store.technicalDocuments.filter(item => item.id !== documentId);
  store.chunks = store.chunks.filter(item => item.documentId !== documentId);
  store.datasets = store.datasets.filter(item => item.documentId !== documentId);
  store.evaluations = store.evaluations.filter(item => !datasetIds.has(item.datasetId));
  store.chats = store.chats.filter(item => item.documentId !== documentId);
  store.chatChunks = (store.chatChunks || []).filter(item => item.documentId !== documentId);
  store.agentConfigs = store.agentConfigs.filter(item => item.documentId !== documentId);
  return true;
}
function openAIControlConnection(store) { return store.connections.find(item => item.role === 'control' && new URL(item.baseUrl).hostname === 'api.openai.com'); }
async function embed(connection, input) {
  const response = await fetch(`${connection.baseUrl.replace(/\/$/, '')}/embeddings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${decrypt(connection.secret)}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input }),
  });
  if (!response.ok) throw new Error(`Embedding request failed: ${response.status} ${await response.text()}`);
  const body = await response.json();
  return body.data.map(item => item.embedding);
}
async function embedAll(connection, input) {
  const vectors = [];
  for (let index = 0; index < input.length; index += 100) vectors.push(...await embed(connection, input.slice(index, index + 100)));
  return vectors;
}
async function ensureTechnicalIndexed(store, document, control) {
  if (store.chunks.some(chunk => chunk.documentId === document.id && chunk.documentKind === 'technical')) return;
  const chunks = chunkTechnicalText(document.text);
  const vectors = await embedAll(control, chunks.map(chunk => chunk.text));
  if (!chunks.length || vectors.length !== chunks.length) throw new Error('Technical document indexing did not complete. Please try again.');
  store.chunks.push(...chunks.map((chunk, index) => ({ id: id('chunk'), documentId: document.id, documentKind: 'technical', ...chunk, vector: vectors[index], createdAt: new Date().toISOString() })));
  saveStore(store);
}
function policyContext(chunks) { return chunks.map((item, index) => `[Policy section ${index + 1}]\n${item.text}`).join('\n\n'); }

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
app.use(express.json({ limit: '1mb' }));
app.get('/vendor/livekit-client.js', (req, res) => res.sendFile(path.join(root, 'node_modules', 'livekit-client', 'dist', 'livekit-client.umd.js')));
app.use(express.static(root));
app.get('/api/state', (req, res) => { const store = readStore(); res.json({ documents: store.documents.map(document => publicDocument(document, store.chunks)), technicalDocuments: store.technicalDocuments.map(({ text, ...document }) => ({ ...document, retrieval: { status: store.chunks.some(chunk => chunk.documentId === document.id) ? 'ready' : 'unavailable' } })), connections: store.connections.map(publicConnection), datasets: store.datasets, evaluations: store.evaluations, chats: store.chats, agentConfigs: store.agentConfigs }); });
app.post('/api/connections', (req, res) => {
  const { name, role, baseUrl, model, apiKey } = req.body;
  if (![name, role, baseUrl, model, apiKey].every(Boolean) || !['target', 'control'].includes(role)) return res.status(400).json({ error: 'Name, role, base URL, model, and API key are required.' });
  let url; try { url = new URL(baseUrl); } catch { return res.status(400).json({ error: 'Base URL must be a valid URL.' }); }
  const store = readStore(); const connection = { id: id('conn'), name, role, baseUrl: url.toString().replace(/\/$/, ''), model, createdAt: new Date().toISOString(), secret: encrypt(apiKey) };
  store.connections.push(connection); saveStore(store); res.status(201).json(publicConnection(connection));
});
app.post('/api/flexagent-target', (req, res) => {
  const { name = 'FlexAgent target', baseUrl, serviceToken, orgId, agentId, mode = 'api' } = req.body;
  if (!['api', 'livekit'].includes(mode) || ![baseUrl, orgId, agentId].every(value => typeof value === 'string' && value.trim()) || (mode === 'api' && (!serviceToken || !serviceToken.trim()))) return res.status(400).json({ error: 'FlexAgent URL, organization ID, agent ID, and an evaluation service token for API mode are required.' });
  let url; try { url = new URL(baseUrl); } catch { return res.status(400).json({ error: 'FlexAgent URL must be a valid URL.' }); }
  if (!['http:', 'https:'].includes(url.protocol)) return res.status(400).json({ error: 'FlexAgent URL must use HTTP or HTTPS.' });
  let origin;
  if (mode === 'livekit') { try { origin = new URL(parentOrigin).origin; } catch { return res.status(400).json({ error: 'LiveKit widget mode needs the exact allowed Eval Tool origin, such as http://127.0.0.1:4173.' }); } }
  const store = readStore(); const connection = { id: id('conn'), name: name.trim() || 'FlexAgent target', role: 'target', kind: mode === 'livekit' ? 'flexagent-livekit' : 'flexagent', baseUrl: url.toString().replace(/\/$/, ''), model: mode === 'livekit' ? 'FlexAgent via LiveKit' : 'FlexAgent', orgId: orgId.trim(), agentId: agentId.trim(), ...(origin ? { parentOrigin: origin } : {}), createdAt: new Date().toISOString(), ...(mode === 'api' ? { secret: encrypt(serviceToken.trim()) } : {}) };
  store.connections.push(connection); saveStore(store); res.status(201).json(publicConnection(connection));
});
app.post('/api/flexagent-livekit-token', async (req, res, next) => {
  try {
    const target = readStore().connections.find(item => item.id === req.body.targetConnectionId && item.kind === 'flexagent-livekit');
    if (!target) throw new Error('Choose a LiveKit FlexAgent target.');
    if (req.get('origin') && req.get('origin') !== target.parentOrigin) throw new Error('This Eval Tool origin does not match the configured LiveKit widget origin.');
    const request = flexAgentWidgetTokenRequest(target);
    const response = await fetch(request.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.body) });
    if (!response.ok) throw new Error(`FlexAgent LiveKit token request failed (${response.status}).`);
    const body = await response.json();
    if (typeof body.token !== 'string' || typeof body.wsUrl !== 'string') throw new Error('FlexAgent returned an invalid LiveKit token response.');
    res.json({ token: body.token, wsUrl: body.wsUrl });
  } catch (error) { next(error); }
});
app.post('/api/openai-setup', (req, res) => {
  const { apiKey, targetModel, controlModel } = req.body;
  if (![apiKey, targetModel, controlModel].every(Boolean)) return res.status(400).json({ error: 'OpenAI API key, target model, and control model are required.' });
  Promise.all([...new Set([targetModel, controlModel])].map(async model => {
    const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!response.ok) throw new Error(`OpenAI could not verify model “${model}”. Check the model name and API key.`);
  })).then(() => {
    const store = readStore();
    const previousTarget = store.connections.find(connection => connection.name === 'Target agent');
    store.connections = store.connections.filter(connection => !['Target agent', 'Control model'].includes(connection.name));
    const secret = encrypt(apiKey);
    const connections = [
      { id: id('conn'), name: 'Target agent', role: 'target', baseUrl: 'https://api.openai.com/v1', model: targetModel, systemPrompt: previousTarget?.systemPrompt || DEFAULT_TARGET_PROMPT, createdAt: new Date().toISOString(), secret },
      { id: id('conn'), name: 'Control model', role: 'control', baseUrl: 'https://api.openai.com/v1', model: controlModel, createdAt: new Date().toISOString(), secret },
    ];
    store.connections.push(...connections); saveStore(store); res.status(201).json(connections.map(publicConnection));
  }).catch(error => res.status(400).json({ error: error.message }));
});
app.delete('/api/connections/:id', (req, res) => {
  const store = readStore(); const before = store.connections.length;
  store.connections = store.connections.filter(connection => connection.id !== req.params.id);
  if (store.connections.length === before) return res.status(404).json({ error: 'Connection not found.' });
  saveStore(store); res.status(204).end();
});
app.put('/api/connections/:id/prompt', (req, res) => {
  const store = readStore(); const connection = store.connections.find(item => item.id === req.params.id && item.role === 'target');
  const systemPrompt = String(req.body.systemPrompt || '').trim();
  if (!connection) return res.status(404).json({ error: 'Target agent not found.' });
  if (!systemPrompt || systemPrompt.length > 12000) return res.status(400).json({ error: 'Instructions must be between 1 and 12,000 characters.' });
  connection.systemPrompt = systemPrompt; connection.updatedAt = new Date().toISOString(); saveStore(store); res.json(publicConnection(connection));
});
app.put('/api/agent-configs', (req, res) => {
  const { documentId, connectionId } = req.body; const systemPrompt = String(req.body.systemPrompt || '').trim(); const store = readStore();
  if (!store.documents.some(item => item.id === documentId) || !store.connections.some(item => item.id === connectionId && item.role === 'target')) return res.status(400).json({ error: 'Choose an uploaded policy document and target agent.' });
  if (!systemPrompt || systemPrompt.length > 12000) return res.status(400).json({ error: 'Instructions must be between 1 and 12,000 characters.' });
  let config = store.agentConfigs.find(item => item.documentId === documentId && item.connectionId === connectionId);
  if (config) config.systemPrompt = systemPrompt; else { config = { id: id('agent'), documentId, connectionId, systemPrompt, createdAt: new Date().toISOString() }; store.agentConfigs.push(config); }
  config.updatedAt = new Date().toISOString(); saveStore(store); res.json(config);
});
app.post('/api/documents', upload.single('document'), async (req, res, next) => {
  try {
    if (!req.file) throw new Error('Choose a document to upload.');
    const text = (await extractText(req.file)).trim(); if (!text) throw new Error('No readable text was found in this document.');
    const store = readStore(); const document = { id: id('doc'), name: req.file.originalname, type: path.extname(req.file.originalname).slice(1).toUpperCase(), text, characters: text.length, createdAt: new Date().toISOString() };
    const control = openAIControlConnection(store);
    const chunks = chunkText(text);
    if (control) {
      const vectors = await embedAll(control, chunks.map(item => item.text));
      store.chunks.push(...chunks.map((item, index) => ({ id: id('chunk'), documentId: document.id, documentKind: 'policy', ...item, vector: vectors[index], createdAt: document.createdAt })));
    }
    store.documents.push(document); saveStore(store); res.status(201).json(publicDocument(document, store.chunks));
  } catch (error) { next(error); }
});
app.delete('/api/documents/:id', (req, res) => {
  const store = readStore();
  if (!removeDocumentData(store, req.params.id)) return res.status(404).json({ error: 'Document not found.' });
  saveStore(store); res.status(204).end();
});
app.post('/api/technical-documents', upload.single('document'), async (req, res, next) => {
  try {
    if (!req.file) throw new Error('Choose a technical document to upload.');
    const text = (await extractText(req.file)).trim(); if (!text) throw new Error('No readable text was found in this document.');
    const store = readStore(); const document = { id: id('tech'), kind: 'technical', name: req.file.originalname, type: path.extname(req.file.originalname).slice(1).toUpperCase(), text, characters: text.length, createdAt: new Date().toISOString(), analysisStatus: 'unavailable' };
    store.technicalDocuments.push(document); saveStore(store);
    const control = openAIControlConnection(store);
    if (control) {
      try {
        await ensureTechnicalIndexed(store, document, control);
        document.analysis = await analyzeTechnicalDocument(control, text); document.analysisStatus = 'ready';
      } catch (error) { document.analysisStatus = 'unavailable'; document.analysisError = error.message; }
      saveStore(store);
    }
    res.status(201).json(publicDocument(document, store.chunks));
  } catch (error) { next(error); }
});
app.delete('/api/technical-documents/:id', (req, res) => {
  const store = readStore();
  if (!removeTechnicalDocumentData(store, req.params.id)) return res.status(404).json({ error: 'Technical document not found.' });
  saveStore(store); res.status(204).end();
});
app.post('/api/chat', async (req, res, next) => {
  try {
    const { documentId, connectionId, question, chatId } = req.body;
    const store = readStore(); const document = resolveDocument(store, documentId); const connection = store.connections.find(item => item.id === connectionId && item.role === 'target'); const control = openAIControlConnection(store);
    if (!document || !connection || !question) throw new Error('A document, target connection, and question are required.');
    if (document.kind === 'technical' && connection.kind === 'flexagent') throw new Error('Technical document chat requires a model target that can receive retrieved source sections.');
    if (!control) throw new Error('An OpenAI control-model connection is required for retrieval.');
    if (document.kind === 'technical') await ensureTechnicalIndexed(store, document, control);
    const questionVector = (await embed(control, [question.trim()]))[0];
    const retrieved = retrieveChunks(store.chunks, documentId, questionVector, 5, document.kind);
    if (!retrieved.length) throw new Error('This document has not been indexed for retrieval. Re-upload it after connecting OpenAI.');
    let chat = chatId && store.chats.find(item => item.id === chatId);
    if (chat && (chat.documentId !== documentId || chat.connectionId !== connectionId)) throw new Error('This conversation belongs to a different document or agent.');
    if (!chat) chat = { id: id('chat'), documentId, documentKind: document.kind, connectionId, title: question.trim().slice(0, 58), messages: [], surveyMemory: { version: 1, facts: [] }, createdAt: new Date().toISOString() };
    chat = appendChatMessage(chat, 'user', question);
    const history = document.kind === 'policy' ? retrieveChatChunks(store.chatChunks, chat.id, questionVector) : [];
    const answer = await callModel(connection, document.kind === 'technical' ? technicalTargetMessages(agentPrompt(store, documentId, connection), retrieved, question) : targetChatMessages(agentPrompt(store, documentId, connection), retrieved, chat, history));
    chat = appendChatMessage(chat, 'assistant', answer); chat.updatedAt = new Date().toISOString();
    if (document.kind === 'policy') {
      const answerVector = (await embed(control, [answer]))[0];
      chat = appendSurveyFacts(chat, await extractSurveyFacts(control, chat), chat.updatedAt);
      store.chatChunks.push(...chatChunksForMessages(chat, documentId, chat.messages.slice(-2), [questionVector, answerVector], chat.updatedAt));
    }
    store.chats = [chat, ...store.chats.filter(item => item.id !== chat.id)]; saveStore(store);
    res.json({ answer, chat });
  } catch (error) { next(error); }
});
app.post('/api/datasets/generate', async (req, res, next) => {
  try {
    const { documentId, connectionId, count = 10 } = req.body; const store = readStore(); const document = resolveDocument(store, documentId); const connection = store.connections.find(item => item.id === connectionId && item.role === 'control');
    if (!document || !connection) throw new Error('A document and control-model connection are required.');
    const technical = document.kind === 'technical';
    const caseType = technical ? 'technical-document evaluation cases' : 'customer-facing policy evaluation cases';
    const sources = chunkText(document.text, 500, 0);
    const prompt = `Create ${Math.min(Math.max(Number(count), 1), 30)} ${caseType} from the numbered source passages below. Return JSON only: {"cases":[{"question":"","expectedAnswer":"","requiredPoints":[""],"forbiddenPoints":[""],"sourceIndex":1}]}. For every case, sourceIndex must be the number of the passage that supports its expected answer. ${technical ? 'Ask about documented APIs, inputs, outputs, branches, constraints, or unsupported details; expected answers must not invent facts.' : 'Questions must be realistic customer messages and expected answers must be direct customer-ready replies.'}\n\n${sources.map((source, index) => `SOURCE ${index + 1}:\n${source.text}`).join('\n\n')}`;
    const raw = await callModel(connection, [{ role: 'system', content: 'You create precise, source-grounded datasets for testing agents.' }, { role: 'user', content: prompt }], true);
    const cases = sourceIndexedCases(raw, sources);
    if (!cases.length) throw new Error('The control model did not cite any valid source passages. Please try again.');
    const dataset = { id: id('dataset'), documentId, documentKind: document.kind, status: 'draft', cases, createdAt: new Date().toISOString() };
    store.datasets.push(dataset); saveStore(store); res.status(201).json(dataset);
  } catch (error) { next(error); }
});
app.put('/api/datasets/:id', (req, res) => {
  const store = readStore(); const dataset = store.datasets.find(item => item.id === req.params.id);
  if (!dataset) return res.status(404).json({ error: 'Dataset not found.' });
  if (dataset.status === 'approved') return res.status(400).json({ error: 'Approved datasets cannot be changed.' });
  if (!Array.isArray(req.body.cases) || !req.body.cases.length) return res.status(400).json({ error: 'At least one scenario is required.' });
  dataset.cases = req.body.cases.map(normalizeDatasetCase);
  dataset.updatedAt = new Date().toISOString(); saveStore(store); res.json(dataset);
});
app.post('/api/datasets/:id/approve', (req, res) => {
  const store = readStore(); const dataset = store.datasets.find(item => item.id === req.params.id);
  if (!dataset) return res.status(404).json({ error: 'Dataset not found.' });
  if (!dataset.cases.length) return res.status(400).json({ error: 'Every approved dataset needs at least one scenario.' });
  dataset.status = 'approved'; dataset.approvedAt = new Date().toISOString(); saveStore(store); res.json(dataset);
});
app.post('/api/evaluations', async (req, res, next) => {
  try {
    const { datasetId, targetConnectionId, controlConnectionId } = req.body;
    const store = readStore(); const dataset = store.datasets.find(item => item.id === datasetId && item.status === 'approved');
    const target = store.connections.find(item => item.id === targetConnectionId && item.role === 'target');
    const control = store.connections.find(item => item.id === controlConnectionId && item.role === 'control');
    const document = dataset && resolveDocument(store, dataset.documentId);
    if (!dataset || !target || !control || !document) throw new Error('An approved dataset, its document, target agent, and control model are required.');
    if (document.kind === 'technical' && target.kind === 'flexagent') throw new Error('Technical document evaluation requires a model target that can receive retrieved source sections.');
    if (document.kind === 'technical') {
      const retrievalConnection = openAIControlConnection(store);
      if (!retrievalConnection) throw new Error('An OpenAI control-model connection is required for retrieval.');
      await ensureTechnicalIndexed(store, document, retrievalConnection);
    }
    const results = [];
    for (const item of dataset.cases) {
      const flexAgent = target.kind === 'flexagent';
      if (item.turns?.length) {
        if (document.kind === 'technical') throw new Error('Technical document evaluations use single-turn source-grounded scenarios.');
        if (flexAgent) throw new Error('Multi-turn evaluations require a local model target.');
        const retrievalConnection = openAIControlConnection(store);
        if (!retrievalConnection) throw new Error('An OpenAI control-model connection is required for retrieval.');
        let chat = { id: id('eval_chat'), documentId: document.id, connectionId: target.id, messages: [], surveyMemory: { version: 1, facts: [] }, createdAt: new Date().toISOString() };
        const historyChunks = []; const turnResults = [];
        for (const turn of evaluationTurns(item)) {
          const questionVector = (await embed(retrievalConnection, [turn.userMessage]))[0];
          const retrieved = retrieveChunks(store.chunks, document.id, questionVector, 5, document.kind);
          if (!retrieved.length) throw new Error('This document has not been indexed for retrieval. Re-upload it after connecting OpenAI.');
          chat = appendChatMessage(chat, 'user', turn.userMessage);
          const history = retrieveChatChunks(historyChunks, chat.id, questionVector);
          const answer = await callModel(target, targetChatMessages(agentPrompt(store, document.id, target), retrieved, chat, history));
          chat = appendChatMessage(chat, 'assistant', answer); chat.updatedAt = new Date().toISOString();
          const answerVector = (await embed(retrievalConnection, [answer]))[0];
          chat = appendSurveyFacts(chat, await extractSurveyFacts(control, chat), chat.updatedAt);
          historyChunks.push(...chatChunksForMessages(chat, document.id, chat.messages.slice(-2), [questionVector, answerVector], chat.updatedAt));
          const verdict = await scoreAnswer(control, answer, turn);
          turnResults.push({ turn, answer, retrievedChunks: retrieved.map(({ vector, ...chunk }) => chunk), surveyMemory: chat.surveyMemory, ...verdict });
        }
        const memoryVerdict = scoreExpectedMemory(item.expectedFinalMemory || [], chat.surveyMemory);
        const score = Math.round(turnResults.reduce((sum, turn) => sum + Number(turn.score || 0), 0) / turnResults.length);
        const failedTurn = turnResults.find(turn => !turn.pass);
        const gapDiagnosis = multiTurnGapDiagnosis(turnResults, memoryVerdict);
        results.push({ case: item, answer: turnResults.at(-1).answer, retrievedChunks: turnResults.at(-1).retrievedChunks, turns: turnResults, surveyMemory: chat.surveyMemory, memoryVerdict, score, pass: turnResults.every(turn => turn.pass) && memoryVerdict.pass, rationale: !memoryVerdict.pass ? `Missing final memory: ${memoryVerdict.missing.join(', ')}` : failedTurn?.rationale || 'All turn rubrics and final memory expectations passed.', ...(gapDiagnosis ? { gapDiagnosis } : {}) });
        continue;
      }
      let answer; let retrieved = [];
      if (flexAgent) {
        answer = await callFlexAgent(target, item.question);
      } else {
        const retrievalConnection = openAIControlConnection(store);
        if (!retrievalConnection) throw new Error('An OpenAI control-model connection is required for retrieval.');
        retrieved = retrieveChunks(store.chunks, document.id, (await embed(retrievalConnection, [item.question]))[0], 5, document.kind);
        if (!retrieved.length) throw new Error('This document has not been indexed for retrieval. Re-upload it after connecting OpenAI.');
        answer = await callModel(target, document.kind === 'technical' ? technicalTargetMessages(agentPrompt(store, document.id, target), retrieved, item.question) : [{ role: 'system', content: `${agentPrompt(store, document.id, target)}\n\nRETRIEVED POLICY SECTIONS:\n${policyContext(retrieved)}` }, { role: 'user', content: item.question }]);
      }
      const verdict = await scoreAnswer(control, answer, item); results.push({ case: item, answer, retrievedChunks: retrieved.map(({ vector, ...chunk }) => chunk), retrievalUnavailable: flexAgent, ...verdict });
    }
    const evaluation = { id: id('eval'), datasetId, documentKind: document.kind, targetConnectionId, controlConnectionId, createdAt: new Date().toISOString(), results, score: Math.round(results.reduce((sum, item) => sum + Number(item.score || 0), 0) / results.length) };
    store.evaluations.unshift(evaluation); saveStore(store); res.status(201).json(evaluation);
  } catch (error) { next(error); }
});
app.post('/api/evaluations/manual', async (req, res, next) => {
  try {
    const { datasetId, controlConnectionId, answers } = req.body;
    const store = readStore(); const dataset = store.datasets.find(item => item.id === datasetId && item.status === 'approved');
    const control = store.connections.find(item => item.id === controlConnectionId && item.role === 'control');
    if (!dataset || !control) throw new Error('An approved dataset and control model are required.');
    if (!Array.isArray(answers) || answers.length !== dataset.cases.length || answers.some(answer => !String(answer || '').trim())) throw new Error('Paste one non-empty target answer for every scenario.');
    const results = [];
    for (const [index, item] of dataset.cases.entries()) {
      const answer = String(answers[index]).trim();
      const verdict = await scoreAnswer(control, answer, item);
      results.push({ case: item, answer, manual: true, retrievedChunks: [], retrievalUnavailable: true, ...verdict });
    }
    const evaluation = { id: id('eval'), datasetId, documentKind: resolveDocument(store, dataset.documentId)?.kind, targetConnectionId: null, controlConnectionId, manual: true, createdAt: new Date().toISOString(), results, score: Math.round(results.reduce((sum, item) => sum + Number(item.score || 0), 0) / results.length) };
    store.evaluations.unshift(evaluation); saveStore(store); res.status(201).json(evaluation);
  } catch (error) { next(error); }
});
app.post('/api/evaluations/livekit', async (req, res, next) => {
  try {
    const { datasetId, targetConnectionId, controlConnectionId, answers } = req.body;
    const store = readStore(); const dataset = store.datasets.find(item => item.id === datasetId && item.status === 'approved');
    const target = store.connections.find(item => item.id === targetConnectionId && item.kind === 'flexagent-livekit');
    const control = store.connections.find(item => item.id === controlConnectionId && item.role === 'control');
    if (!dataset || !target || !control) throw new Error('An approved dataset, LiveKit FlexAgent target, and control model are required.');
    if (dataset.cases.some(item => item.turns?.length)) throw new Error('LiveKit widget evaluation currently supports single-turn scenarios only.');
    if (!Array.isArray(answers) || answers.length !== dataset.cases.length || answers.some(answer => !String(answer || '').trim())) throw new Error('LiveKit must return one non-empty answer for every scenario.');
    const results = [];
    for (const [index, item] of dataset.cases.entries()) {
      const answer = String(answers[index]).trim();
      results.push({ case: item, answer, livekit: true, retrievedChunks: [], retrievalUnavailable: true, ...(await scoreAnswer(control, answer, item)) });
    }
    const evaluation = { id: id('eval'), datasetId, documentKind: resolveDocument(store, dataset.documentId)?.kind, targetConnectionId, controlConnectionId, livekit: true, createdAt: new Date().toISOString(), results, score: Math.round(results.reduce((sum, item) => sum + Number(item.score || 0), 0) / results.length) };
    store.evaluations.unshift(evaluation); saveStore(store); res.status(201).json(evaluation);
  } catch (error) { next(error); }
});
app.use((error, req, res, next) => { console.error(error); res.status(400).json({ error: error.message || 'Request failed.' }); });
if (require.main === module) app.listen(Number(process.env.PORT || 4173), () => console.log(`Verity is running at http://127.0.0.1:${process.env.PORT || 4173}`));
module.exports = { chunkText, chunkTechnicalText, cosineSimilarity, retrieveChunks, retrieveChatChunks, chatChunksForMessages, targetChatMessages, technicalTargetMessages, normalizeDatasetCase, sourceIndexedCases, evaluationTurns, scoreExpectedMemory, gapDiagnosisForVerdict, parseScoredVerdict, multiTurnGapDiagnosis, parseSurveyFacts, parseTechnicalAnalysis, hasSourceEvidence, removeDocumentData, removeTechnicalDocumentData, normalizeChat, appendChatMessage, appendSurveyFacts, publicConnection, flexAgentRequest, flexAgentWidgetTokenRequest };
