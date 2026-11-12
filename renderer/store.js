// SKStore: featured games and apps. Games come from Steam and Epic (installed by their own launchers), apps install with winget.
(function () {
  'use strict';
  const K = window.K, { sk, S, el, esc, nav, toast, hints, focus, ensureFocus, openLayer, closeLayer, confirm, menu, osk } = K, U = K.ui;
  const X = (n, a) => sk.extras.do(n, a), say = r => toast((r && r.error) || 'That did not work');
  const paneIdx = pane => { const c = K.current && K.current(); return c && pane.contains(c) ? Array.from(pane.querySelectorAll('[data-nav]')).indexOf(c) : -1; };
  const paneRestore = (pane, idx) => { if (idx == null || idx < 0) return; const l = pane.querySelectorAll('[data-nav]'); if (l.length) K.focus(l[Math.min(idx, l.length - 1)]); };
  K.storeProg = null; sk.on('store:progress', p => { if (K.storeProg) K.storeProg(p); });
  let cacheHome = null, cacheT = 0, epicHas = null;

  const inLib = a => S.apps.some(x => (a.kind === 'steam' && String(x.exe || '').toLowerCase() === ('steam://rungameid/' + a.appid)) || (a.kind === 'winget' && String(x.name || '').toLowerCase().includes(String(a.match || '\u0000'))));
  function pcard(it) {
    const c = nav(el('button', 'pcard')); let art;
    if (it.art) art = '<div class="pimg" style="background:' + it.grad + '"><img class="contain" src="' + esc(it.art) + '" alt=""></div>';
    else if (it.img) art = '<div class="pimg" style="background:' + U.gradFor(it.title) + '"><img src="' + esc(it.img) + '" alt="" onerror="this.remove()"></div>';
    else art = '<div class="pimg" style="background:' + U.gradFor(it.title) + '"><span>' + esc((it.title || '?')[0]) + '</span></div>';
    const badge = it.off ? '<i class="poff">-' + it.off + '%</i>' : (it.installed ? '<i class="poff ok">Installed</i>' : '');
    c.innerHTML = art + badge + '<b>' + esc(it.title) + '</b><small>' + esc(it.sub || '') + '</small><em>' + (it.was ? '<s>' + esc(it.was) + '</s> ' : '') + esc(it.price || '') + '</em>'; c.onclick = () => open(it); return c;
  }
  const libAdd = async (app, toastText) => { S.apps.push(app); U.saveApps(); toast(toastText || (app.name + ' added to your Library')); try { await U.findCoversFor([app]); } catch (_) {} };

  async function open(it) {
    const L = el('div', 'layer'), b = el('div', 'box wide pdet'); L.appendChild(b); const body = el('div'); b.appendChild(body);
    const head = '<div class="phead">' + (it.img ? '<img src="' + esc(it.img) + '" onerror="this.remove()">' : '') + '<div><h3>' + esc(it.title) + '</h3><div class="sub">' + esc([it.sub, (it.was ? it.was + ' \u2192 ' : '') + (it.price || '')].filter(Boolean).join(' \u00B7 ')) + '</div></div></div>';
    const draw = (extra) => {
      body.innerHTML = head + (extra || ''); const br = el('div', 'btnrow'); const mk = (t, fn, cls) => { const x = nav(el('button', 'btn' + (cls ? ' ' + cls : ''), t)); x.onclick = fn; br.appendChild(x); return x; };
      if (it.kind === 'steam') {
        const free = it.price === 'Free'; mk(free ? 'Get in Steam' : 'Open in Steam', async () => { const r = await X('storeOpen', { url: (free ? 'steam://install/' : 'steam://store/') + it.appid }); if (!r.ok) say(r); else toast(free ? 'Steam will ask to install it' : 'Opening in Steam. You need Steam installed.'); }, 'p');
        if (!inLib(it)) mk('Add to Library', () => { libAdd({ id: 'app_' + Date.now().toString(36), name: it.title, exe: 'steam://rungameid/' + it.appid, args: '', cover: '', added: Date.now(), src: 'Steam' }); closeLayer(L); });
        else mk('In your Library \u2713', () => {});
      } else if (it.kind === 'epic') {
        mk('Open in Epic', async () => { if (epicHas == null) { const r = await X('storeEpicInstalled'); epicHas = !!(r && r.installed); } const r = await X('storeOpen', { url: epicHas ? 'com.epicgames.launcher://store/p/' + it.slug : 'https://store.epicgames.com/en-US/p/' + it.slug }); if (!r.ok) say(r); else toast(epicHas ? 'Opening the Epic Games Launcher' : 'Epic Games Launcher not found, opening the website'); }, 'p');
      } else if (it.kind === 'winget') {
        if (!it.installed) mk('Install', () => installApp(it, L), 'p'); else { mk('Add to Library', () => addInstalled(it, L), 'p'); mk('Uninstall', () => confirm('Uninstall ' + it.title + '?', 'Windows may ask for permission.', 'Uninstall', async () => { const r = await X('storeUninstall', { wid: it.wid }); if (!r.ok) say(r); else { toast(it.title + ' removed'); it.installed = false; cacheHome = null; closeLayer(L); } }, true)); }
      } else if (it.kind === 'sk') {
        const a = U.allApps().find(x => x.id === it.appid); if (a) { mk('Open', () => { closeLayer(L); U.openApp(a); }, 'p'); mk(U.isPinned(a) ? 'Unpin from Home' : 'Pin to Home', () => { U.setPinned(a, !U.isPinned(a)); toast(U.isPinned(a) ? 'Pinned to Home' : 'Unpinned'); closeLayer(L); }); }
      }
      mk('Close', () => closeLayer(L)); body.appendChild(br); ensureFocus(L, br.firstChild);
    };
    openLayer(L, () => closeLayer(L)); draw();
    if (it.kind === 'steam') { const r = await X('storeSteamInfo', { appid: it.appid }); if (L.isConnected && r.ok && r.info) { const i = r.info; draw('<p>' + esc(i.summary || '') + '</p><div class="sub">' + esc([(i.genres || []).join(', '), (i.developers || []).join(', '), i.released, i.score ? 'Metacritic ' + i.score : ''].filter(Boolean).join(' \u00B7 ')) + '</div>'); } }
    if (it.kind === 'winget' && it.source === 'msstore') draw('<p>This one comes from the Microsoft Store.</p>');
  }
  async function installApp(it, L) {
    const lay = el('div', 'layer'), bx = el('div', 'box', '<h3>Installing ' + esc(it.title) + '</h3><p class="ptext">Asking Windows\u2026 a permission window may appear. Say yes to it.</p><div class="pbar"><i style="width:30%"></i></div>'); lay.appendChild(bx); openLayer(lay, () => {});
    K.storeProg = p => { if (p && p.line && lay.isConnected) bx.querySelector('.ptext').textContent = p.line; };
    const r = await X('storeInstall', { wid: it.wid }); K.storeProg = null; closeLayer(lay);
    if (!r.ok) { if (r.nowinget) confirm('winget is missing', r.error, 'Open Microsoft Store', () => X('storeOpen', { url: 'ms-windows-store://pdp/?productid=9NBLGGH4NNS1' })); else say(r); return; }
    it.installed = true; cacheHome = null; closeLayer(L); toast(it.title + ' is installed'); confirm('Add ' + it.title + ' to your Library?', 'SKBox can find it and add it so you can start it from here.', 'Add', () => addInstalled(it, null));
  }
  async function addInstalled(it, L) {
    const r = await sk.apps.scan(); const m = ((r && r.list) || []).filter(e => String(e.name || '').toLowerCase().includes(it.match)).sort((a, b) => a.name.length - b.name.length)[0];
    if (L) closeLayer(L); if (!m) return toast('Installed, but SKBox could not find its shortcut yet. Try Settings > Import apps.');
    if (S.apps.some(a => String(a.exe || '').toLowerCase() === m.target.toLowerCase())) return toast('Already in your Library');
    libAdd({ id: 'app_' + Date.now().toString(36), name: it.title, exe: m.target, args: m.args || '', cover: '', added: Date.now(), src: m.src || '' });
  }

  K.screens.store = async function (root) {
    hints([['A', 'Open'], ['B', 'Back']]); S.backFn = () => K.go('library');
    root.innerHTML = '<div class="page"><h1>SKStore</h1></div>'; const page = root.querySelector('.page'), split = el('div', 'split'), menuE = el('div', 'menu'), pane = el('div', 'pane'); split.append(menuE, pane); page.appendChild(split);
    pane.innerHTML = '<div class="sub">Loading the store\u2026</div>';
    let data = (cacheHome && Date.now() - cacheT < 120000) ? cacheHome : null; if (!data) { const r = await X('storeHome'); if (!root.isConnected) return; if (!r || !r.ok) { pane.innerHTML = '<div class="sub">' + esc((r && r.error) || 'Could not load the store. Check your internet.') + '</div>'; ensureFocus(root); return; } data = r; cacheHome = r; cacheT = Date.now(); }
    const icons = { featured: '\u2B50', sk: '\u{1F7E2}', free: '\u{1F193}', deals: '\u{1F3F7}', top: '\u{1F525}', new: '\u2728', epic: '\u{1F381}', apps: '\u{1F4E6}' };
    const secs = data.sections.concat([{ id: 'search', title: 'Search', items: [] }]); let sel = S.storeSel && secs.some(x => x.id === S.storeSel) ? S.storeSel : 'featured', items = {}, firstEl = null, searchQ = '', searchRes = null, drawT = 0;
    const draw = id => {
      const keepIdx = paneIdx(pane); pane.innerHTML = ''; pane.dataset.sec = id; const sec = secs.find(x => x.id === id); pane.appendChild(el('h2', '', sec.title));
      if (id === 'search') { const sb = U.row('Search the store', 'Steam games and the apps list', esc(searchQ || 'Type\u2026'), () => osk({ title: 'Search games and apps', value: searchQ, submitLabel: 'Search', onDone: async v => { searchQ = (v || '').trim(); if (searchQ.length < 2) return; searchRes = 'loading'; draw('search'); const r = await X('storeSearch', { q: searchQ }); searchRes = r; if (S.screen === 'store') draw('search'); } })); pane.appendChild(sb); const g = el('div', 'pgrid'); pane.appendChild(g);
        if (searchRes === 'loading') g.innerHTML = '<div class="sub">Searching\u2026</div>'; else if (searchRes && !searchRes.ok) g.innerHTML = '<div class="sub">' + esc(searchRes.error) + '</div>'; else if (searchRes) { if (!searchRes.items.length) g.innerHTML = '<div class="sub">Nothing found.</div>'; searchRes.items.forEach(it => g.appendChild(pcard(it))); } paneRestore(pane, keepIdx); return; }
      if (sec.err) pane.appendChild(el('div', 'sub', sec.err)); if (id === 'apps' && sec.winget === false) pane.appendChild(el('div', 'salert', 'winget was not found on this PC, so apps cannot be installed from here. It comes with "App Installer" in the Microsoft Store.'));
      if (id === 'epic') pane.appendChild(el('div', 'sub', 'Free to keep if you claim them while they are free. Claiming needs your Epic account.'));
      if (!sec.items.length && !sec.err) pane.appendChild(el('div', 'sub', 'Nothing here right now.'));
      let cat = ''; const g = el('div', 'pgrid'); sec.items.forEach(it => { if (id === 'apps' && it.cat !== cat) { cat = it.cat; if (g.childElementCount) { pane.appendChild(g); } pane.appendChild(el('h3', '', cat)); const g2 = el('div', 'pgrid'); g2.appendChild(pcard(it)); pane.appendChild(g2); } else if (id === 'apps') { pane.lastElementChild.appendChild(pcard(it)); } else g.appendChild(pcard(it)); }); if (id !== 'apps') pane.appendChild(g); paneRestore(pane, keepIdx);
    };
    secs.forEach(sec => { const m = nav(el('button', 'mi', '<span>' + (icons[sec.id] || '\u{1F50E}') + '</span>' + esc(sec.title))); items[sec.id] = m; if (sec.id === sel) { m.classList.add('sel'); firstEl = m; }
      m._onfocus = () => { if (sel !== sec.id || !pane.querySelector('h2')) { sel = sec.id; S.storeSel = sec.id; Object.values(items).forEach(x => x.classList.remove('sel')); m.classList.add('sel'); clearTimeout(drawT); drawT = setTimeout(() => { if (pane.isConnected && sel === sec.id) draw(sec.id); }, pane.querySelector('h2') ? 110 : 0); } }; m.onclick = () => { clearTimeout(drawT); if (pane.dataset.sec !== sec.id) draw(sec.id); const f = pane.querySelector('[data-nav]'); if (f) focus(f); }; menuE.appendChild(m); });
    S.backFn = () => { const c = K.current && K.current(); if (c && pane.contains(c) && items[sel]) focus(items[sel]); else K.go('library'); };
    if (!firstEl) firstEl = menuE.firstChild; firstEl.dataset.first = ''; draw(sel); ensureFocus(root, firstEl);
  };
})();
