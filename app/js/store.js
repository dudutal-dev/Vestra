/* ============================================================
   VESTRA · Store
   IndexedDB for items + looks · localStorage for profile/settings.
   Everything stays on the device. There is no server.
   ============================================================ */

const DB_NAME = 'vestra';
const DB_VER  = 2;
let _db = null;

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('items')) {
        const s = db.createObjectStore('items', { keyPath: 'id' });
        s.createIndex('category', 'category');
        s.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('looks')) {
        const s = db.createObjectStore('looks', { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('closets')) {
        db.createObjectStore('closets', { keyPath: 'id' });
      }
      // v2 — the owner's own face / body photos plus their analyses.
      // Keyed by a fixed slot ('face' | 'body') so there is exactly one of each.
      if (!db.objectStoreNames.contains('media')) {
        db.createObjectStore('media', { keyPath: 'slot' });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror   = () => reject(req.error);
  });
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    try { out = fn(s); } catch (e) { reject(e); return; }
    // Unwrap the request, including when it found nothing. Testing
    // `result !== undefined` instead resolved a miss with the IDBRequest
    // itself — a truthy object carrying none of the fields callers check,
    // which is why a face that had never been uploaded still rendered a card.
    t.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
    t.onerror    = () => reject(t.error);
    t.onabort    = () => reject(t.error);
  }));
}

/* ---------------- Items ---------------- */
export const Items = {
  all:    ()   => tx('items', 'readonly',  s => s.getAll()),
  get:    (id) => tx('items', 'readonly',  s => s.get(id)),
  put:    (it) => tx('items', 'readwrite', s => s.put(it)),
  remove: (id) => tx('items', 'readwrite', s => s.delete(id)),
  clear:  ()   => tx('items', 'readwrite', s => s.clear()),
  putMany: (arr) => tx('items', 'readwrite', s => { arr.forEach(i => s.put(i)); return arr.length; }),
};

/* ---------------- Looks ---------------- */
export const Looks = {
  all:    ()   => tx('looks', 'readonly',  s => s.getAll()),
  put:    (lk) => tx('looks', 'readwrite', s => s.put(lk)),
  remove: (id) => tx('looks', 'readwrite', s => s.delete(id)),
  clear:  ()   => tx('looks', 'readwrite', s => s.clear()),
};

/* ---------------- Closet analyses ---------------- */
export const Closets = {
  all:   ()   => tx('closets', 'readonly',  s => s.getAll()),
  put:   (c)  => tx('closets', 'readwrite', s => s.put(c)),
  clear: ()   => tx('closets', 'readwrite', s => s.clear()),
};

/* ---------------- The owner's face / body photos ---------------- */
export const Media = {
  get:    (slot) => tx('media', 'readonly',  s => s.get(slot)),
  all:    ()     => tx('media', 'readonly',  s => s.getAll()),
  put:    (rec)  => tx('media', 'readwrite', s => s.put(rec)),
  remove: (slot) => tx('media', 'readwrite', s => s.delete(slot)),
  clear:  ()     => tx('media', 'readwrite', s => s.clear()),
};

/* ---------------- Profile ---------------- */
const PROFILE_KEY = 'vestra.profile';
export const DEFAULT_PROFILE = {
  name: '',
  gender_presentation: 'women',
  age: 30,
  height_cm: 170,
  body_shape: '',
  skin_undertone: 'neutral',
  skin_depth: 'medium',
  color_season: '',
  hair_color: '',
  eye_color: '',
  style_archetypes: ['classic'],
  modesty_level: 'none',
  climate: 'hot-dry',
  no_go: '',
};

export function getProfile() {
  try {
    return { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') };
  } catch { return { ...DEFAULT_PROFILE }; }
}
export function setProfile(p) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
}
export function profileComplete() {
  const p = getProfile();
  return Boolean(p.body_shape && p.age);
}

