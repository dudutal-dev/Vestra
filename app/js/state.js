/* ============================================================
   VESTRA · Shared app state + tiny event bus
   ============================================================ */

import { Items, Looks, Closets, Media, getProfile } from './store.js';

export const state = {
  view: 'home',
  items: [],
  looks: [],
  closets: [],
  profile: getProfile(),

  // wardrobe view
  filter: 'all',
  query: '',

  // studio
  request: { occasion: '', time: 'evening', weather: 'hot', mood: '', notes: '' },
  lastLook: null,
  pairResult: null,
  anchorId: null,

  // capture
  captureMode: 'item',
  shot: null,

  // beauty
  beauty: null,

  // the owner's own photos + their analyses
  face: null,
  body: null,
};

/* ---------------- Event bus ---------------- */
const listeners = new Map();

export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => listeners.get(evt).delete(fn);
}

export function emit(evt, payload) {
  listeners.get(evt)?.forEach(fn => fn(payload));
  listeners.get('*')?.forEach(fn => fn(evt, payload));
}

/* ---------------- Loaders ---------------- */
export async function refreshItems() {
  const all = await Items.all();
  state.items = all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  emit('items');
  return state.items;
}

export async function refreshLooks() {
  const all = await Looks.all();
  state.looks = all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  emit('looks');
  return state.looks;
}

export async function refreshClosets() {
  const all = await Closets.all();
  state.closets = all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  emit('closets');
  return state.closets;
}

export async function refreshMedia() {
  const [face, body] = await Promise.all([Media.get('face'), Media.get('body')]);
  state.face = face || null;
  state.body = body || null;
  emit('media');
}

export async function refreshAll() {
  state.profile = getProfile();
  await Promise.all([refreshItems(), refreshLooks(), refreshClosets(), refreshMedia()]);
}

export const itemById = (id) => state.items.find(i => i.id === id);
