/* Clout — tiny promise wrapper around IndexedDB (a free, local, large browser database).
   Object stores: saves (id -> JSON text), backups ("id|timestamp" -> JSON text), meta (key -> value). */
(function (G) {
  /* G.lazy('graphology', 'chrono', 'compromise') -> Promise<boolean>: loads a heavy vendor library AFTER the first screen is drawn (script injection,
     cached per name, never rejects: false = unavailable). Everything that uses the libraries (dialogue.js, social.js) already works without them.
     G.lazy.all() loads the three of them when the browser is idle. If a library is already on the page (tests, development) nothing is fetched. */
  const LAZY = {
    graphology: { have: () => !!(window.graphology && window.graphologyLibrary), files: ['vendor/graphology.umd.min.js', 'vendor/graphology-library.min.js'] },
    chrono: { have: () => !!window.Chrono, files: ['vendor/chrono.min.js'] },
    compromise: { have: () => typeof window.nlp === 'function', files: ['vendor/compromise.min.js'] },
  };
  const loading = {};
  const inject = (src) =>
    new Promise((resolve) => {
      try {
        const s = document.createElement('script');
        s.src = src;
        s.async = false;
        s.onload = () => resolve(true);
        s.onerror = () => { s.remove(); resolve(false); };
        document.head.appendChild(s);
      } catch (e) {
        resolve(false);
      }
    });
  G.lazy = function () {
    return Promise.all(
      Array.prototype.map.call(arguments, (name) => {
        const L = LAZY[name];
        if (!L) return Promise.resolve(false);
        if (L.have()) return Promise.resolve(true);
        if (!loading[name]) {
          loading[name] = (async () => {
            for (const f of L.files) if (!(await inject(f))) { loading[name] = null; return false; } // (a failed load can be tried again later)
            return L.have();
          })();
        }
        return loading[name];
      })
    ).then((r) => r.every(Boolean));
  };
  G.lazy.all = function () {
    const had = !!window.graphology;
    return G.lazy('graphology', 'chrono', 'compromise').then((ok) => {
      // circles were skipped while graphology was missing: let the next beat work them out
      try { if (!had && window.graphology && G.S && G.S.sim && typeof G.S.sim.lastSocial === 'number') G.S.sim.lastSocial = -1e9; } catch (e) {}
      return ok;
    });
  };
  const DB = (G.DB = { ok: false, name: 'clout_db', version: 1, stores: ['saves', 'backups', 'meta'] });
  let conn = null;
  let opening = null;

  DB.open = () =>
    new Promise((resolve) => {
      const f = typeof indexedDB !== 'undefined' ? indexedDB : null;
      if (!f) return resolve(false);
      let settled = false;
      const done = (v) => {
        if (!settled) {
          settled = true;
          resolve(v);
        }
      };
      try {
        const req = f.open(DB.name, DB.version);
        req.onupgradeneeded = () => {
          const d = req.result;
          DB.stores.forEach((s) => {
            if (!d.objectStoreNames.contains(s)) d.createObjectStore(s);
          });
        };
        req.onsuccess = () => {
          conn = req.result;
          // a phone drops the connection when the browser is put in the background: forget it so the next call opens a fresh one
          conn.onversionchange = () => { try { conn.close(); } catch (e) {} conn = null; DB.ok = false; };
          conn.onclose = () => { conn = null; DB.ok = false; };
          DB.ok = true;
          done(true);
        };
        req.onerror = () => done(false);
        req.onblocked = () => {}; // another tab holds an old version: wait for it (the timer below is the limit)
        setTimeout(() => done(false), 12000); // a cold start on a phone can be slow; never hang the app for ever
      } catch (e) {
        done(false);
      }
    });

  // a fresh connection (after the phone killed the old one)
  DB.reopen = () => {
    try { if (conn) conn.close(); } catch (e) {}
    conn = null;
    DB.ok = false;
    if (!opening) opening = DB.open().then((ok) => { opening = null; return ok; });
    return opening;
  };
  const dead = (e) => !!e && /InvalidState|closing|closed|lost|UnknownError|not open/i.test(String(e.name) + ' ' + String(e.message));
  DB._kill = () => { conn = { transaction() { throw Object.assign(new Error('The database connection is closing.'), { name: 'InvalidStateError' }); }, close() {} }; }; // (test helper: what an iPhone does to a backgrounded page)
  const run = (store, mode, fn) =>
    new Promise((resolve, reject) => {
      if (!conn) return reject(new Error('database not open'));
      let out;
      try {
        const t = conn.transaction(store, mode);
        out = fn(t.objectStore(store));
        t.oncomplete = () => resolve(out && out.result);
        t.onerror = () => reject(t.error || new Error('transaction failed'));
        t.onabort = () => reject(t.error || new Error('transaction aborted'));
      } catch (e) {
        reject(e);
      }
    });
  const tx = async (store, mode, fn) => {
    if (!conn) await DB.reopen();
    try {
      return await run(store, mode, fn);
    } catch (e) {
      if (!dead(e)) throw e;
      await DB.reopen();
      return run(store, mode, fn);
    }
  };

  DB.get = (s, k) => tx(s, 'readonly', (st) => st.get(k));
  DB.put = (s, k, v) => tx(s, 'readwrite', (st) => st.put(v, k));
  DB.del = (s, k) => tx(s, 'readwrite', (st) => st.delete(k));
  DB.clear = (s) => tx(s, 'readwrite', (st) => st.clear());
  DB.keys = (s) => tx(s, 'readonly', (st) => st.getAllKeys());
  const allOnce = (s) =>
    new Promise((resolve, reject) => {
      if (!conn) return reject(new Error('database not open'));
      const out = {};
      try {
        const t = conn.transaction(s, 'readonly');
        const c = t.objectStore(s).openCursor();
        c.onsuccess = () => {
          const cur = c.result;
          if (cur) {
            out[cur.key] = cur.value;
            cur.continue();
          }
        };
        t.oncomplete = () => resolve(out);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('aborted'));
      } catch (e) {
        reject(e);
      }
    });
  DB.close = () => {
    if (conn) conn.close();
    conn = null;
    DB.ok = false;
  };
  DB.all = async (s) => {
    if (!conn) await DB.reopen();
    try {
      return await allOnce(s);
    } catch (e) {
      if (!dead(e)) throw e;
      await DB.reopen();
      return allOnce(s);
    }
  };
})(window.G);
