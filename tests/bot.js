// THE BOT: plays Clout like a real player for many game days (free path, no AI key) and looks for bugs and nonsense.
//   node tests/bot.js [seed] [days] [archetype]     archetypes: grinder kind troll romantic ghost drama social (default: by seed)
// Prints one JSON line: { seed, arch, days, secs, findings: [{sig, count, example}], stats }.  Exit code 1 when there are findings.
// tests/bot-swarm.js runs many of these in parallel and groups the findings.
const { boot, invariants } = require('./harness');
const root = require('path').resolve(__dirname, '..');
const SEED = +(process.argv[2] || 1);
const DAYS = +(process.argv[3] || 30);
const ARCHS = ['grinder', 'kind', 'troll', 'romantic', 'ghost', 'drama', 'social'];
const ARCH = process.argv[4] || ARCHS[SEED % ARCHS.length];
const H = boot(root);
const { w, G, E, errors } = H;

const rng = (() => { let a = (SEED * 2654435761) >>> 0 || 1; return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296); })();
const pick = (l) => l[Math.floor(rng() * l.length)];
const findings = new Map();
const find = (type, text, extra) => {
  const sig = type + '|' + String(text || '').toLowerCase().replace(/\d+/g, '#').replace(/\b(sam|mia|kai|dex|zoe|leo)\b/g, 'X').slice(0, 70);
  const f = findings.get(sig) || { sig, type, count: 0, example: String(text || '').slice(0, 200) + (extra ? ' :: ' + extra : '') };
  f.count++;
  findings.set(sig, f);
};

