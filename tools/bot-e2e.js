// Real-model player bot + long free-world soak. Reads OPENROUTER_API_KEY from the process
// environment (for example: node --env-file=.env tools/bot-e2e.js). Never logs prompts or keys.
const fs = require('fs');
const path = require('path');
const { boot, invariants } = require('../tests/harness');

const ROOT = path.resolve(__dirname, '..');
const DAYS = Math.max(1, Math.floor(Number(process.env.DAYS || 2000)));
const CAST_LIMIT = Math.max(3, Math.floor(Number(process.env.CAST_LIMIT || 18)));
const LIVE_TURNS = Math.max(1, Math.min(12, Math.floor(Number(process.env.LIVE_TURNS || 4))));
const REQUEST_LIMIT = Math.max(1, Math.min(12, Math.floor(Number(process.env.REQUEST_LIMIT || 12))));
// Keep a $0.10 buffer below the user's absolute $0.50 ceiling. Each request is
// reserved using a conservative input-token bound and the provider max prices.
const MODEL_BUDGET = Math.max(0.01, Math.min(0.40, Number(process.env.MODEL_BUDGET || 0.40)));
const MAX_OUTPUT_TOKENS = 4500;
const MAX_INPUT_PRICE = 0.075; // USD / 1M tokens (provider.max_price)
const MAX_OUTPUT_PRICE = 0.25; // USD / 1M tokens (provider.max_price)
const API_KEY = String(process.env.OPENROUTER_API_KEY || '').trim();
const MODEL_ID = String(process.env.BOT_MODEL || 'z-ai/glm-5.3-flash').trim();

if (!API_KEY) {
  console.error('Missing OPENROUTER_API_KEY. Set it in .env and run: node --env-file=.env tools/bot-e2e.js');
  process.exit(2);
}

const nativeFetch = globalThis.fetch.bind(globalThis);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safeError = (e) => String((e && e.message) || e || 'unknown error').replaceAll(API_KEY, '[redacted]').slice(0, 200);

async function discoverModel() {
  const res = await nativeFetch('https://openrouter.ai/api/v1/models');
  if (!res.ok) throw new Error(`OpenRouter model catalogue HTTP ${res.status}`);
  const data = await res.json();
  const model = (data.data || []).find((m) => m.id === MODEL_ID);
  if (!model) throw new Error(`Requested OpenRouter model is not listed: ${MODEL_ID}`);
  if (!(model.supported_parameters || []).includes('response_format')) throw new Error(`${MODEL_ID} does not list JSON response mode support.`);
  return model;
}

