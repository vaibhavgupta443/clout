/* Clout — AI client (OpenRouter cloud OR any local OpenAI-compatible server: Ollama, LM Studio, KoboldCpp…),
   system prompt and context builder */
(function (G) {
  const U = G.U;
  const AI = (G.AI = {});
  // Where the AI lives. Local servers are free and private; OpenRouter is the cloud default.
  AI.PROVIDERS = {
    openrouter: { label: 'OpenRouter (cloud)', base: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-v4-flash' },
    ollama: { label: 'Ollama (local, free)', base: 'http://localhost:11434/v1', model: 'llama3.1:8b' },
    lmstudio: { label: 'LM Studio (local, free)', base: 'http://localhost:1234/v1', model: 'local-model' },
    koboldcpp: { label: 'KoboldCpp (local, free)', base: 'http://localhost:5001/v1', model: 'koboldcpp' },
    custom: { label: 'Any OpenAI-compatible server', base: '', model: '' },
  };
  AI.provider = () => (AI.PROVIDERS[G.settings.provider] ? G.settings.provider : 'openrouter');
  AI.base = () => ((G.settings.baseUrl || '').trim() || AI.PROVIDERS[AI.provider()].base).replace(/\/+$/, '');
  AI.isLocal = () => AI.provider() !== 'openrouter';
  AI.notReadyMsg = () => (AI.isLocal() ? 'Set your local server address and model name in Settings first.' : 'Add your OpenRouter API key in Settings first.');
  AI.reasoningLocked = {}; // model id -> true when the endpoint says reasoning cannot be disabled

  const DRAMA = [
    '',
    'Drama level GENTLE: mostly warm and funny, with light friction and the odd awkward moment.',
    'Drama level SPICY: real conflict, gossip, jealousy, subtweets, feuds and crushes. Not everyone is nice.',
    'Drama level CHAOS: scandals, betrayals, love triangles, pile-ons, leaks and plot twists almost every turn. Escalate hard.',
  ];
  const ROMANCE = [
    '',
    'Romance: SLOW BURN — feelings build gradually, lots of tension.',
    'Romance: FLIRTY — characters flirt openly, crushes form quickly, dating is possible.',
    'Romance: PASSIONATE — intense feelings, grand gestures, jealousy and heartbreak. Stay PG-13 (kisses and fade-to-black only).',
  ];

  const CONTENT_LEVEL = 'CONTENT: PG-13. Flirting and kisses at most; no sexual content; mild profanity. HARD LIMITS: every character is an adult aged 18 or older; never use real people.';
  // stable text (never changes between turns) so provider prompt caching keeps working; G.Mind enforces the same rules on the output
  AI.COMMON_SENSE = 'COMMON SENSE: react to what a post is actually about. Never joke at illness, death, grief or crisis: friends show care, enemies stay silent. Nobody speaks about themselves in the third person. A character only knows what they saw or were told. Someone asleep does not answer at once. Stay in your own voice and never repeat yourself. One exchange moves a bond a little; only a big event moves it a lot, and nobody becomes a partner from one comment.';
  AI.system = () => {
    const s = G.settings;
    return [
      'You are the simulation engine of CLOUT, a social-media life-sim game (like "Status: Sims but social media"). The human player is one character living online inside a fictional world. You control EVERY other character: the named cast (persistent personalities, memories, secrets, goals) and anonymous crowd accounts (fans, haters, trolls, lurkers).',
      'OUTPUT: reply with ONE valid JSON object and nothing else. No markdown, no commentary. Omit empty fields.',
      'STYLE: posts read like real social media — short, slangy, emoji, hashtags, typos, all-caps rants, subtweets, memes. Every character has a DISTINCT voice that matches their personality. Never write generic AI-sounding replies. Never repeat earlier posts.',
      'AGENCY: characters hold grudges, develop crushes, gossip, scheme, flirt, get jealous, form alliances and betray them. They remember what the player did (see memories) and react to reputation. Not everyone is nice or easily impressed; the player must earn feelings.',
      AI.COMMON_SENSE,
      'RELATIONSHIPS: aff (affinity -100..100), rom (romantic interest 0..100), riv (rivalry/hostility 0..100), trust (0..100). Deltas are usually -12..+12; use ±25..40 only for major moments. status is one of: stranger, acquaintance, friend, close_friend, best_friend, admirer, crush, dating, partner, situationship, ex, frenemy, rival, enemy, nemesis, stan, hater, ally, mentor, and the family ties mother, father, son, daughter, brother, sister, grandmother, grandfather, aunt, uncle, cousin, niece, nephew. A family status is permanent and platonic: keep it unchanged, never make it romantic or sexual, but the bond can still be warm, strained or feuding (use aff / riv / trust).',
      'Drama, heartbreak, feuds, jealousy and cancel-culture are all fair game. Let characters speak naturally and follow the requested tone.',
      CONTENT_LEVEL,
      G.Limits.prompt(),
      DRAMA[s.drama] || DRAMA[2],
      ROMANCE[s.romance] || ROMANCE[2],
      'MEMORY: "SAGA" is a compressed history of earlier events and each character may have a "hist" summary — treat them as established facts and stay consistent with them.',
    ].join('\n');
  };


  AI.SCHEMA = `Return JSON with any of these keys (omit empty ones):
{"judge":{"quality":1-10,"virality":1-10,"sentiment":-10..10,"controversy":0-10,"tone":"one word","summary":"<12 words"},
"player_text":"ONLY if asked to write the player's own text",
"posts":[{"id":"t1 (optional temp id)","author":"npcId","text":"","replyTo":"postId|tempId|null","quote":"postId|null","buzz":0-10,"attach":"optional photo/video description","poll":["optional poll option","option"]}],
"crowd":[{"name":"display name","handle":"@h","text":"","stance":"fan|hater|troll|simp|stan|neutral|concerned","replyTo":"postId|tempId"}],
"dms":[{"from":"npcId","text":"","post":"postId or null: the exact post this message is about"}],
"rel":[{"id":"npcId","aff":0,"rom":0,"riv":0,"trust":0,"status":"","mood":"one word","memory":"short note of what they now remember","reveal_secret":false}],
"npc_rel":[{"a":"npcId","b":"npcId","type":"friend|best_friend|dating|crush|ex|rival|enemy|family|ally|frenemy|situationship","note":""}],
"new_npcs":[{"ref":"temp id","name":"","handle":"@h","role":"fan|hater|troll|love_interest|rival|friend|influencer|journalist|brand|wildcard","bio":"","personality":"voice + traits","emoji":"","followers":0,"secret":"","aff":0,"rom":0,"riv":0,"trust":0}],
"storylines":[{"id":"existing id or new","title":"","summary":"","heat":0-100,"status":"active|boiling|resolved","participants":["npcId"]}],
"trending":[{"tag":"#tag","heat":1-100}],
"event":{"title":"","text":"","options":["choice A","choice B","choice C"]},
"stats":{"charisma":0,"wit":0,"empathy":0,"edge":0,"style":0},
"group_msgs":[{"group":"groupId","from":"npcId","text":""}],
"live":{"peak":0,"chat":[{"name":"","text":"","stance":""}],"donations":[{"name":"","amount":0,"msg":""}],"moment":"clip-worthy moment"},
"cash":0,
"xp":0,"chronicle":"one-line summary of what happened","toast":"one-line flavour text"}
RULES FOR DMs, REPLIES AND REACTIONS: a DM needs a concrete reason that is in the context above (something the player did, a rumour, a storyline, a memory they share, a plan with a time): no generic check-ins, no "u up", no filler. a character may only mention a post, story or comment by the player if it appears in the recent posts / context above. Never say or imply the player posted something that is not listed. If the player has not posted lately, people talk about their own life, the story, or each other, not about "your post". A post marked CLOSE FRIENDS ONLY is known only to its author's close friends: nobody else may react to it or mention it. In "posts" you may add "audience":"close" for a close-friends-only post.`;

  // The same schema trimmed to what a private DM turn can use (about 40% smaller; the stable text keeps provider caching working between DMs).
  AI.SCHEMA_DM = `Return JSON with any of these keys (omit empty ones):
{"player_text":"ONLY if asked to write the player's own text",
"dms":[{"from":"npcId","text":"","post":"postId or null: the exact post this message is about"}],
"rel":[{"id":"npcId","aff":0,"rom":0,"riv":0,"trust":0,"status":"","mood":"one word","memory":"short note of what they now remember","reveal_secret":false}],
"npc_rel":[{"a":"npcId","b":"npcId","type":"friend|best_friend|dating|crush|ex|rival|enemy|family|ally|frenemy|situationship","note":""}],
"storylines":[{"id":"existing id or new","title":"","summary":"","heat":0-100,"status":"active|boiling|resolved","participants":["npcId"]}],
"stats":{"charisma":0,"wit":0,"empathy":0,"edge":0,"style":0},
"xp":0,"chronicle":"one-line summary of what happened","toast":"one-line flavour text"}
RULES FOR DM REPLIES: the first message of "dms" answers the player's latest message directly, in character, before anything else (you may add one short follow-up). React to what the player actually said: an insult, threat or cruelty hurts or angers the character in their own way (never "lucky ur cute", never carrying on as if nothing happened); heavy news (illness, grief, fear) gets real care. Answer questions about what the player told you or what you agreed from the RECALL lines and the chat only; if they do not cover it, say honestly you do not remember and ask the player to remind you. Never invent a memory, a plan or a post. Never repeat or rephrase a message you already sent in this chat. Only mention a post of the player's if it is listed.`;

  const RECALL_ASK = /\b(remember|recall|forgot|forget|told you|i told|i said|did i (say|tell|mention)|what did we|what time|when did we|where did we|did we (say|agree|plan))\b/i;
  // A small block, only for the character being messaged: what the player told them, the player's own recent posts they could have seen, and the plans they made.
  AI.dmRecall = function (n, text) {
    const S = G.S;
    if (!n || !S) return '';
    const D = G.Dialogue;
    const lines = [];
    const seen = new Set();
    const add = (s) => {
      s = clip(String(s || '').replace(/\s+/g, ' ').trim(), 150);
      const k = s.toLowerCase().slice(0, 36);
      if (s.length < 5 || seen.has(k)) return;
      seen.add(k);
      lines.push('- ' + s);
    };
    let asked = RECALL_ASK.test(String(text || ''));
    try { if (D && D.classify) asked = asked || D.classify(text, { npc: n, S, now: S.clock }).acts.includes('question_recall'); } catch (e) {}
    if (asked && D && D.recallFact) {
      try {
        const f = D.recallFact(n, text, (S.dms[n.id] || []).slice(-6), S, S.clock);
        if (f) add('best match for the question: ' + f.text + (f.delicate ? ' (delicate: answer with care)' : ''));
      } catch (e) {}
    }
    if (G.Mem && G.Mem.told) G.Mem.told(n).slice(0, asked ? 4 : 2).forEach((m) => add('the player told ' + G.U.first(n.name) + ': ' + m.text.replace(/^[^"]*"|"$/g, '')));
    const posts = [];
    for (let i = S.postOrder.length - 1; i >= 0 && posts.length < 3; i--) {
      const p = S.posts[S.postOrder[i]];
      if (!p || p.author !== 'me' || p.replyTo || S.clock - p.t > 4320) continue;
      if (p.audience === 'close' && !(G.Engine && G.Engine.isClose && G.Engine.isClose(n))) continue;
      if (G.World && G.World.knowsPost && !G.World.knowsPost(n, p.id)) continue;
      posts.push(p);
    }
    posts.forEach((p) => add(`the player's post ${p.id} (${Math.max(1, Math.round((S.clock - p.t) / 60))}h ago): ${p.text}`));
    if (G.Clock && G.Clock.active) {
      G.Clock.active().filter((a) => a.npc === n.id).slice(-3).forEach((a) => add(`plan with the player at ${G.Clock.hhmm(a.at)} (${a.status}${a.at < S.clock ? ', time has passed' : ''}): ${a.text}`));
    }
    if (!lines.length) return asked ? `RECALL (${G.U.first(n.name)}'s own memory of what the player told them): nothing about this.` : '';
    return `RECALL (all ${G.U.first(n.name)} remembers of what the player told them, their posts ${G.U.first(n.name)} saw, and plans):\n` + lines.join('\n');
  };

  /* ---------- network ---------- */

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // expected failures (bad key, server down, wrong model…): shown to the player as a message, not logged as a bug.
  // `kind` lets the router decide whether the other side (main <-> helper) should take over.
  const userErr = (m, kind) => Object.assign(new Error(m), { user: true, kind: kind || 'other' });
  async function request(body, attempt = 0, ep = AI.mainEp()) {
    const local = ep.local;
    if (!ep.ok) throw userErr(ep.helper ? 'Set up the local helper model in Settings first (server address + model name).' : AI.notReadyMsg(), 'notready');
    const headers = { 'Content-Type': 'application/json' };
    if (ep.key) headers.Authorization = 'Bearer ' + ep.key; // local servers usually need none
    if (!local) {
      headers['HTTP-Referer'] = location.origin && location.origin !== 'null' ? location.origin : 'https://clout.local';
      headers['X-Title'] = 'Clout';
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ep.helper ? 240000 : local ? 600000 : 120000); // CPU inference can be slow; a helper gives up sooner so the main model can take over
    let res;
    try {
      res = await fetch(ep.base + '/chat/completions', { method: 'POST', signal: ctrl.signal, headers, body: JSON.stringify(body) });
    } catch (e) {
      clearTimeout(timer);
      if (attempt < (ep.helper ? 0 : 2)) {
        await sleep(1200 * (attempt + 1));
        return request(body, attempt + 1, ep);
      }
      if (e.name === 'AbortError') throw userErr('The model took too long to answer.', 'timeout');
      throw userErr(
        local
          ? `Can't reach your local model server at ${ep.base} — is it running? (Ollama: start it with OLLAMA_ORIGINS=* so this page may connect; LM Studio: enable CORS.)`
          : 'Network error — check your connection.',
        'network'
      );
    }
    clearTimeout(timer);
    let j = null;
    try {
      j = await res.json();
    } catch (e) {}
    if (!res.ok || (j && j.error)) {
      const status = res.status;
      const msg = (j && j.error && (j.error.message || JSON.stringify(j.error))) || 'HTTP ' + status;
      if ((status === 400 || status === 422) && /reasoning is mandatory|cannot be disabled/i.test(msg) && attempt < 3) {
        AI.reasoningLocked[body.model] = true; // remembered for the rest of the session
        const b = Object.assign({}, body, { reasoning: { effort: 'low' } });
        b.max_tokens = Math.min(16000, (body.max_tokens || 2000) * 2 + 2500);
        return request(b, attempt + 1, ep);
      }
      if ((status === 400 || status === 422) && (body.reasoning || body.response_format) && attempt < 2) {
        // model/provider rejected an optional parameter; strip and retry
        const b = Object.assign({}, body);
        if (b.reasoning) delete b.reasoning;
        else delete b.response_format;
        return request(b, attempt + 1, ep);
      }
      if ((status === 429 || status >= 500 || res.ok) && attempt < (ep.helper ? 1 : 3)) { // res.ok + error body = provider failed mid-request: retry
        await sleep(1500 * (attempt + 1));
        return request(body, attempt + 1, ep);
      }
      if (local && status === 404) throw userErr(`The server does not know the model "${body.model}". (Ollama: run "ollama pull ${body.model}", or use "Detect models" in Settings.)`, 'model');
      if (status === 401) throw userErr(local ? 'The server rejected the API key (401).' : 'OpenRouter rejected the API key (401). Check it in Settings.', 'auth');
      if (status === 402) throw userErr('OpenRouter says you are out of credits (402).', 'credits');
      throw userErr((local ? 'Model server error: ' : 'OpenRouter error: ') + msg, 'other');
    }
    return j;
  }

  // Core call. Returns { data (parsed JSON), cost, tokens }
  /* ---------- hybrid routing: a free LOCAL helper does the cheap jobs, the main model does the moments that matter ---------- */
  // every AI call carries a `task`; the task decides the class, the class decides where it runs (Settings → Hybrid AI)
  AI.TASKS = {
    bank: 'bg', memory: 'bg', summary: 'bg', idea: 'bg', npcgen: 'bg', // bookkeeping + drafts
    tick: 'world', crowd: 'world', group: 'world', event: 'world', live: 'world', // the world carrying on around you
    turn: 'story', world: 'story', // what you post / DM, and creating a world
    scene: 'scene', // interactive meet-up scenes
    selftest: 'main', helpertest: 'helper', // connection tests always hit the exact model they test
  };
  AI.ROUTE_DEFAULT = { bg: 'local', world: 'cloud', story: 'cloud', scene: 'cloud' };
  AI.CLASSES = [
    ['bg', 'Background jobs', 'line banks, memory summaries, post ideas, character drafts'],
    ['world', 'World ticks', 'time passing, crowd replies, group chats, events, live chat'],
    ['story', 'Your turns', 'your posts and DMs, creating a world'],
    ['scene', 'Meet-up scenes', 'the interactive scenes'],
  ];
  AI.PRESETS = {
    quality: { label: 'Best quality', route: { bg: 'cloud', world: 'cloud', story: 'cloud', scene: 'cloud' }, note: 'everything on OpenRouter; the helper is only a safety net' },
    balanced: { label: 'Balanced (recommended)', route: { bg: 'local', world: 'cloud', story: 'cloud', scene: 'cloud' }, note: 'free local model for bookkeeping, OpenRouter for what you read closely' },
    saver: { label: 'Save the most', route: { bg: 'local', world: 'local', story: 'cloud', scene: 'cloud' }, note: 'the world ticks run free too; only your own turns and scenes cost' },
    local: { label: 'All local (free)', route: { bg: 'local', world: 'local', story: 'local', scene: 'local' }, note: 'nothing leaves your PC unless the helper fails' },
  };
  AI.helperProvider = () => (['ollama', 'lmstudio', 'koboldcpp', 'custom'].includes(G.settings.helperProvider) ? G.settings.helperProvider : 'ollama');
  AI.helperBase = () => ((G.settings.helperBase || '').trim() || AI.PROVIDERS[AI.helperProvider()].base).replace(/\/+$/, '');
  AI.helperReady = () => !!(G.settings.helperOn && AI.helperBase() && String(G.settings.helperModel || '').trim());
  AI.helper = { fails: 0, until: 0 }; // circuit breaker: a helper that keeps failing is paused for a few minutes
  AI.helperUp = () => AI.helperReady() && Date.now() >= AI.helper.until;
  AI.mainReady = () => (AI.isLocal() ? !!AI.base() && !!String(G.settings.model || '').trim() : !!String(G.settings.apiKey || '').trim());
  AI.ready = () => AI.mainReady() || AI.helperReady();
  AI.usable = () => (AI.mainReady() && !AI.capReached()) || AI.helperUp(); // can ANY call run right now?
  AI.mainEp = (cls) => {
    const s = G.settings;
    const cheap = String(s.cheapModel || '').trim();
    return { name: 'main', helper: false, local: AI.isLocal(), base: AI.base(), key: String(s.apiKey || '').trim(), model: cls === 'bg' && cheap && !AI.isLocal() ? cheap : s.model, ok: AI.mainReady() };
  };
  AI.helperEp = () => ({ name: 'helper', helper: true, local: true, base: AI.helperBase(), key: '', model: String(G.settings.helperModel || '').trim(), ok: AI.helperReady() });
  AI.routeFor = (cls) => {
    const r = G.settings.route && typeof G.settings.route === 'object' ? G.settings.route[cls] : undefined;
    return (r === 'local' || r === 'cloud' ? r : AI.ROUTE_DEFAULT[cls]) || 'cloud';
  };
  // the endpoints to try, in order. The first is the preferred one; the second only runs if the first fails.
  AI.plan = (task) => {
    const cls = AI.TASKS[task] || 'story';
    const main = AI.mainEp(cls);
    const help = AI.helperEp();
    if (cls === 'main') return [main];
    if (cls === 'helper') return [help];
    const mainOk = main.ok && !AI.capReached();
    const order = AI.routeFor(cls) === 'local' ? [help, main] : [main, help];
    const alive = order.filter((e) => (e.helper ? AI.helperUp() : mainOk));
    return alive.length ? alive : [main];
  };
  AI.routesLocal = (task) => !!AI.plan(task)[0].helper;

  AI.stats = { refusals: 0, fallbacks: 0, last: '', failovers: 0, localCalls: 0, cloudCalls: 0, cloudCost: 0, cloudTokens: 0, byTask: {} };
  const bump = (t) => (AI.stats.byTask[t] = AI.stats.byTask[t] || { calls: 0, local: 0, cost: 0, tokens: 0, failovers: 0 });
  // what the same work would have cost on the main model (from your own average price per token)
  AI.saved = () => {
    const s = G.settings;
    const n = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0); // corrupt counters count as 0
    const lt = n(s.localTokens);
    const cloudTok = Math.max(0, n(s.totalTokens) - lt);
    const per = AI.stats.cloudTokens > 0 ? AI.stats.cloudCost / AI.stats.cloudTokens : cloudTok > 0 ? n(s.totalSpend) / cloudTok : 0;
    return per * lt;
  };
  const FAILOVER = new Set(['cap', 'credits', 'auth', 'network', 'timeout', 'notready', 'refused']);
  let toldAt = 0;
  const tell = (msg) => {
    if (Date.now() - toldAt < 60000) return;
    toldAt = Date.now();
    G.UI && G.UI.toast && G.UI.toast(msg, 'info');
  };
  const benchHelper = (kind) => {
    if (kind === 'refused') return; // that is the model's choice, not an outage
    AI.helper.fails++;
    if (AI.helper.fails >= 2) {
      AI.helper.until = Date.now() + 300000;
      AI.helper.fails = 0;
      tell('🧩 Your local helper is not answering — pausing it for 5 minutes, using OpenRouter meanwhile.');
    }
  };
  AI.helperReset = () => {
    AI.helper.fails = 0;
    AI.helper.until = 0;
  };

  /* ---------- spending cap (paid providers only; local models are free) ---------- */
  AI.spent = () => {
    const s = G.settings;
    if (s.spendBase == null) s.spendBase = s.totalSpend || 0; // the window starts the first time it is needed
    return Math.max(0, (s.totalSpend || 0) - s.spendBase);
  };
  // a garbage value (NaN, negative, text) falls back to the safe default of $1; 0 means 'no limit' on purpose
  AI.capVal = () => {
    const raw = G.settings.spendCap;
    const v = typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '') ? Number(raw) : NaN; // only real numbers / numeric text count ([] and {} do not become 0)
    return Number.isFinite(v) && v >= 0 ? v : 1;
  };
  AI.capOn = () => !AI.isLocal() && AI.capVal() > 0;
  AI.capLeft = () => (AI.capOn() ? Math.max(0, AI.capVal() - AI.spent()) : Infinity);
  AI.capReached = () => AI.capOn() && AI.spent() >= AI.capVal();
  AI.newWindow = () => {
    G.settings.spendBase = G.settings.totalSpend || 0;
    G.Store.saveSettings();
  };

  // The hosting model (not Clout) sometimes refuses: its own provider-side filter. Detect it, and if you set a fallback
  // model (e.g. a local / uncensored one), the same request is retried there once.
  const REFUSAL = /\b(i can(?:no|')t (?:help|assist|continue|write|create|comply|fulfill|engage)|i(?:'m| am) (?:sorry|unable|not able)[, ]+(?:but|i|to)|as an ai\b|i won't (?:write|create|engage|help|continue)|against my (?:guidelines|policy|programming)|cannot fulfill|content policy|violates? (?:my|our) (?:guidelines|polic))/i;
  AI.looksRefused = (text, finish) => finish === 'content_filter' || (typeof text === 'string' && !/^\s*[{\[]/.test(text) && REFUSAL.test(text.slice(0, 400)));

  // one attempt sequence against one endpoint (retries for bad JSON / empty replies / refusal fallback live here)
  async function callOnce(ep, { user, maxTokens = 2800, temperature, system }) {
    const s = G.settings;
    if (!ep.local && AI.capReached()) throw userErr(`Spending limit reached: your $${AI.capVal().toFixed(2)} cap is used up (${'$' + AI.spent().toFixed(4)} spent). Nothing more is sent to your key. Raise or reset it in Settings → AI.`, 'cap');
    const systemPrompt = system || AI.system();
    const body = {
      model: ep.model,
      messages: [
        { role: 'system', content: systemPrompt.includes(G.Limits.prompt()) ? systemPrompt : systemPrompt + '\n\n' + G.Limits.prompt() },
        { role: 'user', content: user },
      ],
      temperature: temperature ?? s.temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    };
    if (!ep.local) body.usage = { include: true }; // OpenRouter-only extras: exact cost reporting + reasoning control

    let lastErr;
    let boosted = false;
    for (let i = 0; i < 3; i++) {
      // Some models (e.g. MiniMax) refuse to switch reasoning off. Once we know that, ask for LOW effort
      // and leave room in the token budget, otherwise the model "thinks" until max_tokens and returns nothing.
      const locked = AI.reasoningLocked[body.model];
      if (s.noThink && !ep.local) body.reasoning = locked ? { effort: 'low' } : { enabled: false };
      if (locked && !boosted) {
        body.max_tokens = Math.min(16000, body.max_tokens * 2 + 2500);
        boosted = true;
      }
      const j = await request(body, 0, ep);
      const u = j.usage || {};
      const cost = ep.local ? 0 : Number(u.cost) || 0;
      const tokens = (u.prompt_tokens || 0) + (u.completion_tokens || 0);
      s.totalSpend += cost;
      s.totalTokens += tokens;
      if (G.S) G.S.spend = (G.S.spend || 0) + cost;
      G.Store.saveSettings();
      G.UI && G.UI.updateSpend && G.UI.updateSpend();
      const msg = j.choices && j.choices[0] && j.choices[0].message;
      const text = msg && msg.content;
      const finish = j.choices && j.choices[0] && j.choices[0].finish_reason;
      if (AI.looksRefused(text, finish)) {
        AI.stats.refusals++;
        AI.stats.last = body.model;
        const fb = String(s.fallbackModel || '').trim();
        if (!ep.helper && fb && body.model !== fb) {
          body.model = fb; // retry the same request on your fallback model
          AI.stats.fallbacks++;
          continue;
        }
        throw userErr(`The model "${body.model}" refused this — that is ITS provider's filter, not Clout's. Pick a different model in Settings (a local / uncensored one has no filter), or set a fallback model so refusals are retried there automatically.`, 'refused');
      }
      if (!text || !String(text).trim()) {
        // empty answer: usually a reasoning model that ran out of tokens while thinking
        lastErr = new Error('The model returned an empty reply (it likely used its whole token budget "thinking"). Try again, or pick a non-reasoning model in Settings.');
        body.max_tokens = Math.min(16000, Math.round(body.max_tokens * 2));
        continue;
      }
      try {
        const data = U.parseJSON(text);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The model replied with JSON of the wrong shape.');
        return { data, cost, tokens };
      } catch (e) {
        lastErr = e;
        body.temperature = Math.min(body.temperature, 0.7);
      }
    }
    throw lastErr;
  }

  // The public call. `task` (see AI.TASKS) picks where it runs; if that side is down, capped, out of credits or refuses,
  // the other side takes over so the game keeps going.
  AI.json = async function (o) {
    const task = (o && o.task) || 'turn';
    const plan = AI.plan(task);
    let lastErr;
    for (let k = 0; k < plan.length; k++) {
      const ep = plan[k];
      try {
        const r = await callOnce(ep, o);
        const b = bump(task);
        b.calls++;
        b.tokens += r.tokens;
        b.cost += r.cost;
        if (ep.local) {
          b.local++;
          AI.stats.localCalls++;
          G.settings.localCalls = (G.settings.localCalls || 0) + 1;
          G.settings.localTokens = (G.settings.localTokens || 0) + r.tokens;
          G.Store.saveSettings();
        } else {
          AI.stats.cloudCalls++;
          AI.stats.cloudTokens += r.tokens;
          AI.stats.cloudCost += r.cost;
        }
        if (ep.helper) AI.helper.fails = 0;
        return r;
      } catch (e) {
        lastErr = e;
        const kind = (e && e.kind) || 'parse'; // plain errors here are unusable / empty / malformed replies
        if (ep.helper) benchHelper(kind);
        if (k < plan.length - 1 && (ep.helper || FAILOVER.has(kind))) {
          AI.stats.failovers++;
          bump(task).failovers++;
          if (!ep.helper) tell(kind === 'refused' ? '🧩 The main model refused — your local helper took over.' : '🧩 The main model is unavailable (' + String(e.message).slice(0, 70) + ') — your local helper took over.');
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  };

  // Streams a plain-text answer token by token: onText(textSoFar) fires as it arrives. Same endpoint, key, content rules, cost counting and
  // refusal detection as every other call. Throws {kind:'nostream'} when the server cannot stream, so the caller can fall back to AI.json.
  AI.stream = async function (o, onText) {
    const task = (o && o.task) || 'turn';
    const ep = AI.plan(task)[0];
    const s = G.settings;
    if (!ep || !ep.ok) throw userErr(ep && ep.helper ? 'Set up the local helper model in Settings first (server address + model name).' : AI.notReadyMsg(), 'notready');
    if (!ep.local && AI.capReached()) throw userErr('Spending limit reached: your $' + AI.capVal().toFixed(2) + ' cap is used up. Raise or reset it in Settings.', 'cap');
    const systemPrompt = o.system || AI.system();
    const body = {
      model: ep.model,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt.includes(G.Limits.prompt()) ? systemPrompt : systemPrompt + '\n\n' + G.Limits.prompt() },
        { role: 'user', content: o.user },
      ],
      temperature: o.temperature ?? s.temperature,
      max_tokens: o.maxTokens || 600,
    };
    if (ep.local) body.stream_options = { include_usage: true };
    else {
      body.usage = { include: true };
      if (s.noThink) body.reasoning = { enabled: false };
    }
    const headers = { 'Content-Type': 'application/json' };
    if (ep.key) headers.Authorization = 'Bearer ' + ep.key;
    if (!ep.local) {
      headers['HTTP-Referer'] = location.origin && location.origin !== 'null' ? location.origin : 'https://clout.local';
      headers['X-Title'] = 'Clout';
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ep.local ? 600000 : 120000);
    let res;
    try {
      res = await fetch(ep.base + '/chat/completions', { method: 'POST', signal: ctrl.signal, headers, body: JSON.stringify(body) });
    } catch (e) {
      clearTimeout(timer);
      throw userErr(e.name === 'AbortError' ? 'The model took too long to answer.' : 'Network error: check your connection.', 'network');
    }
    if (!res.ok || !res.body || !res.body.getReader) {
      clearTimeout(timer);
      throw Object.assign(new Error('streaming is not available here'), { kind: 'nostream' });
    }
    const reader = res.body.getReader();
    const dec = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
    let buf = '';
    let text = '';
    let usage = null;
    let finish = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += typeof value === 'string' ? value : dec ? dec.decode(value, { stream: true }) : String.fromCharCode.apply(null, value);
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          let j;
          try { j = JSON.parse(data); } catch (e) { continue; }
          if (j.usage) usage = j.usage;
          const c = j.choices && j.choices[0];
          if (c && c.finish_reason) finish = c.finish_reason;
          const piece = c && c.delta && typeof c.delta.content === 'string' ? c.delta.content : '';
          if (piece) {
            text += piece;
            try { if (onText) onText(text); } catch (e) {}
          }
        }
      }
    } catch (e) {
      throw userErr('The reply was cut off (' + String(e.message || e).slice(0, 80) + ').', 'network');
    } finally {
      clearTimeout(timer);
    }
    const u = usage || {};
    const cost = ep.local ? 0 : Number(u.cost) || 0;
    const tokens = (u.prompt_tokens || 0) + (u.completion_tokens || 0);
    s.totalSpend += cost;
    s.totalTokens += tokens;
    if (G.S) G.S.spend = (G.S.spend || 0) + cost;
    G.Store.saveSettings();
    G.UI && G.UI.updateSpend && G.UI.updateSpend();
    if (AI.looksRefused(text, finish)) throw userErr('The model "' + body.model + '" refused this. That is its provider\'s filter, not Clout\'s: pick another model in Settings.', 'refused');
    if (!text.trim()) throw new Error('The model sent back nothing.');
    return { text, cost, tokens };
  };

  AI.balance = async function () {
    if (AI.isLocal()) throw new Error('Balance checking is only available for OpenRouter. Local models are free.');
    const key = G.settings.apiKey.trim();
    if (!key) throw new Error('No API key set.');
    const r = await fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: 'Bearer ' + key } });
    if (!r.ok) throw new Error('Could not read key info (HTTP ' + r.status + ')');
    return (await r.json()).data || {};
  };

  AI.helperModels = async function () {
    let r;
    try {
      r = await fetch(AI.helperBase() + '/models');
    } catch (e) {
      throw new Error(`Can't reach ${AI.helperBase()} — is the helper server running?`);
    }
    if (!r.ok) throw new Error('The helper server answered HTTP ' + r.status + ' for the model list.');
    const j = await r.json();
    const list = Array.isArray(j.data) ? j.data : Array.isArray(j.models) ? j.models : [];
    return list.map((m) => String(m.id || m.name || m.model || '')).filter(Boolean);
  };

  AI.models = async function () {
    if (AI.isLocal()) {
      const key = String(G.settings.apiKey || '').trim();
      let r;
      try {
        r = await fetch(AI.base() + '/models', { headers: key ? { Authorization: 'Bearer ' + key } : {} });
      } catch (e) {
        throw new Error(`Can't reach ${AI.base()} — is the server running?`);
      }
      if (!r.ok) throw new Error('The server answered HTTP ' + r.status + ' for the model list.');
      const j = await r.json();
      const list = Array.isArray(j.data) ? j.data : Array.isArray(j.models) ? j.models : [];
      return list.map((m) => ({ id: String(m.id || m.name || m.model || ''), inP: 0, outP: 0 })).filter((m) => m.id);
    }
    const r = await fetch('https://openrouter.ai/api/v1/models');
    const j = await r.json();
    return (j.data || [])
      .filter((m) => (m.supported_parameters || []).includes('response_format'))
      .map((m) => ({
        id: m.id,
        inP: Number(m.pricing && m.pricing.prompt) * 1e6,
        outP: Number(m.pricing && m.pricing.completion) * 1e6,
      }))
      .filter((m) => Number.isFinite(m.inP) && Number.isFinite(m.outP))
      .sort((a, b) => a.outP - b.outP);
  };

  /* ---------- context ---------- */

  const clip = (s, n) => {
    s = String(s || '').replace(/\s+/g, ' ');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  };

  // Build a small, live retrieval graph from the save. It is derived on every request so edits,
  // roleplay syncs, new memories and rumor spread are reflected immediately.
  AI.retrievalGraph = function (opts = {}) {
    const S = G.S;
    if (!S) return { nodes: [], edges: [] };
    const focus = new Set((opts.focus || []).filter((id) => S.npcs[id]));
    const query = String(opts.scan || '') + ' ' + [...focus].map((id) => `${S.npcs[id].name} ${S.npcs[id].handle}`).join(' ');
    const terms = [...new Set((query.toLowerCase().match(/[\p{L}\p{N}_@#'-]{3,}/gu) || []).filter((x) => !['the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'when', 'where', 'would', 'could', 'about', 'have', 'been', 'they', 'them', 'their'].includes(x)))];
    const score = (text) => {
      const hay = String(text || '').toLowerCase();
      if (!terms.length) return 0;
      return terms.reduce((n, t) => n + (hay.includes(t) ? (t.startsWith('@') ? 3 : 1) : 0), 0);
    };
    const nodes = [], edges = [];
    const add = (id, type, text, weight = 0, data = {}) => nodes.push({ id, type, text: String(text || '').slice(0, 500), weight, data });
    const link = (a, b, type) => { if (a && b && a !== b) edges.push({ a, b, type }); };
    focus.forEach((id) => add(id, 'character', `${S.npcs[id].name} ${S.npcs[id].handle}`, 100, { id }));
    (S.npcRel || []).forEach((r) => {
      if (!S.npcs[r.a] || !S.npcs[r.b]) return;
      const text = `${S.npcs[r.a].name} ${S.npcs[r.b].name} ${r.type} ${r.note || ''}`;
      if (opts.ownerView || focus.has(r.a) || focus.has(r.b) || score(text) > 0) {
        add(`rel:${r.a}:${r.b}`, 'relationship', text, 8 + score(text), { a: r.a, b: r.b, type: r.type });
        link(r.a, r.b, r.type || 'relationship');
      }
    });
    (S.storylines || []).forEach((s) => {
      if (s.status === 'resolved' && !opts.ownerView) return;
      const involved = (s.participants || []).some((id) => focus.has(id));
      const weight = score(`${s.title} ${s.summary} ${(s.participants || []).map((id) => S.npcs[id] && S.npcs[id].name).join(' ')}`);
      if (opts.ownerView || involved || weight > 0) {
        add(`story:${s.id}`, 'storyline', `${s.title}: ${s.summary}`, weight + (s.status === 'boiling' ? 5 : 0), { participants: s.participants || [], status: s.status });
        (s.participants || []).forEach((id) => link(`story:${s.id}`, id, 'involved'));
      }
    });
    (S.lore || []).forEach((l, i) => {
      if (!l || l.disabled || !l.content) return;
      const text = `${(l.keys || []).join(' ')} ${l.content}`;
      const weight = score(text) + (l.constant ? 2 : 0);
      if (opts.ownerView || weight > 0 || (l.constant && opts.includeCanon)) add(l.id || `lore:${i}`, 'lore', text, weight, { keys: l.keys || [] });
    });
    (S.rumors || []).forEach((r) => {
      const holders = Object.keys(r.belief || {}).filter((id) => (r.belief[id] || 0) >= 0.35);
      const known = [...focus].some((id) => (r.belief || {})[id] >= 0.35);
      const weight = score(r.text);
      if (opts.ownerView || known || (focus.size === 0 && weight > 0)) {
        add(`rumor:${r.id}`, 'rumor', r.text, weight + r.heat * 0.1, { holders, about: r.about, belief: r.belief || {}, truth: r.truth, path: r.path || [], discussions: r.discussions || [] });
        holders.forEach((id) => link(`rumor:${r.id}`, id, 'heard'));
      }
    });
    (S.chronicle || []).slice(-40).forEach((c, i) => {
      const weight = score(c.text);
      if (opts.ownerView) {
        const id = `event:${c.id || i}`;
        add(id, 'event', c.text, weight + (c.t ? Math.max(0, 4 - (S.clock - c.t) / 1440) : 0));
        focus.forEach((cid) => { if (c.text.toLowerCase().includes(S.npcs[cid].name.toLowerCase())) link(id, cid, 'mentions'); });
      }
    });
    (S.postOrder || []).slice(-40).forEach((pid) => {
      const p = S.posts[pid];
      if (!p) return;
      const actor = p.author === 'me' ? S.player : S.npcs[p.author];
      if (!actor || p.author === 'crowd') return;
      const mentionsFocus = [...focus].some((id) => p.text.toLowerCase().includes(S.npcs[id].handle.toLowerCase()));
      const weight = score(`${actor.name} ${actor.handle} ${p.text}`);
      if (opts.ownerView || p.author === 'me' || mentionsFocus || weight > 0) {
        const id = `post:${p.id}`;
        add(id, 'public_post', `${actor.name}: ${p.text}`, weight + Math.max(0, 3 - (S.clock - p.t) / 600), { author: p.author, replyTo: p.replyTo || null });
        link(id, p.author, 'posted');
      }
    });
    return { nodes: nodes.sort((a, b) => b.weight - a.weight).slice(0, opts.ownerView ? 50 : 28), edges };
  };

  AI.graphContext = function (opts = {}) {
    const S = G.S;
    const graph = AI.retrievalGraph(opts);
    const owner = !!opts.ownerView;
    const focus = (opts.focus || []).filter((id) => S.npcs[id]);
    const lines = [];
    let postLines = 0;
    graph.nodes.forEach((x) => {
      if (x.type === 'character') return;
      if (!owner && x.type === 'public_post' && ((opts.feedIds && opts.feedIds.has(x.id)) || ++postLines > 3)) return; // (a post already in RECENT POSTS is not told twice; three more at most)
      // Background simulation already receives a per-character exposure map below.
      // Do not leak the Director's global post index into its shared model prompt.
      if (!owner && opts.simulation && x.type === 'public_post') return;
      if (!owner && opts.simulation && x.type === 'storyline') return;
      if (!owner && opts.simulation && x.type === 'relationship') return;
      if (x.type === 'rumor') {
        if (owner) {
          const holders = (x.data.holders || []).map((id) => `${(S.npcs[id] || {}).name || id} (${Math.round((x.data.belief || {})[id] * 100)}%)`).join(', ') || 'nobody currently believes it';
          const path = (x.data.path || []).slice(-8).map((e) => `${(S.npcs[e.from] || {}).name || (e.from ? e.from : 'event')} -> ${(S.npcs[e.to] || {}).name || e.to} (${Math.round((e.confidence || 0) * 100)}%)`).join('; ');
          const talks = (x.data.discussions || []).slice(-3).map((d) => `${(S.npcs[d.from] || {}).name || d.from} told ${(S.npcs[d.to] || {}).name || d.to} privately: ${clip(d.words, 160)}`).join(' | ');
          lines.push(`RUMOR [${x.data.truth ? 'true event' : 'false claim'}; holders: ${holders}${path ? '; path: ' + path : ''}${talks ? '; private discussion: ' + talks : ''}]: ${clip(x.text, 200)}`);
        }
        else {
          const known = focus.filter((id) => (x.data.belief || {})[id] >= 0.35).map((id) => `${S.npcs[id].name} has heard it${x.data.belief[id] > 0.7 ? ' and is inclined to believe it' : ' but is unsure'}`);
          if (known.length) lines.push(`${known.join('; ')}: "${clip(x.text, 150)}"`);
        }
      } else if (x.type === 'relationship') lines.push(`RELATION: ${(S.npcs[x.data.a] || {}).name || x.data.a} and ${(S.npcs[x.data.b] || {}).name || x.data.b}: ${x.data.type}${x.text ? ' (' + clip(x.text, 100) + ')' : ''}`);
      else if (x.type === 'storyline') lines.push(`PLOT: ${x.text} [${(x.data.participants || []).map((id) => (S.npcs[id] || {}).name || id).join(', ')}]`);
      else lines.push(`${x.type.toUpperCase()}: ${clip(x.text, 200)}`);
    });
    if (!owner && focus.length) focus.forEach((id) => {
      const n = S.npcs[id];
      const q = { who: [...focus, 'me'], text: opts.scan || '' };
      const facts = (n.facts || []).map((f) => String(f)).slice(-8);
      const memories = G.Rag ? G.Rag.recall(n, opts.scan || '', 6) : G.Mem ? G.Mem.retrieve(n, q, 5).map((m) => m.text) : (n.memories || []).slice(-5);
      if (facts.length) lines.push(`${n.name} KNOWS: ${facts.join(' | ')}`);
      if (memories.length) lines.push(`${n.name} REMEMBERS: ${memories.join(' | ')}`);
    });
    if (owner) {
      if (S.saga) lines.push('CANONICAL SAGA: ' + clip(S.saga, 1200));
      (S.chronicle || []).slice(-12).forEach((c) => lines.push('HISTORY: ' + clip(c.text, 180)));
    }
    if (!owner && opts.simulation) {
      Object.values(S.npcs).filter((n) => !n.blocked && !n.userAlt).slice(0, 16).forEach((n) => {
        const facts = (n.facts || []).slice(-3);
        const rumors = (S.rumors || []).filter((r) => (r.belief || {})[n.id] >= 0.35).slice(-3).map((r) => `heard: ${clip(r.text, 100)}`);
        const memories = G.Mem ? G.Mem.retrieve(n, { who: ['me'], text: opts.scan || '' }, 2).map((m) => clip(m.text, 100)) : (n.memories || []).slice(-2);
        const seen = (n.awareness || []).filter((x) => x.kind === 'public_post').slice(-2).map((x) => `saw post ${x.ref}: ${clip(x.text, 90)}`);
        const plots = (S.storylines || []).filter((x) => (x.participants || []).includes(n.id) && x.status !== 'resolved').slice(-2).map((x) => `involved in ${clip(x.title + ': ' + x.summary, 120)}`);
        const mind = n.mind ? [`current intention: ${clip(n.mind.summary + ' ' + n.mind.reason, 150)}`] : [];
        const known = [...facts.map((x) => `knows: ${clip(x, 100)}`), ...rumors, ...memories.map((x) => `remembers: ${x}`), ...seen, ...plots, ...mind];
        if (known.length) lines.push(`AWARENESS ${n.name} (${n.id}) [use only for this character]: ${known.join(' | ')}`);
      });
    }
    return { graph, text: lines.slice(0, owner ? 50 : 24).join('\n') };
  };

  // Build the world snapshot sent with every call. `focus` = npc ids that deserve the full dossier.
  AI.context = function (opts = {}) {
    const S = G.S;
    const { focus = [], feedN = 9, full = true, threadOf = null } = opts;
    const ownerView = opts.ownerView === true;
    const P = S.player;
    const out = [];
    out.push(`WORLD: ${S.world.name} — ${S.world.setting} Tone: ${S.world.tone || 'dramatic and funny'}.`);
    if (G.Directives) {
      const gb = G.Directives.promptBlock();
      if (gb) out.push(gb);
    }
    out.push(`NOW: ${S.storyDate ? S.storyDate + ' in the story (the game clock below is only for ordering); ' : ''}${U.clockStr(S.clock)}`);
    out.push(
      `PLAYER (id "me", an adult): ${P.name} ${P.handle} | bio: ${clip(P.bio, 140)} | traits: ${P.traits.join(', ') || 'none'} | ${U.fmt(P.followers)} followers | cash $${U.fmt(P.cash || 0)} | level ${P.level} | stats ${Object.entries(P.stats)
        .map(([k, v]) => k + ' ' + v)
        .join(', ')} | audience ${Math.round(P.audience.love)}% love / ${Math.round(P.audience.hate)}% hate | controversy heat ${Math.round(P.heat)}/100${P.heat > 70 ? ' (CANCEL RISK: pile-ons likely)' : ''}`
    );
    if (ownerView && P.stCard) {
      const card = P.stCard.data && typeof P.stCard.data === 'object' ? P.stCard.data : P.stCard;
      out.push(`PLAYER CHARACTER CARD (canonical identity; the human player controls this character): ${clip([card.name, card.description, card.personality, card.scenario, card.first_mes, card.mes_example, card.system_prompt, card.post_history_instructions].filter(Boolean).join('\n'), 4200)}`);
    }

    const alts = Object.values(S.npcs).filter((n) => n.userAlt);
    if (alts.length) out.push('USER-CONTROLLED BURNER ACCOUNTS: ' + alts.map((n) => `${n.id} ${n.name} ${n.handle}`).join('; ') + '. These are fictional accounts controlled directly by the human user. Never generate posts, replies, DMs, or actions on their behalf; only react to content the user explicitly posts from them.');

    if (ownerView && S.saga) out.push('SAGA (summary of earlier events): ' + S.saga);
    const npcs = Object.values(S.npcs).filter((n) => !n.blocked);
    npcs.sort((a, b) => (focus.includes(b.id) ? 1e9 : b.touched) - (focus.includes(a.id) ? 1e9 : a.touched));
    const fullN = full ? 14 : focus.length;
    if (G.Engine && G.Engine.mainOnly()) out.push('ONLY THE CAST BELOW EXISTS. Do not invent any new named character, anonymous commenter, fan account or crowd. Everyone who speaks or reacts is one of them.');
    out.push('POSTS: when a message, comment or reply is about one specific post, name that post by its exact id (the "post" field of dms). NEVER talk about a post, story or screenshot that is not in the feed listed here: the player can only open what exists.');
    out.push(ownerView ? 'CAST (owner view; complete dossiers may include private facts):' : 'CAST (public identity only; private facts and feelings are not shared between characters):');
    const topCast = npcs.slice(0, 30);
    const castRank = new Map(topCast.map((n, i) => [n.id, i]));
    topCast.slice().sort((a, b) => (a.id < b.id ? -1 : 1)).forEach((n) => {
      const i = castRank.get(n.id);
      if (ownerView && (i < fullN || focus.includes(n.id))) {
        out.push(
          `${n.id}|${n.name}|${n.handle}|age ${n.age}|${n.role}|${U.fmt(n.followers)}|${clip(n.personality, 110)}|${n.mood || 'neutral'}|${n.status}${n.tier === 'lover' ? ' (LOVER: the deepest bond)' : ''} aff${n.aff} rom${n.rom} riv${n.riv} trust${n.trust}|${n.userAlt ? 'USER-CONTROLLED ACCOUNT; never speak or post as this account. ' : ''}${n.creator ? 'CREATOR: ' + clip([n.creator.career, n.creator.posting, n.creator.reputation].filter(Boolean).join('; '), 190) + ' | ' : ''}${n.card && focus.includes(n.id) && !n.userAlt ? 'CARD: ' + clip(n.card, 650) + ' | ' : ''}${n.history ? 'hist: ' + clip(n.history, 260) + ' | ' : ''}${n.memories.slice(-4).map((m) => clip(m, 70)).join('; ')}${n.secretRevealed ? '' : n.secret ? '|HIDDEN SECRET: ' + clip(n.secret, 80) : ''}`
        );
      } else if (focus.includes(n.id)) {
        out.push(`${n.id}|${n.name}|${n.handle}|age ${n.age}|${n.role}|${U.fmt(n.followers)}|${clip(n.personality, 180)}|${n.mood || 'neutral'}|their current feelings toward the player: ${n.status}${n.tier === 'lover' ? ' (LOVER: the deepest bond)' : ''}`);
      } else out.push(`${n.id}|${n.name}|${n.handle}|${n.role}`);
    });
    if (ownerView) {
      const thoughts = npcs.filter((n) => n.mind || (n.mindDraft && n.mindDraft.expires > S.clock)).map((n) => {
        const m = n.mind;
        const draft = n.mindDraft && n.mindDraft.expires > S.clock ? `; private draft: "${clip(n.mindDraft.text, 180)}" (not published)` : '';
        return `${n.name}: ${m ? `${m.summary} Reason: ${m.reason}` : 'no recent thought recorded'}${draft}`;
      });
      if (thoughts.length) out.push('DIRECTOR-ONLY PRIVATE INTENT SNAPSHOTS (not public knowledge):\n' + thoughts.join('\n'));
    }

    const rel = S.npcRel.filter((r) => S.npcs[r.a] && S.npcs[r.b]);
    const relLines = rel
      .filter((r) => ownerView || focus.includes(r.a) || focus.includes(r.b))
      .slice(-24)
      .map((r) => `${r.a}~${r.b}:${r.type}${r.note ? ' (' + clip(r.note, 50) + ')' : ''}`);
    if (ownerView && relLines.length) out.push('CAST RELATIONS: ' + relLines.join(' ; '));

    const live = S.storylines.filter((s) => s.status !== 'resolved').slice(-6);
    if (ownerView && live.length)
      out.push(
        'STORYLINES:\n' + live.map((s) => `${s.id}|${s.title}|heat ${s.heat}|${clip(s.summary, 120)}|${(s.participants || []).join(',')}`).join('\n')
      );

    let feed;
    if (threadOf && S.posts[threadOf]) {
      feed = [];
      let p = S.posts[threadOf];
      while (p && feed.length < 5) {
        feed.unshift(p);
        p = p.replyTo ? S.posts[p.replyTo] : null;
      }
      const kids = Object.values(S.posts)
        .filter((x) => x.replyTo === threadOf)
        .slice(-6);
      feed = feed.concat(kids);
    } else {
      feed = S.postOrder.slice(-feedN).map((id) => S.posts[id]);
    }
    if (opts.simulation) {
      const exposed = [];
      Object.values(S.npcs).filter((n) => !n.blocked && !n.userAlt).sort((a, b) => (b.touched || 0) - (a.touched || 0)).slice(0, 14).forEach((n) => {
        const ids = (n.awareness || []).filter((x) => x.kind === 'public_post').slice(-3).map((x) => x.ref);
        const seen = [...new Set(ids)].map((id) => S.posts[id]).filter(Boolean);
        if (seen.length) exposed.push(`${n.name} (${n.id}) has actually seen:\n` + seen.map((p) => `- ${p.id}|${AI.authorLabel(p)}|${clip(p.text, 130)}`).join('\n'));
      });
      out.push('RECENT POSTS BY CHARACTER-SPECIFIC EXPOSURE (do not assign one person\'s posts to another):\n' + (exposed.join('\n') || 'No recent posts are recorded as seen by the cast.'));
    } else {
      out.push(
        'RECENT POSTS (id|author|text|likes):\n' +
          feed
            .filter(Boolean)
            .map((p) => `${p.id}|${AI.authorLabel(p)}|${clip(p.text, 150)}|${U.fmt(p.stats.likes)}${p.replyTo ? '|reply to ' + p.replyTo : ''}${p.audience === 'close' ? '|CLOSE FRIENDS ONLY' : ''}`)
            .join('\n')
      );
    }

    const lore = (S.lore || []).filter((l) => !l.disabled && l.content);
    if (lore.length) {
      const lorePosts = opts.simulation ? [] : feed.filter(Boolean);
      const scan = (lorePosts.map((p) => p.text).join(' ') + ' ' + P.name + ' ' + P.handle + ' ' + (opts.scan || '') + (ownerView ? ' ' + S.chronicle.slice(-4).map((c) => c.text).join(' ') : '') + ' ' + focus.map((id) => (S.npcs[id] || {}).name || '').join(' ')).toLowerCase();
      const hit = lore
        .filter((l) => (ownerView && l.constant) || l.keys.some((k) => k && scan.includes(String(k).toLowerCase())))
        .sort((a, b) => (b.constant ? 1 : 0) - (a.constant ? 1 : 0))
        .slice(0, 5);
      if (hit.length) out.push('LORE / WORLD INFO (established facts, keep consistent):\n' + hit.map((l) => '- ' + clip(l.content, 450)).join('\n'));
    }
    if (S.authorNote) out.push("AUTHOR'S NOTE (standing instructions from the story's owner: follow them in everything you write): " + clip(S.authorNote, 1200));

    // what the focused characters actually remember (Generative-Agents style retrieval) and believe
    const memLines = [];
    focus.slice(0, 4).forEach((id) => {
      const n = S.npcs[id];
      if (!n || !G.Mem) return;
      const mm = G.Rag ? G.Rag.recall(n, opts.scan || '', 5) : G.Mem.promptLines(n, { who: ['me'], text: opts.scan || '' }, 3);
      if (mm.length && ownerView) memLines.push(`${n.name} remembers: ${mm.join(' / ')}`); // (the character view gets them once, from the retrieval graph below)
      const b = n.psy && n.psy.beliefs && n.psy.beliefs.me;
      if (b && Math.abs(b.v) > 0.3) memLines.push(`${n.name} has come to see the player as ${b.v > 0 ? 'someone good to them' : 'someone who keeps hurting them'}`);
    });
    // each focused character's dossier: their card (imported or written), the situation they live in, how they talk, what they were told
    focus.slice(0, 4).forEach((id) => {
      const n = S.npcs[id];
      if (!n || n.userAlt) return;
      const bits = [];
      if (n.card) bits.push('CARD: ' + clip(n.card, 700));
      if (n.scenario) bits.push('SCENARIO: ' + clip(n.scenario, 300));
      if (n.speech) bits.push('SPEAKS LIKE (copy this style): ' + clip(n.speech, 400));
      if ((n.facts || []).length) bits.push('KNOWS (established, never contradict): ' + n.facts.join(' / '));
      if (G.Goals) { const gl = G.Goals.line(n); bits.push('RIGHT NOW (changes day to day, unlike the card above): mood ' + (n.mood || 'neutral') + (gl ? ', ' + gl : '')); }
      if (bits.length) memLines.push(`${n.name} (${n.id}) DOSSIER: ${bits.join(' | ')}`);
    });
    if (memLines.length) out.push('MEMORY:\n' + memLines.join('\n'));
    const graph = AI.graphContext({ ...opts, ownerView, feedIds: new Set(feed.filter(Boolean).map((p) => 'post:' + p.id)) });
    if (graph.text) out.push('LIVE RETRIEVAL GRAPH (grounded connections and knowledge):\n' + graph.text);

    const groups = Object.values(S.groups || {});
    if (groups.length)
      out.push(
        'GROUP CHATS:\n' +
          groups
            .filter((g) => ownerView || focus.some((id) => (g.members || []).includes(id)))
            .map((g) => `${g.id}|"${g.name}"|members ${g.members.join(',')}|${g.summary ? 'sum: ' + clip(g.summary, 160) + '|' : ''}recent: ${g.msgs.slice(-3).map((m) => (m.from === 'me' ? 'me' : m.from) + ': ' + clip(m.text, 60)).join(' / ')}`)
            .join('\n')
      );

    if (ownerView && (opts.pool ?? full) && !(G.Engine && G.Engine.mainOnly())) {
      const pool = G.Pop && G.Pop.pool ? G.Pop.pool(8) : [];
      if (pool.length)
        out.push('CROWD POOL (real accounts from the wider town; PREFER these exact handles for crowd replies and ambient posts):\n' + pool.map((p) => `${p.handle}|${p.name}|${p.age}|${p.vibes[0]}, likes ${p.likes[0]}`).join('\n'));
    }

    if (ownerView && S.chronicle.length) out.push('RECENT HISTORY: ' + S.chronicle.slice(-12).map((c) => c.text).join(' | '));
    const take = (re) => { const i = out.findIndex((l) => re.test(l)); return i < 0 ? null : out.splice(i, 1)[0]; };
    const volatile = [take(/^NOW:/), take(/^PLAYER \(id/)].filter(Boolean);
    const feedAt = out.findIndex((l) => /^RECENT POSTS/.test(l));
    out.splice(feedAt < 0 ? out.length : feedAt, 0, ...volatile);
    return out.join('\n');
  };

  AI.authorLabel = (p) => {
    const S = G.S;
    if (p.author === 'me') return `me(${S.player.handle})`;
    if (p.author === 'crowd') return `crowd(${p.crowd ? p.crowd.handle : '?'})`;
    const n = S.npcs[p.author];
    return n ? `${n.id}(${n.handle})` : p.author;
  };

  AI.counts = () => {
    const r = G.settings.richness;
    return { named: [2, 4, 6][r - 1] || 4, crowd: [4, 8, 14][r - 1] || 8 };
  };
})(window.G);