const DELICATE = ['my mom is in the hospital and I am scared tonight', 'my dad passed away this morning', 'I got fired today and I have no money', 'I feel so alone tonight, I cannot stop crying'];
const NICE = ['you are amazing, thank you for being there', 'I appreciate you so much', 'good morning, hope your day is great', 'want to grab coffee tomorrow at 5pm?'];
const MEAN = ['you are a stupid ugly loser', 'nobody likes you, get lost', 'what a pathetic post lol'];
const FLIRT = ['you look amazing today', 'been thinking about you all day', 'dinner tomorrow at 8pm, just us?'];
const Q = ['do you remember what I told you?', 'what time did we say?', 'what are you up to this weekend?', 'should I quit my job? need advice', 'how was your day?'];
const POSTS = ['coffee then chaos #' , 'new song soon #', 'who is up? #', 'studio all night #', 'big news tomorrow #', 'weekend plans?? #'];

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(60);
  H.freshWorld();
  const G0 = G.settings;
  G0.apiKey = ''; // free path: the built-in brains play every character
  G0.approveActions = false;
  G.World.setSeed(SEED);
  w.Math.random = rng; // deterministic jsdom randomness
  E.Story.approver = async () => true;
  const names = ['Zoe Park', 'Leo Hart', 'Ava Quinn', 'Ben Cole'];
  const pers = ['shy, anxious, sweet', 'calm mentor, formal', 'bubbly, flirty, outgoing', 'blunt, sarcastic, funny'];
  const sts = ['close_friend', 'acquaintance', 'crush', 'friend'];
  names.forEach((n, i) => E.makeNpc({ name: n, handle: '@' + n.split(' ')[0].toLowerCase(), age: 24 + i, personality: pers[i], followers: 1000 * (i + 1), role: 'friend', status: sts[i], aff: 20 + i * 10, trust: 30 }));
  H.seedFeed(20);
  const S0 = () => G.S;
  const npcList = () => Object.values(S0().npcs).filter((n) => !n.userAlt);
  const seenText = new Map(); // npc id -> Map(text -> count)
  const seenIds = new Set();
  let lastPostCount = 0;
  const t0 = Date.now();
  let delicateAt = -1;
  const safe = async (label, fn) => { try { await fn(); } catch (e) { if (!e.user) find('crash:' + label, e && e.message, (e && e.stack || '').split('\n')[1]); } };
  const say = (npc, text) => safe('dm', () => E.dm(npc.id, text));
  const post = (text, extra) => safe('post', () => E.speak(Object.assign({ mode: 'post', text }, extra)));

  for (let day = 1; day <= DAYS; day++) {
    const S = S0();
    const ppl = npcList();
    const target = pick(ppl);
    const act = {
      grinder: async () => { for (let k = 0; k < 8; k++) await post(pick(POSTS) + day + '_' + k); },
      kind: async () => { await post(pick(NICE)); await say(target, pick(NICE)); await say(pick(ppl), pick(Q)); },
      troll: async () => { await post(`${target.handle} ${pick(MEAN)}`); await say(target, pick(MEAN)); },
      romantic: async () => { await say(target, pick(FLIRT)); await say(pick(ppl), pick(FLIRT)); await post(pick(POSTS) + day); },
      ghost: async () => {},
      drama: async () => { if (day % 3 === 1) { await post(pick(DELICATE)); delicateAt = S.clock; } await say(pick(ppl), pick(Q)); await say(target, pick(MEAN.concat(NICE))); },
      social: async () => { await post(pick(POSTS) + day); for (const p of ppl.slice(0, 3)) await say(p, pick(Q.concat(NICE))); const feed = S.postOrder.map((id) => S.posts[id]).filter((p) => !p.replyTo && p.author !== 'me').slice(-3); for (const f of feed) await safe('reply', () => E.reply(f.id, pick(NICE))); },
    }[ARCH];
    await act();
    const fol0 = S.player.followers;
    for (let h = 0; h < 24; h++) { E.tick(60); if (h % 6 === 0) safe('beat', () => G.Live.beat()); }

    /* ---------- oracles: look at everything NPCs said since yesterday ---------- */
    const lines = [];
    S.postOrder.forEach((id) => {
      const p = S.posts[id];
      if (!p || seenIds.has(id)) return;
      seenIds.add(id);
      const npc = S.npcs[p.author];
      if (npc && p.author !== 'me') lines.push({ npc, text: p.text, kind: 'comment', parent: p.replyTo && S.posts[p.replyTo] ? S.posts[p.replyTo].text : '' });
    });
    Object.entries(S.dms).forEach(([nid, list]) => list.forEach((m) => {
      const k = 'dm' + nid + m.id;
      if (m.from === 'me' || seenIds.has(k)) return;
      seenIds.add(k);
      const npc = S.npcs[m.from];
      const lastMine = [...list].reverse().find((x) => x.from === 'me' && x.t <= m.t);
      if (npc) lines.push({ npc, text: m.text, kind: 'dm', parent: lastMine ? lastMine.text : '' });
    }));
    (S.channels || []).forEach((c) => c.msgs.forEach((m) => {
      const k = 'ch' + c.name + m.id + m.t;
      if (seenIds.has(k)) return;
      seenIds.add(k);
      const npc = S.npcs[m.from];
      if (npc) lines.push({ npc, text: m.text, kind: 'channel', parent: '' });
    }));
    for (const L of lines) {
      const t = String(L.text || '');
      const first = L.npc.name.split(' ')[0].toLowerCase();
      if (L.parent && G.Mind.read(L.parent).sens >= 0.5 && G.Mind.flippant(t)) find('flippant-at-delicate:' + L.kind, t, 'to: ' + L.parent);
      if (t.toLowerCase().includes(L.npc.name.toLowerCase())) find('names-self:' + L.kind, t);
      if (new RegExp('(^|[^@\\w])' + first + '\\b\\s*(and \\w+\\s*:|is |was |has |became )', 'i').test(t)) find('third-person-self:' + L.kind, t);
      const given = G.U.first(L.npc.name).toLowerCase();
      if (given.length > 2 && new RegExp('(^|[^@\\w])' + given + '\\b', 'i').test(t.replace(/@\w+/g, ''))) find('says-own-name:' + L.kind, t);
      if (L.kind === 'dm' && new RegExp('\\b' + G.U.first(S.player.name).toLowerCase() + "(?: is | was | has | said | told |'s )", 'i').test(t)) find('third-person-about-you-in-dm', t);
      if (/undefined|\bNaN\b|\[object|\{[a-z]\}|\bnull\b|hi, handsome|hi, gorgeous|\$\{/.test(t)) find('template-leak:' + L.kind, t);
      if (/about "[^"]*about "/i.test(t)) find('nested-quote:' + L.kind, t);
      if (/player reached|reached level|PlayerReached|reached \d+K/i.test(t)) find('meta-leak:' + L.kind, t);
      if (L.kind === 'dm' && /^(ask me later|let me think about that|good question, honestly\?)/i.test(t) && /\?/.test(L.parent)) find('canned-non-answer', t, 'to: ' + L.parent);
      if (L.kind !== 'dm' && G.Mind.read(L.parent).sens >= 0.5 === false && L.kind === 'comment' && L.parent && /\bare they together\b|is it true that/i.test(t) && !/drama|rumou?r/i.test(L.parent)) find('offtopic-gossip-comment', t, 'under: ' + L.parent);
      const m = seenText.get(L.npc.id) || new Map();
      const key = t.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, '').replace(/\s+/g, ' ').trim(); // (the same words with another emoji are the same line)
      m.set(key, (m.get(key) || 0) + 1);
      seenText.set(L.npc.id, m);
      if (m.get(key) === 4 && key.length >= 18) find('repeats-itself', t, L.npc.name); // (a short "thank u" now and then is fine)
    }
    /* ---------- world rules ---------- */
    invariants(G).forEach((b) => find('invariant', b));
    errors.splice(0).forEach((e) => find('console-error', e));
    const partners = {};
    S.npcRel.forEach((e) => { if (['dating', 'partner'].includes(e.type)) { partners[e.a] = (partners[e.a] || 0) + 1; partners[e.b] = (partners[e.b] || 0) + 1; } });
    Object.entries(partners).forEach(([id, c]) => c > 1 && find('two-partners', id + ' has ' + c));
    ppl.forEach((n) => {
      if (['partner', 'dating'].includes(n.status) && n.aff < 0) find('couple-with-negative-aff', `${n.name} ${n.status} aff ${Math.round(n.aff)}`);
      if (['best_friend', 'friend', 'close_friend'].includes(n.status) && n.aff < -60) find('friend-at-minus-aff', `${n.name} ${n.status} aff ${Math.round(n.aff)}`);
      if ((n.mem || []).length > 260) find('memory-unbounded', n.name + ' ' + n.mem.length);
      const junk = (n.mem || []).filter((m) => /was talking about me in/.test(m.text)).length;
      if (junk > 8) find('chatter-in-memory', n.name + ' ' + junk);
      ['aff', 'rom', 'riv', 'trust'].forEach((k) => { if (!Number.isFinite(n[k]) || n[k] < -100 || n[k] > 100) find('stat-out-of-range', `${n.name}.${k}=${n[k]}`); });
    });
    const f = S.player.followers;
    if (f > 250000 * 1.05) find('followers-above-population', String(f));
    if (fol0 > 2000 && f > fol0 * 2.5) find('followers-jump', `${fol0} -> ${f} in one day`);
    if ((S.notifs || []).length > 130) find('notifications-unbounded', String((S.notifs || []).length));
    if (day % 10 === 0) for (const pg of ['home', 'explore', 'messages', 'alerts', 'me', 'channels', 'trends']) { try { G.UI.go(pg); G.UI.render(); } catch (e) { find('render-crash:' + pg, e.message); } }
    const trendTxt = JSON.stringify(S.trending || []);
    if (/PlayerReached|reached level|Reached\d+K/i.test(trendTxt)) find('meta-in-trends', trendTxt.slice(0, 120));
    const size = JSON.stringify(S).length;
    if (size > 5e6) find('save-too-big', (size / 1e6).toFixed(1) + ' MB');
  }
  const S = S0();
  const dmsFromNpc = Object.values(S.dms).flat().filter((m) => m.from !== 'me').length;
  const out = {
    seed: SEED, arch: ARCH, days: DAYS, secs: +((Date.now() - t0) / 1000).toFixed(1),
    stats: { followers: S.player.followers, cash: Math.round(S.player.cash), level: S.player.level, npcs: Object.keys(S.npcs).length, npcDms: dmsFromNpc, statuses: npcList().map((n) => n.status).join(','), mem: npcList().map((n) => (n.mem || []).length).join(',') },
    findings: [...findings.values()].sort((a, b) => b.count - a.count),
  };
  console.log('BOTJSON ' + JSON.stringify(out));
  process.exit(out.findings.length ? 1 : 0);
})().catch((e) => { console.log('BOTJSON ' + JSON.stringify({ seed: SEED, arch: ARCH, crash: String(e && e.stack || e).slice(0, 600) })); process.exit(2); });
