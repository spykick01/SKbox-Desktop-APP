// SKBox App Store: featured apps and games from public sources, no accounts or keys.
//  - Steam: the store's public JSON (specials, top sellers, new releases, search) and a hand-picked free-to-play list that is checked live.
//  - Epic: this week's free games.
//  - Apps: a hand-picked list installed with winget (Windows' own package manager), so nothing is downloaded from random sites.
//  - SK apps: SKServers, SKMusic, SKchat.
// Only search words or ids leave this PC. Games and apps are installed by Steam, Epic or winget, never by SKBox itself.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const gameinfo = require('./gameinfo');

const DAY = 86400000, UA = 'SKBox-Store/1.22.0';
const FREE_TO_PLAY = [730, 570, 440, 1172470, 230410, 238960, 2357570, 1085660, 578080, 2073850, 1222670, 291550, 1599340, 1938090];
const APPS = [
  { id: 'Mojang.MinecraftLauncher', name: 'Minecraft Launcher', sub: 'Play Minecraft Java and Bedrock', cat: 'Minecraft', match: 'minecraft launcher' },
  { id: 'PrismLauncher.PrismLauncher', name: 'Prism Launcher', sub: 'Minecraft launcher with mods and profiles', cat: 'Minecraft', match: 'prism' },
  { id: 'Valve.Steam', name: 'Steam', sub: 'The biggest PC game store and launcher', cat: 'Game stores', match: 'steam' },
  { id: 'EpicGames.EpicGamesLauncher', name: 'Epic Games Launcher', sub: 'Free games every week', cat: 'Game stores', match: 'epic games' },
  { id: 'GOG.Galaxy', name: 'GOG Galaxy', sub: 'DRM-free games and one library for all stores', cat: 'Game stores', match: 'gog' },
  { id: '9MV0B5HZVK9Z', source: 'msstore', name: 'Xbox', sub: 'Xbox app, Game Pass and Xbox games on PC', cat: 'Game stores', match: 'xbox' },
  { id: 'Libretro.RetroArch', name: 'RetroArch', sub: 'Many retro systems in one emulator', cat: 'Emulators', match: 'retroarch' },
  { id: 'PCSX2.PCSX2', name: 'PCSX2', sub: 'PlayStation 2 emulator', cat: 'Emulators', match: 'pcsx2' },
  { id: 'PPSSPPTeam.PPSSPP', name: 'PPSSPP', sub: 'PSP emulator', cat: 'Emulators', match: 'ppsspp' },
  { id: 'Discord.Discord', name: 'Discord', sub: 'Voice and text chat with friends', cat: 'Social & media', match: 'discord' },
  { id: 'Spotify.Spotify', name: 'Spotify', sub: 'Music and podcasts', cat: 'Social & media', match: 'spotify' },
  { id: 'VideoLAN.VLC', name: 'VLC', sub: 'Plays almost any video or audio file', cat: 'Social & media', match: 'vlc' },
  { id: 'OBSProject.OBSStudio', name: 'OBS Studio', sub: 'Record and stream your games', cat: 'Social & media', match: 'obs' },
  { id: 'LizardByte.Sunshine', name: 'Sunshine', sub: 'Stream games to Moonlight on other devices', cat: 'Streaming', match: 'sunshine' },
  { id: 'MoonlightGameStreamingProject.Moonlight', name: 'Moonlight', sub: 'Play games streamed from another PC', cat: 'Streaming', match: 'moonlight' },
  { id: 'Parsec.Parsec', name: 'Parsec', sub: 'Low-delay remote desktop and game streaming', cat: 'Streaming', match: 'parsec' }
];
const SK_APPS = [
  { id: 'skservers', name: 'SKServers', sub: 'Make and run Minecraft servers with a plugin store', art: 'assets/skservers.svg', grad: 'linear-gradient(160deg,#14532d,#052e16)' },
  { id: 'skmusic', name: 'SKMusic', sub: 'Your music, playing while you game', art: 'assets/skmusic.png', grad: 'linear-gradient(160deg,#6b1fa0,#14081f)' },
  { id: 'skchat', name: 'SKchat', sub: 'Chat, calls and friends', art: 'assets/skchat.png', grad: 'linear-gradient(160deg,#0e4a5c,#0b1020)' }
];
const OPEN_OK = [/^steam:\/\/(store|install|run|rungameid|nav\/games\/details)\/\d+$/i, /^com\.epicgames\.launcher:\/\/store\/p\/[a-z0-9-]+$/i, /^https:\/\/(store\.steampowered\.com|store\.epicgames\.com|www\.spigotmc\.org|modrinth\.com)\//i, /^ms-windows-store:\/\/pdp\/\?productid=[A-Z0-9]+$/i];
const money = (cents, cur) => { if (cents == null) return ''; if (cents === 0) return 'Free'; try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD' }).format(cents / 100); } catch { return (cents / 100).toFixed(2) + ' ' + (cur || ''); } };
const wingetOk = s => /^[A-Za-z0-9][A-Za-z0-9._-]{1,80}$/.test(String(s || ''));

function create(ctx) {
  const now = () => (ctx.now ? ctx.now() : Date.now()), F = ctx.fetch || ((u, o) => fetch(u, o));
  const store = ctx.store, cache = () => store.read('storecache', {}), saveCache = c => { const k = Object.keys(c); if (k.length > 80) k.sort((x, y) => c[x].t - c[y].t).slice(0, k.length - 60).forEach(x => delete c[x]); store.write('storecache', c); };
  const get = async (url, ttl) => {
    const c = cache(), hit = c[url]; if (hit && ttl && now() - hit.t < ttl) return hit.v;
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 12000);
    try { const r = await F(url, { signal: ac.signal, headers: { 'User-Agent': UA, Accept: 'application/json' } }); if (!r.ok) throw new Error('HTTP ' + r.status); const v = await r.json(); if (ttl) { const c2 = cache(); c2[url] = { t: now(), v }; saveCache(c2); } return v; }
    catch (e) { if (hit) return hit.v; throw e; } finally { clearTimeout(t); }   // stale data is better than none when offline
  };
  const FJ = { json: u => get(u, 0) };

  const steamItem = (it, kind) => ({ id: 'steam:' + it.id, kind: 'steam', appid: String(it.id), title: it.name, img: it.large_capsule_image || it.header_image || it.small_capsule_image || ('https://cdn.cloudflare.steamstatic.com/steam/apps/' + it.id + '/header.jpg'),
    price: it.discounted ? money(it.final_price, it.currency) : (it.final_price != null ? money(it.final_price, it.currency) : ''), was: it.discounted ? money(it.original_price, it.currency) : '', off: it.discounted ? it.discount_percent : 0, sub: kind || '' });
  async function steamFeatured() {
    const d = await get('https://store.steampowered.com/api/featuredcategories?cc=us&l=english', 30 * 60000), take = k => ((d && d[k] && d[k].items) || []).filter(x => x && x.id && x.name).slice(0, 12);
    return { deals: take('specials').map(x => steamItem(x, 'On sale')), top: take('top_sellers').map(x => steamItem(x, 'Top seller')), fresh: take('new_releases').map(x => steamItem(x, 'New')) };
  }
  async function freeToPlay() {
    const out = []; const ids = FREE_TO_PLAY.slice();
    const one = async id => { try { const d = await get('https://store.steampowered.com/api/appdetails?appids=' + id + '&l=english&cc=us', DAY * 3); const x = d && d[id] && d[id].data; if (x && x.is_free && x.name) out.push({ id: 'steam:' + id, kind: 'steam', appid: String(id), title: x.name, img: x.header_image || '', price: 'Free', was: '', off: 0, sub: (x.genres || []).slice(0, 2).map(g => g.description).join(' / ') }); } catch {} };
    for (let i = 0; i < ids.length; i += 4) await Promise.all(ids.slice(i, i + 4).map(one));
    return out.sort((a, b) => FREE_TO_PLAY.indexOf(+a.appid) - FREE_TO_PLAY.indexOf(+b.appid));
  }
  async function epicFree() {
    const d = await get('https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US', 30 * 60000), els = (((d || {}).data || {}).Catalog || {}).searchStore; const list = (els && els.elements) || [], out = [];
    list.forEach(e => {
      const po = e.promotions && e.promotions.promotionalOffers && e.promotions.promotionalOffers[0] && e.promotions.promotionalOffers[0].promotionalOffers && e.promotions.promotionalOffers[0].promotionalOffers[0];
      const up = e.promotions && e.promotions.upcomingPromotionalOffers && e.promotions.upcomingPromotionalOffers[0] && e.promotions.upcomingPromotionalOffers[0].promotionalOffers && e.promotions.upcomingPromotionalOffers[0].promotionalOffers[0];
      const free = e.price && e.price.totalPrice && e.price.totalPrice.discountPrice === 0 && po; if (!free && !up) return;
      const ki = e.keyImages || [], img = ['OfferImageWide', 'DieselStoreFrontWide', 'Thumbnail'].map(t => ki.find(k => k.type === t)).find(Boolean) || ki[0]; const sl = (e.offerMappings && e.offerMappings[0] && e.offerMappings[0].pageSlug) || e.productSlug || e.urlSlug || ''; if (!/^[a-z0-9-]+$/i.test(sl.replace(/\/home$/, ''))) return;
      out.push({ id: 'epic:' + e.id, kind: 'epic', slug: sl.replace(/\/home$/, ''), title: e.title, img: img ? img.url : '', price: free ? 'Free now' : 'Free soon', was: '', off: 0, sub: free ? 'until ' + String(po.endDate || '').slice(0, 10) : 'from ' + String(up.startDate || '').slice(0, 10) });
    });
    return out.sort((a, b) => (a.price === 'Free now' ? 0 : 1) - (b.price === 'Free now' ? 0 : 1));
  }

  // ---------- winget ----------
  let wingetCache = null;
  const runWinget = (args, o) => new Promise(res => {
    if (ctx.winget) return res(ctx.winget(args, o)); let out = '', done = false; const fin = r => { if (!done) { done = true; res(r); } };
    let p; try { p = cp.spawn('winget', args, { windowsHide: true }); } catch (e) { return fin({ code: -1, out: '', missing: true }); }
    const t = setTimeout(() => { try { p.kill(); } catch {} fin({ code: -2, out, timeout: true }); }, (o && o.timeout) || 20 * 60000);
    const feed = d => { const s = d.toString('utf8').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''); out += s; if (o && o.onLine) s.split(/[\r\n]+/).map(x => x.trim()).filter(x => x && !/^[-\\|\/]$/.test(x)).forEach(o.onLine); };
    p.stdout.on('data', feed); p.stderr.on('data', feed); p.on('error', () => { clearTimeout(t); fin({ code: -1, out, missing: true }); }); p.on('exit', code => { clearTimeout(t); fin({ code, out }); });
  });
  async function wingetState(force) {
    if (!force && wingetCache && now() - wingetCache.t < 60000) return wingetCache.v;
    const v = await runWinget(['--version']); if (v.missing || v.code !== 0) { wingetCache = { t: now(), v: { has: false, ids: [] } }; return wingetCache.v; }
    const l = await runWinget(['list', '--accept-source-agreements'], { timeout: 60000 }), txt = String(l.out || '').toLowerCase();
    const ids = APPS.filter(a => txt.includes(a.id.toLowerCase())).map(a => a.id); wingetCache = { t: now(), v: { has: true, ids } }; return wingetCache.v;
  }
  const appItem = (a, st) => ({ id: 'app:' + a.id, kind: 'winget', wid: a.id, source: a.source || '', title: a.name, sub: a.sub, cat: a.cat, match: a.match, price: 'Free', installed: !!(st && st.ids.includes(a.id)), img: '' });
  async function install(a) {
    const app = APPS.find(x => x.id === (a && a.wid)); if (!app) return { ok: false, error: 'Unknown app.' }; const st = await wingetState(true); if (!st.has) return { ok: false, error: 'winget is not available on this PC. Install "App Installer" from the Microsoft Store, then try again.', nowinget: true };
    const args = ['install', '--id', app.id, '-e', '--silent', '--accept-package-agreements', '--accept-source-agreements']; if (app.source) args.push('--source', app.source);
    const r = await runWinget(args, { onLine: l => ctx.progress && ctx.progress({ id: app.id, line: l.slice(0, 120) }) }); wingetCache = null;
    if (r.code === 0 || /already installed|No available upgrade/i.test(r.out)) return { ok: true, name: app.name, match: app.match };
    if (/No package found|no packages? matched/i.test(r.out)) return { ok: false, error: app.name + ' was not found in the winget catalog.' };
    if (r.timeout) return { ok: false, error: 'It took too long. A permission window may be waiting behind SKBox.' };
    return { ok: false, error: app.name + ' did not install (winget code ' + r.code + '). A Windows permission window may have been declined.' };
  }
  async function uninstall(a) {
    const app = APPS.find(x => x.id === (a && a.wid)); if (!app) return { ok: false, error: 'Unknown app.' }; const r = await runWinget(['uninstall', '--id', app.id, '-e', '--silent', '--accept-source-agreements']); wingetCache = null;
    return r.code === 0 ? { ok: true } : { ok: false, error: app.name + ' could not be removed. Use Windows Settings > Apps instead.' };
  }

  // ---------- public ----------
  async function home() {
    const settled = p => p.then(v => ({ v }), e => ({ e }));
    const [sf, ftp, ep, st] = await Promise.all([settled(steamFeatured()), settled(freeToPlay()), settled(epicFree()), settled(wingetState())]); const wst = st.v || { has: false, ids: [] };
    const sections = []; const errs = [];
    const skItems = SK_APPS.map(a => ({ id: 'sk:' + a.id, kind: 'sk', appid: a.id, title: a.name, sub: a.sub, art: a.art, grad: a.grad, price: 'Included', img: '' }));
    const apps = APPS.map(a => appItem(a, wst));
    const feat = [skItems[0]]; if (ep.v && ep.v.length) feat.push(ep.v.find(x => x.price === 'Free now') || ep.v[0]); if (ftp.v && ftp.v.length) feat.push(...ftp.v.slice(0, 3)); if (sf.v) { feat.push(...sf.v.deals.slice(0, 3)); feat.push(...sf.v.top.slice(0, 2)); } feat.push(apps[0]);
    sections.push({ id: 'featured', title: 'Featured', items: feat });
    sections.push({ id: 'sk', title: 'SK apps', items: skItems });
    sections.push({ id: 'free', title: 'Free to play', items: ftp.v || [], err: ftp.e ? 'Could not reach Steam.' : '' });
    sections.push({ id: 'deals', title: 'Steam deals', items: sf.v ? sf.v.deals : [], err: sf.e ? 'Could not reach Steam.' : '' });
    sections.push({ id: 'top', title: 'Top sellers', items: sf.v ? sf.v.top : [], err: sf.e ? 'Could not reach Steam.' : '' });
    sections.push({ id: 'new', title: 'New releases', items: sf.v ? sf.v.fresh : [], err: sf.e ? 'Could not reach Steam.' : '' });
    sections.push({ id: 'epic', title: 'Epic free games', items: ep.v || [], err: ep.e ? 'Could not reach Epic.' : '' });
    sections.push({ id: 'apps', title: 'Apps & tools', items: apps, winget: wst.has });
    return { ok: true, sections };
  }
  async function steamInfo(a) {
    const id = String((a && a.appid) || ''); if (!/^\d+$/.test(id)) return { ok: false, error: 'Bad id.' };
    try { const info = await gameinfo.viaSteam('', id, FJ); return info ? { ok: true, info: { title: info.title, summary: info.summary, genres: info.genres, developers: info.developers, released: info.released, score: info.score, screenshots: (info.screenshots || []).slice(0, 4), header: info.header, url: info.url } } : { ok: true, none: true }; }
    catch { return { ok: false, error: 'Could not reach Steam.' }; }
  }
  async function search(a) {
    const q = String((a && a.q) || '').trim().slice(0, 60); if (q.length < 2) return { ok: false, error: 'Type at least two letters.' };
    try { const d = await get('https://store.steampowered.com/api/storesearch/?term=' + encodeURIComponent(q) + '&l=english&cc=us', 5 * 60000); const items = ((d && d.items) || []).filter(x => !x.type || x.type === 'app').slice(0, 20).map(x => ({ id: 'steam:' + x.id, kind: 'steam', appid: String(x.id), title: x.name, img: 'https://cdn.cloudflare.steamstatic.com/steam/apps/' + x.id + '/header.jpg', price: x.price ? money(x.price.final, x.price.currency) : 'Free', was: x.price && x.price.initial > x.price.final ? money(x.price.initial, x.price.currency) : '', off: x.price && x.price.initial > x.price.final ? Math.round((1 - x.price.final / x.price.initial) * 100) : 0, sub: '' }));
      const local = APPS.filter(x => (x.name + ' ' + x.sub + ' ' + x.cat).toLowerCase().includes(q.toLowerCase())).map(x => appItem(x, wingetCache && wingetCache.v)); return { ok: true, items: local.concat(items) }; }
    catch { return { ok: false, error: 'Could not reach Steam.' }; }
  }
  function open(a) {
    const u = String((a && a.url) || ''); if (!OPEN_OK.some(re => re.test(u))) return { ok: false, error: 'That link is not allowed.' }; if (ctx.openExternal) ctx.openExternal(u); return { ok: true };
  }
  const epicInstalled = () => { try { return fs.existsSync(path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Epic Games', 'Launcher', 'Portal', 'Binaries', 'Win32', 'EpicGamesLauncher.exe')); } catch { return false; } };
  async function run(name, a) {
    if (typeof name !== 'string' || !name.startsWith('store')) return null;
    try { switch (name) { case 'storeHome': return await home(); case 'storeSteamInfo': return await steamInfo(a); case 'storeSearch': return await search(a); case 'storeInstall': return await install(a); case 'storeUninstall': return await uninstall(a); case 'storeOpen': return open(a); case 'storeWinget': return Object.assign({ ok: true }, await wingetState(true)); case 'storeEpicInstalled': return { ok: true, installed: epicInstalled() }; } }
    catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 160) }; } return null;
  }
  return { run };
}
module.exports = { create, APPS, FREE_TO_PLAY, OPEN_OK, money };
