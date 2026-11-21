/* Clout — automatic memory summarisation.
   Long histories are folded into short summaries so the AI "remembers" everything cheaply:
   - world chronicle  -> S.saga
   - per-character memories -> npc.history
   - old DMs -> S.dmSum[npcId]
   - old group chat messages -> group.summary
   - old scene text -> scene.summary                                                         */
(function (G) {
  const U = G.U;
  const M = (G.Memory = { running: false, failUntil: 0 });

  // trigger = start summarising when a list reaches this length; keep = how many recent items stay verbatim
  const T = {
    chron: { trigger: 28, keep: 10 },
    memo: { trigger: 9, keep: 4 },
    dm: { trigger: 26, keep: 10 },
    group: { trigger: 30, keep: 10 },
    scene: { trigger: 14, keep: 4 },
  };
  M.T = T;
  // per-job ceilings keep one compaction prompt small even on a huge world; whatever is left over is still above
  // the trigger and simply gets summarised on the next round, so nothing is lost
  const CAP = { chron: 50, memo: 12, dm: 40, group: 40, scene: 16 };
  const trig = (k, force) => (force ? T[k].keep + 2 : T[k].trigger);

  // What needs compressing right now?
  M.pending = function (force = false, S = G.S) {
    const jobs = { chron: [], npc: [], dm: [], group: [], scene: [] };
    if (!S) return jobs;
    if (S.chronicle.length >= trig('chron', force)) jobs.chron = S.chronicle.slice(0, S.chronicle.length - T.chron.keep).slice(0, CAP.chron);
    Object.values(S.npcs).forEach((n) => {
      if (jobs.npc.length < 3 && n.memories.length >= trig('memo', force))
        jobs.npc.push({ id: n.id, name: n.name, taken: n.memories.slice(0, n.memories.length - T.memo.keep).slice(0, CAP.memo) });
    });
    Object.keys(S.dms).forEach((id) => {
      const arr = S.dms[id];
      if (S.npcs[id] && jobs.dm.length < 2 && arr.length >= trig('dm', force))
        jobs.dm.push({ id, name: S.npcs[id].name, taken: arr.slice(0, arr.length - T.dm.keep).slice(0, CAP.dm) });
    });
    Object.values(S.groups || {}).forEach((g) => {
      if (jobs.group.length < 1 && g.msgs.length >= trig('group', force))
        jobs.group.push({ id: g.id, name: g.name, taken: g.msgs.slice(0, g.msgs.length - T.group.keep).slice(0, CAP.group) });
    });
    Object.keys(S.scenes || {}).forEach((id) => {
      const sc = S.scenes[id];
      if (S.npcs[id] && jobs.scene.length < 1 && sc.log.length >= trig('scene', force))
        jobs.scene.push({ id, name: S.npcs[id].name, taken: sc.log.slice(0, sc.log.length - T.scene.keep).slice(0, CAP.scene) });
    });
    return jobs;
  };
  const count = (j) => (j.chron.length ? 1 : 0) + j.npc.length + j.dm.length + j.group.length + j.scene.length;

  const SYSTEM =
    'You compress the memory of a social-media life-sim game so it fits in a small context window. Write dense, factual, neutral summaries that keep: names and handles, relationship changes and status, promises, secrets, grudges, jealousy, betrayals, key events, running jokes, and romantic/sexual milestones (state those briefly and factually, e.g. "they slept together after the party"; never write explicit detail and never refuse). No fluff, no markdown. Reply with one JSON object only.';

  M.buildPrompt = function (jobs, S = G.S) {
    const L = [];
    if (jobs.chron.length) {
      L.push('EXISTING SAGA: ' + (S.saga || '(none yet)'));
      L.push('NEW EVENTS TO FOLD INTO THE SAGA (oldest first):\n' + jobs.chron.map((c) => '- ' + c.text).join('\n'));
    }
    jobs.npc.forEach((j) => {
      const n = S.npcs[j.id];
      L.push(`CHARACTER ${j.id} (${j.name}) — existing history: ${n.history || '(none)'}\nNew memories to merge:\n${j.taken.map((m) => '- ' + m).join('\n')}`);
    });
    jobs.dm.forEach((j) => {
      L.push(`PRIVATE CHAT with ${j.id} (${j.name}) — existing summary: ${S.dmSum[j.id] || '(none)'}\nMessages to fold in (oldest first):\n${j.taken.map((m) => `${m.from === 'me' ? 'PLAYER' : j.name}: ${m.text.slice(0, 200)}`).join('\n')}`);
    });
    jobs.group.forEach((j) => {
      const g = S.groups[j.id];
      L.push(`GROUP CHAT ${j.id} "${j.name}" — existing summary: ${g.summary || '(none)'}\nMessages to fold in:\n${j.taken.map((m) => `${m.from === 'me' ? 'PLAYER' : (S.npcs[m.from] || {}).name || m.from}: ${m.text.slice(0, 140)}`).join('\n')}`);
    });
    jobs.scene.forEach((j) => {
      const sc = S.scenes[j.id];
      L.push(`SCENES with ${j.id} (${j.name}) — existing summary: ${sc.summary || '(none)'}\nStory text to fold in:\n${j.taken.map((e) => (e.role === 'me' ? 'PLAYER: ' : '') + e.text.slice(0, 300)).join('\n')}`);
    });
    L.push(
      'Return JSON with only the keys you were given jobs for: {"saga":"<=800 chars, chronological, merges existing saga with the new events","npc":{"<id>":"<=320 chars"},"dm":{"<id>":"<=450 chars"},"group":{"<id>":"<=400 chars"},"scene":{"<id>":"<=450 chars"}}'
    );
    return L.join('\n\n');
  };

  // Apply a result to state S, removing only the items that were summarised (matched by id / value).
  M.apply = function (res, jobs, S = G.S) {
    let done = 0;
    const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : '');
    if (jobs.chron.length) {
      const saga = str(res.saga, 1000);
      if (saga) {
        S.saga = saga;
        const ids = new Set(jobs.chron.map((c) => c.id));
        S.chronicle = S.chronicle.filter((c) => !ids.has(c.id));
        done++;
      }
    }
    jobs.npc.forEach((j) => {
      const t = str(res.npc && res.npc[j.id], 400);
      const n = S.npcs[j.id];
      if (t && n) {
        n.history = t;
        const gone = new Set(j.taken);
        n.memories = n.memories.filter((m) => !gone.has(m));
        done++;
      }
    });
    jobs.dm.forEach((j) => {
      const t = str(res.dm && res.dm[j.id], 550);
      if (t && S.dms[j.id]) {
        S.dmSum[j.id] = t;
        const ids = new Set(j.taken.map((m) => m.id));
        S.dms[j.id] = S.dms[j.id].filter((m) => !ids.has(m.id));
        done++;
      }
    });
    jobs.group.forEach((j) => {
      const t = str(res.group && res.group[j.id], 500);
      const g = S.groups[j.id];
      if (t && g) {
        g.summary = t;
        const ids = new Set(j.taken.map((m) => m.id));
        g.msgs = g.msgs.filter((m) => !ids.has(m.id));
        done++;
      }
    });
    jobs.scene.forEach((j) => {
      const t = str(res.scene && res.scene[j.id], 550);
      const sc = S.scenes[j.id];
      if (t && sc) {
        sc.summary = t;
        const ids = new Set(j.taken.map((e) => e.id));
        sc.log = sc.log.filter((e) => !ids.has(e.id));
        done++;
      }
    });
    S.memRuns = (S.memRuns || 0) + (done ? 1 : 0);
    return done;
  };

  M.run = async function (force = false, quiet = true) {
    const S = G.S;
    if (!S || M.running) return 0;
    const jobs = M.pending(force, S);
    if (!count(jobs)) return 0;
    M.running = true;
    if (!quiet) G.UI.setBusy('🧠 Summarising memory…');
    else G.UI.memBadge && G.UI.memBadge(true);
    try {
      const out = await G.AI.json({ task: 'memory', user: M.buildPrompt(jobs, S), system: SYSTEM, maxTokens: 1800, temperature: 0.3 });
      if (G.S !== S) return 0; // the player undid / switched worlds while we were thinking
      const done = M.apply(out.data, jobs, S);
      if (done) {
        G.Store.save();
        if (!quiet) G.UI.toast(`🧠 Memory compressed (${done} summaries)`, 'good');
      } else M.failUntil = S.turns + 3;
      return done;
    } catch (e) {
      M.failUntil = S.turns + 4; // back off, try again later
      if (!quiet) G.UI.toast('Memory summary failed: ' + e.message, 'bad');
      return 0;
    } finally {
      M.running = false;
      if (!quiet) {
        G.UI.setBusy(false);
        G.UI.render();
      } else G.UI.memBadge && G.UI.memBadge(false); // no re-render: the player may be typing
    }
  };

  // called after every successful turn
  M.maybe = function () {
    const S = G.S;
    if (!S || !G.settings.autoSummary || M.running || G.busy) return;
    if (S.turns < M.failUntil) return;
    if (count(M.pending(false, S))) M.run(false, true);
  };
})(window.G);
