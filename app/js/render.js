/* ============================================================
   VESTRA · Photographic render

   The canvas simulations place colour on a photograph. They cannot make
   fabric fall on a body or makeup sit on skin — that needs an image model,
   and `prompt.js` already writes the instruction one needs. This is the
   client that carries it there.

   It talks to fal.ai's queue API directly from the browser, with the owner's
   own key, the same way `ai.js` talks to Anthropic: submit, poll, collect.
   There is no VESTRA server to route it through, and adding one would mean
   every face photo in the app passing through someone else's machine.

   Reference photos go up as `data:` URIs rather than as uploaded files, so
   a face never lands in a public bucket to be fetched back out.
   ============================================================ */

import { Settings } from './store.js';
import { loadImage } from './makeup.js';

const QUEUE = 'https://queue.fal.run';

/* Gemini 3 Pro Image, through fal. Chosen over the cheaper tiers for one
   reason: this is always an edit of a photograph of a real person, and
   identity survival is the whole job. */
const MODEL = 'fal-ai/nano-banana-pro/edit';
const MAX_REFS = 4;

const POLL_MS = 1500;
const TIMEOUT_MS = 240000;

export const hasRenderKey = () => Settings.falKey.trim().length > 8;

/** Thrown with a `stage` so the UI can say what actually went wrong. */
export class RenderError extends Error {
  constructor(stage, message, status = 0) {
    super(message);
    this.stage = stage;
    this.status = status;
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const MAX_EDGE = 1280;

/**
 * Keep the request a sane size.
 *
 * Four base64 photos in one POST adds up, and the model works at 1K. A photo
 * already at or under the cap is passed through untouched rather than
 * re-encoded — the subject's face is the one thing here that cannot afford a
 * second lossy pass.
 */
async function fit(dataUrl) {
  let img;
  try { img = await loadImage(dataUrl); } catch { return dataUrl; }
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const long = Math.max(w, h);
  if (!long || long <= MAX_EDGE) return dataUrl;

  const s = MAX_EDGE / long;
  const c = document.createElement('canvas');
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.92);
}

async function call(url, { method = 'GET', body = null, key, stage }) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: 'Key ' + key,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    // fetch only rejects on a network-level failure — DNS, offline, or a
    // browser CORS refusal. The three are indistinguishable from here, and
    // the message says so rather than guessing.
    throw new RenderError('network', e?.message || 'fetch failed');
  }

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 400); } catch { /* body already gone */ }
    throw new RenderError(stage, detail || res.statusText, res.status);
  }
  return res.json();
}

/**
 * Run one edit.
 *
 * @param prompt  the instruction, from prompt.js
 * @param images  data URLs — the subject first, then the references it names
 * @param onStage called with 'submit' | 'queue' | 'download' so the UI can talk
 * @returns {Promise<{url: string, blobUrl: string|null, dropped: number}>}
 */
export async function renderImage({ prompt, images = [], onStage = () => {} }) {
  const key = Settings.falKey.trim();
  if (!key) throw new RenderError('key', 'no key');
  if (!prompt) throw new RenderError('input', 'no prompt');
  if (!images.length) throw new RenderError('input', 'no reference photo');

  // The model takes four references. The subject is first in the list, so
  // trimming from the end drops accessories before it ever drops the person.
  const refs = await Promise.all(images.slice(0, MAX_REFS).map(fit));
  const dropped = images.length - refs.length;

  onStage('submit');
  const job = await call(`${QUEUE}/${MODEL}`, {
    method: 'POST',
    key,
    stage: 'submit',
    body: { prompt, image_urls: refs, num_images: 1, output_format: 'png' },
  });

  const statusUrl = job.status_url;
  const responseUrl = job.response_url;
  if (!statusUrl || !responseUrl) {
    throw new RenderError('submit', 'unexpected response from the queue');
  }

  onStage('queue');
  const deadline = Date.now() + TIMEOUT_MS;
  for (;;) {
    const st = await call(statusUrl, { key, stage: 'queue' });
    if (st.status === 'COMPLETED') break;
    if (st.status === 'FAILED' || st.status === 'ERROR' || st.error) {
      throw new RenderError('queue', st.error?.message || 'the model returned an error');
    }
    if (Date.now() > deadline) throw new RenderError('queue', 'timed out');
    await sleep(POLL_MS);
  }

  const result = await call(responseUrl, { key, stage: 'result' });
  const url = result?.images?.[0]?.url;
  if (!url) throw new RenderError('result', 'no image came back');

  // Pull it local so it survives the CDN link expiring and can be saved with
  // a filename. If the CDN refuses the cross-origin read, the remote URL is
  // still perfectly displayable — so this failing is not fatal.
  onStage('download');
  let blobUrl = null;
  try {
    const res = await fetch(url);
    if (res.ok) blobUrl = URL.createObjectURL(await res.blob());
  } catch { /* keep the remote URL */ }

  return { url, blobUrl, dropped };
}
