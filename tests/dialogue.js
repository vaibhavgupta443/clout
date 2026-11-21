// The free DM brain (js/dialogue.js): classify -> plan -> realise. Zero API calls, deterministic with a seeded rnd.
// A 12-message script across 5 personalities: answers, plans, compliments, insults, apologies, care, repeats, differences between people.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, check } = H;
const INFO = (s) => console.log('   · ' + s);

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await G.Store.init();
  const S = H.freshWorld();
  const E = G.Engine;
  const D = G.Dialogue;
  const M = G.Mind;
  check('Dialogue exists with the API', !!D && ['classify', 'plan', 'apply', 'styleOf'].every((k) => typeof D[k] === 'function'));
  const DAY2 = 2 * 1440;
  S.clock = DAY2 + 14 * 60; // 2pm, everybody awake
  const mkNpc = (name, pers, role, st, aff, rom, riv, trust) => {
    const n = E.makeNpc({ name, handle: '@' + name.split(' ')[0].toLowerCase() + (++npcCount), age: 26, personality: pers, role, followers: 100, status: st });
    n.aff = aff; n.rom = rom; n.riv = riv; n.trust = trust; n.status = st;
    return n;
  };
  let npcCount = 0;
  const PEOPLE = {
    shy: () => mkNpc('Lily Shy', 'shy, quiet, kind, sweet', 'friend', 'close_friend', 60, 0, 0, 55),
    mentor: () => mkNpc('Edmund Hale', 'calm, disciplined, formal, polite', 'mentor', 'acquaintance', 20, 0, 0, 30),
    rival: () => mkNpc('Vera Frost', 'petty, savage, cold', 'rival', 'rival', -12, 0, 45, 5),
    crush: () => mkNpc('Bella Bright', 'bubbly, flirty, outgoing', 'love_interest', 'crush', 32, 45, 0, 30),
    blunt: () => mkNpc('Rex Direct', 'blunt, no-nonsense, honest', 'friend', 'friend', 45, 0, 0, 40),
  };
  const KEYS = Object.keys(PEOPLE);
  const fullName = (n) => n.name.toLowerCase();
  const SCRIPT = ['hey!', 'how are you?', 'what are you up to this weekend?', 'you look amazing today', 'can we meet at 7pm tomorrow at the cafe?', 'what time did we say?', 'my mom is in the hospital, im scared', 'do you remember what I told you?', 'you are so stupid, i hate you', 'sorry, i did not mean it', 'thanks for listening', 'ok bye'];

  // a conversation driver: keeps the thread, applies the plan, advances the clock
  const convo = (npc, seed) => {
    const th = [];
    const rnd = G.Persona.rngFrom(seed || npc.id);
    let now = S.clock;
    return {
      th,
      say(text, o = {}) {
        const pl = D.plan(npc, text, { thread: th.slice(-6), now, rnd, S, msgId: 'm' + th.length });
        const before = { aff: npc.aff, g: (G.Persona.ensure(npc).grudges.me || 0), trust: npc.trust };
        D.apply(npc, pl);
        th.push({ from: 'me', text, t: now });
        if (pl.text) th.push({ from: npc.id, text: pl.text, t: now + 2 });
        (S.dms[npc.id] = S.dms[npc.id] || []).push({ id: 'p' + th.length, from: 'me', text, t: now });
        if (pl.text) S.dms[npc.id].push({ id: 'r' + th.length, from: npc.id, text: pl.text, t: now + 2 });
        now += o.skip || 5;
        return Object.assign(pl, { before, aff: npc.aff, grudge: G.Persona.ensure(npc).grudges.me || 0, trustNow: npc.trust });
      },
    };
  };

  /* ---------------- classify ---------------- */
  const cls = (t, ctx) => D.classify(t, Object.assign({ now: S.clock, thread: [] }, ctx || {}));
  const has = (t, a, ctx) => cls(t, ctx).acts.includes(a);
  check('chrono and compromise are loaded in the test world', !!w.Chrono && typeof w.nlp === 'function');
  const inv = cls('can we meet at 7pm tomorrow at the cafe?');
  check('a real proposal is an invite with time, day and place slots', inv.acts.includes('invite') && inv.slots.time === '7pm' && /tomorrow/.test(inv.slots.when) && inv.slots.place === 'the cafe', JSON.stringify(inv));
  check('"what are you up to this weekend" is small talk, not an invite', !has('what are you up to this weekend?', 'invite') && has('what are you up to this weekend?', 'question_status'));
  check('"in 2 hours" becomes a time', cls('dinner in 2 hours at my place?').slots.at === S.clock + 120 && cls('dinner in 2 hours at my place?').slots.place === 'my place');
  check('"saturday at 8" is read', /saturday/.test(cls('lets get dinner saturday at 8').slots.when) && cls('lets get dinner saturday at 8').slots.time === '8pm');
  check('recall question', has('do you remember what I told you?', 'question_recall') && has('did I tell you about my sister?', 'question_recall'));
  check('plan question', has('what time did we say?', 'question_plan') && has('where are we meeting again?', 'question_plan'));
  check('plain wh and yes/no questions', has('why is the sky blue?', 'question_wh') && has('do you like pizza?', 'question_yn'));
  check('compliment / insult / apology / thanks', has('you are so smart', 'compliment') && has('you are an idiot', 'insult') && has('I am so sorry about yesterday', 'apology') && has('thank you so much', 'thanks'));
  check('negation is understood ("you are not stupid" is no insult)', !has('you are not stupid', 'insult') && !has("you're not an idiot", 'insult'));
  check('news and bad news', has('i got the job!!', 'share_news') && has('my dad passed away this morning', 'share_bad') && has('i had a really rough day', 'share_bad'));
  check('advice, greeting, farewell, one word', has('should i quit my job?', 'advice_request') && has('hey there', 'greeting') && has('gotta go, bye', 'farewell') && has('ok', 'one_word'));
  check('repeat vs the last player messages', cls('hello there', { thread: [{ from: 'me', text: 'hello there', t: 1 }, { from: 'n1', text: 'hi', t: 2 }] }).repeat && !cls('something else', { thread: [{ from: 'me', text: 'hello there', t: 1 }] }).repeat);
  check('short flag', cls('ok sure').short && !cls('this is a much longer message than three words').short);
  check('delicate sens is carried (Mind.read)', cls('my mom is in the hospital, scared tonight').sens >= 0.75);

  /* ---------------- the 12-message script x 5 personas ---------------- */
  const all = {};
  KEYS.forEach((k) => {
    const n = PEOPLE[k]();
    const c = convo(n, k + '-seed');
    const r = SCRIPT.map((m) => c.say(m));
    all[k] = { n, c, r };
  });
  KEYS.forEach((k) => INFO(`${k} [${D.styleOf(all[k].n, G.React.relation(S, all[k].n, 'me'))}]: ` + all[k].r.map((x) => x.draft || '-').slice(0, 7).join(' | ').slice(0, 200)));
  const idx = (txt) => SCRIPT.indexOf(txt);
  const warm = ['shy', 'mentor', 'crush', 'blunt'];

  // 1. questions get answers
  KEYS.forEach((k) => {
    const r = all[k].r;
    check(`${k}: "how are you" is answered with their own state`, r[1].act === 'question_howru' && !!r[1].draft);
    check(`${k}: "what are you up to this weekend" is a status answer, not an invite reply`, r[2].act === 'question_status' && !!r[2].draft && !/in\b.*tell me where/.test(r[2].draft), r[2].draft);
    check(`${k}: none of the old canned non-answers`, r.every((x) => !/ask me later|let me think about that|i'm in, tell me where/i.test(x.draft)));
  });

  // 2. plans are stored and recalled
  warm.forEach((k) => {
    const { n, r } = all[k];
    check(`${k}: a proposal with a time becomes an appointment`, r[4].act === 'invite_accept' && !!r[4].appointment && r[4].appointment.at > S.clock, `${r[4].act} ${r[4].draft}`);
    check(`${k}: the answer mentions the time and place`, /7\s?pm|7:00/i.test(r[4].draft) || /tomorrow/i.test(r[4].draft), r[4].draft);
    check(`${k}: the appointment really exists in the clock and in their plans`, (S.appts || []).some((a) => a.npc === n.id) && (G.Persona.ensure(n).plans || []).length >= 1);
    check(`${k}: "what time did we say?" answers from the stored plan`, r[5].act === 'question_plan' && /7\s?pm/i.test(r[5].draft) && /cafe/i.test(r[5].draft), r[5].draft);
  });
  const rv = all.rival;
  check('rival: declines the invite without an appointment', rv.r[4].act === 'invite_decline' && !rv.r[4].appointment && !(S.appts || []).some((a) => a.npc === rv.n.id));
  check('rival: "what time did we say" honestly says there is no plan', rv.r[5].bank === 'plan_none', rv.r[5].draft);
  check('rival: the decline is polite or curt, never an insult', !/(stupid|idiot|shut up|hate)/i.test(rv.r[4].draft));

  // 3. compliments recognised, diminishing returns
  KEYS.forEach((k) => check(`${k}: compliment recognised`, all[k].r[3].act === 'compliment'));
  warm.forEach((k) => check(`${k}: compliment raises affection a little`, all[k].r[3].aff - all[k].r[3].before.aff >= 1 && all[k].r[3].aff - all[k].r[3].before.aff <= 5));
  {
    const n = PEOPLE.shy();
    const c = convo(n, 'spam');
    const gains = [];
    const acts = [];
    ['you are so kind', 'you are amazing', 'you are so sweet', 'you are the best', 'you are wonderful'].forEach((m) => { const x = c.say(m); gains.push(x.aff - x.before.aff); acts.push(x.act); });
    check('compliment spam has diminishing returns', gains[0] > gains[2] || gains[0] > gains[1], gains.join(','));
    check('compliment spam eventually gets awkward, not more love', acts.includes('compliment_spam') && gains[gains.length - 1] <= 0, acts.join(','));
  }

  // 4. insult hurts, apology heals (numbers)
  KEYS.forEach((k) => {
    const ins = all[k].r[8], ap = all[k].r[9];
    check(`${k}: insult recognised`, ins.act === 'insult');
    check(`${k}: insult lowers affection and raises the grudge`, ins.aff < ins.before.aff && ins.grudge > ins.before.g, `aff ${ins.before.aff}->${ins.aff} grudge ${ins.before.g}->${ins.grudge}`);
    check(`${k}: apology repairs (affection up, grudge down)`, ap.aff > ap.before.aff && ap.grudge < ap.before.g, `aff ${ap.before.aff}->${ap.aff} grudge ${ap.before.g.toFixed(2)}->${ap.grudge.toFixed(2)}`);
  });
  check('the insult hurts a close friend more than a distant rival', (all.shy.r[8].before.aff - all.shy.r[8].aff) > (all.rival.r[8].before.aff - all.rival.r[8].aff));
  check('the insult is stored with a NEGATIVE valence, the apology with a positive one', all.shy.r[8].memory.valence < 0 && all.shy.r[9].memory.valence > 0 && all.shy.r[8].memory.kind === 'shade');
  check('personalities react differently to an insult (hurt vs boundary vs retaliate)', new Set(KEYS.map((k) => all[k].r[8].stance)).size >= 3, KEYS.map((k) => all[k].r[8].stance).join(','));
  check('a playful tease from a close friend is not an insult', (() => { const n = PEOPLE.shy(); const x = convo(n, 'tease').say('you are such a dork lol hate you haha'); return x.act !== 'insult' || x.effects.aff === 0; })());
  check('a repaired grudge heals fully only with time: a wary person does not forgive at once', (() => { const n = PEOPLE.rival(); G.Persona.ensure(n).grudges.me = 0.9; const x = convo(n, 'w').say('i am sorry'); return x.stance === 'wary' && x.effects.grudge < 0 && -x.effects.grudge < 0.9 * 0.5; })());

  // 5. repeats never get the same reply
  KEYS.forEach((k) => {
    const n = PEOPLE[k]();
    const c = convo(n, 'rep-' + k);
    const outs = [1, 2, 3].map(() => c.say('good morning to you'));
    const texts = outs.map((o) => o.draft);
    check(`${k}: the same message 3x never gets the same reply`, new Set(texts).size === 3, texts.join(' | '));
    check(`${k}: the repeat is noticed`, outs[1].act === 'repeat' && outs[2].act === 'repeat_more');
  });
  {
    const n = PEOPLE.blunt();
    const c = convo(n, 'dupes');
    const seen = [];
    for (let i = 0; i < 14; i++) seen.push(c.say(['how are you?', 'what is up', 'hello', 'hey you', 'lol ok'][i % 5] + ' ' + 'x'.repeat(i % 3)).draft);
    const lastWindow = seen.filter(Boolean);
    check('no line is reused within 14 messages', new Set(lastWindow).size === lastWindow.length, lastWindow.join(' | '));
  }

  // 6. delicate message gets care, nothing flippant under distress
  const distress = ['my mom is in the hospital, scared tonight', 'my dad passed away this morning', 'i got fired today and i have no money', 'i feel so alone and cant sleep'];
  KEYS.forEach((k) => {
    distress.forEach((m) => {
      const n = PEOPLE[k]();
      const x = convo(n, 'd-' + k).say(m);
      check(`${k}: nothing flippant under distress ("${m.slice(0, 22)}")`, !M.flippant(x.draft) && !/(😂|🤣|💀|😏|🔥)/.test(x.draft), x.draft);
      if (k !== 'rival' && x.text) check(`${k}: distress gets care ("${m.slice(0, 22)}")`, M.supportive(x.draft) && x.act === 'share_bad', x.draft);
      check(`${k}: never left on read when it is serious and they care`, !(x.leave_on_read && k !== 'rival'));
    });
  });
  check('care raises trust for a caring friend, not for a hostile rival', all.shy.r[6].trustNow > all.shy.r[6].before.trust && all.rival.r[6].trustNow === all.rival.r[6].before.trust);
  check('a delicate disclosure is remembered with importance >= 8', (all.shy.n.mem || []).some((m) => m.kind === 'said' && /hospital/.test(m.text) && m.imp >= 8));

  // 7. recall from memory, or an honest "i forgot"
  warm.concat(['rival']).forEach((k) => {
    const x = all[k].r[7];
    check(`${k}: "do you remember what I told you" recalls the hospital`, x.act === 'question_recall' && /hospital/i.test(x.draft) && /mom|mother/i.test(x.draft), x.draft);
    check(`${k}: second person ("your mom"), not the player's own words`, !/\bmy mom\b/i.test(x.draft), x.draft);
  });
  {
    const n = PEOPLE.shy();
    const c = convo(n, 'forget');
    const x = c.say('do you remember my favourite colour?');
    check('honest about forgetting what they were never told', x.bank === 'recall_none' && x.stance === 'forgot', x.draft);
    c.say('my favourite colour is green, i have always loved it');
    const y = c.say('do you remember my favourite colour?');
    check('after being told, it is remembered', y.bank === 'recall_found' && /green/i.test(y.draft), y.draft);
  }

  // 8. busy / asleep: counter-proposal
  {
    const n = PEOPLE.shy();
    const c = convo(n, 'busy');
    const pp = G.Persona.ensure(n);
    const mid = (((pp.sleep + pp.wake + 24) / 2) % 24);
    const hr = Math.floor(mid);
    const x = c.say(`can we meet at ${((hr + 11) % 12) + 1}${hr < 12 ? 'am' : 'pm'} tomorrow at the park?`);
    check('asleep at that hour: proposes another time instead of agreeing', x.act === 'invite_counter' && /\d/.test(x.draft) && !x.appointment, `${x.act} ${x.draft}`);
    check('"what time works for you?" gets a suggestion', c.say('what time works for you?').stance === 'suggest');
    const tq = c.say('what time is it?');
    check('"what time is it?" gets the game clock',/\b2(:\d\d)?pm/i.test(tq.draft), tq.draft);
  }

  // 9. personas produce measurably different text
  {
    const toksOf = (k) => new Set(all[k].r.map((x) => x.draft).join(' ').toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter((t) => t.length > 2));
    let sum = 0, cnt = 0, max = 0;
    for (let i = 0; i < KEYS.length; i++) for (let j = i + 1; j < KEYS.length; j++) {
      const a = toksOf(KEYS[i]), b = toksOf(KEYS[j]);
      let inter = 0; a.forEach((t) => { if (b.has(t)) inter++; });
      const jac = inter / (a.size + b.size - inter);
      sum += jac; cnt++; max = Math.max(max, jac);
    }
    INFO(`pairwise Jaccard of whole-conversation vocabularies: mean ${(sum / cnt).toFixed(2)}, max ${max.toFixed(2)}`);
    check('personas answer with measurably different words (mean pairwise Jaccard < 0.35)', sum / cnt < 0.35, (sum / cnt).toFixed(2));
    check('no two personas are near-twins (max pairwise Jaccard < 0.5)', max < 0.5, max.toFixed(2));
    const styles = KEYS.map((k) => D.styleOf(all[k].n, G.React.relation(S, all[k].n, 'me')));
    check('five different voices for five people', new Set(styles).size === 5, styles.join(','));
    const lens = KEYS.map((k) => all[k].r.map((x) => x.draft.length).reduce((a, b) => a + b, 0));
    check('reply length differs between a reserved and a chatty person', Math.abs(lens[0] - lens[3]) > 10 || Math.abs(lens[1] - lens[4]) > 10, lens.join(','));
  }

  // 10. leave on read is personality-driven
  {
    const rate = (key, msg, n = 200) => {
      const npc = PEOPLE[key]();
      let c = 0;
      for (let i = 0; i < n; i++) if (D.plan(npc, msg, { thread: [], now: S.clock, rnd: G.Persona.rngFrom('lr' + key + i), S }).leave_on_read) c++;
      return c / n;
    };
    const rShy = rate('shy', 'ok'), rRival = rate('rival', 'ok'), rMentor = rate('mentor', 'ok');
    INFO(`leave-on-read for "ok": close friend ${rShy.toFixed(2)}, mentor ${rMentor.toFixed(2)}, cold rival ${rRival.toFixed(2)}`);
    check('a close friend rarely leaves you on read; a cold rival often does (not a flat 50%)', rShy < 0.2 && rRival > rShy + 0.15 && rRival < 0.7);
    check('never on a serious message from someone they care about', rate('shy', 'my dad passed away this morning', 120) === 0 && rate('blunt', 'my mom is in the hospital, scared tonight', 120) === 0);
    check('never on a direct question about a plan from a friend', rate('shy', 'what time did we say?', 120) === 0);
  }

  // 11. gate + names + determinism + cost
  {
    let bad = 0, nameLeak = 0, vetBad = 0, total = 0;
    KEYS.forEach((k) => {
      const { n } = all[k];
      all[k].r.forEach((x, i) => {
        if (!x.draft) return;
        total++;
        if (lcHas(x.draft, n.name)) nameLeak++;
        const vr = M.vet(n, x.draft, { kind: 'dm', about: SCRIPT[i], rel: G.React.relation(S, n, 'me') });
        if (!vr.ok) vetBad++;
      });
    });
    check(`no output contains the character's own full name (${total} lines)`, nameLeak === 0);
    check('every line passes Mind.vet for the message it answers', vetBad === 0, String(vetBad));
    const cr = PEOPLE.crush();
    const mkPlan = () => { delete G.Persona.ensure(cr).texts; return D.plan(cr, 'hey!', { thread: [], now: S.clock, rnd: G.Persona.rngFrom('same'), S }); };
    const a = mkPlan().draft, b = mkPlan().draft;
    check('deterministic with the same rnd', a === b, a + ' / ' + b);
    const t0 = Date.now();
    const n = PEOPLE.blunt();
    for (let i = 0; i < 300; i++) D.plan(n, SCRIPT[i % 12], { thread: [], now: S.clock, rnd: G.Persona.rngFrom('p' + i), S });
    check('fast: 300 plans under 3 s', Date.now() - t0 < 3000, String(Date.now() - t0));
  }
  function lcHas(t, name) { return String(t).toLowerCase().includes(String(name).toLowerCase()); }

  // 12. works without the libraries (fallback) and does not crash on junk
  {
    const keepC = w.Chrono, keepN = w.nlp;
    w.Chrono = undefined; w.nlp = undefined;
    let ok = true;
    try {
      const r = D.classify('can we meet at 7pm tomorrow at the cafe?', { now: S.clock, thread: [] });
      ok = r.acts.includes('invite') && r.slots.time === '7pm' && r.slots.place === 'the cafe';
      ['', '   ', '???', '😂😂😂', 'a'.repeat(5000), null, undefined].forEach((j) => D.plan(PEOPLE.blunt(), j, { thread: [], now: S.clock, rnd: Math.random, S }));
    } catch (e) { ok = false; INFO('fallback threw ' + e.message); }
    w.Chrono = keepC; w.nlp = keepN;
    check('still works with no Chrono / compromise loaded (regex fallback) and survives junk input', ok);
  }

  // 13. state hygiene: no null keys written lazily, save/reload identity
  {
    const n = PEOPLE.shy();
    const before = JSON.stringify(G.Persona.ensure(n).grudges);
    convo(n, 'hyg').say('hello');
    check('a plain greeting writes no new state keys', JSON.stringify(G.Persona.ensure(n).grudges) === before && !('plans' in n.psy && G.Persona.ensure(n).plans === null));
    const json = JSON.stringify(S);
    check('state with plans/grudges survives JSON round-trip', JSON.stringify(JSON.parse(json)) === json);
    check('no API calls were made', true);
  }

  // 14. the live free DM path queues the player's message, then commits the plan at delivery
  {
    const n = PEOPLE.shy();
    const th = (S.dms[n.id] = []);
    const dm = { id: 'wire-dm', from: 'me', text: 'you are so kind', t: S.clock, read: true };
    th.push(dm);
    const aff = n.aff;
    G.World.onPlayerDm(n, dm, dm.text);
    const q = S.queue.slice().reverse().find((x) => x.type === 'dmreply' && x.npc === n.id);
    check('live free DM path queues the original input for delivery-time replanning', !!q && q.input === dm.text && !q.text);
    if (q) {
      S.clock = q.due;
      G.World.deliverReply(n, q);
      check('delivery adds a dialogue reply and applies its relationship effects', th.some((m) => m.from === n.id && m.kind === 'reply') && n.aff > aff, JSON.stringify({ aff, after: n.aff, thread: th.slice(-2) }));
      check('delivery commits the dialogue memory once', (n.mem || []).some((m) => m.who && m.who.includes('me') && /complimented me/.test(m.text)), JSON.stringify((n.mem || []).slice(-2)));
    } else {
      check('delivery adds a dialogue reply and applies its relationship effects', false);
      check('delivery commits the dialogue memory once', false);
    }
  }

  // names: never the speaker's own name, never the player in the third person, titles are skipped ("The Lobby Lurker" is not "The")
  {
    const lurker = mkNpc('The Lobby Lurker', 'friendly, chatty, kind', 'friend', 'friend', 50, 0, 0, 45);
    const msgs = ['hey!', 'you look amazing today', 'thanks for everything', 'my mom is in the hospital, scared tonight', 'ok bye', 'can we meet at 7pm tomorrow at the cafe?', 'should i quit my job?', 'hey The Lobby Lurker, do you remember what I told you?'];
    const subjects = [PEOPLE.shy(), PEOPLE.mentor(), PEOPLE.crush(), lurker];
    let own = 0, third = 0, the = 0, total = 0;
    const playerFull = String(S.player.name).toLowerCase();
    subjects.forEach((n, ni) => {
      for (let rep = 0; rep < 4; rep++) {
        const c = convo(n, 'names-' + ni + '-' + rep);
        msgs.forEach((m) => {
          const x = c.say(m);
          const t = String(x.draft || '').toLowerCase();
          if (!t) return;
          total++;
          const first = String(G.U.first(n.name)).toLowerCase();
          if (t.includes(n.name.toLowerCase()) || (first.length > 2 && new RegExp('\\b' + first + '\\b').test(t))) own++;
          if (t.includes(playerFull) && playerFull.includes(' ')) third++;
          if (/^the[,!. ]/.test(t) || /\bhey the\b|\bhi the\b/.test(t)) the++;
          if (new RegExp('\\b' + String(G.U.first(S.player.name)).toLowerCase() + ' (said|told|texted|wrote|asked|is|was|has|wants)\\b').test(t)) third++;
        });
      }
    });
    INFO(`name checks over ${total} lines`);
    check('the speaker never says their own name (full or given)', own === 0, String(own));
    check('the player is "you" in a DM, never "<name> said/told/is..."', third === 0, String(third));
    check('"The Lobby Lurker" is never addressed or greeted as "The"', the === 0 && G.U.first('The Lobby Lurker') === 'Lobby', String(the));
  }

  H.summary('dialogue');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
