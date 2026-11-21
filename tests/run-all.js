// Runs every Clout test suite and prints one summary.
//   node run-all.js           everything (UI crawl + real-browser suites take several minutes)
//   node run-all.js --quick   skips the slow ones (crawl, real browser)
//   node run-all.js --live    also runs the live AI test against a FREE OpenRouter model (needs ../.env with OPENROUTER_API_KEY;
//                             pass --model=<id:free>, default dots-studio/dots-3-note-preview:free). Zero cost, ~15 min.
const { spawnSync } = require('child_process');
const path = require('path');
const quick = process.argv.includes('--quick');
const live = process.argv.includes('--live');
const model = (process.argv.find((a) => a.startsWith('--model=')) || '--model=dots-studio/dots-3-note-preview:free').slice(8);
const suites = [
  ['Main flows', 'flows.js'], ['New features', 'features.js'], 
  ['Fuzz & robustness', 'fuzz.js'], ['Injection audit', 'injection.js'], ['Stress & scale', 'stress.js'],
  ['Local database', 'database.js'], ['Local model providers', 'providers.js'],
  ['Living world: people', 'people.js'], ['Living world: activity', 'alive.js'], ['Instagram UI', 'instagram-ui.js'],
  
  ['Smooth updates (in-place DOM)', 'ui-diff.js'], ['Instagram layouts (reels, profile, explore)', 'layouts.js'], ['Server speed (thumbnails + bundle)', 'server-speed.js'], ['Phone mode (iPhone)', 'phone-mode.js'], ['Spending cap', 'spend-cap.js'],
  ['Character studio + content controls', 'studio.js'],
  ['Hybrid AI (local helper + OpenRouter)', 'hybrid-ai.js'],
  
  ['Family relationships', 'family.js'], ['Back button + pause', 'back-button.js'], ['Burner accounts + tagging', 'burner.js'], ['Admin + world control', 'admin.js'], ['Storyteller', 'storyteller.js'], ['Director extras (schedule, plan, hotkeys)', 'director-extras.js'], ['Director approval', 'approve.js'], ['World brain (RAG, rules, messages, events, charts)', 'world-brain.js'], ['Director chat (talk to a character)', 'director-chat.js'], ['Memory + tokens (recall, bounded prompts, stable prefix)', 'memory-tokens.js'], ['Public channels + story-aware comments', 'channels.js'], ['Director power (/global, per-item approval)', 'director-power.js'], ['Hybrid retrieval (vectors)', 'vectors.js'], ['Streaming replies', 'streaming.js'], ['Clock, close friends, post picker, goals', 'clock-close.js'], ['Alerts go somewhere', 'alerts.js'], ['Profile pictures (faces)', 'faces.js'], ['Trending, events, NPC health', 'trends-events.js'], ['Real DMs, suspicion, finger-pointing, case threads', 'reasons.js'], ['Suggestions, ✨ button, rumours, a moving world', 'pitches.js'], ['Loyalty, memory vault, Obsidian, main cast only', 'vault-loyalty.js'], ['New people (leads) + Lover tier', 'leads-tier.js'], ['Fame + money (growth, virality, offers)', 'fame.js'], ['Better memory (learn, replace, rehearse, edit)', 'memplus.js'], ['Memory by meaning (no chatter flood, delicate kept, folding)', 'mind-memory.js'], ['NPC memory: specific reactions', 'recall-reactions.js'], ['30-day soak (every system)', 'soak.js'], ['Memory gaps closed (trim, overflow, public words, hearsay, a year of noise)', 'memory-gaps.js'], ['Story together + wider contradictions', 'memory-timeline.js'], ['Installable phone app (real browser, offline, updates)', 'pwa-site.js'], ['Post links + new posts on top', 'refs-feed.js'], ['Director: approved things happen, honest summary', 'director-apply.js'], ['Common sense on the AI path (vet lines, clamp bond swings)', 'mind-ai.js'], ['AI DMs (free brain floor, recall, order, trimmed prompt)', 'ai-dm.js'], ['Free DM brain (acts, slots, plans, personas, insult/apology, recall)', 'dialogue.js'], ['Common sense in channels, DM reasons, leads, suggestions', 'mind-channels.js'], ['Minimal interface (no emoji in labels, five places, blue)', 'minimal-ui.js'], ['Calm home (posts and stories only)', 'home-calm.js'], ['Phone polish (bar stays put, no zoom, safe areas)', 'phone-polish.js'], ['Around town (communities)', 'around.js'], ['Links in DMs', 'dm-links.js'], ['Memory + NPC wiring (every way you speak is heard)', 'memory-wiring.js'], ['Phone database (dropped connection, retry, emergency copy, slimming)', 'phone-db.js'], ['Director approval on a phone (real browser)', 'director-phone.js'], 
];
suites.push(['Common sense core (meaning, careful lines, salience)', 'mind.js'], ['Common sense in comments, replies and care DMs', 'mind-comments.js'], ['Bond dynamics (stages, conflict, repair, follow choices)', 'bonds.js'], ['Reputation and PR (standings, lay low, apology)', 'rep.js'], ['Town seasons (arcs, one choice, no NPC posts)', 'seasons.js'], ['Economy growth and reply accounting', 'economy.js'], ['2,000-day follower cap soak', 'economy-long.js'], ['Daily goals produce bounded social and story actions', 'goals.js'], ['Previously on (recap beats)', 'recap.js'], ['Morning and evening beats', 'rhythm.js'], ['One copy of Clout at a time (second tab waits, never saves)', 'single.js'], );
suites.push(['Free demo start (no API key, no model call)', 'demo-world.js']);
suites.push(['Outings with real times (plans, RSVP, scene, clock holds)', 'plans.js'], ['Relationship milestone moments (3 cards, once each)', 'moments.js'], ['Weekly chapters, album and titles', 'chapters.js']);
if (!quick) suites.push(['UI crawl (normal data)', 'crawl.js'], ['UI crawl (hostile data)', 'crawl.js', 'hostile'], );
if (!quick) suites.push(['Real browser: speed', 'perf-browser.js'], ['Real browser: iPhone bottom bar', 'mobile-bar.js']);
let bad = 0;
let perfServer = null;
for (const [name, file, ...extra] of suites) {
  const t = Date.now();
  if (file === 'perf-browser.js' && !perfServer) { perfServer = require('child_process').spawn(process.execPath, [path.join(__dirname, '..', 'serve.js'), '8091'], { stdio: 'ignore' }); require('child_process').spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},1500)']); }
  const root = path.resolve(__dirname, '..');
  const args = file === 'perf-browser.js' ? [path.join(__dirname, file), root, 'http://localhost:8091/'] : file === 'live-ai.js' ? [path.join(__dirname, file), root, ...extra] : file === 'crawl.js' ? [path.join(__dirname, file), root, ...extra] : [path.join(__dirname, file), root];
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  const out = (r.stdout || '') + (r.stderr || '');
  const line = out.split('\n').filter((l) => /^==/.test(l)).pop() || '';
  const pass = (out.match(/^PASS /gm) || []).length;
  const fail = (out.match(/^FAIL /gm) || []).length;
  const ok = r.status === 0 && !/CRASH/.test(out) && fail === 0;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(38)} ${line || `${pass} passed, ${fail} failed`}  (${((Date.now() - t) / 1000).toFixed(0)}s)`);
  if (!ok) console.log(out.split('\n').filter((l) => /^FAIL|CRASH|ERR /.test(l)).slice(0, 8).map((l) => '     ' + l.slice(0, 220)).join('\n'));
}
console.log(bad ? `\n${bad} suite(s) failed` : '\nAll suites passed');
process.exit(bad ? 1 : 0);
