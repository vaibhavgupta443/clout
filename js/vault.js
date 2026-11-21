/* Clout — the VAULT: long-term memory that never forgets, in the style of an Obsidian vault.
   Before, a character who had more than 200 (or 60) memories simply deleted the least valuable one, so old things (a promise, a first meeting, an insult)
   vanished for good. Now:
   - nothing is deleted: a memory pushed out of the short-term stream is ARCHIVED into a note about the person it concerned (one note per person, like a
     person page in Obsidian), short, de-duplicated, and kept with its importance and date;
   - strong memories (importance 8+, and every "I have realised..." reflection) are pinned in the stream, they leave last;
   - recall (Rag.recall) searches the stream AND the vault, and when a question mentions a person it also reads that person's note ("what I know about X");
   - [[wikilinks]] work like Obsidian: you can import your own Obsidian notes (.md files or a folder) as world lore, a retrieved note pulls in the notes it links to
     and the notes that link back to it (one hop of the graph), and the whole world can be exported as one Markdown file full of [[links]].
   Everything is free and offline (no AI call). The notes stay small: at most 30 lines per person. */
(function (G) {
  'use strict';
  const U = G.U;
  const Vault = (G.Vault = { LINES: 30 });
  const clip = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));
  const first = (s) => String(s || '').split(' ')[0];
  const toks = (s) => new Set(G.Rag ? G.Rag.tokens(s) : String(s || '').toLowerCase().match(/[a-z]{4,}/g) || []);
  const jac = (a, b) => {
    if (!a.size || !b.size) return 0;
    let i = 0;
    a.forEach((x) => { if (b.has(x)) i++; });
    return i / (a.size + b.size - i);
  };
  const nameOf = (id) => (id === 'me' ? G.S.player.name : id === '_' ? '' : (G.S.npcs[id] || {}).name || '');

  /* ---------- archive (instead of forgetting) ---------- */
  Vault.archive = function (npc, m) {
    if (!npc || !m || !m.text) return null;
    const key = (m.who || []).find((w) => w && w !== npc.id) || '_';
    const v = (npc.vault = npc.vault || {});
    const note = (v[key] = v[key] || { n: 0, pos: 0, neg: 0, first: m.t, last: m.t, lines: [] });
    note.n++;
    if (m.v > 0.25) note.pos++;
    if (m.v < -0.25) note.neg++;
    note.first = Math.min(note.first, m.t);
    note.last = Math.max(note.last, m.t);
    const tk = toks(m.text);
    const dup = (m.gk && note.lines.find((l) => l.gk === m.gk)) || note.lines.find((l) => jac(toks(l.text), tk) >= 0.7);
    if (dup) { dup.imp = Math.max(dup.imp, m.imp); dup.t = Math.max(dup.t, m.t); if (m.gk && dup.gk === m.gk) dup.text = clip(m.text, 200); return dup; } // (a folded line is updated in place, never filed again and again)
    const line = { t: m.t, text: clip(m.text, 200), imp: m.imp, v: Math.round((m.v || 0) * 100) / 100, kind: m.kind };
    if (m.gk) line.gk = m.gk;
    note.lines.push(line);
    if (note.lines.length > Vault.LINES) {
      let worst = 0;
      let ws = Infinity;
      note.lines.forEach((l, i) => {
        const s = l.imp * 1.5 + 8 * Math.pow(0.995, (G.S.clock - l.t) / 60);
        if (s < ws) { ws = s; worst = i; }
      });
      const gone = note.lines.splice(worst, 1)[0];
      if (gone && gone.imp >= 5) { // the oldest layer: compact, but still searchable
        note.old = note.old || [];
        note.old.push({ t: gone.t, text: clip(gone.text, 70), imp: gone.imp });
        if (note.old.length > 40) { let w2 = 0; let s2 = Infinity; note.old.forEach((l, i) => { const v = l.imp * 1.5 + 8 * Math.pow(0.998, (G.S.clock - l.t) / 60); if (v < s2) { s2 = v; w2 = i; } }); note.old.splice(w2, 1); }
      }
    }
    return line;
  };
  Vault.lines = (npc) => {
    const out = [];
    Object.keys(npc.vault || {}).forEach((k) => { (npc.vault[k].lines || []).forEach((l) => out.push(Object.assign({ who: k }, l))); (npc.vault[k].old || []).forEach((l) => out.push(Object.assign({ who: k, older: true }, l))); });
    return out;
  };
  // "what I know about X": a few words from the archived notes
  Vault.summary = function (npc, id) {
    const note = npc && npc.vault && npc.vault[id];
    if (!note || !note.lines.length) return '';
    const top = note.lines.slice().sort((a, b) => b.imp - a.imp || b.t - a.t).slice(0, 2).map((l) => clip(l.text, 90));
    const mood = note.neg > note.pos + 1 ? 'mostly bad' : note.pos > note.neg + 1 ? 'mostly good' : 'mixed';
    return `${note.n} things in the past with ${nameOf(id) || 'them'} (${mood}); the biggest: ${top.join(' / ')}`;
  };
  Vault.stats = function () {
    const S = G.S;
    let notes = 0;
    let lines = 0;
    let pinned = 0;
    Object.values(S.npcs).forEach((n) => {
      Object.values(n.vault || {}).forEach((x) => { notes++; lines += x.lines.length; });
      (n.mem || []).forEach((m) => { if (m.imp >= 8 || m.kind === 'reflection') pinned++; });
    });
    return { notes, lines, pinned, imported: (S.lore || []).filter((l) => l.source === 'obsidian').length };
  };

  /* ---------- Obsidian: import notes, links ---------- */
  const LINK = /\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g;
  Vault.linksOf = (text) => {
    const out = [];
    let m;
    LINK.lastIndex = 0;
    while ((m = LINK.exec(String(text || '')))) out.push(m[1].trim());
    return Array.from(new Set(out));
  };
  // a markdown note: optional front matter (aliases, tags), body with [[links]]
  Vault.parseNote = function (name, raw) {
    let body = String(raw || '').replace(/\r\n/g, '\n');
    const aliases = [];
    const fm = body.match(/^---\n([\s\S]*?)\n---\n?/);
    if (fm) {
      body = body.slice(fm[0].length);
      const al = fm[1].match(/^aliases?:\s*(.*)$/mi);
      if (al) {
        if (al[1].trim()) al[1].replace(/[\[\]"']/g, '').split(',').forEach((x) => x.trim() && aliases.push(x.trim()));
        else fm[1].slice(fm[1].indexOf(al[0]) + al[0].length).split('\n').forEach((l) => { const m = l.match(/^\s*-\s*(.+)$/); if (m) aliases.push(m[1].replace(/["']/g, '').trim()); });
      }
    }
    const title = String(name || '').replace(/\.(md|markdown|txt)$/i, '').replace(/^.*[\\/]/, '').trim();
    body = body.replace(/^#+\s*/gm, '').replace(/!\[\[[^\]]*\]\]/g, '').trim();
    return { title, aliases: aliases.slice(0, 6), content: body.slice(0, 1400), links: Vault.linksOf(body).slice(0, 12) };
  };
  Vault.importMd = function (files) {
    const S = G.S;
    S.lore = S.lore || [];
    let n = 0;
    (files || []).slice(0, 400).forEach((f) => {
      const p = Vault.parseNote(f.name, f.text);
      if (!p.title || p.content.length < 8) return;
      const entry = { id: U.uid('lo'), source: 'obsidian', title: p.title, keys: [p.title].concat(p.aliases), content: p.content, links: p.links, constant: false };
      const at = S.lore.findIndex((l) => l.source === 'obsidian' && String(l.title).toLowerCase() === p.title.toLowerCase());
      if (at >= 0) S.lore[at] = entry; else S.lore.push(entry);
      n++;
    });
    if (n) { G.Store.saveSoon(); if (G.Rag) G.Rag.corpus(); }
    return n;
  };
  // the whole world as one Markdown file that Obsidian opens: a page per person with [[links]] to the people in their memories
  Vault.exportMd = function () {
    const S = G.S;
    const nm = (id) => nameOf(id);
    const link = (id) => (nm(id) ? `[[${nm(id)}]]` : '');
    const out = [`# ${S.world.name}`, '', `Player: [[${S.player.name}]]`, '', S.world.setting || '', ''];
    Object.values(S.npcs).filter((n) => !n.userAlt && !n.blocked).forEach((n) => {
      out.push(`## ${n.name}`, `${n.role || ''} · ${n.status} · ${clip(n.bio, 120)}`, '');
      (n.facts || []).forEach((f) => out.push(`- fact: ${f}`));
      (n.mem || []).slice().sort((a, b) => b.imp - a.imp).slice(0, 25).forEach((m) => out.push(`- ${U.clockStr ? U.clockStr(m.t) : m.t} (${m.imp}/10) ${m.text} ${(m.who || []).map(link).filter(Boolean).join(' ')}`));
      Object.keys(n.vault || {}).forEach((k) => {
        out.push('', `### ${n.name} remembers ${link(k) || 'the past'}`);
        n.vault[k].lines.forEach((l) => out.push(`- ${l.text}`));
      });
      out.push('');
    });
    (S.lore || []).forEach((l) => out.push(`## ${l.title || (l.keys || [])[0] || 'note'}`, l.content || '', ''));
    return out.join('\n');
  };

  /* ---------- the UI: a card in Settings ---------- */
  const A = G.UI.acts;
  const pickFiles = (dir) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = '.md,.markdown,.txt';
    i.multiple = true;
    if (dir) i.setAttribute('webkitdirectory', '');
    i.onchange = async () => {
      try {
        const files = Array.from(i.files || []).filter((f) => /\.(md|markdown|txt)$/i.test(f.name));
        const arr = await Promise.all(files.map((f) => f.text().then((text) => ({ name: f.name, text }))));
        const n = Vault.importMd(arr);
        G.UI.toast(n ? `📚 ${n} note${n > 1 ? 's' : ''} imported. Characters now know them (and the notes they link to).` : 'No notes found.', n ? 'good' : 'info');
        G.UI.render();
      } catch (e) { G.UI.toast('Could not read those files.', 'bad'); }
    };
    i.click();
  };
  A.vaultImport = () => pickFiles(false);
  A.vaultImportDir = () => pickFiles(true);
  A.vaultExport = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([Vault.exportMd()], { type: 'text/markdown' }));
    a.download = `clout-vault-${G.S.world.name.replace(/\W+/g, '-').toLowerCase()}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  Vault.card = function () {
    if (!G.S) return '';
    const st = Vault.stats();
    return `<div class="card"><h3>🧠 Memory vault</h3>
      <p class="small">Nobody forgets here. When a character has too many memories, the old ones are <b>filed into a note about that person</b> instead of being thrown away, strong memories stay in the front, and they search both when they talk to you.</p>
      <div class="small muted">Notes filed: ${st.notes} · old memories kept: ${st.lines} · strong memories pinned: ${st.pinned} · your Obsidian notes: ${st.imported}</div>
      <div class="row wrap" style="margin-top:8px"><button class="btn sm" data-act="vaultImport">📚 Import Obsidian notes (.md)</button><button class="btn sm" data-act="vaultImportDir">📁 Import a folder</button><button class="btn sm" data-act="vaultExport">📤 Export the world as Markdown</button></div>
      <p class="small muted" style="margin-top:6px">[[links]] work: when a note comes up, the notes it links to (and the ones that link to it) come with it. Free, no AI call.</p></div>`;
  };
})(window.G);
