/* Clout — Public channels and story-aware reactions.
   The town talks: in a few public channels (#town-talk, #love-lives, #the-drama, #fans, #news) the characters discuss what is REALLY going on in this story:
   events, rumours, storylines, feuds and romances, and what you posted. People are curious ("wait, what happened with Kai and Mia?"), gossip, defend
   each other and answer one another. Everything is grounded in real facts from the world (never filler), it costs nothing (templates + facts), and it
   never touches the feed (these are chat channels, not posts). What people say is remembered by them and heard by the person it is about.
   On demand, "✨ Spark drama with AI" asks the model for richer messages (shown to you for approval first).
   The same story facts make ordinary comments under posts curious and in-story instead of generic (see Ch.storyComment). */
(function (G) {
  'use strict';
  const U = G.U;
  const UI = G.UI;
  const E = G.Engine;
  const P = G.Pages;
  const A = UI.acts;
  const { esc } = U;
  const Ch = (G.Channels = {});
  const clip = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));
  const first = (s) => String(s || '').split(' ')[0];
  const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length) % arr.length];
  const rand = () => (G.World && G.World.rnd ? G.World.rnd() : Math.random());

  Ch.DEFAULTS = [
    { id: 'town-talk', name: 'town-talk', icon: '🗣', about: 'Everything people are talking about', kinds: ['event', 'rumor', 'pair', 'plot', 'post'] },
    { id: 'love-lives', name: 'love-lives', icon: '💘', about: 'Crushes, couples, exes and who is texting who', kinds: ['pair', 'post'], pairTypes: ['dating', 'partner', 'crush', 'ex', 'situationship', 'admirer'] },
    { id: 'theories', name: 'theories', icon: '🔎', about: 'Who did it? People share what they know, and point fingers', kinds: ['mystery'] },
    { id: 'the-drama', name: 'the-drama', icon: '🔥', about: 'Feuds, rumours and callouts', kinds: ['rumor', 'pair', 'event', 'mystery'], pairTypes: ['rival', 'enemy', 'nemesis', 'frenemy', 'ex'] },
    { id: 'fans', name: 'fans', icon: '📣', about: 'The people who follow you closely', kinds: ['post', 'event', 'plot'] },
    { id: 'news', name: 'news', icon: '📰', about: 'What is happening around town', kinds: ['event', 'plot'] },
  ];
  Ch.ensure = function () {
    const S = G.S;
    if (!S.channels) S.channels = Ch.DEFAULTS.map((d) => ({ id: d.id, name: d.name, icon: d.icon, about: d.about, msgs: [] }));
    Ch.DEFAULTS.forEach((d) => { if (!S.channels.some((c) => c.id === d.id)) S.channels.push({ id: d.id, name: d.name, icon: d.icon, about: d.about, msgs: [] }); }); // worlds from before get the new channels too
    return S.channels;
  };
  const def = (id) => Ch.DEFAULTS.find((d) => d.id === id) || Ch.DEFAULTS[0];
  const enabled = () => !!G.S && G.settings.channels !== false && !(G.World && G.World.feedRate && G.World.feedRate() === 0);
  const who = (id) => (id === 'me' ? G.S.player : G.S.npcs[id]);
  const name1 = (id) => first((who(id) || {}).name || 'someone');

  /* ---------- common sense (see js/mind.js): what is worth saying, who it is about, what is worth remembering ---------- */
  const rxq = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sensOf = (t) => (G.Mind ? G.Mind.read(t).sens : 0);
  // delicate = an illness, a death, a crisis (for anybody), or ANY heavy moment of the player's. A breakup between two characters is ordinary town gossip.
  const delicateKinds = (t) => !!G.Mind && G.Mind.read(t).kinds.some((k) => k === 'crisis' || k === 'grief' || k === 'health');
  const isDelicate = (raw, who) => !!G.Mind && (delicateKinds(raw) || ((who || []).includes('me') && G.Mind.read(raw).sens >= 0.5));
  const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const STOPW = new Set('this that the and for you your are was but not just so much very really exactly same yes yeah wait what why how who its it is be to of in on at me my we they them then than too all can did does do has had have been about with from here there'.split(' '));
  // how many words of actual content a line has (not counting @mentions, filler or emoji): "@Dex this. so much this" has none
  const substance = (text) => {
    const names = new Set(Object.values(G.S.npcs).map((o) => first(o.name).toLowerCase()).concat(first(G.S.player.name).toLowerCase()));
    return String(text || '').replace(/@\w+/g, ' ').replace(/[^a-z0-9' ]+/gi, ' ').toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !STOPW.has(w)).reduce((a, w) => a + (names.has(w) ? 2 : 1), 0); // (naming a person counts double)
  };
  // who a line names (first name or @handle): the only people it is really "about"
  const mentionIds = (text) => {
    const out = [];
    Object.values(G.S.npcs).forEach((o) => {
      if (o.userAlt || !o.name) return;
      const f = first(o.name);
      const h = String(o.handle || '').replace(/^@/, '');
      if ((f.length > 2 && new RegExp('(^|[^\\w])' + rxq(f) + '\\b', 'i').test(text)) || (h.length > 2 && new RegExp('@' + rxq(h) + '\\b', 'i').test(text))) out.push(o.id);
    });
    return out;
  };
  Ch.mentionIds = mentionIds;
  // game-meta chronicle lines ("Player reached level 4", "reached 100K") are not story: nobody gossips about them (tag meta/kind meta, or the old text for older saves)
  Ch.isMeta = (c) => !!c && (c.meta === true || c.kind === 'meta' || /(^|\W)(Player|You) reached level|reached \d+K/i.test(String(c.text || '')));
  // the people a rumour or event is about: the subject plus everyone its words name (so "Mia and Dex became friends" is about both)
  Ch.rumorPeople = (r) => {
    const S = G.S;
    const ids = [];
    if (r && r.about && (r.about === 'me' || S.npcs[r.about])) ids.push(r.about);
    mentionIds(String((r && r.text) || '')).forEach((id) => { if (!ids.includes(id)) ids.push(id); });
    if (r && r.text && String(r.text).toLowerCase().includes(first(S.player.name).toLowerCase()) && first(S.player.name).length > 2 && !ids.includes('me')) ids.push('me');
    return ids.slice(0, 3);
  };
  // two or more people = a pair: one claim about a pair at a time
  Ch.pairKey = (ids) => {
    const u = [...new Set((ids || []).filter(Boolean))];
    return u.length >= 2 ? u.sort().join('|') : '';
  };
  // the player's recent delicate posts, so no line can quote them back
  const delicateTexts = () => {
    const S = G.S;
    const out = [];
    S.postOrder.slice(-60).forEach((id) => { const p = S.posts[id]; if (p && p.author === 'me' && !p.replyTo && S.clock - p.t < 10080 && sensOf(p.text) >= 0.5) out.push(norm(p.text).slice(0, 24)); });
    return out.filter((x) => x.length >= 8);
  };
  // a rolling memory: ONE per tag (the newest wording replaces the older one, the strongest importance is kept), so chatter never floods npc.mem
  const remember = (npc, tag, o) => {
    const S = G.S;
    if (!G.Mem || !npc) return null;
    const i = (npc.mem || []).findIndex((x) => x.tags && x.tags[0] === tag);
    let imp = o.imp;
    if (i >= 0) { imp = Math.max(imp || 0, npc.mem[i].imp || 0); npc.mem.splice(i, 1); }
    return G.Mem.add(npc, Object.assign({}, o, { imp, tags: [tag] }));
  };
  const mentionPlayer = (t) => first(G.S.player.name).length > 2 && new RegExp('(^|[^\\w])@?' + rxq(first(G.S.player.name)) + '\\b', 'i').test(t);
  // is this line fit to be said? (the Mind gate plus: says something, never about itself in the third person, never the player's delicate moment)
  const lineOk = (c, o) => {
    o = o || {};
    const S = G.S;
    const text = String(c.text || '').trim();
    if (!text || !c.n) return false;
    const f = first(c.n.name);
    if (f.length > 2 && new RegExp('(^|[^@\\w])' + rxq(f) + '\\b', 'i').test(text)) return false; // never speaks of themself by name
    if (!G.Mind) return true;
    if (c.style !== 'care') {
      if (substance(text) < (o.min || 3)) return false; // "this. so much this" says nothing
      if (isDelicate(text, mentionPlayer(text) ? ['me'] : [])) return false;
      const low = norm(text);
      if (delicateTexts().some((d) => low.includes(d))) return false;
    }
    let rel = {};
    try { rel = G.React.relation(S, c.n, c.subject || 'me'); } catch (e) {}
    const v = G.Mind.vet(c.n, text, { kind: o.kind || 'channel', about: o.about != null ? o.about : (c.topic && (c.topic.raw || c.topic.text)) || '', aboutAuthor: o.aboutAuthor, thread: o.thread, allowGossip: o.allowGossip, rel });
    return !!v.ok;
  };

  /* ---------- what is really going on (public facts only) ---------- */
  Ch.topics = function () {
    const S = G.S;
    const out = [];
    const people = Object.values(S.npcs).filter((n) => !n.userAlt && !n.blocked);
    const mentions = (text) => people.filter((n) => text.toLowerCase().includes(first(n.name).toLowerCase()) && first(n.name).length > 2).map((n) => n.id).concat(text.toLowerCase().includes(first(S.player.name).toLowerCase()) ? ['me'] : []);
    // raw = the full words (never shown): a topic whose words are delicate (illness, grief, a crisis) is never gossiped about, only answered with care
    const add = (o, raw) => { o.raw = raw; if (isDelicate(raw, o.who)) o.delicate = true; out.push(o); };
    (S.chronicle || []).filter((c) => !Ch.isMeta(c)).slice(-8).forEach((c) => add({ kind: 'event', text: clip(c.text, 110), who: mentions(c.text).slice(0, 2), t: c.t, w: 1.2 }, c.text));
    (S.storylines || []).filter((x) => x.status !== 'resolved').slice(-4).forEach((x) => {
      const who = (x.participants || []).filter((id) => S.npcs[id]).slice(0, 2);
      add({ kind: 'plot', text: clip(x.title, 70), who, t: S.clock - 60, w: 1 + (x.heat || 0) / 80 }, x.title);
      if ((x.heat || 0) >= 35 && (x.participants || []).length >= 1) add({ kind: 'mystery', text: clip(x.title, 70), who, t: S.clock - 30, w: 1.3 + (x.heat || 0) / 70, sl: x }, x.title);
    });
    (S.rumors || []).slice(-5).forEach((r) => {
      const holders = Object.keys(r.belief || {}).filter((id) => r.belief[id] >= 0.35);
      if (holders.length >= 1 && r.text && !Ch.isMeta(r)) add({ kind: 'rumor', text: clip(r.text, 100), who: Ch.rumorPeople(r), t: r.t != null ? r.t : S.clock - 120, w: 1.3, kb: r.sw ? holders : undefined }, r.text);
    });
    (S.npcRel || []).filter((r) => S.npcs[r.a] && S.npcs[r.b] && !S.npcs[r.a].userAlt && !S.npcs[r.b].userAlt && ['dating', 'partner', 'crush', 'ex', 'rival', 'enemy', 'nemesis', 'frenemy', 'situationship', 'admirer'].includes(r.type)).slice(-8).forEach((r) => add({ kind: 'pair', text: r.note ? clip(r.note, 90) : '', rel: r.type, who: [r.a, r.b], t: S.clock - 200, w: 1 }, r.note || ''));
    S.postOrder.slice(-30).map((id) => S.posts[id]).filter((p) => p && p.author === 'me' && !p.replyTo && S.clock - p.t < 4320).slice(-3).forEach((p) => add({ kind: 'post', text: clip(p.text, 80), who: ['me'], t: p.t, w: 1.4, postId: p.id }, p.text));
    // one claim about a pair at a time: when an older event/rumour about the same people exists, only the newest stays in the conversation
    const best = {};
    out.forEach((t) => { if (t.kind !== 'event' && t.kind !== 'rumor') return; const k = Ch.pairKey(t.who); if (k && (!best[k] || t.t > best[k].t)) best[k] = t; });
    return out.filter((t) => { if (t.kind !== 'event' && t.kind !== 'rumor') return true; const k = Ch.pairKey(t.who); return !k || best[k] === t; });
  };

  /* ---------- how people talk about it ---------- */
  const T = {
    event: {
      curious: [(t) => `ok can someone explain this to me: "${t.ev}"`, (t) => `wait, "${t.ev}" is real?? since when`, (t) => `I need the full story behind "${t.ev}" 👀`, (t) => `who knows what really happened? "${t.ev}"`],
      drama: [(t) => `"${t.ev}"... the way this town moves 😭`, (t) => `not "${t.ev}" 💀 I cannot`, (t) => `everyone is acting normal about "${t.ev}" and I am not`, (t) => `"${t.ev}" and nobody warned me`],
      defend: [(t) => `maybe "${t.ev}" is not as bad as it sounds, let people explain`, (t) => `we do not know the whole story behind "${t.ev}", relax`],
    },
    rumor: {
      curious: [(t) => `is it true that ${t.ev}? asking for a friend`, (t) => `somebody tell me if "${t.ev}" is real or just noise`, (t) => `wait... ${t.ev}?? where did you hear that`],
      drama: [(t) => `if "${t.ev}" is true then ${t.A} owes people answers`, (t) => `I heard "${t.ev}" from three different people 👀`, (t) => `${t.A} has been so quiet since "${t.ev}"`],
      defend: [(t) => `"${t.ev}" is a rumour. leave ${t.A} alone.`, (t) => `you all believe anything. ${t.A} deserves a chance to answer.`],
    },
    pair: {
      curious: [(t) => `are ${t.A} and ${t.B} ok? they seemed off lately`, (t) => `what is going on between ${t.A} and ${t.B} 👀`, (t) => `${t.A} and ${t.B}: are they together, or what?`],
      drama: [(t) => `${t.A} and ${t.B} again... getting popcorn 🍿`, (t) => `team ${t.A} or team ${t.B}? choose.`, (t) => `the tension between ${t.A} and ${t.B} is unreal`],
      defend: [(t) => `${t.A} and ${t.B} will sort it out. stop gossiping.`, (t) => `let ${t.A} and ${t.B} have their privacy`],
    },
    plot: {
      curious: [(t) => `has anyone figured out where "${t.ev}" is heading?`, (t) => `what is the deal with "${t.ev}"? feel like I am missing a chapter`],
      drama: [(t) => `"${t.ev}" is the only thing I think about now`, (t) => `things are about to blow up with "${t.ev}", I can feel it`],
      defend: [(t) => `"${t.ev}" is more complicated than people say`],
    },
    post: {
      curious: [(t) => `${t.P}, was that last post about ${t.A || 'someone'}?? 👀`, (t) => `${t.P} what did you mean by "${t.ev}"?`, (t) => `ok but who is "${t.ev}" really about`],
      drama: [(t) => `${t.P} posting "${t.ev}" and expecting us to stay calm`, (t) => `"${t.ev}" ... ${t.P} is not okay and neither am I 😭`],
      defend: [(t) => `${t.P} can post what they want, leave them alone`, (t) => `${t.P} is allowed to have a moment, back off`],
    },
  };
  // answers always attach to what the line before was ABOUT (m.g = that gist): "exactly" and "source?" on their own say nothing
  const REPLY = {
    agree: [(m) => `@${m.f} yeah, ${m.g} has been on my mind too`, (m) => `@${m.f} I thought the same thing about ${m.g}`, (m) => `@${m.f} honestly same, ${m.g} does not add up for me either`],
    doubt: [(m) => `@${m.f} that is not what I heard about ${m.g}`, (m) => `@${m.f} how do you even know that about ${m.g}??`, (m) => `@${m.f} what is your source on ${m.g}?`],
    ask: [(m) => `@${m.f} wait, what actually happened with ${m.g}?`, (m) => `@${m.f} since when? I missed everything about ${m.g}`, (m) => `@${m.f} and then what happened with ${m.g}?`],
  };
  // when the speaker is IN the story they talk in the first person (never "Mia and Kai: are they together?" said by Mia)
  const SELF = {
    rumor: [(t) => (t.quote ? `"${t.ev}" is not true. if you have something to say to me, say it to my face.` : 'that rumour going around about me is not true. if you have something to say, say it to my face.'), () => 'I heard what people are saying about me. ask me, do not guess.'],
    event: [(t) => (t.quote ? `about "${t.ev}": I will talk when I am ready, not before.` : 'I know what people are saying about it. I will talk when I am ready, not before.'), () => 'it happened to me, so please let me be the one to explain it.'],
    pair: [(t) => `${t.B} and I are fine. please stop reading into every little thing.`, (t) => `whatever is going on between ${t.B} and me is ours to sort out.`],
    plot: [(t) => (t.quote ? `"${t.ev}" is mine to deal with. please stop guessing how it ends.` : 'that situation is mine to deal with. please stop guessing how it ends.')],
    post: [() => 'that is not about me, so please stop dragging me into it.'],
  };

  // the strongest loyalty this speaker has to anyone the topic is about (you included): family, partners and best friends never join in
  const loyalTo = (n, ids) => (G.Reasons ? Math.max(0, ...(ids || []).filter((id) => id !== n.id).map((id) => G.Reasons.loyal(n, id))) : 0);
  const LOYAL_LINES = {
    me: [(t) => `that is my ${t.rel} you are talking about. whoever started this should bring proof or stop.`, (t) => `I know ${t.A}. I do not believe a word of this and I am not letting it go.`, (t) => `leave ${t.A} alone. I will answer for them. who started this?`, (t) => `this is not true. I know ${t.A}. delete it and stop passing it around.`],
    other: [(t) => `I know ${t.A}. that is not who they are. let them speak first.`, (t) => `stop. ${t.A} has not even answered yet.`, (t) => `I am not buying it. not about ${t.A}.`],
  };
  // more ways to say it, so nobody has to repeat themselves (a character who runs out of lines stays silent instead; see `repeated`)
  const MOREL = {
    event: { curious: [(t) => `can anyone fill me in on "${t.ev}"? I only got half of it`, (t) => `so what is the real story behind "${t.ev}"?`, (t) => `"${t.ev}": who was there? who saw it?`], drama: [(t) => `"${t.ev}" and people are acting like it is normal`, (t) => `I did not have "${t.ev}" on my bingo card`, (t) => `"${t.ev}" is going to follow people around for weeks`], defend: [(t) => `before anyone judges "${t.ev}", wait for the people involved`, (t) => `"${t.ev}" has two sides and we have heard none of them`] },
    rumor: { curious: [(t) => `where did "${t.ev}" even start?`, (t) => `has anyone checked "${t.ev}" with ${t.A}?`, (t) => `"${t.ev}": confirmed or just talk?`], drama: [(t) => `if "${t.ev}" is real, ${t.A} has some explaining to do`, (t) => `everyone is whispering "${t.ev}" and nobody asks ${t.A}`, (t) => `"${t.ev}" is spreading fast, I wonder who benefits`], defend: [(t) => `"${t.ev}" has no proof behind it. give ${t.A} some room.`, (t) => `a rumour is not a fact. ask ${t.A} before repeating "${t.ev}".`] },
    pair: { curious: [(t) => `did ${t.A} and ${t.B} sort things out?`, (t) => `anyone know where ${t.A} and ${t.B} stand right now?`, (t) => `${t.A} and ${t.B} have been quiet around each other, notice that?`], drama: [(t) => `${t.A} and ${t.B} in the same room is must-see`, (t) => `bet on it: ${t.A} and ${t.B} blow up again by the weekend`, (t) => `the ${t.A} and ${t.B} saga continues`], defend: [(t) => `${t.A} and ${t.B} deserve some peace, honestly`, (t) => `nobody here knows what ${t.A} and ${t.B} went through`] },
    plot: { curious: [(t) => `who is closest to the truth on "${t.ev}"?`, (t) => `what do we actually know about "${t.ev}" so far?`], drama: [(t) => `"${t.ev}" keeps getting messier`, (t) => `I cannot stop refreshing for news on "${t.ev}"`, (t) => `"${t.ev}" is about to split this town in two`], defend: [(t) => `be patient with "${t.ev}", the whole picture is not out yet`] },
    post: { curious: [(t) => `${t.P}, is there more to "${t.ev}"?`, (t) => `${t.P} said "${t.ev}" and now everyone is guessing what it means`], drama: [(t) => `"${t.ev}" from ${t.P} has the whole town talking`, (t) => `${t.P} drops "${t.ev}" and logs off. classic.`], defend: [(t) => `${t.P} does not owe anyone an explanation for "${t.ev}"`, (t) => `let ${t.P} post in peace`] },
  };
  Object.keys(MOREL).forEach((k) => Object.keys(MOREL[k]).forEach((st) => T[k][st].push(...MOREL[k][st])));
  LOYAL_LINES.me.push((t) => `${t.A} is my ${t.rel}. I know the truth and this is not it.`, (t) => `anyone who knows ${t.A} knows this is wrong. stop.`, (t) => `I will not sit here while people pass this around about ${t.A}.`);
  LOYAL_LINES.other.push((t) => `${t.A} has earned better than this. wait for their side.`, (t) => `I have known ${t.A} a long time. that does not sound like them.`);
  REPLY.agree.push((m) => `@${m.f} same here, ${m.g} bothers me too`, (m) => `@${m.f} you are right to bring up ${m.g}`);
  REPLY.doubt.push((m) => `@${m.f} I am not sure about ${m.g}, who told you?`, (m) => `@${m.f} careful with ${m.g}, nobody has confirmed it`);
  REPLY.ask.push((m) => `@${m.f} what do you know about ${m.g}?`, (m) => `@${m.f} can you explain ${m.g} to me?`);
  const traits = (n) => (G.Persona ? G.Persona.ensure(n).t : { O: 50, E: 50, A: 50 });
  // who would talk about this: curious people ask, gossips stir, kind people defend
  const speakerFor = (topic, chan, rnd) => {
    const S = G.S;
    const involved = new Set(topic.who);
    const pool = Object.values(S.npcs).filter((n) => !n.userAlt && !n.blocked && !n.muted && (!topic.kb || topic.kb.includes(n.id))); // (a story rumour is only talked about by the people who have heard it)
    if (!pool.length) return null;
    const scored = pool.map((n) => {
      const t = traits(n);
      let w = (0.2 + t.E / 120 + 0.2) * (involved.has(n.id) ? 0.2 : 1); // outgoing people talk; people involved talk less about themselves
      if (S.clock - (n.touched || 0) < 2880) w += 0.3; // people you have been dealing with lately
      if (topic.who.some((id) => id !== 'me' && S.npcs[id] && ['friend', 'close_friend', 'best_friend', 'dating', 'partner', 'ally'].includes(S.npcs[id].status))) w += 0.1;
      if (n.goal && (n.goal.who || []).some((id) => topic.who.includes(id))) w += 0.4; // people talk about the person they are after
      if (['rumor', 'event', 'pair'].includes(topic.kind) && loyalTo(n, topic.who) >= (G.Reasons ? G.Reasons.LOYAL : 0.6)) w += 0.5; // the people who love them speak up for them
      return [n, Math.max(0.05, w) * rnd()];
    });
    scored.sort((a, b) => b[1] - a[1]);
    return scored[0][0];
  };
  const styleFor = (n, topic, rnd) => {
    const t = traits(n);
    const involved = topic.who.includes(n.id);
    if (loyalTo(n, topic.who) >= (G.Reasons ? G.Reasons.LOYAL : 0.6)) return 'defend'; // the people who love them never gossip about them
    const w = { curious: 0.4 + t.O / 100, drama: 0.35 + (100 - t.A) / 100 + t.E / 200, defend: 0.1 + t.A / 120 + (topic.who.some((id) => id !== n.id && who(id) && (who(id).aff || 0) > 30) ? 0.5 : 0) };
    const DL = G.Directives;
    if (DL) { w.curious *= Math.pow(DL.dial('curious'), 2); w.drama *= Math.pow(DL.dial('drama'), 2) * DL.dial('edgy'); w.defend *= Math.pow(DL.dial('warm'), 2); }
    if (involved) { w.curious = 0.05; w.drama *= 0.4; w.defend += 0.5; }
    let x = rnd() * (w.curious + w.drama + w.defend);
    for (const k of ['curious', 'drama', 'defend']) { x -= w[k]; if (x <= 0) return k; }
    return 'curious';
  };
  // -> { text, note } | null. note = the speaker asserted something (a defence, a claim, a callout): the only lines the speaker will remember
  const compose = (n, topic, style, rnd) => {
    const S = G.S;
    const others = topic.who.filter((id) => id !== n.id);
    const self = topic.who.includes(n.id);
    const facts = { ev: topic.text || (topic.rel ? topic.rel : 'it'), A: name1(others[0]), B: name1(others[1] || others[0]), P: first(S.player.name) };
    if (topic.kind === 'pair' && topic.text) facts.ev = topic.text;
    if (topic.kind === 'post') facts.A = others[1] ? name1(others[1]) : '';
    if (self) { facts.quote = !!topic.text && !(first(n.name).length > 2 && topic.text.toLowerCase().includes(first(n.name).toLowerCase())); return { text: inVoice(n, pick(SELF[topic.kind] || SELF.event, rnd)(facts), rnd), note: true }; } // the speaker is part of the story: first person only
    if (topic.kind === 'pair' && others.length < 2) return null; // "Kai and Kai": a pair needs two people
    if (style === 'defend' && loyalTo(n, topic.who) >= (G.Reasons ? G.Reasons.LOYAL : 0.6) && ['rumor', 'event', 'post', 'plot', 'pair'].includes(topic.kind)) {
      const aboutMe = topic.who.includes('me') && G.Reasons.loyal(n, 'me') >= G.Reasons.LOYAL;
      facts.A = aboutMe ? first(S.player.name) : facts.A;
      facts.rel = aboutMe ? (E.isFamily(n) ? ({ son: 'parent', daughter: 'parent', mother: 'child', father: 'child', brother: 'sibling', sister: 'sibling' }[n.status] || 'family') : 'friend') : 'friend';
      return { text: inVoice(n, pick(LOYAL_LINES[aboutMe ? 'me' : 'other'], rnd)(facts), rnd), note: true };
    }
    const list = (T[topic.kind] && (T[topic.kind][style] || T[topic.kind].curious)) || T.event.curious;
    return { text: inVoice(n, pick(list, rnd)(facts), rnd), note: style !== 'curious' };
  };

  let lastBase = ''; // the phrase before the voice layer rewrote it: that is the template's identity
  const inVoice = (n, text, rnd) => {
    lastBase = text;
    try { return G.Voice.stylize(text, n, rnd, { short: true }); } catch (e) { return text; }
  };
  const mid = () => 'cm' + (G.S.counters.cmsg = (G.S.counters.cmsg || 0) + 1);
  const push = (chan, from, text, o = {}) => {
    const S = G.S;
    const m = { id: mid(), from, text: String(text).slice(0, 400), t: o.t != null ? o.t : S.clock };
    if (o.to) m.to = o.to;
    if (o.ref) m.ref = o.ref; // the post or story this message is about (shown as a card you can open)
    if (o.about && o.about.length) m.about = o.about.slice(0, 3); // who the message is about: the people who love them answer it
    chan.msgs.push(m);
    if (chan.msgs.length > 120) chan.msgs.shift();
    if (from !== 'me') {
      const n = S.npcs[from];
      if (n) {
        n.touched = S.clock;
        // WHAT IS LEARNED: only what is worth it. The speaker remembers only what they ASSERTED (a defence, a claim, a callout), not every message;
        // a listener stores a line only when it is really about them (their name or @handle in it, or it answers them) or it is salient (imp >= 5).
        // Both are rolling: one memory per channel and person, so chatter can never flood npc.mem.
        try { if (o.note) remember(n, `ch:${chan.id}`, { kind: 'comment', text: `I said in #${chan.name}: "${clip(m.text, 80)}"`, who: o.about || [], imp: 3 }); } catch (e) {}
        const named = new Set(mentionIds(m.text));
        const head = (m.text.match(/^@(\w+)/) || [])[1];
        const sal = G.Mind ? G.Mind.salience(m.text, 'said') : 3;
        (o.about || []).forEach((id) => {
          const s = S.npcs[id];
          if (!s || id === from || s.userAlt) return;
          const isNamed = named.has(id);
          if (!isNamed && sal < 5) return; // not about them and not important: they never hear of it
          const addressed = isNamed && head && head.toLowerCase() === first(s.name).toLowerCase();
          const text = isNamed ? (addressed ? `${n.name} told me in #${chan.name}: "${clip(m.text, 80)}"` : `${n.name} was talking about me in #${chan.name}: "${clip(m.text, 80)}"`) : `${n.name} said in #${chan.name}: "${clip(m.text, 80)}"`;
          try { remember(s, `ch:${chan.case ? 'case' : chan.id}:heard`, { kind: addressed ? 'comment' : 'rumor', text, who: [from], imp: isNamed ? 4 : Math.min(sal, 6) }); } catch (e) {}
        });
      }
      chan.unread = (chan.unread || 0) + 1;
      if (o.about && o.about.includes('me') && (!S.chanNotif || S.clock - S.chanNotif > 360)) {
        S.chanNotif = S.clock;
        try { E.addNotif('event', `📣 People are talking about you in #${chan.name}`, { act: 'chanGo', data: { id: chan.id } }); } catch (e) {}
      }
    }
    return m;
  };

  Ch.push = push; // (also used by the tests and the Director to place a line with the same memory rules)

  // a public "who did it?" message: points a finger when the speaker really suspects someone (with their evidence), shares what they know, or asks.
  // Everyone listening updates by how much they trust the SPEAKER, and the person accused hears it (only once the line has passed the gate: see commit).
  const mysteryCandidate = (chan, n, topic, rnd) => {
    const S = G.S;
    const sl = topic.sl || S.storylines.find((x) => x.title === topic.text);
    if (!sl || !G.Reasons) return null;
    const th = G.Reasons.theory(n, sl, rnd);
    const about = th.accused && th.accused !== n.id ? [th.accused] : (sl.participants || []).filter((id) => id !== n.id).slice(0, 2);
    return { n, text: inVoice(n, th.text, rnd), topic, about, style: th.mode, accused: th.accused || '', note: !!th.accused, mystery: th, subject: th.accused || undefined };
  };
  // somebody opens a thread to work out a hot storyline
  Ch.openCase = function (sl, npc) {
    const S = G.S;
    Ch.ensure();
    const slug = String(sl.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || sl.id;
    if (S.channels.some((c) => c.case === sl.id)) return null;
    const chan = { id: 'case-' + slug, name: 'case-' + slug, icon: '🔎', about: 'Figuring out: ' + sl.title, case: sl.id, msgs: [] };
    S.channels.push(chan);
    push(chan, npc.id, inVoice(npc, `Opening this thread so we can work out "${clip(sl.title, 50)}". Put what you actually know here.`, rand), { about: (sl.participants || []).filter((id) => id !== npc.id).slice(0, 2) });
    try { E.addNotif('event', `🔎 ${npc.name} opened #${chan.name} to work out "${clip(sl.title, 40)}"`, { act: 'chanGo', data: { id: chan.id } }); } catch (e) {}
    return chan;
  };
  // the earlier thing a message was about (walks up the reply chain), as words a reply can attach to; '' when there is nothing safe to attach to
  const gistOf = (chan, m) => {
    const S = G.S;
    let cur = m;
    for (let i = 0; i < 4 && cur; i++) {
      const tp = String(cur.topic || '');
      const k = tp.indexOf(':');
      if (k >= 0 && tp.slice(0, k) === 'pair') break; // a couple is talked about by their names, not by a note about them
      if (k >= 0 && tp.slice(k + 1)) {
        const g = tp.slice(k + 1);
        if (delicateKinds(g)) return '';
        return sensOf(g) >= 0.5 ? clip(g, 46) : `"${clip(g, 46)}"`; // (a heavy-sounding phrase is not put in quotes: the gate refuses quoted delicate words)
      }
      cur = cur.to ? chan.msgs.find((x) => x.id === cur.to) : null;
    }
    const names = (m.about || []).filter((id) => id === 'me' || S.npcs[id]).slice(0, 2).map(name1);
    return names.length ? names.join(' and ') : '';
  };
  // a person never pushes two different claims about the same pair (or accuses two people in one storyline)
  const claimConflict = (n, c) => {
    const S = G.S;
    const t = c.topic;
    if (!t) return false;
    const key = t.kind + ':' + t.text;
    const pk = ['event', 'rumor'].includes(t.kind) ? Ch.pairKey(t.who) : '';
    for (const ch of S.channels) {
      const ms = ch.msgs;
      for (let i = 0; i < ms.length; i++) {
        const m = ms[i];
        if (m.from !== n.id) continue;
        if (pk && m.pair === pk && m.topic !== key) return true;
        if (c.accused && m.topic === key && m.accused && m.accused !== c.accused) return true;
      }
    }
    return false;
  };
  // somebody who cares says something kind about a delicate moment (yours, or anyone's). Never a joke, never a quote.
  const careCandidate = (chan, topic, rnd) => {
    const S = G.S;
    const subj = topic.who[0];
    if (!subj || topic.kind === 'plot' || topic.kind === 'mystery' || topic.kind === 'rumor') return null; // (a rumour about somebody's health gets silence, not public sympathy that confirms it)
    const key = topic.kind + ':' + topic.text;
    const cared = chan.msgs.slice(-40).filter((m) => m.style === 'care' && m.topic === key);
    if (cared.length >= 2) return null;
    const pool = Object.values(S.npcs).filter((x) => !x.userAlt && !x.blocked && !x.muted && !topic.who.includes(x.id) && !cared.some((m) => m.from === x.id));
    if (!pool.length) return null;
    const n = pool.map((x) => [x, loyalTo(x, [subj]) + rnd() * 0.5]).sort((a, b) => b[1] - a[1])[0][0];
    let rel = {};
    try { rel = G.React.relation(S, n, subj); } catch (e) {}
    const line = G.Mind && G.Mind.respond(n, { about: topic.raw || topic.text, rel, to: '', rnd });
    if (!line) return null;
    return { n, text: `@${name1(subj)} ${line.replace(/[,\s]+$/, '')}`, topic, about: [subj], style: 'care', subject: subj };
  };
  // one candidate line for a channel (not yet said): a fresh remark about something real, or an answer to what was just said
  const candidate = (chan, rnd) => {
    const S = G.S;
    const d = chan.case ? { kinds: ['mystery'] } : def(chan.id);
    const recent = chan.msgs.slice(-6).filter((m) => m.from !== 'me' && S.npcs[m.from] && S.clock - m.t < 240);
    if (recent.length && rnd() < 0.4) {
      const last = recent[recent.length - 1];
      const n = speakerFor({ who: [last.from], kind: 'event' }, chan, rnd);
      if (n && n.id !== last.from) {
        const lastAbout = (last.about || []).filter((id) => id !== n.id);
        const f = first(S.npcs[last.from].name);
        const base = { n, to: last.id, about: [last.from].concat(lastAbout).slice(0, 3) };
        if ((last.about || []).includes(n.id) && ['drama', 'defend', 'accuse'].includes(last.style)) { // they were the one talked about, and it was a claim: they answer the speaker directly, in the first person
          return Object.assign(base, { text: inVoice(n, pick([`@${f} I saw what you said about me. ask me before you decide what is true.`, `@${f} that is not how it happened. if you have a question about me, ask me.`], rnd), rnd), note: true });
        }
        if (lastAbout.length && loyalTo(n, lastAbout) >= (G.Reasons ? G.Reasons.LOYAL : 0.6)) {
          const mine = lastAbout.includes('me');
          return Object.assign(base, { text: inVoice(n, pick(mine ? [`@${f} that is not true. I know ${first(S.player.name)}. stop spreading it.`, `@${f} where did you hear that? you should check before you say it about ${first(S.player.name)}.`, `@${f} no. I am not letting this slide. take it down.`] : [`@${f} stop. you do not know the whole story.`, `@${f} not true, and you know it.`], rnd), rnd), note: true }); // (the thread stays about the person they are defending)
        }
        const g = gistOf(chan, last);
        if (g && last.style !== 'care') {
          const kind = rnd() < 0.5 ? 'ask' : rnd() < 0.5 ? 'agree' : 'doubt';
          return Object.assign(base, { text: inVoice(n, pick(REPLY[kind], rnd)({ f, g }), rnd), note: kind === 'doubt' });
        }
      }
    }
    // delicate topics are only ever answered with care, and only where people talk openly (never in the gossip, theory and drama channels)
    const openChan = ['town-talk', 'fans'].includes(chan.id);
    const topics = Ch.topics().filter((t) => d.kinds.includes(t.kind) && (!t.rel || !d.pairTypes || d.pairTypes.includes(t.rel)) && (!chan.case || (t.sl && t.sl.id === chan.case)) && (!t.delicate || openChan));
    if (!topics.length) return null;
    // newer and hotter topics first, but not always the same one
    const weights = topics.map((t) => (t.w || 1) * Math.pow(0.5, Math.max(0, S.clock - t.t) / 2880) + 0.05);
    const said = new Set(chan.msgs.slice(-12).map((m) => m.topic));
    let total = 0;
    topics.forEach((t, i) => { if (said.has(t.kind + ':' + t.text)) weights[i] *= 0.15; if (t.delicate) weights[i] *= 0.4; total += weights[i]; });
    let x = rnd() * total;
    let topic = topics[0];
    for (let i = 0; i < topics.length; i++) { x -= weights[i]; if (x <= 0) { topic = topics[i]; break; } }
    if (topic.delicate) return careCandidate(chan, topic, rnd);
    const n = speakerFor(topic, chan, rnd);
    if (!n) return null;
    if (topic.kind === 'mystery') return mysteryCandidate(chan, n, topic, rnd);
    const style = styleFor(n, topic, rnd);
    const c = compose(n, topic, style, rnd);
    if (!c) return null;
    return { n, text: c.text, note: c.note, topic, style, about: topic.who.filter((id) => id !== n.id), ref: topic.postId && G.Refs ? G.Refs.post(topic.postId) : null };
  };
  // say it: nothing is learned or sent until the line has passed the gate
  const commit = (chan, c) => {
    const S = G.S;
    const m = push(chan, c.n.id, c.text, { to: c.to, about: c.about, ref: c.ref, note: c.note });
    if (c.topic) {
      m.topic = c.topic.kind + ':' + c.topic.text;
      const pk = ['event', 'rumor'].includes(c.topic.kind) ? Ch.pairKey(c.topic.who) : '';
      if (pk && !c.to) m.pair = pk;
    }
    if (c.style) m.style = c.style;
    if (G.Persona && G.Persona.noteText) G.Persona.noteText(c.n, lineKey(c.text));
    if (c.base) { // remember the template (bounded, pruned after 14 days)
      const said = c.n.chSaid || (c.n.chSaid = {});
      said[tmplKey(c.base)] = S.clock;
      const ks = Object.keys(said);
      if (ks.length > 40) ks.forEach((k) => { if (S.clock - said[k] >= TMPL_GAP) delete said[k]; });
      if (Object.keys(said).length > 60) { const oldest = Object.keys(said).sort((a, b) => said[a] - said[b])[0]; delete said[oldest]; }
    }
    if (c.mystery) {
      m.accused = c.accused || '';
      if (c.accused) {
        G.Reasons.broadcast(c.n, c.accused, 0.7, rand);
        const acc = S.npcs[c.accused];
        if (acc && !acc.userAlt) { try { remember(acc, `ch:acc:${c.n.id}`, { kind: 'shade', text: `${c.n.name} accused me in #${chan.name}: "${clip(c.text, 80)}"`, who: [c.n.id], imp: 7, valence: -0.6 }); } catch (e) {} }
      }
    }
    return m;
  };
  // nobody says the same thing twice in a row, and nobody keeps returning to the same topic
  // a line's identity: no @names, no emoji, no stretched letters ("pleaseee"), so style flourishes do not make a repeat look new
  // squash style flourishes so a restyled copy has the same identity: stretched letters, u/you, im/i am, ur/your
  const simple = (t) => norm(t).replace(/(.)\1+/g, '$1').replace(/\bu\b/g, 'you').replace(/\bi ?m\b/g, 'i am').replace(/\bur\b/g, 'your').replace(/\s+/g, ' ').trim();
  const lineKey = (t) => 'ch:' + simple(String(t).replace(/@\w+/g, ' '));
  // template identity: the pre-style phrase without names or quoted topic text, so "u/you", "i'm", caps and emoji cannot make a repeat look new
  const tmplKey = (base) => {
    const names = Object.values(G.S.npcs).map((o) => first(o.name)).concat(first(G.S.player.name)).filter((x) => x.length > 2).map(rxq);
    let t = String(base || '').replace(/["“][^"”]*["”]/g, ' ').replace(/@\w+/g, ' ');
    if (names.length) t = t.replace(new RegExp('\\b(' + names.join('|') + ')\\b', 'gi'), ' ');
    return simple(t);
  };
  const TMPL_GAP = 20160; // 14 game days before a template may come back for the same person
  const repeated = (chan, c) => {
    const said = c.n.chSaid;
    if (said && c.base && said[tmplKey(c.base)] != null && G.S.clock - said[tmplKey(c.base)] < TMPL_GAP) return true; // no unused template for this: stay silent
    const key = c.topic ? c.topic.kind + ':' + c.topic.text : '';
    const head = norm(c.text).slice(0, 40);
    if (G.Persona && G.Persona.dupText && G.Persona.dupText(c.n, lineKey(c.text))) return true; // this character already said this exact line (any channel, any day): silence beats a repeat
    return chan.msgs.slice(-4).some((m) => m.from === c.n.id && key && m.topic === key && !c.to) || chan.msgs.slice(-6).some((m) => norm(m.text).slice(0, 40) === head);
  };
  Ch.say = function (chan, rnd = rand) {
    for (let i = 0; i < 4; i++) { // a line that fails the gate is dropped and another one is tried
      lastBase = '';
      const c = candidate(chan, rnd);
      if (!c || !c.text) continue;
      c.base = lastBase;
      if (!lineOk(c) || claimConflict(c.n, c) || repeated(chan, c)) continue;
      return commit(chan, c);
    }
    return null;
  };

  // the world heartbeat: a little chatter each hour, more in busy worlds, none when the cast is silent or channels are off
  Ch.step = function () {
    const S = G.S;
    if (!S || !enabled()) return 0;
    Ch.ensure();
    const last = S.chanLast != null ? S.chanLast : S.clock - 60;
    const n = Math.min(4, Math.floor((S.clock - last) / 55));
    if (n < 1) return 0;
    S.chanLast = S.clock;
    let made = 0;
    const rate = Math.min(2.5, G.World.feedRate() * (G.Directives ? G.Directives.dial('chatty') : 1));
    for (let i = 0; i < n; i++) {
      S.channels.forEach((chan) => {
        if (rand() < 0.28 * rate && made < 3) { if (Ch.say(chan)) made++; }
      });
    }
    const hot = (S.storylines || []).filter((x) => x.status !== 'resolved' && (x.heat || 0) >= 60 && (x.participants || []).length >= 2 && !S.channels.some((c) => c.case === x.id));
    if (hot.length && S.channels.filter((c) => c.case && !c.closed).length < 3 && rand() < 0.35) {
      const sl = hot[0];
      const who = (sl.participants || []).map((id) => S.npcs[id]).filter((x) => x && !x.userAlt && !x.blocked).sort((a, b) => traits(b).E - traits(a).E)[0];
      if (who && Ch.openCase(sl, who)) made++;
    }
    S.channels.forEach((c) => {
      if (!c.case || c.closed) return;
      const sl = (S.storylines || []).find((x) => x.id === c.case);
      if (!sl || sl.status === 'resolved') { c.closed = true; c.about = 'Closed: ' + c.about.replace(/^Figuring out: /, ''); }
    });
    if (made) G.Store.saveSoon();
    return made;
  };
  { const tick0 = E.tick; E.tick = function () { const r = tick0.apply(this, arguments); try { Ch.step(); } catch (e) {} return r; }; }

  // you write in a channel: a few people answer, using something real (a topic that matches your words) when there is one
  Ch.send = function (chanId, text) {
    const S = G.S;
    text = String(text || '').trim().slice(0, 400);
    if (!text) throw Object.assign(new Error('Write something first.'), { user: true });
    const chan = Ch.ensure().find((c) => c.id === chanId);
    if (!chan) throw Object.assign(new Error('Unknown channel.'), { user: true });
    const mine = push(chan, 'me', text);
    const P1 = first(S.player.name);
    // you say something delicate (illness, grief, a crisis): the people who care answer with care, nobody jokes, nobody quotes it, the rest stay silent
    if (G.Mind && G.Mind.read(text).sens >= 0.5) {
      const cast = Object.values(S.npcs).filter((n) => !n.userAlt && !n.blocked && !n.muted).map((n) => [n, (G.Reasons ? G.Reasons.loyal(n, 'me') : 0) + rand() * 0.3]).sort((a, b) => b[1] - a[1]).slice(0, 2);
      cast.forEach(([n]) => {
        let rel = {};
        try { rel = G.React.relation(S, n, 'me'); } catch (e) {}
        const line = G.Mind.respond(n, { about: text, rel, to: P1, rnd: rand });
        if (!line) return;
        const m = push(chan, n.id, `@${P1} ${line}`, { to: mine.id, about: ['me'] });
        m.style = 'care';
      });
      chan.unread = 0;
      G.Store.saveSoon();
      return chan;
    }
    const ACC =/\b(leak\w*|did it|is behind|was behind|lied|lying|cheat\w*|betray\w*|stole|stolen|accus\w*|blame\w*|responsible|guilty|sold us out|snitch\w*)\b/i;
    if (ACC.test(text)) {
      const accused = Object.values(S.npcs).find((n) => !n.userAlt && !n.blocked && first(n.name).length > 2 && new RegExp('\\b' + first(n.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(text));
      if (accused) {
        const P0 = first(S.player.name);
        push(chan, accused.id, inVoice(accused, `@${P0} that is not true. I had nothing to do with it. Show me what you are basing that on.`, rand), { to: mine.id, about: [accused.id] });
        try { G.Mem.add(accused, { kind: 'shade', text: `${S.player.name} accused me in public in #${chan.name}: "${clip(text, 70)}"`, who: ['me'], imp: 7, valence: -0.6 }); } catch (e) {}
        accused.trust = Math.max(0, (typeof accused.trust === 'number' ? accused.trust : 30) - 4); // (trust is 0..100)
        accused.aff = Math.max(-100, (accused.aff || 0) - 3);
        if (G.Reasons) G.Reasons.broadcast({ id: 'me' }, accused.id, 0.5, rand);
      }
    }
    const words = (G.Rag ? G.Rag.tokens(text) : []).filter((w) => w.length > 3);
    const topics = Ch.topics().filter((t) => !t.delicate);
    const match = topics.map((t) => [t, (G.Rag ? G.Rag.tokens(t.text + ' ' + t.who.map(name1).join(' ')) : []).filter((w) => words.includes(w)).length]).sort((a, b) => b[1] - a[1])[0];
    const topic = match && match[1] > 0 ? match[0] : null;
    const rnd = rand;
    const nReplies = 1 + Math.floor(rnd() * 3);
    const used = new Set();
    let said = 0;
    for (let i = 0; i < nReplies + 6 && said < nReplies; i++) { // (a few more tries: a reply that fails the gate, or from someone in the story themselves, is skipped)
      const n = speakerFor(topic || { who: [], kind: 'event' }, chan, rnd);
      if (!n || used.has(n.id) || (topic && topic.who.includes(n.id) && i < nReplies + 4)) continue;
      used.add(n.id);
      let reply;
      let note = false;
      if (topic) {
        const c = compose(n, topic, styleFor(n, topic, rnd), rnd);
        if (!c) continue;
        reply = `@${P1} ` + c.text;
        note = c.note;
      } else {
        const kw = words[0];
        const quoted = clip(text, 40);
        reply = inVoice(n, pick(kw ? [`@${P1} wait, ${kw}?? tell us more`, `@${P1} okay but why ${kw}`, `@${P1} I have so many questions about ${kw} 👀`] : [`@${P1} what do you mean by "${quoted}"?`, `@${P1} go on, "${quoted}" sounds like there is more to it`], rnd), rnd);
      }
      if (!lineOk({ n, text: reply, topic }, { about: topic ? topic.raw || topic.text : text, min: 2 })) continue; // a reply that fails the gate is simply not said
      said++;
      push(chan, n.id, reply, { to: mine.id, about: topic ? topic.who.filter((id) => id !== n.id).slice(0, 3) : [], note, ref: topic && topic.postId && G.Refs ? G.Refs.post(topic.postId) : null });
    }
    chan.unread = 0;
    G.Store.saveSoon();
    return chan;
  };

  /* ---------- story-aware comments under posts ---------- */
  // Called by Voice.comment: when the commenter knows something real about the person who posted (a rumour, an event, a feud, a storyline),
  // the comment can be curious or dramatic about THAT instead of a generic line. Returns null when there is nothing real to say.
  Ch.storyComment = function (n, stance, ctx) {
    const S = G.S;
    const post = ctx.post;
    if (!post || !S || ctx.hot) return null;
    if (!['curious', 'cheer', 'relate', 'tease', 'agree', 'concern', 'critique', 'empathize', 'indifferent'].includes(stance)) return null;
    const rnd = ctx.rnd || rand;
    const t = traits(n);
    const subject = post.author;
    if (subject === n.id) return null;
    if (G.Mind && G.Mind.read(post.text).sens >= 0.5) return null; // under a delicate post nobody gets curious: the normal comment path answers with care
    // (a commenter who is part of the story themselves only ever speaks about the couple they form with the author, in the first person)
    const topics = Ch.topics().filter((x) => !x.delicate && x.who.includes(subject) && (!x.who.includes(n.id) || x.kind === 'pair') && (!x.kb || x.kb.includes(n.id)));
    if (!topics.length) return null;
    if (G.Reasons && G.Reasons.loyal(n, subject) >= G.Reasons.LOYAL && !['cheer', 'agree', 'empathize', 'concern'].includes(stance)) return null;
    if (rnd() > (0.2 + 0.35 * (t.O / 100) + 0.1 * (t.E / 100)) * (G.Directives ? G.Directives.dial('curious') : 1)) return null;
    const topic = topics[Math.floor(rnd() * topics.length)];
    const style = ['critique', 'tease'].includes(stance) ? 'drama' : ['cheer', 'agree', 'empathize'].includes(stance) ? 'defend' : 'curious';
    const withSubject = Object.assign({}, topic, { who: [subject].concat(topic.who.filter((id) => id !== subject)) });
    const c = compose(n, withSubject, rnd() < 0.25 ? 'curious' : style, rnd);
    if (!c) return null;
    return lineOk({ n, text: c.text, topic: withSubject }, { kind: 'comment', about: post.text, aboutAuthor: subject, thread: withSubject.who, allowGossip: true }) ? c.text : null;
  };
  if (G.Voice && G.Voice.comment) {
    const comment0 = G.Voice.comment;
    G.Voice.comment = function (n, stance, ctx) {
      try {
        const t = ctx && ctx.post && Ch.storyComment(n, stance, ctx);
        if (t) return t;
      } catch (e) {}
      return comment0.apply(this, arguments);
    };
  }

  /* ---------- optional: richer messages from the AI, on demand, shown for approval first ---------- */
  Ch.spark = async function (chanId) {
    const S = G.S;
    const AIm = G.AI;
    if (!AIm.ready()) throw Object.assign(new Error('Needs an AI model (Settings). The channels already run for free without one.'), { user: true });
    const chan = Ch.ensure().find((c) => c.id === chanId) || S.channels[0];
    const Story = E.Story;
    const topics = Ch.topics().filter((x) => !x.delicate).slice(-8); // (delicate moments are never handed to the gossip prompt)
    const cast = Object.values(S.npcs).filter((n) => !n.userAlt && !n.blocked).sort((a, b) => (b.touched || 0) - (a.touched || 0)).slice(0, 10);
    const prompt = [
      Story ? Story.rulesBlock() : '',
      Story ? Story.memoryBlock(topics.map((x) => x.text).join(' ')) : '',
      G.Directives ? G.Directives.promptBlock() : '',
      `WORLD: ${S.world.name}. PLAYER: ${S.player.name}.`,
      'WHO IS AROUND (id|name|personality|how they feel about the player):\n' + cast.map((n) => `${n.id}|${n.name}|${clip(n.personality, 80)}|${n.status}`).join('\n'),
      'WHAT IS REALLY GOING ON (only talk about these, never invent big events):\n' + topics.map((x) => `- [${x.kind}] ${x.text}${x.who.length ? ' (' + x.who.map(name1).join(', ') + ')' : ''}`).join('\n'),
      'RECENT MESSAGES IN #' + chan.name + ':\n' + chan.msgs.slice(-8).map((m) => `${m.id} ${m.from === 'me' ? S.player.name : name1(m.from)}: ${m.text}`).join('\n'),
      `Write 6-9 short messages for the public channel #${chan.name} (${chan.about}) as different characters from the list. Make them curious about what is going on, gossip, take sides, defend people and answer each other (use "replyTo" with a message id from above or from an earlier message of yours). Each person speaks in their own voice and knows only public things. LOYALTY: family, partners and best friends of the player (or of anyone else) NEVER spread a rumour about them, never accuse them in public and never gossip about them: they defend them out loud, and if they are unsure they ask the person privately, not in the channel. Nobody mentions private DMs. Stay consistent with the facts above.`,
      'If a message is about one specific post, put its exact id in "post" and never talk about a post you were not shown. Return JSON: {"channel_msgs":[{"from":"npcId","text":"","replyTo":"messageId or null","post":"postId or null"}]}',
    ].filter(Boolean).join('\n');
    const out = await AIm.json({ task: 'turn', user: prompt, maxTokens: 900, temperature: 0.9 });
    const list = (out.data && Array.isArray(out.data.channel_msgs) ? out.data.channel_msgs : []).filter((m) => m && S.npcs[m.from] && !S.npcs[m.from].userAlt && String(m.text || '').trim() && lineOk({ n: S.npcs[m.from], text: String(m.text) }, { min: 2 })).slice(0, 10); // (the AI's lines pass the same gate)
    if (!list.length) throw Object.assign(new Error('The AI did not write any messages. Try again.'), { user: true });
    const lines = list.map((m) => `💬 ${name1(m.from)} in #${chan.name}: “${clip(m.text, 120)}”`);
    if (G.settings.approveActions !== false && Story && typeof Story.approver === 'function') {
      const items = list.map((m, i) => ({ id: 'cm:' + i, group: 'cm', idx: i, deps: [], label: lines[i] }));
      const dec = await Story.approver({ text: 'Spark drama in #' + chan.name, cost: Number(out.cost) || 0, lines, items });
      const picked = Array.isArray(dec) ? dec : dec ? items.map((i) => i.id) : [];
      if (!picked.length) return { rejected: true, cost: Number(out.cost) || 0 };
      for (let i = list.length - 1; i >= 0; i--) if (!picked.includes('cm:' + i)) list.splice(i, 1);
    }
    list.forEach((m) => push(chan, m.from, m.text, { to: m.replyTo && chan.msgs.some((x) => x.id === m.replyTo) ? m.replyTo : undefined, about: mentionIds(String(m.text)).filter((id) => id !== m.from), note: true, ref: G.Refs && m.post ? G.Refs.post(m.post) : undefined }));
    G.Store.saveSoon();
    return { made: list.length, cost: Number(out.cost) || 0 };
  };

  /* ---------- the page ---------- */
  UI.chan = UI.chan || null;
  P.channels = function () {
    const S = G.S;
    const chans = Ch.ensure();
    const cur = chans.find((c) => c.id === UI.chan) || chans[0];
    cur.unread = 0;
    const tabs = chans.map((c) => `<button class="btn sm ${c.id === cur.id ? 'primary' : ''}" data-act="chanOpen" data-id="${c.id}">${c.icon} ${esc(c.name)}${c.unread ? ` <b>${c.unread}</b>` : ''}</button>`).join(' ');
    const msg = (m) => {
      const n = m.from === 'me' ? null : S.npcs[m.from];
      const nm = m.from === 'me' ? S.player.name : n ? n.name : '?';
      const parent = m.to && cur.msgs.find((x) => x.id === m.to);
      return `<div class="chmsg ${m.from === 'me' ? 'me' : ''}${parent ? ' re' : ''}"><div class="chav">${n ? UI.ringAvatar(n, 32, n.id) : `<div class="avatar" style="width:32px;height:32px">${esc(first(nm).slice(0, 1))}</div>`}</div><div class="chbody"><b ${n ? `data-act="profile" data-id="${n.id}"` : ''}>${esc(nm)}</b> <span class="muted small">${U.ago(S.clock, m.t)}</span><div>${esc(m.text)}</div>${G.Refs && m.from !== 'me' ? G.Refs.card(G.Refs.forMsg(m)) : ''}</div></div>`;
    };
    const on = G.settings.channels !== false;
    return `<div class="card"><div class="row between"><h3>📣 Public channels</h3><label class="check small"><input type="checkbox" data-setting="channels" ${on ? 'checked' : ''}> on</label></div>
      <p class="muted small">The town talks about what is really going on in your story: curious, gossipy, defensive. Free (no AI) and never part of your feed. ${G.World.feedRate() === 0 ? '<b>The cast is set to silent, so the channels are quiet.</b>' : ''}</p>
      <div class="row wrap">${tabs}</div><p class="muted small">${esc(cur.icon + ' ' + cur.about)}</p>
      <div class="chlog">${cur.msgs.slice(-40).map(msg).join('') || '<div class="empty small">Quiet for now. Say something, or let the story move.</div>'}</div>
      <div class="row" style="gap:8px;margin-top:8px"><textarea id="ch_text" rows="1" maxlength="400" placeholder="Say something in #${esc(cur.name)}…" style="flex:1"></textarea><button class="btn primary" data-act="chanSend">Send</button></div>
      <div class="row wrap" style="margin-top:8px"><button class="btn sm" data-act="chanSpark" title="Asks the AI for richer messages (shows them to you first)">✨ Spark drama with AI</button></div></div>`;
  };
  A.chanOpen = (d) => { UI.chan = d.id; UI.render(); };
  A.chanGo = (d) => { UI.chan = d.id; UI.go('channels'); };
  A.chanSend = () => {
    const t = document.querySelector('#ch_text');
    try {
      Ch.send(UI.chan || Ch.ensure()[0].id, t ? t.value : '');
      if (t) t.value = '';
    } catch (e) {
      UI.toast(e.message, 'bad');
    }
    UI.render();
  };
  A.chanSpark = async () => {
    try {
      const r = await Ch.spark(UI.chan || Ch.ensure()[0].id);
      UI.toast(r.rejected ? '✕ Rejected: nothing added' : `✨ ${r.made} messages added`, r.rejected ? 'info' : 'good');
    } catch (e) {
      UI.toast(e.message, 'bad');
    }
    UI.render();
  };
})(window.G);
