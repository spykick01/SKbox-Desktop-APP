// Themes: a theme is a whole look (colors, fonts, shapes, surfaces and backdrop), not just a palette.
// "SK Glass" is the original look and keeps using the color theme and accent pickers. Every other theme brings its own colors.
(function () {
  'use strict';
  const K = window.K || (window.K = {});
  const PIX = "'Press Start 2P', 'Courier New', monospace", VT = "'VT323', 'Courier New', monospace", ORB = "'Orbitron', 'Segoe UI', sans-serif", ARC = "'Archivo Black', 'Arial Black', sans-serif", LOR = "'Lora', Georgia, serif";
  K.skins = [
    { id: 'glass', name: 'SK Glass', desc: 'The classic SKBox look: dark glass, soft glow, your own colors.', pv: { bg: '#0b0f1c', panel: '#1a2036', a: '#2dd4bf', b: '#818cf8', text: '#f3f5ff', font: 'Segoe UI, sans-serif', r: '10px' }, tokens: {} },
    { id: 'pixel', name: 'Pixel Craft', desc: 'Blocky and chunky, like a game made of cubes. Square corners, bevelled buttons, a pixel sky.', pv: { bg: '#78b6ff', panel: '#5a3d20', a: '#6fcf3f', b: '#f5b83d', text: '#f7edd5', font: PIX, r: '0' },
      tokens: { '--bg': '#1b130a', '--panel': 'rgba(70,48,26,.96)', '--panel2': 'rgba(94,66,36,.98)', '--line': 'rgba(0,0,0,.8)', '--text': '#f7edd5', '--dim': '#c9b48c', '--a': '#6fcf3f', '--a2': '#f5b83d', '--dfont': PIX } },
    { id: 'crt', name: 'Retro Terminal', desc: 'A green phosphor screen from the 80s. Monospace type, scanlines and a soft glow.', pv: { bg: '#020a04', panel: '#06200d', a: '#3dff7a', b: '#ffd34d', text: '#9dffb0', font: VT, r: '2px' },
      tokens: { '--bg': '#020a04', '--panel': 'rgba(3,22,10,.9)', '--panel2': 'rgba(5,34,16,.96)', '--line': 'rgba(61,255,122,.35)', '--text': '#a6ffb8', '--dim': '#4fbf6a', '--a': '#3dff7a', '--a2': '#ffd34d', '--font': VT, '--dfont': VT }, scale: 1.22 },
    { id: 'gameboy', name: 'Game Boy', desc: 'Four shades of green on a tiny LCD. Pixel type and no gradients.', pv: { bg: '#9bbc0f', panel: '#8bac0f', a: '#0f380f', b: '#306230', text: '#0f380f', font: PIX, r: '0' },
      tokens: { '--bg': '#9bbc0f', '--panel': '#8bac0f', '--panel2': '#9bbc0f', '--line': '#306230', '--text': '#0f380f', '--dim': '#306230', '--a': '#0f380f', '--a2': '#306230', '--dfont': PIX }, light: true },
    { id: 'synth', name: 'Synthwave', desc: 'A neon sunset over a glowing grid. Hot pink, cyan and wide futuristic type.', pv: { bg: '#2a0a52', panel: '#2b0b55', a: '#ff2bd6', b: '#00e5ff', text: '#fdf2ff', font: ORB, r: '6px' },
      tokens: { '--bg': '#12002b', '--panel': 'rgba(34,8,70,.82)', '--panel2': 'rgba(52,12,96,.92)', '--line': 'rgba(255,43,214,.4)', '--text': '#fdf2ff', '--dim': '#c6a4e8', '--a': '#ff2bd6', '--a2': '#00e5ff', '--dfont': ORB } },
    { id: 'aurora', name: 'Aurora', desc: 'Slowly drifting northern lights behind frosted glass. Big soft corners.', pv: { bg: '#071a2a', panel: '#17324a', a: '#7cf5c8', b: '#9d8cff', text: '#eefcff', font: 'Segoe UI, sans-serif', r: '18px' },
      tokens: { '--bg': '#050f1c', '--panel': 'rgba(255,255,255,.075)', '--panel2': 'rgba(255,255,255,.12)', '--line': 'rgba(255,255,255,.2)', '--text': '#f0fbff', '--dim': '#a9c6d6', '--a': '#7cf5c8', '--a2': '#9d8cff' } },
    { id: 'brutal', name: 'Neo Brutal', desc: 'Loud and flat: thick black outlines, hard shadows, bold type, sunny colors.', pv: { bg: '#ffe66d', panel: '#ffffff', a: '#ff5ca8', b: '#3a86ff', text: '#111111', font: ARC, r: '6px' },
      tokens: { '--bg': '#ffe66d', '--panel': '#ffffff', '--panel2': '#fff7cf', '--line': '#111111', '--text': '#111111', '--dim': '#4a4a4a', '--a': '#ff5ca8', '--a2': '#3a86ff', '--dfont': ARC }, light: true },
    { id: 'paper', name: 'Paper', desc: 'Warm and calm, like a printed page. Soft shadows and a serif touch.', pv: { bg: '#f4efe6', panel: '#fffaf0', a: '#c2410c', b: '#0f766e', text: '#2b2622', font: LOR, r: '12px' },
      tokens: { '--bg': '#f2ece1', '--panel': 'rgba(255,251,242,.94)', '--panel2': '#fffdf7', '--line': 'rgba(70,50,30,.18)', '--text': '#2b2622', '--dim': '#7a6c5c', '--a': '#c2410c', '--a2': '#0f766e', '--dfont': LOR }, light: true }
  ];
  const find = id => K.skins.find(s => s.id === id) || K.skins[0];
  K.skinId = settings => { const id = settings && settings.skin; return K.skins.some(s => s.id === id) ? id : 'glass'; };
  // Applies the chosen theme to the page. Returns its id. For "glass" nothing is set, so the palette and accent pickers work as before.
  K.applySkin = function (settings) {
    const html = document.documentElement, id = K.skinId(settings), sk = find(id);
    (K._skinVars || []).forEach(k => html.style.removeProperty(k)); K._skinVars = [];
    Array.from(html.classList).filter(c => /^skin-/.test(c)).forEach(c => html.classList.remove(c)); html.classList.toggle('skin-light', !!sk.light); html.classList.toggle('no-fx', !!(settings && settings.skinFx === false));
    K.skinScale = sk.scale || 1;
    if (id !== 'glass') { html.classList.add('skin-' + id); Object.keys(sk.tokens).forEach(k => { html.style.setProperty(k, sk.tokens[k]); K._skinVars.push(k); }); }
    return id;
  };
})();
