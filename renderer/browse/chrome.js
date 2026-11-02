(() => {
  const $ = id => document.getElementById(id), C = (c, a) => skb.cmd(c, a || {});
  let st = null, pane = '', findOn = false;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toast = t => { const m = $('msg'); m.textContent = t; m.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => m.style.display = 'none', 2400); };
  const act = () => st && st.tabs.find(t => t.id === st.active);
  const host = u => { try { return new URL(u).hostname; } catch { return ''; } };
  const isStore = u => /^https:\/\/chromewebstore\.google\.com\/detail\//.test(u || '') || /^https:\/\/chrome\.google\.com\/webstore\/detail\//.test(u || '');
  function draw() {
    if (!st) return; document.body.classList.toggle('app', !!st.app); document.body.classList.toggle('p', !!st.panel);
    const a = act(), url = a ? a.url : '';
    $('tabs').style.display = st.app ? 'none' : '';
    if (!st.app) {
      $('tabs').innerHTML = st.tabs.map(t => '<div class="tab' + (t.id === st.active ? ' on' : '') + (t.pinned ? ' pin' : '') + '" data-id="' + t.id + '">' + (t.loading ? '<span class="ld"></span>' : t.icon ? '<img src="' + esc(t.icon) + '">' : '<span>&#127760;</span>') + '<span class="t">' + (t.audible ? (t.muted ? '&#128263; ' : '&#128266; ') : '') + esc(t.title) + '</span><button class="x" data-x="' + t.id + '">&#10005;</button></div>').join('') + '<button id="plus">+</button>';
      $('plus').onclick = () => C('newtab');
    }
    const ib = (id, ic, tip, cls) => '<button class="ib ' + (cls || '') + '" id="' + id + '" title="' + tip + '">' + ic + '</button>';
    const shield = ib('b-ad', '&#128737;<small>' + (st.blocked || 0) + '</small>', st.app ? 'Ad blocker: ' + (st.adblock ? 'on' : 'off') : 'Ad blocker', st.adblock && !st.siteAllow ? 'on' : '');
    let h = ib('b-back', '&#8592;', 'Back (B)', a && a.back ? '' : 'off') + ib('b-fwd', '&#8594;', 'Forward', a && a.fwd ? '' : 'off') + ib('b-rel', a && a.loading ? '&#10005;' : '&#8635;', 'Reload');
    if (st.app) h += '<div id="lock">&#128274; <b>' + esc(st.app.name) + '</b> &middot; ' + esc(st.app.host) + '</div>' + shield + ib('b-zm', '&#128269;', 'Zoom ' + st.zoom + '%') + ib('b-hide', '&#9013;', 'Hide this bar (F10)') + ib('b-menu', '&#9776;', 'Menu (Start)') + ib('b-sk', '&#127968;', 'Back to SKBox (View)') + ib('b-x', '&#10005;', 'Close');
    else h += ib('b-home', '&#8962;', 'Home') + '<input id="url" spellcheck="false" placeholder="Search or type a link" value="' + esc(/newtab\.html/.test(url) ? '' : url) + '">' + (isStore(url) ? '<button class="btn p" id="b-add">Add to SKBrowse</button>' : '') + ib('b-star', st.star ? '&#9733;' : '&#9734;', 'Bookmark', st.star ? 'on' : '') + shield + ib('b-menu', '&#9776;', 'Menu (Start)') + ib('b-sk', '&#127968;', 'Back to SKBox (View)');
    if (st.sb && st.sb.clock) h += '<span id="clk" style="color:var(--dim);font-size:13px;padding:0 8px;white-space:nowrap"></span>';
    if (st.priv) h = '<span class="ib on" title="Private window">&#128373;</span>' + h;
    $('bar').innerHTML = h; tickClock();
    const on = (id, fn) => { const e = $(id); if (e) e.onclick = fn; };
    on('b-back', () => C('back')); on('b-fwd', () => C('fwd')); on('b-rel', () => C(a && a.loading ? 'stop' : 'reload')); on('b-home', () => C('home')); on('b-star', () => C('bookmark'));
    on('b-ad', () => st.app ? C('siteAllow') : C('adblock')); on('b-menu', () => C('panel', { name: 'menu' })); on('b-sk', () => C('home_skbox')); on('b-x', () => C('quit')); on('b-hide', () => C('hidebar')); on('b-zm', () => C('zoomin'));
    on('b-add', async () => { toast('Installing\u2026'); const r = await C('storeInstall'); toast(r && r.ok ? (r.name || 'Extension') + ' installed' : (r && r.error) || 'Could not install'); });
    const u = $('url'); if (u) { u.onkeydown = e => { if (e.key === 'Enter') C('go', { text: u.value }); }; u.onfocus = () => u.select(); }
    document.querySelectorAll('.tab').forEach(t => { t.onclick = e => { if (e.target.dataset.x) return; C('activate', { id: +t.dataset.id }); }; t.onauxclick = () => C('close', { id: +t.dataset.id }); t.oncontextmenu = e => { e.preventDefault(); tabMenu(+t.dataset.id); }; });
    document.querySelectorAll('.tab .x').forEach(x => x.onclick = () => C('close', { id: +x.dataset.x }));
    if (st.panel !== pane) { pane = st.panel; if (pane) drawPanel(pane); }
  }
  function tickClock() { const c = $('clk'); if (c) c.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  setInterval(tickClock, 15000);
  function tabMenu(id) { panelHTML('Tab', '<div class="grid">' + [['&#128204;', 'Pin or unpin', () => C('pin', { id })], ['&#128263;', 'Mute or unmute', () => C('mute', { id })], ['&#10697;', 'Duplicate', () => C('dup', { id })], ['&#10005;', 'Close', () => C('close', { id })]].map((c, i) => '<button class="card" data-i="' + i + '"><i>' + c[0] + '</i>' + c[1] + '</button>').join('') + '</div>', [['&#128204;', 0], ['', 1], ['', 2], ['', 3]], [() => C('pin', { id }), () => C('mute', { id }), () => C('dup', { id }), () => C('close', { id })], true); }
  function panelHTML(title, body, _x, acts, local) {
    const p = $('panel'); p.innerHTML = '<div class="ph"><h2>' + title + '</h2><button class="btn" id="pclose">Close (B)</button></div><div class="pb">' + body + '</div>';
    $('pclose').onclick = () => { if (local) document.body.classList.remove('p'); C('panel', { name: '' }); };
    if (local) { document.body.classList.add('p'); p.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { acts[+b.dataset.i](); document.body.classList.remove('p'); C('panel', { name: '' }); }); }
    return p;
  }
  const card = (ic, t, sub, fn, id) => ({ ic, t, sub, fn, id });
  function grid(cards) { return '<div class="grid">' + cards.map((c, i) => '<button class="card" data-c="' + i + '"><i>' + c.ic + '</i><span>' + c.t + (c.sub ? '<small>' + c.sub + '</small>' : '') + '</span></button>').join('') + '</div>'; }
  function wire(cards, close) { $('panel').querySelectorAll('[data-c]').forEach(b => b.onclick = async () => { const c = cards[+b.dataset.c]; await c.fn(); if (close !== false && c.keep !== true) C('panel', { name: '' }); }); }
  const tog = on => '<span class="tog' + (on ? ' on' : '') + '"></span>';
  async function drawPanel(name) {
    const p = $('panel'), a = act(), app = !!st.app;
    const head = (t, extra) => '<div class="ph"><h2>' + t + '</h2>' + (extra || '') + '<button class="btn" id="pclose">Close (B)</button></div>';
    const bind = () => { const c = $('pclose'); if (c) c.onclick = () => C('panel', { name: '' }); };
    if (name === 'menu') {
      let cs = [];
      const go = u => () => C('go', { text: u });
      if (!app) cs.push(card('&#10133;', 'New tab', '', () => C('newtab')), card('&#9733;', 'Bookmarks', '', () => C('panel', { name: 'bookmarks' }), 1), card('&#128339;', 'History', '', () => C('panel', { name: 'history' }), 1), card('&#11015;', 'Downloads', '', () => C('panel', { name: 'downloads' }), 1), card('&#129513;', 'Extensions', 'Chrome Web Store apps', () => C('panel', { name: 'ext' }), 1), card('&#128722;', 'Chrome Web Store', 'Find extensions', go('https://chromewebstore.google.com/')), card('&#8635;', 'Reopen closed tab', '', () => C('reopen')), card('&#128269;', 'Find on page', '', () => { findOn = true; $('find').style.display = 'flex'; $('fq').focus(); }));
      if (!app) cs.push(card('&#128373;', 'Private window', 'No history, cookies are forgotten', () => C('privatewin')), card('&#9776;', 'All tabs', st.tabs.length + ' open', () => C('panel', { name: 'tabs' }), 1), card('&#10006;', 'Close other tabs', '', () => C('closeothers', {})), card('&#128279;', 'Go to copied link', '', () => C('clipgo')), card('&#10133;', 'Make this site an app', 'Adds it to your Library', () => C('makeapp')));
      cs.push(card('&#128263;', 'Mute or unmute all', '', () => C('muteall')), card('&#9193;', 'Video speed', 'Now ' + (st.speed || 1) + 'x. Keys [ and ]', () => C('speed'), 1), card('&#128214;', 'Reader mode', 'Plain text page', () => C('reader')), card('&#128241;', 'Mobile / desktop site', '', () => C('ua')), card('&#128438;', 'Save page as PDF', 'Into Documents', () => C('pdf')));
      cs.push(card('&#128737;', app ? 'Ad blocker for this site' : 'Ad blocker for this site', st.siteAllow ? 'Off here' : 'On here', () => C('siteAllow')));
      if (!app) cs.push(card('&#128737;', 'Ad blocker everywhere', st.adblock ? 'On' : 'Off', () => C('adblock')));
      cs.push(card('&#8635;', 'Reload', '', () => C('reload')), card('&#8962;', app ? 'Back to the start page' : 'Home page', '', () => C('home')), card('&#10133;', 'Zoom in', st.zoom + '%', () => C('zoomin'), 1), card('&#10134;', 'Zoom out', '', () => C('zoomout'), 1), card('&#9632;', 'Reset zoom', '', () => C('zoomreset')), card('&#128250;', 'Picture in picture', 'Float the video', () => C('pip')), card('&#128247;', 'Screenshot', 'Saved to Pictures\\SKBox', () => C('shot')), card('&#128279;', 'Copy link', '', () => C('copy')), card('&#9974;', 'Open in your normal browser', '', () => C('external')), card('&#9974;', 'Fullscreen', '', () => C('fs')), card('&#9013;', 'Hide the bar', 'F10 shows it again', () => C('hidebar')));
      if (!app) cs.push(card('&#9881;', 'SKBrowse settings', '', () => C('panel', { name: 'settings' }), 1));
      cs.push(card('&#127850;', 'Clear cookies', 'Signs you out of sites', () => C('clear', { what: 'cookies' }).then(() => toast('Cookies cleared'))), card('&#129529;', 'Clear everything', 'Cookies, cache' + (app ? '' : ', history'), () => C('clear', { what: 'all' }).then(() => toast('Cleared'))), card('&#127968;', 'Back to SKBox', 'View button', () => C('home_skbox')), card('&#10005;', app ? 'Close this app' : 'Close SKBrowse', '', () => C('quit')));
      p.innerHTML = head(app ? esc(st.app.name) : 'SKBrowse menu') + '<div class="pb">' + grid(cs) + '</div>'; bind(); wire(cs);
    } else if (name === 'tabs') {
      p.innerHTML = head('All tabs') + '<div class="pb">' + st.tabs.map(t => '<div class="row"><div class="m"><b>' + (t.id === st.active ? '&#9679; ' : '') + esc(t.title) + '</b><small>' + esc(t.url) + '</small></div><button class="btn" data-a="' + t.id + '">Switch</button><button class="btn" data-x="' + t.id + '">Close</button></div>').join('') + '</div>'; bind();
      p.querySelectorAll('[data-a]').forEach(b => b.onclick = () => C('activate', { id: +b.dataset.a })); p.querySelectorAll('[data-x]').forEach(b => b.onclick = async () => { await C('close', { id: +b.dataset.x }); setTimeout(() => drawPanel('tabs'), 150); });
    } else if (name === 'allow' || name === 'blockhosts') {
      const list = await C('data', { name: name === 'allow' ? 'allow' : 'blockHosts' }); if (pane !== name) return;
      p.innerHTML = head(name === 'allow' ? 'Sites with the ad blocker off' : 'Sites you blocked') + '<div class="pb">' + (name === 'blockhosts' ? '<div class="row"><input class="t" id="bh" placeholder="Block a site, for example ads.example.com"><button class="btn p" id="bha">Block</button></div>' : '') + ((list || []).map(h => '<div class="row"><div class="m"><b>' + esc(h) + '</b></div><button class="btn" data-d="' + esc(h) + '">' + (name === 'allow' ? 'Turn ad blocker back on' : 'Unblock') + '</button></div>').join('') || '<p style="color:var(--dim)">Nothing here.</p>') + '</div>'; bind();
      p.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { await C(name === 'allow' ? 'allowdel' : 'blockdel', { host: b.dataset.d }); drawPanel(name); });
      const ba = $('bha'); if (ba) ba.onclick = async () => { const ok = await C('addblock', { host: $('bh').value }); toast(ok ? 'Blocked' : 'That is not a site address'); drawPanel(name); };
    } else if (name === 'bookmarks' || name === 'history' || name === 'downloads' || name === 'ext' || name === 'settings') {
      const list = await C('data', { name }); if (pane !== name) return;
      if (name === 'settings') return drawSettings(head, bind);
      let body = '';
      if (name === 'ext') {
        body = '<div class="sec">Install from the Chrome Web Store</div><div class="row"><input class="t" id="eurl" placeholder="Paste an extension link or its ID"><button class="btn p" id="einst">Install</button></div><p style="color:var(--dim);margin:6px 2px">Tip: open the Web Store in SKBrowse, open an extension, then press <b>Add to SKBrowse</b> in the bar. SKBrowse supports many, not all, Chrome extensions.</p><div class="sec">Installed</div>' + ((list || []).map(x => '<div class="row"><div class="m"><b>' + esc(x.name) + '</b><small>' + esc(x.version || '') + (x.on === false ? ' &middot; off' : '') + (x.err ? ' &middot; ' + esc(x.err) : '') + (x.warn ? ' &middot; may not work: needs ' + esc(x.warn) : '') + '</small></div><button class="btn" data-t="' + x.id + '">' + (x.on === false ? 'Turn on' : 'Turn off') + '</button><button class="btn" data-r="' + x.id + '">Remove</button></div>').join('') || '<p style="color:var(--dim)">Nothing installed yet.</p>');
      } else if (name === 'downloads') body = (list || []).map(d => '<div class="row"><div class="m"><b>' + esc(d.name) + '</b><small>' + new Date(d.t).toLocaleString() + '</small></div><button class="btn" data-f="' + esc(d.file) + '">Show in folder</button></div>').join('') || '<p style="color:var(--dim)">No downloads yet.</p>';
      else body = (list || []).map(b => '<div class="row"><div class="m"><b>' + esc(b.title || b.url) + '</b><small>' + esc(b.url) + '</small></div><button class="btn" data-o="' + esc(b.url) + '">Open</button>' + (name === 'bookmarks' ? '<button class="btn" data-u="' + esc(b.url) + '">Remove</button>' : '') + '</div>').join('') || '<p style="color:var(--dim)">Nothing here yet.</p>';
      p.innerHTML = head({ ext: 'Extensions', downloads: 'Downloads', bookmarks: 'Bookmarks', history: 'History' }[name], name === 'history' ? '<button class="btn" id="hclr">Clear</button>' : '') + '<div class="pb">' + body + '</div>'; bind();
      p.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { C('panel', { name: '' }); C('go', { text: b.dataset.o }); });
      p.querySelectorAll('[data-u]').forEach(b => b.onclick = async () => { await C('unbookmark', { url: b.dataset.u }); drawPanel(name); });
      p.querySelectorAll('[data-f]').forEach(b => b.onclick = () => C('openfile', { file: b.dataset.f }));
      p.querySelectorAll('[data-t]').forEach(b => b.onclick = async () => { await C('exttoggle', { id: b.dataset.t }); drawPanel('ext'); });
      p.querySelectorAll('[data-r]').forEach(b => b.onclick = async () => { await C('extremove', { id: b.dataset.r }); toast('Removed'); drawPanel('ext'); });
      const hc = $('hclr'); if (hc) hc.onclick = async () => { await C('clearhistory'); drawPanel('history'); };
      const ei = $('einst'); if (ei) ei.onclick = async () => { const v = $('eurl').value; toast('Installing\u2026'); const r = await C('extinstall', { text: v }); toast(r && r.ok ? (r.name || 'Extension') + (r.warn ? ' installed, but it needs ' + r.warn + ' (SKBrowse cannot do that)' : ' installed') : (r && r.error) || 'Could not install'); drawPanel('ext'); };
    }
  }
  function drawSettings(head, bind) {
    const s = st.sb || {}, p = $('panel');
    const T = (t, sub, k, v) => [t, sub, k, v];
    const rows = [T('Ad blocker', 'Blocks ads and trackers on every site', 'sbAdblock', st.adblock), T('Hide cookie banners', 'Removes the consent pop-ups', 'sbCookies', s.cookies), T('Strip tracking from links', 'Removes utm_, fbclid, gclid and similar', 'sbClean', s.clean), T('Send Do Not Track', 'Asks sites not to track you', 'sbDnt', s.dnt), T('Block permission pop-ups', 'Location, notifications, camera and mic requests are refused', 'sbPerms', s.perms), T('Always use https', 'Upgrades http links when the site allows it', 'sbHttpsAll', s.httpsAll), T('Dark pages', 'Turns bright sites dark', 'sbDark', s.dark), T('Skip intros and ads buttons', 'Clicks Skip Intro, Skip Recap, Next Episode for you', 'sbSkipIntro', s.skip), T('Hide the mouse while watching', 'The cursor disappears over videos after 3 seconds', 'sbHideCursor', s.cursor), T('Video speed keys', '[ slower, ] faster, \\ normal', 'sbSpeedKeys', s.keys), T('Show a clock in the bar', '', 'sbClock', s.clock), T('Upgrade typed links to https', 'Plain addresses open securely', 'sbHttps', s.https), T('Start fullscreen', 'SKBrowse opens filling the screen', 'sbFullscreen', s.fs), T('Remember history', 'Sites you visited', 'sbHistory', s.hist !== false), T('Reopen my tabs next time', 'Restores the tabs you had open', 'sbRestore', s.restore), T('Forget cookies when I close SKBrowse', 'Signs you out of sites each time', 'sbClearExit', s.clearExit), T('Pop-ups open as tabs', 'Off blocks non-web pop-ups', 'sbPopups', s.popups !== false), T('Closing the last tab leaves SKBrowse', 'Otherwise a new tab opens', 'sbCloseLast', s.closeLast === 'exit')];
    p.innerHTML = head('SKBrowse settings') + '<div class="pb">' + rows.map((r, i) => '<button class="row" style="width:100%;text-align:left" data-s="' + i + '"><div class="m"><b>' + r[0] + '</b><small>' + r[1] + '</small></div>' + tog(r[3]) + '</button>').join('') + '<button class="row" style="width:100%;text-align:left" id="sal"><div class="m"><b>Sites with the ad blocker off</b><small>See and turn them back on</small></div><b>&#8594;</b></button><button class="row" style="width:100%;text-align:left" id="sbl"><div class="m"><b>Sites you blocked</b><small>Add your own blocked sites</small></div><b>&#8594;</b></button><div class="row"><div class="m"><b>Ads and trackers blocked so far</b></div><b>' + (st.total || 0) + '</b></div><button class="row" style="width:100%;text-align:left" id="se"><div class="m"><b>Search engine</b><small>Tap to change</small></div><b id="sev">' + esc(s.search || 'google') + '</b></button></div>'; bind();
    p.querySelectorAll('[data-s]').forEach(b => b.onclick = async () => { const r = rows[+b.dataset.s]; if (r[2] === 'sbAdblock') await C('adblock'); else if (r[2] === 'sbCloseLast') await C('setopt', { k: r[2], v: r[3] ? 'home' : 'exit' }); else await C('setopt', { k: r[2], v: !r[3] }); });
    $('sal').onclick = () => C('panel', { name: 'allow' }); $('sbl').onclick = () => C('panel', { name: 'blockhosts' });
    $('se').onclick = () => { const L = ['google', 'duckduckgo', 'bing', 'brave', 'youtube']; C('setopt', { k: 'sbSearch', v: L[(L.indexOf(s.search || 'google') + 1) % L.length] }); };
  }
  skb.on(s => { const was = pane; st = s; if (s.panel && s.panel === was && ['settings'].includes(s.panel)) { pane = ''; } draw(); });
  skb.onFocusUrl(() => { const u = $('url'); if (u) { u.focus(); u.select(); } });
  // find on page
  $('fq').oninput = e => C('find', { text: e.target.value }); $('fq').onkeydown = e => { if (e.key === 'Enter') C('find', { text: e.target.value, next: true, dir: e.shiftKey ? 'prev' : 'next' }); if (e.key === 'Escape') closeFind(); };
  const closeFind = () => { $('find').style.display = 'none'; C('find', { text: '' }); }; $('fx').onclick = closeFind; $('fn').onclick = () => C('find', { text: $('fq').value, next: true }); $('fp').onclick = () => C('find', { text: $('fq').value, next: true, dir: 'prev' });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && st && st.panel) C('panel', { name: '' }); else if (e.key === 'F10') C('hidebar'); else if (e.ctrlKey && e.key === 'f') { e.preventDefault(); $('find').style.display = 'flex'; $('fq').focus(); } });
  // controller: B closes a panel; Start opens the menu
  let pb = [];
  setInterval(() => { const g = Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter(Boolean)[0]; if (!g) return; const b = g.buttons.map(x => x.pressed); if (b[1] && !pb[1] && st && st.panel) C('panel', { name: '' }); if (b[9] && !pb[9] && st && !st.panel) C('panel', { name: 'menu' }); pb = b; }, 60);
})();
