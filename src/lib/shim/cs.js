// SKBrowse shim, content script on pages the extension lists in externally_connectable. Carries messages from the website to the extension.
(function () {
  if (window.__skShimCs) return; window.__skShimCs = 1;
  try { var s = document.createElement('script'); s.src = chrome.runtime.getURL('sk-shim-page.js'); s.dataset.skExt = chrome.runtime.id; s.onload = function () { s.remove(); }; (document.head || document.documentElement).appendChild(s); } catch (e) {}
  window.addEventListener('message', function (e) {
    var d = e.data; if (e.source !== window || !d || d.__skReq !== 1 || d.ext !== chrome.runtime.id) return;
    try {
      chrome.runtime.sendMessage({ __skExt: 1, msg: d.msg, url: location.href, origin: location.origin }, function (resp) {
        var err = chrome.runtime.lastError; window.postMessage({ __skRes: 1, ext: d.ext, id: d.id, resp: err ? undefined : resp, err: err ? String(err.message || err) : '' }, '*');
      });
    } catch (x) { window.postMessage({ __skRes: 1, ext: d.ext, id: d.id, err: String(x) }, '*'); }
  });
})();
