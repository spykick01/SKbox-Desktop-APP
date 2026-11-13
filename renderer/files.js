// File manager: browse, edit, add, rename, copy, move, zip and delete files without leaving SKBox (no Windows File Explorer).
// Used by each server's Files tab and by Settings > File manager. Works with a controller: A opens, Y (or the ... button) gives the options.
(function () {
  'use strict';
  const K = window.K, { sk, S, el, esc, nav, toast, focus, ensureFocus, openLayer, closeLayer, confirm, menu, osk } = K, U = K.ui, row = U.row;
  const X = (n, a) => sk.extras.do(n, a), say = r => toast((r && r.error) || 'That did not work');
  const fmtSize = b => b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b >= 1024 ? Math.round(b / 1024) + ' KB' : b + ' B';
  const fmtDate = t => { const d = new Date(t), n = new Date(); const same = d.toDateString() === n.toDateString(); return same ? 'Today ' + K.fmtTime(d) : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric' }); };
  const icon = e => e.dir ? '\u{1F4C1}' : /\.jar(\.disabled)?$/i.test(e.name) ? '\u{1F9E9}' : /\.zip$/i.test(e.name) ? '\u{1F5DC}' : /\.(png|jpg|jpeg|gif|webp)$/i.test(e.name) ? '\u{1F5BC}' : /\.(log)$/i.test(e.name) ? '\u{1F4DC}' : e.text ? '\u{1F4DD}' : '\u{1F4C4}';
  const join = (a, b) => a ? a + '/' + b : b;

  // ----- text editor -----
  function editor(rootKey, relPath, running, done) {
    X('sksFsRead', { root: rootKey, path: relPath }).then(r => {
      if (!r || !r.ok) return say(r);
      let text = r.text, mtime = r.mtime, dirty = false, mode = 'text';
      const L = el('div', 'layer'), b = el('div', 'box wide fedit'), body = el('div'); b.appendChild(body); L.appendChild(b);
      const close = () => { closeLayer(L); done && done(); };
      const tryClose = () => { if (!dirty) return close(); confirm('Leave without saving?', 'Your changes to ' + r.name + ' will be lost.', 'Leave', close); };
      const save = async force => {
        const x = await X('sksFsWrite', { root: rootKey, path: relPath, text, mtime, crlf: r.crlf, force: !!force });
        if (x && x.changed) return confirm('The file changed on disk', 'Save anyway and replace what is there now?', 'Save anyway', () => save(true));
        if (!x || !x.ok) return say(x); mtime = x.mtime; dirty = false; toast('Saved ' + r.name + (running ? ' \u00B7 restart the server to use it' : '')); draw();
      };
      function draw() {
        body.innerHTML = ''; const h = el('h3', '', esc(r.name) + (dirty ? ' \u2022' : '')); body.appendChild(h); body.appendChild(el('div', 'sub', text.split('\n').length + ' lines \u00B7 ' + text.length + ' characters \u00B7 Ctrl+S saves'));
        if (running) body.appendChild(el('p', 'sub', 'The server is running. Many files are only read when it starts, and the server can overwrite some while running. Restart after saving.'));
        const br = el('div', 'btnrow'); const mk = (t, fn, cls) => { const x = nav(el('button', 'btn' + (cls ? ' ' + cls : ''), t)); x.onclick = fn; br.appendChild(x); return x; };
        if (mode === 'text') {
          const ta = el('textarea', 'fta'); ta.value = text; ta.spellcheck = false; ta.wrap = 'off'; ta.oninput = () => { text = ta.value; if (!dirty) { dirty = true; h.innerHTML = esc(r.name) + ' \u2022'; } };
          ta.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); tryClose(); } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } else if (e.key === 'Tab') { e.preventDefault(); const s0 = ta.selectionStart; ta.setRangeText('  ', s0, ta.selectionEnd, 'end'); ta.oninput(); } });
          body.appendChild(ta); setTimeout(() => { try { if (!document.body.classList.contains('padmode')) ta.focus(); } catch (_) {} }, 50);
          mk('Save', () => save(), 'p'); mk('Edit line by line', () => { text = ta.value; mode = 'lines'; draw(); }); mk(dirty ? 'Cancel' : 'Close', tryClose);
        } else {
          body.appendChild(el('p', 'sub', 'Press A on a line to change it. Good for a controller.'));
          const lines = text.split(/\r?\n/), list = el('div', 'flines'); const shown = lines.slice(0, 600);
          shown.forEach((ln, i) => { const rw = row(String(i + 1).padStart(3, ' ') + '  ' + (ln || '\u00A0'), '', '', () => osk({ title: 'Line ' + (i + 1), value: ln, submitLabel: 'Done', onDone: v => { lines[i] = v; text = lines.join('\n'); dirty = true; draw(); }, onCancel: () => {} })); rw.classList.add('fline'); list.appendChild(rw); });
          if (lines.length > shown.length) list.appendChild(el('div', 'sub', 'Only the first 600 lines are shown here. Use the keyboard view for the rest.'));
          const add = row('+ Add a line at the end', '', '', () => osk({ title: 'New line', value: '', submitLabel: 'Add', onDone: v => { lines.push(v); text = lines.join('\n').replace(/\n$/, '') ; dirty = true; draw(); }, onCancel: () => {} })); list.appendChild(add); body.appendChild(list);
          mk('Save', () => save(), 'p'); mk('Keyboard view', () => { mode = 'text'; draw(); }); mk(dirty ? 'Cancel' : 'Close', tryClose);
        }
        body.appendChild(br); const keep = K.current && K.current(); ensureFocus(L, br.firstChild);
      }
      openLayer(L, tryClose); draw();
    });
  }

  // ----- the browser itself -----
  function mount(host, o) {
    const rootKey = o.root; let cur = o.start || '', ents = [], filter = '', info = {};
    K.S.filePos = K.S.filePos || {}; if (o.start == null && K.S.filePos[rootKey]) cur = K.S.filePos[rootKey]; let sortBy = K.S.fileSort || 'name';
    host.innerHTML = ''; const wrap = el('div', 'fman'); host.appendChild(wrap);
    host._filesBack = () => { if (cur) { go(info.parent || ''); return true; } return false; };
    async function go(p, keepName) {
      const r = await X('sksFsList', { root: rootKey, path: p }); if (!wrap.isConnected) return; if (!r || !r.ok) { say(r); K.S.filePos[rootKey] = ''; if (p) return go(''); return; }
      if (r.path !== cur) filter = ''; cur = r.path; info = r; ents = r.list; draw(keepName);
    }
    const act = (label, fn, cls) => { const x = nav(el('button', 'btn' + (cls ? ' ' + cls : ''), label)); x.onclick = fn; return x; };
    function draw(keepName) {
      wrap.innerHTML = ''; const crumbs = [o.title || 'Files'].concat(cur ? cur.split('/') : []).join('  \u203A  ');
      wrap.appendChild(el('div', 'fcrumb', esc(crumbs))); if (info.running) wrap.appendChild(el('div', 'sub', 'The server is running. You can browse and read everything. Stop it before moving or deleting the world or the server jar.'));
      const bar = el('div', 'btnrow ftools'); wrap.appendChild(bar);
      if (cur) bar.appendChild(act('\u2190 Up', () => go(info.parent || '')));
      bar.appendChild(act('New folder', () => osk({ title: 'Folder name', value: '', submitLabel: 'Create', onDone: async v => { const r = await X('sksFsMkdir', { root: rootKey, path: cur, name: v }); if (!r.ok) say(r); else go(cur, v); }, onCancel: () => {} })));
      bar.appendChild(act('New file', () => osk({ title: 'File name, like notes.txt', value: '', submitLabel: 'Create', onDone: async v => { const r = await X('sksFsNew', { root: rootKey, path: cur, name: v }); if (!r.ok) say(r); else go(cur, v); }, onCancel: () => {} })));
      bar.appendChild(act('Add files\u2026', async () => { const f = await sk.pickFiles('files'); if (!f || !f.length) return; const r = await X('sksFsAdd', { root: rootKey, path: cur, files: f }); if (!r.ok) say(r); else toast(r.added.length === 1 ? 'Added ' + r.added[0] : 'Added ' + r.added.length + ' files'); go(cur, r.added && r.added[0]); }));
      bar.appendChild(act('Add a folder\u2026', async () => { const f = await sk.pickFiles('folder'); if (!f || !f.length) return; const stop = toast('Copying\u2026'); const r = await X('sksFsAdd', { root: rootKey, path: cur, files: f }); if (!r.ok) say(r); else toast('Added ' + r.added[0]); go(cur, r.added && r.added[0]); }));
      bar.appendChild(act(filter ? 'Filter: ' + filter : 'Find\u2026', () => osk({ title: 'Show names containing', value: filter, submitLabel: 'Filter', onDone: v => { filter = (v || '').trim(); draw(); }, onCancel: () => {} })));
      bar.appendChild(act('Sort: ' + ({ name: 'Name', size: 'Biggest', date: 'Newest' })[sortBy], () => { sortBy = sortBy === 'name' ? 'size' : sortBy === 'size' ? 'date' : 'name'; K.S.fileSort = sortBy; draw(); }));
      bar.appendChild(act('Refresh', () => go(cur)));
      const list = el('div', 'flist'); wrap.appendChild(list); const q = filter.toLowerCase(); const shown = ents.filter(e => !q || e.name.toLowerCase().includes(q)).sort((x, y) => (y.dir - x.dir) || (sortBy === 'size' ? y.size - x.size : sortBy === 'date' ? y.mtime - x.mtime : 0)); let first = null, want = null;
      shown.forEach(e => {
        const rw = row(icon(e) + '  ' + e.name, e.dir ? 'Folder' : fmtSize(e.size) + ' \u00B7 ' + fmtDate(e.mtime), '<span class="fmore">\u22EF</span>', () => open(e)); rw.classList.add('frow'); rw._onopts = () => options(e);
          const more = rw.querySelector('.fmore'); more.onclick = ev => { ev.stopPropagation(); options(e); }; list.appendChild(rw); if (!first) first = rw; if (keepName === e.name) want = rw; });
      if (!shown.length) list.appendChild(el('div', 'sub', filter ? 'Nothing matches that filter.' : 'This folder is empty.'));
      if (info.truncated) list.appendChild(el('div', 'sub', 'This folder has a lot of files. Only the first 3000 are shown.'));
      const here = K.current && K.current(); const inside = here && wrap.contains(here); if (!here || !document.body.contains(here) || inside || keepName) ensureFocus(wrap, want || first || bar.firstChild);
      K.S.filePos[rootKey] = cur; if (o.onPath) o.onPath(cur);
    }
    function open(e) { const p = join(cur, e.name); if (e.dir) return go(p); if (e.text || /\.(json|ya?ml|properties|txt|log|cfg|conf|toml)$/i.test(e.name)) return editor(rootKey, p, info.running, () => go(cur, e.name)); options(e); }
    function options(e) {
      const p = join(cur, e.name), items = [];
      if (e.dir) items.push({ label: 'Open', fn: () => go(p) }); else items.push({ label: 'Edit as text', fn: () => editor(rootKey, p, info.running, () => go(cur, e.name)) });
      items.push({ label: 'Rename\u2026', fn: () => osk({ title: 'New name', value: e.name, submitLabel: 'Rename', onDone: async v => { const r = await X('sksFsRename', { root: rootKey, path: p, to: v }); if (!r.ok) say(r); else go(cur, v); }, onCancel: () => {} }) });
      items.push({ label: 'Make a copy', fn: async () => { const r = await X('sksFsCopy', { root: rootKey, path: p }); if (!r.ok) say(r); else { toast('Copied as ' + r.name); go(cur, r.name); } } });
      items.push({ label: 'Move to\u2026', fn: () => movePick(e) });
      if (/\.jar$/i.test(e.name) && /(^|\/)(plugins|mods)$/.test(cur)) items.push({ label: 'Turn off (rename to .disabled)', fn: async () => { const r = await X('sksFsRename', { root: rootKey, path: p, to: e.name + '.disabled' }); if (!r.ok) say(r); else go(cur); } });
      if (/\.jar\.disabled$/i.test(e.name)) items.push({ label: 'Turn on', fn: async () => { const r = await X('sksFsRename', { root: rootKey, path: p, to: e.name.replace(/\.disabled$/i, '') }); if (!r.ok) say(r); else go(cur); } });
      if (/\.zip$/i.test(e.name)) items.push({ label: 'Unzip here', fn: async () => { const stop = toast('Unzipping\u2026'); const r = await X('sksFsUnzip', { root: rootKey, path: p }); if (!r.ok) say(r); else { toast('Unzipped to ' + r.name); go(cur, r.name); } } });
      else items.push({ label: 'Zip it', fn: async () => { toast('Zipping\u2026'); const r = await X('sksFsZip', { root: rootKey, path: p }); if (!r.ok) say(r); else { toast('Made ' + r.name); go(cur, r.name); } } });
      items.push({ label: 'Copy its path', fn: () => { X('sksCopy', { text: p }); toast('Copied ' + p); } });
      const vital = !cur && (/^world/i.test(e.name) || /\.jar$/i.test(e.name) || /^(plugins|mods|server\.properties)$/i.test(e.name));
      items.push({ label: 'Delete\u2026', fn: () => confirm('Delete ' + e.name + '?', (vital ? 'Careful: this is part of the server itself (world, jar, plugins or settings). ' : '') + (e.dir ? 'This folder and everything in it is deleted for good.' : 'This file is deleted for good.'), 'Delete', async () => { const r = await X('sksFsDelete', { root: rootKey, path: p }); if (!r.ok) say(r); else { toast('Deleted ' + e.name); go(cur); } }) });
      items.push({ label: 'Cancel', fn: () => {} }); menu(e.name, items);
    }
    async function movePick(e) {   // choose a folder to move it into: the folders on this level, the parent, or the top
      const p = join(cur, e.name), items = [];
      if (cur) { items.push({ label: '\u2191 Up one level', fn: () => doMove(p, join(info.parent || '', e.name)) }); items.push({ label: 'The top folder', fn: () => doMove(p, e.name) }); }
      ents.filter(x => x.dir && x.name !== e.name).slice(0, 40).forEach(x => items.push({ label: '\u{1F4C1} ' + x.name, fn: () => doMove(p, join(join(cur, x.name), e.name)) }));
      items.push({ label: 'Cancel', fn: () => {} }); menu('Move ' + e.name + ' into', items);
    }
    async function doMove(from, to) { const r = await X('sksFsMove', { root: rootKey, path: from, to }); if (!r.ok) say(r); else { toast('Moved'); go(cur); } }
    go(cur);
    return { go, up: () => host._filesBack && host._filesBack(), path: () => cur };
  }
  K.files = { mount, editor };

  // ----- Settings > File manager -----
  K.settingsPages = K.settingsPages || {};
  K.settingsPages.files = pane => {
    const h = t => pane.appendChild(el('h2', '', t)), sub = t => pane.appendChild(el('div', 'sub', t));
    const drawRoots = async () => {
      pane._filesBack = null; pane.innerHTML = ''; h('File manager'); sub('Browse and edit files inside SKBox. Pick a place to open. Server folders are listed first.');
      const r = await X('sksFsRoots'); if (!pane.isConnected) return; if (!r || !r.ok) return sub('Could not list the folders.');
      let first = null; r.roots.forEach(x => { const b = row((x.server ? '\u{1F5A5}  ' : '\u{1F4C2}  ') + x.name, x.sub, '\u2192', () => { pane.innerHTML = ''; h(x.name); const back = nav(el('button', 'btn', '\u2190 All places')); back.onclick = drawRoots; pane.appendChild(back); const host = el('div'); pane.appendChild(host); mount(host, { root: x.key, title: x.name }); pane._filesBack = () => host._filesBack && host._filesBack(); }); pane.appendChild(b); if (!first) first = b; });
      if (!r.roots.length) sub('Nothing to browse yet. Make a server in SKServers first.');
    };
    drawRoots();
  };
})();
