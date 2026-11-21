// Long-run regression: repeated viral posts must not grow the audience beyond the town ceiling.
const { boot, invariants } = require('./harness');
const root = process.argv[2] || require('path').resolve(__dirname, '..');
const H = boot(root);
const { w, G, E, check, errors } = H;

(async () => {
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await G.Store.init();
  const S = H.freshWorld();
  G.AI.ready = () => false;
  G.World.postDial = () => 0;
  S.popSize = 1000;
  S.player.followers = 200;
  S.player.followerFloor = 200;
  S.player.cash = 0;
  const initialClock = S.clock;
  let overCapDay = 0;
  let largestState = 0;

  for (let day = 1; day <= 2000; day++) {
    const post = E.addPost({
      author: 'me', text: `a distinct high-quality post ${day}`,
      stats: { likes: 0, reposts: 0, replies: 0, views: 0 },
    }, S);
    const judge = { quality: 10, virality: 10, sentiment: 5, controversy: 0 };
    E.metrics(judge, post);
    post.judge = { q: 10, v: 10, s: 5, c: 0, note: 'local stress fixture' };
    E.tick(1440);
    if (S.player.followers > E.followerCap(S)) overCapDay ||= day;
    largestState = Math.max(largestState, Buffer.byteLength(JSON.stringify(G.S)));
    if (day % 250 === 0) console.log(`day ${day}/2000 | followers ${S.player.followers} | cash ${Math.round(S.player.cash)}`);
  }

  const final = G.S;
  check('2,000 days completed with repeated high-virality posts', Math.floor((final.clock - initialClock) / 1440) === 2000, `${Math.floor((final.clock - initialClock) / 1440)} days`);
  check('followers stay at or below the stable population ceiling every day', overCapDay === 0 && final.player.followers <= E.followerCap(final), `first over-cap day ${overCapDay}; final ${final.player.followers}/${E.followerCap(final)}`);
  check('cash and follower totals remain finite after 2,000 days', Number.isFinite(final.player.cash) && Number.isFinite(final.player.followers));
  check('game invariants hold after the long-run economy simulation', invariants(G).length === 0, invariants(G).slice(0, 3).join('; '));
  check('long-run save remains bounded', largestState < 6e6, `${(largestState / 1e6).toFixed(2)} MB peak`);
  H.summary('ECONOMY: 2,000-day follower cap regression');
  await H.wait(100);
  w.close();
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
