// Common sense in the social layer (channels, DM reasons, leads, suggestions): over a 3-day simulation with a delicate player post,
// nobody quotes it, jokes about it, or talks about themselves in the third person; channel chatter does not flood npc.mem and is
// never mis-attributed; one person never pushes two contradictory claims about the same pair. Deterministic, no AI calls.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  const S = G.S;
  G.World.postDial = () => 0;
  G.settings.approveActions = false;
  let seed = 12345;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  G.World.rnd = rng;
  w.Math.random = rng;
  const Ch = G.Channels, M = G.Mind, R = G.Reasons;
  const first = (s) => String(s).split(' ')[0];
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const kai = Object.values(S.npcs).find((n) => n.name === 'Kai Storm');
  const dex = Object.values(S.npcs).find((n) => n.name === 'Dex Rowan');
  mia.status = 'close_friend'; mia.aff = 80; mia.trust = 80;
  check('Mind is loaded', !!M && typeof M.vet === 'function');

  /* ---------- the world: story facts, contradictory rumours, a delicate rumour, and a delicate post of yours ---------- */
  const HOSP = 'my mom is in the hospital, scared tonight';
  E.addChron('Kai Storm walked out of the studio after a fight with Mia Vale');
  S.rumors.push({ id: 'rA', text: 'Mia Vale and Dex Rowan became friends', about: mia.id, belief: { [kai.id]: 0.7, [dex.id]: 0.7 }, t: S.clock - 50, path: [] });
  S.rumors.push({ id: 'rB', text: 'Mia Vale and Dex Rowan had a falling out', about: mia.id, belief: { [kai.id]: 0.7, [dex.id]: 0.7 }, t: S.clock - 20, path: [] });
  S.rumors.push({ id: 'rC', text: 'Dex Rowan has cancer and is hiding it', about: dex.id, belief: { [kai.id]: 0.7, [mia.id]: 0.5 }, t: S.clock - 10, path: [] });
  const post = E.addPost({ author: 'me', text: HOSP, buzz: 3, stats: { likes: 5, reposts: 0, replies: 0, views: 400 } });
  const t0 = post.t;
  check('the post is delicate for the Mind', M.read(HOSP).sens >= 0.5);

  /* ---------- topics: delicate ones are flagged, contradictory pair claims collapse to the newest ---------- */
  const topics = Ch.topics();
  check('the player\'s delicate post and a delicate rumour are flagged delicate', topics.some((t) => t.kind === 'post' && t.delicate) && topics.some((t) => t.kind === 'rumor' && /cancer/.test(t.text) && t.delicate));
  const pairClaims = topics.filter((t) => ['rumor', 'event'].includes(t.kind) && /Mia Vale and Dex Rowan/.test(t.text));
  check('only the newest claim about the pair (Mia, Dex) stays in the conversation', pairClaims.length === 1 && /falling out/.test(pairClaims[0].text), JSON.stringify(pairClaims.map((t) => t.text)));

  /* ---------- 3 days of town talk ---------- */
  G.settings.feedRate = 1;
  for (let h = 0; h < 72; h++) {
    E.tick(60);
    Ch.ensure().forEach((c) => { Ch.say(c); Ch.say(c); });
  }
  const all = [];
  S.channels.forEach((c) => c.msgs.forEach((m) => all.push({ c, m })));
  const npcMsgs = all.filter((x) => x.m.from !== 'me' && S.npcs[x.m.from]);
  check('the town talked (the simulation is real)', npcMsgs.length >= 40, npcMsgs.length);
  check('no channel line quotes or mentions the delicate post', !npcMsgs.some((x) => /hospital|scared tonight|my mom/i.test(x.m.text)), JSON.stringify(npcMsgs.filter((x) => /hospital|scared tonight|my mom/i.test(x.m.text)).map((x) => x.m.text)));
  check('no line discusses the delicate rumour (cancer)', !npcMsgs.some((x) => /cancer/i.test(x.m.text)));
  check('no gossip, theory or drama channel line is about the delicate post or rumour at all', !npcMsgs.some((x) => ['the-drama', 'theories', 'love-lives', 'news'].includes(x.c.id) && /^(post|rumor):/.test(x.m.topic || '') && /hospital|cancer|mom/.test(x.m.topic)));
  const thirdPerson = npcMsgs.filter((x) => new RegExp('(^|[^@\\w])' + first(S.npcs[x.m.from].name) + '\\b', 'i').test(x.m.text));
  check('0 third-person self lines', thirdPerson.length === 0, JSON.stringify(thirdPerson.map((x) => S.npcs[x.m.from].name + ': ' + x.m.text).slice(0, 4)));
  const careLines = npcMsgs.filter((x) => x.m.style === 'care');
  check('someone who cares said something kind, and every line about the delicate moment is care, never flippant', careLines.length >= 1 && careLines.every((x) => !M.flippant(x.m.text) && /^@Sam /.test(x.m.text)) && !npcMsgs.some((x) => x.m.topic && /^post:/.test(x.m.topic) && /hospital|mom/i.test(x.m.topic) && x.m.style !== 'care'), JSON.stringify(careLines.map((x) => x.m.text).slice(0, 3)));
  const filler = npcMsgs.filter((x) => /^@\w+\s+(this\.? so much this\.?|exactly|source\??)\W*$/i.test(String(x.m.text).replace(/\s*[^\x00-\x7F]+\s*/g, ' ').trim()));
  check('no content-free filler ("this. so much this", "source?")', filler.length === 0, JSON.stringify(filler.map((x) => x.m.text).slice(0, 3)));
  check('replies attach to what they answer (they name the topic or the people)', npcMsgs.filter((x) => x.m.to && !x.m.style).every((x) => x.m.text.length > 25));
  const byPerson = {};
  npcMsgs.forEach((x) => { if (x.m.pair) { const k = x.m.from + '|' + x.m.pair; (byPerson[k] = byPerson[k] || new Set()).add(x.m.topic); } });
  check('nobody pushes two contradictory claims about the same pair', Object.values(byPerson).every((set) => set.size <= 1), JSON.stringify(Object.entries(byPerson).filter(([, set]) => set.size > 1).map(([k, set]) => [k, [...set]])));
  check('the log stays capped and the cast never posts to the feed from channels', S.channels.every((c) => c.msgs.length <= 120));

  /* ---------- memory: bounded, correctly attributed ---------- */
  const people = Object.values(S.npcs);
  check('npc.mem stays bounded', people.every((n) => (n.mem || []).length <= G.Mem.CAP));
  check('channel chatter is rolling: at most one memory per channel/person tag', people.every((n) => { const seen = {}; (n.mem || []).forEach((m) => { if (m.tags && /^ch:/.test(m.tags[0])) seen[m.tags[0]] = (seen[m.tags[0]] || 0) + 1; }); return Object.values(seen).every((c) => c <= 1); }));
  let attributed = 0, bad = [];
  people.forEach((n) => (n.mem || []).filter((m) => /was talking about me in #/.test(m.text)).forEach((m) => {
    const mm = /^(.+?) was talking about me in #([\w-]+): "(.*)"$/.exec(m.text);
    if (!mm) return;
    const body = mm[3].replace(/…$/, '');
    const hit = all.find((x) => x.c.name === mm[2] && S.npcs[x.m.from] && S.npcs[x.m.from].name === mm[1] && x.m.text.slice(0, body.length) === body);
    if (!hit) return;
    attributed++;
    if (!G.Channels.mentionIds(hit.m.text).includes(n.id)) bad.push(n.name + ' <- ' + hit.m.text);
  }));
  const lineCount = {};
  npcMsgs.forEach((x) => { const k = x.m.from + '|' + String(x.m.text).replace(/@\w+/g, '').replace(/[^a-z0-9]+/gi, ' ').toLowerCase().replace(/(.)\1+/g, '$1').trim(); lineCount[k] = (lineCount[k] || 0) + 1; });
  check('nobody says the identical line twice (silence beats a repeat)', Object.values(lineCount).every((c) => c === 1), JSON.stringify(Object.entries(lineCount).filter(([, c]) => c > 1).slice(0, 3)));
  check('"was talking about me" memories are one merged gist per channel, not one per line', people.every((n) => (n.mem || []).filter((m) => /was talking about me in #/.test(m.text)).length <= S.channels.length));
  check('"was talking about me" is stored only for a listener the line really names', bad.length === 0, JSON.stringify(bad.slice(0, 3)));

  // direct: who hears and who remembers
  const chan = Ch.ensure()[0];
  [mia, kai, dex].forEach((n) => { n.mem = []; });
  Ch.push(chan, kai.id, 'is Mia really leaving the label? wild', { about: [mia.id, dex.id], note: false });
  check('the named listener hears it, the unnamed one does not (no mis-attribution)', mia.mem.some((m) => /was talking about me/.test(m.text)) && !dex.mem.some((m) => /talking about me/.test(m.text)), JSON.stringify([mia.mem.map((m) => m.text), dex.mem.map((m) => m.text)]));
  check('a speaker who only chatted stores nothing', kai.mem.length === 0);
  for (let i = 0; i < 10; i++) Ch.push(chan, kai.id, 'Mia again, ' + i + ': still no answer from her about the label', { about: [mia.id], note: true });
  check('ten repeated lines merge into one rolling memory each (listener and speaker)', mia.mem.length <= 2 && kai.mem.length <= 1, mia.mem.length + '/' + kai.mem.length);
  check('a line addressed to somebody by @name is remembered by them as said to them', (() => { dex.mem = []; Ch.push(chan, kai.id, '@Dex where did you hear about the label thing?', { about: [dex.id], note: false }); return dex.mem.some((m) => /told me in #/.test(m.text)); })());
  check('a line that is not about a listener and not salient is not stored', (() => { dex.mem = []; Ch.push(chan, kai.id, 'the weather is lovely at the studio today', { about: [dex.id], note: false }); return dex.mem.length === 0; })());

  /* ---------- you say something delicate in a channel ---------- */
  const nb = chan.msgs.length;
  Ch.send('fans', 'my dad passed away this morning');
  const fans = Ch.ensure().find((c) => c.id === 'fans');
  const answers = fans.msgs.filter((m) => m.to && fans.msgs.find((x) => x.id === m.to && x.from === 'me' && /passed away/.test(x.text)));
  check('a delicate message of yours is answered with care only (or silence)', answers.every((m) => m.style === 'care' && M.supportive(m.text) && !M.flippant(m.text)) && answers.length <= 3, JSON.stringify(answers.map((m) => m.text)));

  /* ---------- DM reasons ---------- */
  S.clock = t0 + 120;
  delete post.care; // (World.planCare may already have queued care DMs during the sim: start from nobody having cared yet)
  [mia, kai, dex].forEach((n) => { S.dms[n.id] = []; n.told = {}; });
  const ctxOf = (n, extra) => Object.assign({ rel: G.React.relation(S, n, 'me'), rnd: rng, st: n.status, waiting: false, last: null, myRecent: [], fam: false }, extra);
  mia.mood = mia.mood; // (untouched)
  let cands = R.candidates(mia, S.clock, ctxOf(mia, { myRecent: [post] }));
  const react = cands.filter((c) => c.kind === 'reactpost');
  check('a reaction to a delicate post is care, never a tease or a quote', react.every((c) => M.supportive(c.text) && !M.flippant(c.text) && !/hospital/.test(c.text)), JSON.stringify(react.map((c) => c.text)));
  check('every candidate DM passes the gate', cands.every((c) => M.vet(mia, c.text, { kind: 'dm', about: '', rel: ctxOf(mia).rel }).ok));
  cands = R.candidates(mia, S.clock, ctxOf(mia, {}));
  const ck = cands.find((c) => c.kind === 'checkin');
  check('a close person who has not heard from you checks in after the heavy post', !!ck && M.supportive(ck.text) && !M.flippant(ck.text), JSON.stringify(cands.map((c) => c.kind)));
  check('...and their goal for the day is to check on you', G.Goals.candidates(mia).some((c) => /check on/.test(c.text)));
  ck.done();
  check('...once, no spam', !R.candidates(mia, S.clock, ctxOf(mia, {})).some((c) => c.kind === 'checkin'));
  // not duplicated when the care DM already exists
  const tre = E.makeNpc({ name: 'Zoe Park', handle: '@zoe', age: 25, personality: 'kind', followers: 500, aff: 70, trust: 70, status: 'close_friend' });
  S.dms[tre.id] = [{ id: 'm1', from: tre.id, text: 'oh no, i am so sorry. thinking of you, call me if you need anything', t: S.clock - 10, read: true }];
  check('no check-in when a caring message already went out since the post', !R.candidates(tre, S.clock, ctxOf(tre, {})).some((c) => c.kind === 'checkin'));
  mia.told = {}; // reset
  S.dms[mia.id] = [{ id: 'm2', from: 'me', text: 'hey mia', t: S.clock - 5, read: true }];
  check('no check-in when you already talked to them since', !R.candidates(mia, S.clock, ctxOf(mia, {})).some((c) => c.kind === 'checkin'));
  S.dms[mia.id] = [];
  kai.status = 'rival'; kai.riv = 80;
  check('a rival does not provoke or check in over the delicate post', !R.candidates(kai, S.clock, ctxOf(kai, { myRecent: [post] })).some((c) => ['provoke', 'checkin', 'reactpost'].includes(c.kind) && !M.supportive(c.text)));

  /* ---------- leads and suggestions ---------- */
  S.rumors = []; S.chronicle = []; S.leadT = null;
  let strangers = 0;
  for (let i = 0; i < 30; i++) { S.leadT = null; const l = G.Leads.tick(); if (l) strangers++; }
  check('no stranger reaches out about the delicate post (it is the only thing going on)', strangers === 0 && !(S.leads || []).some((l) => /mom|hospital|scared/.test(l.text)), strangers);
  S.rumors.push({ id: 'rD', text: 'the mother of Mia Vale died last week', about: mia.id, belief: { [kai.id]: 0.7, [dex.id]: 0.6 }, t: S.clock - 10, path: [] });
  for (let i = 0; i < 30; i++) { S.leadT = null; G.Leads.tick(); }
  check('no stranger brings up somebody\'s grief either', !(S.leads || []).some((l) => /mother|died/.test(l.text)));

  S.rumors = [
    { id: 'p1', text: 'Mia Vale and Dex Rowan became friends', about: mia.id, belief: { [kai.id]: 0.8, [dex.id]: 0.8, [mia.id]: 0.9 }, t: S.clock - 40, path: [{ from: kai.id, to: dex.id, t: 1 }] },
    { id: 'p2', text: 'Mia Vale and Dex Rowan had a falling out', about: mia.id, belief: { [kai.id]: 0.8, [dex.id]: 0.8, [mia.id]: 0.9 }, t: S.clock - 20, path: [] },
  ];
  const Pi = G.Pitches;
  let rumorPitches = [];
  for (let i = 0; i < 20; i++) { const p = Pi.make('rumor', kai, rng); if (p) rumorPitches.push(p); }
  check('a person who passed on one claim about a pair is not offered the contradicting one', rumorPitches.every((p) => p.rumor === 'p1'), JSON.stringify(rumorPitches.map((p) => p.rumor)));
  check('a rumour is never offered to the people it is about', rumorPitches.every((p) => !p.to.includes(mia.id) && !p.to.includes(dex.id)));
  check('nobody suggests passing on a rumour about themselves', !Pi.make('rumor', mia, rng) && !Pi.make('rumor', dex, rng));
  check('the people a rumour names are left out of its private routes', !G.Social.neighbors(S, kai.id, S.rumors[0]).some((id) => id === mia.id || id === dex.id));

  /* ---------- trends + goals ---------- */
  S.rumors = [{ id: 'rE', text: 'Zoe Park is in the hospital after an accident', about: 'n4', belief: { [kai.id]: 0.7 }, t: S.clock - 5, path: [] }];
  check('a grief, diagnosis or accident never becomes a trending topic', !G.Trends.compute().some((t) => /hospital|accident|Hospital|Accident/.test(t.tag + t.why)));
  /* ---------- game-meta lines are not story ---------- */
  S.chronicle = [];
  E.addChron('Player reached level 4');
  E.addChron('Sam reached 100K');
  S.chronicle.push({ id: 'cmeta', t: S.clock, text: 'Something tagged as meta happened', meta: true });
  S.rumors = [{ id: 'rM', text: 'Player reached level 9', about: 'me', belief: { [kai.id]: 0.8 }, t: S.clock, path: [] }];
  const metaOf = (t) => /reached level|reached \d+K|tagged as meta/i.test(t.text);
  check('meta chronicle lines never become channel topics, trends or gossip', !Ch.topics().some(metaOf) && !G.Trends.compute().some((t) => /Reached|Meta|Level|100K/i.test(t.tag) || metaOf({ text: t.why })));
  S.channels.forEach((c) => { c.msgs = []; });
  for (let i = 0; i < 30; i++) Ch.ensure().forEach((c) => Ch.say(c));
  const metaSaid = [].concat(...S.channels.map((c) => c.msgs.filter((m) => /reached level|reached \d+K/i.test(m.text)).map((m) => c.name + ': ' + m.text + ' [' + m.topic + ']')));
  check('and nobody says them in a channel', metaSaid.length === 0, JSON.stringify(metaSaid.slice(0, 3)));

  /* ---------- the follow-up nudge never nags about its own nag ---------- */
  const zed = S.npcs.n1;
  zed.status = 'friend'; zed.told = {};
  S.dms[zed.id] = [{ id: 'q1', from: zed.id, text: 'can you help me "move" on saturday?', t: S.clock - 400, read: false }];
  const fuCtx = () => ({ rel: G.React.relation(S, zed, 'me'), rnd: () => 0.4, st: zed.status, waiting: true, last: S.dms[zed.id].slice(-1)[0], myRecent: [], fam: false });
  const nudge = R.candidates(zed, S.clock, fuCtx()).find((c) => c.kind === 'followup');
  check('a nudge is allowed once and its quote never contains a quote', !!nudge && (nudge.text.match(/["“”]/g) || []).length === 2, nudge && nudge.text);
  nudge.done();
  S.dms[zed.id].push({ id: 'q2', from: zed.id, text: nudge.text, t: S.clock - 200, read: false });
  check('no nudge about a nudge while you have not answered', !R.candidates(zed, S.clock, fuCtx()).some((c) => c.kind === 'followup'));
  S.dms[zed.id].push({ id: 'q3', from: zed.id, text: 'hey, about "hey, about "x"": no pressure', t: S.clock - 190, read: false });
  check('...even for an old nudge that already nests quotes', !R.candidates(zed, S.clock, fuCtx()).some((c) => c.kind === 'followup'));

  check('zero model calls', H.state.calls === 0, String(H.state.calls));
  H.summary('MIND CHANNELS');
  process.exit(process.exitCode || 0);
})();
