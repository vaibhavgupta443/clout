// Director power: /global directives (apply to everyone), per-item approval (tick what you want), free fallback approval.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check } = H;
const $ = (s) => w.document.querySelector(s);
const $$ = (s) => Array.from(w.document.querySelectorAll(s));
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  const S = G.S;
  G.World.postDial = () => 0;
  G.settings.approveActions = true;
  w.document.body.classList.add('ingame');
  const D = G.Directives;
  const St = E.Story;
  const mia = Object.values(S.npcs).find((n) => n.name === 'Mia Vale');
  const kai = Object.values(S.npcs).find((n) => n.name === 'Kai Storm');
  const dex = Object.values(S.npcs).find((n) => n.name === 'Dex Rowan');
  const miaPost = E.addPost({ author: mia.id, text: 'new song is out', buzz: 3, stats: { likes: 5, reposts: 0, replies: 0, views: 50 } });
  const wait = async (f, n = 60) => { for (let i = 0; i < n && !f(); i++) await H.wait(25); return f(); };

  /* =============== /global =============== */
  check('"/global …" is recognised as a global directive (and text ending in /globally too)', St.intent('/global act more curious').kind === 'global' && St.intent('act more cheerful /globally').kind === 'global' && St.intent('act more cheerful /globally').text === 'act more cheerful' && St.intent('Kai posts something').kind === 'do');
  check('it works whichever button you press', St.intent('/global be warmer', 'ask').kind === 'global' && St.intent('/global be warmer', 'do').kind === 'global');
  const msg = D.run('act more curious and nosy');
  check('adding one saves it, says so, and shows what the free simulation will do', D.list().length === 1 && /Applied to everyone/.test(msg) && /curious ×/.test(msg), msg);
  check('every AI call carries it (the context has a GLOBAL DIRECTIVES block)', /GLOBAL DIRECTIVES FROM THE OWNER/.test(G.AI.context({ focus: [mia.id] })) && /act more curious/.test(G.AI.context({})));
  check('the Director\'s own prompts carry it as well', (() => { return /act more curious/.test(G.AI.context({ ownerView: true })); })());
  check('the curious dial goes up', D.dial('curious') > 1.5, D.dial('curious'));
  D.run('be less chatty');
  check('"less chatty" turns the chatty dial DOWN, not up', D.dial('chatty') < 1, D.dial('chatty'));
  check('...and that slows how often people text you', G.World.dmMult() < G.settings.dmRate, G.World.dmMult());
  D.clear();
  D.run('act more flirty');
  check('a "flirty" directive is capped at PG-13 levels', D.dial('flirty') <= 1.15, String(D.dial('flirty')));
  D.clear();
  check('/global list, remove, off, on, clear', (() => {
    D.run('act more curious'); D.run('be warmer');
    const l = D.run('list');
    D.run('off 1');
    const offCurious = D.dial('curious');
    D.run('on 1');
    D.run('remove 2');
    const left = D.list().length;
    D.run('clear');
    return /1\. act more curious/.test(l) && /2\. be warmer/.test(l) && offCurious === 1 && left === 1 && D.list().length === 0;
  })());
  let bad = false; try { D.run(''); D.remove(9); } catch (e) { bad = true; }
  check('removing something that is not there is a clear error', bad);
  // the Director bar
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  $('#stdock textarea').value = 'act more dramatic /global';
  $('#stdock textarea').dispatchEvent(new w.Event('input', { bubbles: true }));
  click($('#stdock [data-d="ask"]'));
  await wait(() => D.list().length === 1);
  check('typing it in the Director bar saves it at once: no AI call, no approval card', D.list().length === 1 && !$('#stdock [data-d="approve"]') && /Global directives|Applied to everyone/.test($('#stdock').textContent) && /1 global rule/.test($('#stdock').textContent));
  E.Admin.setOn(true);
  const out = await E.Admin.run('/global be warmer to each other');
  E.Admin.setOn(false);
  check('the Admin command works too', D.list().length === 2 && /Applied/.test(out));
  G.UI.go('storyteller');
  G.UI.render();
  check('the Storyteller page lists them with Off / ✕ and has preset chips', $$('[data-act="gdRemove"]').length === 2 && $$('[data-act="gdPreset"]').length === 6 && !!$('#gd_text'));
  $('#gd_text').value = 'speak in short sentences';
  G.UI.acts.gdAdd();
  G.UI.acts.gdPreset({ i: '0' });
  G.UI.acts.gdToggle({ id: D.all()[0].id });
  G.UI.acts.gdRemove({ id: '1' });
  check('the page buttons add, preset, toggle and remove', D.list().some((r) => /short sentences/.test(r.text)) && D.all().length === 3);
  check('it is saved with the world', JSON.parse(JSON.stringify(S.globalRules)).length === D.all().length);
  // the free simulation really changes: a high curious dial makes the channels ask more
  D.clear();
  S.channels = null; G.Channels.ensure();
  E.addChron('Kai Storm and Mia Vale had a screaming fight outside the studio');
  S.rumors.push({ id: 'r9', text: 'Mia Vale is leaving the label', about: mia.id, belief: { [kai.id]: 0.6 }, t: S.clock });
  // the share of messages written in a curious voice (a question mark count is too noisy: it also depends on which template is picked)
  const qRate = () => { let q = 0, n = 0; for (let i = 0; i < 600; i++) { const m = G.Channels.say(S.channels[i % 5]); if (m && !m.to) { n++; if (m.style === 'curious') q++; } } return q / Math.max(1, n); };
  const base = qRate();
  D.run('act far more curious, nosy, inquisitive, always asking questions');
  const curious = qRate();
  check('"act more curious" makes people in the channels clearly more curious (free simulation: the curious voice at least 1.25x as common: with no-repeat channel talk the dial cannot force repeats)', curious > base * 1.25 && curious > base + 0.08, `${base.toFixed(2)} -> ${curious.toFixed(2)}`);
  D.clear();

  /* =============== per-item approval =============== */
  G.AI.ready = () => true;
  G.AI.json = async () => ({ cost: 0.004, data: {
    posts: [
      { id: 't1', author: kai.id, text: 'honestly the new song is a lot', replyTo: miaPost.id },
      { id: 't2', author: dex.id, text: 'Kai you are so wrong about this', replyTo: 't1' },
      { author: dex.id, text: 'thank you everyone for listening', replyTo: miaPost.id }, // (a character replying to their OWN post is rejected by the engine, so someone else says it)
    ],
    dms: [{ from: kai.id, text: 'hey, can we talk about earlier?' }],
    character_updates: [{ who: 'Kai Storm', mood: 'tense' }],
  } });
  const items = St.items(await G.AI.json().then((r) => r.data));
  check('the proposal is split into separate items (3 posts, a message, a feelings change)', items.length === 5 && items.filter((i) => i.group === 'posts').length === 3 && items.some((i) => i.group === 'dms') && items.some((i) => i.group === 'character_updates'), items.map((i) => i.id).join());
  check('a reply is tied to the post it answers', items.find((i) => i.id === 'posts:1').deps[0] === 'posts:0' && items.find((i) => i.id === 'posts:0').deps.length === 0);
  const all = items.map((i) => i.id);
  const sub = St.pick((await G.AI.json()).data, ['posts:2', 'dms:0']);
  check('pick() keeps only the ticked items', sub.posts.length === 1 && sub.posts[0].text === 'thank you everyone for listening' && sub.dms.length === 1 && !sub.character_updates.length);

  // the card
  const rd = (async () => { const r = await St.run('Kai and Dex react to the song'); return r; })();
  await wait(() => $('#stdock .prop'));
  const boxes = () => $$('#stdock input[data-d="pk"]');
  check('the approval card shows one checkbox per item, all ticked', boxes().length === 5 && boxes().every((b) => b.checked) && /Approve selected \(5\)/.test($('#stdock .prop').textContent), boxes().length);
  const box = (id) => boxes().find((b) => b.dataset.id === id);
  click(box('posts:0'));
  check('unticking a post also unticks the replies to it', !box('posts:0').checked && !box('posts:1').checked && box('posts:2').checked);
  click(box('posts:1'));
  check('ticking a reply ticks the post it needs', box('posts:0').checked && box('posts:1').checked);
  click(box('dms:0'));
  check('the counter follows your ticks', /Approve selected \(4\)/.test($('#stdock .prop').textContent) && !box('dms:0').checked);
  const posts0 = Object.keys(S.posts).length;
  click($('#stdock [data-d="approve"]'));
  const res = await rd;
  check('only the ticked items happen (3 posts and the feelings change; the message you unticked does not)', Object.values(S.posts).some((p) => /new song is a lot/.test(p.text)) && Object.values(S.posts).some((p) => /so wrong about this/.test(p.text)) && Object.values(S.posts).some((p) => /thank you everyone/.test(p.text)) && !(S.dms[kai.id] || []).some((m) => /talk about earlier/.test(m.text)) && !res.rejected, JSON.stringify(res).slice(0, 200));
  check('...and the reply really replies to its post', (() => { const a = Object.values(S.posts).find((p) => /new song is a lot/.test(p.text)); const b = Object.values(S.posts).find((p) => /so wrong about this/.test(p.text)); return a && b && b.replyTo === a.id; })());
  E.undo();

  // nothing ticked = rejected
  const rd2 = St.run('Kai and Dex react to the song');
  await wait(() => $('#stdock .prop'));
  click($('#stdock [data-d="pkall"]'));
  check('"tick all / none" clears everything', boxes().every((b) => !b.checked) && /Approve selected \(0\)/.test($('#stdock .prop').textContent));
  const posts1 = Object.keys(G.S.posts).length;
  click($('#stdock [data-d="approve"]'));
  const res2 = await rd2;
  check('approving with nothing ticked is a rejection: nothing changes', res2.rejected === true && Object.keys(G.S.posts).length === posts1);

  // channels: Spark drama, per message
  G.AI.json = async () => ({ cost: 0.002, data: { channel_msgs: [{ from: kai.id, text: 'who started this rumour?', replyTo: null }, { from: dex.id, text: 'I was nowhere near the studio; Kai knows who started the rumour.', replyTo: null }, { from: mia.id, text: 'can we all calm down', replyTo: null }] } });
  const before = G.S.channels[0].msgs.length;
  St.approver = async (p) => (p.items ? [p.items[0].id, p.items[2].id] : true);
  const sp = await G.Channels.spark('town-talk');
  check('Spark drama: only the messages you ticked are added', sp.made === 2 && G.S.channels[0].msgs.some((m) => /who started this rumour/.test(m.text)) && !G.S.channels[0].msgs.some((m) => /nowhere near the studio/.test(m.text)));
  // restore the real approver for the next test
  delete St.approver;

  /* =============== the free fallback asks too =============== */
  G.AI.ready = () => false;
  const approvals = [];
  St.approver = async (p) => { approvals.push(p); return false; };
  const r3 = await St.run('Kai replied "no way, that is the best song ever" to Mia Vale\'s latest post');
  check('with no AI connected, the free fallback shows what it would post and waits', approvals.length === 1 && /Kai Storm replies to Mia Vale: “no way/.test(approvals[0].lines[0]) && r3.rejected === true && !Object.values(G.S.posts).some((p) => /best song ever/.test(p.text)), JSON.stringify(approvals.map((a) => a.lines)));
  St.approver = async () => true;
  const r4 = await St.run('Kai replied "no way, that is the best song ever" to Mia Vale\'s latest post');
  check('...and posts it once you approve', !r4.rejected && Object.values(G.S.posts).some((p) => /best song ever/.test(p.text)));

  H.summary('DIRECTOR POWER');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(2); });
