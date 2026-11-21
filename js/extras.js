/* Clout — extra features: group chats, scenes, live streams, shop, achievements, custom characters */
(function (G) {
  const U = G.U;
  const E = G.Engine;
  const AI = G.AI;
  const { clamp, int } = U;
  const guarded = (...a) => E.guarded(...a);

  /* ================= price helper ================= */
  E.price = (base) => Math.max(1, Math.round(base * Math.max(1, Math.sqrt(G.S.player.followers / 5000))));
  const spend = (cost) => {
    const P = G.S.player;
    if (P.cash < cost) {
      G.UI.toast(`Not enough cash — you need $${U.fmt(cost)}.`, 'bad');
      return false;
    }
    P.cash -= cost;
    return true;
  };

  /* ================= group chats ================= */

  E.createGroup = function (name, memberIds) {
    const S = G.S;
    const members = [...new Set(memberIds)].filter((id) => S.npcs[id]);
    if (members.length < 2) throw Object.assign(new Error('Pick at least two people for a group chat.'), { user: true });
    const id = 'g' + S.counters.group++;
    const g = { id, name: String(name || 'Group chat').trim().slice(0, 40) || 'Group chat', members, msgs: [], summary: '', muted: false, created: S.clock };
    S.groups[id] = g;
    E.addChron(`Player started the group chat "${g.name}" with ${members.map((m) => S.npcs[m].name).join(', ')}`);
    G.Store.save();
    return g;
  };

  E.deleteGroup = function (gid) {
    delete G.S.groups[gid];
    G.Store.save();
  };

  E.groupHistory = function (g, n = 16, exclude) {
    const S = G.S;
    const nm = (id) => (id === 'me' ? 'PLAYER' : (S.npcs[id] || {}).name || id);
    return `GROUP CHAT ${g.id} "${g.name}" — members: ${g.members.map((m) => `${m} (${nm(m)})`).join(', ')}${g.summary ? '\nEarlier (summary): ' + g.summary : ''}\nRecent messages:\n${g.msgs.filter((m) => m !== exclude).slice(-n).map((m) => `${nm(m.from)}: ${m.text}`).join('\n') || '(none yet)'}`;
  };

  // text may be empty: "let the chat run on its own"
  E.groupSend = function (gid, text) {
    return guarded(
      '💬 Group chat…',
      async () => {
        const S = G.S;
        const g = S.groups[gid];
        if (!g) throw new Error('That group no longer exists.');
        let placed = null;
        if (text) {
          placed = { id: 'g' + S.counters.msg++, from: 'me', text: text.slice(0, 600), t: S.clock, read: true };
          g.msgs.push(placed);
          G.UI.render();
        }
        E.tick(U.rand(2, 10));
        const c = AI.counts();
        const prompt = [
          AI.context({ focus: g.members, full: false, scan: text || '' }),
          E.groupHistory(g, 16, placed),
          '',
          text ? `PLAYER ACTION: the player writes in group chat ${g.id}: """${text}"""` : `PLAYER ACTION: the player stays quiet; the group chat ${g.id} carries on by itself.`,
          `Respond with "group_msgs" (set "group":"${g.id}"): ${Math.max(3, c.named)} messages from members — banter between THEM, teasing, flirting, arguing, gossiping, reacting to the player; each member keeps their own voice and may be absent. Add "rel" updates for anyone whose feelings changed, optional "storylines"/"npc_rel"/"chronicle". No crowd needed.`,
          AI.SCHEMA,
        ].join('\n');
        let out;
        try {
          out = await AI.json({ task: 'group', user: prompt, maxTokens: 2200 });
        } catch (e) {
          if (placed) g.msgs.splice(g.msgs.indexOf(placed), 1);
          G.UI.toast(e.message, 'bad');
          throw Object.assign(e, { handled: true });
        }
        E.apply(out.data, { judge: false });
        S.turns++;
      },
      () => E.groupSend(gid, text)
    ).catch((e) => {
      if (e && e.handled) return null;
      throw e;
    });
  };

  /* ================= scenes (meet-ups / dates) ================= */

  E.SCENE_PLACES = [
    { k: 'coffee', icon: '☕', label: 'Coffee date' },
    { k: 'party', icon: '🎉', label: 'House party' },
    { k: 'movie', icon: '🎬', label: 'Movie night' },
    { k: 'drive', icon: '🌃', label: 'Late-night drive' },
    { k: 'beach', icon: '🏖️', label: 'Beach trip' },
    { k: 'dinner', icon: '🍷', label: 'Fancy dinner' },
    { k: 'games', icon: '🎮', label: 'Game night' },
  ];

  E.startScene = function (npcId, place) {
    const S = G.S;
    const n = S.npcs[npcId];
    if (!n) return null;
    const sc = (S.scenes[npcId] = S.scenes[npcId] || { log: [], summary: '', place: '', active: false });
    sc.place = place;
    sc.active = true;
    sc.opened = S.clock;
    return sc;
  };

  const SCENE_SCHEMA = `Return JSON: {"scene_text":"2-4 paragraphs","scene_options":["short option","short option","short option"],"rel":[{"id":"npcId","aff":0,"rom":0,"riv":0,"trust":0,"status":"","mood":"","memory":"one line of what they now remember","reveal_secret":false}],"chronicle":"only for important beats","cash":0}`;

  E.sceneTurn = function (npcId, text, start = false) {
    return guarded(
      start ? '🎭 Setting the scene…' : '🎭 …',
      async () => {
        const S = G.S;
        const n = S.npcs[npcId];
        const sc = S.scenes[npcId];
        if (!n || !sc) throw new Error('No active scene.');
        const dir = /^\/dir\s+/i.test(text || ''); // "/dir ..." = the storyteller steers the scene instead of the player speaking
        if (dir) text = text.replace(/^\/dir\s+/i, '');
        let mine = null;
        if (text) {
          mine = { id: 'sc' + S.counters.msg++, role: dir ? 'dir' : 'me', text: text.slice(0, 600), t: S.clock };
          sc.log.push(mine);
          G.UI.render();
        }
        E.tick(U.rand(15, 40));
        const recent = sc.log.filter((e) => e !== mine).slice(-6).map((e) => (e.role === 'me' ? 'PLAYER: ' : e.role === 'dir' ? 'STORYTELLER DIRECTED: ' : 'NARRATION: ') + e.text.slice(0, 700));
        const prompt = [
          AI.context({ focus: [npcId], full: false, feedN: 3, scan: (text || '') + ' ' + sc.place }),
          E.dmHistory(npcId, 4),
          `INTERACTIVE SCENE between the player and ${n.id} (${n.name}, age ${n.age}). Setting: ${sc.place}.${sc.summary ? '\nEarlier scenes (summary): ' + sc.summary : ''}${recent.length ? '\nStory so far:\n' + recent.join('\n') : ''}`,
          start
            ? 'The scene is just beginning: establish the place, the atmosphere and how the character greets the player.'
            : dir
            ? `The STORYTELLER (the story's owner, not a character) directs what happens next: """${text}""". Make exactly that happen in this passage, in character and without skipping ahead; never write the player's own words.`
            : text
            ? `The player now does/says: """${text}"""`
            : 'The player lets the moment flow — continue the scene naturally and move it forward.',
          `Write "scene_text": 2-4 vivid paragraphs (120-260 words) in second person ("you") narrating what happens next, including ${n.name}'s dialogue and actions in character. Never write the player's own choices beyond what they stated. ${n.name} has real agency: feelings now are aff ${n.aff}, romance ${n.rom}, trust ${n.trust}, rivalry ${n.riv}, status ${n.status} — move at a pace those numbers justify, and let them decline, hesitate or redirect if they are not into something. Follow the content level for any physical intimacy. Give "scene_options": 3 short next-move suggestions (max 8 words each). Update "rel" gradually (usually ±3..10) with a one-line "memory".`,
          E.sceneLadder(n, sc),
          SCENE_SCHEMA,
        ].join('\n');
        let out;
        try {
          out = await AI.json({ task: 'scene', user: prompt, maxTokens: 1900, temperature: Math.min(1.1, G.settings.temperature + 0.05) });
        } catch (e) {
          if (mine) sc.log.splice(sc.log.indexOf(mine), 1);
          G.UI.toast(e.message, 'bad');
          throw Object.assign(e, { handled: true });
        }
        const d = out.data;
        const body = String(d.scene_text || d.text || '').trim();
        if (!body) {
          if (mine) sc.log.splice(sc.log.indexOf(mine), 1);
          G.UI.toast('The model returned an empty scene (it may have refused). Try rephrasing or switch model in Settings.', 'bad');
          throw Object.assign(new Error('empty scene'), { handled: true });
        }
        const entry = {
          id: 'sc' + S.counters.msg++, role: 'narr', text: body.slice(0, 2400), t: S.clock,
          options: (Array.isArray(d.scene_options) ? d.scene_options : []).map((o) => String(o).slice(0, 60)).slice(0, 4),
        };
        sc.log.push(entry);
        n.touched = S.clock;
        E.apply(d, { judge: false });
        S.turns++;
      },
      () => E.sceneTurn(npcId, text, start)
    ).catch((e) => {
      if (e && e.handled) return null;
      throw e;
    });
  };

  // meet-up scenes stay PG-13: romance and chemistry are fine
  E.sceneLadder = function () {
    return [
      'Keep the scene PG-13: romance and chemistry are fine, nothing explicit.',
      'Offer exactly 3 "scene_options": one that moves the moment forward, one that holds it, and one that changes the scene direction.',
    ].join('\n');
  };

  E.endScene = function (npcId) {
    const S = G.S;
    const sc = S.scenes[npcId];
    const n = S.npcs[npcId];
    if (!sc || !n) return;
    sc.active = false;
    E.addChron(`Player spent time with ${n.name} (${sc.place})`);
    G.Store.save();
  };

  /* ================= live stream ================= */

  E.goLive = async function (title, minutes = 30) {
    const r = await E.speak({
      mode: 'post', text: `🔴 LIVE NOW: ${title}`, tone: 'live', minutes, label: '🔴 Streaming…',
      instruction: `The player is streaming LIVE for ${minutes} minutes: "${title}". Rate the stream itself in "judge". Fill "live": about 16 chat messages from viewers (hype, trolls, simps, backseat gamers, running jokes), 3-8 donations with funny messages, a peak viewer guess and one clip-worthy "moment". Named cast may drop into chat (as replies), DM, or react afterwards. Replies/crowd attach to the stream post.`,
    });
    // models sometimes skip the "live" block; without it the stream would feel empty, so ask for just that
    const lv = r && r.res && r.res.live;
    const usable = lv && typeof lv === 'object' && Array.isArray(lv.chat) && lv.chat.filter((c) => c && c.text).length >= 3;
    if (r && !usable && !r.offline) { // (offline, the built-in recap in localSpeak already filled it: no AI call)
      await guarded('🔴 Chat is rolling in…', async () => {
        const out = await AI.json({
          task: 'live', maxTokens: 1800,
          user: [
            AI.context({ full: false, feedN: 4, pool: false }),
            `The player just finished a ${minutes}-minute LIVE stream titled "${title}" ("${r.placed.post.text}").`,
            'Write what happened in the chat. Return {"live":{"peak":0,"chat":[{"name":"","text":"","stance":"fan|hater|troll|simp|neutral"}],"donations":[{"name":"","amount":0,"msg":""}],"moment":"one clip-worthy moment"}} with about 16 chat messages (hype, trolls, simps, backseat gamers, running jokes) and 3-8 donations.',
          ].join('\n'),
        });
        E.apply({ live: out.data.live || out.data, judge: r.res && r.res.judge }, { judge: false });
      }).catch(() => null);
    }
    return r;
  };

  // offline stream recap: chat, donations and a moment, built from how the stream was rated and how people feel about you (no AI)
  const CHAT_GOOD = ['this is so good', 'lets gooo', 'chat is wild tonight', 'first time catching you live, love it', 'turn the music up', 'say hi to me!!', 'clip that', 'you are so funny 😂', 'the vibe tonight 🔥', 'best stream all week', 'this made my day', 'LOL no way'];
  const CHAT_BAD = ['kinda boring tbh', 'cringe', 'who even is this', 'lag lag lag', 'mods asleep?', 'why is this trending', 'unsub', 'ratio'];
  const CHAT_NAMES = ['pixelmoth', 'lowtide', 'nightowl88', 'juniper_k', 'bigdave', 'sleepyfox', 'Marlo', 'toastedbagel', 'velvetcat', 'ghostnote', 'rowan.w', 'sunnyside'];
  const PICK = (l) => l[Math.floor(E.rand() * l.length) % l.length];
  E.localLive = function (judge, spec) {
    const P = G.S.player;
    const title = String((spec && spec.text) || '').replace(/^.*LIVE NOW:\s*/i, '').slice(0, 60) || 'the stream';
    const q = clamp(int(judge && judge.quality, 5), 1, 10);
    const sent = clamp(int(judge && judge.sentiment, 0), -10, 10);
    const pHate = clamp(0.1 + (P.audience.hate - 20) / 200 + Math.max(0, -sent) / 25 - (q - 5) / 40, 0.04, 0.6);
    const chat = [];
    for (let i = 0; i < 16; i++) {
      const hater = E.rand() < pHate;
      chat.push({ name: PICK(CHAT_NAMES), text: hater ? PICK(CHAT_BAD) : PICK(CHAT_GOOD), stance: hater ? (E.rand() < 0.4 ? 'troll' : 'hater') : E.rand() < 0.2 ? 'simp' : 'fan' });
    }
    const scale = Math.sqrt(1 + P.followers / 20000);
    const donations = [];
    const nd = 3 + Math.floor(E.rand() * 4) + (q >= 8 ? 1 : 0);
    for (let i = 0; i < nd; i++) donations.push({ name: PICK(CHAT_NAMES), amount: Math.max(1, Math.round((3 + E.rand() * 20 * (q / 6)) * scale)), msg: PICK(['keep going!', 'for the snacks', 'you earned it', 'love this stream', 'shout out to chat']) });
    const moment = q >= 7 ? `Chat went wild during "${title}" and somebody clipped it.` : sent <= -4 ? `Things got tense in chat during "${title}".` : `A quiet, cozy stretch of "${title}" kept chat talking.`;
    return { chat, donations, moment };
  };
  // offline: what you write slowly shapes your stats (a few points a day at most). With a judge it returns the map E.apply expects; without, it applies it.
  E.applyLocalStats = function (judge, text, isReply) {
    const P = G.S.player;
    if (!P.stats || !G.Lex) return null;
    const lx = G.Lex.analyze(text);
    let key = null;
    if (judge) {
      key = { funny: 'wit', spicy: 'edge', vulnerable: 'empathy', wholesome: 'empathy', flirty: 'charisma' }[judge.tone] || (lx.topics.some((t) => ['fashion', 'beauty', 'selfie', 'art'].includes(t)) ? 'style' : null);
      if (judge.sentiment <= -5) key = 'edge';
    } else {
      const it = G.Lex.intent(text);
      key = it === 'flirt' ? 'charisma' : ['sad', 'apology', 'thanks'].includes(it) ? 'empathy' : it === 'insult' ? 'edge' : null;
    }
    if (!key || !(key in P.stats)) return null;
    const got = E.dailyCap('st', 3, E.rand() < (isReply ? 0.15 : 0.4) ? 1 : 0);
    if (!got) return null;
    if (judge) return { [key]: 1 };
    P.stats[key] = clamp(P.stats[key] + 1, 1, 100);
    return null;
  };

  /* ================= shop / money ================= */

  E.PROMOS = [
    { k: 1, label: 'Boost', base: 40, mult: 1.7 },
    { k: 2, label: 'Promote', base: 400, mult: 3.5 },
    { k: 3, label: 'Mega campaign', base: 4000, mult: 8 },
  ];

  E.promote = function (postId, tier) {
    const S = G.S;
    const p = S.posts[postId];
    const pr = E.PROMOS.find((x) => x.k === +tier);
    if (!p || p.author !== 'me' || !pr) return false;
    if (p.promoted) return G.UI.toast('That post is already promoted.', 'info'), false;
    if (!spend(E.price(pr.base))) return false;
    const m = pr.mult * U.rand(0.85, 1.2);
    p.stats.likes = Math.round(p.stats.likes * m + 10);
    p.stats.reposts = Math.round(p.stats.reposts * m);
    p.stats.views = Math.round((p.stats.views || p.stats.likes * 10) * m * 1.4);
    p.stats.replies = Math.round(p.stats.replies * (1 + (m - 1) * 0.5));
    p.promoted = pr.k;
    const f0 = S.player.followers;
    const gain = Math.round(Math.sqrt(Math.max(f0, 100) * 5000) * 0.004 * pr.mult * E.saturation(f0) + Math.min(p.stats.likes * 0.02, f0 * 0.01)); // grows like the price does (square root of your size)
    const actualGain = E.addFollowers ? E.addFollowers(gain) : (S.player.followers += gain, gain);
    S.player.audience.hate = clamp(S.player.audience.hate + 0.4 * pr.k, 2, 95);
    E.addNotif('follow', `Promotion worked: +${U.fmt(actualGain)} followers, ${U.fmt(p.stats.likes)} likes`, { postId });
    G.UI.toast(`📣 ${pr.label} done: +${U.fmt(actualGain)} followers`, 'good');
    G.Store.save();
    return true;
  };

  E.hirePR = function () {
    const P = G.S.player;
    if (!spend(E.price(1500))) return false;
    P.heat = clamp(P.heat - 45, 0, 100);
    P.audience.hate = clamp(P.audience.hate - 8, 2, 95);
    E.addChron('Player hired a PR agency to clean up their image');
    G.UI.toast('🛡️ PR agency hired: heat −45, haters −8', 'good');
    G.Store.save();
    return true;
  };

  E.buyVerified = function () {
    const P = G.S.player;
    if (P.verified) return false;
    if (!spend(E.price(800))) return false;
    P.verified = true;
    G.UI.toast('☑️ Verified!', 'good');
    G.Store.save();
    return true;
  };

  E.GIFTS = [
    { k: 'flowers', icon: '🌹', label: 'Flowers', cost: 30, desc: 'a bouquet of flowers' },
    { k: 'dinner', icon: '🍽️', label: 'Dinner out', cost: 150, desc: 'an expensive dinner reservation for two' },
    { k: 'jewelry', icon: '💎', label: 'Jewelry', cost: 2000, desc: 'a piece of designer jewelry' },
    { k: 'trip', icon: '✈️', label: 'Weekend trip', cost: 9000, desc: 'a surprise weekend getaway' },
    { k: 'car', icon: '🚗', label: 'Luxury car', cost: 60000, desc: 'a luxury car with a bow on it' },
  ];

  // a gift for somebody famous costs more than one for a friend with 800 followers (x0.6 .. x6 on the listed price)
  E.giftCost = (n, g) => Math.max(1, Math.round(g.base * clamp(Math.sqrt(((n && n.followers) || 500) / 1000), 0.6, 6)));
  E.giftTarget = null;
  E.GIFTS.forEach((g) => {
    const base = g.cost;
    delete g.cost;
    Object.defineProperty(g, 'base', { value: base, enumerable: false });
    Object.defineProperty(g, 'cost', { enumerable: true, get() { const n = E.giftTarget && G.S && G.S.npcs[E.giftTarget]; return n ? E.giftCost(n, g) : base; } });
  });

  E.gift = async function (npcId, key, note) {
    const n = G.S.npcs[npcId];
    const gift = E.GIFTS.find((g) => g.k === key);
    if (!n || !gift) return null;
    E.giftTarget = npcId;
    const cost = gift.cost;
    if (!spend(cost)) return null;
    const r = await E.speak({
      mode: 'dm', npcId, text: (note || '').trim() || (AI.ready() ? null : gift.icon + ' I got you ' + gift.desc + '.'), label: gift.icon + ' Sending gift…',
      instruction: `The player sends ${n.name} a GIFT: ${gift.desc} (costs $${gift.cost}). React in character — touched, suspicious of being bought, embarrassed, greedy, offended or thrilled depending on personality, trust and the relationship. Update "rel" accordingly (extravagant gifts to people who barely know the player can feel creepy or like a bribe).`,
      focus: [npcId], fallbackText: `${gift.icon} I got you ${gift.desc}.`,
    });
    if (!r) G.S.player.cash += cost; // refund on failure
    else if (!AI.ready()) { // no AI: the gift still lands, by how much it means to them (a big gift to a near-stranger feels like a bribe)
      const tier = E.GIFTS.indexOf(gift);
      const creepy = n.aff < 15 && tier >= 2;
      E.applyRel(n, creepy ? { aff: -4, trust: -3 } : { aff: [1, 2, 4, 6, 8][tier] || 2, trust: tier >= 2 ? 1 : 0 });
      try { G.Mem.add(n, { kind: 'event', text: creepy ? `${G.S.player.name} gave me ${gift.desc}, which felt like too much, too soon` : `${G.S.player.name} gave me ${gift.desc}`, who: ['me'], imp: 5, valence: creepy ? -0.4 : 0.5 }); } catch (e) {}
    }
    return r;
  };

  /* ================= custom characters ================= */

  const REL_PRESETS = {
    stranger: {},
    friend: { status: 'friend', aff: 35, trust: 30 },
    best_friend: { status: 'best_friend', aff: 70, trust: 60 },
    crush: { status: 'crush', aff: 30, rom: 50, trust: 15 },
    dating: { status: 'dating', aff: 60, rom: 70, trust: 50 },
    ex: { status: 'ex', aff: -10, rom: 20, riv: 25, trust: 10 },
    rival: { status: 'rival', aff: -15, riv: 50 },
    enemy: { status: 'enemy', aff: -50, riv: 70 },
  };
  // family: warm, trusting, never romantic
  ['mother', 'father', 'son', 'daughter', 'brother', 'sister', 'grandmother', 'grandfather', 'aunt', 'uncle', 'cousin', 'niece', 'nephew'].forEach((k) => {
    REL_PRESETS[k] = { status: k, aff: 55, trust: 55 };
  });
  E.REL_PRESETS = Object.keys(REL_PRESETS);

  E.createCustomNpc = function (f) {
    const S = G.S;
    if (!String(f.name || '').trim()) throw Object.assign(new Error('Give the character a name.'), { user: true });
    const pre = REL_PRESETS[f.rel] || {};
    const n = E.makeNpc(
      Object.assign({}, pre, {
        name: f.name.trim(), handle: f.handle || f.name.trim().split(/\s+/)[0], role: f.role || 'wildcard', age: f.age,
        bio: f.bio, personality: f.personality || 'unpredictable', emoji: f.emoji || '🙂',
        followers: int(f.followers, 800), secret: f.secret, custom: true,
      })
    );
    if (pre.status) n.memories.push(`Player created this relationship at the start (${pre.status}).`);
    E.addChron(`${n.name} (${n.handle}) joined the world as a ${f.rel || 'stranger'} of the player`);
    G.Store.save();
    return n;
  };

  E.genNpc = async function (idea) {
    if (!G.AI.ready()) throw new Error(G.AI.notReadyMsg());
    const S = G.S;
    const prompt = [
      `World: ${S.world.name} — ${S.world.setting}`,
      `Design ONE new character for this world from this idea: "${idea || 'surprise me with someone who will cause drama'}". They must be an adult (18+).`,
      'Return JSON: {"name":"","handle":"@h","age":18-60,"role":"love_interest|rival|friend|mentor|influencer|journalist|troll|wildcard|brand","emoji":"","bio":"<=90 chars","personality":"<=25 words: traits AND exactly how they type","followers":0,"secret":""}',
    ].join('\n');
    const out = await AI.json({ task: 'npcgen', user: prompt, maxTokens: 500, temperature: 1 });
    return out.data;
  };

  /* ================= post management ================= */

  // fix a typo in your own post (or a burner account's): the text changes, the reactions stay
  E.editPost = function (postId, text) {
    const S = G.S;
    const p = S.posts[postId];
    text = String(text || '').trim().slice(0, 500);
    if (!p || !text || (p.author !== 'me' && !E.altOf(p.author) && !S.admin && !E.directing)) return false;
    if (text !== p.text) {
      p.text = text;
      p.edited = true;
      if (p.rx) p.fx = undefined; // topic / stance caches belong to the old words
    }
    G.Store.save();
    return true;
  };

  // delete a burner account with everything it posted, said and followed
  E.deleteAlt = function (altId) {
    const S = G.S;
    const alt = E.altOf(altId);
    if (!alt) return false;
    Object.values(S.posts).filter((p) => p.author === altId && !p.replyTo).forEach((p) => E.deletePost(p.id));
    Object.values(S.posts).filter((p) => p.author === altId).forEach((p) => {
      if (!S.posts[p.id]) return; // already removed together with a parent
      const parent = S.posts[p.replyTo];
      if (parent && parent.stats) parent.stats.replies = Math.max(0, parent.stats.replies - 1);
      E.deletePost(p.id); // takes the replies other people wrote under it along
    });
    S.postOrder = S.postOrder.filter((id) => S.posts[id]);
    Object.values(S.posts).forEach((p) => {
      if (p.likedBy && p.likedBy.includes(altId)) {
        p.likedBy = p.likedBy.filter((x) => x !== altId);
        p.stats.likes = Math.max(0, p.stats.likes - 1);
      }
    });
    S.stories = (S.stories || []).filter((st) => st.author !== altId);
    if (S.altDms) delete S.altDms[altId];
    S.npcRel = S.npcRel.filter((e) => e.a !== altId && e.b !== altId);
    S.queue = (S.queue || []).filter((q) => q.alt !== altId && q.npc !== altId);
    S.notifs = S.notifs.filter((n) => n.alt !== altId && n.npcId !== altId && (!n.postId || S.posts[n.postId]));
    delete S.npcs[altId];
    if (S.activeAlt === altId) S.activeAlt = null;
    if (G.React) G.React.dirty = true;
    G.Store.save();
    return true;
  };

  E.deletePost = function (postId) {
    const S = G.S;
    const p = S.posts[postId];
    if (!p || (p.author !== 'me' && !E.altOf(p.author) && !S.admin && !E.directing)) return;
    const kill = new Set([postId]);
    let grew = true;
    while (grew) {
      grew = false;
      Object.values(S.posts).forEach((x) => {
        if (x.replyTo && kill.has(x.replyTo) && !kill.has(x.id)) {
          kill.add(x.id);
          grew = true;
        }
      });
    }
    kill.forEach((id) => delete S.posts[id]);
    S.postOrder = S.postOrder.filter((id) => !kill.has(id));
    S.notifs = S.notifs.filter((n) => !n.postId || S.posts[n.postId]);
    if (S.pinned === postId) S.pinned = null;
    G.Store.save();
  };
  E.pinPost = function (postId) {
    const S = G.S;
    S.pinned = S.pinned === postId ? null : postId;
    G.Store.save();
  };

  /* ================= achievements ================= */

  const cnt = (sts) => Object.values(G.S.npcs).filter((n) => sts.includes(n.status)).length;
  const F = ['friend', 'close_friend', 'best_friend'];
  const mine = () => Object.values(G.S.posts).filter((p) => p.author === 'me');
  E.ACH = [
    ['first_post', '✍️', 'Hello World', 'Publish your first post', () => G.S.player.posts >= 1],
    ['posts_25', '📝', 'Chronically Online', 'Publish 25 posts', () => G.S.player.posts >= 25],
    ['posts_100', '📚', 'No Days Off', 'Publish 100 posts', () => G.S.player.posts >= 100],
    ['f1k', '🌱', 'Getting Noticed', 'Reach 1K followers', () => G.S.player.followers >= 1e3],
    ['f10k', '🌿', 'Micro-Famous', 'Reach 10K followers', () => G.S.player.followers >= 1e4],
    ['f100k', '🌳', 'Clout Chaser', 'Reach 100K followers', () => G.S.player.followers >= 1e5],
    ['f1m', '🏔️', 'Million Strong', 'Reach 1M followers', () => G.S.player.followers >= 1e6],
    ['f10m', '🌋', 'Global Icon', 'Reach 10M followers', () => G.S.player.followers >= 1e7],
    ['viral', '🚀', 'Gone Viral', 'Get a post with viral reach', () => mine().some((p) => p.judge && p.judge.v >= 8)],
    ['spicy', '🌶️', 'Hot Take', 'Post something truly controversial', () => mine().some((p) => p.judge && p.judge.c >= 8)],
    ['friend', '😊', 'Made a Friend', 'Befriend someone', () => cnt(F) >= 1],
    ['friends5', '🫂', 'Squad Goals', 'Have 5 friends', () => cnt(F) >= 5],
    ['crush', '😍', 'Butterflies', 'Someone develops a crush on you', () => cnt(['crush', 'admirer']) >= 1],
    ['dating', '💑', 'Official', 'Start dating someone', () => cnt(['dating', 'partner']) >= 1],
    ['juggler', '🤹', 'Juggler', 'Date two people at once', () => cnt(['dating', 'partner']) >= 2],
    ['heartbreak', '💔', 'Heartbreak', 'Have an ex', () => cnt(['ex']) >= 1],
    ['rival', '⚔️', 'Rivalry', 'Make a rival', () => cnt(['rival', 'frenemy']) >= 1],
    ['enemy', '😡', 'Public Enemy', 'Make an enemy', () => cnt(['enemy', 'nemesis', 'hater']) >= 1],
    ['nemesis', '☠️', 'Arch-Nemesis', 'Earn a nemesis', () => cnt(['nemesis']) >= 1],
    ['secret', '🤫', 'Secret Keeper', 'Uncover a secret', () => Object.values(G.S.npcs).some((n) => n.secretRevealed)],
    ['hot', '🔥', 'Cancelled?', 'Reach 90 controversy heat', () => G.S.player.heat >= 90],
    ['lvl5', '⭐', 'Level 5', 'Reach level 5', () => G.S.player.level >= 5],
    ['lvl15', '🌟', 'Level 15', 'Reach level 15', () => G.S.player.level >= 15],
    ['rich', '💰', 'Paid', 'Hold $10,000', () => G.S.player.cash >= 1e4],
    ['rich2', '🤑', 'Millionaire', 'Hold $1,000,000', () => G.S.player.cash >= 1e6],
    ['live', '🔴', 'Live!', 'Complete a live stream', () => !!G.S.lastLive],
    ['group', '👥', 'Group Admin', 'Start a group chat', () => Object.keys(G.S.groups).length >= 1],
    ['scene', '🎭', 'Off the Feed', 'Meet someone in person', () => Object.values(G.S.scenes).some((s) => s.log.length)],
    ['creator', '🧬', 'Character Designer', 'Create your own character', () => Object.values(G.S.npcs).some((n) => n.custom)],
    ['saga', '🧠', 'Long Memory', 'Have the game summarise your history', () => (G.S.memRuns || 0) >= 1],
  ].map((a) => ({ id: a[0], icon: a[1], name: a[2], desc: a[3], test: a[4] }));

  E.checkAch = function () {
    const S = G.S;
    if (!S) return;
    E.ACH.forEach((a) => {
      if (S.ach[a.id]) return;
      let ok = false;
      try {
        ok = a.test();
      } catch (e) {}
      if (ok) {
        S.ach[a.id] = S.clock;
        if (G.Chapters && G.Chapters.announce && G.Chapters.announce(a)) return; G.UI.toast(`🏆 Achievement: ${a.name}`, 'good');
        E.addNotif('level', `🏆 Achievement unlocked: ${a.name}`);
      }
    });
  };

  /* ================= tagging: type @ for people and # for trending topics in any post / reply / message box ================= */

  const UI = G.UI;
  const FIELD = '#composer, #replybox, #dmbox, #svreply, .addc input, #editbox, #stdock textarea, #st_text';
  const TOKEN = /(^|[\s(])([@#])([\p{L}\p{N}_.]{0,30})$/u;
  const tagState = { el: null, items: [], i: 0, start: 0, kind: '' };
  let pop = null;
  const field = (el) => !!(el && el.matches && el.matches(FIELD));

  const people = (q) => {
    const S = G.S;
    q = q.toLowerCase();
    const rank = (n) => {
      const h = n.handle.replace(/^@/, '').toLowerCase();
      const nm = n.name.toLowerCase();
      const base = !q ? 3 : h.startsWith(q) ? 0 : nm.startsWith(q) ? 1 : nm.split(/\s+/).some((w) => w.startsWith(q)) ? 2 : h.includes(q) || nm.includes(q) ? 4 : -1;
      if (base < 0) return null; // no match at all
      return base * 1000 - Math.min(999, Math.log10(n.followers + 10) * 100) - (UI.following(n.id) ? 400 : 0);
    };
    return Object.values(S.npcs)
      .filter((n) => !n.blocked && !n.userAlt && n.handle && rank(n) !== null)
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, 6)
      .map((n) => ({ insert: n.handle, label: n.name, sub: n.handle, emoji: n.emoji }));
  };
  const topics = (q) => {
    const S = G.S;
    q = q.toLowerCase();
    const seen = new Map();
    (S.trending || []).forEach((t) => seen.set(t.tag.toLowerCase(), t.heat + 100));
    S.postOrder.slice(-120).forEach((id) => {
      const p = S.posts[id];
      (p && String(p.text).match(/#[\p{L}\p{N}_]{2,30}/gu) || []).forEach((t) => seen.set(t.toLowerCase(), (seen.get(t.toLowerCase()) || 0) + 1));
    });
    return [...seen.entries()]
      .filter(([t]) => !q || t.slice(1).startsWith(q))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([t, v]) => ({ insert: t, label: t, sub: v > 100 ? 'trending' : '', emoji: '#️⃣' }));
  };

  const closePop = () => {
    if (pop) pop.remove();
    pop = null;
    tagState.el = null;
    tagState.items = [];
  };
  const draw = () => {
    if (!tagState.items.length || !tagState.el || !tagState.el.isConnected) return closePop();
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'tagpop';
      pop.setAttribute('role', 'listbox');
      document.body.appendChild(pop);
      const pick = (e) => {
        const row = e.target.closest('[data-i]');
        if (!row) return;
        e.preventDefault(); // keep the keyboard open and the caret where it is
        tagState.i = +row.dataset.i;
        choose();
      };
      pop.addEventListener('mousedown', pick);
      pop.addEventListener('touchstart', pick, { passive: false });
    }
    pop.innerHTML = tagState.items.map((it, i) => `<div class="tagrow ${i === tagState.i ? 'on' : ''}" role="option" data-i="${i}"><span class="tg-e">${U.esc(it.emoji)}</span><span class="grow"><b>${U.esc(it.label)}</b>${it.sub ? ` <span class="muted small">${U.esc(it.sub)}</span>` : ''}</span></div>`).join('');
    const r = tagState.el.getBoundingClientRect();
    const w = Math.min(320, Math.max(220, r.width), window.innerWidth - 16);
    const h = tagState.items.length * 44 + 8;
    pop.style.width = w + 'px';
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    const below = r.bottom + h + 8 < window.innerHeight;
    pop.style.top = below ? r.bottom + 4 + 'px' : Math.max(8, r.top - h - 4) + 'px';
  };
  const update = (el) => {
    if (!G.S || !field(el)) return closePop();
    const pos = el.selectionStart == null ? el.value.length : el.selectionStart;
    const m = TOKEN.exec(el.value.slice(0, pos));
    if (!m) return closePop();
    const kind = m[2];
    const items = kind === '@' ? people(m[3]) : topics(m[3]);
    if (!items.length) return closePop();
    Object.assign(tagState, { el, items, kind, start: pos - m[3].length - 1, i: tagState.el === el && tagState.i < items.length ? tagState.i : 0 });
    draw();
  };
  const choose = () => {
    const { el, items, i, start } = tagState;
    const it = items[i];
    if (!el || !it) return closePop();
    const pos = el.selectionStart == null ? el.value.length : el.selectionStart;
    const after = el.value.slice(pos);
    const ins = it.insert + (after.startsWith(' ') ? '' : ' ');
    el.value = el.value.slice(0, start) + ins + after;
    const caret = start + it.insert.length + 1;
    el.setSelectionRange(caret, caret);
    el.dispatchEvent(new Event('input', { bubbles: true })); // keeps the draft state in sync
    closePop();
    el.focus();
  };

  document.addEventListener('input', (e) => update(e.target));
  document.addEventListener('click', (e) => { if (pop && !e.target.closest('#tagpop') && !field(e.target)) closePop(); });
  document.addEventListener('focusout', (e) => { if (field(e.target)) setTimeout(() => { if (document.activeElement !== tagState.el) closePop(); }, 150); });
  document.addEventListener('keydown', (e) => {
    if (!pop || e.target !== tagState.el) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      tagState.i = (tagState.i + (e.key === 'ArrowDown' ? 1 : tagState.items.length - 1)) % tagState.items.length;
      draw();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      choose();
    } else if (e.key === 'Escape') {
      closePop();
    } else return;
    e.preventDefault();
    e.stopImmediatePropagation(); // Enter must pick the person, not send the message
  }, true);
  window.addEventListener('resize', closePop);
  window.addEventListener('scroll', () => { if (pop) draw(); }, { passive: true });

  // the "＠ Tag" button next to a text box: drops an @ at the caret and opens the list
  G.UI.acts.tagPick = (d) => {
    const el = document.getElementById(d.for);
    if (!el) return;
    el.focus();
    const pos = el.selectionStart == null ? el.value.length : el.selectionStart;
    const before = el.value.slice(0, pos);
    const lead = before && !/\s$/.test(before) ? ' ' : '';
    el.value = before + lead + '@' + el.value.slice(pos);
    const caret = pos + lead.length + 1;
    el.setSelectionRange(caret, caret);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    update(el);
  };
  E.tagSuggest = { people, topics }; // exposed for tests
})(window.G);
