// A small declarativeNetRequest engine. Electron does not run Chrome's request-rewriting extension API, so extensions that need it
// (VidAngel and others) were doing nothing. This reads their rules (static files + rules they add at run time) and applies them
// to the SKBrowse session: block, allow, redirect, upgrade to https and header changes.
const fs = require('fs'), path = require('path');

const RT = { mainFrame: 'main_frame', subFrame: 'sub_frame', stylesheet: 'stylesheet', script: 'script', image: 'image', font: 'font', object: 'object',
  xhr: 'xmlhttprequest', ping: 'ping', cspReport: 'csp_report', media: 'media', webSocket: 'websocket', other: 'other' };
const ORDER = { allow: 5, allowAllRequests: 4, block: 3, upgradeScheme: 2, redirect: 1, modifyHeaders: 0 };

// urlFilter -> RegExp (Chrome syntax: || domain anchor, | start/end anchor, ^ separator, * wildcard)
function filterToRegex(f, cs) {
  let s = String(f), pre = '', post = '';
  if (s.startsWith('||')) { pre = '^[a-z][a-z0-9+.-]*:\\/\\/(?:[^\\/?#]*\\.)?'; s = s.slice(2); }
  else if (s.startsWith('|')) { pre = '^'; s = s.slice(1); }
  if (s.endsWith('|')) { post = '$'; s = s.slice(0, -1); }
  let body = '';
  for (const ch of s) body += ch === '*' ? '.*' : ch === '^' ? '(?:[\\/?#:&=]|$)' : ch.replace(/[.+?${}()|[\]\\\/]/g, '\\$&');
  return new RegExp(pre + body + post, cs ? '' : 'i');
}
const hostIn = (h, list) => (list || []).some(d => { d = String(d).toLowerCase(); return h === d || h.endsWith('.' + d); });
const hostOf = u => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
const THIRD = (a, b) => { const r = x => x.split('.').slice(-2).join('.'); return !!a && !!b && r(a) !== r(b); };