/* ---------------- Settings ---------------- */
export const Settings = {
  get apiKey()  { return localStorage.getItem('vestra.key') || ''; },
  set apiKey(v) { v ? localStorage.setItem('vestra.key', v) : localStorage.removeItem('vestra.key'); },
  get model()   { return localStorage.getItem('vestra.model') || 'claude-opus-5'; },
  set model(v)  { localStorage.setItem('vestra.model', v); },
  get googleKey()  { return localStorage.getItem('vestra.gkey') || ''; },
  set googleKey(v) { v ? localStorage.setItem('vestra.gkey', v) : localStorage.removeItem('vestra.gkey'); },
  // gemini-2.5-flash-image retires Oct 2026; a stored override outlives it.
  get imageModel()  { return localStorage.getItem('vestra.gmodel') || 'gemini-2.5-flash-image'; },
  set imageModel(v) { v ? localStorage.setItem('vestra.gmodel', v) : localStorage.removeItem('vestra.gmodel'); },
  get theme()   { return localStorage.getItem('vestra.theme') || 'light'; },
  set theme(v)  { localStorage.setItem('vestra.theme', v); document.documentElement.dataset.theme = v; },
  get seen()    { return localStorage.getItem('vestra.seen') === '1'; },
  set seen(v)   { localStorage.setItem('vestra.seen', v ? '1' : '0'); },
  get lastBackup()  { return localStorage.getItem('vestra.lastBackup') || ''; },
  set lastBackup(v) { localStorage.setItem('vestra.lastBackup', String(v)); },
};

export const hasKey = () => Settings.apiKey.trim().length > 10;
export const hasGoogleKey = () => Settings.googleKey.trim().length > 10;

/* ---------------- IDs ---------------- */
let _seq = 0;
export const newId = (p = 'itm') =>
  `${p}_${Date.now().toString(36)}${(_seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/* ---------------- Export / import ---------------- */
/**
 * Face and body photos are deliberately left out of the export by default —
 * a wardrobe backup shouldn't quietly carry pictures of the owner around.
 */
export async function exportAll({ includePhotos = false } = {}) {
  const [items, looks, closets] = await Promise.all([Items.all(), Looks.all(), Closets.all()]);
  const out = {
    app: 'VESTRA', version: 2,
    exportedAt: new Date().toISOString(),
    profile: getProfile(),
    items, looks, closets,
  };
  if (includePhotos) out.media = await Media.all();
  return out;
}

export async function importAll(data) {
  if (!data || data.app !== 'VESTRA') throw new Error('bad_file');
  if (Array.isArray(data.items) && data.items.length) await Items.putMany(data.items);
  if (Array.isArray(data.looks)) for (const l of data.looks) await Looks.put(l);
  if (Array.isArray(data.closets)) for (const c of data.closets) await Closets.put(c);
  if (Array.isArray(data.media)) for (const m of data.media) await Media.put(m);
  if (data.profile) setProfile({ ...DEFAULT_PROFILE, ...data.profile });
  return (data.items || []).length;
}

export async function wipeAll() {
  await Promise.all([Items.clear(), Looks.clear(), Closets.clear(), Media.clear()]);
  localStorage.removeItem(PROFILE_KEY);
}

/* ---------------- Derived stats ---------------- */
export function statsFor(items) {
  const byCat = {}, byFormality = {}, byColor = {}, bySeason = {};
  for (const it of items) {
    byCat[it.category] = (byCat[it.category] || 0) + 1;
    const f = it.formality || 2;
    byFormality[f] = (byFormality[f] || 0) + 1;
    const cname = it.color_primary?.name_en || it.color_primary?.name_he || '—';
    byColor[cname] = (byColor[cname] || 0) + 1;
    (it.season || []).forEach(s => { bySeason[s] = (bySeason[s] || 0) + 1; });
  }
  return { total: items.length, byCat, byFormality, byColor, bySeason };
}

/**
 * Closet health score, 0-100.
 * Rewards breadth of category, formality and season coverage;
 * penalizes a single color dominating the wardrobe.
 */
export function closetScore(items) {
  if (!items.length) return 0;
  const s = statsFor(items);
  const catSpread = Math.min(Object.keys(s.byCat).length / 8, 1) * 30;
  const fmtSpread = Math.min(Object.keys(s.byFormality).length / 5, 1) * 25;
  const seaSpread = Math.min(Object.keys(s.bySeason).length / 4, 1) * 15;
  const size      = Math.min(items.length / 45, 1) * 20;
  const topColor  = Math.max(0, ...Object.values(s.byColor));
  const colorPen  = topColor / items.length > 0.35 ? 0 : 10;
  return Math.round(catSpread + fmtSpread + seaSpread + size + colorPen);
}
