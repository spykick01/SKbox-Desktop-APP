// Hidden window that keeps voice parties alive while you play (the menu closes, the voices stay). Talks to the main process only.
(function () {
  'use strict';
  const bridge = window.skparty; let party = null;
  const optsFor = cfg => { const o = {}; if (cfg && cfg.host) { o.host = String(cfg.host).slice(0, 120); o.port = +cfg.port || 443; o.path = cfg.path || '/'; o.secure = cfg.secure !== false; } return o; };
  const make = cfg => { party = SKPartyCore.create({ Peer: window.Peer, peerOpts: optsFor(cfg) }); party.on(s => bridge.emit(s)); return party; };
  const need = () => { if (!party) throw new Error('You are not in a party.'); return party; };
  bridge.onCmd(async (id, name, a) => {
    a = a || {};
    try {
      let r = {};
      switch (name) {
        case 'create': r = { code: await make(a.cfg).create(a.name) }; break;
        case 'join': r = { code: await make(a.cfg).join(a.code, a.name) }; break;
        case 'leave': if (party) party.leave(); break;
        case 'mute': { const p = need(); if (a.toggle) p.toggleMute(); else p.setMuted(!!a.value); r = { muted: p.state().me.muted }; break; }
        case 'deaf': { const p = need(); p.setDeaf(a.toggle ? !p.state().me.deaf : !!a.value); break; }
        case 'volume': need().setVolume(String(a.id), a.v); break;
        case 'master': need().setMaster(a.v); break;
        case 'name': need().setName(a.name); break;
        case 'chat': need().sendChat(a.text); break;
        case 'kick': need().kick(String(a.id)); break;
        case 'lock': need().setLock(!!a.value); break;
        case 'input': await need().setInput(a.id); break;
        case 'output': await need().setOutput(a.id); break;
        case 'devices': r = await (party || make({})).devices(); break;
        default: throw new Error('Unknown command.');
      }
      bridge.reply(id, { ok: true, r });
    } catch (e) { bridge.reply(id, { ok: false, error: String((e && e.message) || e).slice(0, 200) }); }
  });
})();
