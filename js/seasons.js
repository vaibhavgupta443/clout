/* Clout — TOWN SEASONS: now and then the one-line "Around town" event grows into a three-day arc (festival, blackout, viral rumour, deadline week).
   Each arc offers YOU one choice. The choice shifts your Reputation (js/rep.js) and a few Bonds; the people around you react through DMs and channel chatter.
   Nobody posts or shares a story because of an arc. At most one arc at a time, one every 6 to 10 game days. Free and offline.
   S.season = { id, day0, step, choice } exists only while an arc runs and is deleted when it resolves (S.seasonLast = the day the last one began).
   W.worldEvent (js/world.js) stays the fallback on every day without an arc. */
(function (G) {
  'use strict';
  const U = G.U;
  const E = G.Engine;
  const UI = G.UI;
  const A = UI.acts;
  const esc = U.esc;
  const W = G.World;
  const Se = (G.Seasons = { MIN_GAP: 6, MAX_GAP: 10, LEN: 2 });
  const first = (s) => String(s || '').split(' ')[0];
  const rand = () => (W && W.rnd ? W.rnd() : Math.random());
  const enabled = () => !!G.S && G.settings.seasons !== false;

  // The arcs. Steps 0, 1, 2 are the three days. Choices: rep = standing changes, heat, bond = { who: 'close' | 'all' | 'rivals', aff }, chat = a channel line, dm = what a close person writes.
  Se.ARCS = [
    {
      id: 'festival', title: 'Riverside festival', w: 1,
      intro: 'The riverside festival is on this weekend and the whole town is going. People wonder who will show up.',
      steps: [
        { chron: 'the riverside festival is setting up along the water', chan: 'town-talk', chat: ['the festival stalls are going up by the river', 'anyone going to the festival this weekend?'] },
        { chron: 'the riverside festival is packed', chan: 'town-talk', chat: ['the festival is packed. so many people', 'cannot move at the festival. worth it though'] },
        { chron: 'the riverside festival wrapped up', chan: 'news', chat: ['the festival is over. what a weekend'] },
      ],
      choices: [
        { id: 'stage', label: 'Perform on the main stage', note: 'Fans and Press like it. Heat goes up a little.', rep: { fans: 6, press: 3, town: 4 }, heat: 5, bond: { who: 'all', aff: 0.5 }, done: 'took the main stage at the festival', chat: 'did you see {P} on the main stage', dm: ['saw you on that stage. you were great', 'that set at the festival, wow'], mem: 'played the main stage at the festival' },
        { id: 'stalls', label: 'Help at the food stalls', note: 'Friends and Town warm to you.', rep: { friends: 6, town: 6, fans: 2 }, bond: { who: 'close', aff: 1.5 }, done: 'spent the festival helping at the stalls', chat: '{P} was helping at the food stalls all day', dm: ['heard you were helping at the stalls. so like you', 'saw you at the stalls. thank you for that'], mem: 'helped at the festival stalls' },
        { id: 'skip', label: 'Skip it and rest', note: 'Heat cools. The close circle misses you.', rep: { friends: -2 }, heat: -6, bond: { who: 'close', aff: -0.5 }, done: 'skipped the festival', chat: 'no sign of {P} at the festival', dm: ['missed you at the festival. next time?', 'the festival was not the same without you'], mem: 'skipped the festival' },
      ],
    },
    {
      id: 'blackout', title: 'Blackout', w: 1,
      intro: 'A power cut has the neighbourhood in the dark. People are checking on each other.',
      steps: [
        { chron: 'a power cut has the neighbourhood in the dark', chan: 'news', chat: ['power is out across the whole east side', 'whole street is dark. is it just us?'] },
        { chron: 'the power is still out in places', chan: 'town-talk', chat: ['still no power here. candles everywhere', 'neighbours are sharing generators. love this town'] },
        { chron: 'the lights are back on', chan: 'news', chat: ['power is back. thank you to everyone who helped'] },
      ],
      choices: [
        { id: 'neighbours', label: 'Check on your neighbours', note: 'Town thinks well of you.', rep: { friends: 4, town: 7 }, bond: { who: 'all', aff: 0.5 }, done: 'checked on the neighbours during the blackout', chat: '{P} knocked on every door on our street', dm: ['heard you checked on everyone. that means a lot', 'you went door to door? of course you did'], mem: 'checked on the neighbours in the blackout' },
        { id: 'host', label: 'Host a candlelit hangout', note: 'Close friends bond with you.', rep: { friends: 6, town: 3, fans: 2 }, bond: { who: 'close', aff: 2 }, done: 'hosted a candlelit hangout in the blackout', chat: '{P} is hosting a candlelit hangout. everyone is invited', dm: ['that candlelit night was the best part of the blackout', 'thanks for having everyone over'], mem: 'hosted a candlelit hangout in the blackout' },
        { id: 'offline', label: 'Stay offline and wait it out', note: 'Heat cools. Fans notice the quiet.', rep: { fans: -2 }, heat: -6, done: 'stayed offline through the blackout', chat: 'has anyone heard from {P} during the blackout?', dm: ['you went quiet in the blackout. all good?'], mem: 'went quiet during the blackout' },
      ],
    },
    {
      id: 'rumour', title: 'Viral rumour', w: 1,
      intro: 'A rumour about you is making the rounds and people are picking sides.',
      steps: [
        { chron: 'a rumour about someone in the circle is spreading fast', chan: 'the-drama', chat: ['have you heard what is going around about {P}?', 'everyone is whispering about {P} today'] },
        { chron: 'the rumour is all anyone talks about', chan: 'town-talk', chat: ['people are really split on the {P} thing', 'the {P} rumour keeps growing'] },
        { chron: 'the rumour is finally dying down', chan: 'the-drama', chat: ['the rumour is fading. something new will take its place'] },
      ],
      choices: [
        { id: 'head', label: 'Address it head on', note: 'Press and Town respect it. Heat rises.', rep: { press: 5, town: 3, friends: 2 }, heat: 6, bond: { who: 'all', aff: 0.5 }, done: 'addressed the rumour head on', chat: '{P} just spoke up about the rumour. respect', dm: ['I saw you speak up about the rumour. good for you', 'proud of you for facing it'], mem: 'spoke up about the rumour' },
        { id: 'ignore', label: 'Ignore it', note: 'Press and Town read it as a yes.', rep: { press: -4, town: -3 }, heat: -2, done: 'ignored the rumour', chat: '{P} has not said a word about the rumour', dm: ['you are not going to say anything about it?'], mem: 'let the rumour run' },
        { id: 'friend', label: 'Let a friend speak up', note: 'Friends rally around you.', rep: { friends: 4, town: 2, press: -1 }, bond: { who: 'close', aff: 2 }, done: 'let a friend speak up about the rumour', chat: 'a friend of {P} just set the record straight', dm: ['I said my piece about the rumour. I have your back', 'people were talking, so I spoke up for you'], mem: 'spoke up for me about the rumour' },
      ],
    },
    {
      id: 'deadline', title: 'Deadline week', w: 1,
      intro: 'It is deadline week and everyone in your circle is stretched thin.',
      steps: [
        { chron: 'it is deadline week and everyone is stretched thin', chan: 'town-talk', chat: ['deadline week. send coffee', 'everyone I know is behind on something this week'] },
        { chron: 'deadline week is at its worst', chan: 'town-talk', chat: ['two more days. I have not slept', 'the whole town is running on caffeine'] },
        { chron: 'deadline week is over', chan: 'news', chat: ['deadline week is done. finally'] },
      ],
      choices: [
        { id: 'allnighter', label: 'Pull an all-nighter and deliver', note: 'Press and Fans are impressed. Friends see less of you.', rep: { press: 4, fans: 3, friends: -4 }, bond: { who: 'close', aff: -1 }, done: 'pulled an all-nighter to hit the deadline', chat: '{P} delivered on time. no sleep, apparently', dm: ['you did it all in one night? please rest', 'we barely saw you this week'], mem: 'worked all night to hit the deadline' },
        { id: 'extension', label: 'Ask for more time', note: 'Press is unimpressed. Heat cools.', rep: { press: -3, friends: 2 }, heat: -2, bond: { who: 'close', aff: 1 }, done: 'asked for more time on the deadline', chat: '{P} asked for an extension', dm: ['good call, asking for more time', 'honestly, same. I needed one too'], mem: 'asked for more time on the deadline' },
        { id: 'delegate', label: 'Share the load with a friend', note: 'Friends grow closer.', rep: { friends: 3, press: 1 }, bond: { who: 'close', aff: 2 }, done: 'shared the deadline load with a friend', chat: '{P} and a friend split the work', dm: ['thanks for letting me help with the deadline', 'we make a good team, you know'], mem: 'shared the deadline load with me' },
      ],
    },
  ];
  const arcOf = (id) => Se.ARCS.find((a) => a.id === id);
  Se.active = () => (G.S && G.S.season) || null;

  /* ---------- people ---------- */
  const cast = () => Object.values(G.S.npcs).filter((n) => !n.userAlt && !n.blocked && !n.muted && (n.age == null || n.age >= 18)).sort((a, b) => (b.touched || 0) - (a.touched || 0) || (a.id < b.id ? -1 : 1));
  const CLOSE = ['friend', 'close_friend', 'best_friend', 'crush', 'dating', 'partner', 'ally', 'admirer'];
  const who = (kind) => {
    const all = cast();
    if (kind === 'close') return all.filter((n) => CLOSE.includes(n.status)).sort((a, b) => b.aff + b.rom - (a.aff + a.rom) || (a.id < b.id ? -1 : 1)).slice(0, 6);
    if (kind === 'rivals') return all.filter((n) => ['rival', 'enemy', 'nemesis', 'frenemy'].includes(n.status)).slice(0, 4);
    return all.slice(0, 8);
  };
  const P1 = () => first(G.S.player.name);
  const fill = (s) => String(s).replace(/\{P\}/g, P1());
  const speak = (n, text) => { // the person's own voice, through the same common-sense gate as every other line
    try { text = G.Voice.stylize(text, n, rand, { short: true }) || text; } catch (e) {}
    try { if (G.Mind && !G.Mind.vet(n, text, { kind: 'dm', about: '', rel: G.React.relation(G.S, n, 'me') }).ok) return null; } catch (e) {}
    return text;
  };
  const dms = (list, lines, max) => {
    let sent = 0;
    list.forEach((n) => {
      if (sent >= max || !W.sendDm) return;
      const m = (G.S.dms[n.id] || []).slice(-1)[0];
      if (m && m.from === n.id && !m.read) return;
      const text = speak(n, lines[Math.floor(rand() * lines.length) % lines.length]);
      if (!text) return;
      const before = (G.S.dms[n.id] || []).length;
      W.sendDm(n, 'eventreact', G.S.clock, { text });
      if ((G.S.dms[n.id] || []).length > before) sent++;
    });
    return sent;
  };
  const chat = (chanId, text) => { // a line in a channel (never a post, never a story)
    const Ch = G.Channels;
    if (!Ch || !Ch.push || G.settings.channels === false) return null;
    try {
      const chan = Ch.ensure().find((c) => c.id === chanId);
      const c = cast();
      if (!chan || !c.length) return null;
      return Ch.push(chan, c[Math.floor(rand() * Math.min(c.length, 5)) % Math.min(c.length, 5)].id, fill(text), {});
    } catch (e) { return null; }
  };

  /* ---------- running an arc ---------- */
  const runStep = function (a, i) {
    const st = a.steps[i];
    if (!st) return;
    try { E.addChron('Around town: ' + st.chron + '.'); } catch (e) {}
    const line = st.chat[Math.floor(rand() * st.chat.length) % st.chat.length];
    chat(st.chan, line);
  };
  Se.start = function (id, day) {
    const S = G.S;
    const a = arcOf(id);
    if (!a || S.season) return null;
    S.season = { id: a.id, day0: day, step: 0, choice: '' };
    S.seasonLast = day;
    runStep(a, 0);
    try { E.addNotif('event', `${a.title}: ${a.intro} You can make one call (Profile).`, { act: 'nav', data: { page: 'me' } }); } catch (e) {}
    G.Store.saveSoon();
    return S.season;
  };
  Se.resolve = function () {
    const S = G.S;
    const s = S.season;
    if (!s) return;
    const a = arcOf(s.id);
    const c = a && a.choices.find((x) => x.id === s.choice);
    if (a) {
      try { E.addChron(c ? `Around town: ${P1()} ${c.done}.` : `Around town: ${a.title.toLowerCase()} passed without a word from ${P1()}.`); } catch (e) {}
      runStep(a, 2);
    }
    delete S.season;
    if (S.sim) S.sim.lastEventDay = U.dayOf(S.clock); // the one-line event waits its usual two days
    G.Store.saveSoon();
  };
  // called once a day by W.worldEvent. Returns true when an arc is running or began (the one-line event then stays quiet).
  Se.day = function (t) {
    const S = G.S;
    if (!S || !enabled()) return false;
    const day = U.dayOf(t);
    const s = S.season;
    if (s) {
      const a = arcOf(s.id);
      if (!a) { delete S.season; return false; }
      const target = Math.min(Se.LEN, day - s.day0);
      while (S.season && S.season.step < target) {
        S.season.step++;
        if (S.season.step >= Se.LEN) { Se.resolve(); break; }
        runStep(a, S.season.step);
      }
      return true;
    }
    const gap = S.seasonLast == null ? null : day - S.seasonLast;
    if (gap != null && gap < Se.MIN_GAP) return false;
    if (gap == null && day < 4) return false;
    const p = gap == null ? 0.2 : gap >= Se.MAX_GAP ? 1 : 0.3;
    if (rand() >= p) return false;
    const rep = G.Rep ? G.Rep.state() : { press: 50, fans: 50 };
    const ws = Se.ARCS.map((a) => a.w + (a.id === 'rumour' && rep.press < 45 ? 1 : 0) + (a.id === 'festival' && rep.fans >= 60 ? 1 : 0));
    let x = rand() * ws.reduce((q, v) => q + v, 0);
    let pick = Se.ARCS[0];
    for (let i = 0; i < ws.length; i++) { x -= ws[i]; if (x <= 0) { pick = Se.ARCS[i]; break; } }
    return !!Se.start(pick.id, day);
  };

  /* ---------- your call ---------- */
  Se.choose = function (choiceId) {
    const S = G.S;
    const s = S.season;
    if (!s) throw Object.assign(new Error('Nothing is happening around town that needs your call.'), { user: true });
    if (s.choice) return null; // a call is made exactly once
    const a = arcOf(s.id);
    const c = a && a.choices.find((x) => x.id === choiceId);
    if (!c) throw Object.assign(new Error('That is not one of the choices.'), { user: true });
    s.choice = c.id;
    if (G.Rep) G.Rep.nudge(c.rep, a.title.toLowerCase() + ': ' + c.done);
    if (c.heat) S.player.heat = Math.max(0, Math.min(100, S.player.heat + c.heat));
    const people = c.bond ? who(c.bond.who) : [];
    people.forEach((n) => {
      try { W.nudgeRel(n, { aff: c.bond.aff }); } catch (e) {}
      try { G.Mem.add(n, { kind: 'event', text: `${P1()} ${c.mem}`, who: ['me'], imp: 4, valence: c.bond.aff >= 0 ? 0.4 : -0.3 }); } catch (e) {}
    });
    try { E.addChron(`Around town: ${P1()} ${c.done}.`); } catch (e) {}
    chat('town-talk', c.chat);
    const reach = who('close');
    dms(reach.length ? reach : who('all'), c.dm, 2);
    G.Store.saveSoon();
    return c;
  };

  /* ---------- the card ---------- */
  Se.prompt = function () {
    const S = G.S;
    const s = S && S.season;
    const a = s && arcOf(s.id);
    if (!a) return '';
    const c = s.choice && a.choices.find((x) => x.id === s.choice);
    return `<div class="seasonbox" style="margin-top:10px;border-top:1px solid var(--line,rgba(120,130,150,.25));padding-top:8px"><div class="row between"><b>${esc(a.title)}</b><span class="chip blue">day ${Math.min(s.step + 1, Se.LEN + 1)} of ${Se.LEN + 1}</span></div>
      <div class="muted small">${esc(a.intro)}</div>
      ${c ? `<div class="small" style="margin-top:6px">Your call: ${esc(c.label)}.</div>` : `<div class="col" style="gap:6px;margin-top:8px">${a.choices.map((x) => `<div><button class="btn sm" data-act="seasonPick" data-id="${x.id}">${esc(x.label)}</button><div class="muted small">${esc(x.note)}</div></div>`).join('')}</div>`}</div>`;
  };
  Se.strip = function () {
    const S = G.S;
    const s = S && S.season;
    const a = s && arcOf(s.id);
    if (!a || s.choice || !enabled()) return '';
    return `<div class="card seasonstrip"><div class="row between"><div><b>${esc(a.title)}</b><div class="muted small">${esc(a.intro)}</div></div><button class="btn sm primary" data-act="nav" data-page="me">Your call</button></div></div>`;
  };

  A.seasonPick = async (d) => {
    try {
      let c = null;
      await E.guarded('Making your call…', async () => { c = Se.choose(d.id); return !!c; }, () => A.seasonPick(d));
      if (c) UI.toast(c.note, 'good');
    } catch (e) { UI.toast(e.message, 'bad'); }
  };
})(window.G);
