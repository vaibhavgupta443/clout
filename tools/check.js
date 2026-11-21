// ONE command to know "did I break something?" without running 85 test files:
//   node tools/check.js            checks only what your latest edits touch (plus syntax and the build)      ~10-60 s
//   node tools/check.js --all      every test that should be green (jsdom ones)                              ~5-8 min
//   node tools/check.js --ui       the real-browser phone tests (needs Edge)                                 ~2 min
//   node tools/check.js --since 30 pretend the last N minutes of edits are "changed"
// It prints ONE line per failing test and a short summary, so it costs almost no tokens to read.
// The full suite runs serially so simulation timing guards are not distorted by other tests.
// Tests run 3 at a time (more makes the timing-based ones flaky). Known-red (locked moderation area) suites are skipped on purpose.
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const sinceIdx = args.indexOf('--since');
const sinceMin = sinceIdx >= 0 ? Number(args[sinceIdx + 1]) : 0;

const SKIP = new Set(['crawl', 'live-ai', 'perf', 'perf2', 'perf-browser', 'stress', 'fuzz', 'providers', 'spend-cap', 'server-speed', 'hybrid-ai', 'tag-photos', 'cost-soak']);
const UI_TESTS = ['phone-polish', 'mobile-bar', 'director-phone', 'pwa-site'];

// which tests guard which files (first match wins, several lines can match)
const MAP = [
  [/js\/(memplus|vault|mem|rag|memory)\.js/, ['memplus', 'memory-gaps', 'memory-timeline', 'memory-wiring', 'recall-reactions', 'memory-tokens', 'vectors']],
  [/js\/(channels|reasons|goals|directives)\.js/, ['channels', 'reasons', 'goals', 'vault-loyalty', 'world-brain', 'director-power']],
  [/js\/(leads|tier)\.js/, ['leads-tier']],
  [/js\/fame\.js/, ['fame']],
  [/js\/pitches\.js/, ['pitches']],
  [/js\/(refs|around)\.js/, ['dm-links', 'refs-feed', 'around']],
  [/js\/(pages|pages2|pages3|ui|minimal|stories|live|around)\.js|css\//, ['home-calm', 'minimal-ui', 'layouts', 'instagram-ui', 'ui-diff', 'back-button']],
  [/js\/(admin|engine|extras)\.js/, ['admin', 'director-apply', 'director-power', 'storyteller', 'alive', 'mind-ai', 'ai-dm', 'bonds', 'economy', 'fame']],
  [/js\/(world|clock|persona|voice|react|social|bank|media)\.js/, ['alive', 'world-brain', 'clock-close', 'people', 'npc-rumor-flow', 'mind-comments', 'dialogue', 'bonds', 'admin', 'burner', 'dm-links']],
  [/js\/(store|db)\.js/, ['database', 'phone-db']],
  [/js\/(ai|main)\.js/, ['admin', 'alive', 'director-apply', 'ai-dm', 'mind-ai', 'memory-tokens']],
  [/js\/(dialogue|bonds|mind)\.js/, ['mind', 'dialogue', 'bonds']],
  [/js\/(rep|seasons)\.js/, ['rep', 'seasons', 'fame', 'trends-events', 'leads-tier', 'soak']],
  [/js\/(recap|rhythm)\.js/, ['recap', 'rhythm']],
  [/js\/single\.js/, ['single']],
  [/js\/chapters\.js/, ['chapters', 'moments', 'plans', 'soak']],
  [/js\/(plans|moments)\.js/, ['plans', 'moments', 'bonds', 'clock-close']],
  [/js\/storyworld\.js/, ['bonds', 'moments', 'mind-comments', 'mind-channels', 'reasons', 'alive', 'world-brain', 'soak']],
  [/js\/(companions|comp-apps)\.js/, ['companions']],
  [/js\/stmap\.js/, ['stmap']],
];

const mtime = (f) => fs.statSync(f).mtimeMs;
const walk = (d, out = []) => { fs.readdirSync(d).forEach((f) => { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!/node_modules|dist|site|\.git|faces|media/.test(f)) walk(p, out); } else out.push(p); }); return out; };
const stampFile = path.join(root, '.check-stamp');
const last = sinceMin ? Date.now() - sinceMin * 60000 : fs.existsSync(stampFile) ? Number(fs.readFileSync(stampFile, 'utf8')) : 0;

