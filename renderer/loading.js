// Loading screens for starting SKBox and launching games. Pick one in Settings > Look & modes, or "Surprise me".
(function () {
  'use strict';
  const K = window.K, { S, el, esc } = K;
  const STYLES = [['orbit', 'Orbit'], ['pulse', 'Pulse'], ['cover', 'Game art'], ['terminal', 'Terminal'], ['tips', 'Tips'], ['classic', 'Classic (simple)'], ['random', 'Surprise me']];
  const TIPS = ['Press the Xbox or PlayStation button any time to open the SK menu.', 'Press Y on a game for options like change cover, collections and backups.', 'Press / or Ctrl+K anywhere to search games, settings and commands.', 'Mute your party microphone anywhere with Ctrl + Alt + Shift + V.', 'Pin your favorites to Home from the Library with X.', 'Switch the whole look in Settings > Look & modes: Classic, Cinema or Deck.', 'SKServers can run a Minecraft server with plugins from Modrinth and SpigotMC.', 'Left and right on a person in a party change how loud they are for you.', 'The SKStore shows free games and deals from Steam and Epic.', 'Remote play lets you use your PC from another device on your Wi-Fi.'];
  const pick = () => { let id = (S.settings && S.settings.loadStyle) || 'orbit'; if (!STYLES.some(s => s[0] === id)) id = 'orbit'; if (id === 'random') { const l = STYLES.filter(s => s[0] !== 'random' && s[0] !== 'classic'); id = l[Math.floor(Math.random() * l.length)][0]; } return id; };
  const tip = () => TIPS[Math.floor(Math.random() * TIPS.length)];
  function html(id, o) {
    const what = esc(o.what || 'Starting'), title = esc(o.title || 'SKBox');
    if (id === 'orbit') return '<div class="ls ls-orbit"><div class="orb"><i></i><i></i><i></i><b>SK</b></div><h2>' + what + ' ' + title + '</h2><p class="lt">' + esc(tip()) + '</p></div>';
    if (id === 'pulse') return '<div class="ls ls-pulse"><div class="pl">SKBOX</div><div class="lbar"><i></i></div><h2>' + what + ' ' + title + '</h2></div>';
    if (id === 'cover') return '<div class="ls ls-cover"><div class="cbg" style="' + (o.cover ? 'background-image:url(\'' + esc(o.cover) + '\')' : 'background:' + (o.grad || '#16213e')) + '"></div><div class="cshade"></div><div class="cbody"><small>' + what + '</small><h1>' + title + '</h1><div class="lbar"><i></i></div><p class="lt">' + esc(tip()) + '</p></div></div>';
    if (id === 'terminal') return '<div class="ls ls-term"><pre class="tl"></pre></div>';
    if (id === 'tips') return '<div class="ls ls-tips"><div class="spin"></div><small>' + what + ' ' + title + '</small><p class="bigtip">' + esc(tip()) + '</p></div>';
    return '';
  }
  function animate(node, id, o) {
    const timers = [];
    if (id === 'terminal') { const lines = ['> SKBox ' + (o.what || 'starting').toLowerCase() + ' ' + (o.title || ''), '> checking controllers ... ok', '> loading profile ... ok', '> warming up audio ... ok', '> opening ' + (o.title || 'home') + ' ...']; const pre = node.querySelector('.tl'); let i = 0; const next = () => { if (!pre.isConnected) return; if (i < lines.length) { pre.textContent += (i ? '\n' : '') + lines[i++]; timers.push(setTimeout(next, 260)); } else { pre.textContent += '\n_'; } }; next(); }
    if (id === 'tips' || id === 'orbit' || id === 'cover') { const t = node.querySelector('.lt, .bigtip'); if (t) timers.push(setInterval(() => { if (t.isConnected) t.textContent = tip(); }, 3200)); }
    return () => timers.forEach(x => { clearTimeout(x); clearInterval(x); });
  }
  // full-screen overlay (launching a game, or the preview). Returns a function that closes it.
  function show(o) {
    o = o || {}; const id = pick(); if (id === 'classic') return K.busy((o.what || 'Launching') + ' ' + (o.title || '') + '\u2026');
    const n = el('div', 'loadscreen', html(id, o)); document.body.appendChild(n); const stopAnim = animate(n, id, o); requestAnimationFrame(() => n.classList.add('in')); const t0 = Date.now(); let closed = false;
    return () => { if (closed) return; closed = true; const wait = Math.max(0, 900 - (Date.now() - t0)); setTimeout(() => { n.classList.remove('in'); setTimeout(() => { stopAnim(); n.remove(); }, 300); }, wait); };
  }
  // the first screen while SKBox starts
  function inline(root) { const id = pick(); root.innerHTML = id === 'classic' ? '<div class="center"><div class="logo">SKBOX</div><div style="color:var(--dim)">Starting up\u2026</div></div>' : '<div class="ls-inline">' + html(id, { what: 'Starting', title: 'SKBox' }) + '</div>'; if (id !== 'classic') animate(root, id, { what: 'Starting', title: 'SKBox' }); return id; }
  K.loading = { styles: STYLES.map(s => ({ id: s[0], name: s[1] })), show, inline, preview() { const stop = show({ what: 'Launching', title: 'Your Game', grad: 'linear-gradient(135deg,#1e3a8a,#0b1020)' }); setTimeout(stop, 4200); }, tips: TIPS };
})();