async function main() {
  const model = await discoverModel();
  const H = boot(ROOT);
  const { w, G, E, errors } = H;
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await H.wait(100);
  H.freshWorld();
  w.document.body.classList.add('ingame');

  const state = G.S;
  const originalFetch = w.fetch.bind(w);
  let generationRequests = 0;
  let lastHttpStatus = 0;
  let reservedWorstCase = 0;
  let reportedSpend = 0;
  let budgetBlocked = false;
  const modelOutputSamples = [];
  const clip = (value, n = 300) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const compactOutput = (payload) => {
    const clean = (rows, keys) => (Array.isArray(rows) ? rows : []).slice(0, 5).map((row) => Object.fromEntries(keys.filter((key) => row && row[key] != null).map((key) => [key, typeof row[key] === 'string' ? clip(row[key]) : row[key]])));
    return {
      judge: payload && payload.judge ? { quality: payload.judge.quality, virality: payload.judge.virality, sentiment: payload.judge.sentiment, controversy: payload.judge.controversy, summary: clip(payload.judge.summary, 100) } : null,
      posts: clean(payload && payload.posts, ['author', 'text', 'replyTo', 'quote', 'buzz']),
      crowd: clean(payload && payload.crowd, ['name', 'text', 'stance', 'replyTo']),
      dms: clean(payload && payload.dms, ['from', 'text', 'post']),
      rel: clean(payload && payload.rel, ['id', 'aff', 'rom', 'riv', 'trust', 'status', 'mood', 'memory']),
      npc_rel: clean(payload && payload.npc_rel, ['a', 'b', 'type', 'note']),
      event: payload && payload.event ? { title: clip(payload.event.title, 120), text: clip(payload.event.text, 280), options: (payload.event.options || []).slice(0, 3).map((v) => clip(v, 100)) } : null,
      storylines: clean(payload && payload.storylines, ['title', 'summary', 'heat', 'status']),
      trending: clean(payload && payload.trending, ['tag', 'heat']),
      group_msgs: clean(payload && payload.group_msgs, ['group', 'from', 'text']),
      chronicle: clip(payload && payload.chronicle, 180),
    };
  };
  w.fetch = (url, init = {}) => {
    if (!String(url).includes('openrouter.ai/api/v1/chat/completions')) return originalFetch(url, init);
    if (remoteDisabled) throw new Error('OpenRouter calls disabled after the first rate-limit response.');
    if (generationRequests >= REQUEST_LIMIT) throw new Error(`Local OpenRouter request ceiling reached (${REQUEST_LIMIT}).`);
    let body;
    try { body = JSON.parse(String(init.body || '{}')); }
    catch { throw new Error('Blocked OpenRouter request with an unreadable body.'); }
    // Price ceiling stops routing to expensive providers. Clamp output and use
    // twice the UTF-8 request size as the input-token reservation for safety.
    body.provider = { ...(body.provider || {}), max_price: { prompt: MAX_INPUT_PRICE, completion: MAX_OUTPUT_PRICE } };
    body.max_tokens = Math.max(1, Math.min(MAX_OUTPUT_TOKENS, Number(body.max_tokens) || MAX_OUTPUT_TOKENS));
    const inputTokenBound = Buffer.byteLength(JSON.stringify(body), 'utf8') * 2;
    const requestReserve = (inputTokenBound * MAX_INPUT_PRICE + body.max_tokens * MAX_OUTPUT_PRICE) / 1_000_000;
    if (reservedWorstCase + requestReserve > MODEL_BUDGET) {
      budgetBlocked = true;
      remoteDisabled = true;
      throw new Error(`OpenRouter budget guard blocked request; $${MODEL_BUDGET.toFixed(2)} worst-case reservation limit reached.`);
    }
    reservedWorstCase += requestReserve;
    generationRequests++;
    const request = { ...init, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) };
    return nativeFetch(url, request).then(async (response) => {
      lastHttpStatus = response.status;
      if (response.status === 429) remoteDisabled = true;
      try {
        const payload = await response.clone().json();
        const cost = Number(payload && payload.usage && payload.usage.cost);
        if (Number.isFinite(cost) && cost >= 0) {
          reportedSpend += cost;
          if (reportedSpend >= MODEL_BUDGET) remoteDisabled = true;
        }
        const content = payload && payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;
        if (typeof content === 'string') {
          let parsed = null;
          try { parsed = JSON.parse(content); } catch {}
          modelOutputSamples.push({ request: generationRequests, httpStatus: response.status, cost: Number.isFinite(cost) ? cost : null, output: parsed ? compactOutput(parsed) : { unparsedExcerpt: clip(content, 500) } });
        }
      } catch {}
      return response;
    });
  };

  G.settings.provider = 'openrouter';
  G.settings.baseUrl = '';
  G.settings.apiKey = API_KEY;
  G.settings.model = model.id;
  G.settings.cheapModel = '';
  G.settings.fallbackModel = '';
  G.settings.helperOn = false;
  G.settings.liveBank = false;
  G.settings.route = { bg: 'cloud', world: 'cloud', story: 'cloud', scene: 'cloud' };
  G.settings.drama = 1;
  G.settings.romance = 1;
  G.settings.noThink = true;
  G.settings.spendCap = MODEL_BUDGET;
  G.settings.spendBase = 0;
  G.settings.totalSpend = 0;
  G.settings.totalTokens = 0;
  G.settings.autoEvents = 0;
  G.settings.approveActions = false;
  G.World.postDial = G.__realPostDial; // keep the production rule: no autonomous NPC top-level posts
  G.Live.stop();

  const seenNpcTopPostIds = new Set(Object.values(G.S.posts).filter((p) => G.S.npcs[p.author] && !p.replyTo && !G.S.npcs[p.author].userAlt).map((p) => p.id));
  const newNpcTopPostIds = new Set();
  const initialClock = state.clock;
  const failures = [];
  const snapshots = [];
  const liveObservations = [];
  const recordIssue = (issue) => { if (!failures.includes(issue) && failures.length < 80) failures.push(issue); };
  const originalReady = G.AI.ready;
  const player = () => G.S.player;
  const cast = () => Object.values(G.S.npcs).filter((n) => !n.userAlt);
  const mia = () => G.S.npcs.n1 || Object.values(G.S.npcs)[0];
  let liveIndex = 0;
  const liveDay = (i) => Math.max(1, Math.min(DAYS, i + 1));
  const liveDays = new Map(Array.from({ length: LIVE_TURNS }, (_, i) => [liveDay(i), i]));
  let localActions = 0;
  let liveSuccess = 0;
  let liveFailure = 0;
  let liveAttempted = 0;
  let remoteDisabled = false;
  let maxStateBytes = 0;
  let maxMemories = 0;
  let maxCast = cast().length;
  let maxPosts = Object.keys(G.S.posts).length;
  const startMs = Date.now();
  const actionSpecs = (i, day) => {
    const kind = ['post', 'dm', 'time', 'reply'][i % 4];
    if (kind === 'dm') return { mode: 'dm', npcId: mia().id, text: `I wanted to check in after the week. I made progress on my demo and thought of you.`, label: 'Bot DM' };
    if (kind === 'time') return null;
    if (kind === 'reply') {
      const target = G.S.postOrder.map((id) => G.S.posts[id]).find((p) => p && G.S.npcs[p.author] && !G.S.npcs[p.author].userAlt && !p.replyTo);
      if (target) return { mode: 'reply', replyTo: target.id, text: `Day ${day}: that take makes me think about what I want to do next.`, label: 'Bot reply' };
    }
    return { mode: 'post', text: `Day ${day}: I spent the evening working on a song demo. Still deciding what the chorus needs.`, label: 'Bot post' };
  };
  const doPlayerAction = async (spec, useModel) => {
    G.AI.ready = useModel ? originalReady : () => false;
    const before = useModel ? {
      posts: Object.keys(G.S.posts).length,
      dms: Object.values(G.S.dms).reduce((n, rows) => n + rows.length, 0),
      memories: cast().reduce((n, npc) => n + (npc.mem || []).length, 0),
      relations: cast().reduce((n, npc) => n + (Number(npc.aff || 0) !== 0 || Number(npc.rom || 0) !== 0 || Number(npc.riv || 0) !== 0 ? 1 : 0), 0),
      events: (G.S.events || []).length,
    } : null;
    try {
      const result = await E.speak(spec);
      if (useModel) {
        if (result) liveSuccess++;
        else {
          liveFailure++;
          recordIssue(`OpenRouter action failed (HTTP ${lastHttpStatus || 'no response'}; ${generationRequests} generation requests used).`);
        }
        const after = {
          posts: Object.keys(G.S.posts).length,
          dms: Object.values(G.S.dms).reduce((n, rows) => n + rows.length, 0),
          memories: cast().reduce((n, npc) => n + (npc.mem || []).length, 0),
          relations: cast().reduce((n, npc) => n + (Number(npc.aff || 0) !== 0 || Number(npc.rom || 0) !== 0 || Number(npc.riv || 0) !== 0 ? 1 : 0), 0),
          events: (G.S.events || []).length,
        };
        liveObservations.push({ mode: spec.mode, succeeded: !!result, httpStatus: lastHttpStatus || null, calls: generationRequests, delta: Object.fromEntries(Object.keys(after).map((k) => [k, after[k] - before[k]])) });
      } else localActions++;
      return result;
    } catch (e) {
      if (useModel) liveFailure++;
      recordIssue(`${useModel ? 'OpenRouter turn' : 'local turn'} failed: ${safeError(e)}`);
      return null;
    } finally {
      G.AI.ready = originalReady;
    }
  };

  for (let day = 1; day <= DAYS; day++) {
    const liveSlot = liveDays.get(day);
    if (liveSlot != null) {
      const spec = actionSpecs(liveSlot, day);
      if (remoteDisabled || generationRequests >= REQUEST_LIMIT) {
        remoteDisabled = true;
        if (spec) await doPlayerAction(spec, false);
        else {
          const prevReady = G.AI.ready;
          G.AI.ready = () => false;
          try { await E.advance('day'); localActions++; }
          catch (e) { recordIssue(`local time advance failed: ${safeError(e)}`); }
          finally { G.AI.ready = prevReady; }
        }
      } else if (spec) {
        liveAttempted++;
        await doPlayerAction(spec, true);
      } else {
        liveAttempted++;
        try {
          const advanceResult = await E.advance('day');
          if (advanceResult) liveSuccess++;
          else liveFailure++;
        } catch (e) {
          liveFailure++;
          recordIssue(`OpenRouter time advance failed: ${safeError(e)}`);
        }
      }
      if (liveSlot !== LIVE_TURNS - 1) await sleep(3200); // stay below the free endpoint burst limit
    } else if (day % 2 === 0) {
      await doPlayerAction({ mode: 'post', text: `Day ${day}: checking in after rehearsal. A small step forward is still a step.`, label: 'Local bot post' }, false);
    } else if (day % 7 === 0) {
      await doPlayerAction({ mode: 'dm', npcId: mia().id, text: `How have you been? I finally found time to rest after a long week.`, label: 'Local bot DM' }, false);
    }

    if (day % 7 === 0) {
      const prevReady = G.AI.ready;
      G.AI.ready = () => false;
      try { await G.Channels.send('town-talk', day % 21 === 0 ? `Anyone want to talk about what is happening this week?` : `Hope everyone is finding a little time to breathe.`); }
      catch (e) { recordIssue(`channel action: ${safeError(e)}`); }
      finally { G.AI.ready = prevReady; }
    }
    if (day % 14 === 0) {
      const lead = G.Leads.list('new')[0];
      if (lead) {
        try {
          if (cast().length < CAST_LIMIT) G.Leads.join(lead.id, 'Thanks for reaching out. What happened?');
          else G.Leads.ignore(lead.id);
        } catch (e) { recordIssue(`Lead action: ${safeError(e)}`); }
      }
    }

    for (let h = 0; h < 24; h++) {
      E.tick(60);
      if (h % 6 === 0) G.Live.beat();
    }

    const S = G.S;
    Object.values(S.posts).forEach((p) => {
      if (S.npcs[p.author] && !S.npcs[p.author].userAlt && !p.replyTo && !seenNpcTopPostIds.has(p.id)) newNpcTopPostIds.add(p.id);
    });
    const bad = invariants(G);
    bad.filter((issue) => !/age/i.test(issue)).forEach((issue) => recordIssue(`invariant: ${issue}`));
    if (!Number.isFinite(S.player.cash) || S.player.cash < 0) recordIssue(`invalid cash: ${S.player.cash}`);
    if (cast().length > CAST_LIMIT) recordIssue(`cast exceeded bot limit: ${cast().length}`);
    if (Object.values(S.posts).some((p) => !p || typeof p.text !== 'string')) recordIssue('post without text');
    if (Object.values(S.dms).some((thread) => thread.some((m) => !m || typeof m.text !== 'string'))) recordIssue('DM without text');
    maxStateBytes = Math.max(maxStateBytes, Buffer.byteLength(JSON.stringify(S)));
    maxMemories = Math.max(maxMemories, ...cast().map((n) => (n.mem || []).length));
    maxCast = Math.max(maxCast, cast().length);
    maxPosts = Math.max(maxPosts, Object.keys(S.posts).length);
    if (day % 100 === 0 || day === DAYS) {
      snapshots.push({
        day,
        cast: cast().length,
        posts: Object.keys(S.posts).length,
        dms: Object.values(S.dms).reduce((n, rows) => n + rows.length, 0),
        followers: S.player.followers,
        cash: Math.round(S.player.cash),
        stateMb: +(Buffer.byteLength(JSON.stringify(S)) / 1e6).toFixed(2),
        httpRequests: generationRequests,
      });
      console.log(`day ${day}/${DAYS} | ${((Date.now() - startMs) / 1000).toFixed(0)}s | calls ${generationRequests}/${REQUEST_LIMIT} | cast ${cast().length} | posts ${Object.keys(S.posts).length} | followers ${S.player.followers}`);
    }
    if (generationRequests >= REQUEST_LIMIT && day < DAYS) {
      // Continue the long-run world without more network access. Hitting the
      // local guard is expected safety behavior, not a game defect.
      remoteDisabled = true;
    }
  }

  G.AI.ready = originalReady;
  G.UI.go('home'); G.UI.render();
  G.UI.go('messages'); G.UI.render();
  G.UI.go('channels'); G.UI.render();
  G.UI.go('people'); G.UI.render();
  await H.wait(100); // let test DOM mutation observers finish before closing jsdom

  const S = G.S;
  const postRows = Object.values(S.posts);
  const dmRows = Object.values(S.dms).flat();
  const npcTopPosts = newNpcTopPostIds.size;
  const socialStats = {
    playerPosts: postRows.filter((p) => p.author === 'me' && !p.replyTo).length,
    playerReplies: postRows.filter((p) => p.author === 'me' && p.replyTo).length,
    npcStandalonePosts: postRows.filter((p) => G.S.npcs[p.author] && !p.replyTo).length,
    npcComments: postRows.filter((p) => G.S.npcs[p.author] && p.replyTo).length,
    validReplyTargets: postRows.filter((p) => p.replyTo).filter((p) => !!S.posts[p.replyTo]).length,
    invalidReplyTargets: postRows.filter((p) => p.replyTo).filter((p) => !S.posts[p.replyTo]).length,
    inboundDms: dmRows.filter((m) => m.from !== 'me').length,
    outboundDms: dmRows.filter((m) => m.from === 'me').length,
    relationshipEdges: (S.npcRel || []).length,
    npcsWithRelationships: cast().filter((n) => Number(n.aff || 0) || Number(n.rom || 0) || Number(n.riv || 0) || Number(n.trust || 0)).length,
    memories: cast().reduce((n, npc) => n + (npc.mem || []).length, 0),
    groups: Object.keys(S.groups || {}).length,
    groupMessages: Object.values(S.groups || {}).reduce((n, group) => n + (group.msgs || []).length, 0),
    channelMessages: (S.channels || []).reduce((n, channel) => n + (channel.msgs || []).length, 0),
    stories: (S.stories || []).length,
    events: (S.events || []).length,
    appointments: (S.appts || []).length,
    followersCeiling: E.followerCap(S),
  };
  const passedDays = Math.floor((S.clock - initialClock) / 1440);
  const result = {
    daysRequested: DAYS,
    simulatedDays: passedDays,
    model: model.id,
    modelPriceCeilingPerMillion: { prompt: MAX_INPUT_PRICE, completion: MAX_OUTPUT_PRICE },
    modelCataloguePricePerMillion: { prompt: Number(model.pricing.prompt), completion: Number(model.pricing.completion) },
    modelBudget: MODEL_BUDGET,
    reportedModelSpend: Number(reportedSpend.toFixed(8)),
    reservedWorstCaseSpend: Number(reservedWorstCase.toFixed(8)),
    budgetBlocked,
    liveTurnsPlanned: LIVE_TURNS,
    liveTurnsAttempted: liveAttempted,
    liveTurnsNotAttempted: Math.max(0, LIVE_TURNS - liveAttempted),
    liveTurnsSucceeded: liveSuccess,
    liveTurnsFailed: liveFailure,
    liveObservations,
    modelOutputSamples,
    generationRequests,
    lastHttpStatus,
    localActions,
    maxCast,
    finalCast: cast().length,
    maxPosts,
    finalPosts: Object.keys(S.posts).length,
    finalDms: Object.values(S.dms).reduce((n, rows) => n + rows.length, 0),
    finalFollowers: S.player.followers,
    finalCash: Math.round(S.player.cash),
    earned: Math.round((S.fame && S.fame.earned) || 0),
    totalSpend: Number(G.settings.totalSpend || 0),
    totalTokens: Number(G.settings.totalTokens || 0),
    maxStateMb: +(maxStateBytes / 1e6).toFixed(2),
    maxMemoriesPerNpc: maxMemories,
    npcTopPosts,
    socialStats,
    windowErrors: errors.length,
    issues: failures,
    checkpoints: snapshots,
    seconds: +((Date.now() - startMs) / 1000).toFixed(1),
  };
  const reports = path.join(ROOT, 'reports');
  fs.mkdirSync(reports, { recursive: true });
  const reportStem = `bot-e2e-${model.id.replace(/[^a-z0-9]+/gi, '-')}-${DAYS}d`;
  const jsonPath = path.join(reports, `${reportStem}.json`);
  const mdPath = path.join(reports, `${reportStem}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  fs.writeFileSync(mdPath, [
    `# OpenRouter bot play report: ${DAYS} game days`,
    '',
    `- Model: \`${model.id}\` (paid; JSON response supported; provider price ceiling $${MAX_INPUT_PRICE}/M input and $${MAX_OUTPUT_PRICE}/M output)`,
    `- Local cost controls: $${MODEL_BUDGET.toFixed(2)} conservative worst-case reservation, $0.50 absolute user limit; output capped at ${MAX_OUTPUT_TOKENS} tokens per request; ${budgetBlocked ? 'budget guard blocked further calls' : 'no budget block'}`,
    `- Simulated: ${passedDays}/${DAYS} days in ${result.seconds}s`,
    `- Real model turns: ${liveAttempted}/${LIVE_TURNS} attempted, ${liveSuccess} succeeded, ${liveFailure} failed, ${result.liveTurnsNotAttempted} not attempted; ${generationRequests} HTTP generation requests (local ceiling ${REQUEST_LIMIT})`,
    `- Local bot turns: ${localActions}; active cast cap: ${CAST_LIMIT}`, 
    `- Final cast/posts/DMs: ${result.finalCast}/${result.finalPosts}/${result.finalDms}`,
    `- Followers/cash/earned: ${result.finalFollowers}/$${result.finalCash}/$${result.earned}; model-reported spend $${result.reportedModelSpend.toFixed(6)}, worst-case reserved $${result.reservedWorstCaseSpend.toFixed(6)}`,
    `- Peak save size: ${result.maxStateMb} MB; peak memories per character: ${maxMemories}`,
    `- Autonomous NPC top-level posts: ${npcTopPosts}; browser/runtime errors: ${errors.length}`,
    `- Interactions: ${socialStats.playerPosts} player posts, ${socialStats.playerReplies} player replies, ${socialStats.npcComments} NPC comments; ${socialStats.inboundDms} inbound and ${socialStats.outboundDms} outbound DMs; ${socialStats.relationshipEdges} relationship edges; ${socialStats.memories} memories; ${socialStats.channelMessages} channel messages; ${socialStats.groupMessages} group messages; ${socialStats.stories} stories; ${socialStats.events} events`,
    '',
    '## Actual model output samples',
    '',
    ...(modelOutputSamples.length ? modelOutputSamples.map((sample) => {
      const o = sample.output;
      const lines = [`- Request ${sample.request} (HTTP ${sample.httpStatus}; ${sample.cost == null ? 'provider omitted per-call cost' : `$${sample.cost.toFixed(6)}`}):`];
      for (const key of ['posts', 'crowd', 'dms', 'rel', 'npc_rel', 'storylines', 'trending', 'group_msgs']) {
        for (const row of o[key] || []) lines.push(`  - ${key}: ${JSON.stringify(row)}`);
      }
      if (o.event) lines.push(`  - event: ${JSON.stringify(o.event)}`);
      if (o.judge) lines.push(`  - post assessment: ${JSON.stringify(o.judge)}`);
      if (o.chronicle) lines.push(`  - chronicle: ${o.chronicle}`);
      if (o.unparsedExcerpt) lines.push(`  - response excerpt: ${o.unparsedExcerpt}`);
      if (lines.length === 1) lines.push('  - valid response contained no captured NPC posts, reactions, DMs, relationships, events, or story updates.');
      return lines.join('\n');
    }) : ['- No model response content was received.']),
    '',
    '## Findings',
    '',
    ...(failures.length ? failures.map((x) => `- ${x}`) : ['- No checked invariant, collection, cash, post, DM, or UI-render issues were recorded.']),
    '',
    'Checkpoint data is in the companion JSON file. Prompts, generated dialogue, and API credentials are intentionally excluded.',
  ].join('\n') + '\n', 'utf8');

  console.log(`\nBOT REPORT: ${mdPath}`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`Result: ${passedDays}/${DAYS} days; ${liveSuccess}/${LIVE_TURNS} model turns succeeded; ${failures.length} issue(s); $${result.reportedModelSpend.toFixed(6)} reported / $${result.reservedWorstCaseSpend.toFixed(6)} reserved.`);
  process.exitCode = failures.length || liveFailure || errors.length || passedDays < DAYS ? 1 : 0;
  w.close();
}

main().catch((e) => {
  console.error('BOT RUN FAILED:', safeError(e));
  process.exitCode = 1;
});
