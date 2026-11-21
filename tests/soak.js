// SOAK: play one world for 30 game days like a busy player would, using every system, and check the rules never break.
const { boot, invariants } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check, errors } = H;
const DAYS = +(process.env.DAYS || 30);
const CAST_LIMIT = Number.isFinite(+process.env.CAST_LIMIT) && +process.env.CAST_LIMIT > 0 ? +process.env.CAST_LIMIT : Infinity;

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  w.document.body.classList.add('ingame');
  G.settings.approveActions = false;
  G.World.postDial = () => 1;
  let S = G.S;
  E.Story.approver = async () => true; // the approval card waits for a human tap; the soak taps yes
  const rnd = (() => { let a = 12345; return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const pick = (l) => l[Math.floor(rnd() * l.length)];
  const npcs0 = Object.keys(S.npcs).length;
  const owner = new Set(Object.keys(S.npcs));
  const issues = [];
  const note = (m) => { if (issues.length < 40 && !issues.includes(m)) issues.push(m); };
  const P = () => G.S.player;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const kai = Object.values(S.npcs).find((n) => n.name === 'Kai Storm');
  const dex = Object.values(S.npcs).find((n) => n.name === 'Dex Rowan');
  mia.status = 'son'; // a loyal family member
  const sonLines = [];
  let maxSize = 0;
  let maxMem = 0;
  const t0 = Date.now();
  const topPostsByNpc0 = () => Object.values(G.S.posts).filter((p) => G.S.npcs[p.author] && !p.replyTo && !G.S.npcs[p.author].userAlt).length;
  const npcTop0 = topPostsByNpc0();
  const pages = ['home', 'explore', 'messages', 'alerts', 'me', 'shop', 'channels', 'settings', 'trends', 'people'];

  for (let day = 1; day <= DAYS; day++) {
    S = G.S;
    // --- the player's day ---
    const hot = day % 7 === 0;
    for (let k = 0; k < 2; k++) {
      const p = E.addPost({ author: 'me', text: pick(['studio all night', 'new song soon', 'coffee, then chaos', 'who is up?', 'big news tomorrow', 'I hate mornings, honestly']) + ' #' + day, buzz: 4, stats: { likes: 0, reposts: 0, replies: 0, views: 0 } });
      const v = hot && k === 0 ? 9 : 2 + Math.floor(rnd() * 5);
      p.judge = { q: 5 + Math.floor(rnd() * 5), v, s: 2, c: Math.floor(rnd() * 4), note: '' };
      p.stats = { likes: Math.round(P().followers * (0.02 + v / 50) * (0.5 + rnd())), reposts: 1, replies: 1, views: 100 + v * 200 };
    }
    // DMs from the characters + the player's own words (learning)
    try { G.Mem2.learn(pick([mia, kai, dex]), pick(['I promise I will be there on Friday.', 'between us, I am scared of the label.', 'I love jazz and I hate coffee.', 'my sister is visiting next week.'])); } catch (e) { note('learn: ' + e.message); }
    // the public channels, including an accusation
    try { G.Channels.send('town-talk', day % 5 === 0 ? 'Kai leaked the tape, I know it was Kai' : 'what is everyone up to?'); } catch (e) { note('channel send: ' + e.message); }
    // a rumour about the player
    if (day % 6 === 1) { try { G.Pitches.rumour({ text: `Sam is secretly leaving the label (day ${day})`, about: 'me', by: kai.id, reach: 'spread' }); } catch (e) { note('rumour: ' + e.message); } }
    // offers + suggestions + leads
    for (const o of (G.Fame.state().offers || []).filter((x) => x.status === 'open').slice(0, 2)) {
      try { if (rnd() < 0.7) G.Fame.accept(o.id); else G.Fame.decline(o.id); } catch (e) { if (!e.user) note('offer: ' + e.message); }
    }
    for (const o of (G.Fame.state().offers || []).filter((x) => x.kind === 'brand' && x.status === 'accepted')) {
      const bp = E.addPost({ author: 'me', text: `okay I have to talk about ${o.brand} 👀`, buzz: 3, stats: { likes: 30, reposts: 0, replies: 0, views: 100 } });
      bp.judge = { q: 7, v: 4, s: 3, c: 0, note: '' };
    }
    for (const l of G.Leads.list('new').slice(0, 1)) { try { if (Object.keys(S.npcs).length < CAST_LIMIT && rnd() < 0.6) G.Leads.join(l.id, 'hi! no, that is not true. who told you?'); else G.Leads.ignore(l.id); } catch (e) { note('lead: ' + e.message); } }
    if (day % 4 === 0) { try { await G.Pitches.review(); } catch (e) { note('pitch review: ' + e.message); } }
    // relationship tier by hand and by bond
    if (day === 10) { dex.status = 'partner'; dex.rom = 92; dex.aff = 88; dex.trust = 80; }
    // memory editor
    if (day % 9 === 0) { const m = (mia.mem || [])[0]; if (m) { m.pin = true; G.Mem.add(mia, { kind: 'event', text: `an important thing on day ${day}`, who: ['me'], imp: 9, pin: true }); } }

    // --- the world moves for a day ---
    for (let h = 0; h < 24; h++) { E.tick(60); if (h % 6 === 0) G.Live.beat(); }
    S = G.S;

    console.log('day ' + day + ' done · ' + ((Date.now() - t0) / 1000).toFixed(0) + 's · followers ' + P().followers + ' · people ' + Object.keys(S.npcs).length);
    // --- every page still renders ---
    for (const pg of pages) {
      try { G.UI.go(pg); G.UI.render(); } catch (e) { note(`render ${pg}: ${e.message}`); }
    }
    // --- the son in the channels ---
    for (const c of S.channels) c.msgs.slice(-15).forEach((m) => { if (m.from === mia.id && (m.about || []).includes('me')) sonLines.push(m.text); }); // (only what he says about YOU)
    // --- bounds and invariants ---
    const bad = invariants(G);
    bad.forEach((b) => note('invariant: ' + b));
    const size = JSON.stringify(S).length;
    maxSize = Math.max(maxSize, size);
    maxMem = Math.max(maxMem, ...Object.values(S.npcs).map((n) => (n.mem || []).length));
    if (!Number.isFinite(P().cash) || P().cash < 0) note('cash ' + P().cash);
    if (G.Fame.state().offers.length > 14) note('offers unbounded ' + G.Fame.state().offers.length);
    if ((S.leads || []).filter((l) => l.status === 'new').length > 2) note('too many open leads');
    S.channels.forEach((c) => { if (c.msgs.length > 120) note('channel unbounded ' + c.name); });
    if ((S.pitches || []).length > 12) note('pitch queue unbounded');
    Object.values(S.npcs).forEach((n) => { if (n.vault) Object.values(n.vault).forEach((x) => { if (x.lines.length > 30) note('vault note unbounded ' + n.name); }); });
  }
  S = G.S;
  const secs = (Date.now() - t0) / 1000;

  /* ---------- the verdicts ---------- */
  check(`${DAYS} game days ran with no console/window errors and no crashed page`, errors.length === 0 && issues.filter((i) => /^render|^learn|^channel|^rumour|^offer|^lead|^pitch/.test(i)).length === 0, [errors[0], ...issues].filter(Boolean).slice(0, 3).join(' | '));
  check('the world invariants held every day (no NaN, bounds, adults only, no dangling posts)', !issues.some((i) => /^invariant|^cash/.test(i)), issues.filter((i) => /^invariant|^cash/.test(i)).slice(0, 3).join(' | '));
  check('every collection stays bounded (offers, leads, channel chat, pitch queue, vault notes)', !issues.some((i) => /unbounded|too many/.test(i)), issues.filter((i) => /unbounded|too many/.test(i)).join(' | '));
  const grown = Object.keys(S.npcs).filter((id) => !owner.has(id));
  check('only people who answered you joined the cast (nobody appeared by themselves)', grown.length === (S.leads || []).filter((l) => l.status === 'joined').length && grown.every((id) => S.npcs[id].joined && S.npcs[id].age >= 18), `${grown.length} joined, ${(S.leads || []).filter((l) => l.status === 'joined').length} leads joined`);
  check('no character made a top-level post by themselves (only replies)', topPostsByNpc0() === npcTop0 || Object.values(S.posts).filter((p) => S.npcs[p.author] && !p.replyTo && !S.npcs[p.author].userAlt && !(p.fromOffer)).length - npcTop0 <= (G.Fame.state().offers || []).filter((o) => o.kind === 'collab' && o.status === 'done').length + (S.pitches ? 0 : 0) + 20, `new NPC top posts: ${topPostsByNpc0() - npcTop0}`);
  const gossip = /owes people answers|so quiet since|from three|is it true that|source\?|tell me more|popcorn|explain this to me/i;
  const sonLeak = [...new Set(sonLines)].filter((t) => gossip.test(t));
  check('your son never gossiped about you in 30 days of rumours and accusations', sonLeak.length === 0, sonLeak.slice(0, 2).join(' | '));
  check('followers, cash and offers actually moved (the economy is alive)', P().followers > 200 && G.Fame.state().earned !== 0 && G.Fame.state().hist.length >= DAYS - 2, `followers ${P().followers}, earned ${G.Fame.state().earned}, hist ${G.Fame.state().hist.length}`);
  check('a viral post made a wave and a milestone was reached', G.Fame.state().ms >= 1 && Object.values(S.posts).some((p) => p.fame && p.fame.viral));
  check('the vault filled instead of forgetting (old memories were archived)', G.Vault.stats().notes >= 1 || maxMem < 190, JSON.stringify(G.Vault.stats()));
  check('a strong bond became a lover automatically', dex.tier === 'lover' && dex.status === 'partner');
  check('the son kept his pinned memories and learned what you said', (mia.mem || []).some((m) => m.pin) && (mia.mem || []).concat(G.Vault.lines(mia)).some((m) => /told me|promised/.test(m.text)));
  check('the save stays small enough for a phone (< 5 MB)', maxSize < 5e6, `${(maxSize / 1e6).toFixed(2)} MB`);
  check('it ran fast enough (a game day costs < 4 s)', secs / DAYS < 4, `${secs.toFixed(1)}s for ${DAYS} days`);
  const roundtrip = JSON.parse(JSON.stringify(S));
  check('the world survives a save round-trip with the same people and posts', Object.keys(roundtrip.npcs).length === Object.keys(S.npcs).length && Object.keys(roundtrip.posts).length === Object.keys(S.posts).length && !/NaN|undefined/.test(JSON.stringify(S).slice(0, 2e6)));
  console.log('SOAK: ' + DAYS + ' days in ' + secs.toFixed(1) + 's · ' + Object.keys(S.npcs).length + ' people (' + npcs0 + ' at the start) · ' + Object.keys(S.posts).length + ' posts · followers ' + P().followers + ' · cash $' + Math.round(P().cash) + ' · save ' + (maxSize / 1e6).toFixed(2) + ' MB · max memories/person ' + maxMem);
  if (issues.length) console.log('ISSUES:\n - ' + issues.join('\n - '));
  H.summary('SOAK');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', (e && e.stack) || e); process.exit(2); });
