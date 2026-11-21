// Runs many bots in parallel and groups the findings.   node tests/bot-swarm.js [runs=14] [days=60] [parallel=4] [seed0=1]
const { spawn } = require('child_process');
const path = require('path');
const RUNS = +(process.argv[2] || 14);
const DAYS = +(process.argv[3] || 60);
const PAR = +(process.argv[4] || 4);
const SEED0 = +(process.argv[5] || 1);
const results = [];
let next = 0;
let running = 0;
const t0 = Date.now();
function launch() {
  while (running < PAR && next < RUNS) {
    const seed = SEED0 + next++;
    running++;
    const p = spawn(process.execPath, [path.join(__dirname, 'bot.js'), String(seed), String(DAYS)], { cwd: __dirname });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    const timer = setTimeout(() => p.kill(), 20 * 60 * 1000);
    p.on('close', () => {
      clearTimeout(timer);
      running--;
      const line = out.split('\n').find((l) => l.startsWith('BOTJSON '));
      try { results.push(JSON.parse(line.slice(8))); } catch (e) { results.push({ seed, crash: 'no output: ' + out.slice(-300) }); }
      process.stderr.write(`bot ${seed} done (${results.length}/${RUNS})\n`);
      if (results.length === RUNS) report(); else launch();
    });
  }
}
function report() {
  const groups = new Map();
  let days = 0;
  results.forEach((r) => {
    days += r.days || 0;
    if (r.crash) groups.set('BOT CRASH ' + r.seed, { type: 'bot-crash', count: 1, example: r.crash, runs: new Set([r.seed]) });
    (r.findings || []).forEach((f) => {
      const g = groups.get(f.sig) || { type: f.type, count: 0, example: f.example, runs: new Set() };
      g.count += f.count;
      g.runs.add(r.arch + '#' + r.seed);
      groups.set(f.sig, g);
    });
  });
  const list = [...groups.values()].sort((a, b) => b.runs.size - a.runs.size || b.count - a.count);
  console.log(`SWARM: ${results.length} bots, ${days} game days, ${((Date.now() - t0) / 60000).toFixed(1)} min, ${list.length} distinct findings`);
  console.log('STATS ' + results.map((r) => `${r.arch}#${r.seed}:${r.stats ? r.stats.followers + 'f/' + r.stats.npcDms + 'dm' : 'x'}`).join(' '));
  const byType = new Map();
  list.forEach((g) => { const t = g.type.split(':')[0]; const o = byType.get(t) || { n: 0, runs: new Set(), ex: [] }; o.n += g.count; g.runs.forEach((r) => o.runs.add(r)); if (o.ex.length < 3) o.ex.push(g.example); byType.set(t, o); });
  console.log('TYPES');
  [...byType.entries()].sort((a, b) => b[1].runs.size - a[1].runs.size).forEach(([t, o]) => console.log(`* ${t}: x${o.n} in ${o.runs.size} runs`));
  console.log('EXAMPLES (3 per type)');
  [...byType.entries()].forEach(([t, o]) => o.ex.forEach((e) => console.log(`- ${t}: ${e}`)));
  process.exit(list.length ? 1 : 0);
}
launch();
