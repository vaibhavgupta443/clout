/* Clout — Admin / command center: act as ANY character, edit anything, steer the world.
   With admin mode on, every "act as" feature (post, reply, comment, story, like, follow, chat) works for every character,
   the other characters react to those actions like to any other, and the commands below do the rest. */
(function (G) {
  const U = G.U;
  const UI = G.UI;
  const E = G.Engine;
  const P = G.Pages;
  const A = UI.acts;
  const { esc, clamp } = U;
  const $ = (s) => document.querySelector(s);
  const Admin = (E.Admin = {});

  const bad = (msg) => {
    throw Object.assign(new Error(msg), { user: true });
  };
  Admin.on = () => !!(G.S && G.S.admin);
  Admin.setOn = (on) => {
    const S = G.S;
    S.admin = !!on;
    if (!on && S.activeAlt && !(S.npcs[S.activeAlt] || {}).userAlt) S.activeAlt = null; // only burner accounts stay selectable
    G.Store.save();
  };

  /* ---------- helpers ---------- */

  const need = (ref) => {
    const n = ref && E.findNpc(ref);
    if (!n) bad(`I do not know "${ref || ''}". Use a handle like @mia, a name, or an id like n3.`);
    return n;
  };
  const take = (s) => {
    const m = /^\s*(\S+)\s*([\s\S]*)$/.exec(s || '');
    return m ? [m[1], m[2].trim()] : ['', ''];
  };
  const post = (id) => {
    const p = G.S.posts[id];
    if (!p) bad(`There is no post ${id}.`);
    return p;
  };

  // plant a fact the character will always know (sent to the AI and used by the free simulation's memory)
  Admin.addFact = (n, text) => {
    text = String(text || '').trim().slice(0, 200);
    if (!text) return false;
    n.facts = (n.facts || []).concat(text).slice(-12);
    if (G.Mem) G.Mem.add(n, { kind: 'told', text, who: [], valence: 0, imp: 7, tags: ['admin'] });
    return true;
  };

  // a private message that simply arrives in YOUR inbox from that character
  Admin.inject = (n, text) => {
    const S = G.S;
    text = String(text || '').trim().slice(0, 1200);
    if (!text) return null;
    const list = (S.dms[n.id] = S.dms[n.id] || []);
    const m = { id: U.uid('m'), from: n.id, text, t: S.clock, read: false, kind: 'admin' };
    list.push(m);
    if (list.length > 120) list.shift();
    n.touched = S.clock;
    E.addNotif('dm', `${n.name} sent you a message`, { npcId: n.id });
    return m;
  };

  const RATE_WORDS = { silent: 0, off: 0, quiet: 0.25, calm: 0.6, normal: 1, busy: 1.6 };

  /* ---------- commands ---------- */

  const C = (Admin.commands = {
    as: {
      use: '/as @handle text',
      help: 'post as that character (everyone reacts to it like to any post)',
      run: async (r) => {
        const [h, text] = take(r);
        const n = need(h);
        if (!text) bad('Usage: /as @handle text');
        const out = await E.post(text, '', null, { type: 'text' }, n.id);
        if (!out) bad('That did not post (the world is busy, or the AI failed). Try again.');
        return `Posted as ${n.name}.`;
      },
    },
    reply: {
      use: '/reply p12 @handle text',
      help: 'reply to a post as that character',
      run: async (r) => {
        const [pid, rest] = take(r);
        const [h, text] = take(rest);
        post(pid);
        const n = need(h);
        if (!text) bad('Usage: /reply p12 @handle text');
        if (!(await E.reply(pid, text, n.id))) bad('That did not post. Try again.');
        return `${n.name} replied to ${pid}.`;
      },
    },
    story: {
      use: '/story @handle text',
      help: 'share a 24-hour story as that character',
      run: async (r) => {
        const [h, text] = take(r);
        const n = need(h);
        if (!E.postStory(text, null, n.id)) bad('Usage: /story @handle text');
        return `${n.name} shared a story.`;
      },
    },
    dm: {
      use: '/dm @from @to text   (to = me puts it in your inbox)',
      help: 'a private message from one character to another, or to you',
      run: async (r) => {
        const [a, rest] = take(r);
        const [b, text] = take(rest);
        if (!text) bad('Usage: /dm @from @to text');
        const from = need(a);
        if (/^me$/i.test(b)) return Admin.inject(from, text) ? `${from.name} messaged you.` : bad('Empty message.');
        const to = need(b);
        if (!(await E.altDm(from.id, to.id, text))) bad('That did not send. Try again.');
        return `${from.name} messaged ${to.name}; they answer in that chat (act as ${from.name} on Messages to read it).`;
      },
    },
    like: {
      use: '/like p12 @handle',
      help: 'make that character like a post',
      run: async (r) => {
        const [pid, h] = take(r);
        const p = post(pid);
        const n = need(h);
        if (!(p.likedBy || []).includes(n.id)) E.toggleLike(pid, n.id);
        return `${n.name} liked ${pid}.`;
      },
    },
    follow: {
      use: '/follow @a @b',
      help: 'make @a follow @b',
      run: async (r) => {
        const [a, b] = take(r);
        const x = need(a);
        const y = need(b);
        if (!(x.following || []).includes(y.id)) E.toggleFollow(y.id, x.id);
        return `${x.name} follows ${y.name}.`;
      },
    },
    edit: {
      use: '/edit p12 new text',
      help: 'change the text of any post',
      run: async (r) => {
        const [pid, text] = take(r);
        post(pid);
        if (!E.editPost(pid, text)) bad('Usage: /edit p12 new text');
        return `Edited ${pid}.`;
      },
    },
    delete: {
      use: '/delete p12',
      help: 'delete any post and its replies',
      run: async (r) => {
        post(take(r)[0]);
        E.deletePost(take(r)[0]);
        return `Deleted ${take(r)[0]}.`;
      },
    },
    set: {
      use: '/set @handle aff|rom|riv|trust 0..100',
      help: 'change how a character feels about you',
      run: async (r) => {
        const [h, rest] = take(r);
        const [k, v] = take(rest);
        const n = need(h);
        if (!['aff', 'rom', 'riv', 'trust'].includes(k) || !isFinite(Number(v))) bad('Usage: /set @handle aff|rom|riv|trust 0..100');
        n[k] = clamp(Math.round(Number(v)), k === 'aff' ? -100 : 0, 100);
        if (E.isFamily(n)) n.rom = 0;
        return `${n.name}: ${k} = ${n[k]}.`;
      },
    },
    mood: {
      use: '/mood @handle word',
      help: 'set a character\'s mood',
      run: async (r) => {
        const [h, w] = take(r);
        const n = need(h);
        n.mood = String(w).slice(0, 20);
        return `${n.name} is now ${n.mood || 'neutral'}.`;
      },
    },
    status: {
      use: '/status @handle friend|dating|ex|mother|…',
      help: 'set what they are to you',
      run: async (r) => {
        const [h, s] = take(r);
        const n = need(h);
        const st = s.toLowerCase().replace(/\s+/g, '_');
        if (!E.STATUSES.includes(st)) bad('Statuses: ' + E.STATUSES.join(', '));
        n.status = st;
        if (E.isFamily(n)) n.rom = 0;
        return `${n.name} is now your ${st.replace('_', ' ')}.`;
      },
    },
    know: {
      use: '/know @handle fact',
      help: 'plant something they always know (a fact, a secret, a rumour)',
      run: async (r) => {
        const [h, text] = take(r);
        const n = need(h);
        if (!Admin.addFact(n, text)) bad('Usage: /know @handle fact');
        return `${n.name} now knows: ${text.slice(0, 80)}`;
      },
    },
    note: {
      use: '/note text   (empty clears it)',
      help: "Author's Note: standing instructions every AI call follows",
      run: async (r) => {
        G.S.authorNote = r.trim().slice(0, 1200);
        return r.trim() ? "Author's Note saved." : "Author's Note cleared.";
      },
    },
    lore: {
      use: '/lore keyword, other keyword: fact   (* = always on)',
      help: 'add a World Info (lorebook) entry',
      run: async (r) => {
        const i = r.indexOf(':');
        if (i < 1) bad('Usage: /lore keyword, other keyword: fact');
        const keys = r.slice(0, i).split(',').map((k) => k.trim()).filter(Boolean);
        const content = r.slice(i + 1).trim();
        if (!keys.length || !content) bad('Usage: /lore keyword, other keyword: fact');
        const constant = keys.includes('*');
        (G.S.lore = G.S.lore || []).push({ id: U.uid('lo'), source: 'admin', keys: constant ? [] : keys, content: content.slice(0, 900), constant });
        return `Lore added (${constant ? 'always on' : keys.join(', ')}).`;
      },
    },
    narrate: {
      use: '/narrate text',
      help: 'write something into the story as the narrator (everyone treats it as fact)',
      run: async (r) => {
        if (!r.trim()) bad('Usage: /narrate text');
        E.addChron(r.trim().slice(0, 300));
        E.addNotif('event', '📜 ' + r.trim().slice(0, 120));
        return 'Added to the story.';
      },
    },
    reflect: {
      use: '/reflect @mia',
      help: 'the AI writes what a character has come to realise and what they want next (shown to you first)',
      run: async (r) => {
        const n = need(r.trim().split(/\s+/)[0]);
        const x = await Story.reflect(n);
        return x.rejected ? 'Rejected: nothing changed.' : `Saved ${x.made} reflection/goal item(s) for ${n.name}.`;
      },
    },
    global: {
      use: '/global act more curious   ·   /global list | clear | remove N | off N | on N',
      help: 'standing orders for EVERYONE (every AI call, and the free simulation too)',
      run: async (r) => G.Directives.run(r),
    },
    rules: {
      use: '/rules Always answer briefly   ·   /rules clear   ·   /rules style concise|detailed|narrator|screenwriter|balanced',
      help: 'standing instructions the Director always follows',
      run: async (r) => {
        const S = G.S;
        const cur = (S.directorRules = S.directorRules || { text: '', style: 'balanced' });
        const t = r.trim();
        if (!t) return cur.text || cur.style !== 'balanced' ? `Current rules: ${cur.text || '(none)'}  ·  style: ${cur.style}` : 'No standing instructions yet. Example: /rules Always answer in two short paragraphs';
        if (/^clear$/i.test(t)) { S.directorRules = { text: '', style: 'balanced' }; return 'Standing instructions cleared.'; }
        const m = /^style\s+(\w+)$/i.exec(t);
        if (m) { if (!(m[1].toLowerCase() in Story.STYLES)) bad('Styles: ' + Object.keys(Story.STYLES).join(', ')); cur.style = m[1].toLowerCase(); return 'Style: ' + cur.style; }
        cur.text = t.slice(0, 1500);
        return 'Saved. The Director will follow this from now on.';
      },
    },
    later: {
      use: '/later 2d Kai confesses to Mia   (m / h / d)',
      help: 'schedule a direction for later (free until it is due)',
      run: async (r) => {
        const m = /^(\d+(?:\.\d+)?)\s*(m|mins?|minutes?|h|hrs?|hours?|d|days?)\b\s*([\s\S]+)$/i.exec(r.trim());
        if (!m) bad('Usage: /later 2d Kai confesses to Mia');
        const mins = Number(m[1]) * (/^m/i.test(m[2]) ? 1 : /^h/i.test(m[2]) ? 60 : 1440);
        Story.schedule(mins, m[3]);
        return `Scheduled in ${untilStr(mins)}.`;
      },
    },
    plan: {
      use: '/plan make Mia and Kai reconcile',
      help: 'propose the next story beats (read-only)',
      run: async (r) => (await Story.plan(r)).answer,
    },
    askai: {
      use: '/askai question',
      help: 'ask the world anything (read-only: nothing changes)',
      run: async (r) => (await E.Story.ask(r)).answer,
    },
    plot: {
      use: '/plot Title | what is going on | @a @b',
      help: 'start a storyline that the cast will keep acting out',
      run: async (r) => {
        const [title, summary, who] = r.split('|').map((x) => x.trim());
        if (!title) bad('Usage: /plot Title | what is going on | @a @b');
        const S = G.S;
        const people = String(who || '').split(/\s+/).filter(Boolean).map((h) => need(h));
        S.storylines.push({ id: 's' + S.counters.story++, title: title.slice(0, 80), summary: String(summary || '').slice(0, 260), heat: 45, status: 'active', participants: people.map((n) => n.id), updated: S.clock, log: [] });
        E.addChron(`A new storyline began: ${title.slice(0, 80)}`);
        return `Storyline "${title}" started${people.length ? ' with ' + people.map((n) => n.name).join(', ') : ''}.`;
      },
    },
    new: {
      use: '/new Name | who they are',
      help: 'create a new character (an adult) right now',
      run: async (r) => {
        const [name, desc] = r.split('|').map((x) => x.trim());
        if (!name) bad('Usage: /new Name | who they are');
        const n = E.createCustomNpc({ name, personality: desc || 'unpredictable', bio: (desc || '').slice(0, 90), age: 25, role: 'wildcard' });
        return `${n.name} (${n.handle}, ${n.id}) joined the world.`;
      },
    },
    postrate: {
      use: '/postrate @handle normal|often|rare|never',
      help: 'how often one character posts on their own',
      run: async (r) => {
        const [h, v] = take(r);
        const n = need(h);
        if (!G.World.POST_RATES.some(([k]) => k === v)) bad('Choose: ' + G.World.POST_RATES.map((x) => x[0]).join(', '));
        n.postRate = v;
        return `${n.name} now posts: ${v}.`;
      },
    },
    rate: {
      use: '/rate silent|quiet|calm|normal|busy|0..3',
      help: 'how much the whole cast does on its own',
      run: async (r) => {
        const v = r.trim().toLowerCase();
        const x = v in RATE_WORDS ? RATE_WORDS[v] : Number(v);
        if (!isFinite(x) || v === '') bad('Usage: /rate silent|quiet|calm|normal|busy');
        G.settings.feedRate = clamp(x, 0, 3);
        G.Store.saveSettings();
        return `World activity: ${G.settings.feedRate}.`;
      },
    },
    posts: {
      use: '/posts directed',
      help: 'NPC authored posts only happen when you explicitly direct them in Storyteller',
      run: async (r) => {
        const v = r.trim().toLowerCase();
        if (!['directed', 'off'].includes(v)) bad('NPC authored posts are always directed. Use /posts directed.');
        G.settings.postDial = 0;
        G.Store.saveSettings();
        return 'NPC authored posts only happen when you explicitly direct them in Storyteller.';
      },
    },
    date: {
      use: '/date Day 12, evening   (empty clears it)',
      help: 'what day it is in the story (shown on top and told to the AI)',
      run: async (r) => {
        G.S.storyDate = r.trim().slice(0, 40);
        return G.S.storyDate ? 'Story date: ' + G.S.storyDate : 'Story date cleared.';
      },
    },
    time: {
      use: '/time 30m | 6h | 2d',
      help: 'let time pass',
      run: async (r) => {
        const m = /^(\d+(?:\.\d+)?)\s*(m|h|d)$/i.exec(r.trim());
        if (!m) bad('Usage: /time 30m | 6h | 2d');
        const mins = Math.min(7 * 1440, Math.round(Number(m[1]) * { m: 1, h: 60, d: 1440 }[m[2].toLowerCase()]));
        E.tick(mins);
        return `${mins} minutes passed.`;
      },
    },
    who: {
      use: '/who @handle',
      help: 'everything the game knows about a character',
      run: async (r) => {
        const n = need(take(r)[0]);
        return `${n.name} ${n.handle} (${n.id}) · age ${n.age} · ${n.status} · mood ${n.mood || '—'} · aff ${n.aff} rom ${n.rom} riv ${n.riv} trust ${n.trust} · posts: ${n.postRate || 'normal'} · knows ${(n.facts || []).length} planted fact(s) · ${n.memories.length} memories`;
      },
    },
    help: { use: '/help', help: 'this list', run: async () => Object.values(C).map((c) => c.use + ' — ' + c.help).join('\n') },
  });

  Admin.run = async function (line) {
    const S = G.S;
    if (!S) return '';
    line = String(line || '').trim();
    if (!line) return '';
    if (!S.admin) bad('Turn admin mode on first (🛠 Admin).');
    if (line[0] !== '/') bad('Commands start with /  — try /help');
    const [name, rest] = take(line.slice(1));
    const cmd = C[name.toLowerCase()];
    if (!cmd) bad(`Unknown command /${name}. Try /help`);
    const out = await cmd.run(rest);
    G.Store.save();
    return out;
  };

  /* ---------- the page ---------- */

  const sel = (id, opts, cur) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

  P.admin = function () {
    const S = G.S;
    const on = Admin.on();
    const head = `<div class="card"><h3>🛠 Admin / command center</h3>
      <p class="muted small">Full control over the whole social network: <b>act as any character</b> (post, reply, comment, share stories, like, follow and chat from their account while everyone else reacts), edit anything about them, plant what they know, write lore and an Author's Note, run slash commands. Burner accounts keep working with admin mode off.</p>
      <button class="btn ${on ? 'danger' : 'primary'}" data-act="adminToggle">${on ? 'Turn admin mode off' : '🛠 Turn admin mode on'}</button></div>`;
    if (!on) return head;
    const acting = UI.acting();
    const q = String(UI.adminQ || '').toLowerCase();
    const people = Object.values(S.npcs)
      .filter((n) => !n.blocked && (!q || n.name.toLowerCase().includes(q) || n.handle.includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 40);
    const who = `<div class="card"><h3>🎭 Act as</h3>
      <p class="small">${acting ? `You are acting as <b>${esc(acting.name)}</b> ${esc(acting.handle)}. Home, replies, stories, likes, follows and Messages now all happen as them.` : 'You are acting as <b>yourself</b>. Pick a character to post, reply and chat as them.'}</p>
      ${acting ? '<button class="btn sm" data-act="adminStop">↩ Back to my own account</button>' : ''}
      <input id="adminq" data-bind="adminQ" placeholder="Search characters…" value="${esc(UI.adminQ || '')}" style="margin:8px 0">
      ${people.map((n) => `<div class="prow"><div data-act="profile" data-id="${n.id}">${UI.avatar(n, 40)}</div><div class="grow"><b>${esc(n.name)}</b> ${UI.chip(n.status, n)}<div class="muted small">${esc(n.handle)} · ${n.id}${n.userAlt ? ' · your burner' : ''}</div></div>
        <button class="btn sm ${acting && acting.id === n.id ? 'primary' : ''}" data-act="adminAs" data-id="${n.id}">Act as</button><button class="btn sm" data-act="adminSel" data-id="${n.id}">Edit</button></div>`).join('') || '<div class="empty small">Nobody matches.</div>'}</div>`;
    const log = (UI.adminLog || []).slice(-30);
    const cmd = `<div class="card"><h3>⌨️ Command line</h3>
      <div class="row"><input id="admincmd" placeholder="/as @mia hello everyone   ·   /help" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn primary" data-act="adminRun">Run</button></div>
      <pre class="adminlog small">${esc(log.join('\n')) || 'Type /help for every command.'}</pre>
      <details><summary class="small">All commands</summary><div class="small">${Object.values(C).map((c) => `<div><code>${esc(c.use)}</code> <span class="muted">— ${esc(c.help)}</span></div>`).join('')}</div></details></div>`;
    return head + who + cmd + P.adminChar() + P.adminWorld();
  };

  P.adminChar = function () {
    const S = G.S;
    const n = S.npcs[UI.adminSel];
    if (!n) return '<div class="card"><h3>✏️ Edit a character</h3><p class="muted small">Press <b>Edit</b> next to anyone above.</p></div>';
    return `<div class="card" id="adminchar"><h3>✏️ ${esc(n.name)} <span class="muted small">${esc(n.handle)} · ${n.id}</span></h3>
      <div class="grid2"><div><label>Mood</label><input id="adm_mood" maxlength="20" value="${esc(n.mood || '')}"></div>
        <div><label>What they are to you</label>${sel('adm_status', E.STATUSES.map((s) => [s, s.replace('_', ' ')]), n.status)}</div></div>
      <div class="grid2"><div><label>Affinity −100…100</label><input id="adm_aff" type="number" min="-100" max="100" value="${n.aff}"></div><div><label>Romance 0…100</label><input id="adm_rom" type="number" min="0" max="100" value="${n.rom}"></div>
        <div><label>Rivalry 0…100</label><input id="adm_riv" type="number" min="0" max="100" value="${n.riv}"></div><div><label>Trust 0…100</label><input id="adm_trust" type="number" min="0" max="100" value="${n.trust}"></div></div>
      <label>Posts on their own</label>${sel('adm_postrate', G.World.POST_RATES, n.postRate || 'normal')}
      <label>Scenario <span class="muted small">(the situation they live in, always known to the AI)</span></label><textarea id="adm_scenario" rows="2" maxlength="500">${esc(n.scenario || '')}</textarea>
      <label>How they talk <span class="muted small">(example lines; the AI copies the style)</span></label><textarea id="adm_speech" rows="3" maxlength="600">${esc(n.speech || '')}</textarea>
      <label>Secret</label><input id="adm_secret" maxlength="200" value="${esc(n.secret || '')}">
      <div class="row wrap" style="margin-top:10px"><button class="btn primary" data-act="adminSaveChar" data-id="${n.id}">Save</button><button class="btn" data-act="editChar" data-id="${n.id}">Full editor</button><button class="btn" data-act="profile" data-id="${n.id}">Open profile</button></div>
      <h4 class="sect">What they know <span class="muted small">(planted facts: always in their head)</span></h4>
      ${(n.facts || []).map((f, i) => `<div class="row between small"><span>${esc(f)}</span><button class="btn sm ghost" data-act="adminDelFact" data-id="${n.id}" data-i="${i}">✕</button></div>`).join('') || '<div class="muted small">Nothing planted yet.</div>'}
      <div class="row" style="margin-top:6px"><input id="adm_fact" maxlength="200" placeholder="e.g. knows ${esc(S.player.name)} lied about the cafe"><button class="btn" data-act="adminAddFact" data-id="${n.id}">Plant</button></div>
      <h4 class="sect">Make them message you</h4>
      <div class="row"><input id="adm_inject" maxlength="600" placeholder="what ${esc(G.U.first(n.name))} says…"><button class="btn" data-act="adminInject" data-id="${n.id}">Send to my inbox</button></div></div>`;
  };

  P.adminWorld = function () {
    const S = G.S;
    const lore = S.lore || [];
    return `<div class="card"><h3>🌍 World</h3>
      <div class="grid2"><div><label>Name</label><input id="adm_wname" maxlength="50" value="${esc(S.world.name)}"></div><div><label>Tone</label><input id="adm_wtone" maxlength="80" value="${esc(S.world.tone || '')}"></div></div>
      <label>Setting</label><textarea id="adm_wsetting" rows="3" maxlength="700">${esc(S.world.setting || '')}</textarea>
      <label>Author's Note <span class="muted small">(standing instructions every AI call follows)</span></label>
      <textarea id="adm_note" rows="3" maxlength="1200" placeholder="e.g. Keep everyone in character. Slow-burn romance. Nobody is ever nice about the cafe.">${esc(S.authorNote || '')}</textarea>
      <button class="btn primary" data-act="adminSaveWorld" style="margin-top:8px">Save world</button>
      <h4 class="sect">📚 World Info (lorebook) <span class="muted small">${lore.length} entr${lore.length === 1 ? 'y' : 'ies'}</span></h4>
      <p class="muted small">An entry's text joins the AI's context whenever one of its keywords shows up in the recent feed, chats or story. “Always on” entries are sent every time.</p>
      ${lore.map((l) => `<div class="lorerow ${l.disabled ? 'off' : ''}"><div class="grow small"><b>${l.constant ? '🔒 always on' : esc((l.keys || []).join(', '))}</b><div class="muted">${esc(String(l.content || '').slice(0, 160))}</div></div>
        <button class="btn sm ghost" data-act="adminLoreToggle" data-id="${l.id}">${l.disabled ? 'Enable' : 'Disable'}</button><button class="btn sm ghost" data-act="adminLoreDel" data-id="${l.id}">✕</button></div>`).join('')}
      <div class="grid2" style="margin-top:8px"><div><label>Keywords (comma separated)</label><input id="adm_lkeys" placeholder="cafe, the Moon Bar"></div>
        <div><label class="check" style="margin-top:22px"><input type="checkbox" id="adm_lconst"> Always on</label></div></div>
      <textarea id="adm_lcontent" rows="2" maxlength="900" placeholder="The Moon Bar is where everyone goes after midnight. Its owner, Rae, hates the player."></textarea>
      <button class="btn" data-act="adminLoreAdd" style="margin-top:6px">＋ Add entry</button>
      <h4 class="sect">✨ New character from a description</h4>
      <div class="row"><input id="adm_idea" maxlength="200" placeholder="a bitter ex-pop-star turned gossip podcaster"><button class="btn" data-act="adminGenChar">Create with AI</button></div></div>`;
  };

  /* ---------- actions ---------- */

  const log = (s) => {
    UI.adminLog = (UI.adminLog || []).concat(String(s).split('\n')).slice(-80);
  };
  const val = (id) => ($(id) ? $(id).value : '');

  A.adminToggle = () => {
    Admin.setOn(!Admin.on());
    UI.toast(Admin.on() ? '🛠 Admin mode on: you can act as anyone' : 'Admin mode off', 'info');
    UI.render();
  };
  A.adminAs = (d) => {
    if (!E.altOf(d.id)) return UI.toast('Turn admin mode on first.', 'info');
    G.S.activeAlt = d.id;
    UI.dmWith = null;
    UI.suggestions = null;
    G.Store.save();
    UI.closeModal();
    UI.toast(`Now acting as ${G.S.npcs[d.id].name}`, 'good');
    UI.render();
  };
  A.adminStop = () => {
    G.S.activeAlt = null;
    UI.dmWith = null;
    G.Store.save();
    UI.render();
  };
  A.adminSel = (d) => {
    UI.adminSel = d.id;
    UI.closeModal();
    UI.go('admin');
    setTimeout(() => {
      const el = document.getElementById('adminchar');
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' });
    }, 30);
  };
  A.adminRun = () => {
    const box = $('#admincmd');
    const line = box ? box.value : '';
    if (!line.trim()) return;
    if (box) box.value = '';
    log('> ' + line);
    return Admin.run(line)
      .then((out) => out && log(out))
      .catch((e) => log('⚠ ' + (e.message || e)))
      .finally(() => UI.render());
  };
  A.adminSaveChar = (d) => {
    const n = G.S.npcs[d.id];
    if (!n) return;
    n.mood = val('#adm_mood').slice(0, 20);
    const st = val('#adm_status');
    if (E.STATUSES.includes(st)) n.status = st;
    [['aff', -100], ['rom', 0], ['riv', 0], ['trust', 0]].forEach(([k, lo]) => {
      const v = Number(val('#adm_' + k));
      if (isFinite(v)) n[k] = clamp(Math.round(v), lo, 100);
    });
    if (E.isFamily(n)) n.rom = 0;
    const pr = val('#adm_postrate');
    if (G.World.POST_RATES.some(([k]) => k === pr)) n.postRate = pr;
    n.scenario = val('#adm_scenario').slice(0, 500);
    n.speech = val('#adm_speech').slice(0, 600);
    n.secret = val('#adm_secret').slice(0, 200);
    n.touched = G.S.clock;
    G.Store.save();
    UI.toast(`${n.name} saved`, 'good');
    UI.render();
  };
  A.adminAddFact = (d) => {
    const n = G.S.npcs[d.id];
    if (n && Admin.addFact(n, val('#adm_fact'))) {
      G.Store.save();
      UI.render();
    }
  };
  A.adminDelFact = (d) => {
    const n = G.S.npcs[d.id];
    if (!n || !n.facts) return;
    n.facts.splice(+d.i, 1);
    G.Store.save();
    UI.render();
  };
  A.adminInject = (d) => {
    const n = G.S.npcs[d.id];
    if (!n || !Admin.inject(n, val('#adm_inject'))) return UI.toast('Write what they say first.', 'info');
    G.Store.save();
    UI.toast(`${n.name} messaged you`, 'good');
    UI.render();
  };
  A.adminSaveWorld = () => {
    const S = G.S;
    S.world.name = val('#adm_wname').trim().slice(0, 50) || S.world.name;
    S.world.tone = val('#adm_wtone').trim().slice(0, 80);
    S.world.setting = val('#adm_wsetting').trim().slice(0, 700) || S.world.setting;
    S.authorNote = val('#adm_note').trim().slice(0, 1200);
    G.Store.save();
    UI.toast('World saved', 'good');
    UI.render();
  };
  A.adminLoreAdd = () => {
    const keys = val('#adm_lkeys').split(',').map((k) => k.trim()).filter(Boolean);
    const content = val('#adm_lcontent').trim();
    const constant = !!($('#adm_lconst') && $('#adm_lconst').checked);
    if (!content || (!keys.length && !constant)) return UI.toast('Write the fact and at least one keyword (or tick Always on).', 'info');
    (G.S.lore = G.S.lore || []).push({ id: U.uid('lo'), source: 'admin', keys, content: content.slice(0, 900), constant });
    G.Store.save();
    UI.render();
  };
  A.adminLoreDel = (d) => {
    G.S.lore = (G.S.lore || []).filter((l) => l.id !== d.id);
    G.Store.save();
    UI.render();
  };
  A.adminLoreToggle = (d) => {
    const l = (G.S.lore || []).find((x) => x.id === d.id);
    if (l) l.disabled = !l.disabled;
    G.Store.save();
    UI.render();
  };
  A.adminGenChar = async () => {
    try {
      const d = await E.genNpc(val('#adm_idea').trim());
      const n = E.createCustomNpc({ name: d.name, handle: d.handle, role: d.role, age: d.age, bio: d.bio, personality: d.personality, emoji: d.emoji, followers: d.followers, secret: d.secret });
      UI.adminSel = n.id;
      UI.toast(`${n.name} joined the world`, 'good');
    } catch (e) {
      UI.toast(e.message || 'Could not create them.', 'bad');
    }
    UI.render();
  };

  /* ================= the Storyteller =================
     Say what happens, in plain English ("Matt commented 'who let her cook 😭' on Mia's latest post and it got 6 replies: 3 hype, 2 shade,
     1 confused"). One AI call writes exactly that, every line in its author's own voice. Credits are spent ONLY when you press the button:
     with "only spend credits when I direct" on (default) the background line-writer is paused and the free simulation keeps the world alive. */
  const Story = (E.Story = {});
  const AIm = G.AI;
  const clip = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));
  const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const word = (tok) => new RegExp('(^|[^\\p{L}\\p{N}_@])' + reEsc(tok) + '(?=$|[^\\p{L}\\p{N}_])', 'iu');
  const ORD = { first: 'first', oldest: 'first', earliest: 'first' };

  // who and which posts does the directive talk about? (deterministic: the game resolves names, the AI writes the words)
  Story.resolve = function (text) {
    const S = G.S;
    text = String(text || '');
    const npcs = Object.values(S.npcs).filter((n) => !n.blocked);
    const firstOf = (n) => n.name.toLowerCase().split(/\s+/)[0];
    const hits = [];
    npcs.forEach((n) => {
      const toks = [n.name, n.handle, n.handle.replace(/^@/, '')];
      const fn = firstOf(n);
      if (fn.length >= 3 && npcs.filter((o) => firstOf(o) === fn).length === 1) toks.push(fn); // a first name only counts when it is unambiguous
      let at = -1;
      toks.filter(Boolean).forEach((t) => {
        const m = word(t).exec(text);
        if (m && (at < 0 || m.index < at)) at = m.index;
      });
      if (at >= 0) hits.push({ n, at });
    });
    hits.sort((a, b) => a.at - b.at);
    const chars = hits.map((h) => h.n);
    const posts = [];
    const seen = new Set();
    // by the time they were posted (not the order they happen to be stored in)
    const top = (id) => S.postOrder.map((pid, i) => ({ p: S.posts[pid], i })).filter((x) => x.p && !x.p.replyTo && x.p.author === id).sort((a, b) => (a.p.t - b.p.t) || (a.i - b.i)).map((x) => x.p);
    const add = (label, p) => {
      if (p && !seen.has(p.id)) {
        seen.add(p.id);
        posts.push({ label, post: p });
      }
    };
    (text.match(/\bp\d+\b/gi) || []).forEach((id) => add(id.toLowerCase(), S.posts[id.toLowerCase()]));
    const kinds = '(?:post|photo|pic|picture|video|reel|tweet|selfie)';
    chars.forEach((n) => {
      const names = [n.name, n.handle, n.handle.replace(/^@/, '')].concat(firstOf(n).length >= 3 ? [firstOf(n)] : []);
      names.forEach((nm) => {
        const m = new RegExp('(^|[^\\p{L}\\p{N}_@])' + reEsc(nm) + "(?:'s|’s|s')?\\s+(latest |last |newest |most recent |first |oldest |earliest )?(?:new )?" + kinds + '\\b', 'iu').exec(text);
        if (!m) return;
        const list = top(n.id);
        const which = ORD[(m[2] || '').trim()];
        add(`${n.name}'s ${which ? which + ' ' : 'latest '}post`, which ? list[0] : list[list.length - 1]);
      });
    });
    const mine = /\b(my|me)\s+(latest |last |newest |most recent )?(post|photo|pic|video|reel)\b/i.exec(text);
    if (mine) add('your latest post', top('me').slice(-1)[0]);
    // "Kujo's second last post", "Kujo's post about the studio", and "his latest post" after one person is named
    const ORDN = { second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4 };
    const toks = (x) => new Set(G.Rag ? G.Rag.tokens(x) : String(x).toLowerCase().match(/[a-z]{4,}/g) || []);
    chars.forEach((n) => {
      [n.name, n.handle, n.handle.replace(/^@/, '')].concat(firstOf(n).length >= 3 ? [firstOf(n)] : []).forEach((nm) => {
        const base = '(^|[^\\p{L}\\p{N}_@])' + reEsc(nm) + "(?:'s|’s|s')?\\s+";
        let m = new RegExp(base + '(second|2nd|third|3rd|fourth|4th)[ -](?:last|latest|newest|most recent)\\s+(?:new )?' + kinds + '\\b', 'iu').exec(text);
        if (m) add(`${n.name}'s ${m[2].toLowerCase()} last post`, top(n.id)[top(n.id).length - ORDN[m[2].toLowerCase()]]);
        m = new RegExp(base + kinds + '\\s+(?:about|on|where|saying|with|mentioning|regarding)\\s+([^,.;!?]{3,60})', 'iu').exec(text);
        if (m) {
          const want = toks(m[2]);
          const best = top(n.id).map((p) => [[...toks(p.text)].filter((w) => want.has(w)).length, p]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0] || b[1].t - a[1].t)[0];
          if (best) {
            const gi = posts.findIndex((x) => x.label === `${n.name}'s latest post`);
            if (gi >= 0) { seen.delete(posts[gi].post.id); posts.splice(gi, 1); }
            add(`${n.name}'s post about "${clip(m[2], 30)}"`, best[1]);
          }
        }
      });
    });
    if (chars.length === 1 && !posts.length) {
      const m = /\b(?:his|her|their)\s+(latest |last |newest |most recent |first |oldest |earliest )?(?:new )?(?:post|photo|pic|picture|video|reel|selfie)\b/i.exec(text);
      if (m) { const which = ORD[(m[1] || '').trim()]; const list = top(chars[0].id); add(`${chars[0].name}'s ${which ? which + ' ' : 'latest '}post`, which ? list[0] : list[list.length - 1]); }
    }
    return { chars, posts };
  };

  // The on-screen assistant's "fix the story" powers: edit the record itself (attitudes, relationships, what people know, lore, history, posts)
  Story.applyEdits = function (d) {
    const S = G.S;
    const out = [];
    const cast = (ref) => {
      const n = ref && E.findNpc(ref);
      return n && !n.userAlt && !n.blocked ? n : null;
    };
    const num = (v, lo, hi, cur) => (v === '' || v == null || !isFinite(Number(v)) ? cur : clamp(Math.round(Number(v)), lo, hi));
    const list = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);
    list(d.character_updates, 12).forEach((c) => {
      const n = c && cast(c.who);
      if (!n) return;
      const bits = [];
      [['aff', -100], ['rom', 0], ['riv', 0], ['trust', 0]].forEach(([k, lo]) => {
        if (c[k] === undefined) return;
        const v = num(c[k], lo, 100, n[k]);
        if (v !== n[k]) { bits.push(`${k} ${n[k]}→${v}`); n[k] = v; }
      });
      const st = String(c.status || '').toLowerCase().replace(/\s+/g, '_');
      if (st && E.STATUSES.includes(st) && st !== n.status && !(E.isFamily(n) && !E.FAMILY.includes(st))) { bits.push(`${String(n.status).replace('_', ' ')}→${st.replace('_', ' ')}`); n.status = st; }
      if (c.mood) { n.mood = String(c.mood).slice(0, 20); bits.push('mood ' + n.mood); }
      if (E.isFamily(n)) n.rom = 0;
      list(c.add_facts, 5).forEach((f) => Admin.addFact(n, f) && bits.push('knows: ' + clip(f, 45)));
      list(c.remove_facts, 5).forEach((f) => {
        const k = String(f).toLowerCase().trim();
        if (!k) return;
        const before = (n.facts || []).length + n.memories.length;
        n.facts = (n.facts || []).filter((x) => !x.toLowerCase().includes(k));
        n.memories = n.memories.filter((m) => !String(typeof m === 'string' ? m : m.text || '').toLowerCase().includes(k));
        if ((n.facts.length + n.memories.length) < before) bits.push('forgot: ' + clip(f, 45));
      });
      if (c.attitude && Admin.addFact(n, `Attitude toward ${S.player.name}: ${String(c.attitude).slice(0, 150)}`)) bits.push('attitude: ' + clip(c.attitude, 50));
      if (c.secret !== undefined && c.secret !== null) { n.secret = String(c.secret).slice(0, 200); bits.push('secret changed'); }
      if (bits.length) { n.touched = S.clock; out.push(`${n.name}: ${bits.join(', ')}`); }
    });
    // removals first, so a correction can replace an old fact with a new one that uses the same words
    list(d.lore_remove, 8).forEach((k) => {
      const key = String(k).toLowerCase().trim();
      if (!key) return;
      const before = (S.lore || []).length;
      S.lore = (S.lore || []).filter((l) => !String(l.content || '').toLowerCase().includes(key) && !(l.keys || []).some((x) => String(x).toLowerCase() === key));
      if (S.lore.length < before) out.push('lore removed: ' + k);
    });
    list(d.lore_add, 8).forEach((l) => {
      const content = l && String(l.content || '').trim().slice(0, 900);
      if (!content) return;
      const keys = list(l.keys, 12).map((k) => String(k).trim()).filter(Boolean);
      (S.lore = S.lore || []).push({ id: U.uid('lo'), source: 'assistant', keys, content, constant: !!l.constant || !keys.length });
      out.push('lore added: ' + clip(content, 50));
    });
    const text2 = (o, cur, max) => {
      if (!o || typeof o !== 'object' || !String(o.text || '').trim()) return null;
      return (String(o.mode).toLowerCase() === 'append' && cur ? cur + ' ' : '') + String(o.text).trim().slice(0, max);
    };
    const an = text2(d.author_note, S.authorNote, 1200);
    if (an !== null) { S.authorNote = an.slice(0, 1200); out.push("Author's Note updated"); }
    const sg = text2(d.saga, S.saga, 2000);
    if (sg !== null) { S.saga = sg.slice(0, 2000); out.push('story history updated'); }
    list(d.edit_posts, 10).forEach((e) => { if (e && S.posts[String(e.post)] && E.editPost(String(e.post), e.text)) out.push(`edited post ${e.post}`); });
    list(d.delete_posts, 10).forEach((id) => { if (S.posts[String(id)]) { E.deletePost(String(id)); out.push(`deleted post ${id}`); } });
    list(d.resolve_storylines, 6).forEach((t) => {
      const k = String(t).toLowerCase();
      const s = S.storylines.find((x) => x.status !== 'resolved' && x.title.toLowerCase().includes(k));
      if (s) { s.status = 'resolved'; out.push(`storyline resolved: ${s.title}`); }
    });
    return out;
  };

  // rollback list (the engine keeps the last 12 steps) + manual checkpoints
  Story.history = () => E.undoStack.map((u, i) => ({ i, what: u.what || u.label || 'Change' })).reverse();
  Story.rollback = function (i) {
    const u = E.undoStack[i];
    if (!u) return false;
    if (!confirm(`Roll back to just before "${u.what || u.label}"? Everything after that point is undone.`)) return false;
    return !!E.rollbackTo(i);
  };
  Story.checkpoint = function (name) {
    name = String(name || 'Checkpoint').trim().slice(0, 60) || 'Checkpoint';
    E.pushUndo({ snap: JSON.stringify(G.S), redo: null, label: name, what: '📌 ' + name, t: G.S.clock }); // (size-capped history from engine.js)
    return name;
  };

  // a long story is sent as: its start (the premise) + its latest part + the pieces retrieved for this question (Story.memoryBlock). "Full" sends all of it every time.
  const fullSummary = () => {
    const t = G.S.stSummary && G.S.stSummary.text;
    if (!t) return '';
    const smart = G.settings.directorMemory !== 'full' && t.length > 5000;
    const body = smart ? t.slice(0, 1500) + '\n[… the middle of the story is left out here; the parts that matter for this request are retrieved below …]\n' + t.slice(-2500) : t;
    return 'FULL STORY SUMMARY (the story summary; it is canon and current: use it, do not contradict it)' + (smart ? ' (shortened: start + latest part)' : '') + ':\n' + body;
  };
  Story.RULES = [
    'You are the ghost-writer for the STORYTELLER (the owner of this world). The directive above is canon: make EXACTLY what it describes happen, and nothing else (no extra major events, no unrequested romance, drama or twists).',
    'Every comment, reply, post or message is written by its author in their own voice. Respect the LIVE RETRIEVAL GRAPH and each character\'s knowledge boundary: characters know only their own established facts/memories, what they personally observed in public, what they were told, and rumors shown as heard by them. Other characters\' private facts, DMs, feelings, secrets and unobserved events are unknown. When they only have a rumor or partial clue, make them curious or uncertain; never make an unrelated character confidently comment as if they witnessed the story.',
    'Standalone NPC posts and quotes are allowed ONLY when the owner\'s directive explicitly tells a named character to publish/post/tweet/share/announce something. Otherwise create no top-level posts and no NPC stories. Replies/comments to a specified public post are allowed when directed. Never create a post for the player unless the directive supplies their exact action or words.',
    'Use "posts" for named characters and "crowd" for anonymous accounts. "replyTo" is the id of the post the directive names (use the ids in REFERENCES); a reply to one of your new posts uses that post\'s temp "id".',
    'Counts and tones are exact: "6 replies: 3 hype, 2 shade, 1 confused" = exactly 6 replies split that way. If the directive gives words in quotes, use them verbatim. If it names who replies, use them; otherwise pick fitting named characters first and crowd accounts for the rest.',
    'If it gives numbers of likes / reposts / views, report them in "stats_add": [{"post":"p12","likes":40,"reposts":3,"views":900}] (numbers to ADD to that post). Give "rel" changes only when the directive implies feelings changing. Add one short "chronicle" line.',
    'You are also the owner\'s on-screen assistant for FIXING the story. When the directive is about attitudes, relationships, what someone knows, a correction ("actually Kai never hid the lease"), lore, the Author\'s Note or the history, change the RECORD with these optional keys instead of writing posts: "character_updates":[{"who":"cast name","status":"relationship status word","mood":"","aff":-100..100,"rom":0..100,"riv":0..100,"trust":0..100 (the NEW values; leave out what stays),"add_facts":["something they now know"],"remove_facts":["text of something to forget"],"attitude":"how they feel about the player now, one line"}], "npc_rel":[{"a":"id","b":"id","type":"friend|best_friend|dating|crush|ex|rival|enemy|family|ally|frenemy|situationship","note":""}] for how two characters relate, "lore_add":[{"keys":["word"],"content":"","constant":false}], "lore_remove":["keyword"], "author_note":{"mode":"replace|append","text":""}, "saga":{"mode":"replace|append","text":""}, "edit_posts":[{"post":"p12","text":""}], "delete_posts":["p12"], "resolve_storylines":["title"]. Change only what the directive asks for, and use the CAST numbers above to pick sensible new values.',
  ].join('\n');

  const maxTokensFor = (text) => {
    const nums = (String(text).match(/\b\d{1,3}\b/g) || []).map(Number).filter((x) => x <= 60);
    const big = nums.reduce((a, b) => a + b, 0);
    return clamp(1400 + big * 110, 1800, 6000);
  };

  Story.authorizesNpcPosts = (text) => {
    const s = String(text || '');
    if (/\b(?:don't|do not|never|stop|avoid|without)\b.{0,70}\b(?:post|tweet|publish|share|announce|subtweet)\b/i.test(s)) return false;
    return /\b(?:make|have|tell|ask|direct|let)\b.{0,80}\b(?:post|tweet|publish|share|announce|subtweet)\b/i.test(s) ||
      /\bwrite\s+(?:a|the|this|that)\s+(?:post|tweet)\b/i.test(s) ||
      /\b(?:post|tweet|publish|share|announce|subtweet)\b.{0,60}\b(?:as|from)\s+[\w@]/i.test(s) ||
      /\b(?:post|tweet|publish|share|announce|subtweet)\s+(?:something|this|that|a|an|the|their|his|her)\b/i.test(s) ||
      /\b[A-Z][\p{L}'-]*\s+(?:post(?:s|ed)?|tweet(?:s|ed)?|publish(?:es|ed)?|shar(?:es|ed)|announc(?:es|ed)|subtweet(?:s|ed)?)\b/u.test(s) ||
      /\b[A-Z][\p{L}'-]*\s+(?:should|must|needs to|has to|will)\s+(?:post|tweet|publish|share|announce|subtweet)\b/u.test(s);
  };

  // no AI connected: if the directive quotes the exact words, the free simulation can still post them
  Story.free = async function (text, refs) {
    const q = /["“]([^"”]{2,300})["”]/.exec(text);
    if (!q || !refs.chars.length || !refs.posts.length) bad('Connect an AI model in Settings to use the Storyteller (a free local model works). Without one it can only post words you put in quotes, like: Matt commented "no way" on Mia\'s latest post.');
    if (G.settings.approveActions !== false && typeof Story.approver === 'function') {
      const parent = refs.posts[0].post;
      const pa = parent.author === 'me' ? G.S.player.name : (G.S.npcs[parent.author] || {}).name || 'a post';
      const items = [{ id: 'free:0', group: 'free', idx: 0, deps: [], label: `💬 ${refs.chars[0].name} replies to ${pa}: “${clip(q[1], 140)}”` }];
      const dec = await Story.approver({ text, cost: 0, lines: items.map((i) => i.label), items });
      if (!(Array.isArray(dec) ? dec.length : dec)) return { summary: 'Rejected: nothing changed', cost: 0, changes: [], rejected: true, free: true };
    }
    E.directing = true;
    try {
      const r = await E.reply(refs.posts[0].post.id, q[1], refs.chars[0].id);
      if (!r) bad('That did not post. Try again.');
    } finally {
      E.directing = false;
    }
    return { summary: `${refs.chars[0].name} replied on the free simulation (no AI credits used).`, cost: 0, free: true };
  };

  /* standing instructions: the owner tells the Director once how it should respond, and it follows that in every answer and action */
  Story.STYLES = {
    balanced: '',
    concise: 'Keep every answer short: at most four lines, no preamble.',
    detailed: 'Give thorough, well-organised answers and say why.',
    narrator: 'Answer like a story narrator: vivid, third person, present tense.',
    screenwriter: 'Think like a TV showrunner: talk in beats, tension and payoffs, and suggest cliffhangers.',
  };
  Story.rulesBlock = () => {
    const r = G.S.directorRules || {};
    const parts = [];
    if (r.text && r.text.trim()) parts.push(r.text.trim());
    if (Story.STYLES[r.style]) parts.push(Story.STYLES[r.style]);
    return parts.length ? 'STANDING INSTRUCTIONS FROM THE OWNER (always follow these in every answer and every action):\n' + parts.join('\n') : '';
  };
  // the parts of the story, lore, memories and messages that matter for THIS question (BM25 + importance + recency, see js/rag.js)
  Story.memoryBlock = (q, refs) => (G.Rag ? G.Rag.context(q, { k: 8, focus: refs && refs.chars ? refs.chars.map((n) => n.id).slice(0, 6) : [] }) : '');

  /* talk to a character from the Director bar: they answer in character (their card, mood, memories and what they know), the exchange is kept
     in this world. */
  Story.chat = async function (npcId, text, opts) {
    const S = G.S;
    const n = S.npcs[npcId];
    if (!n) bad('Pick who to talk to first.');
    text = String(text || '').trim().slice(0, 1200);
    if (!text) bad('Say something first.');
    if (!AIm.ready()) bad('Talking to a character needs an AI model (Settings).');
    S.dirChat = S.dirChat || {};
    const log = S.dirChat[npcId] || [];
    const hist = log.slice(-12).map((x) => `${x.r === 'you' ? S.player.name : n.name}: ${x.text}`).join('\n');
    const dms = (S.dms[n.id] || []).slice(-4).map((m) => `${m.from === n.id ? n.name : S.player.name} (message): ${clip(m.text, 120)}`).join('\n');
    const parts = [
      AIm.context({ focus: [n.id], full: true, feedN: 8, scan: text }),
      '',
      dms ? 'RECENT MESSAGES BETWEEN THEM:\n' + dms : '',
      hist ? 'THIS CONVERSATION SO FAR:\n' + hist : '',
      `${S.player.name} says to ${n.name}: """${text}"""`,
      `Reply ONLY as ${n.name}: first person, in character, in their own voice, shaped by how they feel about ${S.player.name} right now (relationship, mood, what they remember). 1-4 sentences; small actions in *asterisks* are fine. Never speak or act for ${S.player.name}. Never mention being an AI.`,
    ];
    const clean = (t) => String(t || '').trim().replace(new RegExp('^' + n.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*', 'i'), '').replace(/^["“]([\s\S]*)["”]$/, '$1').trim();
    let reply = '';
    let cost = 0;
    if (opts && typeof opts.onText === 'function' && AIm.stream) {
      try {
        const r = await AIm.stream({ task: 'scene', user: parts.concat(`Reply with ONLY what ${n.name} says: plain text, no JSON, no quotes around it, no name prefix.`).filter(Boolean).join('\n'), maxTokens: 400, temperature: 0.85 }, (t) => opts.onText(clean(t)));
        reply = clean(r.text);
        cost = r.cost;
      } catch (e) {
        if (e.kind !== 'nostream' && e.kind !== 'network' && e.kind !== 'notready') throw e; // anything else (refused, over the cap, not set up) is a real answer
      }
    }
    if (!reply) {
      const out = await AIm.json({ task: 'scene', user: parts.concat('Return JSON: {"reply":"what they say"}').filter(Boolean).join('\n'), maxTokens: 400, temperature: 0.85 });
      const d = out.data || {};
      reply = String(d.reply || d.text || '').trim();
      cost = Number(out.cost) || 0;
    }
    if (!reply) bad('The AI sent back nothing. Try again.');
    S.dirChat[npcId] = log.concat({ r: 'you', text, t: S.clock }, { r: 'char', text: reply, t: S.clock }).slice(-80);
    try { if (G.Mem) G.Mem.add(n, { kind: 'dm', text: `${S.player.name} told me: "${clip(text, 70)}"`, who: ['me'] }); } catch (e) {}
    n.touched = S.clock;
    G.Store.saveSoon();
    return { reply, cost };
  };

  /* what the AI wants to change, as separate items you can tick or untick one by one (replies are tied to the post they answer) */
  Story.items = function (d) {
    const S = G.S;
    d = d || {};
    const who = (id) => (id === 'me' || id === 'player' ? S.player.name : (S.npcs[id] && S.npcs[id].name) || String(id || '?'));
    const arr = (k) => (Array.isArray(d[k]) ? d[k] : []);
    const out = [];
    const add = (group, idx, label, deps) => out.push({ id: group + ':' + idx, group, idx, label, deps: deps || [] });
    const tmp = {};
    arr('posts').forEach((p, i) => { if (p && p.id != null) tmp[String(p.id)] = i; });
    arr('posts').slice(0, 30).forEach((p, i) => {
      const parent = p.replyTo && S.posts[p.replyTo];
      const dep = p.replyTo != null && tmp[String(p.replyTo)] != null && tmp[String(p.replyTo)] !== i && tmp[String(p.replyTo)] < 30 ? tmp[String(p.replyTo)] : null;
      add('posts', i, `${p.audience === 'close' ? '💚 (close friends only) ' : ''}💬 ${who(p.author)} ${parent ? 'replies to ' + who(parent.author) + ': ' : dep != null ? 'replies: ' : 'posts: '}“${clip(p.text, 140)}”`, dep != null ? ['posts:' + dep] : []);
    });
    if (arr('posts').length > 30) add('posts_rest', 30, `…and ${arr('posts').length - 30} more posts/replies`);
    arr('dms').slice(0, 10).forEach((m, i) => add('dms', i, `✉️ ${who(m.from || m.author)} messages you: “${clip(m.text, 100)}”`));
    if (arr('crowd').length) add('crowd', -1, `👥 ${arr('crowd').length} crowd comments/reactions`);
    arr('character_updates').slice(0, 12).forEach((c, i) => add('character_updates', i, '🧠 ' + (c.who || c.name || '?') + ': ' + Object.keys(c).filter((k) => k !== 'who' && k !== 'name').map((k) => k + ' → ' + clip(c[k], 40)).join(', ')));
    arr('rel').slice(0, 10).forEach((r, i) => add('rel', i, '🔗 relationship change: ' + clip(JSON.stringify(r), 110)));
    arr('npc_rel').slice(0, 10).forEach((r, i) => add('npc_rel', i, '🔗 between characters: ' + clip(JSON.stringify(r), 110)));
    arr('new_npcs').forEach((n, i) => add('new_npcs', i, '➕ new character: ' + clip(n.name, 40)));
    arr('storylines').forEach((x, i) => add('storylines', i, '📖 storyline: ' + clip(x.title || x.summary, 80)));
    arr('resolve_storylines').forEach((x, i) => add('resolve_storylines', i, '📖 a storyline is resolved'));
    arr('lore_add').forEach((l, i) => add('lore_add', i, '📚 lore added: ' + clip(l.text || l.fact || l.content || l, 100)));
    arr('lore_remove').forEach((l, i) => add('lore_remove', i, '📚 lore removed'));
    arr('edit_posts').forEach((p, i) => add('edit_posts', i, '✏️ edits a post'));
    arr('delete_posts').forEach((p, i) => add('delete_posts', i, '🗑 deletes a post'));
    arr('stats_add').forEach((p, i) => add('stats_add', i, "📈 boosts a post's numbers"));
    if (d.saga) add('saga', -1, '📜 rewrites the story-so-far');
    if (d.author_note) add('author_note', -1, '📝 changes the author’s note');
    ['group_msgs', 'donations', 'poll', 'trending', 'chat', 'options', 'participants'].forEach((k) => { if (arr(k).length) add(k, -1, `• ${arr(k).length} ${k.replace('_', ' ')}`); });
    return out.length ? out : [{ id: 'none:-1', group: 'none', idx: -1, label: '(nothing visible would change)', deps: [] }];
  };
  Story.describe = (d) => Story.items(d).map((i) => i.label);
  // /reflect Name: the AI writes what they have come to realise and what they want next (shown to you first)
  Story.reflect = async function (n) {
    const S = G.S;
    if (!AIm.ready()) bad('Reflection needs an AI model (Settings). Characters also reflect on their own, for free, as things happen.');
    if (G.Rag && G.Rag.prepare) await G.Rag.prepare(n.name + ' memories');
    const mem = G.Rag ? G.Rag.recall(n, '', 12) : [];
    const prompt = [
      AIm.context({ focus: [n.id], full: true, feedN: 6 }),
      '',
      Story.rulesBlock(),
      mem.length ? 'THEIR MEMORIES (most important first):\n- ' + mem.join('\n- ') : '',
      `Write what ${n.name} has come to REALISE: 3 short first-person reflections (insights about the people and events in their life, not a summary of what happened) and ONE concrete goal for the next few days.`,
      'Return JSON: {"reflections":["","",""],"goal":""}',
    ].filter(Boolean).join('\n');
    const out = await AIm.json({ task: 'turn', user: prompt, maxTokens: 500, temperature: 0.8 });
    const d = out.data || {};
    const refl = (Array.isArray(d.reflections) ? d.reflections : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 3);
    const goal = String(d.goal || '').trim().slice(0, 120);
    if (!refl.length && !goal) bad('The AI did not write any reflections. Try again.');
    const items = refl.map((t, i) => ({ id: 'rf:' + i, group: 'rf', idx: i, deps: [], label: `🧠 ${n.name} realises: “${clip(t, 140)}”` })).concat(goal ? [{ id: 'goal:0', group: 'goal', idx: 0, deps: [], label: `🎯 ${n.name} wants to: ${goal}` }] : []);
    let picked = items.map((i) => i.id);
    if (G.settings.approveActions !== false && typeof Story.approver === 'function') {
      const dec = await Story.approver({ text: 'Reflect: ' + n.name, cost: Number(out.cost) || 0, lines: items.map((i) => i.label), items });
      picked = Array.isArray(dec) ? dec : dec ? picked : [];
      if (!picked.length) return { rejected: true, cost: Number(out.cost) || 0 };
    }
    refl.forEach((t, i) => { if (picked.includes('rf:' + i)) G.Mem.add(n, { kind: 'reflection', text: t, who: [], imp: 8 }); });
    if (goal && picked.includes('goal:0')) n.goal = { text: goal, kind: 'self', who: [], t: U.dayOf(S.clock) };
    G.Store.saveSoon();
    return { made: picked.length, cost: Number(out.cost) || 0 };
  };
  // the proposal with only the ticked items left in it
  Story.pick = function (d, ids) {
    const sel = new Set(ids);
    const out = Object.assign({}, d);
    ['dms', 'character_updates', 'rel', 'npc_rel', 'new_npcs', 'storylines', 'resolve_storylines', 'lore_add', 'lore_remove', 'edit_posts', 'delete_posts', 'stats_add'].forEach((k) => {
      if (Array.isArray(d[k])) out[k] = d[k].filter((_, i) => sel.has(k + ':' + i));
    });
    if (Array.isArray(d.posts)) out.posts = d.posts.filter((_, i) => (i < 30 ? sel.has('posts:' + i) : sel.has('posts_rest:30')));
    ['crowd', 'group_msgs', 'donations', 'poll', 'trending', 'chat', 'options', 'participants', 'saga', 'author_note'].forEach((k) => {
      if (d[k] !== undefined && !sel.has(k + ':-1')) delete out[k];
    });
    return out;
  };

  Story.run = async function (text) {
    const S = G.S;
    text = String(text || '').trim().slice(0, 1500);
    if (!text) bad('Tell the world what happens first.');
    const refs = Story.resolve(text);
    if (!AIm.ready()) return Story.free(text, refs);
    if (G.Rag && G.Rag.prepare) await G.Rag.prepare(text);
    const focus = refs.chars.map((n) => n.id).slice(0, 6);
    let summary = '';
    let cost = 0;
    let changes = [];
    // step 1: the AI proposes (the world is NOT changed). step 2: you approve (Director bar), then it is applied for free.
    let proposal = null;
    E.directing = true;
    try {
        const refLines = [].concat(refs.chars.map((n) => `- ${n.name} = ${n.id} (${n.handle})`), refs.posts.map((r) => `- ${r.label} = ${r.post.id} by ${AIm.authorLabel(r.post)}: "${clip(r.post.text, 140)}"`));
        const prompt = [
          AIm.context({ focus, full: false, feedN: 12, scan: text, ownerView: true }),
          '',
          fullSummary(),
          Story.rulesBlock(),
          Story.memoryBlock(text, refs),
          refLines.length ? 'REFERENCES (the game resolved the names and posts in the directive; use these ids):\n' + refLines.join('\n') : 'REFERENCES: none resolved; infer from the directive and the feed above.',
          `STORYTELLER DIRECTIVE: """${text}"""`,
          Story.RULES,
          AIm.SCHEMA,
        ].join('\n');
        const out = await AIm.json({ task: 'turn', user: prompt, maxTokens: maxTokensFor(text) });
        cost = Number(out.cost) || 0;
        proposal = out.data || {};
    } finally {
      E.directing = false;
    }
    let approvedItems = false;
    if (G.settings.approveActions !== false && typeof Story.approver === 'function') {
      const items = Story.items(proposal);
      const dec = await Story.approver({ text, cost, lines: items.map((i) => i.label), items });
      const picked = Array.isArray(dec) ? dec : dec ? items.map((i) => i.id) : [];
      if (!picked.length) {
        S.directorLog = (S.directorLog || []).concat({ t: S.clock, text: text.slice(0, 200), cost, summary: 'rejected: nothing changed' }).slice(-40);
        G.Store.save();
        return { summary: 'Rejected: nothing changed', cost, changes: [], rejected: true };
      }
      proposal = Story.pick(proposal, picked);
      approvedItems = true; // you ticked each item yourself: that IS the permission for a character to post
    }
    const actx = { judge: false, allowNpcPosts: approvedItems || Story.authorizesNpcPosts(text) };
    const done = await E.guarded('🎬 Directing…', async () => {
      E.directing = true;
      try {
        E.tick(U.rand(4, 12));
        const d = proposal;
        const posts0 = Object.keys(S.posts).length;
        const dms0 = Object.values(S.dms).reduce((a, l) => a + l.length, 0);
        const chron0 = S.chronicle.length;
        const mind = (n) => [n.aff, n.rom, n.riv, n.trust, n.status, n.mood].join();
        const before = Object.fromEntries(Object.values(S.npcs).map((n) => [n.id, mind(n)]));
        E.apply(d, actx);
        let boosted = 0;
        (Array.isArray(d.stats_add) ? d.stats_add : []).slice(0, 12).forEach((s) => {
          const p = s && S.posts[String(s.post)];
          if (!p || !p.stats) return;
          ['likes', 'reposts', 'views'].forEach((k) => {
            const v = Math.round(Number(s[k]));
            if (isFinite(v) && v > 0) p.stats[k] = (p.stats[k] || 0) + Math.min(v, 5e6);
          });
          boosted++;
        });
        const made = Object.keys(S.posts).length - posts0;
        changes = Story.applyEdits(d);
        S.turns++;
        const dms = Object.values(S.dms).reduce((a, l) => a + l.length, 0) - dms0;
        const moved = Object.values(S.npcs).filter((n) => before[n.id] != null && before[n.id] !== mind(n)).length;
        const events = S.chronicle.length - chron0;
        const dropped = actx.dropped || [];
        summary = [made > 0 ? `${made} new post${made === 1 ? '' : 's'}/repl${made === 1 ? 'y' : 'ies'}` : '', dms > 0 ? `${dms} message${dms === 1 ? '' : 's'}` : '', moved ? `${moved} character${moved === 1 ? '' : 's'} changed how they feel` : '', events > 0 ? `${events} event${events === 1 ? '' : 's'} in the history` : '', boosted ? `${boosted} post(s) got a numbers boost` : '', ...changes].filter(Boolean).join(' · ');
        if (dropped.length) summary = (summary ? summary + ' · ' : '') + `${dropped.length} item${dropped.length === 1 ? ' was' : 's were'} not used: ${dropped.slice(0, 3).join('; ')}`;
        if (!summary) summary = 'The AI proposed nothing that changes the world. Try naming who does what, e.g. "Kai replies to Mia\'s last post: ...".';
      } finally {
        E.directing = false;
      }
      return true;
    }, () => Story.run(text));
    if (!done) bad('The world is busy. Try again in a moment.');
    const topStep = E.undoStack[E.undoStack.length - 1];
    if (topStep) topStep.what = '🎬 ' + clip(text, 60);
    const entry = { t: S.clock, text: text.slice(0, 200), cost, summary };
    S.directorLog = (S.directorLog || []).concat(entry).slice(-40);
    G.Store.save();
    return { summary, cost, changes };
  };

  /* ---------- /askai: ask the world anything (read-only: nothing in the world changes) ---------- */
  const ASK_RE = /^(?:[\/@])?ask[\s_-]?ai\b[\s:,.\-]*([\s\S]*)$|^\/ask\b\s*([\s\S]*)$/i;
  Story.isAsk = (text) => ASK_RE.exec(String(text || '').trim());

  // ONE box for everything: decide whether this is a question (answer only) or a direction (make it happen). Free, instant, no AI call.
  // /askai … and /do … force it either way.
  const QUESTION_START = /^(what|whats|what's|who|whom|whose|why|how|where|when|which|is|are|was|were|am|do|does|did|has|have|had|will|would|should|tell me|explain|summari[sz]e|describe|list|show me|remind me|recap|give me|any|anyone|status|situation|catch me up)\b/i;
  const ACTION_VERB = /^(make|have|let|get|set|change|turn|delete|remove|add|post|comment|reply|send|write|fix|update|rename|forgive|apologi[sz]e|confess|reveal|start|stop|end|kill|marry|break|kiss|fight|cancel|undo|give|take|move|create|spawn|introduce)\b/i;
  // mode 'ask' (the ❓ Ask button) is always a read-only question; mode 'do' (the ▶ Act button) is never one. No mode: guess from the words.
  Story.intent = function (raw, mode) {
    const t = String(raw || '').trim();
    const gl = G.Directives ? G.Directives.parse(t) : null;
    if (gl !== null) return { kind: 'global', text: gl }; // "/global act more curious" (or text ending in /global): standing orders for everyone
    const ask = ASK_RE.exec(t);
    const askText = ask ? String(ask[1] || ask[2] || '').trim() : '';
    if (mode === 'ask') return { kind: 'ask', text: ask ? askText : t };
    if (ask) return { kind: 'ask', text: askText };
    if (mode === 'do') {
      const d = /^\/do\b\s*([\s\S]*)$/i.exec(t);
      const x = d ? d[1].trim() : t;
      const lt = /^(?:\/later\s+|(?:in|after)\s+)(\d+(?:\.\d+)?)\s*(m|mins?|minutes?|h|hrs?|hours?|d|days?)\b\s*[:,\-]?\s*([\s\S]+)$/i.exec(x);
      if (lt && lt[3].trim()) return { kind: 'later', minutes: Number(lt[1]) * (/^m/i.test(lt[2]) ? 1 : /^h/i.test(lt[2]) ? 60 : 1440), text: lt[3].trim() };
      const pl = /^\/plan\b\s*([\s\S]*)$/i.exec(x);
      if (pl) return { kind: 'plan', text: pl[1].trim() };
      return { kind: 'do', text: x };
    }
    const force = /^\/do\b\s*([\s\S]*)$/i.exec(t);
    if (force) return { kind: 'do', text: force[1].trim() };
    const plain = t.replace(/^(?:can|could|would|will)\s+you\s+(?:please\s+)?/i, '').replace(/^please\s+/i, '');
    if (plain !== t && ACTION_VERB.test(plain)) return { kind: 'do', text: plain.replace(/\?+$/, '').trim() }; // "can you make Kai post…?" is a direction
    const later = /^(?:\/later\s+|(?:in|after)\s+)(\d+(?:\.\d+)?)\s*(m|mins?|minutes?|h|hrs?|hours?|d|days?)\b\s*[:,\-]?\s*([\s\S]+)$/i.exec(t);
    if (later && later[3].trim()) return { kind: 'later', minutes: Number(later[1]) * (/^m/i.test(later[2]) ? 1 : /^h/i.test(later[2]) ? 60 : 1440), text: later[3].trim() };
    const plan = /^\/plan\b\s*([\s\S]*)$/i.exec(t);
    if (plan) return { kind: 'plan', text: plan[1].trim() };
    if (/^do\s+(something|it|that|this)\b/i.test(plain)) return { kind: 'do', text: t };
    if (/^give me (a |an |the )?(summary|overview|recap|update|rundown)\b/i.test(plain)) return { kind: 'ask', text: t };
    if (/\?\s*$/.test(t)) return { kind: 'ask', text: t };
    if (QUESTION_START.test(plain) && !ACTION_VERB.test(plain)) return { kind: 'ask', text: t };
    return { kind: 'do', text: t };
  };

  // what Clout itself knows, for the free fallback and as a quick overview
  Story.snapshot = function () {
    const S = G.S;
    const npcs = Object.values(S.npcs).filter((n) => !n.userAlt && !n.blocked);
    const charged = npcs.slice().sort((a, b) => Math.abs(b.aff) + b.rom + b.riv - (Math.abs(a.aff) + a.rom + a.riv)).slice(0, 6);
    const plots = S.storylines.filter((s) => s.status !== 'resolved').slice(-5);
    return [
      `${S.world.name}, ${U.clockStr(S.clock)}.`,
      S.saga && 'The story so far: ' + clip(S.saga, 900),
      plots.length && 'Storylines: ' + plots.map((s) => `${s.title} (${clip(s.summary, 80)})`).join('; '),
      charged.length && `Most charged with ${S.player.name}: ` + charged.map((n) => `${n.name} (${String(n.status).replace('_', ' ')}, aff ${n.aff} rom ${n.rom} riv ${n.riv})`).join('; '),
      S.chronicle.length && 'Recent events: ' + S.chronicle.slice(-6).map((c) => c.text).join(' | '),
    ].filter(Boolean).join('\n');
  };

  Story.ASK_RULES = [
    'You are the omniscient narrator of this world, answering its owner. This is a QUESTION: answer it and change NOTHING (no posts, no messages, no feelings changes).',
    'Answer ONLY from what is established above (cast, relations, memories, saga, history, storylines, the feed, any story notes). If something is not established, say so plainly instead of inventing it.',
    'Be direct and conversational, like someone who knows everything about this world. Short paragraphs. For connections, say who feels what about whom and why. For "what is going on", cover the live storylines, the hottest relationships and what just happened.',
    'FORMAT: start with one direct sentence that answers the question, then 2-5 short bullet points (each starting with "- "). Put **bold** around names. Keep it under about 150 words unless the owner asks for more. No preamble, no repeating the question.',
    'Use the LIVE RETRIEVAL GRAPH to identify the most relevant current connections, unresolved threads, and what each character actually knows. "suggestions": up to 4 grounded next-step ideas the owner could direct, written as paste-ready instructions. These are recommendations only: do not apply them, create posts, schedule them, or change the world while answering. Skip suggestions when the graph gives no useful direction.',
  ].join('\n');

  Story.ask = async function (question) {
    const S = G.S;
    question = String(question || '').trim().slice(0, 1000);
    if (!question) bad('Ask something, for example: /askai what is going on between Mia and Kai?');
    let answer = '';
    let sug = [];
    let cost = 0;
    let free = false;
    if (!AIm.ready()) {
      answer = 'No AI is connected, so this is a snapshot from what Clout knows (connect a model in Settings for real answers):\n' + Story.snapshot();
      free = true;
    } else {
      const refs = Story.resolve(question);
      if (G.Rag && G.Rag.prepare) await G.Rag.prepare(question);
      const hist = (S.askLog || []).slice(-4).map((x) => `Q: ${x.q}\nA: ${clip(x.a, 400)}`).join('\n');
      const prompt = [
        AIm.context({ focus: refs.chars.map((n) => n.id).slice(0, 6), full: true, feedN: 14, scan: question, ownerView: true }),
        '',
        fullSummary(),
        Story.rulesBlock(),
        Story.memoryBlock(question, refs),
        Story.snapshot() ? 'OVERVIEW:\n' + Story.snapshot() : '',
        hist ? 'EARLIER IN THIS CONVERSATION:\n' + hist : '',
        `THE OWNER ASKS: """${question}"""`,
        Story.ASK_RULES,
        'Return JSON: {"answer":"your answer","suggestions":["optional directive ideas"]}',
      ].filter(Boolean).join('\n');
      const out = await AIm.json({ task: 'turn', user: prompt, maxTokens: 1500, temperature: 0.5 });
      cost = Number(out.cost) || 0;
      const d = out.data || {};
      answer = String(d.answer || d.text || '').trim();
      if (!answer) bad('The AI sent back an empty answer. Try asking again (or pick another model).');
      sug = (Array.isArray(d.suggestions) ? d.suggestions : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 4);
    }
    S.askLog = (S.askLog || []).concat({ q: question, a: answer.slice(0, 4000), sug, t: S.clock, cost, free }).slice(-30);
    G.Store.saveSoon();
    return { answer, sug, cost, free };
  };

  /* ---------- scheduled directions ("in 2 days: Kai confesses"): free until they are due, then they ask you ---------- */
  Story.schedule = function (minutes, text) {
    const S = G.S;
    text = String(text || '').trim().slice(0, 600);
    minutes = Math.max(1, Math.min(60 * 24 * 365, Math.round(Number(minutes) || 0)));
    if (!text) bad('Say what should happen, for example: in 2 days: Kai confesses to Mia');
    S.later = (S.later || []).concat({ id: U.uid('lt'), at: S.clock + minutes, text, notified: false }).slice(-30);
    G.Store.saveSoon();
    return S.later[S.later.length - 1];
  };
  Story.due = () => ((G.S && G.S.later) || []).filter((x) => x.at <= G.S.clock);
  Story.checkDue = function () {
    const S = G.S;
    if (!S || !S.later) return 0;
    let n = 0;
    S.later.forEach((x) => {
      if (x.at <= S.clock && !x.notified) {
        x.notified = true;
        n++;
        E.addNotif('event', '📅 Due now: ' + clip(x.text, 90), { act: 'dockOpen' });
      }
    });
    if (n) { G.Store.saveSoon(); try { if (Dock && Dock.draw) Dock.draw(); } catch (e) {} }
    return n;
  };
  Story.dropLater = (id) => { G.S.later = (G.S.later || []).filter((x) => x.id !== id); G.Store.saveSoon(); };
  { const tick0 = E.tick; E.tick = function () { const r = tick0.apply(this, arguments); try { Story.checkDue(); } catch (e) {} return r; }; }
  const untilStr = (min) => (min < 90 ? Math.max(1, Math.round(min)) + ' min' : min < 2880 ? Math.round(min / 60) + ' h' : Math.round(min / 1440) + ' days');

  /* ---------- /plan: the next beats of the story (read-only: it only proposes) ---------- */
  Story.plan = async function (goal) {
    const S = G.S;
    goal = String(goal || '').trim().slice(0, 600);
    if (!AIm.ready()) bad('Planning needs an AI model (Settings). Everything else in the Director works without one.');
    const refs = Story.resolve(goal);
    if (G.Rag && G.Rag.prepare) await G.Rag.prepare(goal);
    const hist = (S.askLog || []).slice(-3).map((x) => `Q: ${x.q}\nA: ${clip(x.a, 300)}`).join('\n');
    const prompt = [
      AIm.context({ focus: refs.chars.map((n) => n.id).slice(0, 6), full: true, feedN: 12, scan: goal, ownerView: true }),
      '',
      S.stSummary && S.stSummary.text ? 'FULL STORY SUMMARY (canon and current):\n' + S.stSummary.text : '',
      Story.rulesBlock(),
      Story.memoryBlock(goal, refs),
      Story.snapshot() ? 'OVERVIEW:\n' + Story.snapshot() : '',
      hist ? 'EARLIER IN THIS CONVERSATION:\n' + hist : '',
      goal ? `THE OWNER WANTS TO PLAN: """${goal}"""` : 'THE OWNER ASKS: what should happen next in the story?',
      'You are the story planner. Propose 3-6 BEATS (next steps) that follow from the established story and the goal, in a sensible order. Each beat has a short title and a "direction": a concrete instruction the owner can paste to make it happen on the feed or in the record, for example "Kai posted a bitter subtweet about Mia\'s song" or "Mia and Kai made up in the comments, 5 replies, tone: relieved". Do NOT execute anything and do not contradict the established story.',
      'Return JSON: {"summary":"one sentence on where this is heading","beats":[{"title":"","direction":""}]}',
    ].filter(Boolean).join('\n');
    const out = await AIm.json({ task: 'turn', user: prompt, maxTokens: 1400, temperature: 0.7 });
    const d = out.data || {};
    const beats = (Array.isArray(d.beats) ? d.beats : []).filter((b) => b && String(b.direction || '').trim()).slice(0, 6);
    if (!beats.length) bad('The AI did not come up with a plan. Try again or describe the goal.');
    const answer = [String(d.summary || 'Here is a way it could go:'), ...beats.map((b, i) => `- **${i + 1}. ${String(b.title || 'Beat').slice(0, 60)}**`)].join('\n');
    const sug = beats.map((b) => String(b.direction).trim().slice(0, 300));
    S.askLog = (S.askLog || []).concat({ q: 'Plan: ' + (goal || 'what next'), a: answer, sug, t: S.clock, cost: Number(out.cost) || 0 }).slice(-30);
    G.Store.saveSoon();
    return { answer, sug, cost: Number(out.cost) || 0 };
  };

  /* ---------- the timeline: what happened and what you directed, newest first ---------- */
  Story.timeline = function () {
    const S = G.S;
    const ev = (S.chronicle || []).map((c) => ({ t: c.t, text: c.text, icon: '📖' }));
    const dir = (S.directorLog || []).map((l) => ({ t: l.t, text: `${l.text}${l.summary ? ' (' + l.summary + ')' : ''}`, icon: '🎬' }));
    return ev.concat(dir).filter((x) => x.text).sort((a, b) => b.t - a.t).slice(0, 30);
  };

  const money = (v) => (v > 0 && v < 0.01 ? '<$0.01' : '$' + (Number(v) || 0).toFixed(2));
  const EXAMPLES = [
    ['Comment + replies', 'Matt commented "who let her cook 😭" on Mia\'s latest post and it got 6 replies: 3 hype, 2 shade, 1 confused'],
    ['Feud', 'Kai posted a savage subtweet about Mia\'s new song. Mia\'s fans (about 8 replies) are furious; one named character defends Kai.'],
    ['DM', 'Mia sent me a late-night DM, nervous, asking if I saw what Kai posted.'],
    ['Goes viral', "Mia's latest post went viral: add 5000 likes, 400 reposts and 80000 views, with 5 excited replies."],
    ['Twist', 'It is revealed that Rae has been secretly running the gossip account. Three people react in the comments.'],
  ];

  P.storyteller = function () {
    const S = G.S;
    const s = G.settings;
    const log = (S.directorLog || []).slice().reverse().slice(0, 12);
    const spent = AIm.spent ? AIm.spent() : 0;
    const intel = G.World && G.World.intel ? G.World.intel(S) : { cast: [], rumors: [] };
    const castIntel = intel.cast.map((n) => {
      const m = n.mind;
      const thoughts = (n.thoughts || []).slice(0, 4).map((x) => `<div class="small">${esc(x.action)}: ${esc(x.summary)} <span class="muted">${esc(x.reason)}</span></div>`).join('');
      const recent = (n.knowledge || []).slice(0, 5).map((x) => `<div class="small muted">${x.channel === 'hearsay' ? 'Heard' : x.channel === 'private' ? 'Private' : x.channel === 'notification' ? 'Notified' : x.kind === 'known_event' ? 'Directly involved' : 'Saw'} · ${esc(clip(x.text || x.kind, 110))}${x.channel === 'hearsay' ? ` (${Math.round((x.confidence || 0) * 100)}% confidence)` : ''}</div>`).join('');
      const draft = n.draft && n.draft.expires > S.clock ? `<div class="small" style="margin-top:5px"><b>Private draft (not published):</b> ${esc(clip(n.draft.text, 180))} <button class="btn sm" data-act="stUseDraft" data-id="${esc(n.id)}">Use in Director</button></div>` : '';
      return `<details style="margin:6px 0"><summary><b>${esc(n.name)}</b> <span class="muted small">${esc(m ? `${m.action}: ${clip(m.summary, 100)}` : 'no recent intention')}</span></summary><div class="small" style="padding:6px 0">${thoughts || '<div class="muted">No recent intention recorded.</div>'}${draft}<div style="margin-top:5px">${recent || '<div class="muted">No recent post exposure recorded.</div>'}</div></div></details>`;
    }).join('');
    const rumorIntel = intel.rumors.slice(0, 8).map((r) => {
      const holders = r.holders.map((h) => `${h.name} ${Math.round(h.confidence * 100)}%`).join(', ') || 'No current holders';
      const path = r.path.slice(-8).map((e) => `${(S.npcs[e.from] || {}).name || (e.from === 'me' ? S.player.name : e.from || 'event')} → ${(S.npcs[e.to] || {}).name || e.to}`).join(' → ');
      const talks = (r.discussions || []).slice(-3).map((d) => `<div class="small">${esc((S.npcs[d.from] || {}).name || d.from)} → ${esc((S.npcs[d.to] || {}).name || d.to)} · ${esc(d.channel)}<br><span class="muted">${esc(clip(d.words, 220))}</span></div>`).join('');
      const pending = (r.pendingTalks || []).map((d) => `${(S.npcs[d.from] || {}).name || d.from} plans to talk privately with ${(S.npcs[d.to] || {}).name || d.to}`).join(' · ');
      return `<details style="margin:7px 0"><summary><b>${esc(clip(r.text, 170))}</b> <span class="muted">${r.truth ? 'Event-based' : 'Unverified'}</span></summary><div class="small" style="padding:5px 0"><div class="muted">${esc(holders)}${path ? `<br>Path: ${esc(path)}` : ''}</div>${pending ? `<div class="small">Pending: ${esc(pending)}</div>` : ''}${talks ? `<div style="margin-top:5px"><b>Private discussion record</b>${talks}</div>` : '<div class="muted" style="margin-top:5px">Nobody has discussed this beyond the people directly involved.</div>'}</div></details>`;
    }).join('');
    const pins = (S.dirPins || []).slice();
    const pastRows = log.map((l) => `<div class="d4-hrow"><div class="d4-ht">${esc(clip(l.text, 200))}</div><div class="d4-hm">${esc(U.clockStr(l.t))} · ${esc(l.summary || '')} · ${money(l.cost)}</div><div class="d4-hact"><button class="linklike" data-act="stRerun" data-s="${esc(l.text)}">Run again</button><button class="linklike" data-act="stCopy" data-s="${esc(l.text)}">Copy</button><button class="linklike" data-act="stPin" data-s="${esc(l.text)}">${pins.includes(l.text) ? 'Unpin' : 'Pin'}</button></div></div>`).join('');
    const pinRows = pins.map((p) => `<div class="d4-prow"><span>${esc(clip(p, 160))}</span><button class="linklike" data-act="stRerun" data-s="${esc(p)}">Use</button><button class="linklike" data-act="stPin" data-s="${esc(p)}">Unpin</button></div>`).join('');
    return `<div class="d4page">
      <section class="d4-top"><h3>Director</h3>
      <p class="muted small">Direct the whole world in plain English: who did what, on whose post, how many replies, in what tone. You see what it wants to do and tick what you accept before anything changes. <b>Credits are spent only when you press the button.</b></p>
      <textarea id="st_text" rows="4" maxlength="1500" placeholder="Matt commented &quot;who let her cook 😭&quot; on Mia's latest post and it got 6 replies: 3 hype, 2 shade, 1 confused   ·   or ask: /askai what is going on between Mia and Kai?"></textarea>
      <div class="d4-rail wrap">${Dock.dirs().map(([l, t]) => `<button class="d4-chip" data-act="stDir" data-s="${esc(t)}">${esc(l)}</button>`).join('')}</div>
      <details class="d4-more"><summary>Examples</summary><div class="row wrap" style="margin:6px 0">${EXAMPLES.map(([l, t], i) => `<button class="pill" data-act="stExample" data-i="${i}">${l}</button>`).join('')}</div></details>
      <div class="grid2"><div><label>Replies / reactions <span class="muted small">(optional)</span></label><input id="st_n" type="number" min="0" max="40" placeholder="e.g. 6"></div><div><label>Tone <span class="muted small">(optional)</span></label><input id="st_tone" maxlength="80" placeholder="hype, shady, unhinged…"></div></div>
      <div class="d4-actions"><button class="btn primary" data-act="stDirect">Make it happen</button><button class="btn" data-act="stUndo" ${E.undoStack.length ? '' : 'disabled'}>Undo last</button></div>
      <p class="small muted" style="margin-top:8px">This session: <b>${money(spent)}</b>${s.spendCap > 0 ? ' of your ' + money(s.spendCap) + ' cap' : ''}${log[0] ? ` · last direction ${money(log[0].cost)}` : ''}</p></section>
      <section><h4 class="sect">Safety and cost</h4>
      <label class="check"><input type="checkbox" data-setting="approveActions" ${s.approveActions !== false ? 'checked' : ''}> <span>Ask me to approve every action first <span class="muted small">(the Director shows what it wants to do; nothing changes until you press Approve)</span></span></label>
      <label class="check"><input type="checkbox" data-setting="directorOnly" ${s.directorOnly !== false ? 'checked' : ''}> <span>Only spend credits when I direct <span class="muted small">(pauses the background line-writer; the free simulation still moves the world, and the Sync and Skip-time buttons still work when you press them)</span></span></label></section>
      ${pinRows ? `<section><h4 class="sect">Pinned directions</h4>${pinRows}</section>` : ''}
      <section><h4 class="sect">Directed so far</h4>${pastRows || '<div class="empty small">Nothing yet. Pick a direction above, or try one of the examples.</div>'}</section>
      ${(S.later || []).length ? `<section><h4 class="sect">Scheduled</h4>${S.later.map((x) => `<div class="row between small" style="margin:5px 0"><span>${x.at <= S.clock ? '<b>due now</b>' : 'in ' + untilStr(x.at - S.clock)} · ${esc(x.text)}</span><span><button class="btn sm" data-act="stLaterRun" data-id="${x.id}">Do it now</button><button class="btn sm" data-act="stLaterDrop" data-id="${x.id}">Drop</button></span></div>`).join('')}</section>` : ''}
      ${(S.askLog || []).length ? `<section><h4 class="sect">Questions and answers</h4>${(S.askLog || []).slice().reverse().slice(0, 8).map((x) => `<div class="stq">${esc(x.q)}</div><div class="sta small">${esc(x.a).replace(/\n/g, '<br>')}</div>`).join('')}</section>` : ''}
      <section><h4 class="sect">Rollback <span class="muted small">· back to just before any step</span></h4>
        ${Story.history().slice(0, 12).map((x) => `<div class="row between small" style="margin:4px 0"><span>${esc(clip(d4plain(x.what).trim(), 90))}</span><button class="btn sm" data-act="stRollback" data-i="${x.i}">Roll back</button></div>`).join('') || '<div class="empty small">Nothing to roll back yet. Every direction, sync and fix is saved here (the last 12), and Clout also backs your world up every 5 minutes.</div>'}
        <button class="btn sm" data-act="stCheckpoint">Save a checkpoint now</button></section>
      <section><h4 class="sect">Timeline</h4>${Story.timeline().slice(0, 14).map((x) => `<div class="small" style="margin:4px 0"><span class="muted">${U.clockStr(x.t)}</span> ${esc(clip(x.text, 160))}</div>`).join('') || '<div class="empty small">Nothing yet.</div>'}</section>
      <details class="d4adv"><summary>Advanced <span class="muted small">· standing rules, global behaviour, story memory, cast awareness, rumours, charts</span></summary>
      <section><h4 class="sect">Global behaviour <span class="muted small">· applies to everyone, everywhere, until you remove it</span></h4>
        ${(G.Directives ? G.Directives.all() : []).map((r, i) => `<div class="row between small" style="margin:4px 0"><span>${r.on === false ? '<s>' : ''}${esc(r.text)}${r.on === false ? '</s>' : ''}</span><span><button class="btn sm" data-act="gdToggle" data-id="${r.id}">${r.on === false ? 'On' : 'Off'}</button><button class="btn sm" data-act="gdRemove" data-id="${i + 1}" aria-label="Remove">Remove</button></span></div>`).join('') || '<div class="empty small">Nothing yet. Tell everyone how to behave, for example “act more curious”.</div>'}
        <div class="row wrap" style="margin:6px 0">${(G.Directives ? G.Directives.PRESETS : []).map(([l], i) => `<button class="pill" data-act="gdPreset" data-i="${i}">${l}</button>`).join('')}</div>
        <div class="row" style="gap:8px"><input id="gd_text" maxlength="400" placeholder="act more curious · be warmer to each other · …" style="flex:1"><button class="btn primary sm" data-act="gdAdd">Add</button></div>
        <div class="small muted">Also works as <b>/global …</b> in the Director. Every AI call carries it, and the free simulation is nudged by the same words.</div></section>
      <section><h4 class="sect">Standing rules <span class="muted small">· how the Director should always behave (also /rules)</span></h4>
        <textarea id="st_rules" rows="4" maxlength="1500" placeholder="e.g. Always answer in two short paragraphs. Never make Mia forgive Kai without a fight first. Treat my story notes as canon. Keep replies in British English.">${esc((S.directorRules || {}).text || '')}</textarea>
        <div class="row wrap" style="margin-top:6px"><select id="st_style">${[['balanced', 'Balanced'], ['concise', 'Short and direct'], ['detailed', 'Detailed with reasons'], ['narrator', 'Story narrator'], ['screenwriter', 'Showrunner (beats and cliffhangers)']].map(([v, l]) => `<option value="${v}" ${((S.directorRules || {}).style || 'balanced') === v ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn primary sm" data-act="stRulesSave">Save</button></div></section>
      <section><h4 class="sect">Story memory</h4>
        <div class="row wrap"><span class="small">In each Director call</span><select data-setting="directorMemory"><option value="smart" ${s.directorMemory !== 'full' ? 'selected' : ''}>Smart: start + latest + what is relevant (cheaper)</option><option value="full" ${s.directorMemory === 'full' ? 'selected' : ''}>Everything, every time</option></select></div>
        <div class="row wrap" style="margin-top:6px"><span class="small">Embedding model (optional)</span><input data-setting="embedModel" value="${esc(s.embedModel || '')}" placeholder="openai/text-embedding-3-small" style="flex:1;min-width:180px"></div>
        <div class="small muted">Used for every answer, plan and action. Retrieval always works for free (keywords + local vectors). An embedding model adds real meaning-matching ("car" finds "automobile") for a fraction of a cent per question. Leave empty to stay free.</div></section>
      <section><h4 class="sect">Cast awareness and intentions <span class="muted small">· private Director view</span></h4><p class="small muted">See what each person has actually seen or heard, why they acted, and any post they considered but kept private. Hearsay stays marked as uncertain.</p>${castIntel || '<div class="empty small">No cast awareness recorded yet.</div>'}</section>
      <section><h4 class="sect">Rumours and private discussion trail</h4><p class="small muted">A rumour needs a character's private decision and conversation before it reaches anyone new. This Director record shows the internal exchange and any planned conversation.</p>${rumorIntel || '<div class="empty small">No active rumours yet. Relationships and events can create them as the world advances.</div>'}</section>
      ${G.Charts ? G.Charts.worldCard() : ''}
      ${G.Charts ? G.Charts.healthCard() : ''}
      </details></div>`;
  };

  A.stExample = (d) => {
    const box = $('#st_text');
    if (box) box.value = EXAMPLES[+d.i][1].replace(/Matt|Mia|Kai|Rae/g, (nm) => nm); // names are examples: change them to your own characters
    if (box) box.focus();
  };
  // page: fill the box with a direction, copy a past one, pin or unpin it
  A.stDir = (d) => { const box = $('#st_text'); if (box) { box.value = d.s || ''; box.focus(); } };
  A.stRerun = (d) => { const box = $('#st_text'); if (box) { box.value = d.s || ''; box.focus(); try { box.scrollIntoView({ block: 'center' }); } catch (e) {} } };
  A.stCopy = (d) => { try { navigator.clipboard.writeText(d.s || ''); UI.toast('Copied', 'good'); } catch (e) { UI.toast('Could not copy here. Long-press the text instead.', 'info'); } };
  A.stPin = (d) => { Dock.pin(d.s); UI.render(); };
  A.stUseDraft = (d) => {
    const n = G.S.npcs[d.id];
    const box = $('#st_text');
    if (!n || !n.mindDraft || n.mindDraft.expires <= G.S.clock || !box) return UI.toast('That private draft has expired.', 'info');
    box.value = `Have ${n.name} post exactly: "${n.mindDraft.text}"`;
    box.focus();
    UI.toast('Draft added to the Director. Review it, then direct it when ready.', 'good');
  };
  A.stDirect = async () => {
    const box = $('#st_text');
    let text = box ? box.value.trim() : '';
    if (!text) return UI.toast('Tell the world what happens first.', 'info');
    const n = Number(val('#st_n'));
    const tone = val('#st_tone').trim();
    if (n > 0 && !/\b\d+\s+(repl|comment|react)/i.test(text)) text += ` (about ${Math.round(n)} replies)`;
    if (tone && !/tone/i.test(text)) text += ` (tone: ${tone})`;
    const intent = Story.intent(text);
    if (intent.kind === 'later') {
      try {
        Story.schedule(intent.minutes, intent.text);
        UI.toast(`Scheduled for ${untilStr(intent.minutes)} from now`, 'good');
        if (box) box.value = '';
      } catch (e) {
        UI.toast(e.message, 'bad');
      }
      return UI.render();
    }
    if (intent.kind === 'plan') {
      try {
        const r = await Story.plan(intent.text);
        UI.toast('Plan ready (see the Director)', 'good');
        thread({ role: 'you', kind: 'plan', text: '/plan ' + intent.text });
        thread({ role: 'ai', kind: 'ask', answer: r.answer, sug: r.sug, cost: r.cost });
        if (box) box.value = '';
      } catch (e) {
        UI.toast(e.message, 'bad');
      }
      return UI.render();
    }
    if (intent.kind === 'ask') {
      try {
        const r = await Story.ask(intent.text);
        UI.toast(r.free ? 'Free snapshot (no AI connected)' : 'Answered. Nothing changed' + (r.cost ? ' · ' + money(r.cost) : ''), 'good');
        if (box) box.value = '';
      } catch (e) {
        UI.toast(e.message || 'That did not work.', 'bad');
      }
      return UI.render();
    }
    try {
      const r = await Story.run(intent.text);
      UI.toast(`${r.summary}${r.cost ? ' · ' + money(r.cost) : ''}`, 'good');
      if (box) box.value = '';
    } catch (e) {
      UI.toast(e.message || 'That did not work.', 'bad');
    }
    UI.render();
  };
  A.stRollback = (d) => {
    if (Story.rollback(+d.i)) UI.render();
  };
  A.stCheckpoint = () => {
    const nm = Story.checkpoint(prompt('Name this checkpoint', 'Before the big fight') || '');
    UI.toast('Saved: ' + nm, 'good');
    UI.render();
  };
  A.stLaterRun = (d) => {
    const it = (G.S.later || []).find((x) => x.id === d.id);
    if (!it) return;
    Story.dropLater(it.id);
    const box = $('#st_text');
    if (box) box.value = it.text;
    return A.stDirect();
  };
  A.stLaterDrop = (d) => {
    Story.dropLater(d.id);
    UI.render();
  };
  A.dockOpen = () => {
    UI.closeModal && UI.closeModal();
    Dock.setOpen(true);
  };
  A.trendAsk = (d) => {
    putInBox(`what is going on with ${d.tag}, who is driving it, and where is it heading?`, true);
    Dock.send('ask');
  };
  A.trendBoost = (d) => {
    putInBox(`Make ${d.tag} blow up: several characters posting and replying about it, mixed reactions, the first post by whoever is most involved`, true);
    UI.toast('Change it if you like, then press Act', 'info');
  };
  A.talkTo = (d) => {
    const n = G.S.npcs[d.id];
    if (!n) return;
    UI.closeModal();
    Dock.chatWith = n.id;
    Dock.msg = `Talking to ${n.name}. They answer in character.`;
    Dock.bad = false;
    Dock.setOpen(true);
    Dock.draw();
  };
  A.gdAdd = () => {
    const t = $('#gd_text');
    try {
      UI.toast(G.Directives.run(t ? t.value : ''), 'good');
    } catch (e) {
      UI.toast(e.message, 'bad');
    }
    UI.render();
  };
  A.gdPreset = (d) => {
    const p = G.Directives.PRESETS[Number(d.i)];
    if (p) UI.toast(G.Directives.run(p[1]), 'good');
    UI.render();
  };
  A.gdRemove = (d) => {
    try { G.Directives.remove(d.id); } catch (e) { UI.toast(e.message, 'bad'); }
    UI.render();
  };
  A.gdToggle = (d) => {
    try { G.Directives.toggle(d.id); } catch (e) { UI.toast(e.message, 'bad'); }
    UI.render();
  };
  A.stRulesSave = () => {
    const t = $('#st_rules');
    const st = $('#st_style');
    G.S.directorRules = { text: t ? t.value.trim().slice(0, 1500) : '', style: st ? st.value : 'balanced' };
    G.Store.saveSoon();
    UI.toast('Saved: the Director will follow this from now on', 'good');
  };
  A.stUndo = () => {
    E.undo();
    UI.render();
  };

  // credit saver: with "only spend credits when I direct" the background line-writer (and the automatic summaries) stay quiet
  const quiet = () => G.settings.directorOnly !== false;
  if (G.Bank && G.Bank.tick) {
    const tick = G.Bank.tick;
    G.Bank.tick = function () {
      if (quiet()) return;
      return tick.apply(this, arguments);
    };
  }
  if (G.Memory && G.Memory.maybe) {
    const maybe = G.Memory.maybe;
    G.Memory.maybe = function () {
      if (quiet()) return;
      return maybe.apply(this, arguments);
    };
  }

  /* ---------- the Director bar: always on screen, on every page ----------
     One box, one smart button. A chat thread (your words, the Director's answers, a ✓ list of what changed), quick starters,
     undo / checkpoint / history. */
  const Dock = (Story.dock = { open: false, busy: false, msg: '', bad: false, text: '', hist: false, menu: false });
  try { Dock.open = localStorage.getItem('clout_stdock') === '1'; } catch (e) {}

  // tiny markdown for the Director's answers: **bold**, "- " bullets, paragraphs (everything is escaped first)
  const md = (s) => {
    const lines = esc(String(s || '')).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').split('\n');
    let out = '';
    let list = false;
    lines.forEach((l) => {
      const m = /^\s*(?:[-•*]|\d+[.)])\s+(.*)$/.exec(l);
      if (m) { if (!list) { out += '<ul>'; list = true; } out += '<li>' + m[1] + '</li>'; }
      else { if (list) { out += '</ul>'; list = false; } if (l.trim()) out += '<p>' + l + '</p>'; }
    });
    return out + (list ? '</ul>' : '');
  };
  Dock.pending = {};
  const thread = (e) => {
    const S = G.S;
    if (!S) return;
    S.stThread = (S.stThread || []).concat(Object.assign({ t: S.clock }, e)).slice(-40);
  };
  const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; };

  /* ---------- Director v4: one sheet with three places (Now, Suggestions, History) ----------
     Presentation and flow only: what the Director can do and the approval rules are unchanged.
     Idle -> thinking (skeleton + Stop) -> proposal (tick, Approve / Reject / Edit) -> applied (10 s undo bar) -> summary. */
  Dock.tab = 'now';
  Dock.tok = 0;
  Dock.phase = '';
  Dock.undoUntil = 0;
  Dock.dead = new Set(); // runs you pressed Stop on: whatever they bring back is dropped
  Dock.deadText = new Set(); // their directions: a proposal that arrives for one is rejected on the spot, so nothing changes
  const d4first = (n) => String((n && n.name) || '').split(' ')[0];
  const d4cast = () => Object.values(G.S.npcs).filter((n) => !n.blocked && !n.userAlt).sort((a, b) => (b.touched || 0) - (a.touched || 0));
  const d4plain = (s) => (G.Minimal && G.Minimal.strip ? G.Minimal.strip(s) : String(s || ''));
  const d4pins = () => (G.S && G.S.dirPins) || []; // (reading never creates the key)

  const dockEl = () => {
    let el = document.getElementById('stdock');
    if (!el) {
      el = document.createElement('div');
      el.id = 'stdock';
      document.body.appendChild(el);
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-d]');
        if (!b) return;
        const k = b.dataset.d;
        if (k === 'toggle') Dock.setOpen(!Dock.open);
        else if (k === 'pk') Dock.pick(b.dataset.pid, b.dataset.id, b.checked);
        else if (k === 'pkall') Dock.pickAll(b.dataset.id);
        else if (k === 'approve' || k === 'reject') Dock.decide(b.dataset.id, k === 'approve');
        else if (k === 'editdir') Dock.editDir(b.dataset.id);
        else if (k === 'stop') Dock.stop();
        else if (k === 'stopchat') { Dock.chatWith = null; Dock.msg = ''; Dock.draw(); }
        else if (k === 'talk') Dock.talk(b.dataset.id);
        else if (k === 'pick') Dock.pickModal();
        else if (k === 'cbuild') Dock.commentModal();
        else if (k === 'say') Dock.send('chat');
        else if (k === 'ask') Dock.send('ask');
        else if (k === 'act') Dock.send('do');
        else if (k === 'tab') { Dock.tab = b.dataset.t || 'now'; Dock.draw(); }
        else if (k === 'hist') { Dock.tab = Dock.tab === 'hist' ? 'now' : 'hist'; Dock.draw(); }
        else if (k === 'cp') { const nm = Story.checkpoint(prompt('Name this checkpoint', 'Before the big fight') || ''); Dock.msg = 'Saved checkpoint: ' + nm; Dock.bad = false; Dock.draw(); }
        else if (k === 'rb') { if (Story.rollback(+b.dataset.i)) { Dock.tab = 'now'; Dock.msg = 'Rolled back'; Dock.bad = false; } Dock.draw(); }
        else if (k === 'undo') { E.undo(); Dock.undoUntil = 0; Dock.msg = 'Undone'; Dock.bad = false; UI.render(); }
        else if (k === 'page') { Dock.setOpen(false); UI.go('storyteller'); }
        else if (k === 'dosug') { const t = el.querySelector('textarea'); if (t) t.value = b.dataset.s; Dock.text = b.dataset.s; Dock.send('do'); }
        else if (k === 'sug' || k === 'fill') { const t = el.querySelector('textarea'); if (t) { t.value = b.dataset.s; Dock.text = t.value; t.focus(); Dock.grow(t); } else Dock.fillBox(b.dataset.s); }
        else if (k === 'dir' || k === 'rerun') Dock.fillBox(b.dataset.s);
        else if (k === 'retry') { Dock.fillBox(b.dataset.s); Dock.send(b.dataset.m || undefined); }
        else if (k === 'copy') Dock.copy(b.dataset.s);
        else if (k === 'pin') Dock.pin(b.dataset.s);
        else if (k === 'gen') { const f = ['pitchOpen', 'pitchPosts', 'pitchStories', 'pitchDrama'].includes(b.dataset.k) && A[b.dataset.k]; if (f) f(); }
        else if (k === 'rumour') { if (A.rumourModal) A.rumourModal(); }
        else if (k === 'dolater') { const it = ((G.S.later) || []).find((x) => x.id === b.dataset.id); if (it) { Story.dropLater(it.id); Dock.tab = 'now'; const t = el.querySelector('textarea'); if (t) t.value = it.text; Dock.text = it.text; Dock.send(); } }
        else if (k === 'droplater') { Story.dropLater(b.dataset.id); Dock.draw(); }
        else if (k === 'quick') { Dock.tab = 'now'; const t = el.querySelector('textarea'); if (t) t.value = b.dataset.s; Dock.text = b.dataset.s; Dock.send(); }
      });
      el.addEventListener('change', (e) => {
        if (e.target.dataset && e.target.dataset.d === 'talkto') {
          Dock.chatWith = e.target.value || null;
          const n = Dock.chatWith && G.S.npcs[Dock.chatWith];
          Dock.msg = n ? `Talking to ${n.name}. They answer in character.` : '';
          Dock.bad = false;
          Dock.draw();
        }
      });
      el.addEventListener('input', (e) => {
        if (e.target.tagName !== 'TEXTAREA') return;
        Dock.text = e.target.value;
        Dock.grow(e.target);
      });
      el.addEventListener('keydown', (e) => {
        if (e.target.tagName !== 'TEXTAREA') return;
        const touch = window.matchMedia && window.matchMedia('(pointer:coarse)').matches;
        if (e.key === 'Enter' && !e.shiftKey && (e.ctrlKey || e.metaKey || !touch)) { e.preventDefault(); Dock.send(e.ctrlKey || e.metaKey ? 'do' : Dock.chatWith ? 'chat' : 'ask'); } // Enter sends on a computer (Shift+Enter = new line); on a phone the buttons send
        else if (e.key === 'Escape' && !document.getElementById('tagpop')) Dock.setOpen(false);
      });
      // drag the handle down to close the sheet
      let drag = null;
      el.addEventListener('pointerdown', (e) => {
        const g = e.target.closest && e.target.closest('.d4-grab');
        if (!g) return;
        const sh = el.querySelector('.d2');
        if (!sh) return;
        drag = { y: e.clientY, dy: 0, sh };
        try { g.setPointerCapture(e.pointerId); } catch (x) {}
        sh.style.transition = 'none';
      });
      el.addEventListener('pointermove', (e) => {
        if (!drag) return;
        drag.dy = Math.max(0, e.clientY - drag.y);
        drag.sh.style.transform = 'translateY(' + drag.dy + 'px)';
      });
      const endDrag = () => {
        if (!drag) return;
        const d = drag;
        drag = null;
        d.sh.style.transition = '';
        if (d.dy > 90) Dock.setOpen(false); else d.sh.style.transform = '';
      };
      el.addEventListener('pointerup', endDrag);
      el.addEventListener('pointercancel', endDrag);
    }
    return el;
  };
  // the sheet follows the on-screen keyboard (iPhone: the page does not shrink, only the visual viewport does)
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const follow = () => {
      const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      const r = document.documentElement.style;
      r.setProperty('--d4-kb', kb + 'px');
      r.setProperty('--d4-vh', Math.round(vv.height) + 'px');
    };
    vv.addEventListener('resize', follow);
    vv.addEventListener('scroll', follow);
    follow();
  }
  Dock.grow = (t) => { t.style.height = 'auto'; t.style.height = Math.min(150, Math.max(46, t.scrollHeight)) + 'px'; };
  Dock.setOpen = (on) => {
    Dock.open = !!on;
    try { localStorage.setItem('clout_stdock', on ? '1' : '0'); } catch (e) {}
    try { document.body.classList.toggle('d4-sheet', !!on); } catch (e) {}
    Dock.draw();
    const coarse = window.matchMedia && window.matchMedia('(pointer:coarse)').matches; // on a phone the keyboard waits until you tap the box
    if (on && !coarse) setTimeout(() => { const t = document.querySelector('#stdock textarea'); if (t) t.focus(); }, 40);
  };
  // put words in the box (and open the Now place); you decide when to press Ask or Act
  Dock.fillBox = (text) => {
    if (!Dock.open) Dock.setOpen(true);
    Dock.tab = 'now';
    Dock.text = String(text || '');
    Dock.draw();
    const t = document.querySelector('#stdock textarea');
    if (t) { t.focus(); try { t.setSelectionRange(t.value.length, t.value.length); } catch (e) {} }
  };
  Dock.talk = (id) => {
    const n = G.S.npcs[id];
    if (!n) return;
    Dock.chatWith = n.id;
    Dock.tab = 'now';
    Dock.msg = `Talking to ${n.name}. They answer in character.`;
    Dock.bad = false;
    Dock.draw();
  };
  Dock.copy = (text) => {
    const done = () => { Dock.msg = 'Copied.'; Dock.bad = false; Dock.draw(); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, done); return; }
    } catch (e) {}
    done();
  };
  Dock.pin = (text) => {
    text = String(text || '').trim();
    if (!text) return;
    const cur = d4pins();
    G.S.dirPins = cur.includes(text) ? cur.filter((x) => x !== text) : [text].concat(cur).slice(0, 12);
    G.Store.saveSoon();
    Dock.draw();
  };
  // what the Director is doing right now, in plain words
  const D4PHASE = {
    ask: ['Reading the story', 'Looking through the cast, their memories and the latest posts.'],
    do: ['Writing a proposal', 'Nothing changes until you approve it.'],
    plan: ['Planning the next beats', 'This only suggests. Nothing changes.'],
    apply: ['Applying what you approved', 'Almost done.'],
  };
  Dock.stop = () => {
    const c = Dock.cur;
    if (!c || !Dock.busy || !/^(ask|do|plan)$/.test(Dock.phase)) return;
    Dock.dead.add(c.tok);
    Dock.deadText.add(String(c.text || '').trim());
    Dock.busy = false;
    Dock.phase = '';
    Dock.text = c.raw || '';
    const th = G.S.stThread || [];
    if (th.length && th[th.length - 1].role === 'you') G.S.stThread = th.slice(0, -1);
    Dock.msg = 'Stopped. Nothing changed. (The AI call may still be billed.)';
    Dock.bad = false;
    Dock.draw();
  };
  Dock.state = () => {
    const n = Dock.chatWith && G.S.npcs[Dock.chatWith];
    if (Object.keys(Dock.pending || {}).length) return ['approve', 'Needs your approval'];
    if (Dock.busy) return ['think', Dock.phase === 'apply' ? 'Applying' : 'Thinking'];
    if (n) return ['chat', 'Talking to ' + d4first(n)];
    return ['idle', 'Ready'];
  };
  Dock.status = () => {
    const S = G.S;
    const sm = S.stSummary;
    const spent = AIm.spent ? AIm.spent() : 0;
    const main = AIm.mainReady && AIm.mainReady();
    const brain = main ? 'Connected' : AIm.ready && AIm.ready() ? 'Local helper' : 'Free brain';
    const dial = G.World.postDial();
    const posts = dial === 0 ? 'posts only when you direct' : 'the cast also posts on its own';
    const glob = G.Directives && G.Directives.list().length ? ` · ${G.Directives.list().length} global rule${G.Directives.list().length > 1 ? 's' : ''}` : '';
    return `<span class="d4-dot ${main || (AIm.ready && AIm.ready()) ? 'on' : ''}"></span>${brain} · ${money(spent)} this session · ` + (sm ? `Knows the story (${Math.round(sm.text.length / 1000)}k${S.storyDate ? ' · ' + esc(S.storyDate) : ''})` : 'No story summary yet') + ' · ' + posts + glob;
  };

  /* direction ideas, written with the people in YOUR world (a tap fills the box; you press Act yourself) */
  Dock.dirs = () => {
    const c = d4cast();
    const a = c[0] ? d4first(c[0]) : 'one of your characters';
    const b = c[1] ? d4first(c[1]) : 'another character';
    const t = c[2] ? d4first(c[2]) : b;
    return [
      ['Twist', `A twist: something comes out that changes how ${a} and ${b} see each other. Two people react in the comments.`],
      ['Drama', `${a} and ${b} get into a public argument in the comments, and a few others pile in.`],
      ['Reunion', `${a} and ${b} run into each other after a long time apart. It is awkward, then warm.`],
      ['Rumour', `A rumour starts to spread about ${a}. ${b} hears it and is not sure what to believe.`],
      ['Calm day', `A calm, warm day: ${a} and ${b} post small friendly things and nobody fights.`],
      ['Party', `${t} throws a party and invites everyone. People post about it and make plans.`],
    ];
  };
  const d4chip = (k, label, s, extra) => `<button class="d4-chip" data-d="${k}"${s != null ? ` data-s="${esc(s)}"` : ''}${extra || ''}>${esc(label)}</button>`;
  Dock.chips = () => {
    const n = ((G.S && G.S.pitches) || []).length;
    return [
      d4chip('quick', 'Catch me up', 'catch me up on the story'),
      d4chip('quick', 'Who is upset with me', 'who is upset with me right now, and why?'),
      d4chip('fill', 'Plan something', '/plan the next few beats of the story'),
      n ? d4chip('gen', `Review ${n} idea${n > 1 ? 's' : ''}`, null, ' data-k="pitchOpen"') : d4chip('rumour', 'Start a rumour', null),
    ].join('');
  };
  const dirChips = () => d4pins().map((p) => d4chip('rerun', clip(p, 28), p)).concat(Dock.dirs().map(([l, s]) => d4chip('dir', l, s))).join('');

  /* a proposed change, in plain words: who does what */
  const D4GROUP = { posts: 0, posts_rest: 0, crowd: 0, dms: 1, group_msgs: 1, character_updates: 2, rel: 2, npc_rel: 2, pt: 4, rf: 5, goal: 5 };
  const D4GNAME = ['Posts and replies', 'Messages to you', 'Feelings and relationships', 'The story and the world', 'Suggestions', 'Thoughts and goals'];
  const d4row = (it, pid, p) => {
    const S = G.S;
    const s = String(it.label || '');
    const mq = /^([\s\S]*?)(“[\s\S]*”)\s*$/.exec(s);
    let head = d4plain(mq ? mq[1] : s).replace(/\s+/g, ' ').trim();
    const quote = mq ? mq[2] : '';
    let close = false;
    if (/^\(close friends only\)\s*/i.test(head)) { close = true; head = head.replace(/^\(close friends only\)\s*/i, ''); }
    const people = Object.values(S.npcs).concat([{ id: 'me', name: S.player.name }]).filter((n) => n.name).sort((a, b) => b.name.length - a.name.length);
    const who = people.find((n) => head.startsWith(n.name) && /^(\s|:|$)/.test(head.slice(n.name.length)));
    const av = who ? `<i class="d4-av">${UI.avatar(who.id === 'me' ? 'me' : who, 34)}</i>` : '<i class="d4-av sys"></i>';
    const txt = who ? `<b>${esc(who.name)}</b>${esc(head.slice(who.name.length))}` : esc(head);
    const dep = it.deps && it.deps.length ? ' dep' : '';
    const on = !p.sel || p.sel.has(it.id);
    return `<label class="d2-it d4-row${dep}"><input type="checkbox" data-d="pk" data-pid="${pid}" data-id="${esc(it.id)}" ${on ? 'checked' : ''}>${av}<span class="d4-tx">${txt}${quote ? ` <span class="d4-q" data-keep-emoji>${esc(quote)}</span>` : ''}${close ? ' <span class="d4-tag">close friends</span>' : ''}</span></label>`;
  };
  Dock.propHTML = (x) => {
    const p = Dock.pending[x.pid];
    if (!p) return '';
    const items = p.items || p.lines.map((l, i) => ({ id: 'l' + i, label: l }));
    const groups = [];
    items.forEach((it) => {
      const g = D4GROUP[it.group] != null ? D4GROUP[it.group] : it.group === 'none' ? -1 : 3;
      let box = groups.find((q) => q.g === g);
      if (!box) { box = { g, rows: [] }; groups.push(box); }
      box.rows.push(d4row(it, x.pid, p));
    });
    groups.sort((a, b) => a.g - b.g);
    const n = p.sel ? p.sel.size : items.length;
    const body = groups.map((q) => `<div class="d4-grp">${groups.length > 1 && q.g >= 0 ? `<div class="d4-gh">${D4GNAME[q.g]}</div>` : ''}${q.rows.join('')}</div>`).join('');
    return `<div class="d2-b ai prop d4-prop"><div class="d4-prop-h"><div><div class="d2-h">Approve this?</div><div class="d4-sub">${esc(clip(p.text || '', 110))}</div></div>${p.cost ? `<span class="d2-cost">${money(p.cost)}</span>` : ''}</div>
      <div class="d4-prop-bar"><span>${n} of ${items.length} selected</span><button class="linklike" data-d="pkall" data-id="${x.pid}">tick all / none</button></div>
      <div class="d2-items">${body}</div>
      <div class="prop-actions"><button class="btn primary d4-apply" data-d="approve" data-id="${x.pid}">Approve${p.sel ? ' selected (' + p.sel.size + ')' : ''}</button><div class="d4-pa2"><button class="btn" data-d="reject" data-id="${x.pid}">Reject all</button>${p.dir ? `<button class="btn" data-d="editdir" data-id="${x.pid}">Edit direction</button>` : ''}</div><div class="small muted d4-note">Nothing has changed yet. After you approve you can undo for 10 seconds.</div></div></div>`;
  };
  Dock.thinkHTML = () => {
    const ph = D4PHASE[Dock.phase] || ['Working', ''];
    const stoppable = /^(ask|do|plan)$/.test(Dock.phase);
    return `<div class="d4-think" role="status" aria-live="polite"><div class="d4-think-h"><span class="d4-pulse"></span><div><b>${ph[0]}</b><div class="small muted">${ph[1]}</div></div>${stoppable ? '<button class="btn sm" data-d="stop">Stop</button>' : ''}</div><i class="d4-sk" style="width:86%"></i><i class="d4-sk" style="width:64%"></i><i class="d4-sk" style="width:74%"></i></div>`;
  };
  Dock.doneHTML = (x) => {
    const skip = [];
    const ok = [];
    (x.items || []).forEach((i) => {
      const m = /^(\d+) items? (?:was|were) not used: ([\s\S]*)$/.exec(i);
      if (m) m[2].split('; ').filter(Boolean).forEach((s) => skip.push(s)); else ok.push(i);
    });
    const pinned = x.dir && d4pins().includes(x.dir);
    return `<div class="d2-b ai done d4-done"><div class="d2-h">Done${x.cost ? `<span class="d2-cost">${money(x.cost)}</span>` : ''}</div>${ok.length ? `<div class="d4-sec">What happened</div><ul class="d2-ch">${ok.map((i) => '<li>' + esc(i) + '</li>').join('')}</ul>` : `<p>${esc(x.summary || 'Nothing needed to change.')}</p>`}${skip.length ? `<div class="d4-sec">Not used</div><ul class="d4-skip">${skip.map((i) => '<li>' + esc(i) + '</li>').join('')}</ul>` : ''}<div class="d4-acts"><button class="linklike" data-d="undo">Undo this</button>${x.dir ? `<button class="linklike" data-d="rerun" data-s="${esc(x.dir)}">Direct again</button><button class="linklike" data-d="pin" data-s="${esc(x.dir)}">${pinned ? 'Unpin' : 'Pin'}</button>` : ''}</div></div>`;
  };
  Dock.logHTML = () => {
    const th = (G.S.stThread || []).slice(-8);
    const talking = Dock.chatWith && G.S.npcs[Dock.chatWith];
    if (!th.length && !Dock.busy && !Story.due().length) {
      const people = d4cast().slice(0, 8);
      if (talking) return `<div class="stlog d4-empty"><div class="d4-hero"><div class="d2-hello">Say something to ${esc(d4first(talking))}</div><p>They answer in character. Talking never changes the world.</p></div></div>`;
      return `<div class="stlog d4-empty"><div class="d4-hero"><div class="d2-hello">What do you want to know, or make happen?</div></div>
        <div class="d4-sec">Try a direction</div><div class="d4-rail">${dirChips()}</div>
        ${people.length ? `<div class="d4-sec">Talk to a character</div><div class="d4-rail">${people.map((n) => d4chip('talk', n.name, null, ` data-id="${esc(n.id)}"`)).join('')}</div>` : ''}
        <details class="d4-more"><summary>More ideas</summary><div class="d2-quick">${[['What drama is brewing?', 'what drama is brewing?'], ['What did I miss?', 'what happened recently?']].map(([l, q]) => `<button class="pill" data-d="quick" data-s="${esc(q)}">${l}</button>`).join('')}${[['Someone posts…', 'Kai posted '], ['Comment + replies', 'Matt commented "…" on Mia\'s latest post, 5 replies, tone: '], ['Change an attitude', 'Make Kai trust Mia much more now']].map(([l, q]) => `<button class="pill ghost" data-d="fill" data-s="${esc(q)}">${l}</button>`).join('')}</div></details></div>`;
    }
    const dueNow = Story.due().map((x) => `<div class="stsug d2-due"><span><b>Due now:</b> ${esc(x.text)}</span><button class="btn primary sm" data-d="dolater" data-id="${x.id}">Do it</button><button class="btn sm" data-d="droplater" data-id="${x.id}" title="Dismiss">Dismiss</button></div>`).join('');
    const sugs = (x) => (x.sug || []).map((s) => `<div class="stsug"><span>${esc(s)}</span><button class="btn primary sm" data-d="dosug" data-s="${esc(s)}" title="Make this happen now">Do it</button><button class="btn sm" data-d="sug" data-s="${esc(s)}" title="Put it in the box so you can change it first">Edit</button></div>`).join('');
    const last = th.length - 1;
    const fresh = th.length > (Dock._seen || 0);
    const body = th.filter((x) => x.kind !== 'proposal' || Dock.pending[x.pid]).map((x) => {
      if (x.role === 'you') return `<div class="d2-b you stq k-${esc(x.kind || '')}">${esc(x.text)}</div>`;
      if (x.kind === 'ask') return `<div class="d2-b ai sta">${md(x.answer)}${x.cost ? `<span class="d2-cost">${money(x.cost)}</span>` : ''}</div>${sugs(x)}`;
      if (x.kind === 'do') return Dock.doneHTML(x);
      if (x.kind === 'chat' && x.role === 'ai') return `<div class="d2-b ai chat" data-sid="${esc(x.sid || '')}"><b>${esc(x.who || '')}</b> <span class="t">${x.live && Dock.busy ? esc(x.text) || '…' : md(x.text)}</span>${x.cost ? `<span class="d2-cost">${money(x.cost)}</span>` : ''}</div>`;
      if (x.kind === 'proposal') return Dock.propHTML(x);
      if (x.kind === 'later') return `<div class="d2-b ai done"><div class="d2-h">Scheduled</div><p>${esc(x.summary)}</p></div>`;
      return `<div class="d2-b ai err d4-err"><div class="d2-h">That did not work</div><p>${esc(x.text)}</p>${x.retry ? `<button class="btn sm" data-d="retry" data-m="${esc(x.retry.mode || '')}" data-s="${esc(x.retry.text || '')}">Try again</button>` : ''}</div>`;
    }).map((h, i, a) => (fresh && i === a.length - 1 ? h.replace('class="d2-b ', 'class="d4-new d2-b ') : h)).join('');
    Dock._seen = th.length;
    const live = Dock.busy && (Dock.phase === 'chat' ? '<div class="d2-b ai typing"><i></i><i></i><i></i></div>' : Dock.thinkHTML());
    return `<div class="stlog">${dueNow}${body}${live || ''}</div>`;
  };
  Dock.sugHTML = () => {
    const S = G.S;
    const n = (S.pitches || []).length;
    const row = (k, extra, t, sub) => `<button class="d4-lrow" data-d="${k}"${extra || ''}><span><b>${t}</b><small>${sub}</small></span><i>›</i></button>`;
    const pins = d4pins();
    const later = S.later || [];
    return `<div class="d4-pane">
      ${n ? `<button class="d4-cta" data-d="gen" data-k="pitchOpen"><b>${n} suggestion${n > 1 ? 's' : ''} waiting</b><small>Review them and tick what you like</small></button>` : '<div class="d4-note2">No suggestions waiting. Ask for some below.</div>'}
      <div class="d4-sec">Make something happen</div>
      <div class="d4-list">${row('gen', ' data-k="pitchPosts"', 'Make some posts', 'Characters write, you approve each one')}${row('gen', ' data-k="pitchStories"', 'Add some stories', 'A few 24-hour stories')}${row('gen', ' data-k="pitchDrama"', 'Stir some drama', 'Replies and gossip')}${row('rumour', '', 'Start a rumour', 'You tell it, then it spreads')}</div>
      <div class="d4-sec">Directions to try</div><div class="d4-rail wrap">${Dock.dirs().map(([l, s]) => d4chip('dir', l, s)).join('')}</div>
      ${pins.length ? `<div class="d4-sec">Pinned</div><div class="d4-list">${pins.map((p) => `<div class="d4-prow"><span>${esc(clip(p, 140))}</span><button class="linklike" data-d="rerun" data-s="${esc(p)}">Use</button><button class="linklike" data-d="pin" data-s="${esc(p)}">Unpin</button></div>`).join('')}</div>` : ''}
      ${later.length ? `<div class="d4-sec">Scheduled</div><div class="d4-list">${later.map((x) => `<div class="d4-prow"><span>${x.at <= S.clock ? '<b>Due now</b>' : 'In ' + untilStr(x.at - S.clock)} · ${esc(clip(x.text, 120))}</span><button class="linklike" data-d="dolater" data-id="${x.id}">Do it now</button><button class="linklike" data-d="droplater" data-id="${x.id}">Drop</button></div>`).join('')}</div>` : ''}
    </div>`;
  };
  // history: a timeline of directions grouped by day. Each one can be run again, copied, pinned and (while it is still in the undo list) rolled back.
  Dock.histHTML = () => {
    const S = G.S;
    const log = (S.directorLog || []).slice().reverse().slice(0, 40);
    const stack = Story.history();
    const used = new Set();
    const stepOf = (text) => {
      const key = clip(String(text || ''), 60).trim();
      const h = stack.find((x) => !used.has(x.i) && d4plain(x.what).trim() === key);
      if (h) used.add(h.i);
      return h;
    };
    let day = null;
    const pins = d4pins();
    const rows = log.map((l) => {
      const d = U.dayOf(l.t);
      const head = d !== day ? `<div class="d4-day">Day ${d}</div>` : '';
      day = d;
      const st = stepOf(l.text);
      return `${head}<div class="d4-hrow"><div class="d4-ht">${esc(clip(l.text, 160))}</div><div class="d4-hm">${esc(U.clockStr(l.t).replace(/^Day \d+ · /, ''))}${l.cost ? ' · ' + money(l.cost) : ''}${l.summary ? ' · ' + esc(clip(l.summary, 110)) : ''}</div><div class="d4-hact"><button class="linklike" data-d="rerun" data-s="${esc(l.text)}">Run again</button><button class="linklike" data-d="copy" data-s="${esc(l.text)}">Copy</button><button class="linklike" data-d="pin" data-s="${esc(l.text)}">${pins.includes(l.text) ? 'Unpin' : 'Pin'}</button>${st ? `<button class="linklike" data-d="rb" data-i="${st.i}">Roll back</button>` : ''}</div></div>`;
    }).join('');
    const steps = stack.filter((x) => !used.has(x.i));
    return `<div class="sthist d4-pane">${rows || '<div class="d4-note2">No directions yet. Try one from Now or Suggestions.</div>'}
      ${steps.length ? `<div class="d4-day">Saved steps</div>${steps.map((x) => `<div class="d4-hrow flat"><div class="d4-ht">${esc(clip(d4plain(x.what).trim(), 90))}</div><div class="d4-hact"><button class="linklike" data-d="rb" data-i="${x.i}">Roll back</button></div></div>`).join('')}` : ''}
      ${!rows && !steps.length ? '<div class="d4-note2">Nothing to roll back yet.</div>' : ''}
      <div class="d4-hfoot"><button class="btn sm" data-d="cp">Save a checkpoint</button><button class="linklike" data-d="page">Advanced settings</button></div></div>`;
  };
  Dock.nowHTML = () => {
    const S = G.S;
    const talking = Dock.chatWith && S.npcs[Dock.chatWith];
    const approving = Object.keys(Dock.pending || {}).length > 0;
    const dis = Dock.busy ? 'disabled' : '';
    const undoLeft = Dock.undoUntil - Date.now();
    const undoBar = undoLeft > 0 && !approving ? `<div class="d4-undo"><span>Applied. You can still undo.</span><button class="btn sm" data-d="undo">Undo</button><i style="animation-delay:-${((10000 - undoLeft) / 1000).toFixed(2)}s"></i></div>` : '';
    const chat = talking ? `<div class="d4-chatbar"><span>Talking to <b>${esc(talking.name)}</b></span><small>in character</small><button class="btn sm" data-d="stopchat" title="Stop talking to ${esc(talking.name)}">End chat</button></div>` : '';
    return `${chat}${Dock.logHTML()}
      ${Dock.msg ? `<div class="small d2-msg${Dock.bad ? ' bad' : ''}" role="status">${esc(Dock.msg)}</div>` : ''}${undoBar}
      ${approving ? '' : `<div class="d4-chips" role="group" aria-label="Quick starts">${talking ? '' : Dock.chips()}</div>
      <div class="d2-input"><textarea rows="1" maxlength="1500" placeholder="${talking ? 'Say something to ' + esc(d4first(talking)) + '…' : 'Ask a question, or say what happens next'}" ${dis}>${esc(Dock.text)}</textarea>
        <div class="d4-ab"><div class="d4-hint">${talking ? 'Say talks in character. Act proposes changes for you to approve.' : 'Ask answers only. Act proposes changes for you to approve first.'}</div>
          <div class="d2-btns d4-mode" role="group" aria-label="Ask or Act">${talking ? `<button class="btn primary d2-send d2-say" data-d="say" ${dis} title="Say it to ${esc(talking.name)}, in character (Enter)">Say</button>` : ''}<button class="btn d2-send d2-ask" data-d="ask" ${dis} title="Only answers. Nothing in the world changes. (Enter)">Ask</button><button class="btn ${talking ? '' : 'primary '}d2-send d2-act" data-d="act" ${dis} title="Proposes changes you approve first. (Ctrl+Enter)">Act</button></div></div></div>
      <div class="d2-tools"><button class="ibtn" data-d="pick" aria-label="Pick a post" title="Pick a post: point at a specific post instead of describing it">${UI.icon('crosshair', 20)}</button><button class="ibtn" data-d="cbuild" aria-label="Comment" title="Comment: build a comment on one exact post">${UI.icon('message-square', 20)}</button><button class="ibtn" data-d="undo" ${E.undoStack.length ? '' : 'disabled'} aria-label="Undo" title="Undo the last change">${UI.icon('undo', 20)}</button><button class="ibtn" data-d="cp" aria-label="Checkpoint" title="Checkpoint: save a point you can roll back to">${UI.icon('flag', 20)}</button></div>`}`;
  };
  Dock.draw = function () {
    const el = dockEl();
    const show = !!G.S && document.body.classList.contains('ingame');
    el.hidden = !show;
    if (!show) return;
    const keep = el.querySelector('textarea');
    const focused = keep && document.activeElement === keep;
    const sc0 = el.querySelector('.stlog,.d4-pane');
    const wasLog = !!(sc0 && sc0.classList.contains('stlog'));
    const atBottom = !sc0 || sc0.scrollHeight - sc0.scrollTop - sc0.clientHeight < 60;
    const prevTop = sc0 ? sc0.scrollTop : 0;
    const approving = Object.keys(Dock.pending || {}).length > 0;
    if (approving) Dock.tab = 'now'; // a proposal always takes the whole sheet
    const startedApproval = approving && !Dock._appr; // (a new proposal is read from its top)
    Dock._appr = approving;
    const st = Dock.state();
    const entering = Dock.open && !Dock._was;
    Dock._was = Dock.open;
    el.className = Dock.open ? 'open' + (approving ? ' approving' : '') + ' s-' + st[0] + (entering ? ' entering' : '') : '';
    const sug = ((G.S && G.S.pitches) || []).length;
    const tab = (id, label, extra) => `<button class="d4-segbtn${Dock.tab === id ? ' on' : ''}" role="tab" aria-selected="${Dock.tab === id}" data-d="tab" data-t="${id}">${label}${extra || ''}</button>`;
    const seg = `<div class="d4-seg" role="tablist">${tab('now', 'Now')}${tab('sug', 'Suggestions', sug ? `<i class="d4-n">${sug}</i>` : '')}<button class="linklike d4-segbtn${Dock.tab === 'hist' ? ' on' : ''}" role="tab" aria-selected="${Dock.tab === 'hist'}" data-d="hist">History</button></div>`;
    el.innerHTML = Dock.open
      ? `<div class="d4-scrim" data-d="toggle"></div><div class="stp d2 d4" role="dialog" aria-label="Director"><div class="d4-grab" aria-hidden="true"><i></i></div>
        <div class="d2-head"><div class="d4-ttl"><div class="d4-t1"><b>Director</b><span class="d4-state s-${st[0]}">${st[1]}</span></div><div class="small muted d2-status">${Dock.status()}</div></div><span class="d4-hb"><button class="ibtn" data-d="page" aria-label="Advanced" title="Advanced: the full page with rules, memory, charts and more">${UI.icon('sliders', 20)}</button><button class="ibtn" data-d="toggle" aria-label="Close the Director" title="Close (Esc)">${UI.icon('x', 20)}</button></span></div>
        ${seg}
        <div class="d4-body">${Dock.tab === 'sug' ? Dock.sugHTML() : Dock.tab === 'hist' ? Dock.histHTML() : Dock.nowHTML()}</div></div>`
      : '<button class="stpill" data-d="toggle" title="Ask or direct the story"><span>Director</span></button>';
    const sc = el.querySelector('.stlog,.d4-pane');
    if (sc) { const isLog = sc.classList.contains('stlog'); sc.scrollTop = isLog === wasLog ? (isLog && atBottom ? sc.scrollHeight : prevTop) : isLog ? sc.scrollHeight : 0; }
    if (sc && (startedApproval || sc.classList.contains('d4-empty'))) sc.scrollTop = 0;
    const t = el.querySelector('textarea');
    if (t) { Dock.grow(t); if (focused) { t.focus(); try { t.setSelectionRange(t.value.length, t.value.length); } catch (e) {} } }
  };


  /* point at a post instead of describing it ("Kujo's last post" can be many posts) */
  const authorName = (p) => (p.author === 'me' ? G.S.player.name : (G.S.npcs[p.author] || {}).name || (p.crowd && p.crowd.handle) || 'someone');
  const ppRows = (q, author) => {
    const S = G.S;
    const ql = String(q || '').toLowerCase().trim();
    return S.postOrder.slice().reverse().map((id) => S.posts[id]).filter((p) => p && !p.replyTo && (!author || p.author === author) && (!ql || (p.text + ' ' + authorName(p)).toLowerCase().includes(ql))).slice(0, 40);
  };
  const putInBox = (text, replace) => {
    Dock.setOpen(true);
    const t = document.querySelector('#stdock textarea');
    const cur = replace ? '' : t ? t.value : Dock.text || '';
    const v = cur + (cur && !/\s$/.test(cur) ? ' ' : '') + text;
    Dock.text = v;
    if (t) { t.value = v; t.focus(); Dock.grow(t); }
    return v;
  };
  Dock.pickModal = function (q) {
    const S = G.S;
    UI.modal(`<button class="close" data-act="closeModal" aria-label="Close">✕</button><h3>Pick a post</h3><p class="muted small">Tap one: the Director gets its exact id, so there is no guessing which post you mean.</p>
      <div class="row" style="gap:8px"><input id="pp_q" value="${esc(q || '')}" placeholder="search words or a person" style="flex:1"><button class="btn sm" data-act="ppSearch">Search</button></div>
      <div class="pplist">${ppRows(q).map((p) => `<button class="pprow" data-act="ppChoose" data-id="${p.id}"><b>${esc(authorName(p))}</b> <span class="muted small">${U.ago(S.clock, p.t)} · ❤ ${U.fmt(p.stats.likes)}${p.audience === 'close' ? ' · 💚' : ''}</span><div>${esc(clip(p.text, 110))}</div></button>`).join('') || '<div class="empty small">No posts match.</div>'}</div>`);
  };
  A.ppSearch = () => { const v = ($('#pp_q') || {}).value; UI.closeModal(); Dock.pickModal(v); };
  A.ppChoose = (d) => {
    const p = G.S.posts[d.id];
    if (!p) return;
    UI.closeModal();
    putInBox(`${authorName(p)}'s post ${p.id} (“${clip(p.text, 50).replace(/["“”]/g, "'")}”)`);
  };
  Dock.commentModal = function (author) {
    const S = G.S;
    const npcs = Object.values(S.npcs).filter((n) => !n.blocked && !n.userAlt).sort((a, b) => (b.touched || 0) - (a.touched || 0)).slice(0, 60);
    const postOpts = (au) => ppRows('', au).map((p) => `<option value="${p.id}">${esc(authorName(p))} · ${U.ago(S.clock, p.t)} · ${esc(clip(p.text, 60))}</option>`).join('');
    UI.modal(`<button class="close" data-act="closeModal" aria-label="Close">✕</button><h3>Comment on one exact post</h3>
      <label>Who comments</label><select id="cb_who">${npcs.map((n) => `<option value="${n.id}">${esc(n.name)}</option>`).join('')}</select>
      <label>On whose posts</label><select id="cb_author"><option value="">Anyone</option>${npcs.map((n) => `<option value="${n.id}" ${n.id === author ? 'selected' : ''}>${esc(n.name)}</option>`).join('')}<option value="me">${esc(S.player.name)} (you)</option></select>
      <label>Which post</label><select id="cb_post">${postOpts(author)}</select>
      <label>What they say</label><input id="cb_text" maxlength="200" placeholder="who let her cook 😭">
      <div class="row" style="gap:8px"><div><label>Replies <span class="muted small">(optional)</span></label><input id="cb_n" type="number" min="0" max="20" style="width:90px"></div><div style="flex:1"><label>Tone <span class="muted small">(optional)</span></label><input id="cb_tone" placeholder="hype, shade, confused…"></div></div>
      <div class="row wrap" style="margin-top:10px;gap:8px"><button class="btn primary" data-act="cbDo">Make it happen</button><button class="btn" data-act="cbFill">Put it in the box</button></div>`);
    Dock._cbOpts = postOpts;
  };
  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'cb_author' && Dock._cbOpts) { const sel = $('#cb_post'); if (sel) sel.innerHTML = Dock._cbOpts(e.target.value) || '<option value="">(no posts)</option>'; }
  });
  const cbText = () => {
    const S = G.S;
    const who = S.npcs[($('#cb_who') || {}).value];
    const p = S.posts[($('#cb_post') || {}).value];
    const say = String(($('#cb_text') || {}).value || '').trim();
    if (!who || !p || !say) return '';
    const n = Number(($('#cb_n') || {}).value) || 0;
    const tone = String(($('#cb_tone') || {}).value || '').trim();
    return `${who.name} commented "${say.replace(/"/g, "'")}" on ${authorName(p)}'s post ${p.id} (“${clip(p.text, 50).replace(/["“”]/g, "'")}”)${n > 0 ? `, it got ${n} replies` : ''}${tone ? `, tone: ${tone}` : ''}`;
  };
  A.cbFill = () => { const t = cbText(); if (!t) return UI.toast('Pick who, which post, and what they say.', 'info'); UI.closeModal(); putInBox(t, true); };
  A.cbDo = () => { const t = cbText(); if (!t) return UI.toast('Pick who, which post, and what they say.', 'info'); UI.closeModal(); putInBox(t, true); Dock.send('do'); };

  Dock.decide = (pid, ok) => {
    const p = Dock.pending[pid];
    if (!p) return;
    delete Dock.pending[pid];
    G.S.stThread = (G.S.stThread || []).filter((x) => x.pid !== pid);
    const sel = p.sel ? Array.from(p.sel) : null;
    const yes = ok && (!sel || sel.length > 0);
    Dock.msg = yes ? 'Approved. Making it happen…' : 'Rejected';
    Dock.bad = false;
    if (yes && Dock.busy) Dock.phase = 'apply';
    Dock.draw();
    p.resolve(yes ? (sel || true) : false);
  };
  // "Edit direction": reject this proposal (nothing changes) and get the words back in the box to rewrite
  Dock.editDir = (pid) => {
    const p = Dock.pending[pid];
    if (!p) return;
    const words = String(p.text || '');
    Dock.decide(pid, false);
    Dock.text = words;
    Dock.draw();
    const t = document.querySelector('#stdock textarea');
    if (t) { t.focus(); try { t.setSelectionRange(t.value.length, t.value.length); } catch (e) {} }
  };
  Dock.pick = (pid, id, on) => {
    const p = Dock.pending[pid];
    if (!p || !p.sel) return;
    const items = p.items || [];
    const by = new Map(items.map((i) => [i.id, i]));
    const addDeps = (i) => (i.deps || []).forEach((d) => { if (!p.sel.has(d)) { p.sel.add(d); addDeps(by.get(d) || {}); } });
    const dropKids = (k) => items.forEach((i) => { if ((i.deps || []).includes(k) && p.sel.has(i.id)) { p.sel.delete(i.id); dropKids(i.id); } });
    if (on) { p.sel.add(id); addDeps(by.get(id) || {}); } else { p.sel.delete(id); dropKids(id); }
    Dock.draw();
  };
  Dock.pickAll = (pid) => {
    const p = Dock.pending[pid];
    if (!p || !p.sel) return;
    const all = (p.items || []).map((i) => i.id);
    p.sel = p.sel.size === all.length ? new Set() : new Set(all);
    Dock.draw();
  };
  // every Director action waits for you: the AI proposes, the world only changes when you press Approve
  Story.approver = (prop) => new Promise((resolve) => {
    const said = String((prop && prop.text) || '').trim();
    if (Dock.deadText.has(said)) { Dock.deadText.delete(said); return resolve(false); } // you pressed Stop on this one: reject it, nothing changes
    const pid = U.uid('pr');
    Dock.pending[pid] = Object.assign({}, prop, { resolve, dir: !!said && Dock.directing === said, sel: new Set((prop.items || []).map((i) => i.id)) });
    thread({ role: 'ai', kind: 'proposal', pid });
    Dock.msg = 'Waiting for your approval…';
    Dock.bad = false;
    Dock.setOpen(true);
    Dock.draw();
  });
  Dock.say = async function (text) {
    const n = G.S.npcs[Dock.chatWith];
    if (!n) { Dock.chatWith = null; Dock.msg = 'Pick who to talk to first (Talk to a character).'; Dock.bad = true; return Dock.draw(); }
    thread({ role: 'you', kind: 'chat', text });
    Dock.text = '';
    Dock.busy = true; Dock.phase = 'chat'; Dock.msg = ''; Dock.bad = false; Dock.draw();
    const sid = U.uid('sx');
    thread({ role: 'ai', kind: 'chat', who: n.name, text: '', sid, live: true });
    Dock.draw();
    const entry = () => (G.S.stThread || []).find((x) => x.sid === sid);
    try {
      const r = await Story.chat(n.id, text, {
        onText: (t) => {
          const en = entry();
          if (en) en.text = t;
          const el = document.querySelector('#stdock [data-sid="' + sid + '"] .t');
          if (el) {
            el.textContent = t || '…';
            const lg = document.querySelector('#stdock .stlog');
            if (lg) lg.scrollTop = lg.scrollHeight;
          }
        },
      });
      const en = entry();
      if (en) { en.text = r.reply; en.cost = r.cost; delete en.live; } else thread({ role: 'ai', kind: 'chat', who: n.name, text: r.reply, cost: r.cost });
    } catch (e) {
      G.S.stThread = (G.S.stThread || []).filter((x) => x.sid !== sid);
      thread({ role: 'ai', kind: 'err', text: e.message || 'That did not work.' });
      Dock.msg = e.message || 'That did not work.';
      Dock.bad = true;
      Dock.text = text;
    }
    Dock.busy = false;
    Dock.phase = '';
    G.Store.saveSoon();
    Dock.draw();
  };
  Dock.send = async function (mode) {
    const t = document.querySelector('#stdock textarea');
    const text = (t ? t.value : Dock.text).trim();
    if (!text) { Dock.msg = 'Type a question or tell the world what happens.'; Dock.bad = true; return Dock.draw(); }
    if (mode === 'chat') return Dock.say(text);
    const it = Story.intent(text, mode === 'ask' || mode === 'do' ? mode : undefined);
    if (!it.text && it.kind !== 'plan' && it.kind !== 'global') { Dock.msg = 'Ask something, for example: who is mad at me?'; Dock.bad = true; return Dock.draw(); }
    const tok = ++Dock.tok;
    const mine = () => !Dock.dead.has(tok); // false once you pressed Stop on this run
    thread({ role: 'you', kind: it.kind, text: it.text });
    Dock.text = '';
    Dock.busy = true; Dock.phase = it.kind === 'plan' ? 'plan' : it.kind === 'ask' ? 'ask' : it.kind === 'do' ? 'do' : ''; Dock.cur = { tok, text: it.text, raw: text }; Dock.directing = it.kind === 'do' ? String(it.text).trim() : ''; Dock.msg = ''; Dock.bad = false; Dock.draw();
    try {
      if (it.kind === 'global') {
        const msg = G.Directives.run(it.text);
        thread({ role: 'ai', kind: 'ask', answer: msg, sug: [], cost: 0 });
        Dock.msg = 'Global directives updated. Free, instant, no AI call.';
      } else if (it.kind === 'later') {
        const x = Story.schedule(it.minutes, it.text);
        const sum = `In ${untilStr(it.minutes)} (${U.clockStr(x.at)}): ${it.text}. It costs nothing until then; when it is due the Director asks you.`;
        thread({ role: 'ai', kind: 'later', summary: sum });
        Dock.msg = 'Scheduled.';
      } else if (it.kind === 'plan') {
        const r = await Story.plan(it.text);
        if (!mine()) return;
        thread({ role: 'ai', kind: 'ask', answer: r.answer, sug: r.sug, cost: r.cost });
        Dock.msg = `Plan ready${r.cost ? ' · ' + money(r.cost) : ''}. Nothing in the world changed: press Do it on a beat.`;
      } else if (it.kind === 'ask') {
        const r = await Story.ask(it.text);
        if (!mine()) return;
        thread({ role: 'ai', kind: 'ask', answer: r.answer, sug: r.sug, cost: r.cost });
        Dock.msg = r.free ? 'Free snapshot (no AI connected).' : `Answered${r.cost ? ' · ' + money(r.cost) : ''}. Nothing in the world changed.`;
      } else {
        const r = await Story.run(it.text);
        if (!mine()) return;
        if (r.rejected) { thread({ role: 'ai', kind: 'ask', answer: 'Rejected. Nothing changed.' + (r.cost ? ' (the AI call still cost ' + money(r.cost) + ')' : ''), sug: [], cost: 0 }); Dock.msg = 'Rejected: nothing changed.'; Dock.text = it.text; } else {
        thread({ role: 'ai', kind: 'do', summary: r.summary, items: String(r.summary).split(' · ').filter(Boolean), cost: r.cost, dir: it.text });
        Dock.msg = '';
        UI.toast(`${r.summary}${r.cost ? ' · ' + money(r.cost) : ''}`, 'good');
        Dock.undoUntil = Date.now() + 10000; // the 10-second undo bar
        clearTimeout(Dock._undoT);
        Dock._undoT = setTimeout(() => { if (Date.now() >= Dock.undoUntil) { Dock.undoUntil = 0; try { Dock.draw(); } catch (e) {} } }, 10200);
        }
      }
    } catch (e) {
      if (!mine()) return;
      thread({ role: 'ai', kind: 'err', text: e.message || 'That did not work.', retry: it.kind === 'ask' || it.kind === 'do' ? { mode: it.kind, text: it.kind === 'ask' ? it.text : text } : undefined });
      Dock.msg = e.message || 'That did not work.';
      Dock.bad = true;
      Dock.text = it.kind === 'ask' ? it.text : text; // keep what you typed so you can retry
    }
    Dock.busy = false;
    Dock.phase = '';
    Dock.directing = '';
    G.Store.saveSoon();
    if (it.kind !== 'do' || Dock.bad) Dock.draw(); else UI.render();
  };
  { // keep it in step with every redraw (cheap: only when something changed)
    const render0 = UI.render;
    UI.render = function () {
      const r = render0.apply(this, arguments);
      try { Dock.draw(); } catch (e) {}
      return r;
    };
  }
  setTimeout(() => { try { Dock.draw(); } catch (e) {} }, 0);
  document.addEventListener('keydown', (e) => {
    if (!G.S || !document.body.classList.contains('ingame')) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
    if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') { e.preventDefault(); Dock.setOpen(true); }
    else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); Dock.setOpen(true); }
  });

  // a profile's "Ask about …": the Director opens and answers about that person (one tap)
  A.askAbout = (d) => {
    const n = G.S.npcs[d.id];
    if (!n) return;
    UI.closeModal();
    Dock.setOpen(true);
    const q = `what does ${n.name} think of me, who do they trust, and what are they up to right now?`;
    const t = document.querySelector('#stdock textarea');
    if (t) t.value = q;
    Dock.text = q;
    return Dock.send('ask');
  };

  // Enter in the command line runs it
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.id === 'admincmd' && e.key === 'Enter') {
      e.preventDefault();
      A.adminRun();
    }
  });
})(window.G);
