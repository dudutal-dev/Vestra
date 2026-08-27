/* ============================================================
   VESTRA · Gemini image client — the render, made in-app

   The brief used to leave the app: text and photographs handed to whatever
   image model the owner already had, result imported back by hand. This is
   the other half of that loop — the same brief, sent from the browser to
   Google's image model, the picture coming straight back.

   Same architecture as ai.js: browser → API with the owner's own key, no
   server in between. The Generative Language API answers CORS requests, so
   the key lives in localStorage next to the Anthropic one and never touches
   anything of ours. It is a separate file because it is a separate contract —
   different provider, different payload, different failure modes — and
   because ai.js should stay readable as "the Claude client".

   Cost, for the owner deciding whether to press the button: about $0.04 a
   picture on gemini-2.5-flash-image, with Google's free tier covering light
   personal use.
   ============================================================ */

import { Settings, hasGoogleKey } from './store.js';
import { AIError } from './ai.js';
import { loadImage } from './makeup.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* Left free to choose, the model picks its own canvas — and squeezing a
   full-length portrait into it is how the head ends up cropped out. So the
   output is pinned to the shape of the subject photo, snapped to the nearest
   ratio the API accepts. */
const RATIOS = [['1:1', 1], ['4:5', 4 / 5], ['5:4', 5 / 4], ['3:4', 3 / 4], ['4:3', 4 / 3],
  ['2:3', 2 / 3], ['3:2', 3 / 2], ['9:16', 9 / 16], ['16:9', 16 / 9]];

export async function subjectRatio(photos) {
  try {
    const img = await loadImage(photos?.[0]?.dataUrl);
    const r = (img.naturalWidth || img.width) / (img.naturalHeight || img.height);
    if (!isFinite(r) || r <= 0) return null;
    let best = null, dist = Infinity;
    for (const [name, v] of RATIOS) {
      const d = Math.abs(Math.log(v / r));
      if (d < dist) { dist = d; best = name; }
    }
    return best;
  } catch {
    return null;
  }
}

/* A data URL, split the way the API wants it. */
function inlinePart(dataUrl) {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(String(dataUrl || ''));
  if (!m) return null;
  return { inline_data: { mime_type: m[1], data: m[2] } };
}

/**
 * Render one image from a brief.
 *
 * @param prompt  the instruction text, exactly as the manual brief carries it
 * @param photos  [{ dataUrl }] in the order the prompt's manifest numbers them —
 *                the numbering is load-bearing, so the order must survive here
 * @returns {{ dataUrl: string }}
 */
export async function renderImage({ prompt, photos = [] }) {
  if (!hasGoogleKey()) throw new AIError('no_gkey');
  const ratio = await subjectRatio(photos);
  return attemptRender({ prompt, photos, ratio }, 0);
}

async function attemptRender({ prompt, photos, ratio }, attempt) {
  if (!navigator.onLine) throw new AIError('offline');

  const parts = [
    { text: prompt },
    ...photos.map(p => inlinePart(p.dataUrl)).filter(Boolean),
  ];

  const payload = { contents: [{ parts }] };
  if (ratio) payload.generationConfig = { imageConfig: { aspectRatio: ratio } };

  let res;
  try {
    res = await fetch(`${ENDPOINT}/${Settings.imageModel}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': Settings.googleKey.trim(),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AIError('offline');
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // A model that doesn't know the aspect field rejects the whole request;
    // the render matters more than the framing, so drop the config and go on.
    if (res.status === 400 && ratio && /image_?config|aspect_?ratio/i.test(body)) {
      return attemptRender({ prompt, photos, ratio: null }, attempt);
    }
    if (res.status === 400 && /API key|API_KEY/i.test(body)) throw new AIError('bad_gkey', body);
    if (res.status === 401 || res.status === 403) throw new AIError('bad_gkey', body);
    if (res.status === 429) {
      // Google's free tier includes NO image generation at all — the quota for
      // these models is 0, so a keyed account with no billing gets a 429 on the
      // very first call. That is not a rate limit and no retry will fix it;
      // the owner needs to enable billing, and the error should say so.
      if (/free_tier|"quotaValue"\s*:\s*"0"|limit:\s*0/i.test(body)) throw new AIError('gquota', body);
      if (attempt < 3) {
        await sleep(1500 * (attempt + 1));
        return attemptRender({ prompt, photos, ratio }, attempt + 1);
      }
      throw new AIError('rate_limit', body);
    }
    if (res.status >= 500 && attempt < 2) {
      await sleep(2000);
      return attemptRender({ prompt, photos, ratio }, attempt + 1);
    }
    throw new AIError('http_' + res.status, body);
  }

  const data = await res.json();
  const cand = data.candidates?.[0];

  // Blocked prompts arrive as a 200 with no image in it. The text part, when
  // there is one, says why — worth keeping for the console, not the toast.
  const img = (cand?.content?.parts || []).find(p => p.inlineData || p.inline_data);
  if (!img) {
    const why = cand?.finishReason || data.promptFeedback?.blockReason
      || (cand?.content?.parts || []).map(p => p.text).filter(Boolean).join(' ').slice(0, 300);
    throw new AIError('refusal', why);
  }

  const { mimeType, mime_type, data: b64 } = img.inlineData || img.inline_data;
  return { dataUrl: `data:${mimeType || mime_type || 'image/png'};base64,${b64}` };
}
