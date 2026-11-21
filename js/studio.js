/* Clout — Character Studio: create or edit any character in full detail (photo / library face, look, relationship numbers,
   schedule), and export / import characters as small JSON files.
   Everything is validated here: characters must be 18+, images must be
   small data-URL pictures, and text is length-limited. */
(function (G) {
  const U = G.U;
  const UI = G.UI;
  const E = G.Engine;
  const A = UI.acts;
  const esc = U.esc;
  const $ = (s, r = document) => r.querySelector(s);
  const Studio = (G.Studio = {});
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const userErr = (m) => Object.assign(new Error(m), { user: true });

  const ROLES = ['love_interest', 'friend', 'rival', 'mentor', 'influencer', 'journalist', 'troll', 'wildcard', 'brand', 'creator'];
  const GENDERS = ['', 'woman', 'man', 'nonbinary'];
  const CHRONO = [['0', 'Early bird'], ['1', 'Regular'], ['2', 'Night owl']];
  const MAX_AVATAR = 250000; // characters of data URL (a 256px JPEG is ~20-40 KB)
  const numOr = (v, d) => (v === '' || v == null || !isFinite(Number(v)) ? d : Number(v));
  const text = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, n);

  /* ---------- validation ---------- */

  Studio.validAvatar = (u) => typeof u === 'string' && u.length <= MAX_AVATAR && !!UI.safeImg(u);

  // turns untrusted form / file data into a clean spec, or throws a friendly error
  Studio.sanitize = function (f, o = {}) {
    if (!f || typeof f !== 'object' || Array.isArray(f)) throw userErr('That is not a character.');
    const name = text(f.name, 40);
    if (!name) throw userErr('Give the character a name.');
    const age = f.age === '' || f.age == null ? (o.defaultAge || 25) : Number(f.age);
    if (!Number.isFinite(age) || Math.floor(age) !== age) throw userErr('Age must be a whole number.');
    if (!G.Limits.allowedAge(age)) throw userErr(`Characters must be ${G.Limits.MIN_AGE} or older.`); // refused, never quietly "adjusted"
    if (age > 120) throw userErr('Age must be 120 or less.');
    const role = ROLES.includes(f.role) ? f.role : 'wildcard';
    const out = {
      name, age, role,
      handle: text(f.handle, 30),
      emoji: text(f.emoji, 8) || '🙂',
      bio: text(f.bio, 160), personality: text(f.personality, 260) || 'unpredictable', secret: text(f.secret, 200),
      followers: clamp(Math.round(numOr(f.followers, 800)), 5, 1e9),
      rel: typeof f.rel === 'string' ? f.rel : '',
      look: text(Array.isArray(f.look) ? f.look.join(', ') : f.look, 200),
      gender: GENDERS.includes(f.gender) ? f.gender : '',
      person: text(f.person, 200),
      chrono: [0, 1, 2].includes(Number(f.chrono)) && f.chrono !== '' && f.chrono != null ? Number(f.chrono) : null,
    };
    // relationship numbers: only if given (otherwise the preset decides)
    ['aff', 'rom', 'riv', 'trust'].forEach((k) => {
      if (f[k] !== '' && f[k] != null && isFinite(Number(f[k]))) out[k] = clamp(Math.round(Number(f[k])), k === 'aff' ? -100 : 0, 100);
    });
    if (typeof f.status === 'string' && E.STATUSES.includes(f.status)) out.status = f.status;
    // avatar
    if (f.avatar) {
      if (!Studio.validAvatar(f.avatar)) throw userErr('That picture is not usable (use a small PNG, JPEG, WebP or GIF).');
      out.avatar = f.avatar;
    }
    out.clearAvatar = !!f.clearAvatar;
    return out;
  };

  /* ---------- apply to a character ---------- */

  const applyExtras = (n, c) => {
    const S = G.S;
    if (c.clearAvatar) n.avatar = '';
    if (c.avatar) n.avatar = c.avatar;
    if (c.chrono != null) G.Persona.ensure(n).chrono = c.chrono;
    // look + library face
    if (c.look || c.gender) {
      const tags = [c.gender].concat(String(c.look || '').split(/[,\s]+/)).filter(Boolean);
      if (tags.length && G.Media) G.Media.setLook(n, tags);
    }
    if (c.person && G.Media && G.Media.ready && G.Media._debug().persons.has(c.person)) {
      n.media = n.media || { used: [] };
      n.media.person = c.person;
      S.mediaClaims = S.mediaClaims || {};
      S.mediaClaims[c.person] = n.id;
      n.avImg = '';
      G.Media.assign(n, S);
    }
  };

  Studio.create = function (raw) {
    const c = Studio.sanitize(raw);
    const n = E.createCustomNpc(Object.assign({}, c, { handle: c.handle || c.name.split(/\s+/)[0] }));
    // exact relationship numbers / status override the preset
    ['aff', 'rom', 'riv', 'trust'].forEach((k) => c[k] != null && (n[k] = c[k]));
    if (c.status) n.status = c.status;
    if (E.isFamily(n)) n.rom = 0;
    applyExtras(n, c);
    G.Store.save();
    return n;
  };

  Studio.update = function (id, raw) {
    const S = G.S;
    const n = S.npcs[id];
    if (!n) throw userErr('That character no longer exists.');
    const c = Studio.sanitize(raw, { defaultAge: n.age });
    if (c.handle) {
      const h = U.normHandle(c.handle);
      if (h !== n.handle) {
        if (Object.values(S.npcs).some((o) => o.id !== id && o.handle === h) || S.player.handle === h) throw userErr('That handle is already taken.');
        n.handle = h;
      }
    }
    Object.assign(n, { name: c.name, age: c.age, role: c.role, emoji: c.emoji, bio: c.bio, personality: c.personality, secret: c.secret, followers: c.followers });
    ['aff', 'rom', 'riv', 'trust'].forEach((k) => c[k] != null && (n[k] = c[k]));
    if (c.status) n.status = c.status;
    if (E.isFamily(n)) n.rom = 0;
    applyExtras(n, c);
    n.touched = S.clock;
    G.Store.save();
    return n;
  };

  /* ---------- export / import ---------- */

  Studio.exportJSON = function (id) {
    const n = G.S.npcs[id];
    if (!n) return null;
    const o = {
      clout: 'character', v: 1, name: n.name, handle: n.handle, age: n.age, role: n.role, emoji: n.emoji, bio: n.bio, personality: n.personality, secret: n.secret, followers: n.followers,
      aff: n.aff, rom: n.rom, riv: n.riv, trust: n.trust, status: n.status, look: G.Media ? G.Media.lookFor(n).join(', ') : '', chrono: G.Persona.ensure(n).chrono,
    };
    if (n.avatar && n.avatar.length <= 60000) o.avatar = n.avatar;
    return JSON.stringify(o, null, 1);
  };
  Studio.importJSON = function (textIn) {
    if (typeof textIn !== 'string' || textIn.length > 400000) throw userErr('That file is too big to be a character.');
    let o;
    try {
      o = JSON.parse(textIn);
    } catch (e) {
      throw userErr('That file is not valid JSON.');
    }
    if (!o || o.clout !== 'character') throw userErr('That is not a Clout character file.');
    if (o.age == null || o.age === '') throw userErr('That character file has no age — every character must be 18 or older.');
    delete o.status; // imported characters start as strangers unless you change it afterwards
    delete o.aff; delete o.rom; delete o.riv; delete o.trust;
    return Studio.create(o);
  };

  /* ---------- the form ---------- */

  const val = (f, k, d = '') => esc(f[k] != null ? f[k] : d);
  UI.charModal = (f = {}) => {
    const edit = f.edit && G.S.npcs[f.edit] ? G.S.npcs[f.edit] : null;
    UI._editId = edit ? edit.id : null;
    const look = edit && G.Media ? G.Media.lookFor(edit).join(', ') : f.look || '';
    const persons = G.Media && G.Media.ready ? [...G.Media._debug().persons.keys()].slice(0, 300) : [];
    const nv = (k, d) => (edit ? edit[k] : f[k] != null ? f[k] : d);
    const slider = (k, label, v, lo = 0, hi = 100) => `<label>${label}: <b id="v_${k}">${v}</b></label><input type="range" data-f="${k}" data-show="v_${k}" min="${lo}" max="${hi}" value="${v}">`;
    UI.modal(`<button class="close" data-act="closeModal">✕</button><h3>${edit ? '✏️ Edit ' + esc(edit.name) : '➕ Character studio'}</h3>
      ${edit ? '' : `<label>Describe them and let the AI fill the form <span class="muted small">(optional)</span></label>
      <div class="row"><input id="charidea" maxlength="200" placeholder="a bitter ex-pop-star turned gossip podcaster…" value="${val(f, 'idea')}"><button class="btn" data-act="genChar">✨ Generate</button></div>`}
      <div class="grid2"><div><label>Name</label><input id="cname" value="${esc(nv('name', f.name || ''))}"></div><div><label>Handle</label><input id="chandle" value="${esc(nv('handle', f.handle || ''))}" placeholder="@name"></div></div>
      <div class="grid2"><div><label>Age (18+)</label><input id="cage" type="number" min="18" max="120" value="${esc(nv('age', f.age || '25'))}"></div><div><label>Emoji</label><input id="cemoji" maxlength="8" value="${esc(nv('emoji', f.emoji || '🙂'))}"></div></div>
      <div class="grid2"><div><label>Role</label><select id="crole">${ROLES.map((r) => `<option ${nv('role', f.role) === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        <div><label>Followers</label><input id="cfollowers" type="number" min="5" value="${esc(nv('followers', f.followers || '2000'))}"></div></div>
      <label>Bio</label><input id="cbio" maxlength="160" value="${esc(nv('bio', f.bio || ''))}">
      <label>Personality &amp; how they type</label><textarea id="cpers" rows="2" maxlength="260">${esc(nv('personality', f.personality || ''))}</textarea>
      <label>Secret</label><input id="csecret" maxlength="200" value="${esc(nv('secret', f.secret || ''))}">
      ${edit ? '' : `<label>Starting relationship with you</label><select id="crel">${E.REL_PRESETS.map((r) => `<option value="${r}">${esc(r.replace('_', ' '))}</option>`).join('')}</select>`}
      <details open><summary><b>📸 Photo &amp; look</b></summary>
        <div class="row wrap" style="margin:8px 0"><div id="cavprev">${UI.avatar(edit || { emoji: f.emoji || '🙂', handle: f.handle || 'x' }, 56)}</div>
          <input type="file" id="cavfile" accept="image/*" style="max-width:240px"><button class="btn sm ghost" data-act="clearAvatar">Remove photo</button></div>
        <label>Look tags <span class="muted small">(matched against your photo library: woman, blonde, curvy, tattoos…)</span></label><input data-f="look" maxlength="200" value="${esc(look)}">
        <div class="grid2"><div><label>Gender</label><select data-f="gender">${GENDERS.map((g) => `<option value="${g}">${g || '—'}</option>`).join('')}</select></div>
          <div><label>Library person</label><select data-f="person"><option value="">Automatic</option>${persons.map((p) => `<option value="${esc(p)}" ${edit && edit.media && edit.media.person === p ? 'selected' : ''}>${esc(p.split('/').pop())}</option>`).join('')}</select></div></div></details>
      <details><summary><b>💞 Relationship with you</b></summary>
        <div class="grid2"><div>${slider('aff', 'Affinity', edit ? edit.aff : 0, -100, 100)}</div><div>${slider('rom', 'Romance', edit ? edit.rom : 0)}</div><div>${slider('riv', 'Rivalry', edit ? edit.riv : 0)}</div><div>${slider('trust', 'Trust', edit ? edit.trust : 0)}</div></div>
        <label>Status</label><select data-f="status"><option value="">(automatic)</option>${E.STATUSES.map((s) => `<option ${edit && edit.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></details>
      <details><summary><b>🕒 Schedule</b></summary><label>When are they online?</label><select data-f="chrono">${edit ? '' : '<option value="">Automatic (from personality)</option>'}${CHRONO.map(([v, l]) => `<option value="${v}" ${edit && String(G.Persona.ensure(edit).chrono) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></details>
      ${edit ? '' : '<label class="check"><input type="checkbox" id="cannounce" checked> Let the world react to their arrival</label>'}
      <div class="row between" style="margin-top:14px"><div class="row">${edit ? `<button class="btn sm" data-act="exportChar" data-id="${edit.id}">📤 Export</button>` : ''}<button class="btn ghost" data-act="closeModal">Cancel</button></div><button class="btn primary" data-act="saveChar">${edit ? 'Save changes' : 'Create'}</button></div>`);
  };

  // read the whole form
  const studioForm = (raw) => {
    const f = {
      name: $('#cname').value, handle: $('#chandle').value, age: $('#cage').value, emoji: $('#cemoji').value, role: $('#crole').value,
      followers: $('#cfollowers').value, bio: $('#cbio').value, personality: $('#cpers').value, secret: $('#csecret').value,
      rel: $('#crel') ? $('#crel').value : '', idea: $('#charidea') ? $('#charidea').value : '',
    };
    const g = (k) => { const el = $(`[data-f="${k}"]`); return el ? (el.type === 'checkbox' ? el.checked : el.value) : undefined; };
    ['look', 'gender', 'person', 'status', 'chrono', 'aff', 'rom', 'riv', 'trust'].forEach((k) => { const v = g(k); if (v !== undefined) f[k] = v; });
    // a new character with untouched (all-zero) sliders keeps the "Starting relationship" preset instead of being reset to strangers
    if (!UI._editId && ['aff', 'rom', 'riv', 'trust'].every((k) => Number(f[k]) === 0)) ['aff', 'rom', 'riv', 'trust'].forEach((k) => delete f[k]);
    if (UI._charAvatar) f.avatar = UI._charAvatar;
    if (UI._charClear) f.clearAvatar = true;
    return f;
  };
  Studio.form = studioForm;
  const baseModal = UI.charModal;
  UI.charModal = (f) => {
    baseModal(f);
    UI._initForm = UI._editId ? null : studioForm(true);
  };

  /* ---------- actions ---------- */

  A.createChar = () => {
    UI._charAvatar = ''; UI._charClear = false;
    UI.charModal();
  };
  A.editChar = (d) => {
    UI._charAvatar = ''; UI._charClear = false;
    UI.charModal({ edit: d.id });
  };
  A.clearAvatar = () => {
    UI._charAvatar = '';
    UI._charClear = true;
    const p = $('#cavprev');
    if (p) p.innerHTML = UI.avatar({ emoji: ($('#cemoji') || {}).value || '🙂', handle: ($('#chandle') || {}).value || 'x' }, 56);
  };
  A.genChar = () =>
    (async () => {
      try {
        UI.setBusy('✨ Designing a character…');
        const d = await E.genNpc($('#charidea').value);
        if (!d || typeof d !== 'object') throw userErr('The model did not return a character. Try again.');
        const a = Number(d.age);
        if (!Number.isFinite(a) || a < 18) d.age = 18; // an AI draft is bumped to 18 in the visible form; ages typed by hand are refused, never adjusted
        else if (a > 120) d.age = 120;
        UI.charModal(Object.assign({}, studioForm(), d, { idea: $('#charidea').value }));
      } catch (e) {
        UI.toast(e.message || String(e), 'bad');
      } finally {
        UI.setBusy(false);
      }
    })();
  A.saveChar = () =>
    (async () => {
      try {
        const f = studioForm();
        const announce = $('#cannounce') ? $('#cannounce').checked : false;
        if (UI._editId) {
          const n = Studio.update(UI._editId, f);
          UI.closeModal();
          UI.toast(`${n.name} updated`, 'good');
          UI.render();
          return;
        }
        const n = Studio.create(f);
        UI.closeModal();
        UI.toast(`${n.name} joined the world!`, 'good');
        UI.render();
        if (announce)
          await E.director(`A brand-new character just arrived on the platform: ${n.id} (${n.name}, ${n.handle}, ${n.role}). Have them introduce themselves with a post, and have a couple of existing cast members react.`);
      } catch (e) {
        if (!e || !e.user) console.error(e);
        UI.toast(e.message || String(e), 'bad');
        G.busy = false;
        UI.setBusy(false);
      }
    })();
  A.exportChar = (d) => {
    const json = Studio.exportJSON(d.id);
    if (!json) return;
    const n = G.S.npcs[d.id];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = (n.handle || n.name).replace(/[^a-z0-9_-]+/gi, '') + '.clout-character.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    UI.toast('Character file saved', 'good');
  };
  A.importChar = () => {
    let inp = $('#charimport');
    if (!inp) {
      inp = document.createElement('input');
      inp.type = 'file';
      inp.id = 'charimport';
      inp.accept = '.json,application/json';
      inp.style.display = 'none';
      document.body.appendChild(inp);
    }
    inp.value = '';
    inp.click();
  };

  // shrink a chosen photo to a 256px square JPEG so saves stay small
  Studio.shrink = (file) =>
    new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(userErr('Pick an image file.'));
      if (file.size > 12e6) return reject(userErr('That image is too large (max 12 MB).'));
      const fr = new FileReader();
      fr.onerror = () => reject(userErr('Could not read that file.'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(userErr('That image could not be opened.'));
        img.onload = () => {
          try {
            const c = document.createElement('canvas');
            c.width = c.height = 256;
            const s = Math.min(img.width, img.height);
            c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
            const url = c.toDataURL('image/jpeg', 0.85);
            Studio.validAvatar(url) ? resolve(url) : reject(userErr('That picture is not usable.'));
          } catch (e) {
            reject(userErr('This browser could not resize the picture.'));
          }
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t && t.id === 'cavfile' && t.files && t.files[0]) {
      Studio.shrink(t.files[0])
        .then((url) => {
          UI._charAvatar = url;
          UI._charClear = false;
          const p = $('#cavprev');
          if (p) p.innerHTML = `<div class="avatar" style="width:56px;height:56px;background:url('${url}') center/cover"></div>`;
        })
        .catch((err) => UI.toast(err.message, 'bad'));
    } else if (t && t.id === 'charimport' && t.files && t.files[0]) {
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const n = Studio.importJSON(String(fr.result));
          UI.toast(`${n.name} imported`, 'good');
          UI.render();
        } catch (err) {
          UI.toast(err.message || 'Could not import that file', 'bad');
        }
      };
      fr.readAsText(t.files[0]);
    }
  });
})(window.G);
