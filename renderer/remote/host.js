// Runs in a hidden window while a remote player is connected: captures the screen + system audio and streams it over WebRTC.
(() => {
  const PRESETS = { low: { w: 1280, h: 720, fps: 30, kbps: 4000 }, balanced: { w: 1920, h: 1080, fps: 30, kbps: 8000 }, high: { w: 1920, h: 1080, fps: 60, kbps: 14000 } };
  let ctl = null, pc = null, sid = null, stream = null, statsTimer = null, grace = null, prevStat = null;

  function cleanup() {
    ctl = null; clearInterval(statsTimer); clearTimeout(grace); statsTimer = null; prevStat = null;
    try { pc && pc.close(); } catch (_) {} pc = null;
    try { stream && stream.getTracks().forEach(t => t.stop()); } catch (_) {} stream = null;
  }
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
        skremote.stats({ fps: Math.round(out.framesPerSecond || 0), kbps, rtt, codec: codec.replace('video/', ''), w: out.frameWidth || 0, h: out.frameHeight || 0, limit: out.qualityLimitationReason || 'none', hw: !!(out.encoderImplementation && !/openh264|libvpx|software/i.test(out.encoderImplementation)) });
      } catch (_) {}
    }, 1500);
  }

  skremote.on('kick', () => { sid = null; cleanup(); });
  skremote.on('toClient', text => { try { if (ctl && ctl.readyState === 'open') ctl.send(text); } catch (_) {} });
  // Chromium only allows screen capture right after a user gesture; SKBox starts this through executeJavaScript(..., true), which counts as one.
  async function onOffer(m) {
    cleanup(); sid = m.sid; const P = PRESETS[m.cfg && m.cfg.quality] || PRESETS.balanced;
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
      const ans = await pc.createAnswer(); await pc.setLocalDescription(ans); await iceDone(pc, 2500);
      await tune(P); startStats();
      skremote.answer(sid, { type: pc.localDescription.type, sdp: pc.localDescription.sdp });
    } catch (e) {
      const s = sid; sid = null; cleanup(); skremote.answer(s, { error: String((e && e.message) || e).slice(0, 160) });
    }
  }
  window.__skhostOffer = onOffer; skremote.on('offer', onOffer);
})();
