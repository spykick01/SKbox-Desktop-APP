// Runs in a hidden window while a remote player is connected: captures the screen + system audio and streams it over WebRTC.
(() => {
  const PRESETS = { smooth: { w: 1280, h: 720, fps: 60, kbps: 7000 }, low: { w: 1280, h: 720, fps: 30, kbps: 4000 }, balanced: { w: 1920, h: 1080, fps: 30, kbps: 8000 }, high: { w: 1920, h: 1080, fps: 60, kbps: 14000 } };
  let ctl = null, pc = null, sid = null, stream = null, statsTimer = null, grace = null, prevStat = null, curP = null, bv = null, bc = null, blackT = null, isBlack = false;

  function cleanup() {
    stopBlack(); ctl = null; clearInterval(statsTimer); clearTimeout(grace); statsTimer = null; prevStat = null;
    try { pc && pc.close(); } catch (_) {} pc = null;
    try { stream && stream.getTracks().forEach(t => t.stop()); } catch (_) {} stream = null;
  }
  // Is the picture just black? (exclusive fullscreen games often capture as black)
  function stopBlack() { clearInterval(blackT); blackT = null; isBlack = false; try { bv && (bv.srcObject = null); } catch (_) {} bv = null; }
  function startBlack() {
    stopBlack(); const vt = stream && stream.getVideoTracks()[0]; if (!vt) return;
    bv = document.createElement('video'); bv.muted = true; bv.srcObject = new MediaStream([vt]); bv.play().catch(() => {});
    bc = bc || document.createElement('canvas'); bc.width = 32; bc.height = 18;
    blackT = setInterval(() => {
      try {
        if (!bv || !bv.videoWidth) return; const x = bc.getContext('2d', { willReadFrequently: true }); x.drawImage(bv, 0, 0, 32, 18);
        const d = x.getImageData(0, 0, 32, 18).data; let sum = 0, max = 0; for (let i = 0; i < d.length; i += 4) { const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; sum += l; if (l > max) max = l; }
        isBlack = sum / (d.length / 4) < 3 && max < 12;
      } catch (_) {}
    }, 1000);
  }
  // Capture again (the PC may now want the game window instead of the whole screen) and swap it in without dropping the call.
  async function recap() {
    if (!pc || !sid || !curP) return false;
    let ns; try { ns = await capture(curP); } catch (_) { return false; }
    const nv = ns.getVideoTracks()[0], snd = pc.getSenders().find(x => x.track && x.track.kind === 'video');
    if (!nv || !snd) { ns.getTracks().forEach(t => t.stop()); return false; }
    ns.getAudioTracks().forEach(t => t.stop()); try { nv.contentHint = 'motion'; } catch (_) {}
    await snd.replaceTrack(nv); const old = stream.getVideoTracks()[0]; try { stream.removeTrack(old); old.stop(); } catch (_) {} stream.addTrack(nv);
    nv.addEventListener('ended', () => finish('capture ended')); startBlack(); return true;
  }
  window.__skhostRecap = recap;
  function finish(why) { const s = sid; sid = null; cleanup(); if (s) skremote.ended(s); }

  async function capture(P) {
    const video = { width: { ideal: P.w }, height: { ideal: P.h }, frameRate: { ideal: P.fps, max: P.fps }, cursor: 'always' };
    try { return await navigator.mediaDevices.getDisplayMedia({ video, audio: true }); }
    catch (e) { return await navigator.mediaDevices.getDisplayMedia({ video, audio: false }); }   // no system audio available
  }
  // H.264 first (a Mac decodes it in hardware); VP9 / AV1 would be too heavy for an older Mac.
  function videoCodecs() {
    const c = (RTCRtpSender.getCapabilities('video') || { codecs: [] }).codecs.filter(x => !/VP9|AV1/i.test(x.mimeType));
    const h264 = c.filter(x => /H264/i.test(x.mimeType)).sort((a, b) => (/42e01f/i.test(b.sdpFmtpLine || '') ? 1 : 0) - (/42e01f/i.test(a.sdpFmtpLine || '') ? 1 : 0) || (/packetization-mode=1/.test(b.sdpFmtpLine || '') ? 1 : 0) - (/packetization-mode=1/.test(a.sdpFmtpLine || '') ? 1 : 0));
    return h264.concat(c.filter(x => !/H264/i.test(x.mimeType)));
  }
  const iceDone = (p, ms) => new Promise(res => { if (p.iceGatheringState === 'complete') return res(); const t = setTimeout(res, ms); p.addEventListener('icegatheringstatechange', () => { if (p.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); });

  async function tune(P) {
    try {
      const snd = pc.getSenders().find(s => s.track && s.track.kind === 'video'); if (!snd) return;
      const p = snd.getParameters(); if (!p.encodings || !p.encodings.length) p.encodings = [{}];
      p.encodings[0].maxBitrate = P.kbps * 1000; p.encodings[0].maxFramerate = P.fps; p.degradationPreference = 'maintain-framerate';
      await snd.setParameters(p);
    } catch (_) {}
  }
  function startStats() {
    statsTimer = setInterval(async () => {
      if (!pc) return;
      try {
        const rep = await pc.getStats(); let out = null, rtt = 0, codec = '';
        const codecs = {}; rep.forEach(r => { if (r.type === 'codec') codecs[r.id] = r.mimeType; });
        rep.forEach(r => {
          if (r.type === 'outbound-rtp' && r.kind === 'video') { out = r; codec = codecs[r.codecId] || ''; }
          if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated && r.currentRoundTripTime) rtt = Math.round(r.currentRoundTripTime * 1000);
        });
        if (!out) return; const now = performance.now(); let kbps = 0;
        if (prevStat) kbps = Math.round((out.bytesSent - prevStat.b) * 8 / Math.max(1, now - prevStat.t));
        prevStat = { b: out.bytesSent, t: now };
        skremote.stats({ fps: Math.round(out.framesPerSecond || 0), kbps, rtt, codec: codec.replace('video/', ''), w: out.frameWidth || 0, h: out.frameHeight || 0, limit: out.qualityLimitationReason || 'none', black: isBlack, hw: !!(out.encoderImplementation && !/openh264|libvpx|software/i.test(out.encoderImplementation)) });
      } catch (_) {}
    }, 1500);
  }

  skremote.on('kick', () => { sid = null; cleanup(); });
  skremote.on('toClient', text => { try { if (ctl && ctl.readyState === 'open') ctl.send(text); } catch (_) {} });
  // Chromium only allows screen capture right after a user gesture; SKBox starts this through executeJavaScript(..., true), which counts as one.
  async function onOffer(m) {
    cleanup(); sid = m.sid; const P = curP = PRESETS[m.cfg && m.cfg.quality] || PRESETS.smooth;
    try {
      stream = await capture(P);
      stream.getVideoTracks()[0].addEventListener('ended', () => finish('capture ended'));
      pc = new RTCPeerConnection({ iceServers: [] });
      pc.ondatachannel = e => { ctl = e.channel; e.channel.onmessage = ev => { if (typeof ev.data === 'string') skremote.input(ev.data); }; };
      pc.onconnectionstatechange = () => {
        const st = pc && pc.connectionState; clearTimeout(grace);
        if (st === 'failed' || st === 'closed') finish(st); else if (st === 'disconnected') grace = setTimeout(() => finish('disconnected'), 8000);
      };
      await pc.setRemoteDescription(m.offer);
      for (const t of pc.getTransceivers()) {
        const kind = t.receiver.track.kind, track = stream.getTracks().find(x => x.kind === kind);
        if (!track) { t.direction = 'inactive'; continue; }
        t.direction = 'sendonly'; await t.sender.replaceTrack(track);
        if (kind === 'video') { try { track.contentHint = 'motion'; } catch (_) {} try { t.setCodecPreferences(videoCodecs()); } catch (_) {} }
      }
      const ans = await pc.createAnswer(); await pc.setLocalDescription(ans); await iceDone(pc, 700);
      await tune(P); startStats(); startBlack();
      skremote.answer(sid, { type: pc.localDescription.type, sdp: pc.localDescription.sdp });
    } catch (e) {
      const s = sid; sid = null; cleanup(); skremote.answer(s, { error: String((e && e.message) || e).slice(0, 160) });
    }
  }
  window.__skhostOffer = onOffer; skremote.on('offer', onOffer);
})();
