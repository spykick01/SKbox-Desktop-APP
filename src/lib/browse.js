// SKBrowse: the built-in browser (tabs, ad block, Chrome Web Store extensions) and "browser apps" (one site, locked, its own window).
// Page contents live in WebContentsViews; the bar / tabs / panels are a local page (renderer/browse/chrome.html) in the window itself.
const { BrowserWindow, WebContentsView, session, ipcMain, app, shell, net, clipboard, screen, Notification, dialog, nativeImage } = require('electron');
const path = require('path'), fs = require('fs'), zlib = require('zlib');
const AD = require('./adlist');

const FULL = 'persist:skbrowse', SEARCH = { google: 'https://www.google.com/search?q=', duckduckgo: 'https://duckduckgo.com/?q=', bing: 'https://www.bing.com/search?q=', brave: 'https://search.brave.com/search?q=', youtube: 'https://www.youtube.com/results?search_query=' };
const AUTH_HOSTS = ['accounts.google.com', 'accounts.youtube.com', 'appleid.apple.com', 'login.microsoftonline.com', 'login.live.com', 'www.facebook.com', 'api.twitter.com', 'id.twitch.tv', 'discord.com', 'auth0.com', 'okta.com'];
const THIRD = (h) => String(h || '').split('.').slice(-2).join('.');
const sameSite = (a, b) => { a = String(a || '').toLowerCase(); b = String(b || '').toLowerCase(); return a === b || THIRD(a) === THIRD(b); };
const hostOf = u => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
const COOKIE_CSS = '#onetrust-consent-sdk,#onetrust-banner-sdk,.cookie-banner,.cookie-consent,.cookie-notice,#cookie-banner,#cookieBanner,#cookie-notice,.cc-window,.cc-banner,#CybotCookiebotDialog,.truste_overlay,#truste-consent-track,.qc-cmp2-container,#didomi-host,.fc-consent-root,[id*="cookie-consent"],[class*="cookie-consent"],[aria-label*="cookie" i][role="dialog"],#usercentrics-root{display:none!important}body{overflow:auto!important}';
const SKIP_JS = `(function(){if(window.__sksk)return;window.__sksk=1;var re=/^\\s*(skip\\s*(intro|recap|opening|credits|ad|ads|the intro)|next\\s*episode|continue\\s*watching|are you still watching)\\s*$/i;setInterval(function(){try{var b=document.querySelectorAll('button,[role=button],a');for(var i=0;i<b.length;i++){var t=(b[i].innerText||b[i].getAttribute('aria-label')||'').trim();if(t.length<30&&re.test(t)&&b[i].offsetParent){b[i].click();break;}}}catch(e){}},1500);})();`;
const CURSOR_JS = `(function(){if(window.__skcur)return;window.__skcur=1;var t,st=document.createElement('style');st.textContent='html.skhc,html.skhc *{cursor:none!important}';document.documentElement.appendChild(st);function show(){document.documentElement.classList.remove('skhc');clearTimeout(t);t=setTimeout(function(){if(document.querySelector('video'))document.documentElement.classList.add('skhc');},3000);}document.addEventListener('mousemove',show,true);show();})();`;
const SPEED_JS = `(function(){if(window.__sksp)return;window.__sksp=1;document.addEventListener('keydown',function(e){var v=document.querySelector('video');if(!v||/INPUT|TEXTAREA/.test((document.activeElement||{}).tagName||''))return;if(e.key===']'){v.playbackRate=Math.min(4,Math.round((v.playbackRate+0.25)*100)/100);}else if(e.key==='['){v.playbackRate=Math.max(0.25,Math.round((v.playbackRate-0.25)*100)/100);}else if(e.key==='\\\\'){v.playbackRate=1;}else return;},true);})();`;
const READER_JS = `(function(){var a=document.querySelector('article')||document.querySelector('main')||document.body;var t=Array.from(a.querySelectorAll('h1,h2,h3,p,li,blockquote,pre,img')).map(function(n){if(n.tagName==='IMG')return n.width>200?'<img src="'+n.src+'" style="max-width:100%">':'';return '<'+n.tagName.toLowerCase()+'>'+n.innerHTML.replace(/<(?!\\/?(a|b|i|em|strong|code)\\b)[^>]*>/g,'')+'</'+n.tagName.toLowerCase()+'>';}).join('');document.open();document.write('<meta charset=utf-8><style>body{max-width:720px;margin:40px auto;padding:0 20px;font:20px/1.7 Georgia,serif;background:#faf6ee;color:#222}img{border-radius:8px}a{color:#0a6}h1,h2,h3{font-family:Segoe UI,sans-serif}</style><title>'+document.title+'</title>'+t);document.close();})();`;
const TRACK_P = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|igshid|mc_eid|mc_cid|_hsenc|_hsmi|yclid|twclid|ttclid|ref_src)$/i;
const DRM = ['netflix.com', 'disneyplus.com', 'hulu.com', 'max.com', 'hbomax.com', 'primevideo.com', 'peacocktv.com', 'paramountplus.com', 'tv.apple.com', 'crunchyroll.com', 'spotify.com', 'sling.com', 'fubo.tv', 'tv.youtube.com'];

// ---- tiny ZIP reader (for Chrome extensions: .crx is a zip with a header). No dependency needed. ----
function unzip(buf, dest) {
  let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--; if (e < 0) throw new Error('Not a zip file');
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16), count = 0; const root = path.resolve(dest);
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), csz = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lh = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl); p += 46 + nl + xl + cl;
    const out = path.resolve(root, name); if (out !== root && !out.startsWith(root + path.sep)) continue;   // never write outside the folder
    if (/\/$/.test(name)) { fs.mkdirSync(out, { recursive: true }); continue; }
    const lnl = buf.readUInt16LE(lh + 26), lxl = buf.readUInt16LE(lh + 28), ds = lh + 30 + lnl + lxl, raw = buf.subarray(ds, ds + csz);
    fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, method === 8 ? zlib.inflateRawSync(raw) : raw); count++;
  }
  return count;
}
function crxToZip(b) {
  if (b.toString('latin1', 0, 4) !== 'Cr24') return b;   // already a zip
  const v = b.readUInt32LE(4); if (v === 2) return b.subarray(16 + b.readUInt32LE(8) + b.readUInt32LE(12)); if (v === 3) return b.subarray(12 + b.readUInt32LE(8)); throw new Error('Unknown extension format');
}

