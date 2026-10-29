(function () {
  var q = new URLSearchParams(location.search), n = q.get('name') || '', c = q.get('cover') || '';
  document.getElementById('n').textContent = n;
  var el = document.getElementById('c');
  if (c) el.style.backgroundImage = 'url("file:///' + encodeURI(c.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/^\/+/, '') + '")'; else el.style.display = 'none';
})();