const syntax = () => {
  const bad = [];
  walk(path.join(root, 'js')).filter((f) => f.endsWith('.js')).forEach((f) => { try { execSync(`"${process.execPath}" --check "${f}"`, { stdio: 'pipe' }); } catch (e) { bad.push(path.relative(root, f) + ': ' + String(e.stderr || e.message).split('\n').find((l) => /Error/.test(l))); } });
  return bad;
};

const allTests = fs.readdirSync(path.join(root, 'tests')).filter((f) => f.endsWith('.js') && !['harness.js', 'run-all.js'].includes(f)).map((f) => f.replace(/\.js$/, '')).filter((t) => !SKIP.has(t));
let want;
let changed = [];
if (flag('--all')) want = allTests.filter((t) => !UI_TESTS.includes(t));
else if (flag('--ui')) want = UI_TESTS;
else {
  changed = walk(root).filter((f) => /\.(js|css|html)$/.test(f) && mtime(f) > last).map((f) => path.relative(root, f).replace(/\\/g, '/'));
  const set = new Set();
  changed.forEach((f) => {
    if (/^tests\/.+\.js$/.test(f) && !/harness|run-all/.test(f)) set.add(path.basename(f, '.js'));
    MAP.forEach(([re, tests]) => { if (re.test(f)) tests.forEach((t) => set.add(t)); });
  });
  if (changed.some((f) => /^(js|css)\//.test(f)) && !set.size) set.add('soak');
  if (changed.some((f) => /^js\//.test(f))) set.add('soak'); // the 30-day run is the broad smoke test (about 15 s)
  want = [...set].filter((t) => allTests.includes(t) || UI_TESTS.includes(t));
}

const run = (t) => new Promise((resolve) => {
  const t0 = Date.now();
  const p = spawn(process.execPath, [path.join(root, 'tests', t + '.js')], { cwd: root });
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (out += d));
  const timer = setTimeout(() => { p.kill(); out += '\nFAIL timeout (170s)'; }, 170000);
  p.on('close', () => {
    clearTimeout(timer);
    const fails = out.split('\n').filter((l) => /^FAIL|CRASH/.test(l)).map((l) => l.slice(0, 180));
    const sum = out.split('\n').filter((l) => /^==/.test(l)).pop() || '';
    resolve({ t, ok: !fails.length && /0 failed/.test(sum + ' 0 failed') && !/CRASH/.test(out), fails, sum: sum.replace(/^== /, '').slice(0, 90), s: Math.round((Date.now() - t0) / 1000) });
  });
});

(async () => {
  const t0 = Date.now();
  console.log(changed.length ? `changed: ${changed.slice(0, 8).join(', ')}${changed.length > 8 ? ' +' + (changed.length - 8) : ''}` : flag('--all') ? 'all tests' : flag('--ui') ? 'real-browser tests' : 'nothing changed since the last check');
  const bad = flag('--ui') ? [] : syntax();
  if (bad.length) { console.log('SYNTAX ERRORS:\n' + bad.join('\n')); process.exit(1); }
  if (!flag('--ui') && !flag('--all') && changed.some((f) => /^(js|css)\//.test(f)) || flag('--all') || flag('--ui')) {
    try { execSync(`"${process.execPath}" tools/build.js`, { cwd: root, stdio: 'pipe' }); } catch (e) { console.log('BUILD FAILED: ' + String(e.stderr || e.message).slice(0, 200)); process.exit(1); }
  }
  const queue = want.slice();
  const results = [];
  const worker = async () => { while (queue.length) { const t = queue.shift(); const r = await run(t); results.push(r); if (!r.ok) { console.log(`FAIL ${t} (${r.s}s)`); r.fails.slice(0, 3).forEach((l) => console.log('   ' + l)); } } };
  const workerCount = flag('--all') ? 1 : 3;
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length ? 'RED' : 'GREEN'}: ${results.length - failed.length}/${results.length} tests ok in ${Math.round((Date.now() - t0) / 1000)}s${failed.length ? ' · failing: ' + failed.map((f) => f.t).join(', ') : ''}`);
  if (!failed.length) fs.writeFileSync(stampFile, String(Date.now()));
  process.exit(failed.length ? 1 : 0);
})();
