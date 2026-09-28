const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const fs = require('node:fs');
const net = require('node:net');
const { chromium } = require('playwright');

const FILE_LINK = /\.(?:pdf|docx?|xlsx?|pptx?|zip|png|jpe?g|gif|svg|webp|mp4|mp3)(?:$|[?#])/i;

function browserExecutablePath(exists = fs.existsSync) {
  return [process.env.VERITY_BROWSER_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(value => value && exists(value));
}

function normalizeWebsiteUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw new Error('Enter a valid public HTTP or HTTPS website URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Enter a public HTTP or HTTPS website URL without credentials.');
  url.hash = '';
  return url;
}
function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const parts = address.split('.').map(Number); const [a, b] = parts;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19)));
  }
  if (family === 6) {
    // Canonical form collapses spellings such as 0:0:0:0:0:0:0:1 and ::ffff:127.0.0.1.
    const lower = new URL(`http://[${address}]/`).hostname.slice(1, -1);
    const embedded = lower.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (embedded) { const high = parseInt(embedded[1], 16); const low = parseInt(embedded[2], 16); return isPublicAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`); }
    return !(lower.startsWith('::') || lower.startsWith('fc') || lower.startsWith('fd') || /^fe[89a-f]/.test(lower) || lower.startsWith('ff'));
  }
  return false;
}
async function assertPublicUrl(value) {
  const url = normalizeWebsiteUrl(value);
  const results = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!results.length || results.some(result => !isPublicAddress(result.address))) throw new Error('This website resolves to a private or unsafe network address.');
  return url;
}
function isInScope(value, root) {
  const url = normalizeWebsiteUrl(value);
  const base = root.pathname.endsWith('/') ? root.pathname : `${root.pathname}/`;
  return url.origin === root.origin && (url.pathname === root.pathname || url.pathname.startsWith(base));
}
function robotsAllows(text, path) {
  const lines = String(text || '').split(/\r?\n/); let applies = false; const rules = [];
  for (const raw of lines) {
    const line = raw.replace(/#.*/, '').trim(); const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].toLowerCase(); const value = match[2].trim();
    if (key === 'user-agent') applies = value === '*' || value.toLowerCase().includes('verity');
    if (applies && (key === 'allow' || key === 'disallow') && value) rules.push({ allow: key === 'allow', value });
  }
  const matching = rules.filter(rule => path.startsWith(rule.value)).sort((a, b) => b.value.length - a.value.length)[0];
  return !matching || matching.allow;
}
async function allowedByRobots(url) {
  const robotsUrl = new URL('/robots.txt', url);
  try {
    await assertPublicUrl(robotsUrl);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(robotsUrl, { signal: controller.signal, redirect: 'error', headers: { 'User-Agent': 'VerityWebsiteEvaluator/1.0' } });
    clearTimeout(timer);
    return !response.ok || robotsAllows(await response.text(), url.pathname);
  } catch { return false; }
}
function cleanText(value) { return String(value || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim(); }
async function crawlWebsite(rootValue, options = {}) {
  const root = await assertPublicUrl(rootValue); const started = Date.now();
  const maxPages = options.maxPages || 100; const maxAttempts = options.maxAttempts || 300; const maxMs = options.maxMs || 10 * 60 * 1000;
  const queue = [root.href]; const queued = new Set(queue); const pages = []; const skipped = []; const failed = [];
  let browser;
  try { browser = await chromium.launch({ headless: true, ...(browserExecutablePath() ? { executablePath: browserExecutablePath() } : {}) }); }
  catch { throw new Error('Website browser could not start. Install Google Chrome or set VERITY_BROWSER_PATH to its executable.'); }
  try {
    while (queue.length && pages.length < maxPages && pages.length + skipped.length + failed.length < maxAttempts && Date.now() - started < maxMs) {
      const requested = queue.shift(); let url;
      try { url = await assertPublicUrl(requested); } catch (error) { skipped.push({ url: requested, reason: error.message }); continue; }
      if (!isInScope(url, root)) { skipped.push({ url: url.href, reason: 'Outside the website root path.' }); continue; }
      if (!await allowedByRobots(url)) { skipped.push({ url: url.href, reason: 'Disallowed by robots.txt or robots.txt could not be checked.' }); continue; }
      const context = await browser.newContext({ serviceWorkers: 'block' }); const page = await context.newPage();
      try {
        await context.route('**/*', async route => {
          const requestUrl = route.request().url();
          if (/^(data|blob):/i.test(requestUrl)) return route.continue();
          try { await assertPublicUrl(requestUrl); } catch { return route.abort('blockedbyclient'); }
          if (route.request().isNavigationRequest() && !isInScope(requestUrl, root)) return route.abort('blockedbyclient');
          return route.continue();
        });
        await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(700);
        await page.evaluate(async () => { for (let i = 0, last = 0; i < 8; i += 1) { window.scrollTo(0, document.body.scrollHeight); await new Promise(resolve => setTimeout(resolve, 250)); const height = document.body.scrollHeight; if (height === last) break; last = height; } window.scrollTo(0, 0); });
        const finalUrl = await assertPublicUrl(page.url());
        if (!isInScope(finalUrl, root)) throw new Error('Redirect left the website root path.');
        const extracted = await page.evaluate(() => {
          const copy = document.body.cloneNode(true); copy.querySelectorAll('script,style,noscript,template,nav,header,footer,aside,[aria-hidden="true"],.header,.footer').forEach(node => node.remove());
          const lines = []; copy.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,pre,td,th').forEach(node => { const text = node.innerText?.trim(); if (!text) return; const level = /^H[1-6]$/.test(node.tagName) ? '#'.repeat(Number(node.tagName[1])) + ' ' : ''; lines.push(level + text); });
          return { title: document.title?.trim() || location.href, text: lines.join('\n\n'), links: [...document.querySelectorAll('a[href]')].map(link => link.href) };
        });
        const text = cleanText(extracted.text);
        if (!text) throw new Error('No readable text was found on this page.');
        pages.push({ id: `page_${crypto.randomUUID()}`, url: finalUrl.href, title: extracted.title, text, hash: crypto.createHash('sha256').update(text).digest('hex'), status: 'collected' });
        for (const href of extracted.links) {
          if (FILE_LINK.test(href)) continue;
          try { const next = normalizeWebsiteUrl(href); if (isInScope(next, root) && !queued.has(next.href)) { queued.add(next.href); queue.push(next.href); } } catch { /* Non-web link. */ }
        }
      } catch (error) { failed.push({ url: url.href, reason: error.message || 'Page could not be collected.' }); } finally { await context.close(); }
    }
  } finally { await browser.close(); }
  const limit = pages.length >= maxPages ? 'page limit' : pages.length + skipped.length + failed.length >= maxAttempts ? 'attempt limit' : Date.now() - started >= maxMs ? 'time limit' : '';
  return { rootUrl: root.href, pages, skipped, failed, incomplete: Boolean(limit), limit, crawledAt: new Date().toISOString() };
}
module.exports = { normalizeWebsiteUrl, isPublicAddress, assertPublicUrl, isInScope, robotsAllows, crawlWebsite, cleanText, browserExecutablePath };
