/* Clout — live self-test: runs every AI-backed feature once against a throw-away world
   and checks the model's replies really have the shape the game needs. Costs ~US$0.003. */
(function (G) {
  const U = G.U;
  const E = G.Engine;
  const ST = (G.SelfTest = { running: false });

  function fixture() {
    const S = {
      v: 1, id: 'selftest', createdAt: Date.now(), savedAt: 0,
      world: { name: 'Test Town', setting: 'A small city where influencers, rivals and exes all follow each other.', tone: 'dramatic and funny', premise: 'test' },
      clock: 660,
      player: { name: 'Tester', handle: '@tester', bio: 'just here to test', emoji: '😎', traits: ['Funny', 'Flirty'], followers: 5000, cash: 5000, following: [], level: 1, xp: 0, stats: { charisma: 10, wit: 10, empathy: 10, edge: 10, style: 10 }, verified: false, audience: { love: 40, hate: 8 }, heat: 0, posts: 0 },
      npcs: {}, posts: {}, postOrder: [], dms: {}, notifs: [], npcRel: [], storylines: [], trending: [], chronicle: [], events: [],
      counters: { npc: 1, post: 1, story: 1, chron: 1, group: 1, msg: 1 }, spend: 0, turns: 0,
      groups: {}, scenes: {}, dmSum: {}, saga: '', ach: {}, lore: [], popSize: 50000, popSeed: 5, popMet: {},
    };
    G.S = S;
    E.makeNpc({ name: 'Mia Vale', handle: '@miav', role: 'love_interest', age: 24, bio: 'sunshine with a sharp tongue', personality: 'bubbly, flirty, lots of emoji, secretly jealous', emoji: '🌸', followers: 12000, secret: 'cheated on an exam', aff: 20, rom: 30, trust: 25, status: 'friend' }, S);
    E.makeNpc({ name: 'Kai Storm', handle: '@kaistorm', role: 'rival', age: 27, bio: 'prince of the timeline', personality: 'arrogant, all lowercase, dry sarcasm', emoji: '😈', followers: 90000, secret: 'is broke', aff: -5, riv: 25, status: 'rival' }, S);
    E.makeNpc({ name: 'Dex Rowan', handle: '@dexrowan', role: 'troll', age: 29, bio: 'here for chaos', personality: 'ALL CAPS, memes, instigates fights', emoji: '🧌', followers: 3000 }, S);
    E.addPost({ author: 'n1', text: 'good morning test town!! ☀️ #testtown', buzz: 3, stats: { likes: 120, reposts: 8, replies: 5, views: 2000 } }, S);
    E.addPost({ author: 'n2', text: 'imagine thinking @dexrowan is funny lol', buzz: 8, stats: { likes: 900, reposts: 40, replies: 30, views: 12000 } }, S);
    S.npcRel.push({ a: 'n1', b: 'n2', type: 'ex', note: 'messy breakup' });
    return S;
  }

  ST.run = async function (onRow) {
    if (ST.running) return [];
    if (!G.AI.ready()) throw new Error(G.AI.notReadyMsg());
    ST.running = true;
    const keep = {
      S: G.S, busy: G.busy, stack: E.undoStack.slice(),
      save: G.Store.save, saveSoon: G.Store.saveSoon, render: G.UI.render, toast: G.UI.toast, maybe: G.Memory.maybe,
    };
    G.Store.save = () => {};
    G.Store.saveSoon = () => {};
    G.UI.render = () => {};
    G.UI.toast = (m, k) => {
      if (k === 'bad') ST.lastError = m;
    };
    G.Memory.maybe = () => {};
    const rows = [];
    const t = async (name, fn) => {
      const row = { name, status: 'running', detail: '' };
      rows.push(row);
      onRow && onRow(rows);
      const c0 = G.settings.totalSpend;
      const t0 = Date.now();
      ST.lastError = null;
      try {
        const r = await fn();
        row.status = r && r.warn ? 'warn' : 'pass';
        row.detail = (r && (r.warn || r.ok)) || '';
      } catch (e) {
        row.status = 'fail';
        row.detail = (e.message || String(e)) + (ST.lastError && ST.lastError !== e.message ? ' — ' + ST.lastError : '');
      }
      row.ms = Date.now() - t0;
      row.cost = G.settings.totalSpend - c0;
      onRow && onRow(rows);
    };
    const need = (cond, msg) => {
      if (!cond) throw new Error(msg);
    };

    try {
      const S = fixture();
      E.undoStack.length = 0;

      await t('API key + JSON mode', async () => {
        const r = await G.AI.json({ task: 'selftest', user: 'Reply with exactly this JSON: {"ok":true}', maxTokens: 40, system: 'You output only JSON.', temperature: 0 });
        need(r.data && r.data.ok === true, 'unexpected reply ' + JSON.stringify(r.data));
        return { ok: G.settings.model };
      });

      await t('Post → replies, crowd, relationships', async () => {
        const r = await E.speak({ mode: 'post', text: 'ok but is nobody gonna talk about how @miav carried the whole party last night 😭🔥 #testtown', tone: 'funny' });
        need(r, 'turn did not run');
        const p = r.placed.post;
        need(p && p.judge, 'no "judge" rating came back');
        const kids = Object.values(S.posts).filter((x) => x.replyTo === p.id);
        need(kids.length >= 2, `only ${kids.length} replies attached to the post`);
        const named = kids.filter((k) => k.author !== 'crowd').length;
        need(named >= 1, 'no named character replied');
        need(S.npcs.n1.memories.length || S.npcs.n1.aff !== 20, 'Mia\'s feelings did not change');
        return { ok: `${kids.length} replies (${named} named), likes ${p.stats.likes}, Δfollowers ${r.ctx.followerGain}` };
      });

      await t('Private DM reply', async () => {
        const r = await E.dm('n1', 'hey you. you free later? 😏');
        need(r, 'DM turn did not run');
        const them = (S.dms.n1 || []).filter((m) => m.from === 'n1');
        if (!them.length) return { warn: 'valid JSON but Mia left you on read (allowed)' };
        return { ok: `“${them[0].text.slice(0, 60)}”` };
      });

      await t('Time passes (world simulation)', async () => {
        const before = S.postOrder.length;
        await E.advance('refresh');
        const made = S.postOrder.length - before;
        need(made >= 1, 'no new posts appeared');
        if (made < 3) return { warn: `only ${made} new post(s) — the model is being stingy (try a stronger model or "Busy" replies)` };
        return { ok: `${made} new posts, ${S.trending.length} trending tags` };
      });

      await t('✨ Ideas (suggestions)', async () => {
        const o = await E.suggest({ intent: 'something flirty' });
        need(o.length >= 2, 'fewer than 2 suggestions');
        return { ok: `“${o[0].text.slice(0, 60)}”` };
      });

      await t('Group chat', async () => {
        const g = E.createGroup('Test squad', ['n1', 'n2', 'n3']);
        await E.groupSend(g.id, 'who is up for karaoke tonight');
        const from = new Set(g.msgs.filter((m) => m.from !== 'me').map((m) => m.from));
        need(g.msgs.length >= 3, 'group chat got no replies');
        return { ok: `${g.msgs.length - 1} replies from ${from.size} members` };
      });

      await t('Live stream', async () => {
        await E.goLive('Q&A with chat', 30);
        need(S.lastLive && S.lastLive.chat.length >= 3, 'no live chat came back');
        return { ok: `${S.lastLive.chat.length} chat msgs, ${S.lastLive.donations.length} donations, $${S.lastLive.total}` };
      });

      await t('Photo + poll posts', async () => {
        const r = await E.speak({ mode: 'post', text: 'which outfit for tonight?', tone: 'funny', extra: { type: 'poll', poll: ['red dress', 'black suit', 'pajamas'] } });
        need(r && r.placed.post.poll && r.placed.post.judge, 'poll post did not get rated');
        const r2 = await E.speak({ mode: 'post', text: 'new look', extra: { type: 'photo', attach: 'a mirror selfie in a leather jacket with neon lights behind' } });
        need(r2 && r2.placed.post.attach, 'photo post failed');
        const kids = Object.values(S.posts).filter((x) => x.replyTo === r2.placed.post.id).length;
        need(kids >= 1, 'nobody reacted to the photo');
        return { ok: `poll rated ${r.placed.post.judge.q}/10; photo drew ${kids} replies` };
      });

      await t('Random scenario (Director)', async () => {
        const sc = G.Scen.roll({ cat: 'drama', S });
        const before = S.postOrder.length + Object.keys(S.dms).length + S.chronicle.length;
        await E.director('SCENARIO to play out now (fully, with reactions): ' + sc.text);
        need(S.postOrder.length + Object.keys(S.dms).length + S.chronicle.length > before, 'the scenario changed nothing in the world');
        return { ok: sc.text.slice(0, 70) + '…' };
      });

      await t('Crowd drawn from the town', async () => {
        if (E.mainOnly && E.mainOnly()) return { ok: 'skipped: main cast only, so no crowd by design' };
        const r = await E.speak({ mode: 'post', text: 'anyone else awake right now?', tone: 'natural' });
        need(r, 'turn did not run');
        const crowd = Object.values(S.posts).filter((x) => x.replyTo === r.placed.post.id && x.author === 'crowd');
        need(crowd.length >= 2, 'no crowd replies');
        const linked = crowd.filter((x) => x.crowd.pop !== undefined).length;
        if (!linked) return { warn: 'crowd replies came back but none used the town handles from the CROWD POOL (the model ignored it)' };
        return { ok: `${linked}/${crowd.length} crowd replies came from real town people` };
      });

      await t('Scene (date) narration', async () => {
        E.startScene('n1', 'Coffee date');
        await E.sceneTurn('n1', '', true);
        const sc = S.scenes.n1;
        need(sc.log.length && sc.log[sc.log.length - 1].text.length > 120, 'scene text missing or too short');
        await E.sceneTurn('n1', 'I tell her she looks great today and take her hand');
        need(sc.log.length >= 3, 'second scene turn failed');
        return { ok: `${sc.log.length} entries, ${sc.log[sc.log.length - 1].options.length} options` };
      });

      await t('Memory summarisation', async () => {
        for (let i = 0; i < 32; i++) E.addChron(`Event ${i + 1}: Tester and Mia ${i % 2 ? 'argued about Kai' : 'flirted at the party'} (day ${i + 1}).`);
        const before = S.chronicle.length;
        const done = await G.Memory.run(true, true);
        need(done > 0, 'summariser returned nothing usable');
        need(S.saga && S.saga.length > 40, 'no saga text produced');
        need(S.chronicle.length < before, 'old chronicle was not compacted');
        return { ok: `chronicle ${before} → ${S.chronicle.length}; saga ${S.saga.length} chars` };
      });
    } finally {
      G.S = keep.S;
      G.busy = keep.busy;
      E.undoStack.length = 0;
      keep.stack.forEach((x) => E.undoStack.push(x));
      G.Store.save = keep.save;
      G.Store.saveSoon = keep.saveSoon;
      G.UI.render = keep.render;
      G.UI.toast = keep.toast;
      G.Memory.maybe = keep.maybe;
      ST.running = false;
    }
    return rows;
  };
})(window.G);
