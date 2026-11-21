// COST + TIME: play 30 game days with the AI switched on (a stubbed network) and count every call the game really makes, with its real prompt size.
// Price: deepseek/deepseek-v4.1-flash-1017 as listed in the app: $0.15 per 1M input tokens, $0.60 per 1M output tokens.
const { boot } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E } = H;
const DAYS = +(process.env.DAYS || 30);
const IN = 0.15 / 1e6;
const OUT = 0.6 / 1e6;
const SECS_PER_CALL = 5; // a real model answer: about 3 to 8 seconds

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  const calls = [];
  const json0 = G.AI.json.bind(G.AI);
  G.AI.json = async function (o) {
    const sys = o.system || (G.AI.system ? G.AI.system() : '');
    calls.push({ task: o.task || 'other', inTok: Math.round((String(sys).length + String(o.user || '').length) / 4), outTok: Math.round((o.maxTokens || 800) * 0.5) });
    return json0(o);
  };
  const results = {};
  for (const saver of [true, false]) {
    calls.length = 0;
    H.freshWorld();
    const S0 = G.S;
    G.settings.approveActions = false;
    G.settings.directorOnly = saver; // true = "save credits" (default): nothing runs in the background, only what you do
    G.World.postDial = () => 1;
    G.AI.ready = () => true;
    const npcs = Object.values(S0.npcs);
    const t0 = Date.now();
    for (let day = 1; day <= DAYS; day++) {
      const S = G.S;
      // the player's day: 3 posts, 4 DMs, 3 replies, a Director order every other day
      for (let k = 0; k < 3; k++) { try { await E.post(['studio all night', 'who is up?', 'big news soon', 'coffee then chaos'][(day + k) % 4] + ' #' + day); } catch (e) {} }
      for (let k = 0; k < 4; k++) { try { await E.dm(npcs[k % npcs.length].id, 'hey, how is your day going? ' + day); } catch (e) {} }
      for (let k = 0; k < 3; k++) {
        const target = S.postOrder.map((id) => S.posts[id]).filter((p) => p && p.author !== 'me').slice(-1)[0];
        if (target) { try { await E.reply(target.id, 'haha exactly'); } catch (e) {} }
      }
      if (day % 2 === 0 && E.Story) { try { E.Story.approver = async () => true; await E.Story.run('Mia and Kai argue about the new song in the comments'); } catch (e) {} }
      for (let h = 0; h < 24; h++) { E.tick(60); if (h % 6 === 0) { G.Live.beat(); await H.wait(1); } }
      if (!saver && G.Bank) { try { G.Bank.lastAt = 0; G.Bank.backoff = 0; G.Bank.tick(); await H.wait(5); } catch (e) {} }
      if (!saver && G.Memory && G.Memory.maybe) { try { G.S.turns = 99; G.Memory.maybe(); await H.wait(5); } catch (e) {} }
    }
    const secs = (Date.now() - t0) / 1000;
    const by = {};
    calls.forEach((c) => { const b = (by[c.task] = by[c.task] || { n: 0, i: 0, o: 0 }); b.n++; b.i += c.inTok; b.o += c.outTok; });
    const tin = calls.reduce((a, c) => a + c.inTok, 0);
    const tout = calls.reduce((a, c) => a + c.outTok, 0);
    results[saver ? 'saver ON (default)' : 'saver OFF (background AI on)'] = { calls: calls.length, tin, tout, cost: tin * IN + tout * OUT, by, simSecs: secs };
  }
  console.log(`\nDEEPSEEK V4.1 FLASH 1017 · ${DAYS} game days · a busy player (3 posts, 4 DMs, 3 replies a day, a Director order every other day)\n`);
  Object.entries(results).forEach(([k, r]) => {
    console.log(`== ${k}`);
    console.log(`   AI calls: ${r.calls} (${(r.calls / DAYS).toFixed(1)} a day) · input ${(r.tin / 1e3).toFixed(0)}k tokens · output ~${(r.tout / 1e3).toFixed(0)}k tokens`);
    console.log(`   COST for ${DAYS} days: $${r.cost.toFixed(3)} (about $${(r.cost / DAYS).toFixed(3)} a day)`);
    console.log(`   TIME: the game itself ran ${r.simSecs.toFixed(1)}s of computer time; waiting on the model at ~${SECS_PER_CALL}s a call is about ${Math.round((r.calls * SECS_PER_CALL) / 60)} minutes spread over your play`);
    Object.entries(r.by).sort((a, b) => b[1].i - a[1].i).forEach(([t, b]) => console.log(`     ${t.padEnd(10)} ${String(b.n).padStart(4)} calls · avg prompt ${Math.round(b.i / b.n)} tok · $${(b.i * IN + b.o * OUT).toFixed(3)}`));
  });
  process.exit(0);
})().catch((e) => { console.log('CRASH', (e && e.stack) || e); process.exit(2); });
