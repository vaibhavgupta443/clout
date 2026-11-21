/* Clout — SUGGESTIONS: the world proposes, you approve.
   NPCs never post on their own (your rule), but a quiet world feels dead. So while time passes the world quietly PREPARES things that would really happen,
   from what is going on (a character's goal, a rumour they heard, a storyline they are in, their mood and the time of day), and lines them up as
   suggestions: a post, a story, a reply under someone's post, a rumour being passed on. Nothing happens until you tick it (the same per-item approval card as
   the Director). Free: no AI, no credits.
   The floating ✨ button gives quick access: review suggestions, make some posts now, stir drama, start a rumour of your own, ask the Director, open the clock. */
(function (G) {
  'use strict';
  const U = G.U;
  const UI = G.UI;
  const E = G.Engine;
  const W = G.World;
  const P = G.Pages;
  const A = UI.acts;
  const { esc } = U;
  const Pi = (G.Pitches = { open: false });
  const clip = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));
  const first = (s) => String(s || '').split(' ')[0];
  const rand = () => (W && W.rnd ? W.rnd() : Math.random());
  const pick = (l, r = rand) => l[Math.floor(r() * l.length) % l.length];
  const style = (n, t, r) => { try { return G.Voice.stylize(t, n, r, { short: true }); } catch (e) { return t; } };
  // common sense (js/mind.js): who a rumour is about (they are never told it as news, nor do they pass it on), and one claim per pair per person
  const people = (r) => (G.Channels && G.Channels.rumorPeople ? G.Channels.rumorPeople(r) : [r.about].filter(Boolean));
  const pairOf = (r) => (G.Channels && G.Channels.pairKey ? G.Channels.pairKey(people(r)) : '');
  const sens = (t) => (G.Mind ? G.Mind.read(t).sens : 0);
  const contradicts = (n, ru) => {
    const k = pairOf(ru);
    return !!k && (G.S.rumors || []).some((x) => x !== ru && pairOf(x) === k && (x.path || []).some((h) => h.from === n.id));
  };
  Pi.queue = () => G.S.pitches || []; // (reading never creates the key: a lazily-made key would make a reloaded world differ from the saved one)
  const hourOf = (t) => (((t % 1440) + 1440) % 1440) / 60;

  /* ---------- what a character would say, and why ---------- */
  const GOAL_LINES = [
    [/apology/, ['funny how some people never say sorry', 'still waiting on an honest apology. no rush. (there is a rush)']],
    [/one over|outdo/, ['working on something. you will see it soon', 'new project coming. some people should take notes']],
    [/confront/, ['we need to talk. you know who you are', 'some conversations cannot wait any longer']],
    [/avoid|win them back/, ['moving on. growth is quiet', 'some chapters close. some do not. still deciding']],
    [/closer|spend time|catch up/, ['good company makes the whole day', 'missing certain people lately', 'some people are worth the effort']],
    [/work/, ['back to work. no distractions today', 'head down, phone away']],
    [/something new/, ['trying something new today. wish me luck', 'new day, new thing, no plan']],
    [/drama|calm/, ['deep breaths. one thing at a time', 'staying out of it today. peace is underrated']],
  ];
  Pi.postText = function (n, r) {
    const S = G.S;
    const mood = (n.psy && n.psy.mood && n.psy.mood.v) || 0;
    const h = hourOf(S.clock);
    const opts = [];
    if (n.goal && n.goal.text) {
      const hit = GOAL_LINES.find(([re]) => re.test(n.goal.text));
      if (hit) opts.push({ text: pick(hit[1], r), why: 'wants to ' + clip(n.goal.text, 50), w: 2.2 });
      else if (n.goal.kind === 'plot') opts.push({ text: `thinking about "${clip(n.goal.text.replace(/^see |through$/g, '').replace(/"/g, ''), 40)}" more than I should`, why: n.goal.text, w: 1.6 });
    }
    const rum = (S.rumors || []).find((x) => !(G.Channels && G.Channels.isMeta(x)) && x.about !== n.id && x.belief && x.belief[n.id] >= 0.5 && x.about !== 'me' && !people(x).includes(n.id) && sens(x.text) < 0.5 && !contradicts(n, x));
    if (rum) opts.push({ text: `funny how "${clip(rum.text, 50)}" is everywhere now`, why: 'heard the rumour', w: 1.4 });
    const generic = mood < -0.3 ? ['tired of pretending everything is fine', 'rough week. not looking for advice, just saying it'] : mood > 0.3 ? ['good day. no notes', 'feeling lucky today ✨'] : h < 11 ? ['coffee first. then everything else ☕', 'morning. already behind'] : h < 17 ? ['lunch break thoughts: none, just lunch', 'productive. (almost)'] : h < 22 ? ['golden hour hits different tonight', 'long day. good dinner. that is the post'] : ['cannot sleep, replaying today', 'late night, loud thoughts'];
    opts.push({ text: pick(generic, r), why: mood < -0.3 ? 'has been feeling low' : mood > 0.3 ? 'is in a good mood' : 'a quiet moment', w: 1 });
    let x = r() * opts.reduce((a, o) => a + o.w, 0);
    for (const o of opts) { x -= o.w; if (x <= 0) return o; }
    return opts[0];
  };
  const STORY_LINES = { low: ['not today 🌧', 'needed this walk'], high: ['best coffee of my life ☕', 'this view though 🌅'], morning: ['first coffee ☕', 'new day'], day: ['out and about', 'busy one today'], evening: ['golden hour 🌇', 'dinner plans'], night: ['late night thoughts 🌙', 'cannot sleep'] };
  Pi.storyText = function (n, r) {
    const mood = (n.psy && n.psy.mood && n.psy.mood.v) || 0;
    const h = hourOf(G.S.clock);
    const k = mood < -0.3 ? 'low' : mood > 0.4 ? 'high' : h < 11 ? 'morning' : h < 17 ? 'day' : h < 22 ? 'evening' : 'night';
    return { text: pick(STORY_LINES[k], r), why: k === 'low' ? 'has been feeling low' : k === 'high' ? 'is in a good mood' : 'a normal moment' };
  };
  const stanceFor = (n, author) => {
    const st = n.status;
    if (['rival', 'enemy', 'nemesis', 'frenemy'].includes(st)) return pick(['critique', 'tease']);
    if (['friend', 'close_friend', 'best_friend', 'ally', 'dating', 'partner', 'stan'].includes(st)) return pick(['cheer', 'agree', 'relate']);
    return pick(['curious', 'cheer', 'agree']);
  };

  // one suggestion (or null when there is nothing real to suggest)
  Pi.make = function (kind, n, r) {
    const S = G.S;
    const id = U.uid('pt');
    const speakable = (t) => !G.Mind || G.Mind.vet(n, t, { kind: 'post', rel: {} }).ok; // no third-person self, no flippancy about a delicate thing
    if (kind === 'post') { const x = Pi.postText(n, r); const text = style(n, x.text, r); if (!speakable(text)) return null; return { id, kind, npc: n.id, text, why: x.why, label: `💬 ${n.name} posts: “${clip(text, 110)}”` }; }
    if (kind === 'story') { const x = Pi.storyText(n, r); const text = style(n, x.text, r); if (!speakable(text)) return null; return { id, kind, npc: n.id, text, why: x.why, label: `📸 ${n.name} shares a story: “${text}”` }; }
    if (kind === 'reply') {
      const posts = S.postOrder.slice(-40).map((pid) => S.posts[pid]).filter((p) => p && !p.replyTo && p.author !== n.id && p.author !== 'crowd' && S.clock - p.t < 4320);
      if (!posts.length) return null;
      const post = pick(posts, r);
      const au = post.author === 'me' ? S.player : S.npcs[post.author];
      if (!au) return null;
      let text;
      try { text = G.Voice.comment(n, stanceFor(n, post.author), { rnd: r, post, authorName: au.name, authorHandle: au.handle }); } catch (e) {}
      if (G.Mind) {
        let rel = {};
        try { rel = G.React.relation(S, n, post.author); } catch (e) {}
        if (sens(post.text) >= 0.5) text = G.Mind.respond(n, { about: post.text, rel, to: first(au.name), rnd: r }); // a delicate post gets care or nothing
        else if (text && !G.Mind.vet(n, text, { kind: 'comment', about: post.text, aboutAuthor: post.author, rel }).ok) text = null;
      }
      if (!text) return null;
      return { id, kind, npc: n.id, post: post.id, text, why: 'reacting to ' + first(au.name) + "'s post", label: `💬 ${n.name} replies to ${au.name}: “${clip(text, 100)}”` };
    }
    if (kind === 'rumor') {
      const ru = (S.rumors || []).find((x) => x.belief && x.belief[n.id] >= 0.6 && !people(x).includes(n.id) && sens(x.text) < 0.5 && !contradicts(n, x));
      if (!ru) return null;
      const near = Object.values(S.npcs).filter((o) => !o.userAlt && !o.blocked && o.id !== n.id && !people(ru).includes(o.id) && !(ru.belief[o.id] >= 0.4)).sort((a, b) => b.aff - a.aff).slice(0, 3);
      if (!near.length) return null;
      return { id, kind, npc: n.id, rumor: ru.id, to: near.map((o) => o.id), why: 'believes it', label: `🗣 ${n.name} passes on “${clip(ru.text, 60)}” to ${near.map((o) => first(o.name)).join(', ')}` };
    }
    return null;
  };

  /* ---------- making and keeping a few ---------- */
  Pi.generate = function (opts = {}) {
    const S = G.S;
    const r = rand;
    const q = S.pitches || (S.pitches = []);
    const kinds = opts.kinds || ['post', 'post', 'story', 'reply', 'rumor'];
    const people = Object.values(S.npcs).filter((n) => !n.userAlt && !n.blocked && !n.muted).sort((a, b) => (b.touched || 0) - (a.touched || 0)).slice(0, 24);
    if (!people.length) return [];
    const seen = new Set(S.pitchSeen || []);
    const made = [];
    for (let i = 0; i < (opts.count || 4) && q.length < 8; i++) {
      const kind = pick(kinds, r);
      // the more outgoing, and the more they want something, the likelier they are to be the one
      const cand = people.map((n) => [n, (0.3 + ((n.psy && n.psy.t && n.psy.t.E) || 50) / 100 + (n.goal ? 0.6 : 0)) * r()]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
      for (const n of cand.slice(0, 6)) {
        if (q.some((p) => p.npc === n.id && p.kind === kind)) continue;
        const p = Pi.make(kind, n, r);
        if (!p) continue;
        const key = p.kind + '|' + (p.text || p.rumor || '');
        if (seen.has(key)) continue;
        p.t = S.clock;
        q.push(p);
        made.push(p);
        break;
      }
    }
    return made;
  };
  // while the world runs and nothing is waiting for you, it keeps a few ideas ready
  Pi.tick = function () {
    const S = G.S;
    if (!S || G.settings.suggestions === false) return 0;
    const q = Pi.queue();
    const stale = S.clock - 2880;
    if (q.length) S.pitches = q.filter((p) => p.t > stale); // an idea two game days old is no longer news
    if (S.pitchT != null && S.clock - S.pitchT < 120) return 0;
    S.pitchT = S.clock;
    if (q.length >= 3) return 0;
    const made = Pi.generate({ count: 2 });
    if (made.length) {
      try { E.addNotif('event', `✨ ${made.length} new suggestion${made.length > 1 ? 's' : ''} for you to approve`, { act: 'pitchOpen' }); } catch (e) {}
      G.Store.saveSoon();
    }
    return made.length;
  };
  if (E && E.tick) {
    const tick0 = E.tick;
    E.tick = function () {
      const r = tick0.apply(this, arguments);
      try { Pi.tick(); } catch (e) {}
      return r;
    };
  }

  /* ---------- doing one (only ever after you approved it) ---------- */
  Pi.apply = function (p) {
    const S = G.S;
    const n = S.npcs[p.npc];
    if (!n) return false;
    if (p.kind === 'post' || p.kind === 'reply') {
      const post = E.addPost({ author: n.id, text: p.text, replyTo: p.kind === 'reply' ? p.post : null, buzz: 3, stats: E.npcStats(n, 3) }, S);
      if (p.kind === 'reply' && S.posts[p.post]) { const par = S.posts[p.post]; par.stats.replies = (par.stats.replies || 0) + 1; if (par.author === 'me') E.addNotif('reply', `${n.name} replied: "${clip(p.text, 80)}"`, { npcId: n.id, postId: post.id }); }
      n.touched = S.clock;
      try { G.Mem.add(n, { kind: p.kind === 'reply' ? 'comment' : 'post', text: `I ${p.kind === 'reply' ? 'replied' : 'posted'}: "${clip(p.text, 70)}"`, who: [], imp: 2 }); } catch (e) {}
      return true;
    }
    if (p.kind === 'story') {
      S.stories = S.stories || [];
      S.stories.push({ id: 'st' + (S.counters.story_n = (S.counters.story_n || 1) + 1), author: n.id, t: S.clock, exp: S.clock + 1440, kind: 'npc', text: p.text, scene: G.Lex.sceneFor(['default'], p.text), poll: null, views: [], seen: false, rx: {} });
      if (S.stories.length > 220) S.stories.splice(0, S.stories.length - 220);
      n.touched = S.clock;
      return true;
    }
    if (p.kind === 'rumor') {
      const ru = (S.rumors || []).find((x) => x.id === p.rumor);
      if (!ru) return false;
      (p.to || []).filter((id) => !people(ru).includes(id)).forEach((id) => { ru.belief[id] = Math.max(ru.belief[id] || 0, 0.55); ru.path.push({ from: n.id, to: id, t: S.clock, confidence: 0.55, channel: 'told' }); });
      return true;
    }
    return false;
  };
  // the same per-item card as the Director: tick what you want, the rest is dismissed
  Pi.review = async function () {
    const S = G.S;
    const q = Pi.queue().slice();
    if (!q.length) { UI.toast('Nothing to suggest right now. Try “Make some posts”.', 'info'); return { made: 0 }; }
    const items = q.map((p, i) => ({ id: 'pt:' + p.id, group: 'pt', idx: i, deps: [], label: p.label + (p.why ? ` (${p.why})` : '') }));
    const Story = E.Story;
    let picked = items.map((i) => i.id);
    if (Story && typeof Story.approver === 'function') {
      const dec = await Story.approver({ text: 'Suggestions', cost: 0, lines: items.map((i) => i.label), items });
      picked = Array.isArray(dec) ? dec : dec ? picked : [];
    }
    S.pitches = Pi.queue().filter((p) => !q.some((x) => x.id === p.id)); // everything shown is dealt with: done or dismissed
    S.pitchSeen = (S.pitchSeen || []).concat(q.map((p) => p.kind + '|' + (p.text || p.rumor || ''))).slice(-60);
    const todo = q.filter((p) => picked.includes('pt:' + p.id));
    if (!todo.length) { G.Store.saveSoon(); UI.render(); return { made: 0 }; }
    let made = 0;
    await E.guarded('✨ Doing what you approved…', async () => { todo.forEach((p) => { if (Pi.apply(p)) made++; }); E.tick(5); return true; }, () => Pi.review());
    UI.toast(`✨ ${made} thing${made === 1 ? '' : 's'} happened. ↩ Undo is in the Director bar.`, 'good');
    if (G.Live && G.Live.markSeen) { /* the new posts are at the top of Latest */ }
    return { made };
  };

  /* ---------- a rumour of your own ---------- */
  Pi.rumour = function (o) {
    const S = G.S;
    const text = String(o.text || '').trim().slice(0, 200);
    if (!text) throw Object.assign(new Error('Tell me the rumour first.'), { user: true });
    const starter = S.npcs[o.by] || Object.values(S.npcs).filter((n) => !n.userAlt && !n.blocked).sort((a, b) => ((b.psy && b.psy.t && b.psy.t.E) || 0) - ((a.psy && a.psy.t && a.psy.t.E) || 0))[0];
    if (!starter) throw Object.assign(new Error('Nobody to start it.'), { user: true });
    const about = o.about === 'me' || S.npcs[o.about] ? o.about : starter.id;
    const reach = { whisper: 2, spread: 5, everywhere: 12 }[o.reach] || 5;
    const r = W.startRumor(text, about, [starter.id], false);
    const named = people(r);
    const close = Object.values(S.npcs).filter((n) => !n.userAlt && !n.blocked && n.id !== starter.id && n.id !== about && !named.includes(n.id)).sort((a, b) => b.aff - a.aff + (Math.random() - 0.5) * 30).slice(0, reach);
    close.forEach((n) => { r.belief[n.id] = Math.round((0.4 + Math.random() * 0.35) * 100) / 100; r.path.push({ from: starter.id, to: n.id, t: S.clock, confidence: r.belief[n.id], channel: 'told' }); });
    try { G.Mem.add(starter, { kind: 'rumor', text: `I started telling people: "${clip(text, 70)}"`, who: about === 'me' ? ['me'] : [about], imp: 5 }); } catch (e) {}
    return { rumor: r, starter, told: close.length };
  };
  Pi.rumourModal = function () {
    const S = G.S;
    const ppl = Object.values(S.npcs).filter((n) => !n.userAlt && !n.blocked).sort((a, b) => (b.touched || 0) - (a.touched || 0)).slice(0, 40);
    UI.modal(`<button class="close" data-act="closeModal">✕</button><h3>🗣 Start a rumour</h3>
      <p class="muted small">You tell the world what is being whispered. It spreads like any rumour: people believe it to different degrees, ask about it in DMs, and argue about it in the channels.</p>
      <label>The rumour</label><textarea id="ru_text" rows="2" maxlength="200" placeholder="Kai is secretly leaving the label"></textarea>
      <label>It is about</label><select id="ru_about"><option value="">(whoever starts it)</option><option value="me">${esc(S.player.name)} (you)</option>${ppl.map((n) => `<option value="${n.id}">${esc(n.name)}</option>`).join('')}</select>
      <label>Who starts telling people</label><select id="ru_by"><option value="">(the most talkative person)</option>${ppl.map((n) => `<option value="${n.id}">${esc(n.name)}</option>`).join('')}</select>
      <label>How far does it get at first</label><select id="ru_reach"><option value="whisper">A whisper (2 people)</option><option value="spread" selected>It spreads (5 people)</option><option value="everywhere">Everywhere (12 people)</option></select>
      <div class="row" style="margin-top:10px;gap:8px"><button class="btn primary" data-act="rumourGo">🗣 Start it</button></div>`);
  };
  A.rumourGo = async () => {
    const v = (id) => (document.querySelector(id) || {}).value || '';
    try {
      let res;
      await E.guarded('🗣 Starting the rumour…', async () => { res = Pi.rumour({ text: v('#ru_text'), about: v('#ru_about'), by: v('#ru_by'), reach: v('#ru_reach') }); return true; }, () => A.rumourGo());
      UI.closeModal();
      if (res) UI.toast(`🗣 ${res.starter.name} started it and told ${res.told} people.`, 'good');
    } catch (e) {
      UI.toast(e.message, 'bad');
    }
  };

  /* ---------- Home: what is going on around town (so the page is never just empty) ---------- */
  Pi.strip = function () {
    const S = G.S;
    const lines = [];
    (S.chronicle || []).filter((c) => !(G.Channels && G.Channels.isMeta(c))).slice(-3).reverse().forEach((c) => lines.push({ t: c.t, icon: '📖', text: c.text }));
    (S.channels || []).forEach((c) => c.msgs.slice(-2).forEach((m) => { if (m.from !== 'me' && S.npcs[m.from]) lines.push({ t: m.t, icon: '📣', text: `#${c.name} · ${first(S.npcs[m.from].name)}: ${m.text}` }); }));
    (S.rumors || []).slice(-1).forEach((r) => lines.push({ t: r.t, icon: '🗣', text: 'A rumour is going around: ' + clip(r.text, 80) }));
    lines.sort((a, b) => b.t - a.t);
    const n = Pi.queue().length;
    if (!lines.length && !n) return '';
    return `<div class="card townstrip"><div class="row between"><b>🌍 Around town</b>${n ? `<button class="btn sm primary" data-act="pitchOpen">✨ ${n} suggestion${n > 1 ? 's' : ''} for you</button>` : '<button class="btn sm" data-act="pitchPosts">✨ Make some posts</button>'}</div>${lines.slice(0, 4).map((x) => `<div class="small" style="margin:5px 0">${x.icon} <span class="muted">${U.ago(S.clock, x.t)}</span> ${esc(clip(x.text, 130))}</div>`).join('') || '<div class="small muted">All quiet. ✨ has ideas whenever you want some life.</div>'}</div>`;
  };

  /* ---------- the floating ✨ button ---------- */
  A.pitchOpen = () => { Pi.open = false; Pi.draw(); return Pi.review(); };
  A.pitchPosts = async () => { Pi.open = false; Pi.draw(); Pi.generate({ count: 4, kinds: ['post', 'post', 'story'] }); return Pi.review(); };
  A.pitchStories = async () => { Pi.open = false; Pi.draw(); Pi.generate({ count: 3, kinds: ['story'] }); return Pi.review(); };
  A.pitchDrama = async () => { Pi.open = false; Pi.draw(); Pi.generate({ count: 4, kinds: ['reply', 'reply', 'rumor'] }); return Pi.review(); };
  A.rumourModal = () => { Pi.open = false; Pi.draw(); Pi.rumourModal(); };
  const MENU = [
    ['new', '✍️', 'New post', () => 'write something'],
    ['sug', '✨', 'Suggestions', (n) => (n ? `${n} waiting` : 'none yet')],
    ['posts', '✍️', 'Make some posts', () => 'they post, you approve'],
    ['stories', '📸', 'Add some stories', () => 'a few 24-hour stories'],
    ['drama', '🔥', 'Stir some drama', () => 'replies and gossip'],
    ['rumour', '🗣', 'Start a rumour…', () => 'you tell it'],
    ['direct', '🎬', 'Ask the Director', () => 'or tell it what happens'],
    ['clock', '🕒', 'Clock & time', () => 'speed, meetings'],
  ];
  const fabEl = () => {
    let el = document.getElementById('fab');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fab';
      document.body.appendChild(el);
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-f]');
        if (!b) return;
        e.stopPropagation();
        const k = b.dataset.f;
        if (k === 'toggle') { Pi.open = !Pi.open; return Pi.draw(); }
        Pi.open = false;
        Pi.draw();
        if (k === 'new') A.create();
        else if (k === 'sug') A.pitchOpen();
        else if (k === 'posts') A.pitchPosts();
        else if (k === 'stories') A.pitchStories();
        else if (k === 'drama') A.pitchDrama();
        else if (k === 'rumour') A.rumourModal();
        else if (k === 'direct') (A.dockOpen ? A.dockOpen() : null);
        else if (k === 'clock') A.clockOpen && A.clockOpen();
      });
      document.addEventListener('click', (e) => { if (Pi.open && !e.target.closest('#fab')) { Pi.open = false; Pi.draw(); } });
    }
    return el;
  };
  Pi.draw = function () {
    const el = fabEl();
    const b = document.body;
    const show = !!G.S && b.classList.contains('ingame') && !b.classList.contains('modal-open') && !b.classList.contains('story-open') && !b.classList.contains('rp-full') && G.settings.fab !== false;
    el.hidden = !show;
    if (!show) return;
    const n = G.S ? Pi.queue().length : 0;
    const html = `<button class="fabbtn" data-f="toggle" aria-label="Quick actions" aria-expanded="${Pi.open}">${Pi.open ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'}${n && !Pi.open ? `<i class="fabbadge">${n}</i>` : ''}</button>${Pi.open ? `<div class="fabmenu" role="menu">${MENU.map(([k, ic, l, sub]) => `<button data-f="${k}" role="menuitem"><span class="fi">${ic}</span><span><b>${l}</b><span class="muted small">${esc(sub(n))}</span></span></button>`).join('')}</div>` : ''}`;
    if (el.dataset.sig !== html) { el.innerHTML = html; el.dataset.sig = html; }
  };
  {
    const render0 = UI.render;
    UI.render = function () {
      const r = render0.apply(this, arguments);
      try { Pi.draw(); } catch (e) {}
      return r;
    };
  }
  setTimeout(() => { try { Pi.draw(); } catch (e) {} }, 0);
})(window.G);
