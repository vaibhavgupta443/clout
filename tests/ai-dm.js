// DMs on the AI path (mocked model through H.state.queue): the free brain is a FLOOR under the model's words
// (insult -> hurt + grudge + memory, apology -> repair), a reply that ignores an insult / heavy news is replaced,
// the prompt carries what the player told the character, replies are anchored to the player's message and arrive before
// anything unrelated, and the DM prompt is trimmed (own schema, short feed).
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  const S = G.S;
  G.settings.approveActions = false;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const kai = Object.values(S.npcs).find((n) => n.name === 'Kai Storm');
  const answer = (o, hook) => H.state.queue.push((body) => {
    if (hook) hook(body);
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(o) } }], usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0 } }) };
  });
  const says = (n) => (S.dms[n.id] || []).filter((m) => m.from === n.id).map((m) => m.text);
  const lastPrompt = () => H.prompts[H.prompts.length - 1];
  const grudge = (n) => (G.Persona.ensure(n).grudges && G.Persona.ensure(n).grudges.me) || 0;
  const mems = (n, re) => (n.mem || []).filter((m) => re.test(m.text));
  Object.assign(mia, { aff: 40, trust: 40, riv: 0, rom: 10, status: 'friend' });

  /* ---------- 1. an insult the model ignores: replaced, and it has consequences ---------- */
  let aff0 = mia.aff;
  answer({ dms: [{ from: mia.id, text: 'lucky ur cute. 7pm.' }], rel: [] });
  await E.dm(mia.id, 'you are a stupid ugly loser');
  check('a reply that ignores an insult is not delivered as written', !says(mia).some((t) => /lucky ur cute/.test(t)), JSON.stringify(says(mia)));
  check('…a hurt/firm line takes its place', says(mia).length === 1, JSON.stringify(says(mia)));
  check('the insult lowers affinity (floor)', mia.aff < aff0, aff0 + ' -> ' + mia.aff);
  check('…and leaves a grudge', grudge(mia) > 0.03, String(grudge(mia)));
  check('…and a negative memory of it', mems(mia, /insulted me/).length === 1 && (mems(mia, /insulted me/)[0].v ?? mems(mia, /insulted me/)[0].valence) < 0, JSON.stringify((mia.mem || []).slice(-3).map((m) => m.text)));

  /* ---------- 2. an insult the model answers well: words kept, effects at least the floor (not doubled) ---------- */
  Object.assign(mia, { aff: 40, trust: 40, riv: 0 });
  G.Persona.ensure(mia).grudges = {};
  S.dms[mia.id] = [];
  aff0 = mia.aff;
  answer({ dms: [{ from: mia.id, text: 'wow. that actually hurt, why would you say that?' }], rel: [{ id: mia.id, aff: -9, trust: -2, mood: 'hurt' }] });
  await E.dm(mia.id, 'you are an idiot and i hate you');
  check('a reply that answers the insult is kept as written', says(mia).length === 1 && /actually hurt/.test(says(mia)[0]), JSON.stringify(says(mia)));
  check('the model\'s own bigger drop stands (the floor only tops up)', mia.aff <= aff0 - 9 && mia.aff >= aff0 - 9 - 8, aff0 + ' -> ' + mia.aff);
  check('the grudge is still recorded', grudge(mia) > 0.03, String(grudge(mia)));

  /* ---------- 3. a silent model on an insult: the free brain's floor still applies ---------- */
  Object.assign(mia, { aff: 40, trust: 40 });
  G.Persona.ensure(mia).grudges = {};
  aff0 = mia.aff;
  answer({ dms: [], rel: [] });
  await E.dm(mia.id, 'shut up, you are pathetic');
  check('even if the model says nothing, an insult costs affinity', mia.aff < aff0, aff0 + ' -> ' + mia.aff);

  /* ---------- 4. an apology repairs ---------- */
  const gBefore = grudge(mia);
  const affB = mia.aff;
  answer({ dms: [{ from: mia.id, text: 'ok. thanks for saying it. i was really hurt' }], rel: [] });
  await E.dm(mia.id, 'i am so sorry, i did not mean it. i was out of line');
  check('an apology lowers the grudge', grudge(mia) < gBefore, gBefore + ' -> ' + grudge(mia));
  check('…and does not cost affinity', mia.aff >= affB, affB + ' -> ' + mia.aff);

  /* ---------- 5. heavy news the model carries on past ---------- */
  Object.assign(mia, { aff: 40, trust: 40 });
  answer({ dms: [{ from: mia.id, text: 'ok so are we still on for friday' }], rel: [] });
  const ctxSeen = [];
  await E.dm(mia.id, 'my dad died this morning. i do not know what to do');
  check('a reply that ignores a death in the family is replaced by a caring one', !says(mia).some((t) => /still on for friday/.test(t)) && G.Mind.supportive(says(mia).slice(-1)[0]), JSON.stringify(says(mia).slice(-2)));

  /* ---------- 6. recall: what the player told them is in the DM prompt ---------- */
  G.Mem.add(mia, { kind: 'said', text: 'Sam told me: "my mom has been sick since March and I am scared"', who: ['me'], imp: 8, valence: 0.2 });
  answer({ dms: [{ from: mia.id, text: 'of course, your mom has been sick since march' }], rel: [] });
  await E.dm(mia.id, 'do you remember what I told you about my mom?');
  const p1 = lastPrompt().user;
  check('the DM prompt has a RECALL block with the confided fact', /RECALL \(/.test(p1) && /sick since March/.test(p1.split('RECALL (')[1] || ''), (p1.split('RECALL (')[1] || '').slice(0, 200));
  check('…and tells the model to answer from it or admit it does not remember', /RECALL lines/.test(p1) && /do not remember/.test(p1) && /Never invent a memory/.test(p1));
  // nothing known about the topic
  answer({ dms: [{ from: mia.id, text: 'hmm, i am not sure you did' }], rel: [] });
  await E.dm(mia.id, 'do you remember what I told you about my cat?');
  const p2 = lastPrompt().user;
  check('when it does not match, the prompt still carries RECALL so the model can admit it', /RECALL \(/.test(p2));

  /* ---------- 7. the player's recent post and the plans they made are in the prompt ---------- */
  const mine = E.addPost({ author: 'me', text: 'my brother is getting married in june, so happy', buzz: 3, stats: { likes: 0, reposts: 0, replies: 0, views: 0 } });
  G.World.reactTo ? (mia.awareness = mia.awareness || []).push({ kind: 'public_post', ref: mine.id, t: S.clock, text: mine.text }) : 0;
  G.Clock.add(mia.id, S.clock + 600, 'dinner at the cafe', S.clock);
  answer({ dms: [{ from: mia.id, text: 'saw your post!' }], rel: [] });
  await E.dm(mia.id, 'hey, did you see what I posted?');
  const p3 = lastPrompt().user;
  check('a post of the player that this character saw is listed for them', /the player's post .*brother is getting married/.test(p3), p3.split('RECALL')[1] && p3.split('RECALL')[1].slice(0, 300));
  check('an appointment with this character is listed', /plan with the player at .*dinner at the cafe/.test(p3));

  /* ---------- 8. order and anchoring ---------- */
  S.dms[mia.id] = [];
  answer({ dms: [{ from: mia.id, text: 'doing great! how about you?' }, { from: mia.id, text: 'wait, did you eat?' }], rel: [] }, () => {
    // something arrives on its own while the model is thinking (a proactive message)
    S.dms[mia.id].push({ id: 'pro1', from: mia.id, text: 'btw the building meeting is tonight', t: S.clock - 2, read: false });
  });
  await E.dm(mia.id, 'hey, how was your day?');
  const th = S.dms[mia.id];
  const iMe = th.findIndex((m) => m.from === 'me');
  const reps = th.filter((m) => m.replyTo === th[iMe].id);
  check('the direct reply sits right under the player message', th[iMe + 1] && th[iMe + 1].replyTo === th[iMe].id && /doing great/.test(th[iMe + 1].text), JSON.stringify(th.map((m) => m.text)));
  check('…and the unrelated message comes after the replies', th.findIndex((m) => m.id === 'pro1') > iMe + reps.length, JSON.stringify(th.map((m) => m.id)));
  check('replies are anchored (replyTo) and typed a minute or two after the message, never in the future', reps.length === 2 && reps.every((m) => m.t > th[iMe].t && m.t <= S.clock) && reps[1].t >= reps[0].t, JSON.stringify(reps.map((m) => m.t)) + ' me ' + th[iMe].t + ' clock ' + S.clock);

  /* ---------- 8b. a line she already sent is not sent again ---------- */
  S.dms[mia.id] = [{ id: 'old1', from: mia.id, text: 'that sounds so scary. do you want me to come by?', t: S.clock - 30, read: true }];
  answer({ dms: [{ from: mia.id, text: 'That sounds so scary, do you want me to come by' }, { from: mia.id, text: 'i am here, ok?' }], rel: [] });
  await E.dm(mia.id, 'thanks, it has been a long night');
  check('a message she already sent is dropped, the new one stays', says(mia).filter((t) => /sounds so scary/i.test(t)).length === 1 && says(mia).some((t) => /i am here/.test(t)), JSON.stringify(says(mia)));

  /* ---------- 9. other people are untouched, a burner is a stranger (no floor) ---------- */
  const kAff = kai.aff;
  answer({ dms: [], rel: [] });
  await E.dm(mia.id, 'you are a pathetic clown');
  check('an insult to one character does not touch another', kai.aff === kAff);

  /* ---------- 10. prompt size: the DM prompt is trimmed ---------- */
  answer({ dms: [{ from: mia.id, text: 'hi' }], rel: [] });
  await E.dm(mia.id, 'hello there');
  const dmP = lastPrompt();
  answer({ judge: { quality: 5 }, posts: [], crowd: [] });
  await E.post('a plain post about my day', 'funny');
  const postP = lastPrompt();
  check('the DM prompt uses the trimmed schema (under 65% of the full one), no crowd/live parts', dmP.user.startsWith(G.AI.SCHEMA_DM) && G.AI.SCHEMA_DM.length < G.AI.SCHEMA.length * 0.65 && !/"crowd":\[/.test(dmP.user) && postP.user.startsWith(G.AI.SCHEMA), G.AI.SCHEMA_DM.length + ' vs ' + G.AI.SCHEMA.length);
  check('the system prompt (cached prefix) is identical between a DM and a post call', dmP.system === postP.system);
  console.log('     sizes (chars): dm system ' + dmP.system.length + ' + user ' + dmP.user.length + ' | post system ' + postP.system.length + ' + user ' + postP.user.length);

  const bad = require('./harness').invariants(G);
  check('state invariants hold', !bad.length, bad.slice(0, 3).join('; '));
  H.summary('AI DMs: floor, recall, order, size');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', (e && e.stack) || e); process.exit(2); });
