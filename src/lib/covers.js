// Cover art finder: Steam (many mirrors), then Wikipedia (box art for older games). Everything has a timeout.
const fs = require('fs'), path = require('path');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SKBox/1.0';
const HOSTS = ['cdn.cloudflare.steamstatic.com', 'cdn.akamai.steamstatic.com', 'shared.akamai.steamstatic.com'];
const FILES = ['library_600x900_2x.jpg', 'library_600x900.jpg', 'header.jpg'];
const ROMAN = { ii: '2', iii: '3', iv: '4', vi: '6', vii: '7', viii: '8', ix: '9' };
const norm = s => String(s || '').toLowerCase().replace(/['\u2019`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').map(w => ROMAN[w] || w).join(' ');
const nums = n => n.split(' ').filter(w => /^\d{1,3}$/.test(w));
const T = ms => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(ms) : undefined;
async function getJson(url) { const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: T(9000) }); if (!r.ok) throw new Error('http ' + r.status); return r.json(); }

// "Assassins Creed Dx9 Launcher" -> a few cleaner searches
function variants(term) {
  const t = String(term || '').trim(), out = [t];
  const c = t.replace(/\(.*?\)/g, ' ').replace(/\b(dx9|dx10|dx11|dx12|x64|x86|win64|win32|launcher|client|shipping|final)\b/ig, ' ').replace(/[_\-.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
  if (c) out.push(c);
  const w = c.split(' ').filter(Boolean);
  if (w.length > 3) out.push(w.slice(0, 3).join(' '));
  if (w.length > 2) out.push(w.slice(0, 2).join(' '));
  return [...new Set(out.filter(x => x.length > 1))];
}
const steamPreview = id => 'https://' + HOSTS[0] + '/steam/apps/' + id + '/library_600x900.jpg';
async function steamSearch(term) {
  try {
    const j = await getJson('https://store.steampowered.com/api/storesearch/?term=' + encodeURIComponent(term) + '&l=english&cc=US');
    return (j.items || []).slice(0, 8).map(i => ({ src: 'steam', id: i.id, name: i.name, preview: steamPreview(i.id) }));
  } catch { return []; }
}
const bigger = u => String(u).replace(/\/(\d+)px-/, '/500px-');
async function wikiSearch(term) {
  try {
    const j = await getJson('https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' + encodeURIComponent(term + ' video game') + '&srlimit=5&format=json&origin=*');
    const out = [];
    for (const h of ((j.query && j.query.search) || [])) {
      try {
        const s = await getJson('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(String(h.title).replace(/ /g, '_')));
        const img = (s.thumbnail && s.thumbnail.source) || (s.originalimage && s.originalimage.source);
        if (img && /game|software/i.test((s.description || '') + ' ' + String(s.extract || '').slice(0, 400))) out.push({ src: 'wiki', name: s.title, preview: bigger(img), url: bigger(img) });
      } catch {}
      if (out.length >= 3) break;
    }
    return out;
  } catch { return []; }
}
const sim = (a, b) => { const A = norm(a).split(' ').filter(Boolean), B = new Set(norm(b).split(' ').filter(Boolean)); if (!A.length || !B.size) return 0; return A.filter(x => B.has(x)).length / Math.min(A.length, B.size); };
// only returns a result that really looks like the same game (and the same sequel number), so a wrong cover is never applied on its own
function bestMatch(term, items) {
  const t = norm(term), tn = nums(t); let best = null, bs = 0;
  for (const i of (items || [])) {
    const n = norm(i.name), inn = nums(n);
    if (tn.length && !tn.every(x => inn.includes(x))) continue;
    const sm = sim(term, i.name);
    let sc = n === t ? 1 : (n.startsWith(t) || t.startsWith(n)) ? 0.9 : n.includes(t) ? 0.85 : sm >= 0.6 ? 0.5 + 0.3 * sm : 0;
    if (!sc) continue;
    if (!tn.length && inn.length) sc -= 0.15;
    sc -= 0.005 * Math.max(0, n.split(' ').length - t.split(' ').length);
    if (sc > bs) { bs = sc; best = i; }
  }
  return bs >= 0.5 ? best : null;
}
// all candidates for a search term (Steam first, then Wikipedia)
async function search(term) {
  const seen = new Set(), out = [];
  for (const v of variants(term).slice(0, 3)) {
    for (const it of await steamSearch(v)) { if (!seen.has('s' + it.id)) { seen.add('s' + it.id); out.push(it); } }
    if (out.length >= 6) break;
  }
  for (const it of await wikiSearch(variants(term).slice(-1)[0] === term ? term : variants(term)[1] || term)) out.push(it);
  return out.slice(0, 10);
}
async function fetchImage(url, dest) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: T(12000) });
  if (!r.ok) return { ok: false, status: r.status };
  const type = String(r.headers.get('content-type') || ''); if (type && !/^image\//i.test(type)) return { ok: false, status: 415 };
  const b = Buffer.from(await r.arrayBuffer()); if (b.length < 1500 || b.length > 12 * 1024 * 1024) return { ok: false, status: 413 };
  fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, b); return { ok: true };
}
async function download(steamId, dest) {
  let neterr = 0;
  for (const f of FILES) for (const h of HOSTS) {
    try { const r = await fetchImage('https://' + h + '/steam/apps/' + steamId + '/' + f, dest); if (r.ok) return { ok: true, portrait: f !== 'header.jpg' }; neterr = 0; }
    catch { if (++neterr >= 3) return { ok: false, error: 'offline' }; }
  }
  return { ok: false };
}
async function downloadUrl(url, dest) {
  let u; try { u = new URL(url); } catch { return { ok: false, error: 'bad link' }; }
  if (u.protocol !== 'https:') return { ok: false, error: 'Links must start with https://' };
  try { const r = await fetchImage(u.toString(), dest); return r.ok ? { ok: true } : { ok: false, error: 'That link is not an image.' }; } catch { return { ok: false, error: 'Could not download that link.' }; }
}
async function auto(term, dest) {
  for (const v of variants(term).slice(0, 4)) {
    const items = await steamSearch(v), m = bestMatch(v, items);
    if (m) { const d = await download(m.id, dest); if (d.ok) return { ok: true, matched: m.name, portrait: d.portrait, source: 'steam' }; }
  }
  for (const v of variants(term).slice(0, 2)) {
    const items = await wikiSearch(v);
    for (const it of items.filter(x => sim(v, String(x.name).replace(/\s*\(.*?\)\s*/g, ' ')) >= 0.6)) { try { const r = await fetchImage(it.url, dest); if (r.ok) return { ok: true, matched: it.name, portrait: true, source: 'wikipedia' }; } catch {} }
  }
  return { ok: false };
}
module.exports = { sim, search, download, downloadUrl, auto, bestMatch, variants, norm, steamSearch, wikiSearch };
