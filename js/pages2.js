/* Clout — pages & modals for the extra features (shop, scenes, live, groups, custom characters, self-test) */
(function (G) {
  const U = G.U;
  const UI = G.UI;
  const P = G.Pages;
  const E = G.Engine;
  const esc = U.esc;

  /* ---------- shop ---------- */

  P.shop = function () {
    const S = G.S;
    const p = S.player;
    const mine = S.postOrder.map((id) => S.posts[id]).filter((x) => x && x.author === 'me' && !x.replyTo && !x.pending).slice(-5).reverse();
    const people = Object.values(S.npcs).filter((n) => !n.blocked).sort((a, b) => a.name.localeCompare(b.name));
    return `<h4 class="sect">🛍️ Shop</h4>
      <div class="card"><div class="row between"><div><div class="muted small">Your cash</div><div class="bigstat">💰 $${U.fmt(p.cash)}</div></div>
        <div class="muted small" style="text-align:right">Earned from posts, streams,<br>donations &amp; brand deals</div></div></div>
      ${G.Fame ? G.Fame.card() : ''}
      <div class="shopgrid">
        <div class="card shopitem"><h3>🛡️ PR agency</h3><p class="small">A crisis team cools your controversy heat by 45 and sours haters a little.</p>
          <button class="btn primary" data-act="buyPR">$${U.fmt(E.price(1500))}</button></div>
        <div class="card shopitem"><h3>☑️ Verified badge</h3><p class="small">${p.verified ? 'You already have the blue check.' : 'Skip the line and buy the checkmark.'}</p>
          <button class="btn primary" data-act="buyVerify" ${p.verified ? 'disabled' : ''}>$${U.fmt(E.price(800))}</button></div>
      </div>
      <h4 class="sect">📣 Promote a post</h4>
      <div class="card">${mine.map((x) => `<div class="row between promo"><div class="grow small">${esc(x.text.slice(0, 80))}${x.promoted ? ' <span class="chip blue">promoted</span>' : ''}</div><button class="btn sm" data-act="promoteModal" data-id="${x.id}" ${x.promoted ? 'disabled' : ''}>📣 Promote</button></div>`).join('') || '<span class="muted">Post something first.</span>'}
        <p class="muted small">You can also hit 📣 on any of your own posts.</p></div>
      <h4 class="sect">🎁 Gifts</h4>
      <div class="card"><p class="small">Buy someone a gift — their reaction depends on how well they know you. Showering strangers with luxuries can feel like a bribe 👀</p>
        <div class="row"><select id="giftnpc"><option value="">Choose who to spoil…</option>${people.map((n) => `<option value="${n.id}">${esc(n.name)} — ${esc(UI.statusMeta(n.status, n).label)}</option>`).join('')}</select><button class="btn primary" data-act="giftFromShop">Pick gift</button></div></div>`;
  };

  UI.promoteModal = (postId) => {
    const p = G.S.posts[postId];
    if (!p) return;
    UI.modal(`<button class="close" data-act="closeModal">✕</button><h3>📣 Promote post</h3>
      <div class="quote">${U.rich(p.text.slice(0, 200))}</div>
      <p class="small muted">Promoting multiplies reach and adds followers. Ads attract a few haters too. You have <b>$${U.fmt(G.S.player.cash)}</b>.</p>
      <div class="col">${E.PROMOS.map((x) => `<button class="btn" data-act="doPromote" data-id="${postId}" data-k="${x.k}">${x.label} · ×${x.mult} reach — <b>$${U.fmt(E.price(x.base))}</b></button>`).join('')}</div>`);
  };

  UI.giftModal = (npcId) => {
    const n = G.S.npcs[npcId];
    if (!n) return;
    UI.modal(`<button class="close" data-act="closeModal">✕</button><h3>🎁 Gift for ${esc(n.name)}</h3>
      <p class="small muted">You have <b>$${U.fmt(G.S.player.cash)}</b>. ${esc(n.name)} is currently: ${UI.chip(n.status, n)}</p>
      <textarea id="giftnote" rows="2" maxlength="300" placeholder="Optional note (blank = the AI writes one)"></textarea>
      <div class="col" style="margin-top:8px">${E.GIFTS.map((g) => `<button class="btn" data-act="doGift" data-id="${npcId}" data-k="${g.k}">${g.icon} ${g.label} — <b>$${U.fmt(g.cost)}</b></button>`).join('')}</div>`);
  };

  /* ---------- scenes ---------- */

  UI.meetupModal = (npcId) => {
    const S = G.S;
    const n = S.npcs[npcId];
    if (!n) return;
    const sc = S.scenes[npcId];
    UI.modal(`<button class="close" data-act="closeModal">✕</button><h3>🎭 Meet up with ${esc(n.name)}</h3>
      <p class="small muted">An interactive story scene. ${esc(n.name)} has their own mind — feelings (💚 ${n.aff} · 💘 ${n.rom} · 🤝 ${n.trust}) decide how far things go.</p>
      ${sc && sc.log.length ? `<button class="btn primary wide" data-act="resumeScene" data-id="${npcId}">▶ Resume last scene (${esc(sc.place)})</button>` : ''}
      <div class="presets">${E.SCENE_PLACES.map((x) => `<button class="preset" data-act="startScene" data-id="${npcId}" data-place="${esc(x.label)}"><span>${x.icon}</span>${esc(x.label)}</button>`).join('')}</div>
      <label>…or anywhere you like</label><div class="row"><input id="customplace" maxlength="80" placeholder="rooftop at midnight, their dressing room…"><button class="btn" data-act="startScene" data-id="${npcId}" data-place="__custom">Go</button></div>`);
  };

  P.scene = function () {
    const S = G.S;
    const n = S.npcs[UI.sceneWith];
    const sc = n && S.scenes[n.id];
    if (!n || !sc) {
      UI.page = 'home';
      return P.home();
    }
    const last = sc.log[sc.log.length - 1];
    const opts = last && last.role === 'narr' ? last.options || [] : [];
    const para = (t) => t.split(/\n{2,}|\n/).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join('');
    return `<div class="row between"><button class="btn ghost" data-act="leaveScene">← Leave</button><div class="muted small">${esc(sc.place)} · ${U.clockStr(S.clock)}</div><button class="btn sm danger" data-act="endScene" data-id="${n.id}">End scene</button></div>
      <div class="card scenehead" data-act="profile" data-id="${n.id}">${UI.avatar(n, 48)}<div class="grow"><b>${esc(n.name)}</b> ${UI.chip(n.status, n)}<div class="muted small">mood: ${esc(n.mood || '—')}</div></div>
        <div class="mini-meters"><span>💚 ${n.aff}</span><span>💘 ${n.rom}</span><span>🤝 ${n.trust}</span></div></div>
      ${sc.summary ? `<div class="sumbox small">🧠 Earlier scenes: ${esc(sc.summary)}</div>` : ''}
      <div class="storylog" id="storylog">${sc.log.map((e) => (e.role === 'dir' ? `<div class="you dir">🎬 ${esc(e.text)}</div>` : e.role === 'me' ? `<div class="you">${esc(e.text)}</div>` : `<div class="narr">${e.img ? UI.mediaImg(e.img, e.imgl, 'scene-photo', false, 1080) : ''}${para(e.text)}</div>`)).join('') || '<div class="empty">The scene is empty…</div>'}</div>
      ${opts.length ? `<div class="row wrap" style="margin:8px 0">${opts.map((o) => `<button class="pill" data-act="sceneOpt" data-t="${esc(o)}">${esc(o)}</button>`).join('')}</div>` : ''}
      <div class="chatinput"><textarea id="scenebox" data-bind="sceneDraft" rows="2" maxlength="500" placeholder="What do you say or do? (or just let it flow)"></textarea>
        <div class="col"><button class="btn primary" data-act="sceneSend" data-id="${n.id}">Send</button><button class="btn sm" data-act="sceneFlow" data-id="${n.id}">▶ Flow</button><button class="btn sm" data-act="sceneDirect" data-id="${n.id}" title="Direct the story: say what happens next">🎬 Direct</button></div></div>`;
  };

  /* ---------- live stream ---------- */

  UI.liveModal = () => {
    UI.modal(`<button class="close" data-act="closeModal">✕</button><h3>🔴 Go live</h3>
      <p class="small muted">Stream to your followers. Chat floods in, donations arrive, and cast members may show up.</p>
      <label>What's the stream?</label><input id="livetitle" maxlength="100" placeholder="Q&A, gaming, cooking disaster, spill the tea…">
      <label>Length</label><select id="livelen"><option value="15">15 minutes</option><option value="30" selected>30 minutes</option><option value="60">1 hour</option><option value="120">2 hours</option></select>
      <div class="row between" style="margin-top:14px"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" data-act="startLive">🔴 Go live</button></div>`);
  };

  UI.liveRecap = () => {
    const l = G.S.lastLive;
    if (!l) return;
    UI.modal(`<button class="close" data-act="closeModal">✕</button><h3>🔴 Stream recap</h3>
      <div class="grid2"><div class="card mini"><div class="muted small">Peak viewers</div><div class="bigstat">${U.fmt(l.peak)}</div></div><div class="card mini"><div class="muted small">Earned</div><div class="bigstat">$${U.fmt(l.total)}</div></div></div>
      ${l.moment ? `<div class="secret">🎬 <b>Clip-worthy moment:</b> ${esc(l.moment)}</div>` : ''}
      ${l.donations.length ? `<h4 class="sect">Donations</h4>${l.donations.map((d) => `<div class="small tl">💸 <b>${esc(d.name)}</b> $${U.fmt(d.amount)} <span class="muted">${esc(d.msg)}</span></div>`).join('')}` : ''}
      <h4 class="sect">Chat highlights</h4><div class="livechat">${l.chat.map((c) => `<div class="small"><b>${esc(c.name)}</b> ${esc(c.text)}</div>`).join('')}</div>`);
  };

  /* ---------- groups ---------- */

  UI.groupModal = () => {
    const people = Object.values(G.S.npcs).filter((n) => !n.blocked).sort((a, b) => a.name.localeCompare(b.name));
    UI.modal(`<button class="close" data-act="closeModal">✕</button><h3>👥 New group chat</h3>
      <label>Name</label><input id="groupname" maxlength="40" placeholder="the girlies, squad, enemies club…">
      <label>Members (pick 2 or more)</label>
      <div class="pickgrid">${people.map((n) => `<label class="pick"><input type="checkbox" class="gmember" value="${n.id}"> ${esc(n.emoji)} ${esc(n.name)} <span class="muted small">${UI.statusMeta(n.status, n).emoji}</span></label>`).join('')}</div>
      <div class="row between" style="margin-top:14px"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" data-act="makeGroup">Create</button></div>`);
  };

  UI.groupSettings = (gid) => {
    const S = G.S;
    const g = S.groups[gid];
    if (!g) return;
    const addable = Object.values(S.npcs).filter((n) => !n.blocked && !g.members.includes(n.id));
    UI.modal(`<button class="close" data-act="closeModal">✕</button><h3>⚙️ ${esc(g.name)}</h3>
      <label>Rename</label><div class="row"><input id="grename" value="${esc(g.name)}" maxlength="40"><button class="btn" data-act="renameGroup" data-id="${gid}">Save</button></div>
      <label>Members</label><div class="row wrap">${g.members.map((id) => `<span class="pchip" data-act="profile" data-id="${id}">${esc((S.npcs[id] || {}).emoji || '')} ${esc((S.npcs[id] || {}).name || id)}</span>`).join('')}</div>
      ${addable.length ? `<label>Add someone</label><div class="row"><select id="gradd">${addable.map((n) => `<option value="${n.id}">${esc(n.name)}</option>`).join('')}</select><button class="btn" data-act="addToGroup" data-id="${gid}">Add</button></div>` : ''}
      ${g.summary ? `<div class="sumbox small" style="margin-top:10px">🧠 ${esc(g.summary)}</div>` : ''}
      <div class="row wrap" style="margin-top:14px"><button class="btn" data-act="muteGroup" data-id="${gid}">${g.muted ? '🔔 Unmute' : '🔕 Mute'}</button><button class="btn danger" data-act="deleteGroup" data-id="${gid}">🗑 Delete chat</button></div>`);
  };

  /* ---------- create a character ---------- */

  UI.charModal = (f = {}) => {
    const v = (k, d = '') => esc(f[k] ?? d);
    UI.modal(`<button class="close" data-act="closeModal">✕</button><h3>➕ Create a character</h3>
      <label>Describe them and let the AI fill the form <span class="muted small">(optional)</span></label>
      <div class="row"><input id="charidea" maxlength="200" placeholder="a bitter ex-pop-star turned gossip podcaster…" value="${v('idea')}"><button class="btn" data-act="genChar">✨ Generate</button></div>
      <div class="grid2"><div><label>Name</label><input id="cname" value="${v('name')}"></div><div><label>Handle</label><input id="chandle" value="${v('handle')}" placeholder="@name"></div></div>
      <div class="grid2"><div><label>Age (18+)</label><input id="cage" type="number" min="18" max="99" value="${v('age', '25')}"></div><div><label>Emoji</label><input id="cemoji" maxlength="4" value="${v('emoji', '🙂')}"></div></div>
      <div class="grid2"><div><label>Role</label><select id="crole">${['love_interest', 'friend', 'rival', 'mentor', 'influencer', 'journalist', 'troll', 'wildcard', 'brand'].map((r) => `<option ${f.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        <div><label>Followers</label><input id="cfollowers" type="number" min="5" value="${v('followers', '2000')}"></div></div>
      <label>Bio</label><input id="cbio" maxlength="120" value="${v('bio')}">
      <label>Personality &amp; how they type</label><textarea id="cpers" rows="2" maxlength="240">${v('personality')}</textarea>
      <label>Secret</label><input id="csecret" maxlength="160" value="${v('secret')}">
      <label>Starting relationship with you</label><select id="crel">${E.REL_PRESETS.map((r) => `<option value="${r}">${esc(r.replace('_', ' '))}</option>`).join('')}</select>
      <label class="check"><input type="checkbox" id="cannounce" checked> Let the world react to their arrival</label>
      <div class="row between" style="margin-top:14px"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" data-act="saveChar">Create</button></div>`);
  };

  /* ---------- self-test report ---------- */

  UI.selftestModal = (rows, done) => {
    const ic = { pass: '✅', warn: '⚠️', fail: '❌', running: '⏳' };
    const cost = rows.reduce((a, r) => a + (r.cost || 0), 0);
    const fails = rows.filter((r) => r.status === 'fail').length;
    const warns = rows.filter((r) => r.status === 'warn').length;
    UI.modal(`${done ? '<button class="close" data-act="closeModal">✕</button>' : ''}<h3>🧪 Live self-test</h3>
      <p class="small muted">Model: <b>${esc(G.settings.model)}</b></p>
      <div class="sttable">${rows.map((r) => `<div class="strow ${r.status}"><span>${ic[r.status]}</span><div class="grow"><b>${esc(r.name)}</b><div class="small muted">${esc(r.detail || '')}</div></div><span class="small muted">${r.ms ? (r.ms / 1000).toFixed(1) + 's' : ''}</span></div>`).join('')}</div>
      ${done ? `<p style="margin-top:12px"><b>${fails ? `❌ ${fails} failed` : '✅ All features work'}</b>${warns ? ` · ⚠️ ${warns} warning(s)` : ''} · cost ${U.money(cost)}</p>` : '<p class="muted small">Running… keep this tab open.</p>'}`);
  };
})(window.G);

