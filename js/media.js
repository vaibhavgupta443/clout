/* Clout — your local photo library (everyday photos only).
   You drop images into the media/ folder (never uploaded anywhere; served read-only on localhost).
   Folder names and file names become tags; a folder's tags.json can add more. Clout then picks photos for posts,
   stories and profile faces by matching a character's look + the topic + the mood. Nothing here generates images.

   Folder convention (all optional):
     media/<topic>/…                    everyday life (food, travel, gym, pets, city, nature…)
     media/people/<person>/…            the same person across photos (consistent identity for one character)
     media/<anything>/tags.json         {"_all":["blonde"],"file.jpg":["pool","selfie"]}
   Safety filter: any file whose path or tags contain a word from BLOCKED below is never indexed, so it can never be shown. */
(function (G) {
  const U = G.U;
  const Media = (G.Media = { ready: false, count: 0, items: [], error: '', source: 'none', byLevel: [0, 0, 0, 0], people: 0 });

  const BLOCKED = new Set(['mature', 'sexy', 'lingerie', 'suggestive', 'swimwear', 'bikini', 'boudoir', 'topless', 'explicit', 'nsfw', 'nude', 'adult', 'naked', 'hardcore', 'xxx', 'porn', 'unfiltered', 'extreme']);
  const POOL_WORDS = new Set(['food', 'travel', 'gym', 'fitness', 'city', 'nature', 'pets', 'pet', 'party', 'night', 'coffee', 'beach', 'home', 'car', 'street', 'sunset', 'shopping', 'friends', 'music', 'art', 'work', 'memes', 'meme', 'drinks']);
  const SYN = {
    blond: 'blonde', blonde: 'blonde', brunette: 'brunette', brown: 'brunette', ginger: 'redhead', redhead: 'redhead', red: 'redhead', black: 'black-hair', dark: 'black-hair', pink: 'pink-hair', silver: 'silver-hair', grey: 'silver-hair',
    slim: 'slim', skinny: 'slim', petite: 'petite', athletic: 'athletic', fit: 'athletic', toned: 'athletic', curvy: 'curvy', thick: 'curvy', plus: 'plus-size', bbw: 'plus-size', muscular: 'muscular', buff: 'muscular', average: 'average',
    woman: 'woman', women: 'woman', girl: 'woman', female: 'woman', f: 'woman', man: 'man', men: 'man', guy: 'man', male: 'man', m: 'man', couple: 'couple', trans: 'trans', nonbinary: 'nonbinary', nb: 'nonbinary',
    tattoo: 'tattoos', tattoos: 'tattoos', tattooed: 'tattoos', glasses: 'glasses', freckles: 'freckles', piercing: 'piercings', piercings: 'piercings',
    selfie: 'selfie', mirror: 'mirror', portrait: 'portrait', face: 'portrait', headshot: 'portrait', bed: 'bed', bedroom: 'bed', pool: 'pool', outdoor: 'outdoors', outdoors: 'outdoors',
    gym: 'gym', workout: 'gym', yoga: 'gym', kitchen: 'food', cooking: 'food', dress: 'dress', heels: 'heels', kiss: 'kiss', kissing: 'kiss', cuddle: 'cuddle', cuddling: 'cuddle',
  };
  const NOISE = new Set(['img', 'image', 'photo', 'pic', 'picture', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'copy', 'final', 'edit', 'edited', 'new', 'the', 'and', 'of', 'a', 'in', 'on', 'set', 'media', 'people', 'persons', 'models']);
  const PERSON_ROOTS = new Set(['people', 'persons', 'models', 'creators']);
  const HAIR = ['blonde', 'brunette', 'redhead', 'black-hair', 'pink-hair', 'silver-hair'];
  const BODY = ['slim', 'petite', 'athletic', 'curvy', 'muscular', 'average', 'plus-size'];

  /* ---------- state: index kept in memory, tag -> ids inverted index ---------- */

  let paths = [];
  let lvl = [];
  let tagsOf = []; // arrays of canonical tags per image
  let personOf = []; // person/set key per image
  let isPool = [];
  let inv = new Map(); // tag -> [ids]
  let byLevel = [[], [], [], []];
  let persons = new Map(); // key -> [ids]
  const uses = new Map(); // id -> how many times shown (spread the library out)
  let pathId = new Map(); // relative path -> id (O(1) lookups while rendering)

  const tokens = (s) =>
    String(s)
      .toLowerCase()
      .replace(/\.[a-z0-9]{2,4}$/, '')
      .split(/[^a-z0-9]+/)
      .filter((t) => t && t.length > 1 && !/^\d+$/.test(t) && !NOISE.has(t));
  const canon = (t) => SYN[t] || t;

  const blockedIn = (s) => tokens(s).some((t) => BLOCKED.has(t));

  // parse one relative path (+ optional extra tags) into tags / person; blocked = never index this file
  Media.parse = function (rel, extra) {
    const segs = String(rel).split('/');
    const file = segs.pop();
    const tags = new Set();
    let person = null;
    let blocked = blockedIn(file);
    segs.forEach((seg, i) => {
      const low = seg.toLowerCase();
      if (blockedIn(seg)) blocked = true;
      if (PERSON_ROOTS.has(low) && segs[i + 1]) person = segs.slice(0, i + 2).join('/');
      tokens(seg).forEach((t) => tags.add(canon(t)));
    });
    tokens(file).forEach((t) => tags.add(canon(t)));
    (extra || []).forEach((t) => {
      const sv = String(t).toLowerCase().trim();
      if (!sv) return;
      if (blockedIn(sv)) blocked = true;
      if (sv.startsWith('person:')) person = 'x/' + sv.slice(7);
      else tokens(sv).forEach((x) => tags.add(canon(x)));
    });
    const pool = !person && segs.some((x) => POOL_WORDS.has(x.toLowerCase()));
    if (!person && !pool) person = segs.length ? segs.join('/') : '(root)';
    return { level: 0, blocked, tags: [...tags], person: pool ? null : person, pool };
  };

  Media.build = function (list) {
    paths = [];
    lvl = [];
    tagsOf = [];
    personOf = [];
    isPool = [];
    inv = new Map();
    byLevel = [[], [], [], []];
    persons = new Map();
    pathId = new Map();
    uses.clear();
    (Array.isArray(list) ? list : []).forEach((it) => {
      const rel = Array.isArray(it) ? it[0] : it;
      if (typeof rel !== 'string' || !rel || rel.includes('..')) return;
      const p = Media.parse(rel, Array.isArray(it) ? it[1] : null);
      if (p.blocked) return;
      if (pathId.has(rel)) return;
      const id = paths.length;
      pathId.set(rel, id);
      paths.push(rel);
      lvl.push(p.level);
      tagsOf.push(p.tags);
      personOf.push(p.person);
      isPool.push(p.pool);
      byLevel[p.level].push(id);
      p.tags.forEach((t) => {
        if (!inv.has(t)) inv.set(t, []);
        inv.get(t).push(id);
      });
      if (p.person) {
        if (!persons.has(p.person)) persons.set(p.person, []);
        persons.get(p.person).push(id);
      }
    });
    Media.count = paths.length;
    Media.byLevel = byLevel.map((l) => l.length);
    Media.people = persons.size;
    Media.ready = paths.length > 0;
    return Media.count;
  };

  Media.load = async function (force) {
    try {
      const res = await fetch('/api/media/index' + (force ? '?refresh=1' : ''), { cache: 'no-cache' }); // revalidated with an ETag: unchanged = a tiny 304
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      Media.build(j.items || []);
      Media.source = 'server';
      Media.thumbs = !!j.thumbs;
      Media.error = j.exists ? '' : 'No media folder yet — create a folder named "media" next to index.html and drop images in.';
      if (Media.ready && G.S) Media.seedFeedPhotos(G.S);
      return Media.count;
    } catch (e) {
      Media.build([]);
      Media.error = 'Photo library needs start.bat (the local server). ' + (e && e.message ? '(' + e.message + ')' : '');
      return 0;
    }
  };

  /* ---------- what is allowed right now ---------- */

  // this edition only ever shows everyday photos (level 0)
  Media.maxLevel = () => 0;
  Media.enabled = () => G.settings.mediaOn !== false && Media.ready;
  // a path is displayable only if it exists in the index and is within the allowed level
  Media.allowedPath = (rel, imgLevel) => {
    if (!Media.enabled() || typeof rel !== 'string' || !pathId.has(rel)) return false; // only files that really are in the index
    const L = imgLevel != null ? imgLevel : Media.levelOf(rel);
    return L <= Media.maxLevel();
  };
  Media.levelOf = (rel) => {
    const i = pathId.get(rel);
    return i != null ? lvl[i] : 3;
  };
  // safe URL (only characters that can occur in the library; each segment encoded)
  // w = a thumbnail width (160/360/720/1080) when the server can resize (sharp); otherwise the original file
  Media.url = (rel, w) => (typeof rel === 'string' && rel && !rel.includes('..') ? (w && Media.thumbs ? '/thumb/' + w + '/' : '/media/') + rel.split('/').map(encodeURIComponent).join('/') : '');

  /* ---------- a character's look (tags used for matching) ---------- */

  let R = Math.random; // set per call so a seeded world picks the same photos for the same library
  const seeded = (str) => {
    let h = U.hash(str) || 1;
    return () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296);
  };
  Media.lookFor = function (npc) {
    if (npc.media && Array.isArray(npc.media.look) && npc.media.look.length) return npc.media.look;
    const text = ((npc.bio || '') + ' ' + (npc.personality || '') + ' ' + (npc.card || '').slice(0, 600) + ' ' + (npc.tags || []).join(' ')).toLowerCase();
    const look = new Set();
    tokens(text).forEach((t) => {
      const c = SYN[t];
      if (c && (HAIR.includes(c) || BODY.includes(c) || ['tattoos', 'glasses', 'freckles', 'piercings'].includes(c))) look.add(c);
    });
    // gender from pronouns / words the card already uses
    if (/\b(she\/her|she|her|woman|girl|female|mother|queen)\b/.test(text)) look.add('woman');
    else if (/\b(he\/him|he|his|man|guy|male|father|king)\b/.test(text)) look.add('man');
    else if (/\b(they\/them|nonbinary|non-binary|enby)\b/.test(text)) look.add('nonbinary');
    const r = seeded('look' + npc.id + npc.handle);
    if (![...look].some((t) => HAIR.includes(t))) look.add(HAIR[Math.floor(r() * HAIR.length)]);
    if (![...look].some((t) => BODY.includes(t))) look.add(BODY[Math.floor(r() * BODY.length)]);
    return [...look];
  };
  Media.setLook = (npc, list) => {
    npc.media = npc.media || { used: [] };
    npc.media.look = [...new Set((Array.isArray(list) ? list : String(list).split(/[,\s]+/)).map((t) => canon(String(t).toLowerCase().trim())).filter(Boolean))].slice(0, 12);
    npc.media.person = null; // re-match
    return npc.media.look;
  };

  /* ---------- picking ---------- */

  const overlap = (a, b) => {
    let n = 0;
    for (const t of a) if (b.has(t)) n++;
    return n;
  };

  // which person in the library "is" this character (stable; one person per character where possible)
  Media.claimPerson = function (npc, S) {
    S = S || G.S || (Media._tmp = Media._tmp || {}); // works even before a world exists
    npc.media = npc.media || { used: [] };
    if (npc.media.person && persons.has(npc.media.person)) return npc.media.person;
    const max = Media.maxLevel();
    const look = new Set(Media.lookFor(npc));
    S.mediaClaims = S.mediaClaims || {};
    let best = null;
    let bestScore = -1e9;
    const r = seeded('claim' + npc.id);
    const keys = [...persons.keys()];
    if (!keys.length) return null;
    // sample at most 400 candidates so a library with thousands of sets stays fast
    const start = Math.floor(r() * keys.length);
    const step = Math.max(1, Math.floor(keys.length / 400));
    for (let k = 0, i = start; k < Math.min(keys.length, 400); k++, i = (i + step) % keys.length) {
      const key = keys[i];
      const ids = persons.get(key);
      // a person must have something showable at the current level (their level-0 photos at minimum)
      const showable = ids.filter((id) => lvl[id] <= Math.max(max, 0));
      if (!showable.length) continue;
      const tg = new Set();
      ids.slice(0, 12).forEach((id) => tagsOf[id].forEach((t) => tg.add(t)));
      const taken = S.mediaClaims[key] && S.mediaClaims[key] !== npc.id ? 1 : 0;
      const sc = overlap(look, tg) * 3 - taken * 2.5 + (ids.length > 5 ? 0.5 : 0) + r() * 0.8;
      if (sc > bestScore) {
        bestScore = sc;
        best = key;
      }
    }
    if (best) {
      npc.media.person = best;
      S.mediaClaims[best] = npc.id;
    }
    return best;
  };

  // core matcher. want: { tags:[…], level:n (preferred), person:key|null, avoid:Set(path), pool:boolean }
  Media.match = function (want) {
    // hard cap: the content level AND what this kind of picture may ever show
    const max = Math.min(Media.maxLevel(), want.cap != null ? want.cap : 3);
    const lv = Math.min(want.level != null ? want.level : max, max);
    const wt = new Set((want.tags || []).map(canon));
    const avoid = want.avoid || new Set();
    let cand = [];
    if (want.person && persons.has(want.person)) cand = persons.get(want.person);
    else {
      // union of the inverted-index lists for the wanted tags (bounded), else the whole level bucket
      const seen = new Set();
      for (const t of wt) {
        const l = inv.get(t);
        if (!l) continue;
        const stride = Math.max(1, Math.floor(l.length / 300));
        for (let i = Math.floor(R() * stride); i < l.length; i += stride) {
          const id = l[i];
          if (!seen.has(id) && lvl[id] <= max && (want.pool == null || isPool[id] === want.pool)) {
            seen.add(id);
            cand.push(id);
          }
        }
      }
      if (cand.length < 12) {
        for (let k = lv; k >= 0 && cand.length < 300; k--) {
          const b = byLevel[k];
          if (!b.length) continue;
          const stride = Math.max(1, Math.floor(b.length / 300));
          for (let i = Math.floor(R() * stride); i < b.length && cand.length < 300; i += stride) if (!seen.has(b[i]) && (want.pool == null || isPool[b[i]] === want.pool)) { seen.add(b[i]); cand.push(b[i]); }
        }
      }
    }
    let best = -1;
    let bestScore = -1e9;
    for (const id of cand) {
      if (lvl[id] > max) continue;
      const tg = tagsOf[id];
      let sc = avoid.has(paths[id]) ? -7 : 0; // recently shown: a clear penalty (more than a couple of tag matches), but a small set may still have to repeat
      for (const t of tg) if (wt.has(t)) sc += 2;
      sc -= Math.abs(lvl[id] - lv) * 4; // the level matters more than anything else
      sc -= (uses.get(id) || 0) * 0.7;
      sc += R() * 0.9;
      if (sc > bestScore) {
        bestScore = sc;
        best = id;
      }
    }
    if (best < 0) return null;
    uses.set(best, (uses.get(best) || 0) + 1);
    return { path: paths[best], level: lvl[best], tags: tagsOf[best] };
  };

  const remember = (npc, path) => {
    npc.media = npc.media || { used: [] };
    npc.media.used = (npc.media.used || []).concat(path).slice(-40);
  };

  // topics a post kind tends to show
  const KIND_TAGS = {
    selfie: ['selfie', 'portrait'], food: ['food'], fitness: ['gym'], travel: ['travel', 'beach'], pet: ['pets'], art: ['art'], night: ['night', 'party'], morning: ['bed', 'coffee'],
    romance: ['kiss', 'cuddle'], promo: ['selfie', 'portrait'], throwback: ['selfie'], win: ['party'], meme: ['memes'], motivation: ['gym', 'sunset'], vent: ['portrait'],
  };
  const PERSON_KINDS = new Set(['promo', 'selfie', 'romance', 'throwback', 'fitness', 'night', 'morning', 'vent', 'win']);
  const chance = () => Math.max(0, Math.min(100, G.settings.mediaChance != null ? G.settings.mediaChance : 70)) / 100;

  // Give older saves the same visual opening as newly-created worlds. These are topic photos
  // from the user's local library, not character portraits; keep the backfill small and stable.
  Media.seedFeedPhotos = function (S = G.S) {
    if (!S || !Media.enabled() || !G.Engine || !G.Lex) return 0;
    const recent = (S.postOrder || []).slice(-24).reverse().map((id) => S.posts[id]).filter((p) => p && !p.replyTo && p.author !== 'me' && p.author !== 'crowd' && S.npcs[p.author]);
    let have = recent.filter((p) => !!p.img).length;
    let added = 0;
    for (const p of recent) {
      if (have >= 4) break;
      if (p.img) continue;
      const npc = S.npcs[p.author];
      const topics = G.Lex.analyze(p.text || '').topics;
      const im = Media.forPost(npc, { kind: 'photo', topics, attach: true, force: true }, () => U.hash(p.id + ':' + S.id) / 4294967296);
      if (!im) continue;
      p.img = im.img;
      p.imgl = im.imgl;
      p.ptype = 'photo';
      have++;
      added++;
    }
    if (added && G.Store && G.Store.saveSoon) G.Store.saveSoon();
    return added;
  };

  // a photo for an NPC's post; null = no photo (the card then shows the generated tile)
  Media.forPost = function (npc, spec, rnd = Math.random) {
    if (!Media.enabled()) return null;
    R = rnd;
    if (!spec.force && rnd() > chance() * (spec.attach ? 1 : 0.7)) return null;
    const kind = spec.kind || 'selfie';
    const tags = (KIND_TAGS[kind] || []).concat(spec.topics || []);
    const personKind = PERSON_KINDS.has(kind);
    const person = personKind ? Media.claimPerson(npc) : null;
    if (personKind && !person) return null; // a selfie needs a person in your library; otherwise the painted tile is shown (never a random food photo)
    const want = { tags: tags.concat(Media.lookFor(npc)), level: 0, cap: 0, person, avoid: new Set((npc.media && npc.media.used) || []), pool: personKind ? null : true };
    let m = Media.match(want);
    if (!m && person) m = Media.match(Object.assign({}, want, { person: null, pool: null }));
    if (!m) return null;
    remember(npc, m.path);
    return { img: m.path, imgl: m.level };
  };

  Media.forStory = function (npc, kind, rnd = Math.random) {
    if (!Media.enabled() || rnd() > chance() * 0.8) return null;
    R = rnd;
    const personal = ['selfie', 'mood', 'night', 'couple', 'bored', 'gym'].includes(kind);
    const person = personal ? Media.claimPerson(npc) : null;
    const tag = { food: ['food'], gym: ['gym'], commute: ['city', 'street'], music: ['music'], selfie: ['selfie'], nature: ['nature'], night: ['night'], couple: ['kiss', 'cuddle'] }[kind] || [];
    const m = Media.match({ tags: tag.concat(Media.lookFor(npc)), level: 0, cap: 0, person, avoid: new Set((npc.media && npc.media.used) || []), pool: personal ? null : true }) || null;
    if (!m) return null;
    remember(npc, m.path);
    return { img: m.path, imgl: m.level };
  };

  // a face for the character: a level-0 portrait of their person
  Media.avatarFor = function (npc, S = G.S) {
    if (!Media.enabled()) return null;
    const person = Media.claimPerson(npc, S);
    if (!person) return null;
    const ids = persons.get(person).filter((id) => lvl[id] === 0);
    if (!ids.length) return null;
    const portrait = ids.filter((id) => tagsOf[id].includes('portrait') || tagsOf[id].includes('selfie'));
    const pool = portrait.length ? portrait : ids;
    return paths[pool[U.hash(npc.id) % pool.length]];
  };

  // give a character a person + a level-0 face from the library (called outside renders: hourly tick, after a rescan)
  Media.assign = function (npc, S = G.S) {
    if (!Media.enabled()) return null;
    if (npc.avImg && pathId.has(npc.avImg)) return npc.avImg;
    const a = Media.avatarFor(npc, S);
    if (a) npc.avImg = a;
    return a;
  };
  Media.assignAll = (S = G.S) => Object.values(S.npcs).forEach((n) => Media.assign(n, S));

  Media.stats = () => ({ ready: Media.ready, count: Media.count, byLevel: Media.byLevel.slice(), people: Media.people, error: Media.error, maxLevel: Media.maxLevel(), enabled: Media.enabled() });
  Media._debug = () => ({ paths, lvl, tagsOf, inv, persons });
})(window.G);
