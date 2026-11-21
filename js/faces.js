/* Clout — faces: a profile picture for everyone.
   1. Always: a drawn portrait for every character (skin, hair, eyes, glasses, beard...), different for each person and the same every time. No file, no network.
   2. Optionally real-looking photos: put AI-generated face photos (for example from the SFHQ dataset on Kaggle) in the "faces" folder (see tools/prepare-faces.js).
      Settings -> "Use photos from the faces folder" gives each character their own photo, kept in their save. A photo someone already has always wins. */
(function (G) {
  'use strict';
  const U = G.U;
  const UI = G.UI;
  const A = UI.acts;
  const Faces = (G.Faces = { cache: new Map() });

  const SKIN = ['#f6d5bd', '#eec3a1', '#e0a982', '#c98d67', '#a96d49', '#835238', '#5e3a29'];
  const HAIR = ['#17120f', '#2e2018', '#4d3322', '#7a5232', '#b98a4a', '#d9bc72', '#a63a2c', '#8a8a8a', '#2a3563'];
  const SHIRT = ['#2d4a7a', '#7a2d4a', '#2d7a5c', '#6b4b8a', '#c06a2b', '#3b3b46', '#b7b2a6', '#1f6f8b', '#a8323a'];
  const BG = [['#ffd9a8', '#ff9aa2'], ['#a8e6cf', '#7fb7e6'], ['#cbb2fe', '#8fa8ff'], ['#ffe29a', '#ffb199'], ['#b5ead7', '#c7ceea'], ['#fbc2eb', '#a6c1ee'], ['#d4fc79', '#96e6a1']];
  const EYES = ['#2b2b2b', '#3b2a1a', '#2f5d8a', '#3f7a4f', '#6b4a2a'];

  // the drawn portrait (an SVG string), always the same for the same seed
  Faces.svg = function (seed) {
    const h = U.hash(String(seed)) >>> 0;
    const r = (n, k) => Math.abs(Math.imul(h ^ Math.imul(k + 1, 0x9e3779b1), 0x85ebca6b) >>> 7) % n;
    const skin = SKIN[r(SKIN.length, 1)];
    const hair = HAIR[r(HAIR.length, 2)];
    const shirt = SHIRT[r(SHIRT.length, 3)];
    const bg = BG[r(BG.length, 4)];
    const style = r(7, 5);
    const eye = EYES[r(EYES.length, 6)];
    const mouth = r(3, 7);
    const glasses = r(6, 8) === 0;
    const beard = r(8, 9) < 2 && style !== 1 && style !== 2;
    const brow = 37 + r(3, 10) * 0.8;
    const ex = 7.5 + r(3, 11) * 0.8;
    const head = `<ellipse cx="50" cy="47" rx="${17 + r(2, 12)}" ry="21" fill="${skin}"/>`;
    const topShort = `<path d="M31 43 Q30 22 50 22 Q70 22 69 43 Q64 32 50 31 Q36 32 31 43Z" fill="${hair}"/>`;
    const back = style === 1 ? `<path d="M29 45 Q25 80 37 87 L63 87 Q75 80 71 45Z" fill="${hair}"/>` : '';
    const top = [
      topShort,
      topShort,
      `${topShort}<circle cx="50" cy="17" r="7" fill="${hair}"/>`,
      `<path d="M32 41 Q32 26 50 25 Q68 26 68 41 Q62 34 50 34 Q38 34 32 41Z" fill="${hair}" opacity=".75"/>`,
      [[36, 31], [44, 25], [54, 24], [63, 29], [67, 37], [33, 39]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="${hair}"/>`).join(''),
      `<path d="M30 45 Q28 22 52 22 Q72 24 69 41 Q58 28 38 36 Q33 38 30 45Z" fill="${hair}"/>`,
      '',
    ][style];
    const smile = ['M44 57 Q50 62 56 57', 'M45 58 L55 58', 'M43 56 Q50 64 57 56'][mouth];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs>`
      + `<rect width="100" height="100" fill="url(#b)"/>${back}<path d="M12 100 Q14 77 50 75 Q86 77 88 100Z" fill="${shirt}"/><rect x="43" y="62" width="14" height="15" rx="5" fill="${skin}"/><path d="M42 76 L50 86 L58 76Z" fill="${skin}"/>`
      + `${head}${top}<g stroke="#3a2a22" stroke-width="1.4" stroke-linecap="round" fill="none" opacity=".8"><path d="M${50 - ex - 4} ${brow} L${50 - ex + 4} ${brow - 0.8}"/><path d="M${50 + ex - 4} ${brow - 0.8} L${50 + ex + 4} ${brow}"/></g>`
      + `<circle cx="${50 - ex}" cy="45" r="2" fill="${eye}"/><circle cx="${50 + ex}" cy="45" r="2" fill="${eye}"/><path d="M50 47 Q47.5 53 50.5 53.5" stroke="#00000033" stroke-width="1.3" fill="none" stroke-linecap="round"/>`
      + `${beard ? `<path d="M33 52 Q35 73 50 74 Q65 73 67 52 Q62 63 50 63 Q38 63 33 52Z" fill="${hair}" opacity=".85"/>` : ''}<path d="${smile}" stroke="${beard ? '#f3d9d0' : '#8a3b3b'}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`
      + `${glasses ? `<g stroke="#222" stroke-width="1.2" fill="none"><circle cx="${50 - ex}" cy="45" r="5.6"/><circle cx="${50 + ex}" cy="45" r="5.6"/><path d="M${50 - ex + 5.6} 45 L${50 + ex - 5.6} 45"/></g>` : ''}</svg>`;
  };
  Faces.data = (seed) => {
    const k = String(seed);
    let d = Faces.cache.get(k);
    if (!d) {
      d = 'data:image/svg+xml;utf8,' + encodeURIComponent(Faces.svg(k));
      Faces.cache.set(k, d);
      if (Faces.cache.size > 900) Faces.cache.delete(Faces.cache.keys().next().value);
    }
    return d;
  };
  // the drawing is written once as a CSS rule (UI.avClass); each avatar only names it
  Faces.avatar = (seed, size) => UI.picAvatar(Faces.data(seed), size, 'face');
  Faces.on = () => !G.settings || G.settings.faces !== false;

  /* ---------- photos from the faces folder ---------- */
  const FEMALE = 'mia emma olivia ava sophia isabella amelia luna harper ella chloe zoe lily grace nora riley hazel violet aria maya ruby stella jade nina elena sara sarah anna emily lucy kate katie jessica jenny julia laura lisa maria nicole rachel rose sofia tina vanessa wendy alice bella cara dana eva fiona gina holly iris jane kira lena mona nadia paula quinn rosa tess uma vera yara zara'.split(' ');
  const MALE = 'kai dex matt liam noah oliver elijah james lucas mason ethan logan jack leo owen ryan sam tom ben dan jon max nick paul adam alex andrew ben carlos david eric frank george henry ian jake jason kevin luke mark mike nathan oscar peter rob sean tim victor will zack aaron bruno cole dean eli finn gabe hugo ivan jay kyle lee marco noel omar pete raj seth theo vince'.split(' ');
  Faces.guessGender = (name) => {
    const f = String(name || '').toLowerCase().split(/\s+/)[0];
    return FEMALE.includes(f) ? 'f' : MALE.includes(f) ? 'm' : 'any';
  };
  Faces.list = async function () {
    try {
      const r = await fetch('/api/faces/index');
      if (!r || !r.ok) return [];
      const j = await r.json();
      return Array.isArray(j.files) ? j.files : [];
    } catch (e) {
      return [];
    }
  };
  // downsized to 160px so a save stays small (about 8 KB a face)
  Faces.toData = (url) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 160;
      const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 160, 160);
      res(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => rej(new Error('could not read ' + url));
    img.src = url;
  });
  // gives characters without a photo one from the folder: a different face each, women/men folders respected when the name suggests it
  Faces.assignPhotos = async function (opts = {}) {
    const S = G.S;
    const files = await Faces.list();
    if (!files.length) return { assigned: 0, files: 0 };
    S.faceUsed = S.faceUsed || {};
    const used = new Set(Object.keys(S.faceUsed));
    const targets = Object.values(S.npcs).filter((n) => !n.userAlt && !n.blocked && !n.avImg && !UI.safeImg(n.avatar)).sort((a, b) => (b.touched || 0) - (a.touched || 0)).slice(0, opts.max || 80);
    let done = 0;
    for (const n of targets) {
      const g = Faces.guessGender(n.name);
      const pool = (g === 'any' ? files : files.filter((f) => f.g === g || f.g === 'any')).filter((f) => !used.has(f.f));
      const choices = pool.length ? pool : files.filter((f) => !used.has(f.f));
      if (!choices.length) break; // every photo is already someone's: no two characters share a face
      const f = choices[U.hash(n.id) % choices.length];
      try {
        n.avatar = await Faces.toData('/faces/' + f.f.split('/').map(encodeURIComponent).join('/'));
        S.faceUsed[f.f] = n.id;
        used.add(f.f);
        done++;
      } catch (e) {}
    }
    G.Store.saveSoon();
    return { assigned: done, files: files.length };
  };
  A.facesAssign = async () => {
    try {
      const r = await Faces.assignPhotos();
      UI.toast(r.files ? `📸 ${r.assigned} characters now have a photo (${r.files} in the faces folder)` : 'The faces folder is empty. See the note under this button.', r.files ? 'good' : 'info');
    } catch (e) {
      UI.toast(e.message, 'bad');
    }
    UI.render();
  };
})(window.G);
