// Game info hub: description, genres, release date, score, screenshots and trailer for each game.
// Sources: the Steam store (no key needed) and Wikipedia as a fallback. Only the game's name (or Steam id) is sent. Results are cached on this PC.
const DAY = 86400000;
const ROMAN = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
const norm = s => String(s || '').toLowerCase().replace(/[\u2122\u00AE\u00A9]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|of|a|an|edition|goty|game of the year|definitive|remastered|deluxe|complete|standard)\b/g, ' ').replace(/\s+/g, ' ').trim().split(' ').map((t, i) => (i > 0 && ROMAN[t] ? String(ROMAN[t]) : t)).join(' ');   // "Final Fantasy VII" = "Final Fantasy 7"
const nums = s => (s.match(/\b\d+\b/g) || []).join(',');
function score(query, cand) {
  const a = norm(query), b = norm(cand); if (!a || !b) return 0; if (a === b) return 1; if (nums(a) !== nums(b)) return 0.2;   // "Game 2" must not match "Game"
  const A = new Set(a.split(' ')), B = new Set(b.split(' ')); let inter = 0; A.forEach(t => { if (B.has(t)) inter++; }); const jac = inter / (A.size + B.size - inter);
  return Math.max(jac, (b.startsWith(a) || a.startsWith(b)) ? 0.75 : 0);
}
const stripHtml = h => String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim();
const steamId = exe => { const m = /^steam:\/\/rungameid\/(\d+)/i.exec(String(exe || '')); return m ? m[1] : ''; };
const httpsOnly = u => (/^https:\/\//i.test(u || '') ? u : '');

function shapeSteam(id, d) {
  const shots = (d.screenshots || []).slice(0, 12).map(s => ({ full: httpsOnly(s.path_full), thumb: httpsOnly(s.path_thumbnail) })).filter(s => s.full);
  const mv = (d.movies || [])[0], mp4 = mv && mv.mp4 ? httpsOnly(mv.mp4.max || mv.mp4['480']) : '';
  return { source: 'steam', id: String(id), title: d.name || '', summary: stripHtml(d.short_description), about: stripHtml(d.about_the_game).slice(0, 1400), genres: (d.genres || []).map(g => g.description).slice(0, 5),
    tags: (d.categories || []).map(c => c.description).filter(c => /player|co-op|controller|cross-platform/i.test(c)).slice(0, 5), developers: d.developers || [], publishers: d.publishers || [], released: d.release_date && d.release_date.date || '', score: d.metacritic ? d.metacritic.score : 0,
    recs: d.recommendations ? d.recommendations.total : 0, screenshots: shots, trailer: mp4 ? { name: mv.name || 'Trailer', mp4, thumb: httpsOnly(mv.thumbnail) } : null, background: httpsOnly(d.background_raw || d.background), header: httpsOnly(d.header_image), url: 'https://store.steampowered.com/app/' + id };
}
async function viaSteam(name, knownId, F) {
  let id = knownId; if (!id) { const r = await F.json('https://store.steampowered.com/api/storesearch/?term=' + encodeURIComponent(name) + '&l=english&cc=us'); let best = null, bs = 0; ((r && r.items) || []).forEach(it => { if (it.type && it.type !== 'app') return; const sc = score(name, it.name); if (sc > bs) { bs = sc; best = it; } }); if (!best || bs < 0.6) return null; id = best.id; }
  const d = await F.json('https://store.steampowered.com/api/appdetails?appids=' + id + '&l=english'); const x = d && d[id]; if (!x || !x.success || !x.data) return null; const out = shapeSteam(id, x.data); if (!knownId && score(name, out.title) < 0.6) return null; return out;
}
async function viaWiki(name, F) {
  const r = await F.json('https://en.wikipedia.org/w/api.php?action=opensearch&format=json&limit=4&search=' + encodeURIComponent(name + ' video game')); const titles = (r && r[1]) || []; let best = '', bs = 0;
  titles.forEach(t => { const sc = score(name, t.replace(/\s*\(.*?\)\s*/g, '')); if (sc > bs) { bs = sc; best = t; } }); if (!best || bs < 0.6) return null;
  const s = await F.json('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(best.replace(/ /g, '_'))); if (!s || !s.extract) return null; const img = httpsOnly(s.originalimage && s.originalimage.source) || httpsOnly(s.thumbnail && s.thumbnail.source);
  return { source: 'wikipedia', id: '', title: s.title || best, summary: String(s.extract).slice(0, 360), about: String(s.extract).slice(0, 1400), genres: [], tags: [], developers: [], publishers: [], released: '', score: 0, recs: 0, screenshots: img ? [{ full: img, thumb: img }] : [], trailer: null, background: '', header: img, url: httpsOnly(s.content_urls && s.content_urls.desktop && s.content_urls.desktop.page) };
}
const defaultFetch = { async json(url) { const c = new AbortController(), t = setTimeout(() => c.abort(), 9000); try { const r = await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'SKBox', Accept: 'application/json' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(t); } } };

function create(ctx) {
  const F = ctx.fetch || defaultFetch, now = () => (ctx.now ? ctx.now() : Date.now());
  const apps = () => { const a = ctx.store.read('apps', []); return Array.isArray(a) ? a : (a.apps || []); }, cache = () => ctx.store.read('gameinfo', {});
  async function get(id, force) {
    const a = apps().find(x => x.id === id); if (!a) return { ok: false, error: 'Unknown game.' }; const c = cache(), hit = c[id];
    if (hit && !force && now() - hit.t < (hit.none ? 1 : 30) * DAY) return hit.none ? { ok: true, none: true } : { ok: true, info: hit.data, cached: true };
    let info = null; try { info = await viaSteam(a.name, steamId(a.exe), F); if (!info) info = await viaWiki(a.name, F); } catch (e) { return { ok: false, error: 'Could not reach the game databases.' }; }
    c[id] = info ? { t: now(), data: info } : { t: now(), none: true }; ctx.store.write('gameinfo', c); return info ? { ok: true, info } : { ok: true, none: true };
  }
  function all() { const c = cache(), out = {}; Object.keys(c).forEach(id => { const d = c[id].data; if (d) out[id] = { genres: d.genres, released: d.released, score: d.score, source: d.source }; }); return { ok: true, map: out }; }
  async function fetchAll(arg) {
    const c = cache(), todo = apps().filter(a => !a.kind && !(c[a.id] && (c[a.id].data || now() - c[a.id].t < DAY))); let found = 0;
    for (const a of todo) { const r = await get(a.id); if (r.ok && r.info) found++; if (ctx.progress) ctx.progress(found, todo.length); if (ctx.delay !== 0) await new Promise(r2 => setTimeout(r2, ctx.delay || 350)); } return { ok: true, tried: todo.length, found };
  }
  async function run(name, arg) {
    try { switch (name) { case 'infoGet': return await get(String(arg && arg.id || ''), !!(arg && arg.force)); case 'infoAll': return all(); case 'infoFetchAll': return await fetchAll(); case 'infoClear': ctx.store.write('gameinfo', {}); return { ok: true }; } } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 140) }; } return null;
  }
  return { run, get, all, fetchAll };
}
module.exports = { create, score, norm, shapeSteam, stripHtml, steamId, viaSteam, viaWiki };
