/* Clout — the top relationship tier: 💞 LOVER.
   Only a LABEL on top of "dating" / "partner" for the deepest bond between two adults. It changes nothing about content: the content level, the hard
   limits and everything gated by them are untouched (the underlying status stays "dating"/"partner", so every existing system behaves exactly as before).
   It is reached when the bond is truly at the top (romance, affection and trust all very high), or when you make it so on their profile, and it is
   lost if the relationship falls apart. It is shown wherever a status is shown, in their memories, in an alert, and in the AI's picture of the cast. */
(function (G) {
  'use strict';
  const U = G.U;
  const E = G.Engine;
  const UI = G.UI;
  const A = UI.acts;
  const Tier = (G.Tier = { EVERY: 360 });
  const LOVE = ['dating', 'partner'];
  const SM = { label: 'Lover', emoji: '💞', cls: 'pink' };

  Tier.is = (n) => !!n && n.tier === 'lover' && LOVE.includes(n.status);
  Tier.eligible = (n) => !!n && !n.userAlt && !n.blocked && LOVE.includes(n.status) && !E.isFamily(n) && (n.age == null || n.age >= 18) && n.rom >= 85 && n.aff >= 80 && (typeof n.trust === 'number' ? n.trust : 30) >= 65;
  Tier.promote = function (n, manual) {
    const S = G.S;
    if (Tier.is(n)) return false;
    n.tier = 'lover';
    if (manual) n.tierManual = true;
    try { G.Mem.add(n, { kind: 'event', text: `${S.player.name} and I are lovers now: the deepest bond I have`, who: ['me'], imp: 9, valence: 0.9 }); } catch (e) {}
    try { E.addNotif('rel', `💞 ${n.name} is now your lover`, { npcId: n.id }); } catch (e) {}
    try { E.addChron(`${n.name} and ${S.player.name} became lovers`); } catch (e) {}
    return true;
  };
  Tier.demote = function (n) {
    if (!n.tier) return false;
    delete n.tier;
    delete n.tierManual;
    try { E.addChron(`${n.name} and ${G.S.player.name} are no longer lovers`); } catch (e) {}
    return true;
  };
  // every few game hours: promote the ones at the very top, drop the tier when the bond has fallen apart
  let last = null;
  Tier.step = function () {
    const S = G.S;
    if (!S) return 0;
    const slot = Math.floor(S.clock / Tier.EVERY);
    if (last && last.S === S && last.slot === slot) return 0;
    last = { S, slot };
    let changed = 0;
    Object.values(S.npcs).forEach((n) => {
      if (n.tier === 'lover') {
        if (!LOVE.includes(n.status) || (!n.tierManual && (n.rom < 65 || n.aff < 50))) changed += Tier.demote(n) ? 1 : 0;
      } else if (Tier.eligible(n)) changed += Tier.promote(n) ? 1 : 0;
    });
    if (changed) G.Store.saveSoon();
    return changed;
  };
  { const tick0 = E.tick; E.tick = function () { const r = tick0.apply(this, arguments); try { Tier.step(); } catch (e) {} return r; }; }

  // the label wherever a status is shown (statusMeta/chip take the character as a 2nd argument)
  const meta0 = UI.statusMeta;
  UI.statusMeta = (s, n) => (n && Tier.is(n) && LOVE.includes(s) ? SM : meta0(s));
  UI.chip = (status, n) => {
    const m = UI.statusMeta(status, n);
    return `<span class="chip ${m.cls}">${m.emoji} ${m.label}</span>`;
  };

  // a button on their profile: make (or undo) the tier by hand, only for someone you are dating
  A.tierToggle = (d) => {
    const n = G.S.npcs[d.id];
    if (!n) return;
    if (Tier.is(n)) { Tier.demote(n); UI.toast(`${n.name} is back to ${UI.statusMeta(n.status).label}.`, 'info'); }
    else if (!LOVE.includes(n.status) || E.isFamily(n)) return UI.toast('Only someone you are dating (or your partner) can be your lover.', 'info');
    else { Tier.promote(n, true); UI.toast(`💞 ${n.name} is your lover.`, 'good'); }
    G.Store.saveSoon();
    UI.render();
  };
  Tier.button = (n) => (n && LOVE.includes(n.status) && !E.isFamily(n) ? `<button class="btn sm" data-act="tierToggle" data-id="${n.id}" title="The deepest bond between two adults. Only a label: it changes no content settings.">${Tier.is(n) ? '💞 Lover (tap to undo)' : '💞 Make lover'}</button>` : '');
})(window.G);