function matches(rule, d) {
  const c = rule.condition || {}, url = d.url, rt = RT[d.resourceType] || 'other', host = hostOf(url);
  if (c.urlFilter !== undefined && c.urlFilter !== '') { if (!(rule._f || (rule._f = filterToRegex(c.urlFilter, c.isUrlFilterCaseSensitive))).test(url)) return false; }
  if (c.regexFilter) { try { if (!(rule._r || (rule._r = new RegExp(c.regexFilter, c.isUrlFilterCaseSensitive ? '' : 'i'))).test(url)) return false; } catch { return false; } }
  const types = c.resourceTypes || (c.excludedResourceTypes ? null : ['sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'other']);
  if (types && !types.includes(rt)) return false;
  if (c.excludedResourceTypes && c.excludedResourceTypes.includes(rt)) return false;
  if (c.requestMethods && !c.requestMethods.includes(String(d.method || 'GET').toLowerCase())) return false;
  if (c.excludedRequestMethods && c.excludedRequestMethods.includes(String(d.method || 'GET').toLowerCase())) return false;
  const init = hostOf(d.referrer || d.initiator || '');
  const inc = c.initiatorDomains || c.domains, exc = c.excludedInitiatorDomains || c.excludedDomains;
  if (inc && !hostIn(init, inc)) return false; if (exc && hostIn(init, exc)) return false;
  if (c.requestDomains && !hostIn(host, c.requestDomains)) return false; if (c.excludedRequestDomains && hostIn(host, c.excludedRequestDomains)) return false;
  if (c.domainType) { const t = THIRD(host, init); if ((c.domainType === 'thirdParty') !== t) return false; }
  return true;
}

function redirectTarget(rule, d, extBase) {
  const r = (rule.action || {}).redirect; if (!r) return '';
  if (r.url) return r.url;
  if (r.extensionPath) return extBase + (String(r.extensionPath).startsWith('/') ? '' : '/') + r.extensionPath;
  if (r.regexSubstitution && rule.condition && rule.condition.regexFilter) { try { return d.url.replace(new RegExp(rule.condition.regexFilter, rule.condition.isUrlFilterCaseSensitive ? '' : 'i'), r.regexSubstitution.replace(/\\(\d)/g, '$$$1')); } catch { return ''; } }
  if (r.transform) { try { const u = new URL(d.url), t = r.transform; if (t.scheme) u.protocol = t.scheme + ':'; if (t.host) u.hostname = t.host; if (t.port !== undefined) u.port = t.port; if (t.path !== undefined) u.pathname = t.path; if (t.query !== undefined) u.search = t.query; if (t.fragment !== undefined) u.hash = t.fragment; if (t.username !== undefined) u.username = t.username; if (t.password !== undefined) u.password = t.password;
    if (t.queryTransform) { (t.queryTransform.removeParams || []).forEach(k => u.searchParams.delete(k)); (t.queryTransform.addOrReplaceParams || []).forEach(p => { if (p.replaceOnly && !u.searchParams.has(p.key)) return; u.searchParams.set(p.key, p.value); }); } return u.href; } catch { return ''; } }
  return '';
}

function create() {
  const exts = new Map();   // id -> { dir, stat: Map(rulesetId -> {on, rules}), dyn:[], ses:[], en:null|[ids] }
  const get = id => { let e = exts.get(id); if (!e) { e = { dir: '', stat: new Map(), dyn: [], ses: [], en: null }; exts.set(id, e); } return e; };
  function loadStatic(id, dir, man) {
    const e = get(id); e.dir = dir; e.stat = new Map();
    const rr = (man && man.declarative_net_request && man.declarative_net_request.rule_resources) || [];
    for (const r of rr) { try { const rules = JSON.parse(fs.readFileSync(path.join(dir, r.path), 'utf8')); e.stat.set(r.id, { on: r.enabled !== false, rules: Array.isArray(rules) ? rules : [] }); } catch { /* unreadable ruleset: skip */ } }
    return e.stat.size;
  }
  function setRuntime(id, body) { const e = get(id); if (Array.isArray(body.dyn)) e.dyn = body.dyn; if (Array.isArray(body.ses)) e.ses = body.ses; e.en = Array.isArray(body.en) ? body.en : e.en; }
  function remove(id) { exts.delete(id); }
  function rulesOf(e) {
    const out = []; for (const [rid, s] of e.stat) if (e.en ? e.en.includes(rid) : s.on) out.push(...s.rules);
    return out.concat(e.dyn, e.ses);
  }
  // -> { type:'allow'|'block'|'redirect'|'upgrade'|'modify'|'', url?, reqH?, resH? }
  function evaluate(d) {
    if (!exts.size || /^(chrome-extension|devtools|data|blob|file):/i.test(d.url)) return { type: '' };
    let best = null; const mods = [];
    for (const [id, e] of exts) for (const rule of rulesOf(e)) {
      if (!rule || !rule.action || !matches(rule, d)) continue;
      const t = rule.action.type, p = rule.priority || 1;
      if (t === 'modifyHeaders') { mods.push({ p, rule }); continue; }
      if (!best || p > best.p || (p === best.p && (ORDER[t] || 0) > (ORDER[best.rule.action.type] || 0))) best = { p, rule, id };
    }
    const res = { type: '' };
    if (best) { const t = best.rule.action.type; if (t === 'allow' || t === 'allowAllRequests') res.type = 'allow'; else if (t === 'block') return { type: 'block' };
      else if (t === 'upgradeScheme' && /^http:/i.test(d.url)) { res.type = 'upgrade'; res.url = d.url.replace(/^http:/i, 'https:'); }
      else if (t === 'redirect') { const u = redirectTarget(best.rule, d, 'chrome-extension://' + best.id); if (u && u !== d.url) { res.type = 'redirect'; res.url = u; } } }
    const live = mods.filter(m => !best || res.type !== 'allow' || m.p > best.p);   // an allow rule beats header rules of lower priority
    if (live.length) {
      live.sort((a, b) => b.p - a.p); const seen = { reqH: new Set(), resH: new Set() }; res.reqH = []; res.resH = [];
      for (const m of live) for (const [list, key] of [[m.rule.action.requestHeaders, 'reqH'], [m.rule.action.responseHeaders, 'resH']]) for (const h of list || []) {
        const k = String(h.header).toLowerCase(); if (h.operation !== 'append') { if (seen[key].has(k)) continue; seen[key].add(k); } res[key].push(h); }
      if (!res.type) res.type = 'modify';
    }
    return res;
  }
  // apply a header change list to an Electron header object (case-insensitive names)
  function applyHeaders(headers, list) {
    for (const h of list || []) {
      const name = Object.keys(headers).find(k => k.toLowerCase() === String(h.header).toLowerCase());
      if (h.operation === 'remove') { if (name) delete headers[name]; }
      else if (h.operation === 'set') { if (name) delete headers[name]; headers[h.header] = Array.isArray(headers[name]) ? [h.value] : h.value; }
      else if (h.operation === 'append') { if (name) headers[name] = Array.isArray(headers[name]) ? headers[name].concat(h.value) : String(headers[name]) + ', ' + h.value; else headers[h.header] = h.value; }
    }
    return headers;
  }
  return { loadStatic, setRuntime, remove, evaluate, applyHeaders, count: () => exts.size, _matches: matches, _filterToRegex: filterToRegex };
}
module.exports = { create, filterToRegex };
