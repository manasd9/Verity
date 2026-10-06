// Proves a refactor left the pages unchanged: renders every page with the page scripts from a base commit and from
// the working tree, against the same workspace data, and reports any page whose HTML differs.
//
//   npm run compare-render                     working tree vs HEAD, data from the running Verity
//   npm run compare-render -- 3754838          working tree vs a commit
//   npm run compare-render -- HEAD --state f   data from a saved /api/state JSON file
//
// Exits 1 when any page differs. Data is never written anywhere.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

// The page scripts in load order, from index.html, without vendor libraries.
function pageScripts(indexHtml) {
  return [...indexHtml.matchAll(/<script src="\/?([^"]+)"><\/script>/g)]
    .map(match => match[1])
    .filter(src => !src.startsWith('vendor/'));
}

// Loads the page scripts into a sandbox with a minimal browser stand-in, and returns a renderer for every page.
function loadPages(sources) {
  const element = () => ({
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    classList: { add() {}, remove() {}, toggle() {} },
    insertAdjacentHTML() {},
    setAttribute() {},
    removeAttribute() {},
    style: {},
    set innerHTML(value) {},
  });
  const context = {
    console,
    URL,
    Blob: class {},
    setTimeout: () => 0,
    clearTimeout() {},
    setInterval: () => 0,
    location: { hash: '', reload() {} },
    localStorage: { getItem: () => null, setItem() {} },
    document: {
      querySelector: element,
      querySelectorAll: () => [],
      addEventListener() {},
      body: element(),
      createElement: element,
      visibilityState: 'visible',
    },
    window: { addEventListener() {}, LivekitClient: null },
    fetch: () => new Promise(() => {}),
  };
  vm.createContext(context);
  const exposeApi = `;globalThis.__pages = {
    pages,
    show(state, mode, scope, evaluationId, datasetId) {
      workspace = state; workspaceMode = mode; viewScope = scope; viewingEvaluationId = evaluationId; reviewingDatasetId = datasetId;
    },
  };`;
  vm.runInContext(sources.join('\n;\n') + exposeApi, context);
  return context.__pages;
}

// Every page, in both workspaces, with the latest evaluation and its dataset open and closed.
function renderAll(sources, state) {
  const api = loadPages(sources);
  const latest = state.evaluations?.[0];
  const scopes = [
    ['local', null],
    ['flex', latest?.orgId ? { orgId: latest.orgId, agentId: latest.agentId } : null],
  ];
  const views = [
    [null, null],
    [latest?.id ?? null, null],
    [null, latest?.datasetId ?? null],
  ];
  const renders = {};
  for (const [mode, scope] of scopes)
    for (const [evaluationId, datasetId] of views)
      for (const page of Object.keys(api.pages)) {
        api.show(structuredClone(state), mode, scope, evaluationId, datasetId);
        let html;
        try {
          html = api.pages[page]();
        } catch (error) {
          html = `ERROR ${error.message}`;
        }
        renders[`${mode} ${page} evaluation=${evaluationId} dataset=${datasetId}`] = html;
      }
  return renders;
}

function compareRenders(baseSources, currentSources, state) {
  const base = renderAll(baseSources, state);
  const current = renderAll(currentSources, state);
  const differences = Object.keys({ ...base, ...current }).filter(key => base[key] !== current[key]);
  return { compared: Object.keys(base).length, differences, base, current };
}

function gitShow(commit, file) {
  return execFileSync('git', ['show', `${commit}:${file}`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

async function main() {
  const args = process.argv.slice(2);
  const stateFlag = args.indexOf('--state');
  const statePath = stateFlag >= 0 ? args.splice(stateFlag, 2)[1] : null;
  const baseCommit = args[0] || 'HEAD';
  const state = statePath
    ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
    : await fetch('http://127.0.0.1:4173/api/state')
        .then(response => response.json())
        .catch(() => {
          throw new Error(
            'Verity is not running on 127.0.0.1:4173. Start it, or pass --state <saved /api/state file>.',
          );
        });
  const baseSources = pageScripts(gitShow(baseCommit, 'index.html')).map(file => gitShow(baseCommit, file));
  const currentSources = pageScripts(fs.readFileSync(path.join(root, 'index.html'), 'utf8')).map(file =>
    fs.readFileSync(path.join(root, file), 'utf8'),
  );
  const { compared, differences, base, current } = compareRenders(baseSources, currentSources, state);
  console.log(`${compared} page renders compared against ${baseCommit}: ${differences.length} differ`);
  for (const key of differences.slice(0, 20))
    console.log(`  ${key}: ${base[key]?.length ?? 'missing'} chars before, ${current[key]?.length ?? 'missing'} after`);
  process.exitCode = differences.length ? 1 : 0;
}

if (require.main === module)
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 2;
  });

module.exports = { pageScripts, renderAll, compareRenders };
