// Party panel: start or join a voice party, see who is talking, mute, volumes, chat. Used by the SK menu (and the Home widget).
(function () {
  'use strict';
  const K = window.K, { sk, S, el, esc, nav, toast, menu, confirm, osk, focus, ensureFocus } = K;
  const X = (n, a) => sk.extras.do(n, a), P = (c, a) => sk.party.cmd(c, a);
  const SITE = 'https://sksmpchat.netlify.app';
  const link = c => SITE + '/party/#' + c;
  const myName = () => { const p = (S.players && (S.players[S.active] || S.players[0])) || null; return (p && (p.nick || p.u)) || 'Player'; };
  const say = r => { if (r && r.ok === false) toast(r.error || 'That did not work'); return r; };
  let cur = null, view = null;
  const idle = () => ({ status: 'idle', code: '', host: false, locked: false, error: '', mic: 'unknown', max: 8, chat: [], me: { name: '', muted: false, deaf: false, speaking: false }, members: [], master: 1 });
  K.partyState = null;
  sk.on('party:state', s => { cur = s; K.partyState = s; if (view && view.isConnected) view.redraw(); if (K.partyOnState) K.partyOnState(s); });
  if (sk.party && sk.party.state) sk.party.state().then(s => { cur = s; K.partyState = s; if (K.partyOnState) K.partyOnState(s); }).catch(() => {});

  const stateNow = () => cur || idle();
  const label = s => s.status === 'in' ? (s.members.length + 1) + ' in party' : s.status === 'connecting' ? 'Connecting\u2026' : '';
  const letter = n => esc((n || '?')[0].toUpperCase());

  // render into a panel element. opts.title: heading text.
  function render(panel, opts) {
    opts = opts || {}; let busy = false;
    let sig = '', dirty = false;
    const sigOf = s => [s.status, s.code, s.host, s.locked, s.error, s.mic, s.inputId, s.outputId, s.me.muted, s.me.deaf, s.me.name, (s.chat || []).length, s.members.map(m => [m.id, m.name, m.muted, m.deaf, m.connected].join(':')).join('|')].join('~');
    const layersOpen = () => { const l = document.getElementById('layers'), top = l && l.lastElementChild; return !!(top && !top.contains(panel)); };   // only wait when something is open on top of this panel
    const redraw = () => {
      const s = stateNow(); const sg = sigOf(s);
      if (sg === sig && panel.querySelector('.plist2')) {   // only the talking highlights changed: patch them, keep focus where it is
        const rows = panel.querySelectorAll('.pm'); rows.forEach(r => { const k = r.dataset.key; const m = k === 'm:me' ? s.me : s.members.find(x => 'm:' + x.id === k); if (m) r.classList.toggle('speak', !!m.speaking); }); return;
      }
      if (layersOpen()) { dirty = true; return; }
      dirty = false; const keep = K.current && K.current() && K.current().dataset.key; draw(); if (keep) { const k = panel.querySelector('[data-key="' + keep + '"]'); if (k) focus(k); }
    };
    K.partyLayersClosed = () => { if (dirty && panel.isConnected) { dirty = false; redraw(); } };
    view = { get isConnected() { return panel.isConnected; }, redraw };
    const btn = (key, text, fn, cls) => { const b = nav(el('button', 'btn' + (cls ? ' ' + cls : ''), esc(text))); b.dataset.key = key; b.onclick = fn; return b; };
    function draw() {
      const s = stateNow(); sig = sigOf(s); panel.innerHTML = '<h2>' + esc(opts.title || 'Party') + '</h2>'; const add = e => { panel.appendChild(e); return e; };
      if (s.status === 'idle' || s.status === 'connecting') {
        add(el('p', 'sub', 'Talk to your friends while you play. Start a party and share the code, or join a friend\u2019s. Friends without SKBox can join from the web page. Up to ' + (s.max || 8) + ' people.'));
        if (s.error) add(el('div', 'salert', esc(s.error)));
        const bar = add(el('div', 'cbar'));
        bar.append(btn('start', s.status === 'connecting' ? 'Connecting\u2026' : 'Start a party', async () => { if (busy) return; busy = true; toast('Starting your party\u2026'); const r = say(await P('create', { name: myName() })); busy = false; if (r && r.ok) toast('Party code ' + r.r.code); redraw(); }, 'p'),
          btn('join', 'Join with a code', () => osk({ title: 'Party code or invite link', value: '', submitLabel: 'Join', onDone: async v => { if (!v || busy) return; busy = true; toast('Joining\u2026'); say(await P('join', { code: v, name: myName() })); busy = false; redraw(); } })));
        if (s.status === 'connecting') bar.firstChild.disabled = true;
        add(el('p', 'sub', 'You will be called <b>' + esc(myName()) + '</b>. Your microphone is only used while you are in a party.'));
        ensureFocus(panel, panel.querySelector('[data-key="start"]')); return;
      }
      // in a party
      const head = add(el('div', 'pcode')); head.innerHTML = '<div><small>Party code</small><b>' + esc(s.code) + '</b></div><div class="pn">' + (s.host ? 'You are the host' : 'Joined') + (s.locked ? ' \u00B7 locked' : '') + '</div>';
      if (s.error) add(el('div', 'salert', esc(s.error)));
      if (s.mic === 'denied') add(el('div', 'salert', 'Windows is blocking the microphone. Open Windows Settings > Privacy & security > Microphone and turn on "Let desktop apps access your microphone". You can still listen.'));
      else if (s.mic === 'none') add(el('div', 'salert', 'No microphone found. You can listen, but nobody can hear you.'));
      const bar = add(el('div', 'cbar'));
      bar.append(btn('mute', s.me.muted && !s.me.deaf ? '\u{1F3A4} Unmute' : '\u{1F3A4} Mute', async () => say(await P('mute', { toggle: true })), s.me.muted ? 'p' : ''), btn('deaf', s.me.deaf ? '\u{1F50A} Undeafen' : '\u{1F507} Deafen', async () => say(await P('deaf', { toggle: true })), s.me.deaf ? 'p' : ''));
      const bar2 = add(el('div', 'cbar'));
      bar2.append(btn('copy', 'Copy code', () => { X('sksCopy', { text: s.code }); toast('Code copied: ' + s.code); }), btn('link', 'Copy invite link', () => { X('sksCopy', { text: link(s.code) }); toast('Invite link copied'); }), ...(s.host ? [btn('lock', s.locked ? 'Unlock party' : 'Lock party', async () => say(await P('lock', { value: !s.locked })))] : []), btn('leave', s.host ? 'End party' : 'Leave party', () => confirm(s.host ? 'End the party for everyone?' : 'Leave the party?', s.host ? 'Everyone is disconnected when the host leaves.' : 'You can join again with the code.', s.host ? 'End party' : 'Leave', async () => say(await P('leave', {})), true), 'danger'));
      add(el('h3', '', 'In this party'));
      const list = add(el('div', 'plist2')); const row = (m, mine) => {
        const r = nav(el('button', 'pm' + (m.speaking ? ' speak' : '') + (m.muted ? ' muted' : '')));
        r.dataset.key = 'm:' + (mine ? 'me' : m.id); r.innerHTML = '<div class="av">' + letter(m.name) + '</div><div class="pmn">' + esc(m.name) + (mine ? ' (you)' : '') + '</div><div class="pmi">' + (m.deaf ? '\u{1F507}' : m.muted ? '\u{1F3A4}\u{20E0}' : '') + (!mine && !m.connected ? ' connecting\u2026' : '') + (!mine ? ' ' + Math.round(m.vol * 100) + '%' : '') + '</div>';
        if (!mine) { r._adjust = d => { const v = Math.max(0, Math.min(1, Math.round((m.vol + (d < 0 ? -0.1 : 0.1)) * 10) / 10)); m.vol = v; P('volume', { id: m.id, v }); const t = r.querySelector('.pmi'); if (t) t.textContent = Math.round(v * 100) + '%'; K.snd && K.snd.play('move'); };
          r.onclick = () => menu(m.name, [{ label: m.vol === 0 ? 'Unmute them for you' : 'Silence them for you', fn: () => P('volume', { id: m.id, v: m.vol === 0 ? 1 : 0 }) }, ...(s.host ? [{ label: 'Remove from party', fn: () => confirm('Remove ' + m.name + '?', 'They can join again with the code unless you lock the party.', 'Remove', () => P('kick', { id: m.id }), true) }] : []), { label: 'Back', fn: () => {} }]); }
        else r.onclick = () => osk({ title: 'Your name in this party', value: m.name, submitLabel: 'Save', onDone: v => { if (v && v.trim()) P('name', { name: v.trim() }); } });
        return r;
      };
      list.appendChild(row(s.me, true)); s.members.forEach(m => list.appendChild(row(m, false)));
      if (!s.members.length) list.appendChild(el('p', 'sub', 'Nobody else is here yet. Share the code or the invite link.'));
      add(el('p', 'sub', 'Left and right on a person change how loud they are for you.'));
      add(el('h3', '', 'Chat')); const chat = add(el('div', 'pchat')); const lines = (s.chat || []).slice(-6); if (!lines.length) chat.innerHTML = '<i>No messages yet</i>'; lines.forEach(c => chat.appendChild(el('div', c.sys ? 'sysm' : '', c.sys ? esc(c.text) : '<b>' + esc(c.name || '?') + '</b> ' + esc(c.text))));
      const bar3 = add(el('div', 'cbar')); bar3.append(btn('say', 'Send a message', () => osk({ title: 'Party message', value: '', submitLabel: 'Send', onDone: v => { if (v && v.trim()) P('chat', { text: v.trim() }); } })),
        btn('mic', 'Microphone', async () => { const d = await P('devices', {}); const l = (d && d.ok && d.r.inputs) || []; if (!l.length) return toast('No microphones found'); menu('Microphone', l.map(x => ({ label: x.label.slice(0, 50) + (x.id === s.inputId ? '  \u2713' : ''), fn: async () => say(await P('input', { id: x.id })) })).concat([{ label: 'Back', fn: () => {} }])); }),
        btn('spk', 'Speakers', async () => { const d = await P('devices', {}); const l = (d && d.ok && d.r.outputs) || []; if (!l.length) return toast('No speakers found'); menu('Speakers', l.map(x => ({ label: x.label.slice(0, 50) + (x.id === s.outputId ? '  \u2713' : ''), fn: async () => say(await P('output', { id: x.id })) })).concat([{ label: 'Back', fn: () => {} }])); }));
      const vol = btn('master', 'Party volume ' + Math.round((s.master == null ? 1 : s.master) * 100) + '%', () => {}); vol._adjust = d => { const v = Math.max(0, Math.min(1, Math.round(((cur ? cur.master : 1) + (d < 0 ? -0.1 : 0.1)) * 10) / 10)); P('master', { v }); vol.textContent = 'Party volume ' + Math.round(v * 100) + '%'; K.snd && K.snd.play('move'); }; bar3.appendChild(vol);
      ensureFocus(panel, panel.querySelector('[data-key="mute"]'));
    }
    draw(); return { redraw };
  }
  K.partyUI = { render, state: stateNow, link, label, myName, detach: () => { view = null; K.partyLayersClosed = null; } };
})();
