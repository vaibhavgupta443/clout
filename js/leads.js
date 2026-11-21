/* Clout — NEW PEOPLE: how somebody joins the story when the world is only your main characters.
   Nobody new appears by themselves. A stranger from the wider town can only REACH you, for a real reason: they heard a rumour, saw one of your posts
   travelling, or heard about something that happened. They reach you as a DM request (the "👋 New people" card on Home and Messages) or as a comment under
   your newest post. They are not part of the cast yet. Only if YOU answer them (in the card, or by replying to their comment) do they join as a full
   character: a real profile, memories of how they heard about you, a DM thread with your reply, and the rumour they carried. Ignore them and they fade
   after two game days. Free, no AI call. */
(function (G) {
  'use strict';
  const U = G.U;
  const E = G.Engine;
  const UI = G.UI;
  const A = UI.acts;
  const Leads = (G.Leads = { EVERY: 360, TTL: 2880, MAX: 2 });
  const esc = U.esc;
  const clip = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));
  const first = (s) => String(s || '').split(' ')[0];
  const pick = (l, r) => l[Math.floor(r() * l.length) % l.length];
  const rand = () => (G.World && G.World.rnd ? G.World.rnd() : Math.random());
  const enabled = () => G.settings.leads !== false;

  Leads.list = (status = 'new') => ((G.S && G.S.leads) || []).filter((l) => l.status === status);

  // a stranger never brings up somebody's distress as a hook ("saw your post about your mom!" is creepy): anything even slightly delicate is not a reason
  const delicate = (t) => !!G.Mind && G.Mind.read(String(t || '')).sens >= 0.3;
  // a real reason for a stranger to reach out
  const reasons = () => {
    const S = G.S;
    const out = [];
    (S.rumors || []).slice(-6).forEach((r) => {
      const spread = Object.keys(r.belief || {}).length;
      if (!r.text || spread < 2 || delicate(r.text)) return;
      const about = r.about === 'me' ? 'me' : S.npcs[r.about] ? r.about : null;
      if (about === 'me') out.push({ w: 2 + spread / 3, rumor: r.id, line: (q) => pick([`hey, sorry to bother you. I heard "${q}" about you from a friend of a friend. is it true?`, `I do not know you but everyone is saying "${q}". is that real?`], rand), q: clip(r.text, 70) });
      else if (about) out.push({ w: 1.2 + spread / 4, rumor: r.id, line: (q) => `I do not know you, but I heard "${q}". you know ${first(S.npcs[about].name)}, right? is it true?`, q: clip(r.text, 70) });
    });
    const mine = S.postOrder.slice(-60).map((id) => S.posts[id]).filter((p) => p && p.author === 'me' && !p.replyTo && S.clock - p.t < 2880 && ((p.stats && p.stats.views) || 0) > 150 && !delicate(p.text)).slice(-1)[0];
    if (mine) out.push({ w: 1.4, post: mine.id, line: (q) => `I saw "${q}" going around. who are you really? 👀`, q: clip(mine.text, 60) });
    const ev = (S.chronicle || []).filter((c) => !(G.Channels && G.Channels.isMeta(c)) && S.clock - c.t < 2880 && !/joined|arrived/i.test(c.text) && !delicate(c.text)).slice(-1)[0];
    if (ev) out.push({ w: 1, line: (q) => `is it true that "${q}"? everyone in my part of town is talking about it`, q: clip(ev.text, 80) });
    return out;
  };

  Leads.make = function (reason, via) {
    const S = G.S;
    const Pop = G.Pop;
    let idx = -1;
    let p;
    {
      if (!Pop || !(Pop.size() > 0)) return null;
      const used = new Set((S.leads || []).map((l) => l.idx));
      for (let i = 0; i < 12; i++) {
        const c = Math.floor(rand() * Pop.size());
        if (!used.has(c) && !(S.popMet && S.popMet[c])) { idx = c; break; }
      }
      if (idx < 0) return null;
      p = Pop.person(idx);
      if (!(p.age >= 18)) return null;
    }
    const text = reason.line(reason.q);
    // the line passes the same gate as everything else (a stranger is not close: no care, no jokes, no third-person self) and never touches a delicate moment
    if (G.Mind && (delicate(text) || !G.Mind.vet({ name: p.name, id: 'lead' }, text, { kind: 'dm', about: '', rel: { c: 0.05, h: 0 } }).ok)) return null;
    const lead = {
      id: 'ld' + (S.counters.lead = (S.counters.lead || 0) + 1), idx, name: p.name, handle: p.handle, age: p.age, job: p.job, bio: p.bio,
      via, rumor: reason.rumor || null, post: reason.post || null, why: reason.q, text, t: S.clock, status: 'new',
    };
    (S.leads = S.leads || []).push(lead);
    if (via === 'comment') {
      const post = S.posts[reason.post] || S.postOrder.slice(-40).map((id) => S.posts[id]).filter((x) => x && x.author === 'me' && !x.replyTo).slice(-1)[0];
      if (post) {
        const c = E.addPost({ author: 'crowd', text: lead.text, replyTo: post.id, crowd: { name: p.name, handle: p.handle, stance: 'curious', lead: lead.id }, stats: { likes: 1 + Math.floor(rand() * 8), reposts: 0, replies: 0, views: 30 } });
        lead.comment = c.id;
      } else lead.via = 'dm';
    }
    try { E.addNotif('event', `👋 ${p.name} heard about you and ${lead.via === 'dm' ? 'wrote to you' : 'commented on your post'}`, { act: 'leadOpen', data: { id: lead.id } }); } catch (e) {}
    return lead;
  };

  // from time to time a stranger hears about you (only when there is a real reason)
  Leads.tick = function () {
    const S = G.S;
    if (!S || !enabled()) return null;
    const pend = Leads.list('new');
    pend.forEach((l) => { if (S.clock - l.t > Leads.TTL) { l.status = 'expired'; } });
    if (Leads.list('new').length >= Leads.MAX) return null;
    if (S.leadT != null && S.clock - S.leadT < Leads.EVERY) return null;
    S.leadT = S.clock;
    if (rand() > 0.7) return null;
    const rs = reasons();
    if (!rs.length) return null;
    const total = rs.reduce((a, r) => a + r.w, 0);
    let x = rand() * total;
    let reason = rs[0];
    for (const r of rs) { x -= r.w; if (x <= 0) { reason = r; break; } }
    const lead = Leads.make(reason, rand() < 0.5 && reason.post ? 'comment' : rand() < 0.5 ? 'comment' : 'dm');
    if (lead) G.Store.saveSoon();
    return lead;
  };
  { const tick0 = E.tick; E.tick = function () { const r = tick0.apply(this, arguments); try { Leads.tick(); } catch (e) {} return r; }; }

  // you answered: they become a full member of the cast
  Leads.join = function (id, text, how) {
    const S = G.S;
    const lead = (S.leads || []).find((l) => l.id === id);
    if (!lead || lead.status !== 'new') return null;
    text = String(text || '').trim().slice(0, 400);
    if (!text) throw Object.assign(new Error('Write them an answer first.'), { user: true });
    const n = G.Pop.meet(lead.idx, { role: 'local' });
    if (!n) return null;
    lead.status = 'joined';
    lead.npc = n.id;
    n.status = 'acquaintance';
    n.aff = Math.max(n.aff || 0, 8);
    n.trust = Math.max(typeof n.trust === 'number' ? n.trust : 0, 30);
    n.touched = S.clock;
    n.joined = { t: S.clock, via: lead.via, why: lead.why };
    const r = lead.rumor && (S.rumors || []).find((x) => x.id === lead.rumor);
    if (r) { r.belief = r.belief || {}; r.belief[n.id] = Math.max(r.belief[n.id] || 0, 0.6); }
    S.dms[n.id] = (S.dms[n.id] || []).concat([{ id: U.uid('m'), from: n.id, text: lead.text, t: lead.t, read: true }, { id: U.uid('m'), from: 'me', text, t: S.clock, read: true }]);
    try { G.Mem.add(n, { kind: 'dm', text: `I reached out to ${S.player.name} because ${r ? 'I heard "' + clip(r.text, 60) + '"' : 'I heard about them: "' + clip(lead.why, 60) + '"'}. They answered me: "${clip(text, 70)}"`, who: ['me'], imp: 6, valence: 0.2 }); } catch (e) {}
    try { if (G.Goals && G.Goals.assign) G.Goals.assign(n, S.clock); } catch (e) {}
    // they answer back a little later, in their own voice (the rest comes from the normal reasons to message you)
    const line = pick(['ok, that makes more sense. thanks for actually answering me', 'did not expect you to reply 😅 thank you. I am new around here', 'honestly I was not sure you would answer. I am glad you did'], rand);
    let reply = line;
    try { reply = G.Voice.stylize(line, n, rand, { short: true }); } catch (e) {}
    S.dms[n.id].push({ id: U.uid('m'), from: n.id, text: reply, t: S.clock + 4, read: false });
    try { E.addChron(`${n.name} joined the story after reaching out to ${S.player.name}`); } catch (e) {}
    try { E.addNotif('event', `🎉 ${n.name} joined your story`, { npcId: n.id }); } catch (e) {}
    G.Store.saveSoon();
    return n;
  };
  Leads.ignore = function (id) {
    const lead = ((G.S && G.S.leads) || []).find((l) => l.id === id);
    if (lead && lead.status === 'new') { lead.status = 'ignored'; G.Store.saveSoon(); }
    return lead;
  };

  // replying to their comment under your post also counts as answering
  {
    const speak0 = E.speak;
    E.speak = function (o) {
      const par = o && o.mode === 'reply' && G.S && G.S.posts[o.replyTo];
      const lid = par && par.crowd && par.crowd.lead;
      const text = o && o.text;
      const p = speak0.apply(this, arguments);
      if (lid) Promise.resolve(p).then((r) => { if (r !== false && r != null) { try { Leads.join(lid, text, 'comment'); UI.render(); } catch (e) {} } }, () => {});
      return p;
    };
  }

  /* ---------- the card ---------- */
  Leads.strip = function () {
    const S = G.S;
    if (!S || !enabled()) return '';
    const items = Leads.list('new');
    if (!items.length) return '';
    return `<div class="card leadcard"><b>👋 New people</b><div class="muted small">They are not in your story yet. Answer one and they join the cast. Ignore them and they fade.</div>${items.map((l) => `<div class="leadrow"><div class="row"><span class="leadav">${esc(first(l.name).slice(0, 1))}</span><div class="grow"><b>${esc(l.name)}</b> <span class="muted small">${esc(l.handle)} · ${l.age} · ${esc(l.job || '')}</span><div class="muted small">${l.via === 'comment' ? 'commented on your post' : 'wrote to you'}</div></div></div><div class="leadmsg">${esc(l.text)}</div><div class="row" style="gap:6px;margin-top:6px"><input id="ldr_${l.id}" class="grow" maxlength="400" placeholder="Answer ${esc(first(l.name))}…"><button class="btn sm primary" data-act="leadReply" data-id="${l.id}">Reply</button><button class="btn sm" data-act="leadIgnore" data-id="${l.id}">Ignore</button></div></div>`).join('')}</div>`;
  };
  A.leadReply = (d) => {
    const el = document.querySelector('#ldr_' + d.id);
    try {
      const n = Leads.join(d.id, el ? el.value : '', 'dm');
      if (n) { UI.toast(`🎉 ${n.name} joined your story. Their chat is in Messages.`, 'good'); UI.render(); }
    } catch (e) { UI.toast(e.message, 'bad'); }
  };
  A.leadIgnore = (d) => { Leads.ignore(d.id); UI.render(); };
  A.leadOpen = () => { UI.go('home'); UI.render(); setTimeout(() => { const c = document.querySelector('.leadcard'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'center' }); }, 50); };
})(window.G);
