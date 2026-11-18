/*
 * FormatReader service worker: makes the site work offline.
 *
 * It only ever stores and serves FormatReader's OWN code (the files listed
 * below, from this site). It never sees the files people open: those are
 * read straight from their disk by the page and are never requested over the
 * network, so they cannot pass through here.
 *
 * Generated at build time by vite.config.ts (offlinePlugin); edit
 * scripts/sw-template.js, not dist/sw.js.
 */
const VERSION = '__VERSION__';
/** Every file of this build (hashed names: a file's content never changes). */
const FILES = __FILES__;
/** Needed to start the app; cached at install. */
const CORE = __CORE__;
/** Viewer id → files it needs offline: `base` for its common types, `all` for every type. */
const VIEWERS = __VIEWERS__;
/** Download size of everything (compressed), for "make everything available offline". */
const TOTAL_BYTES = __TOTAL_BYTES__;
const CACHE = `formatreader-${VERSION}`;
const scope = self.registration.scope;
const url = (path) => new URL(path, scope).href;
const KNOWN = new Set(FILES.map(url));
const PAGE = url('index.html');
/** What this visitor keeps offline ({ all, viewers }), carried over to each new version. */
const STATE = url('__offline-state');

async function readState(cache) {
  try {
    return (await (await cache.match(STATE))?.json()) ?? { all: false, viewers: [] };
  } catch {
    return { all: false, viewers: [] };
  }
}

async function writeState(cache, state) {
  await cache.put(STATE, new Response(JSON.stringify(state), { headers: { 'content-type': 'application/json' } }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(CORE.map(url));
      // Keep viewers already downloaded by the previous version when their file is unchanged.
      for (const name of await caches.keys()) {
        if (name === CACHE || !name.startsWith('formatreader-')) continue;
        const old = await caches.open(name);
        // Keep the visitor's choice (e.g. "everything offline") for the new version.
        const prev = await readState(old);
        const mine = await readState(cache);
        await writeState(cache, { all: mine.all || prev.all, viewers: [...new Set([...mine.viewers, ...prev.viewers])] });
        for (const req of await old.keys()) {
          if (!KNOWN.has(req.url) || req.url === PAGE || req.url === STATE) continue;
          if (!(await cache.match(req))) {
            const res = await old.match(req);
            if (res) await cache.put(req, res);
          }
        }
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name !== CACHE && name.startsWith('formatreader-')) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(scope)) return; // only this site's own files

  // The page: the network when online (to get updates), the stored copy when not.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        // The app is the site root (or index.html); other pages (formats.html) are kept under their own name.
        const path = req.url.split(/[?#]/)[0];
        const key = path === scope || path === PAGE ? PAGE : KNOWN.has(path) ? path : null;
        try {
          const res = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 4000))]);
          if (res.ok && key) await cache.put(key, res.clone());
          return res;
        } catch {
          return (key && (await cache.match(key))) ?? (await cache.match(PAGE)) ?? Response.error();
        }
      })(),
    );
    return;
  }

  // The app's code: stored copy first (it never changes under the same name), then the network.
  const clean = req.url.split(/[?#]/)[0];
  if (!KNOWN.has(clean)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(clean);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) await cache.put(clean, res.clone());
      return res;
    })(),
  );
});

async function isStored(cache, files) {
  for (const f of files) if (!(await cache.match(url(f)))) return false;
  return true;
}

async function store(cache, hrefs) {
  for (const href of hrefs) {
    if (await cache.match(href)) continue;
    try {
      const res = await fetch(href);
      if (res.ok) await cache.put(href, res);
    } catch {
      return false; // offline again: try next time
    }
  }
  return true;
}

// Messages from the page. Replies go back on the port it sends, if any.
//  'status'              → which viewers work offline right now
//  'cache-all'           → store everything (button, or installed as an app)
//  { cache: [urls] }     → store files the page loaded before this worker started
// Only files of this build are ever stored.
self.addEventListener('message', (event) => {
  const data = event.data;
  const port = event.ports?.[0];
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      if (data === 'status') {
        const ready = {};
        for (const [id, { base, all }] of Object.entries(VIEWERS))
          ready[id] = (await isStored(cache, all)) ? 'full' : (await isStored(cache, base)) ? 'partly' : 'none';
        // Remember which readers this visitor has, so a new version can bring them back.
        const state = await readState(cache);
        const have = Object.keys(ready).filter((id) => ready[id] !== 'none');
        await writeState(cache, { all: state.all, viewers: [...new Set([...state.viewers, ...have])] });
        port?.postMessage({ core: await isStored(cache, CORE), ready, totalBytes: TOTAL_BYTES });
        return;
      }
      if (data === 'cache-all') {
        await writeState(cache, { ...(await readState(cache)), all: true });
        const ok = await store(cache, [...KNOWN]);
        port?.postMessage({ done: ok });
        return;
      }
      if (data === 'resume') {
        // After an update: download again what this visitor kept offline before (changed files only).
        const state = await readState(cache);
        const want = state.all ? [...KNOWN] : state.viewers.flatMap((id) => VIEWERS[id]?.base ?? []).map(url);
        const missing = [];
        for (const href of want) if (!(await cache.match(href))) missing.push(href);
        if (missing.length) await store(cache, missing);
        port?.postMessage({ restored: missing.length });
        return;
      }
      if (Array.isArray(data?.cache)) await store(cache, data.cache.map((u) => String(u).split(/[?#]/)[0]).filter((u) => KNOWN.has(u)));
    })(),
  );
});
