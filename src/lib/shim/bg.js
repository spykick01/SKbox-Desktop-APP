// SKBrowse compatibility shim, runs first inside an extension's background. Adds the Chrome features Electron lacks, so extensions that
// use them (VidAngel and others) start up and work instead of crashing: messages from websites, declarativeNetRequest, and quiet stubs.
(function (g) {
  var c = g.chrome; if (!c || g.__skBgShim) return; g.__skBgShim = 1;
  var rt = c.runtime, rv = function (cb, v) { if (typeof cb === 'function') { try { cb(v); } catch (e) {} return undefined; } return Promise.resolve(v); };
  var ev = function () { var ls = []; return { addListener: function (f) { ls.push(f); }, removeListener: function (f) { var i = ls.indexOf(f); if (i >= 0) ls.splice(i, 1); }, hasListener: function (f) { return ls.indexOf(f) >= 0; }, hasListeners: function () { return ls.length > 0; }, _ls: ls }; };
  // 1) onMessageExternal: a website's message arrives through the extension's own content script as {__skExt:1,...}
  try {
    if (rt && rt.onMessage && !rt.onMessageExternal) {
      var ext = ev(), wrap = new WeakMap(), add = rt.onMessage.addListener.bind(rt.onMessage), rem = rt.onMessage.removeListener.bind(rt.onMessage);
      try { rt.onMessageExternal = ext; } catch (e) { try { Object.defineProperty(rt, 'onMessageExternal', { value: ext, configurable: true }); } catch (e2) {} }
      try {
        rt.onMessage.addListener = function (f) { var w = function (m) { if (m && m.__skExt) return; return f.apply(this, arguments); }; wrap.set(f, w); return add(w); };
        rt.onMessage.removeListener = function (f) { return rem(wrap.get(f) || f); };
      } catch (e) { /* event object is read-only: the extension's own listeners will also see these messages */ }
      add(function (m, sender, send) {
        if (!m || !m.__skExt) return; var async = false, done = false;
        var reply = function (r) { if (!done) { done = true; try { send(r); } catch (e) {} } };
        var snd = { url: m.url, origin: m.origin, tab: sender && sender.tab, frameId: sender && sender.frameId };
        ext._ls.slice().forEach(function (f) { try { var r = f(m.msg, snd, reply); if (r === true) async = true; else if (r && typeof r.then === 'function') { async = true; r.then(reply, function () { reply(undefined); }); } } catch (e) {} });
        if (!async && !done) reply(undefined); return true;
      });
    }
  } catch (e) {}
  // 2) declarativeNetRequest: rules are kept here and mirrored to SKBrowse, which applies them (see dnr.js)
  try {
    if (!c.declarativeNetRequest) {
      var S = { dyn: [], ses: [], en: null }, KEY = '__sk_dnr', id = rt && rt.id;
      var post = function () { try { fetch('https://skbox-ext.invalid/dnr/' + id, { method: 'POST', body: JSON.stringify(S), mode: 'no-cors' }).catch(function () {}); } catch (e) {} };
      var save = function () { try { var o = {}; o[KEY] = { dyn: S.dyn, en: S.en }; c.storage.local.set(o); } catch (e) {} };
      var upd = function (arr, o) { o = o || {}; var rm = {}; (o.removeRuleIds || []).forEach(function (i) { rm[i] = 1; }); var add = o.addRules || []; return arr.filter(function (r) { return !rm[r.id] && !add.some(function (x) { return x.id === r.id; }); }).concat(add); };
      c.declarativeNetRequest = {
        updateDynamicRules: function (o, cb) { S.dyn = upd(S.dyn, o); save(); post(); return rv(cb); }, getDynamicRules: function (a, cb) { if (typeof a === 'function') cb = a; return rv(cb, S.dyn.slice()); },
        updateSessionRules: function (o, cb) { S.ses = upd(S.ses, o); post(); return rv(cb); }, getSessionRules: function (a, cb) { if (typeof a === 'function') cb = a; return rv(cb, S.ses.slice()); },
        updateEnabledRulesets: function (o, cb) { var cur = S.en || null; if (!cur) { try { cur = (c.runtime.getManifest().declarative_net_request.rule_resources || []).filter(function (r) { return r.enabled !== false; }).map(function (r) { return r.id; }); } catch (e) { cur = []; } } o = o || {}; S.en = cur.filter(function (i) { return (o.disableRulesetIds || []).indexOf(i) < 0; }).concat((o.enableRulesetIds || []).filter(function (i) { return cur.indexOf(i) < 0; })); save(); post(); return rv(cb); },
        getEnabledRulesets: function (cb) { var en = S.en; if (!en) { try { en = c.runtime.getManifest().declarative_net_request.rule_resources.filter(function (r) { return r.enabled !== false; }).map(function (r) { return r.id; }); } catch (e) { en = []; } } return rv(cb, en); },
        getAvailableStaticRuleCount: function (cb) { return rv(cb, 30000); }, getMatchedRules: function (a, cb) { if (typeof a === 'function') cb = a; return rv(cb, { rulesMatchedInfo: [] }); },
        isRegexSupported: function (o, cb) { return rv(cb, { isSupported: true }); }, setExtensionActionOptions: function (o, cb) { return rv(cb); }, testMatchOutcome: function (o, cb) { return rv(cb, { matchedRules: [] }); },
        onRuleMatchedDebug: ev(), MAX_NUMBER_OF_DYNAMIC_RULES: 30000, MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES: 5000, MAX_NUMBER_OF_SESSION_RULES: 5000, GETMATCHEDRULES_QUOTA_INTERVAL: 10, MAX_GETMATCHEDRULES_CALLS_PER_INTERVAL: 20,
        RuleActionType: { BLOCK: 'block', REDIRECT: 'redirect', ALLOW: 'allow', UPGRADE_SCHEME: 'upgradeScheme', MODIFY_HEADERS: 'modifyHeaders', ALLOW_ALL_REQUESTS: 'allowAllRequests' },
        HeaderOperation: { APPEND: 'append', SET: 'set', REMOVE: 'remove' }, DomainType: { FIRST_PARTY: 'firstParty', THIRD_PARTY: 'thirdParty' },
        ResourceType: { MAIN_FRAME: 'main_frame', SUB_FRAME: 'sub_frame', STYLESHEET: 'stylesheet', SCRIPT: 'script', IMAGE: 'image', FONT: 'font', OBJECT: 'object', XMLHTTPREQUEST: 'xmlhttprequest', PING: 'ping', CSP_REPORT: 'csp_report', MEDIA: 'media', WEBSOCKET: 'websocket', OTHER: 'other' }
      };
      try { c.storage.local.get(KEY, function (r) { var v = r && r[KEY]; if (v) { if (Array.isArray(v.dyn)) S.dyn = v.dyn; if (Array.isArray(v.en)) S.en = v.en; } post(); }); } catch (e) { post(); }
      post();
    }
  } catch (e) {}
  // 3) quiet stubs so code that touches these APIs does not crash
  try {
    if (!c.webRequest) { var w = {}; ['onBeforeRequest', 'onBeforeSendHeaders', 'onSendHeaders', 'onHeadersReceived', 'onAuthRequired', 'onResponseStarted', 'onBeforeRedirect', 'onCompleted', 'onErrorOccurred'].forEach(function (n) { w[n] = ev(); }); w.handlerBehaviorChanged = function (cb) { return rv(cb); }; w.MAX_HANDLER_BEHAVIOR_CHANGED_CALLS_PER_10_MINUTES = 20; c.webRequest = w; }
    if (!c.declarativeContent) c.declarativeContent = { onPageChanged: { addRules: function (r, cb) { return rv(cb, []); }, removeRules: function (a, cb) { if (typeof a === 'function') cb = a; return rv(cb); }, getRules: function (a, cb) { if (typeof a === 'function') cb = a; return rv(cb, []); } }, PageStateMatcher: function (o) { this.o = o; }, ShowAction: function () {}, ShowPageAction: function () {} };
  } catch (e) {}
})(typeof self !== 'undefined' ? self : this);
