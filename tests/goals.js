// Daily intentions resolve into bounded activity in the existing world.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, check } = H;

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await G.Store.init();
  const S = H.freshWorld();
  const cast = Object.values(S.npcs).filter((n) => !n.blocked && !n.userAlt);
  const [a, b, c] = cast;
  const day = G.U.dayOf(S.clock) + 1;
  G.Bonds.addEdge(S, a.id, b.id, 'friend', 'existing friendship', day - 3, 80);
  const postsBefore = S.postOrder.length;
  const castBefore = Object.keys(S.npcs).length;
  a.goal = { kind: 'npc', who: [b.id], text: 'spend time with ' + b.name, t: day - 1 };
  const social = G.Goals.act(a, a.goal, day);
  const pair = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
  check('an NPC relationship goal creates a real tie between existing characters', social && social.kind === 'npc' && S.sim.ties[pair] > 0);
  check('the interaction is recorded as an in-world event', S.chronicle.some((x) => /followed through on a plan/.test(x.text)));

  S.storylines.push({ id: 'goal-plot', title: 'The lost demo tape', summary: '', heat: 40, status: 'active', participants: [b.id, c.id], updated: S.clock, log: [] });
  b.goal = { kind: 'plot', who: [c.id], text: 'see the storyline through', t: day - 1 };
  const plot = G.Goals.act(b, b.goal, day);
  const story = S.storylines.find((x) => x.id === 'goal-plot');
  check('a storyline goal advances an existing storyline and adds a timeline entry', plot && plot.kind === 'plot' && story.heat === 43 && story.log.length === 1);
  const self = G.Goals.act(c, { kind: 'self', text: 'try something new', t: day - 1 }, day);
  const fourth = G.Goals.act(a, { kind: 'self', text: 'try something new', t: day - 1 }, day);
  check('goal actions stay bounded per day', self && self.kind === 'self' && fourth === null && S.sim.goalActionCount === 3);
  check('goal actions create no NPC posts or new characters', S.postOrder.length === postsBefore && Object.keys(S.npcs).length === castBefore);
  H.summary('GOALS: bounded daily actions in existing relationships and storylines');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
