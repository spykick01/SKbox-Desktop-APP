// SKBox Remote client. Runs as a plain web page (served by SKBox itself) and inside the SKBox Remote app for Mac / Windows.
(() => {
  const $ = s => document.querySelector(s), app = window.skclient || null, isMac = /Mac/i.test(navigator.platform || navigator.userAgent);
  const v = $('#v'), stage = $('#stage'), msg = $('#msg'), bar = $('#bar');
  let pc = null, input = null, base = '', token = '', stream = null, locked = false, statsOn = false, statsTimer = null, graceT = null, prevIn = null;
  const say = (t, cls) => { msg.textContent = t || ''; msg.className = cls || ''; };

  // ---- KeyboardEvent.code -> PC scancode (set 1). "e" prefix = extended key ----
  const SC = {}; ('KeyA:1E KeyB:30 KeyC:2E KeyD:20 KeyE:12 KeyF:21 KeyG:22 KeyH:23 KeyI:17 KeyJ:24 KeyK:25 KeyL:26 KeyM:32 KeyN:31 KeyO:18 KeyP:19 KeyQ:10 KeyR:13 KeyS:1F KeyT:14 KeyU:16 KeyV:2F KeyW:11 KeyX:2D KeyY:15 KeyZ:2C ' +
    'Digit1:02 Digit2:03 Digit3:04 Digit4:05 Digit5:06 Digit6:07 Digit7:08 Digit8:09 Digit9:0A Digit0:0B Minus:0C Equal:0D Backspace:0E Tab:0F BracketLeft:1A BracketRight:1B Enter:1C ControlLeft:1D Semicolon:27 Quote:28 Backquote:29 ShiftLeft:2A Backslash:2B Comma:33 Period:34 Slash:35 ShiftRight:36 NumpadMultiply:37 AltLeft:38 Space:39 CapsLock:3A ' +
    'F1:3B F2:3C F3:3D F4:3E F5:3F F6:40 F7:41 F8:42 F9:43 F10:44 NumLock:45 ScrollLock:46 Numpad7:47 Numpad8:48 Numpad9:49 NumpadSubtract:4A Numpad4:4B Numpad5:4C Numpad6:4D NumpadAdd:4E Numpad1:4F Numpad2:50 Numpad3:51 Numpad0:52 NumpadDecimal:53 IntlBackslash:56 F11:57 F12:58 ' +
    'NumpadEnter:e1C ControlRight:e1D NumpadDivide:e35 PrintScreen:e37 AltRight:e38 Home:e47 ArrowUp:e48 PageUp:e49 ArrowLeft:e4B ArrowRight:e4D End:e4F ArrowDown:e50 PageDown:e51 Insert:e52 Delete:e53 MetaLeft:e5B MetaRight:e5C ContextMenu:e5D').split(' ').forEach(p => { const [k, c] = p.split(':'); SC[k] = c[0] === 'e' ? [parseInt(c.slice(1), 16), 1] : [parseInt(c, 16), 0]; });
  const lookup = code => { if (isMac && code === 'MetaLeft') return SC.ControlLeft; if (isMac && code === 'MetaRight') return SC.ControlRight; return SC[code]; };   // on a Mac, Command acts as Ctrl
  window.__SC = SC;

  const send = o => { if (input && input.readyState === 'open') { try { input.send(JSON.stringify(o)); } catch (_) {} } };

  // ---- connect screen ----
  const store = { get: k => { try { return localStorage.getItem('skr.' + k) || ''; } catch (_) { return ''; } }, set: (k, x) => { try { localStorage.setItem('skr.' + k, x); } catch (_) {} } };
  $('#host').value = app ? store.get('host') : location.host; $('#name').value = store.get('name') || (app && app.deviceName) || (isMac ? 'Mac' : 'Remote player');
  if (!app) { $('#host').readOnly = true; $('#host').title = 'You opened this page from your SKBox PC'; }
  async function scan() {
    if (!app) return; $('#hostsBox').hidden = false; $('#hosts').innerHTML = '<small>Searching\u2026</small>';
    let list = []; try { list = await app.discover(); } catch (_) {}
    $('#hosts').innerHTML = ''; if (!list.length) { $('#hosts').innerHTML = '<small>No PC found. Make sure Remote play is on in SKBox, or type the address below.</small>'; return; }
    list.forEach(h => { const b = document.createElement('button'); b.innerHTML = '<span>' + h.name.replace(/[<>&]/g, '') + '</span><small>' + h.ip + (h.busy ? ' \u00B7 in use' : '') + '</small>'; b.onclick = () => { $('#host').value = h.ip + ':' + h.port; $('#pin').focus(); }; $('#hosts').appendChild(b); });
    if (list.length === 1 && !$('#host').value) { $('#host').value = list[0].ip + ':' + list[0].port; $('#pin').focus(); }
  }
  $('#scan').onclick = scan; if (app) scan();
  $('#pin').addEventListener('keydown', e => { if (e.key === 'Enter') $('#go').click(); });
  $('#go').onclick = () => connect();

  const ice = (p, ms) => new Promise(res => { if (p.iceGatheringState === 'complete') return res(); const t = setTimeout(res, ms); p.addEventListener('icegatheringstatechange', () => { if (p.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); });
  async function connect() {
    const hostIn = $('#host').value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''), pin = $('#pin').value.trim(), name = $('#name').value.trim() || 'Remote player';
    if (!hostIn) return say('Type the address of your PC (shown in SKBox > Settings > Remote play).', 'err');
    if (!/^\d{6}$/.test(pin)) return say('Type the 6-digit PIN shown in SKBox.', 'err');
    store.set('name', name); if (app) store.set('host', hostIn);
    base = 'http://' + (hostIn.includes(':') ? hostIn : hostIn + ':47822'); $('#go').disabled = true; say('Connecting\u2026');
    try {
      pc = new RTCPeerConnection({ iceServers: [] });
      const tv = pc.addTransceiver('video', { direction: 'recvonly' }); pc.addTransceiver('audio', { direction: 'recvonly' });
      try { const c = (RTCRtpReceiver.getCapabilities('video') || { codecs: [] }).codecs; tv.setCodecPreferences(c.filter(x => /H264/i.test(x.mimeType)).concat(c.filter(x => !/H264|VP9|AV1/i.test(x.mimeType)))); } catch (_) {}
      input = pc.createDataChannel('input', { ordered: true });
      input.onclose = () => { if (pc) lost('The PC closed the connection.'); };
      input.onmessage = e => { try { const m = JSON.parse(e.data); if (m && m.t === 'notice' && typeof m.text === 'string') notice(m.text.slice(0, 160)); } catch (_) {} };
      const ms = new MediaStream(); stream = ms;
      pc.ontrack = e => {
        ms.addTrack(e.track); try { e.receiver.playoutDelayHint = 0; } catch (_) {} try { e.receiver.jitterBufferTarget = 0; } catch (_) {}
        if (e.track.kind === 'video') { v.srcObject = ms; v.play().catch(() => { $('#tap').hidden = false; }); }
      };
      pc.onconnectionstatechange = () => { const s = pc && pc.connectionState; clearTimeout(graceT); if (s === 'failed' || s === 'closed') lost('Connection lost.'); else if (s === 'disconnected') graceT = setTimeout(() => lost('Connection lost.'), 6000); };
      await pc.setLocalDescription(await pc.createOffer()); await ice(pc, 2500);
      let res; try { res = await fetch(base + '/api/offer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin, name, offer: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } }) }); }
      catch (_) { throw new Error('Can\u2019t reach that PC. Is Remote play turned on in SKBox, and are you on the same Wi-Fi?'); }
      const j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || ('The PC said no (' + res.status + ').'));
      token = j.token; await pc.setRemoteDescription(j.answer);
      $('#connect').hidden = true; stage.hidden = false; $('#pin').value = ''; say('');
      startStats(); window.addEventListener('keydown', onKey, true); window.addEventListener('keyup', onKey, true); padLoop();
      flashBar();
    } catch (e) { cleanup(); say(e.message || String(e), 'err'); }
    $('#go').disabled = false;
  }

  // ---- leaving ----
  function cleanup() {
    clearInterval(statsTimer); clearTimeout(graceT); window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true);
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (_) {} try { if (document.fullscreenElement) document.exitFullscreen(); } catch (_) {}
    const p = pc; pc = null; input = null; try { p && p.close(); } catch (_) {} v.srcObject = null; stream = null; locked = false; stage.classList.remove('locked'); $('#bMouse').classList.remove('on'); $('#tap').hidden = true;
    stage.hidden = true; $('#connect').hidden = false; padStop = true;
  }
  function lost(t) { if (!pc) return; cleanup(); say(t, 'err'); }
  function bye() { if (token) { try { fetch(base + '/api/bye', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }), keepalive: true }); } catch (_) {} } token = ''; cleanup(); say('Disconnected.', 'ok'); }
  $('#bBye').onclick = bye; window.addEventListener('beforeunload', () => { if (token) { try { navigator.sendBeacon && navigator.sendBeacon(base + '/api/bye', new Blob([JSON.stringify({ token })], { type: 'text/plain' })); } catch (_) {} } });
  $('#tap').onclick = () => { v.play().then(() => { $('#tap').hidden = true; }).catch(() => {}); };

  let noticeT = null; function notice(t) { const n = $('#notice'); n.textContent = t; n.hidden = false; clearTimeout(noticeT); noticeT = setTimeout(() => { n.hidden = true; }, 7000); }
  // ---- toolbar ----
  let barT = null; const flashBar = () => { bar.classList.add('show'); clearTimeout(barT); barT = setTimeout(() => { if (!bar.matches(':hover')) bar.classList.remove('show'); }, 3500); };
  stage.addEventListener('mousemove', e => { if (!locked && e.clientY < 10) flashBar(); }); bar.addEventListener('mouseenter', () => { clearTimeout(barT); bar.classList.add('show'); }); bar.addEventListener('mouseleave', () => { barT = setTimeout(() => bar.classList.remove('show'), 1200); });
  $('#bFull').onclick = async () => {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
      await (stage.requestFullscreen || stage.webkitRequestFullscreen).call(stage); if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock().catch(() => {});
    } catch (_) {}
  };
  $('#bMouse').onclick = () => { if (document.pointerLockElement) document.exitPointerLock(); else { try { v.requestPointerLock(); } catch (_) {} } };
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === v; stage.classList.toggle('locked', locked); $('#bMouse').classList.toggle('on', locked); if (locked) bar.classList.remove('show'); });
  $('#bFix').onclick = () => { send({ t: 'fixfs' }); notice('Asked the PC to fix the picture\u2026'); };
  $('#bStats').onclick = () => { statsOn = !statsOn; $('#stats').hidden = !statsOn; $('#bStats').classList.toggle('on', statsOn); };

  // ---- mouse ----
  let pendAbs = null, pdx = 0, pdy = 0, pwy = 0, pwx = 0, raf = 0;
  function vrect() { const r = v.getBoundingClientRect(), vw = v.videoWidth, vh = v.videoHeight; if (!vw || !vh) return r; const s = Math.min(r.width / vw, r.height / vh), w = vw * s, h = vh * s; return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h }; }
  function flush() {
    raf = 0; if (pendAbs) { send({ t: 'ma', x: pendAbs[0], y: pendAbs[1] }); pendAbs = null; }
    if (pdx || pdy) { send({ t: 'mm', dx: pdx, dy: pdy }); pdx = pdy = 0; } if (pwy) { send({ t: 'mw', dy: Math.round(pwy) }); pwy = 0; } if (pwx) { send({ t: 'mh', dx: Math.round(pwx) }); pwx = 0; }
  }
  const sched = () => { if (!raf) raf = requestAnimationFrame(flush); };
  v.addEventListener('mousemove', e => { if (locked) { pdx += e.movementX; pdy += e.movementY; } else { const r = vrect(); pendAbs = [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; } sched(); });
  const btn = (e, d) => { e.preventDefault(); if (!locked) { const r = vrect(); send({ t: 'ma', x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }); } send({ t: 'mb', b: e.button, d }); };
  const pressed = new Set();
  v.addEventListener('mousedown', e => { pressed.add(e.button); btn(e, 1); }); window.addEventListener('mouseup', e => { if (!stage.hidden && pressed.has(e.button)) { pressed.delete(e.button); btn(e, 0); } }); v.addEventListener('contextmenu', e => e.preventDefault());
  v.addEventListener('wheel', e => { e.preventDefault(); const k = e.deltaMode === 1 ? 40 : 1; pwy += -e.deltaY * k * 1.2; pwx += e.deltaX * k * 1.2; sched(); }, { passive: false });

  // ---- keyboard ----
  const downKeys = new Set();
  function onKey(e) {
    if (stage.hidden) return;
    if (e.type === 'keydown' && e.ctrlKey && e.altKey && e.shiftKey && e.code === 'KeyD') { e.preventDefault(); bye(); return; }
    const sc = lookup(e.code); if (!sc) return; e.preventDefault(); e.stopPropagation();
    const d = e.type === 'keydown' ? 1 : 0; if (d) downKeys.add(e.code); else downKeys.delete(e.code);
    send({ t: 'k', sc: sc[0], ext: sc[1], d });
    // macOS does not send key-up for keys pressed while Command is held: let go of them when Command is released
    if (!d && isMac && (e.code === 'MetaLeft' || e.code === 'MetaRight')) { downKeys.forEach(c => { if (!/^(Meta|Shift|Alt|Control)/.test(c)) { const s2 = lookup(c); if (s2) send({ t: 'k', sc: s2[0], ext: s2[1], d: 0 }); downKeys.delete(c); } }); }
  }
  window.addEventListener('blur', () => { downKeys.clear(); send({ t: 'ra' }); });

  // ---- controller: sent as plain button / stick state, the PC decides what to do with it ----
  let padStop = false, lastPad = '', lastPadT = 0;
  function padLoop() {
    padStop = false;
    const step = () => {
      if (padStop || !pc) return; requestAnimationFrame(step);
      const p = Array.from(navigator.getGamepads ? navigator.getGamepads() : []).find(x => x && x.connected); if (!p) return;
      let b = 0; p.buttons.forEach((x, i) => { if (i < 17 && (x.pressed || ((i === 6 || i === 7) && x.value > 0.4))) b |= 1 << i; });
      const ax = p.axes, cl = n => Math.round(Math.max(-1, Math.min(1, n || 0)) * 100), f = { t: 'p', b, lx: cl(ax[0]), ly: cl(ax[1]), rx: cl(ax[2]), ry: cl(ax[3]), lt: Math.round((p.buttons[6] ? p.buttons[6].value : 0) * 100), rt: Math.round((p.buttons[7] ? p.buttons[7].value : 0) * 100) };
      const key = JSON.stringify(f), now = performance.now(), active = b || Math.abs(f.lx) > 14 || Math.abs(f.ly) > 14 || Math.abs(f.rx) > 14 || Math.abs(f.ry) > 14;
      if (key !== lastPad || (active && now - lastPadT > 100)) { lastPad = key; lastPadT = now; send(f); }
    };
    requestAnimationFrame(step);
  }

  // ---- stats ----
  function startStats() {
    prevIn = null;
    statsTimer = setInterval(async () => {
      if (!pc || !statsOn) return;
      try {
        const rep = await pc.getStats(); let inb = null, rtt = 0; const codecs = {};
        rep.forEach(r => { if (r.type === 'codec') codecs[r.id] = r.mimeType; });
        rep.forEach(r => { if (r.type === 'inbound-rtp' && r.kind === 'video') inb = r; if (r.type === 'candidate-pair' && r.nominated && r.currentRoundTripTime) rtt = Math.round(r.currentRoundTripTime * 1000); });
        if (!inb) return; const now = performance.now(); let mbps = 0; if (prevIn) mbps = (inb.bytesReceived - prevIn.b) * 8 / Math.max(1, now - prevIn.t) / 1000; prevIn = { b: inb.bytesReceived, t: now };
        $('#stats').textContent = (codecs[inb.codecId] || '').replace('video/', '') + ' \u00B7 ' + (inb.frameWidth || v.videoWidth) + 'x' + (inb.frameHeight || v.videoHeight) + ' \u00B7 ' + Math.round(inb.framesPerSecond || 0) + ' fps \u00B7 ' + mbps.toFixed(1) + ' Mbps \u00B7 ' + rtt + ' ms \u00B7 dropped ' + (inb.framesDropped || 0);
      } catch (_) {}
    }, 1000);
  }
})();
