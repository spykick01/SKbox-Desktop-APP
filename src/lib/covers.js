// Automatic cover art: searches the Steam store and downloads the portrait "library" image.
const fs = require('fs'), path = require('path');
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const previewUrl = id => 'https://cdn.cloudflare.steamstatic.com/steam/apps/' + id + '/library_600x900.jpg';
const urlsFor = id => [
  'https://cdn.cloudflare.steamstatic.com/steam/apps/' + id + '/library_600x900_2x.jpg',
  'https://cdn.cloudflare.steamstatic.com/steam/apps/' + id + '/library_600x900.jpg',
  'https://cdn.cloudflare.steamstatic.com/steam/apps/' + id + '/header.jpg'
];
async function search(term) {
  const u = 'https://store.steampowered.com/api/storesearch/?term=' + encodeURIComponent(term) + '&l=english&cc=US';
  const r = await fetch(u, { headers: { 'User-Agent': 'SKBox' } });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.items || []).slice(0, 8).map(i => ({ id: i.id, name: i.name, preview: previewUrl(i.id) }));
}
function bestMatch(term, items) {
  const t = norm(term); if (!items.length) return null;
  return items.find(i => norm(i.name) === t) || items.find(i => norm(i.name).startsWith(t) || t.startsWith(norm(i.name))) || items.find(i => norm(i.name).includes(t)) || items[0];
}
async function download(id, dest) {
  for (const u of urlsFor(id)) {
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length < 2000) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, b);
      return { ok: true, portrait: !/header/.test(u) };
    } catch {}
  }
  return { ok: false };
}
async function auto(term, dest) {
  const items = await search(term).catch(() => []);
  const m = bestMatch(term, items);
  if (!m) return { ok: false };
  const d = await download(m.id, dest);
  return d.ok ? { ok: true, matched: m.name, portrait: d.portrait } : { ok: false };
}
module.exports = { search, download, auto, bestMatch, norm };
