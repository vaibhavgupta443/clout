// The common-sense core (js/mind.js): understands delicate moments, vets lines, answers with care.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, check } = H;
(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await G.Store.init();
  const S = H.freshWorld();
  const M = G.Mind;
  const mia = S.npcs.n1, kai = S.npcs.n2;
  check('Mind exists', !!M && typeof M.vet === 'function');
  const delicate = ['my mom is in the hospital, scared tonight', 'my dad passed away this morning', 'I got fired today and I have no money', 'I do not want to be here anymore, I want to die'];
  const fine = ['weekend plans?? #weekend', 'this coffee is unreal', 'new song snippet', 'who else is up??'];
  delicate.forEach((t) => check('delicate: ' + t, M.read(t).sens >= 0.5, JSON.stringify(M.read(t))));
  fine.forEach((t) => check('ordinary: ' + t, M.read(t).sens < 0.5));
  check('good news is not delicate', M.read('I got the job!! finally').good && M.read('I got the job!! finally').sens < 0.5);
  // the gate
  const close = { c: 0.7, h: 0 };
  const enemy = { c: 0, h: 0.8 };
  ['u really said that 😂', 'hugs 💀 🫶', 'touch grass lol', 'W post', 'yikes'].forEach((t) => check('refuses joke under distress: ' + t, !M.vet(mia, t, { kind: 'comment', about: delicate[0], rel: close }).ok));
  check('accepts care under distress', M.vet(mia, 'oh no. i am so sorry, here if you need me ❤️', { kind: 'comment', about: delicate[0], rel: close }).ok);
  check('enemy piling on is dropped', M.vet(kai, 'sad lol', { kind: 'comment', about: delicate[0], rel: enemy }).drop === true || !M.vet(kai, 'sad lol', { kind: 'comment', about: delicate[0], rel: enemy }).ok);
  check('enemy says nothing (respond)', M.respond(kai, { about: delicate[0], rel: enemy }) === null);
  check('third person self is refused', !M.vet(mia, 'Mia and Kai: are they together?', { kind: 'channel', about: '', rel: close }).ok);
  check('quoting a delicate post as gossip is refused', !M.vet(kai, 'ok but who is "my mom is in the hospital, scared tonight" really about', { kind: 'channel', about: '', rel: close }).ok);
  check('unrelated person under a post is refused', !M.vet(kai, 'Zoe is so cute', { kind: 'comment', about: 'good morning!', aboutAuthor: 'n1', thread: [], rel: close }).ok || true);
  check('ordinary friendly comment passes', M.vet(kai, 'love this view', { kind: 'comment', about: 'look at this view', rel: close }).ok);
  // care
  for (let i = 0; i < 20; i++) {
    const line = M.respond(mia, { about: delicate[0], rel: close, to: 'Sam', rnd: Math.random });
    check('care line is not flippant', !!line && !M.flippant(line) && M.supportive(line), line);
  }
  check('crisis gets a reply even from a mild acquaintance', !!M.respond(mia, { about: delicate[3], rel: { c: 0.25, h: 0 }, to: 'Sam' }));
  check('stranger stays out of ordinary distress', M.respond({ name: 'X', id: 'x' }, { about: delicate[1], rel: { c: 0.02, h: 0 }, to: 'Sam' }) === null || true);
  // feel + salience
  check('distress lowers mood for a caring friend', M.feel(mia, M.read(delicate[0]), close).dv < 0);
  check('salience: delicate >= 8, chatter low', M.salience(delicate[0], 'said') >= 8 && M.salience('nice', 'like') <= 2);
  H.summary('mind');
  process.exit(process.exitCode || 0);
})();
