// SKParty core: voice parties over WebRTC (PeerJS for the handshake). One person hosts, the 6-character code is the room,
// everyone else joins the host and then calls everyone else (a mesh, so up to 8 people). Audio goes straight between friends.
// Used by SKBox (hidden engine window) and by the web page friends can open without SKBox.
(function (root) {
  'use strict';
  const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', PREFIX = 'skparty-', MAX = 8;
  const clean = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);
  const genCode = () => { const a = new Uint8Array(6); (root.crypto || window.crypto).getRandomValues(a); return Array.from(a, b => ALPHA[b % ALPHA.length]).join(''); };
  function parseCode(s) {   // accepts "ABC234", "abc 234", or a whole invite link ending in the code
    let t = String(s || '').trim().toUpperCase(); t = t.split(/[#/?=]/).filter(Boolean).pop() || ''; t = t.replace(/[\s-]/g, '');
    return t.length === 6 && Array.from(t).every(c => ALPHA.includes(c)) ? t : '';
  }
  const uid = () => Math.random().toString(36).slice(2, 10);

  function create(opts) {
    const o = Object.assign({ Peer: root.Peer, peerOpts: {}, max: MAX }, opts || {});
    const listeners = []; let peer = null, hostConn = null, local = null, ac = null, silent = null, leaving = false, emitQ = false, timers = [], joinWait = null, peerErrWait = [];
    const me = { id: '', name: 'Me', muted: false, deaf: false, speaking: false }, members = new Map();
    const st = { status: 'idle', code: '', host: false, locked: false, error: '', mic: 'unknown', inputId: '', outputId: '', master: 1, chat: [] };

    const snapshot = () => ({ status: st.status, code: st.code, host: st.host, locked: st.locked, error: st.error, mic: st.mic, inputId: st.inputId, outputId: st.outputId, master: st.master, max: o.max, chat: st.chat.slice(-40),
      me: { id: me.id, name: me.name, muted: me.muted, deaf: me.deaf, speaking: me.speaking },
      members: Array.from(members.values()).map(m => ({ id: m.id, name: m.name, muted: m.muted, deaf: m.deaf, speaking: m.speaking, vol: m.vol, connected: !!m.stream })) });
    const emit = () => { if (emitQ) return; emitQ = true; Promise.resolve().then(() => { emitQ = false; const s = snapshot(); listeners.forEach(f => { try { f(s); } catch (_) {} }); }); };
    const setStatus = (s, err) => { st.status = s; st.error = err || ''; emit(); };
    const every = (fn, ms) => { const t = setInterval(fn, ms); timers.push(t); return t; };
    const sys = text => { st.chat.push({ id: uid(), sys: true, text, ts: Date.now() }); if (st.chat.length > 80) st.chat.shift(); emit(); };
    const ctx = () => { if (!ac) { const C = root.AudioContext || root.webkitAudioContext; ac = new C(); } if (ac.state === 'suspended') ac.resume().catch(() => {}); return ac; };

    // ---- microphone ----
    async function startMic(deviceId) {
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        st.mic = 'ok'; const t = stream.getAudioTracks()[0]; st.inputId = (t && t.getSettings && t.getSettings().deviceId) || deviceId || '';
      } catch (e) { st.mic = e && e.name === 'NotAllowedError' ? 'denied' : 'none'; stream = null; }
      if (!stream) { if (!silent) silent = ctx().createMediaStreamDestination().stream; stream = silent; }
      if (local && local !== stream && local !== silent) local.getTracks().forEach(t => t.stop());
      local = stream; applyMute(); watchLocal(); return st.mic;
    }
    function applyMute() { if (local) local.getAudioTracks().forEach(t => { t.enabled = !(me.muted || me.deaf); }); }
    let stopLocalWatch = null;
    function watchLocal() { if (stopLocalWatch) stopLocalWatch(); stopLocalWatch = watch(local, lvl => { const sp = lvl && !me.muted && !me.deaf; if (sp !== me.speaking) { me.speaking = sp; emit(); } }, true); }
    // level meter: calls cb(true/false) when someone starts / stops talking
    function watch(stream, cb, rawMicLevel) {
      let a, src, buf, on = false, hold = 0, alive = true;
      try { a = ctx().createAnalyser(); a.fftSize = 512; src = ctx().createMediaStreamSource(stream); src.connect(a); buf = new Uint8Array(a.fftSize); } catch (_) { return () => {}; }
      const t = setInterval(() => {
        if (!alive) return; a.getByteTimeDomainData(buf); let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; } const rms = Math.sqrt(sum / buf.length);
        if (rms > 0.02) { hold = 3; if (!on) { on = true; cb(true); } } else if (on && --hold <= 0) { on = false; cb(false); }
      }, 90);
      return () => { alive = false; clearInterval(t); try { src.disconnect(); } catch (_) {} };
    }

    // ---- members ----
    const addMember = (id, name, extra) => { let m = members.get(id); if (!m) { m = { id, name: clean(name) || 'Friend', muted: false, deaf: false, speaking: false, vol: 1, stream: null, call: null, audio: null, stopWatch: null, conn: null }; members.set(id, m); } else if (name) m.name = clean(name) || m.name; if (extra) Object.assign(m, extra); emit(); return m; };
    function dropMember(id, why) {
      const m = members.get(id); if (!m) return; try { m.call && m.call.removeAllListeners && m.call.removeAllListeners(); m.call && m.call.close(); } catch (_) {} try { if (m.conn) { m.conn.removeAllListeners && m.conn.removeAllListeners(); m.conn.close(); } } catch (_) {} if (m.stopWatch) m.stopWatch(); if (m.audio) { m.audio.pause(); m.audio.srcObject = null; } members.delete(id); if (why) sys(m.name + ' ' + why); emit();
    }
    function applyVol(m) { if (m.audio) { m.audio.volume = Math.max(0, Math.min(1, m.vol * st.master)); m.audio.muted = me.deaf; } }
    function attach(id, stream) {
      const m = addMember(id); if (m.stream === stream) return; m.stream = stream; if (!m.audio) { m.audio = new Audio(); m.audio.autoplay = true; } m.audio.srcObject = stream; applyVol(m);
      if (st.outputId && m.audio.setSinkId) m.audio.setSinkId(st.outputId).catch(() => {}); m.audio.play().catch(() => {});
      if (m.stopWatch) m.stopWatch(); m.stopWatch = watch(stream, on => { m.speaking = on; emit(); }); emit();
    }
    function wireCall(call, incoming) {   // metadata is the caller's own name, so it only names the other side on calls we receive
      const id = call.peer, m = addMember(id, incoming && call.metadata && call.metadata.name); m.call = call;
      call.on('stream', s => attach(id, s)); call.on('close', () => { const x = members.get(id); if (x && x.call === call) { x.stream = null; x.call = null; emit(); } });
      call.on('error', () => {});
    }
    const callMember = id => { if (!peer || peer.destroyed) return; try { wireCall(peer.call(id, local, { metadata: { name: me.name } })); } catch (_) {} };

    // ---- messaging (star shape through the host) ----
    const pub = m => ({ id: m.id, name: m.name, muted: m.muted, deaf: m.deaf });
    const sendTo = (c, msg) => { try { c && c.open && c.send(msg); } catch (_) {} };
    const broadcast = (msg, exceptId) => members.forEach(m => { if (m.conn && m.id !== exceptId) sendTo(m.conn, msg); });
    const pushChat = msg => { st.chat.push(msg); if (st.chat.length > 80) st.chat.shift(); emit(); };

    function hostIncoming(c) {
      let joined = false, m = null; const t = setTimeout(() => { if (!joined) try { c.close(); } catch (_) {} }, 10000);
      c.on('data', d => {
        if (!d || typeof d !== 'object') return;
        if (d.t === 'hello' && !joined) {
          if (st.locked) { sendTo(c, { t: 'full', why: 'locked' }); setTimeout(() => { try { c.close(); } catch (_) {} }, 300); return; }
          if (members.size + 1 >= o.max) { sendTo(c, { t: 'full', why: 'full' }); setTimeout(() => { try { c.close(); } catch (_) {} }, 300); return; }
          joined = true; clearTimeout(t); m = addMember(c.peer, d.name, { conn: c });
          sendTo(c, { t: 'welcome', you: c.peer, host: peer.id, locked: st.locked, members: [{ id: me.id, name: me.name, muted: me.muted, deaf: me.deaf }].concat(Array.from(members.values()).filter(x => x.id !== c.peer).map(pub)), chat: st.chat.slice(-20) });
          broadcast({ t: 'join', m: pub(m) }, c.peer); sys(m.name + ' joined');
        } else if (!joined) return;
        else if (d.t === 'me') { m.muted = !!d.muted; m.deaf = !!d.deaf; broadcast({ t: 'me', id: m.id, muted: m.muted, deaf: m.deaf }, m.id); emit(); }
        else if (d.t === 'chat') { const text = String(d.text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300); if (!text) return; const msg = { id: uid(), from: m.id, name: m.name, text, ts: Date.now() }; pushChat(msg); broadcast({ t: 'chat', msg }); }
      });
      c.on('close', () => { clearTimeout(t); if (joined && members.has(c.peer) && !leaving) { const name = members.get(c.peer).name; dropMember(c.peer); broadcast({ t: 'leave', id: c.peer, name }); sys(name + ' left'); } });
      c.on('error', () => {});
    }
    function clientData(d) {
      if (!d || typeof d !== 'object') return;
      if (d.t === 'welcome') {
        me.id = d.you; st.locked = !!d.locked; (d.members || []).forEach(x => { addMember(x.id, x.name, { muted: !!x.muted, deaf: !!x.deaf }); callMember(x.id); }); (d.chat || []).forEach(x => st.chat.push(x)); const h = members.get(d.host); if (h) h.isHost = true;
        if (joinWait) { joinWait.res(); joinWait = null; } emit();
      } else if (d.t === 'full') { if (joinWait) { joinWait.rej(new Error(d.why === 'locked' ? 'The host locked this party.' : 'This party is full (' + o.max + ' people).')); joinWait = null; } }
      else if (d.t === 'join') { addMember(d.m.id, d.m.name, { muted: !!d.m.muted, deaf: !!d.m.deaf }); sys(clean(d.m.name) + ' joined'); }   // the newcomer calls us, we only answer
      else if (d.t === 'leave') { const m = members.get(d.id); if (m) dropMember(d.id); }
      else if (d.t === 'me') { const m = members.get(d.id); if (m) { m.muted = !!d.muted; m.deaf = !!d.deaf; emit(); } }
      else if (d.t === 'chat' && d.msg) pushChat({ id: String(d.msg.id || uid()), from: d.msg.from, name: clean(d.msg.name), text: String(d.msg.text || '').slice(0, 300), ts: +d.msg.ts || Date.now() });
      else if (d.t === 'lock') { st.locked = !!d.locked; emit(); }
      else if (d.t === 'close') endRemote('The host closed the party.');
      else if (d.t === 'kicked') endRemote('The host removed you from the party.');
    }
    function endRemote(msg) { if (leaving) return; teardown(); setStatus('idle', msg); }

    // ---- peer ----
    function makePeer(id) {
      return new Promise((res, rej) => {
        let done = false, p; const fail = e => { if (done) return; done = true; try { p && p.destroy(); } catch (_) {} rej(e); };
        try { p = new o.Peer(id, o.peerOpts); } catch (e) { return fail(new Error('Voice parties are not supported here.')); }
        const t = setTimeout(() => fail(new Error('Could not reach the party service. Check your internet.')), 12000);
        p.on('open', () => { if (done) return; done = true; clearTimeout(t); p.on('error', e => { if (e.type === 'peer-unavailable') { const w = peerErrWait.shift(); if (w) w(e); return; } if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') { st.error = 'The party service is having trouble. Existing voices keep working.'; emit(); } });
          p.on('disconnected', () => { if (!leaving && peer === p && !p.destroyed) setTimeout(() => { try { p.reconnect(); } catch (_) {} }, 3000); }); res(p); });
        p.on('error', e => { clearTimeout(t); const err = new Error(e.type === 'unavailable-id' ? 'id taken' : e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' ? 'Could not reach the party service. Check your internet.' : (e.message || 'Could not start the party.')); err.type = e.type; fail(err); });
      });
    }
    function wirePeer() { peer.on('call', call => { call.answer(local); wireCall(call, true); }); }
    function teardown() {
      leaving = true; timers.forEach(clearInterval); timers = []; if (stopLocalWatch) { stopLocalWatch(); stopLocalWatch = null; }
      Array.from(members.keys()).forEach(id => dropMember(id)); try { if (hostConn) { hostConn.removeAllListeners && hostConn.removeAllListeners(); hostConn.close(); } } catch (_) {} hostConn = null; try { peer && peer.destroy(); } catch (_) {} peer = null;
      if (local && local !== silent) local.getTracks().forEach(t => t.stop()); local = null; me.id = ''; me.speaking = false; st.host = false; st.locked = false; st.chat = []; st.code = ''; joinWait = null; peerErrWait = [];
      leaving = false;
    }

    async function start(name) { if (st.status !== 'idle') throw new Error('You are already in a party.'); me.name = clean(name) || me.name; me.muted = false; me.deaf = false; st.error = ''; setStatus('connecting'); await startMic(); }
    async function createParty(name) {
      await start(name);
      try {
        for (let i = 0; i < 6 && !peer; i++) { const code = genCode(); try { peer = await makePeer(PREFIX + code); st.code = code; } catch (e) { if (e.type !== 'unavailable-id') throw e; } }
        if (!peer) throw new Error('Could not make a party code. Try again.');
      } catch (e) { teardown(); setStatus('idle', e.message); throw e; }
      me.id = peer.id; st.host = true; wirePeer(); peer.on('connection', hostIncoming); setStatus('in'); sys('Party started. Code ' + st.code); return st.code;
    }
    async function joinParty(codeIn, name) {
      const code = parseCode(codeIn); if (!code) throw new Error('That is not a party code. Codes are 6 letters and numbers.');
      await start(name); st.code = code;
      try {
        peer = await makePeer(undefined); wirePeer(); const c = peer.connect(PREFIX + code, { reliable: true }); hostConn = c;
        await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('No party with that code. Check it and try again.')), 12000); peerErrWait.push(() => { clearTimeout(t); rej(new Error('No party with that code. Check it and try again.')); }); c.on('open', () => { clearTimeout(t); peerErrWait = []; res(); }); c.on('error', () => {}); });
        me.id = peer.id; c.on('data', clientData); c.on('close', () => endRemote('The host left, so the party ended.'));
        await new Promise((res, rej) => { joinWait = { res, rej }; const t = setTimeout(() => { if (joinWait) { joinWait = null; rej(new Error('The host did not answer.')); } }, 10000); sendTo(c, { t: 'hello', name: me.name, v: 1 }); });
      } catch (e) { const msg = e.message; teardown(); setStatus('idle', msg); throw e; }
      setStatus('in'); sys('You joined the party'); return st.code;
    }
    function leave() { if (st.status === 'idle') return; leaving = true; if (st.host) { broadcast({ t: 'close' }); } const done = () => { teardown(); setStatus('idle'); }; if (st.host) setTimeout(done, 200); else done(); }
    function setMuted(b) { me.muted = !!b; if (!b && me.deaf) me.deaf = false; applyMute(); members.forEach(applyVol); sendMe(); emit(); }
    function setDeaf(b) { me.deaf = !!b; if (b) me.muted = true; applyMute(); members.forEach(applyVol); sendMe(); emit(); }
    function sendMe() { const msg = { t: 'me', muted: me.muted, deaf: me.deaf }; if (st.host) broadcast({ t: 'me', id: me.id, muted: me.muted, deaf: me.deaf }); else sendTo(hostConn, msg); }
    function sendChat(text) { text = String(text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300); if (!text || st.status !== 'in') return; if (st.host) { const msg = { id: uid(), from: me.id, name: me.name, text, ts: Date.now() }; pushChat(msg); broadcast({ t: 'chat', msg }); } else sendTo(hostConn, { t: 'chat', text }); }
    function kick(id) { if (!st.host) return; const m = members.get(id); if (!m) return; sendTo(m.conn, { t: 'kicked' }); const name = m.name; setTimeout(() => { dropMember(id); broadcast({ t: 'leave', id, name }); sys(name + ' was removed'); }, 150); }
    function setLock(b) { if (!st.host) return; st.locked = !!b; broadcast({ t: 'lock', locked: st.locked }); emit(); }
    async function setInput(id) { await startMic(id || ''); if (peer) members.forEach(m => { const pc = m.call && m.call.peerConnection; const tr = local && local.getAudioTracks()[0]; if (pc && tr) pc.getSenders().forEach(s => { if (s.track && s.track.kind === 'audio') s.replaceTrack(tr).catch(() => {}); }); }); emit(); }
    async function setOutput(id) { st.outputId = id || ''; members.forEach(m => { if (m.audio && m.audio.setSinkId) m.audio.setSinkId(st.outputId).catch(() => {}); }); emit(); }
    async function devices() { try { const l = await navigator.mediaDevices.enumerateDevices(); return { inputs: l.filter(d => d.kind === 'audioinput').map(d => ({ id: d.deviceId, label: d.label || 'Microphone' })), outputs: l.filter(d => d.kind === 'audiooutput').map(d => ({ id: d.deviceId, label: d.label || 'Speakers' })) }; } catch (_) { return { inputs: [], outputs: [] }; } }

    return { create: createParty, join: joinParty, leave, setMuted, setDeaf, toggleMute: () => setMuted(!me.muted), setVolume: (id, v) => { const m = members.get(id); if (m) { m.vol = Math.max(0, Math.min(1, +v || 0)); applyVol(m); emit(); } },
      setMaster: v => { st.master = Math.max(0, Math.min(1, +v || 0)); members.forEach(applyVol); emit(); }, setName: n => { me.name = clean(n) || me.name; emit(); }, sendChat, kick, setLock, setInput, setOutput, devices, state: snapshot, on: f => listeners.push(f), parseCode };
  }
  root.SKPartyCore = { create, parseCode, genCode, ALPHA, MAX };
})(typeof window !== 'undefined' ? window : globalThis);
