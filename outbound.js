const dns = require('node:dns');
const net = require('node:net');
const { Agent } = require('undici');
const { isPublicAddress } = require('./website-crawler');

const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// Synchronous checks on the URL text. Hostnames are resolved and checked again when the connection is made.
function assertPublicHttpsUrl(value, label = 'Endpoint') {
  const failure = () => new Error(`${label} must be a public HTTPS URL (no credentials, localhost, or private network addresses).`);
  let url;
  try { url = new URL(String(value)); } catch { throw new Error(`${label} must be a valid HTTPS URL.`); }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || !hostname) throw failure();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) throw failure();
  if (net.isIP(hostname) && !isPublicAddress(hostname)) throw failure();
  return url;
}

// Used as the connection's DNS lookup, so the address that is checked is the address that is connected to.
function createGuardedLookup(lookupImpl = dns.lookup) {
  return (hostname, options, callback) => {
    const done = typeof options === 'function' ? options : callback;
    const wantsAll = typeof options === 'object' && options?.all;
    lookupImpl(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) return done(error);
      if (!addresses?.length || addresses.some(entry => !isPublicAddress(entry.address))) return done(new Error('This endpoint resolves to a private or unsafe network address.'));
      return wantsAll ? done(null, addresses) : done(null, addresses[0].address, addresses[0].family);
    });
  };
}

let dispatcher;
function guardedDispatcher() { return dispatcher ||= new Agent({ connect: { lookup: createGuardedLookup() } }); }

// fetch() for endpoints the user configured. Every hop must be public HTTPS; redirects are followed manually so none can reach a private address.
async function safeFetch(input, options = {}) {
  let url = assertPublicHttpsUrl(input);
  let init = { ...options, redirect: 'manual', dispatcher: guardedDispatcher() };
  for (let redirects = 0; ; redirects += 1) {
    const response = await fetch(url.href, init);
    const location = REDIRECT_STATUSES.has(response.status) ? response.headers.get('location') : null;
    if (!location) return response;
    await response.body?.cancel?.().catch(() => {});
    if (redirects >= MAX_REDIRECTS) throw new Error('The endpoint redirected too many times.');
    let next;
    try { next = assertPublicHttpsUrl(new URL(location, url).href, 'Redirect target'); } catch (error) { throw error instanceof TypeError ? new Error('The endpoint redirected to an invalid URL.') : error; }
    const headers = new Headers(init.headers);
    if (next.origin !== url.origin) headers.delete('authorization');
    const rewritesToGet = response.status === 303 || ([301, 302].includes(response.status) && String(init.method || 'GET').toUpperCase() === 'POST');
    if (rewritesToGet) { headers.delete('content-type'); headers.delete('content-length'); }
    init = { ...init, headers: Object.fromEntries(headers), ...(rewritesToGet ? { method: 'GET', body: undefined } : {}) };
    url = next;
  }
}

module.exports = { assertPublicHttpsUrl, createGuardedLookup, safeFetch, MAX_REDIRECTS };