function create(ctx) {
  const ST = () => ctx.store.read('browse', {}), SAVE = o => ctx.store.write('browse', o);
  const S = () => ctx.store.read('settings', {});
  const opt = (k, d) => { const v = S()[k]; return v === undefined ? d : v; };
  const extra = new Set(); let adHosts = new Set(AD.HOSTS), blocked = 0, pendingTotal = 0; const wins = new Set(); let lastFocus = null;
  function loadList() { try { (ST().blockHosts || []).forEach(h => adHosts.add(h)); } catch {} try { const t = fs.readFileSync(path.join(app.getPath('userData'), 'adlist.txt'), 'utf8'); t.split(/\r?\n/).forEach(l => { const m = /^(?:0\.0\.0\.0|127\.0\.0\.1)\s+([a-z0-9.-]+)/i.exec(l.trim()); if (m && m[1] !== 'localhost') adHosts.add(m[1].toLowerCase()); }); } catch {} }
  loadList();
  const isAdHost = h => { while (h) { if (adHosts.has(h)) return true; const i = h.indexOf('.'); if (i < 0) break; h = h.slice(i + 1); } return false; };
  const cfgs = new Map();   // partition -> { adblock, allow:Set(hosts with ad block off), lock:string|'' }
  const hooked = new WeakSet();
  const ua = () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + process.versions.chrome + ' Safari/537.36';
  function hook(part, cfg) {
    cfgs.set(part, cfg); const ses = session.fromPartition(part);
    if (hooked.has(ses)) return ses; hooked.add(ses);
    try { ses.setUserAgent(ua()); } catch {}
    ses.webRequest.onBeforeRequest((d, cb) => {
      const c = cfgs.get(part);
      if (d.resourceType === 'mainFrame') {   // tidy typed / clicked links: strip tracking parameters, optionally force https
        if (c) try { const u = new URL(d.url); let ch = false; if (!c.lock && opt('sbClean', true)) for (const k of Array.from(u.searchParams.keys())) if (TRACK_P.test(k)) { u.searchParams.delete(k); ch = true; }
          if (opt('sbHttpsAll', false) && u.protocol === 'http:' && !/^(localhost|127\.|192\.168\.|10\.|.*\.local$)/.test(u.hostname)) { u.protocol = 'https:'; ch = true; }
          if (ch) return cb({ redirectURL: u.href }); } catch {}
        return cb({});
      }
      if (!c || !c.adblock) return cb({});
      let h = '', ph = ''; try { h = new URL(d.url).hostname.toLowerCase(); ph = d.referrer ? new URL(d.referrer).hostname.toLowerCase() : ''; } catch { return cb({}); }
      if (c.allow && (c.allow.has(ph) || c.allow.has(THIRD(ph)))) return cb({});
      let bad = !sameSite(h, ph) && isAdHost(h);
      if (!bad && ph && !sameSite(h, ph) && ['script', 'image', 'xhr', 'subFrame', 'ping', 'other'].includes(d.resourceType)) bad = AD.PATHS.some(r => r.test(d.url));
      if (!bad && /youtube\.com$/.test(h) && /\/(?:api\/stats\/ads|pagead\/|ptracking)/.test(d.url)) bad = true;
      if (bad) { blocked++; if (++pendingTotal >= 25) { pendingTotal = 0; try { const o = ST(); o.total = (o.total || 0) + 25; SAVE(o); } catch {} } if (c.count) c.count(); return cb({ cancel: true }); }
      cb({});
    });
    ses.webRequest.onBeforeSendHeaders((d, cb) => { if (opt('sbDnt', true)) { d.requestHeaders['DNT'] = '1'; d.requestHeaders['Sec-GPC'] = '1'; } cb({ requestHeaders: d.requestHeaders }); });
    try { ses.setPermissionRequestHandler((_wc, perm, cb) => cb(opt('sbPerms', true) ? ['fullscreen', 'clipboard-sanitized-write', 'media', 'pointerLock', 'window-management'].includes(perm) && perm !== 'media' : true)); } catch {}
    ses.on('will-download', (_e, item) => {
      const dir = app.getPath('downloads'); const p = path.join(dir, item.getFilename()); try { item.setSavePath(p); } catch {}
      item.once('done', (_ev, st) => { if (st === 'completed') { const o = ST(); o.downloads = [{ name: item.getFilename(), file: p, t: Date.now() }].concat(o.downloads || []).slice(0, 40); SAVE(o); try { ctx.notify('Download finished', item.getFilename()); } catch {} } });
    });
    return ses;
  }

  // ---- extensions (Chrome Web Store) ----
  const extDir = () => path.join(app.getPath('userData'), 'extensions');
  const extOf = ses => ses.extensions || ses;
  async function loadAllExt() {
    const ses = session.fromPartition(FULL), list = ST().ext || [];
    for (const x of list) if (x.on !== false) { try { await extOf(ses).loadExtension(path.join(extDir(), x.id), { allowFileAccess: true }); } catch (e) { x.err = String(e.message || e).slice(0, 120); } }
  }
  const extId = s => { const m = /[a-p]{32}/.exec(String(s || '')); return m ? m[0] : ''; };
  async function installExt(input) {
    const id = extId(input); if (!id) return { ok: false, error: 'Paste an extension link from the Chrome Web Store (it has a 32-letter ID).' };
    const url = 'https://clients2.google.com/service/update2/crx?response=redirect&os=win&arch=x64&os_arch=x86_64&nacl_arch=x86-64&prod=chromecrx&prodchannel=stable&prodversion=' + process.versions.chrome + '&lang=en-US&acceptformat=crx2,crx3&x=' + encodeURIComponent('id=' + id + '&installsource=ondemand&uc');
    try {
      const r = await net.fetch(url, { redirect: 'follow' }); if (!r.ok) return { ok: false, error: 'The Web Store did not give that extension (' + r.status + ').' };
      const buf = Buffer.from(await r.arrayBuffer()); if (buf.length < 100) return { ok: false, error: 'That extension is not available.' };
      const dir = path.join(extDir(), id); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); unzip(crxToZip(buf), dir);
      const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); let name = man.name || id;
      if (/^__MSG_/.test(name)) { try { const loc = (man.default_locale || 'en'); const m = JSON.parse(fs.readFileSync(path.join(dir, '_locales', loc, 'messages.json'), 'utf8')); name = (m[name.slice(6, -2)] || m[name.slice(6, -2).toLowerCase()] || {}).message || id; } catch { name = id; } }
      const ses = session.fromPartition(FULL); try { const old = (extOf(ses).getAllExtensions ? extOf(ses).getAllExtensions() : []).find(e => e.path === dir); if (old) await extOf(ses).removeExtension(old.id); } catch {}
      await extOf(ses).loadExtension(dir, { allowFileAccess: true });
      const o = ST(); o.ext = (o.ext || []).filter(x => x.id !== id).concat([{ id, name: String(name).slice(0, 60), version: man.version || '', on: true }]); SAVE(o);
      return { ok: true, name };
    } catch (e) { return { ok: false, error: 'Could not install it: ' + String(e.message || e).slice(0, 140) }; }
  }
  async function removeExt(id) { try { const ses = session.fromPartition(FULL); try { const dir = path.join(extDir(), id); const old = (extOf(ses).getAllExtensions ? extOf(ses).getAllExtensions() : []).find(e => e.path === dir); if (old) await extOf(ses).removeExtension(old.id); } catch {} fs.rmSync(path.join(extDir(), id), { recursive: true, force: true }); const o = ST(); o.ext = (o.ext || []).filter(x => x.id !== id); SAVE(o); return { ok: true }; } catch { return { ok: false }; } }
  async function toggleExt(id) { const o = ST(), x = (o.ext || []).find(y => y.id === id); if (!x) return { ok: false }; x.on = x.on === false; SAVE(o); const ses = session.fromPartition(FULL); try { if (x.on) await extOf(ses).loadExtension(path.join(extDir(), id), { allowFileAccess: true }); else { const dir = path.join(extDir(), id); const old = (extOf(ses).getAllExtensions ? extOf(ses).getAllExtensions() : []).find(e => e.path === dir); if (old) await extOf(ses).removeExtension(old.id); } } catch {} return { ok: true, on: x.on }; }
  async function updateList() {
    try { const r = await net.fetch('https://pgl.yoyo.org/adservers/serverlist.php?hostformat=hosts&showintro=0&mimetype=plaintext'); if (!r.ok) return { ok: false, error: 'Could not download the list.' }; const t = await r.text(); fs.writeFileSync(path.join(app.getPath('userData'), 'adlist.txt'), t); const before = adHosts.size; loadList(); const o = ST(); o.listAt = Date.now(); SAVE(o); return { ok: true, n: adHosts.size, added: adHosts.size - before }; }
    catch { return { ok: false, error: 'No internet connection.' }; }
  }

  // ---- windows ----
  function open(a) {
    a = a || {}; const isApp = !!a.app;
    if (isApp) for (const w of wins) if (w._appId === a.app.id) { w.show(); w.focus(); return { ok: true }; }
    if (!isApp && !a.private) for (const w of wins) if (!w._appId && !w._priv) { w.show(); w.focus(); if (a.url) w._api.newTab(a.url); return { ok: true }; }
    const d = ctx.display(); const part = isApp ? 'persist:skbapp-' + String(a.app.id).replace(/[^\w-]/g, '') : (a.private ? 'skpriv-' + Date.now() : FULL);
    const priv = !!a.private; if (priv) a.private = true;
    const cfg = { adblock: isApp ? a.app.adblock !== false : opt('sbAdblock', true), allow: new Set(ST().allow || []), count: null, lock: isApp };
    if (isApp && a.app.adblock === false) cfg.allow = new Set();
    const ses = hook(part, cfg);
    const win = new BrowserWindow({ x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height, frame: false, fullscreen: isApp ? !a.app.windowed : opt('sbFullscreen', true), backgroundColor: '#0b0f1a', show: true, skipTaskbar: false, title: isApp ? a.app.name : 'SKBrowse', webPreferences: { preload: path.join(__dirname, '..', 'browsePreload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
    win._appId = isApp ? a.app.id : ''; win._priv = priv; wins.add(win); win.removeMenu && win.removeMenu();
    const home = isApp ? a.app.url : (opt('sbHome', '') || ''); const lockHost = isApp ? hostOf(a.app.url) : '';
    const tabs = []; let speed = 1, activeId = 0, nextId = 1, panel = '', htmlFs = false, barHidden = isApp && !!a.app.barHidden, zoomPct = isApp && a.app.zoom ? a.app.zoom : 100, ua2 = ''; const closed = [];
    const TABH = isApp ? 0 : 38, BAR = isApp ? 38 : 52;
    const top = () => (htmlFs || barHidden) ? 0 : TABH + BAR + 2;
    const act = () => tabs.find(t => t.id === activeId);
    const send = () => { try { if (!isApp && !priv && opt('sbRestore', false) && tabs.length) { const o = ST(), us = tabs.map(t => t.url).filter(u => /^https?:/.test(u)); if (JSON.stringify(o.session) !== JSON.stringify(us)) { o.session = us; SAVE(o); } } } catch {} try { if (chromeView && !chromeView.webContents.isDestroyed()) chromeView.webContents.send('browse:state', state()); } catch {} };
    const state = () => ({ app: isApp ? { id: a.app.id, name: a.app.name, host: lockHost } : null, panel, htmlFs, barHidden, zoom: zoomPct, adblock: cfg.adblock, siteAllow: act() ? cfg.allow.has(hostOf(act().url)) : false, blocked, active: activeId,
      tabs: tabs.map(t => ({ id: t.id, title: t.title || t.url || 'New tab', url: t.url, icon: t.icon, loading: t.loading, audible: t.audible, muted: t.muted, pinned: t.pinned, back: t.wc.navigationHistory ? t.wc.navigationHistory.canGoBack() : t.wc.canGoBack(), fwd: t.wc.navigationHistory ? t.wc.navigationHistory.canGoForward() : t.wc.canGoForward() })),
      star: act() ? (ST().bookmarks || []).some(b => b.url === act().url) : false, priv, total: (ST().total || 0) + pendingTotal, speed, sb: { clock: opt('sbClock', true), cursor: opt('sbHideCursor', true), skip: opt('sbSkipIntro', true), cookies: opt('sbCookies', true), dnt: opt('sbDnt', true), clean: opt('sbClean', true), perms: opt('sbPerms', true), clearExit: opt('sbClearExit', false), restore: opt('sbRestore', false), httpsAll: opt('sbHttpsAll', false), keys: opt('sbSpeedKeys', true), search: opt('sbSearch', 'google'), dark: opt('sbDark', false), https: opt('sbHttps', true), fs: opt('sbFullscreen', true), hist: opt('sbHistory', true), popups: opt('sbPopups', true), closeLast: opt('sbCloseLast', 'home') } });
    function layout() {
      const b = win.getContentBounds(), t = top();
      win.contentView.children.forEach(v => { if (v._tab) { const on = v._tab.id === activeId && !panel; v.setVisible(on); if (on) v.setBounds({ x: 0, y: t, width: b.width, height: Math.max(50, b.height - t) }); } });
      if (chromeView) { chromeView.setVisible(!htmlFs); chromeView.setBounds({ x: 0, y: 0, width: b.width, height: panel ? b.height : Math.max(0, t) }); }
    }
    var chromeView = new WebContentsView({ webPreferences: { preload: path.join(__dirname, '..', 'browsePreload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
    win.contentView.addChildView(chromeView); chromeView.webContents.loadFile(path.join(__dirname, '..', '..', 'renderer', 'browse', 'chrome.html'));
    chromeView.webContents.on('did-finish-load', () => { send(); try { chromeView.webContents.send('active-pad', a.pad | 0); } catch {} });
    const fixUrl = s => {
      s = String(s || '').trim(); if (!s) return home || 'about:blank';
      if (/^(https?|file|about|chrome):/i.test(s)) return s;
      if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(s) && !/\s/.test(s)) return (opt('sbHttps', true) ? 'https://' : 'http://') + s;
      if (/^localhost(:\d+)?(\/.*)?$/i.test(s)) return 'http://' + s;
      return (SEARCH[opt('sbSearch', 'google')] || SEARCH.google) + encodeURIComponent(s);
    };
    function drm() { return false; }   // protected sites play inside SKBrowse (Widevine); no more Edge hand-off
    function allowNav(u) {
      if (!isApp) return true; const h = hostOf(u); if (!h) return /^(about|blob|data):/i.test(u);
      if (sameSite(h, lockHost)) return true; if (a.app.auth !== false && AUTH_HOSTS.some(x => h === x || h.endsWith('.' + x))) return true; return false;
    }
    function newTab(url, bg) {
      if (isApp && tabs.length >= 1) { const t = tabs[0]; if (url && allowNav(url)) t.wc.loadURL(url); else if (url) ctx.notify(a.app.name, 'This app only works for ' + lockHost); return t.id; }
      if (url && drm(fixUrl(url))) return 0;
      if (tabs.length >= 30) { ctx.notify('SKBrowse', 'Too many tabs open'); return 0; }
      const view = new WebContentsView({ webPreferences: { partition: part, preload: path.join(__dirname, '..', 'guestPreload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required', spellcheck: false } });
      const wc = view.webContents, tab = { id: nextId++, view, wc, title: '', url: '', icon: '', loading: false, audible: false, muted: false, pinned: false }; view._tab = tab; tabs.push(tab);
      try { wc.setUserAgent(ua()); } catch {} win.contentView.addChildView(view);
      const upd = () => { tab.url = wc.getURL(); tab.title = wc.getTitle(); send(); };
      wc.on('page-title-updated', upd); wc.on('did-navigate', (_e, u) => { upd(); history(tab); injectAll(tab); if (isApp && a.app.resume !== false && /^https?:/.test(u) && sameSite(hostOf(u), lockHost)) { const o = ST(); o.last = o.last || {}; if (o.last[a.app.id] !== u) { o.last[a.app.id] = u; SAVE(o); } } }); wc.on('did-navigate-in-page', upd);
      wc.on('page-favicon-updated', (_e, f) => { tab.icon = (f && f[0]) || ''; send(); });
      wc.on('did-start-loading', () => { tab.loading = true; send(); }); wc.on('did-stop-loading', () => { tab.loading = false; upd(); injectAll(tab); if (tab.id === activeId && !panel) { try { wc.focus(); } catch {} } });
      wc.on('audio-state-changed', e => { tab.audible = !!e.audible; send(); });
      wc.on('dom-ready', () => { injectAll(tab); try { wc.send('active-pad', a.pad | 0); } catch {} try { const z = (ST().zoom || {})[hostOf(wc.getURL())]; if (z) wc.setZoomFactor(z / 100); else if (isApp && a.app.zoom) wc.setZoomFactor(a.app.zoom / 100); else if (opt('sbZoom', 100) !== 100) wc.setZoomFactor(opt('sbZoom', 100) / 100); } catch {} });
      wc.on('will-navigate', (e, u) => { if (drm(u)) { e.preventDefault(); return; } if (!allowNav(u)) { e.preventDefault(); ctx.notify(isApp ? a.app.name : 'SKBrowse', 'Blocked: ' + hostOf(u) + (isApp ? ' (this app only works for ' + lockHost + ')' : '')); } });
      wc.on('will-redirect', (e, u) => { if (!allowNav(u)) e.preventDefault(); });
      wc.setWindowOpenHandler(({ url }) => { if (isApp) { if (allowNav(url)) wc.loadURL(url); return { action: 'deny' }; } if (opt('sbPopups', true) === false && !/^https?:/.test(url)) return { action: 'deny' }; newTab(url); return { action: 'deny' }; });
      wc.on('enter-html-full-screen', () => { htmlFs = true; try { win.setFullScreen(true); } catch {} layout(); send(); }); wc.on('leave-html-full-screen', () => { htmlFs = false; if (!opt('sbFullscreen', true)) try { win.setFullScreen(false); } catch {} layout(); send(); });
      wc.on('before-input-event', (e, i) => { if (i.type !== 'keyDown') return; const k = i.key; if (k === 'F10' || (i.control && i.shift && k.toLowerCase() === 'h' && false)) { barHidden = !barHidden; layout(); send(); e.preventDefault(); } else if (i.control && k.toLowerCase() === 'l' && !isApp) { chromeView.webContents.focus(); chromeView.webContents.send('browse:focusUrl'); e.preventDefault(); } else if (i.control && k.toLowerCase() === 't' && !isApp) { newTab(''); e.preventDefault(); } else if (i.control && k.toLowerCase() === 'w' && !isApp) { closeTab(tab.id); e.preventDefault(); } else if (k === 'F5' || (i.control && k.toLowerCase() === 'r')) { wc.reload(); e.preventDefault(); } else if (i.alt && k === 'ArrowLeft') { back(); e.preventDefault(); } else if (i.alt && k === 'ArrowRight') { fwd(); e.preventDefault(); } else if (k === 'Escape' && panel) { setPanel(''); e.preventDefault(); } });
      wc.on('context-menu', (_e, p) => { const { Menu } = require('electron'); const m = []; if (p.linkURL) { if (!isApp) m.push({ label: 'Open link in new tab', click: () => newTab(p.linkURL) }); m.push({ label: 'Copy link', click: () => clipboard.writeText(p.linkURL) }); } if (p.selectionText) { m.push({ label: 'Copy', role: 'copy' }); if (!isApp) m.push({ label: 'Search for \u201C' + p.selectionText.slice(0, 24) + '\u201D', click: () => newTab(p.selectionText) }); } if (p.isEditable) m.push({ label: 'Paste', role: 'paste' }); if (p.mediaType === 'image') { m.push({ label: 'Save image', click: () => { try { wc.downloadURL(p.srcURL); } catch {} } }, { label: 'Copy image address', click: () => clipboard.writeText(p.srcURL) }); } m.push({ label: 'Back', enabled: wc.canGoBack(), click: () => wc.goBack() }, { label: 'Reload', click: () => wc.reload() }); Menu.buildFromTemplate(m).popup(); });
      wc.on('render-process-gone', () => { try { wc.reload(); } catch {} });
      activeId = bg ? activeId : tab.id; const u = fixUrl(url); if (!allowNav(u)) { wc.loadURL(home); } else if (u !== 'about:blank') wc.loadURL(u); else wc.loadFile(path.join(__dirname, '..', '..', 'renderer', 'browse', 'newtab.html'));
      layout(); send(); setTimeout(focusActive, 60); return tab.id;
    }
    function injectAll(tab) {
      const wc = tab.wc, u = wc.getURL(); if (!/^https?:/.test(u)) return; const h = hostOf(u), off = cfg.allow.has(h) || cfg.allow.has(THIRD(h));
      try { if (cfg.adblock && !off) { wc.insertCSS(AD.CSS).catch(() => {}); if (/(^|\.)youtube\.com$/.test(h)) wc.executeJavaScript(AD.YT).catch(() => {}); } } catch {}
      try { if (opt('sbCookies', true) && !off) wc.insertCSS(COOKIE_CSS).catch(() => {}); } catch {}
      try { if ((opt('sbDark', false) && !isApp) || (isApp && a.app.dark)) wc.insertCSS('html{filter:invert(.92) hue-rotate(180deg)}img,video,picture,canvas,svg image{filter:invert(1) hue-rotate(180deg)}').catch(() => {}); } catch {}
      try { if (opt('sbHideCursor', true)) wc.executeJavaScript(CURSOR_JS).catch(() => {}); if (opt('sbSkipIntro', true)) wc.executeJavaScript(SKIP_JS).catch(() => {}); if (opt('sbSpeedKeys', true)) wc.executeJavaScript(SPEED_JS).catch(() => {}); } catch {}
    }
    function history(tab) { if (isApp || priv || opt('sbHistory', true) === false) return; const u = tab.wc.getURL(); if (!/^https?:/.test(u)) return; const o = ST(); o.history = [{ url: u, title: tab.wc.getTitle(), t: Date.now() }].concat((o.history || []).filter(x => x.url !== u)).slice(0, 400); SAVE(o); }
    function closeTab(id) {
      if (isApp) return; const i = tabs.findIndex(t => t.id === id); if (i < 0) return; const t = tabs[i]; if (t.pinned && !closeTab._f) { }
      if (t.url && /^https?:/.test(t.url)) closed.unshift(t.url); closed.length = Math.min(closed.length, 15);
      try { win.contentView.removeChildView(t.view); t.wc.close(); } catch {} tabs.splice(i, 1);
      if (!tabs.length) { if (opt('sbCloseLast', 'home') === 'exit') return close(); newTab(''); return; } if (activeId === id) activeId = tabs[Math.min(i, tabs.length - 1)].id; layout(); send();
    }
    const back = () => { const t = act(); if (t) { if (t.wc.canGoBack()) t.wc.goBack(); else if (!isApp && tabs.length > 1 && opt('sbBackClose', false)) closeTab(t.id); } };
    const fwd = () => { const t = act(); if (t && t.wc.canGoForward()) t.wc.goForward(); };
    function focusActive() { try { if (panel) chromeView.webContents.focus(); else { const t = act(); if (t) t.wc.focus(); else chromeView.webContents.focus(); } } catch {} }
    function setPanel(p) { panel = p || ''; layout(); send(); setTimeout(focusActive, 30); }
    function close() { try { for (const t of tabs) { try { t.wc.close(); } catch {} } win.destroy(); } catch {} }
    function zoom(d) { const t = act(); if (!t) return; zoomPct = d === 0 ? 100 : Math.max(30, Math.min(300, zoomPct + d)); t.wc.setZoomFactor(zoomPct / 100); const o = ST(); o.zoom = o.zoom || {}; const h = hostOf(t.url); if (h) { if (zoomPct === 100) delete o.zoom[h]; else o.zoom[h] = zoomPct; SAVE(o); } send(); }
    win._api = { newTab, act, close }; win._padWc = () => { try { return (panel || !act()) ? chromeView.webContents : act().wc; } catch { return null; } };
    cfg.count = () => { if (Date.now() - (cfg.lastSend || 0) > 1500) { cfg.lastSend = Date.now(); send(); } };
    const cmds = {
      newtab: x => { newTab(x.url || ''); return true; }, close: x => { closeTab(x.id); return true; }, activate: x => { if (tabs.some(t => t.id === x.id)) { activeId = x.id; panel = ''; layout(); send(); setTimeout(focusActive, 30); } return true; },
      go: x => { const t = act(); if (!t) return newTab(x.text); const u = fixUrl(x.text); if (!allowNav(u)) return false; if (drm(u)) return true; panel = ''; t.wc.loadURL(u); layout(); try { t.wc.focus(); } catch {} return true; },
      back: () => { back(); return true; }, fwd: () => { fwd(); return true; }, reload: () => { const t = act(); if (t) t.wc.reload(); return true; }, stop: () => { const t = act(); if (t) t.wc.stop(); return true; },
      home: () => { const t = act(); if (t) { if (isApp) t.wc.loadURL(home); else if (home) t.wc.loadURL(fixUrl(home)); else t.wc.loadFile(path.join(__dirname, '..', '..', 'renderer', 'browse', 'newtab.html')); } return true; },
      zoomin: () => { zoom(10); return true; }, zoomout: () => { zoom(-10); return true; }, zoomreset: () => { zoom(0); return true; },
      panel: x => { setPanel(x.name); return true; },
      bookmark: () => { const t = act(); if (!t || !/^https?:/.test(t.url)) return false; const o = ST(); o.bookmarks = o.bookmarks || []; const i = o.bookmarks.findIndex(b => b.url === t.url); if (i >= 0) o.bookmarks.splice(i, 1); else o.bookmarks.unshift({ url: t.url, title: t.title || t.url, icon: t.icon }); SAVE(o); send(); return true; },
      unbookmark: x => { const o = ST(); o.bookmarks = (o.bookmarks || []).filter(b => b.url !== x.url); SAVE(o); return true; },
      adblock: () => { cfg.adblock = !cfg.adblock; if (!isApp) { const s = S(); s.sbAdblock = cfg.adblock; ctx.store.write('settings', s); } const t = act(); if (t) t.wc.reload(); send(); return cfg.adblock; },
      siteAllow: () => { const t = act(); if (!t) return false; const h = hostOf(t.url); if (!h) return false; if (cfg.allow.has(h)) cfg.allow.delete(h); else cfg.allow.add(h); const o = ST(); o.allow = Array.from(cfg.allow); SAVE(o); t.wc.reload(); send(); return true; },
      mute: x => { const t = tabs.find(y => y.id === x.id); if (t) { t.muted = !t.muted; t.wc.setAudioMuted(t.muted); send(); } return true; }, pin: x => { const t = tabs.find(y => y.id === x.id); if (t) { t.pinned = !t.pinned; tabs.sort((p, q) => (q.pinned ? 1 : 0) - (p.pinned ? 1 : 0)); send(); } return true; },
      reopen: () => { const u = closed.shift(); if (u) newTab(u); return !!u; }, dup: x => { const t = tabs.find(y => y.id === x.id); if (t) newTab(t.url); return true; },
      find: x => { const t = act(); if (!t) return false; if (!x.text) { t.wc.stopFindInPage('clearSelection'); return true; } t.wc.findInPage(x.text, { forward: x.dir !== 'prev', findNext: !!x.next }); return true; },
      pip: () => { const t = act(); if (t) t.wc.executeJavaScript('(function(){var v=document.querySelector("video");if(!v)return;if(document.pictureInPictureElement)document.exitPictureInPicture();else v.requestPictureInPicture();})()').catch(() => {}); return true; },
      shot: async () => { const t = act(); if (!t) return false; const img = await t.wc.capturePage(); const dir = path.join(app.getPath('pictures'), 'SKBox'); fs.mkdirSync(dir, { recursive: true }); const f = path.join(dir, 'SKBrowse ' + new Date().toISOString().replace(/[:.]/g, '-') + '.png'); fs.writeFileSync(f, img.toPNG()); ctx.notify('Screenshot saved', path.basename(f)); return true; },
      copy: () => { const t = act(); if (t) { clipboard.writeText(t.url); ctx.notify('SKBrowse', 'Link copied'); } return true; },
      external: () => { const t = act(); if (t && /^https?:/.test(t.url)) shell.openExternal(t.url); return true; },
      fs: () => { try { win.setFullScreen(!win.isFullScreen()); } catch {} send(); return true; }, hidebar: () => { barHidden = !barHidden; layout(); send(); return true; },
      home_skbox: () => { win.hide(); ctx.comeBack(); return true; }, quit: () => { close(); return true; },
      clear: async x => { await ses.clearStorageData(x.what === 'cookies' ? { storages: ['cookies'] } : {}); if (x.what !== 'cookies') await ses.clearCache(); if (x.what === 'all' && !isApp) { const o = ST(); o.history = []; SAVE(o); } return true; },
      data: x => { const o = ST(); if (x.name === 'bookmarks') return o.bookmarks || []; if (x.name === 'history') return o.history || []; if (x.name === 'downloads') return o.downloads || []; if (x.name === 'ext') return (o.ext || []); if (x.name === 'closed') return closed.slice(); if (x.name === 'allow') return Array.from(cfg.allow); if (x.name === 'blockHosts') return o.blockHosts || []; return []; },
      openfile: x => { try { shell.showItemInFolder(String(x.file)); } catch {} return true; }, clearhistory: () => { const o = ST(); o.history = []; SAVE(o); return true; },
      extinstall: x => installExt(x.text), extremove: x => removeExt(x.id), exttoggle: x => toggleExt(x.id),
      setopt: x => { if (!/^sb[A-Z]/.test(x.k)) return false; const s = S(); s[x.k] = x.v; ctx.store.write('settings', s); send(); return true; },
      speed: () => { const L = [0.5, 0.75, 1, 1.25, 1.5, 2]; speed = L[(L.indexOf(speed) + 1) % L.length]; const t = act(); if (t) t.wc.executeJavaScript('document.querySelectorAll("video").forEach(function(v){v.playbackRate=' + speed + '})').catch(() => {}); ctx.notify('SKBrowse', 'Video speed ' + speed + 'x'); send(); return speed; },
      ua: () => { const t = act(); if (!t) return false; ua2 = ua2 ? '' : 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + process.versions.chrome + ' Mobile Safari/537.36'; t.wc.setUserAgent(ua2 || ua()); t.wc.reload(); ctx.notify('SKBrowse', ua2 ? 'Mobile site' : 'Desktop site'); return true; },
      pdf: async () => { const t = act(); if (!t) return false; const buf = await t.wc.printToPDF({ printBackground: true }); const dir = app.getPath('documents'); const f = path.join(dir, 'SKBrowse ' + new Date().toISOString().replace(/[:.]/g, '-') + '.pdf'); fs.writeFileSync(f, buf); ctx.notify('Saved as PDF', path.basename(f)); return true; },
      reader: () => { const t = act(); if (t) t.wc.executeJavaScript(READER_JS).catch(() => {}); return true; },
      clipgo: () => { const v = clipboard.readText().trim(); if (!v) { ctx.notify('SKBrowse', 'The clipboard is empty'); return false; } return cmds.go({ text: v }); },
      closeothers: x => { if (isApp) return false; tabs.slice().forEach(t => { if (t.id !== (x.id || activeId) && !t.pinned) closeTab(t.id); }); return true; },
      muteall: () => { const on = !tabs.every(t => t.muted); tabs.forEach(t => { t.muted = on; t.wc.setAudioMuted(on); }); send(); return on; },
      privatewin: () => { open({ private: true, pad: a.pad }); return true; },
      makeapp: async () => {
        const t = act(); if (!t || !/^https?:/.test(t.url)) return false; const u = new URL(t.url); let list = ctx.store.read('apps', []); if (!Array.isArray(list)) list = list.apps || [];
        if (list.some(x => x.kind === 'bapp' && hostOf(x.url) === u.hostname)) { ctx.notify('SKBrowse', u.hostname + ' is already an app'); return false; }
        const f = await favicon(t.url), name = String(t.title || u.hostname).split(/\s[|\u2013\u2014\-\u00B7:]\s/)[0].trim().slice(0, 28) || u.hostname;
        list.push({ id: 'bapp_' + Date.now().toString(36), kind: 'bapp', name, tag: u.hostname, url: u.origin + '/', adblock: true, engine: ctx.isDrm(u.href) ? 'edge' : 'built', auth: true, cover: f.ok ? f.file : '', fit: f.ok ? 'icon' : '', coverAuto: true });
        ctx.store.write('apps', list); try { ctx.appsChanged && ctx.appsChanged(); } catch {} ctx.notify('SKBrowse', name + ' is now an app in your Library'); return true;
      },
      allowdel: x => { cfg.allow.delete(x.host); const o = ST(); o.allow = Array.from(cfg.allow); SAVE(o); return true; },
      addblock: x => { const h = String(x.host || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim(); if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)) return false; adHosts.add(h); const o = ST(); o.blockHosts = Array.from(new Set((o.blockHosts || []).concat(h))); SAVE(o); return true; },
      blockdel: x => { const o = ST(); o.blockHosts = (o.blockHosts || []).filter(h => h !== x.host); SAVE(o); adHosts.delete(x.host); return true; },
      storeInstall: () => { const t = act(); if (!t) return { ok: false, error: 'Open an extension page first.' }; return installExt(t.url); }
    };
    win._cmd = (c, x) => (cmds[c] ? cmds[c](x || {}) : false);
    win.on('resize', layout); win.on('enter-full-screen', layout); win.on('leave-full-screen', layout);
    win.on('closed', () => { wins.delete(win); try { ctx.lock && ctx.lock(); } catch {} if (!isApp && !priv && opt('sbClearExit', false)) { try { ses.clearStorageData({ storages: ['cookies', 'localstorage', 'cachestorage'] }); ses.clearCache(); } catch {} } try { ctx.afterClose && ctx.afterClose(isApp); } catch {} });
    win.on('focus', () => { lastFocus = win; });
    const grab = () => { try { if (!win.isDestroyed()) { win.show(); win.focus(); ctx.focusNative && ctx.focusNative(win); focusActive(); ctx.lock && ctx.lock(); } } catch {} };
    win.show(); win.focus(); layout(); grab(); setTimeout(grab, 250); setTimeout(grab, 900);
    ['show', 'hide', 'minimize', 'restore'].forEach(e => win.on(e, () => { try { ctx.lock && ctx.lock(); } catch {} }));
    if (isApp) { const last = a.app.resume !== false ? ((ST().last || {})[a.app.id] || '') : ''; newTab(last && sameSite(hostOf(last), lockHost) ? last : a.app.url); if (a.app.muted) { try { tabs[0].wc.setAudioMuted(true); tabs[0].muted = true; } catch {} } }
    else if (a.url) newTab(a.url);
    else if (!priv && opt('sbRestore', false) && (ST().session || []).length) (ST().session || []).slice(0, 12).forEach(u => newTab(u));
    else newTab(home || '');
    layout(); return { ok: true };
  }
  const fromWin = e => { for (const w of wins) { try { if (w.webContents === e.sender || w.contentView.children.some(v => v.webContents === e.sender)) return w; } catch {} } return null; };
  ipcMain.handle('browse:cmd', (e, c, x) => { const w = fromWin(e); return w ? w._cmd(String(c), x) : false; });
  ipcMain.handle('browse:open', (_e, a) => open(a));
  ipcMain.handle('browse:clearData', async (_e, what) => { try { const ses = session.fromPartition(FULL); if (what === 'history') { const o = ST(); o.history = []; SAVE(o); } else if (what === 'cookies') await ses.clearStorageData({ storages: ['cookies', 'localstorage'] }); else if (what === 'cache') await ses.clearCache(); else if (what === 'bookmarks') { const o = ST(); o.bookmarks = []; SAVE(o); } else if (what === 'downloads') { const o = ST(); o.downloads = []; SAVE(o); } return { ok: true }; } catch { return { ok: false }; } });
  ipcMain.handle('browse:exportBookmarks', () => { try { const b = ST().bookmarks || []; const f = path.join(app.getPath('desktop'), 'SKBrowse-bookmarks.html'); const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); fs.writeFileSync(f, '<!DOCTYPE NETSCAPE-Bookmark-file-1><meta charset="utf-8"><title>Bookmarks</title><DL><p>' + b.map(x => '<DT><A HREF="' + esc(x.url) + '">' + esc(x.title || x.url) + '</A>').join('\n') + '</DL>'); shell.showItemInFolder(f); return { ok: true, n: b.length }; } catch { return { ok: false }; } });
  ipcMain.handle('browse:openDownloads', () => { shell.openPath(app.getPath('downloads')); return true; });
  ipcMain.handle('browse:resetOpts', () => { const s = S(); Object.keys(s).filter(k => /^sb[A-Z]/.test(k)).forEach(k => delete s[k]); ctx.store.write('settings', s); return true; });
  ipcMain.handle('browse:clearApp', async (_e, id) => { try { const ses = session.fromPartition('persist:skbapp-' + String(id).replace(/[^\w-]/g, '')); await ses.clearStorageData(); await ses.clearCache(); return { ok: true }; } catch { return { ok: false }; } });
  async function favicon(url) {
    try {
      const h = hostOf(url); if (!h) return { ok: false }; const dest = path.join(app.getPath('userData'), 'covers'); fs.mkdirSync(dest, { recursive: true });
      for (const u of ['https://www.google.com/s2/favicons?domain=' + h + '&sz=256', 'https://icons.duckduckgo.com/ip3/' + h + '.ico', 'https://' + h + '/apple-touch-icon.png', 'https://' + h + '/favicon.ico']) {
        try { const r = await net.fetch(u, { redirect: 'follow' }); if (!r.ok) continue; const b = Buffer.from(await r.arrayBuffer()); if (b.length < 200) continue; const img = nativeImage.createFromBuffer(b); if (img.isEmpty()) continue; const f = path.join(dest, 'fav_' + Date.now().toString(36) + '.png'); fs.writeFileSync(f, img.toPNG()); return { ok: true, file: f, fit: 'icon', size: img.getSize().width }; } catch {}
      }
      return { ok: false };
    } catch { return { ok: false }; }
  }
  ipcMain.handle('browse:favicon', (_e, url) => favicon(url));
  ipcMain.handle('browse:info', async (_e, url) => { try { const r = await net.fetch(url, { redirect: 'follow' }); const t = await r.text(); const m = /<title[^>]*>([^<]{1,120})/i.exec(t); return { ok: true, title: m ? m[1].replace(/\s+/g, ' ').trim() : '', url: r.url || url }; } catch { return { ok: false }; } });

  // controller / key presses coming from inside pages
  let oskWc = null;
  ipcMain.on('guest:menu', e => { const w = fromWin(e); if (w) { w._cmd('panel', { name: 'menu' }); } });
  ipcMain.on('guest:home', e => { const w = fromWin(e); if (w) { w.hide(); ctx.comeBack(); } });
  ipcMain.on('guest:osk', (e, o) => { const w = fromWin(e); if (!w) return; oskWc = e.sender; ctx.openOsk((o && o.value) || ''); });
  const SETTXT = '(function(t,s){var e=document.activeElement;if(!e)return;if(e.isContentEditable){e.textContent=t;e.dispatchEvent(new Event("input",{bubbles:true}));}else{var pr=e.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,ds=Object.getOwnPropertyDescriptor(pr,"value");if(ds&&ds.set)ds.set.call(e,t);else e.value=t;e.dispatchEvent(new Event("input",{bubbles:true}));}if(s){e.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:true}));var f=e.form;if(f&&!e.isContentEditable)try{f.requestSubmit?f.requestSubmit():f.submit();}catch(x){}}})';
  function oskResult(r) { const wc = oskWc; oskWc = null; if (!wc || wc.isDestroyed()) return false; if (!r.cancel) wc.executeJavaScript(SETTXT + '(' + JSON.stringify(String(r.text || '')) + ',' + (r.send ? 'true' : 'false') + ')').catch(() => {}); try { const w = fromWin({ sender: wc }); if (w) { w.show(); w.focus(); wc.focus(); } } catch {} return true; }
  const autoList = () => { try { if (opt('sbAutoList', true) && Date.now() - (ST().listAt || 0) > 7 * 86400000) updateList(); } catch {} };
  const padAction = a => { let w = null; for (const x of wins) { try { if (x.isVisible() && !x.isMinimized() && (!w || x === lastFocus)) w = x; } catch {} } const wc = w && w._padWc && w._padWc(); if (wc && !wc.isDestroyed()) { try { wc.send('pad-action', a); } catch {} } return !!wc; };
  const anyVisible = () => { for (const x of wins) { try { if (x.isVisible() && !x.isMinimized()) return true; } catch {} } return false; };
  const setPaused = v => { for (const w of wins) { try { w.contentView.children.forEach(c => { try { c.webContents.send('pad-pause', !!v); } catch {} }); } catch {} } };
  return { padAction, anyVisible, setPaused, autoList, favicon, oskResult, hasOsk: () => !!oskWc, open, wins, installExt, removeExt, toggleExt, updateList, loadAllExt, extList: () => ST().ext || [], stats: () => ({ blocked, hosts: adHosts.size, listAt: ST().listAt || 0 }), hook, isDrm: u => DRM.some(d => { const h = hostOf(u); return h === d || h.endsWith('.' + d); }), closeAll: () => { for (const w of Array.from(wins)) { try { w.destroy(); } catch {} } }, whichFocused: () => lastFocus, cmdFor: wc => { for (const w of wins) { if (w.webContents === wc || w.contentView.children.some(v => v.webContents === wc)) return w; } return null; } };
}
module.exports = { create, unzip, crxToZip, DRM_HOSTS: DRM };
