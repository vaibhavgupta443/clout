/* Clout — social graph intelligence, powered by graphology (MIT, vendored):
   PageRank  -> who has social STATUS / influence
   Louvain   -> friend CIRCLES (people mostly interact inside their circle; they take sides along circle lines)
   shortest path -> how GOSSIP travels from person to person. */
(function (G) {
  const U = G.U;
  const Social = (G.Social = { cache: null, lastAt: -1e9 });

  const EDGE_W = { dating: 3, partner: 3, best_friend: 3, friend: 2, family: 2, ally: 1.5, crush: 1.5, situationship: 1.5, frenemy: 1, ex: 1, rival: 0.8, enemy: 0.8 };
  const lib = () => window.graphologyLibrary;
  const GraphCtor = () => (window.graphology && (window.graphology.Graph || window.graphology)) || null;

  // undirected weighted graph of the cast + the player ('me')
  Social.build = function (S = G.S, o = {}) {
    const Graph = GraphCtor();
    if (!Graph) return null;
    const withMe = o.me !== false;
    const g = new Graph({ type: 'undirected', multi: false, allowSelfLoops: false });
    if (withMe) g.addNode('me');
    Object.values(S.npcs).forEach((n) => !n.blocked && g.addNode(n.id));
    const add = (a, b, w) => {
      if (a === b || !g.hasNode(a) || !g.hasNode(b) || !(w > 0)) return;
      if (g.hasEdge(a, b)) g.setEdgeAttribute(a, b, 'weight', Math.min(6, g.getEdgeAttribute(a, b, 'weight') + w));
      else g.addEdge(a, b, { weight: w });
    };
    S.npcRel.forEach((e) => add(e.a, e.b, EDGE_W[e.type] || 1));
    Object.values(S.npcs).forEach((n) => {
      if (n.blocked) return;
      const w = Math.max(0, n.aff) / 50 + n.rom / 80 + (S.player.following.includes(n.id) ? 0.5 : 0) + (['friend', 'close_friend', 'best_friend', 'dating', 'partner'].includes(n.status) || G.Engine.isFamily(n) ? 1 : 0);
      if (withMe) add('me', n.id, w > 0.3 ? w : 0);
      const p = n.psy;
      if (p && p.following) p.following.forEach((id) => add(n.id, id, 0.4));
    });
    // recent interactions (comments/replies/likes between NPCs) strengthen ties
    const ties = (S.sim && S.sim.ties) || {};
    Object.keys(ties).forEach((k) => {
      const [a, b] = k.split('|');
      add(a, b, Math.min(1, ties[k] * 0.05));
    });
    return g;
  };

  // recompute circles + status; stores npc.psy.circle (0..k) and npc.psy.status (0..1). Cheap enough to run every few game hours.
  Social.analyze = function (S = G.S, rnd = Math.random) {
    const L = lib();
    // circles and status are measured among the CAST (the player would otherwise be a hub that glues every circle together)
    const g = Social.build(S, { me: false });
    if (!g || !L || g.order < 3) return null;
    let comm = {};
    let pr = {};
    try {
      comm = g.size ? L.communitiesLouvain(g, { rng: rnd, getEdgeWeight: 'weight' }) : {};
      pr = g.size ? L.metrics.centrality.pagerank(g, { getEdgeWeight: 'weight' }) : {};
    } catch (e) {
      return null;
    }
    const max = Math.max(1e-9, ...Object.values(pr));
    const sizes = {};
    Object.values(comm).forEach((c) => (sizes[c] = (sizes[c] || 0) + 1));
    Object.values(S.npcs).forEach((n) => {
      const p = G.Persona.ensure(n);
      p.circle = comm[n.id] != null ? comm[n.id] : -1;
      p.status = Math.round(((pr[n.id] || 0) / max) * 100) / 100; // 0 for people with no connections yet
      p.circleSize = sizes[p.circle] || 1;
    });
    S.sim = S.sim || {};
    // the player's own circle = where their strongest ties are
    const votes = {};
    Object.values(S.npcs).forEach((n) => {
      if (n.blocked || comm[n.id] == null) return;
      votes[comm[n.id]] = (votes[comm[n.id]] || 0) + Math.max(0, n.aff) / 50 + n.rom / 80;
    });
    comm.me = Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0];
    S.sim.circles = comm;
    S.sim.meCircle = comm.me;
    S.sim.status = Object.assign({}, ...Object.entries(pr).map(([k, v]) => ({ [k]: Math.round(((v || 0) / max) * 100) / 100 })));
    Social.cache = g;
    Social.cacheS = S;
    Social.lastAt = S.clock;
    return { communities: new Set(Object.values(comm)).size, graph: g };
  };

  // route a piece of gossip would take (list of ids) or null
  const cached = (S) => {
    if (Social.cacheS !== S) Social.cache = null; // a different world: drop the old graph
    return Social.cache || Social.build(S, { me: false });
  };
  Social.path = function (S, from, to) {
    const L = lib();
    const g = cached(S);
    if (!g || !L || !g.hasNode(from) || !g.hasNode(to)) return null;
    try {
      return L.shortestPath.bidirectional(g, from, to);
    } catch (e) {
      return null;
    }
  };
  // who is close to `id`. With a rumour `r` as 3rd argument, the people the rumour is about (or names) are left out: nobody is told a rumour about THEMSELVES
  // as news ("heard privately from X: <rumour about me>"). World.spreadRumors should pass it (one-word hook in world.js).
  Social.neighbors = (S, id, r) => {
    const g = cached(S);
    const ids = g && g.hasNode(id) ? g.neighbors(id) : [];
    if (!r) return ids;
    const subj = G.Channels && G.Channels.rumorPeople ? G.Channels.rumorPeople(r) : [r.about];
    return ids.filter((x) => !subj.includes(x));
  };
  Social.sameCircle = (a, b) => !!(a && b && a.psy && b.psy && a.psy.circle != null && a.psy.circle >= 0 && a.psy.circle === b.psy.circle);
})(window.G);
