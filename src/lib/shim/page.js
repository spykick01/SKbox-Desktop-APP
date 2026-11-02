// SKBrowse shim, runs inside the website itself: gives it chrome.runtime.sendMessage(extensionId, message, callback) like real Chrome.
(function () {
  var me = document.currentScript && document.currentScript.dataset.skExt; if (!me) return;
  var c = window.chrome = window.chrome || {}, rt = c.runtime = c.runtime || {}, pend = {}, n = 0, old = rt.sendMessage;
  window.addEventListener('message', function (e) { var d = e.data; if (e.source !== window || !d || d.__skRes !== 1 || d.ext !== me) return; var p = pend[d.id]; if (p) { delete pend[d.id]; p(d); } });
  rt.sendMessage = function () {
    var a = Array.prototype.slice.call(arguments), ext = typeof a[0] === 'string' ? a.shift() : null;
    if (ext !== me) return typeof old === 'function' ? old.apply(rt, arguments) : undefined;   // another extension's shim (or nothing) handles it
    var msg = a.shift(), cb = typeof a[a.length - 1] === 'function' ? a.pop() : null, id = me + ':' + (++n);
    var p = new Promise(function (ok, bad) {
      pend[id] = function (d) { if (cb) { var prev = rt.lastError; if (d.err) rt.lastError = { message: d.err }; try { cb(d.resp); } finally { rt.lastError = prev; } ok(d.resp); } else if (d.err) bad(new Error(d.err)); else ok(d.resp); };
      window.postMessage({ __skReq: 1, ext: me, id: id, msg: msg }, '*');
      setTimeout(function () { if (pend[id]) { delete pend[id]; if (cb) { var prev = rt.lastError; rt.lastError = { message: 'The extension did not answer.' }; try { cb(undefined); } finally { rt.lastError = prev; } } ok(undefined); } }, 30000);
    });
    return cb ? undefined : p;
  };
})();
