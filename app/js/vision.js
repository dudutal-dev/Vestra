/* ============================================================
   VESTRA · Local vision — face and body analysis with no API key

   This is the offline counterpart to analyzeFace() and analyzeBody(). It
   returns the same shape, so everything downstream — the makeup simulation,
   the try-on, the profile sync — cannot tell which engine produced the map.

   It is not a neural network. It is the classical pipeline a photo editor
   would use, and it works because the guide already asks for the photo it
   needs: face straight on, hair back, even light, plain background.

   Face:  skin is segmented in YCbCr, the largest skin region is the face, and
          the features are found inside it by what actually distinguishes them
          — eyes and brows are dark and not skin, lips are redder than skin.
          Everything else (cheek, cheekbone, jaw, lid) is derived from those
          anchors the way a makeup artist maps a face: by proportion.

   Body:  the silhouette is separated from the plain background, and the width
          of that silhouette at each height gives shoulders, waist and hips —
          which is the measurement body shape is defined by in the first place.

   Where the photo cannot support a conclusion it says so, rather than
   inventing one: both functions throw `unclear_photo`, the same error the AI
   path throws, so the UI response is identical.
   ============================================================ */

import { AIError } from './ai.js';
import { loadImage } from './makeup.js';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

/* ---------------- pixel access ---------------- */
async function sample(dataUrl, maxEdge) {
  const img = await loadImage(dataUrl);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) throw new AIError('bad_image');

  const scale = Math.min(1, maxEdge / Math.max(iw, ih));
  const w = Math.max(16, Math.round(iw * scale));
  const h = Math.max(16, Math.round(ih * scale));

  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);

  let data;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    throw new AIError('bad_image');
  }
  return { data, w, h };
}

/* YCbCr, because skin clusters tightly in chroma and barely at all in RGB. */
const ycbcr = (r, g, b) => ({
  y: 0.299 * r + 0.587 * g + 0.114 * b,
  cb: 128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
  cr: 128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
});

/**
 * Is this pixel skin?
 *
 * The chroma window is the well-established one; the RGB guard rejects the
 * warm neutrals — sand, wood, cardboard — that fall inside it but are never
 * skin, which matters because a wall can otherwise outvote a face.
 */
function isSkin(r, g, b) {
  const { y, cb, cr } = ycbcr(r, g, b);
  if (y < 55 || y > 245) return false;
  if (cb < 76 || cb > 128) return false;
  if (cr < 133 || cr > 176) return false;
  if (!(r > g && g > b - 12)) return false;
  if (Math.max(r, g, b) - Math.min(r, g, b) < 12) return false;
  return true;
}

/* ---------------- connected components ---------------- */
/** Every 4-connected region of a mask, each with its member indices and bounds. */
function components(mask, w, h) {
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  const found = [];

  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue;
    let qs = 0, qe = 0;
    queue[qe++] = start;
    seen[start] = 1;
    const members = [];
    let x0 = w, x1 = -1, y0 = h, y1 = -1;

    while (qs < qe) {
      const i = queue[qs++];
      members.push(i);
      const x = i % w, y = (i / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0     && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; queue[qe++] = i - 1; }
      if (x < w - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; queue[qe++] = i + 1; }
      if (y > 0     && mask[i - w] && !seen[i - w]) { seen[i - w] = 1; queue[qe++] = i - w; }
      if (y < h - 1 && mask[i + w] && !seen[i + w]) { seen[i + w] = 1; queue[qe++] = i + w; }
    }
    found.push({ members, x0, x1, y0, y1 });
  }
  return found;
}

/** Largest 4-connected region of a mask. Returns its member indices. */
function largestBlob(mask, w, h) {
  const all = components(mask, w, h);
  if (!all.length) return [];
  return all.reduce((a, b) => (b.members.length > a.members.length ? b : a)).members;
}

/**
 * The whole subject, not just its biggest piece.
 *
 * A head separated from the shoulders by dark hair against a dark top, or an
 * arm cut off by a shadow, arrives as its own component. Keeping only the
 * largest one silently drops it — and dropping the head moves the top of the
 * body down, which throws off every proportion measured from it. So anything
 * substantial that sits within the main mass's columns is treated as part of
 * the same person.
 */
function subjectBlob(mask, w, h) {
  const all = components(mask, w, h);
  if (!all.length) return [];
  const main = all.reduce((a, b) => (b.members.length > a.members.length ? b : a));
  const pad = (main.x1 - main.x0) * 0.25;

  const out = [];
  for (const c of all) {
    const overlaps = c.x1 >= main.x0 - pad && c.x0 <= main.x1 + pad;
    if (c === main || (overlaps && c.members.length >= main.members.length * 0.02)) {
      out.push(...c.members);
    }
  }
  return out;
}

/* ============================================================
   1 · Face

   The face is located by its EYES, not by its skin.

   Skin colour cannot find a face on its own. The backdrop the guide asks you
   to shoot against — a plain wall, a sheet — is very often a warm neutral, and
   warm neutrals sit inside the same chroma window as skin. On a beige studio
   backdrop the skin rule accepts about seventy per cent of the frame, the
   "largest skin region" becomes the whole photograph, and every feature
   derived from it lands somewhere between the hair and the collarbone.

   So skin is demoted to what it is actually good at — confirming a face is
   where we think it is, and telling us its tone — and the anchor becomes the
   pair of eyes. An eye is the one thing a wall cannot imitate: a small bright
   patch of nearly colourless sclera with something much darker beside it.

   Once two of those are paired, the rest is anthropometry. The distance
   between the pupils sets the scale of everything else, the angle between them
   is the head's tilt, and every region is placed in that rotated frame the way
   a makeup artist measures a face — by proportion from the eye line.
   ============================================================ */

const FACE_EDGE = 480;

/** Mean luminance over a square window, via an integral image. */
function boxBlur(lum, w, h, r) {
  const stride = w + 1;
  const integ = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += lum[y * w + x];
      integ[(y + 1) * stride + x + 1] = integ[y * stride + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
      const s = integ[(y1 + 1) * stride + x1 + 1] - integ[y0 * stride + x1 + 1]
              - integ[(y1 + 1) * stride + x0] + integ[y0 * stride + x0];
      out[y * w + x] = s / ((x1 - x0 + 1) * (y1 - y0 + 1));
    }
  }
  return out;
}

/* Proportions in units of the interpupillary distance D, measured down (+v)
   from the eye line. These are the standard adult facial canons. */
const P = {
  faceW: 2.22,        // bizygomatic width
  toHairline: 1.03,
  toChin: 1.67,
  toMouth: 1.08,
  toNose: 0.72,
  cheekU: 0.62, cheekV: 0.74,     // the apple of the cheek
  boneU: 0.88, boneV: 0.40,       // the top of the cheekbone
  jawU: 0.92, jawV: 1.08,         // the hollow beneath it
  // Measured from the pupil, not from the eye socket: the crease sits about
  // 10mm above the pupil and the brow about 22mm, against a 63mm pupil gap.
  lidV: 0.16,
  browV: 0.35,
};

/**
 * Everything connected to the frame edge that matches its colour. Removing it
 * first is what stops a plain backdrop from being mistaken for a face; when
 * the border is not uniform the whole frame is kept, and the eye search simply
 * has more ground to cover.
 */
export function foreground(data, w, h) {
  const N = w * h;
  const border = [];
  for (let x = 0; x < w; x++) { border.push(x); border.push((h - 1) * w + x); }
  for (let y = 1; y < h - 1; y++) { border.push(y * w); border.push(y * w + w - 1); }

  const med = (vals) => { const s = Float64Array.from(vals).sort(); return s[s.length >> 1]; };
  const br = med(border.map(i => data[i * 4]));
  const bg = med(border.map(i => data[i * 4 + 1]));
  const bb = med(border.map(i => data[i * 4 + 2]));
  const TOL = 34;
  const near = (i) => Math.abs(data[i * 4] - br) <= TOL &&
                      Math.abs(data[i * 4 + 1] - bg) <= TOL &&
                      Math.abs(data[i * 4 + 2] - bb) <= TOL;

  const fg = new Uint8Array(N).fill(1);
  let odd = 0;
  for (const i of border) if (!near(i)) odd++;
  if (odd / border.length > 0.4) return fg;      // a busy background: keep it all

  const queue = new Int32Array(N);
  let qs = 0, qe = 0;
  for (const i of border) if (fg[i] && near(i)) { fg[i] = 0; queue[qe++] = i; }
  while (qs < qe) {
    const i = queue[qs++];
    const x = i % w, y = (i / w) | 0;
    if (x > 0     && fg[i - 1] && near(i - 1)) { fg[i - 1] = 0; queue[qe++] = i - 1; }
    if (x < w - 1 && fg[i + 1] && near(i + 1)) { fg[i + 1] = 0; queue[qe++] = i + 1; }
    if (y > 0     && fg[i - w] && near(i - w)) { fg[i - w] = 0; queue[qe++] = i - w; }
    if (y < h - 1 && fg[i + w] && near(i + w)) { fg[i + w] = 0; queue[qe++] = i + w; }
  }
  return fg;
}

/**
 * Candidate whites of eyes: small, bright, almost colourless, with something
 * much darker immediately beside them — and set in a face. The size ceiling is
 * what rejects a pale wall: a wall is one enormous component, an eye white is
 * a few dozen pixels.
 *
 * The face test is the one that matters on a photograph of someone with long
 * dark hair. A glossy strand is bright against the few millimetres around it,
 * almost colourless, and has dark hair right beside it — it passes every other
 * test here, and on one straight-haired subject seventy of them outnumbered
 * the two real eyes and buried the pair.
 *
 * Testing the surrounding pixels for skin colour is not enough on its own,
 * because lit brown hair *is* skin-coloured: warm, mid-bright, red above green
 * above blue. What separates them is structure rather than colour. Skin forms
 * one large connected region — a face — while the skin-coloured pixels in hair
 * are strands: thin, broken and small. So a candidate has to sit inside a skin
 * region big enough to be a face.
 */
export function scleraCandidates(lum, chroma, skin, fg, w, h) {
  const N = w * h;

  /* The face, as the largest skin regions in the frame. Plural because a nose
     shadow can cut one face into two, and because a photo may legitimately
     hold an arm as well as a face. */
  const faceish = new Uint8Array(N);
  {
    const MIN_REGION = N * 0.012;
    for (const c of components(skin, w, h)) {
      if (c.members.length < MIN_REGION) continue;
      for (const i of c.members) faceish[i] = 1;
    }
  }

  // Brightness measured against the whole frame is the wrong question — lit
  // skin is brighter than a median that dark hair drags down, so a global
  // threshold lights up the face and half the chest with it. What singles out
  // an eye white is how much brighter it is than the few millimetres around it.
  const blur = boxBlur(lum, w, h, Math.max(3, Math.round(w * 0.03)));

  const mask = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!fg[i]) continue;
    if (chroma[i] > 30) continue;
    if (lum[i] < blur[i] * 1.14 || lum[i] < blur[i] + 15) continue;
    mask[i] = 1;
  }

  const MIN = Math.max(4, N * 0.00002);
  const MAX = N * 0.0026;
  const out = [];

  for (const c of components(mask, w, h)) {
    const n = c.members.length;
    if (n < MIN || n > MAX) continue;
    const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
    if (bw > w * 0.14 || bh > h * 0.10) continue;
    if (bw / bh > 7 || bh / bw > 4) continue;

    let sum = 0;
    for (const i of c.members) sum += lum[i];
    const own = sum / n;

    // Something dark must sit right next to it — the iris, or the lash line.
    let darkest = 255;
    const pad = Math.max(2, Math.round(bw * 0.9));
    for (let y = c.y0 - pad; y <= c.y1 + pad; y++) {
      for (let x = c.x0 - pad; x <= c.x1 + pad; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        if (mask[i]) continue;
        if (lum[i] < darkest) darkest = lum[i];
      }
    }
    if (darkest > own * 0.66) continue;

    // And it has to be set in a face. Sampled as a ring rather than a disc,
    // because the patch itself is an eye white and never counts as skin.
    const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
    const inner = Math.max(bw, bh) * 0.9;
    const outer = Math.max(inner + 3, Math.max(bw, bh) * 3.0);
    let ringN = 0, ringFace = 0;
    for (let y = Math.round(cy - outer); y <= cy + outer; y++) {
      for (let x = Math.round(cx - outer); x <= cx + outer; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const dd = (x - cx) ** 2 + (y - cy) ** 2;
        if (dd < inner * inner || dd > outer * outer) continue;
        ringN++;
        if (faceish[y * w + x]) ringFace++;
      }
    }
    if (ringN < 12 || ringFace / ringN < 0.35) continue;

    out.push({ cx, cy, n, lum: own, w: bw, h: bh, faceRing: ringFace / ringN });
  }
  return out;
}

/**
 * Move each candidate from the white of the eye onto the pupil.
 *
 * Sclera shows either side of an iris, never over it, so a patch's centroid
 * always sits off to one side — and if both eyes are measured from their outer
 * whites, the distance between them comes out too wide and every proportion
 * derived from it inflates with it. The darkest point nearby is the pupil.
 * Snapping there also collapses the two whites of one eye onto one point, so
 * they stop looking like two eyes.
 */
export function snapToPupil(cands, lum, fg, w, h) {
  return cands.map(k => {
    const r = clamp(Math.round(2.4 * Math.sqrt(k.n)), 3, Math.round(w * 0.035));
    let bx = k.cx, by = k.cy, bv = Infinity;
    for (let y = Math.round(k.cy - r); y <= k.cy + r; y++) {
      for (let x = Math.round(k.cx - r); x <= k.cx + r; x++) {
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        if (!fg[y * w + x]) continue;
        if ((x - k.cx) ** 2 + (y - k.cy) ** 2 > r * r) continue;
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += lum[(y + dy) * w + x + dx];
        if (s < bv) { bv = s; bx = x; by = y; }
      }
    }
    return { ...k, cx: bx, cy: by };
  });
}

/** Two sclera patches either side of one iris are one eye, not two. */
export function mergeNear(cands, radius) {
  const used = new Array(cands.length).fill(false);
  const out = [];
  for (let i = 0; i < cands.length; i++) {
    if (used[i]) continue;
    let { cx, cy, n, lum } = cands[i];
    used[i] = true;
    for (let j = i + 1; j < cands.length; j++) {
      if (used[j]) continue;
      if (Math.hypot(cands[j].cx - cx, cands[j].cy - cy) > radius) continue;
      const tot = n + cands[j].n;
      cx = (cx * n + cands[j].cx * cands[j].n) / tot;
      cy = (cy * n + cands[j].cy * cands[j].n) / tot;
      lum = (lum * n + cands[j].lum * cands[j].n) / tot;
      n = tot;
      used[j] = true;
    }
    out.push({ cx, cy, n, lum });
  }
  return out;
}

/**
 * Pick the pair that actually looks like a pair of eyes.
 *
 * A photograph of a person contains dozens of small bright specks — highlights
 * on hair, a necklace, polka dots, the shine on a cheekbone. Any two of them
 * form a plausible-looking pair, and no property of the two points alone tells
 * them apart from eyes: not their size, not their spacing, not how much skin
 * lies between them.
 *
 * What tells them apart is the face they imply. Two eyes predict where a mouth
 * and a pair of brows must be, and those predictions are testable: the mouth
 * is redder than the cheeks beside it, and the brows are darker than the
 * forehead above them. Two highlights in someone's hair predict a mouth in the
 * middle of their neck, and there is nothing red there.
 *
 * So each pair is scored on whether the face it implies actually exists.
 */
export function pickEyePair(cands, ctx) {
  const { lum, red, skin, fg, w, h } = ctx;
  const px = (x, y) => clamp(Math.round(y), 0, h - 1) * w + clamp(Math.round(x), 0, w - 1);
  let best = null;

  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      const a = cands[i].cx <= cands[j].cx ? cands[i] : cands[j];
      const b = cands[i].cx <= cands[j].cx ? cands[j] : cands[i];
      const dx = b.cx - a.cx, dy = b.cy - a.cy;
      if (dx < w * 0.035) continue;                        // the same eye twice
      const D = Math.hypot(dx, dy);
      if (D > w * 0.45) continue;
      if (Math.abs(dy) > dx * 0.5) continue;               // tilt beyond ~27°

      const sizeRatio = Math.max(a.n, b.n) / Math.max(1, Math.min(a.n, b.n));
      if (sizeRatio > 4.5) continue;

      const faceW = P.faceW * D;
      if (faceW < w * 0.16 || faceW > w * 1.05) continue;   // not a face at this scale

      const mx = (a.cx + b.cx) / 2, my = (a.cy + b.cy) / 2;
      const ux = dx / D, uy = dy / D;
      const vx = -uy, vy = ux;                              // down the face
      const at = (u, v) => [mx + ux * u * D + vx * v * D, my + uy * u * D + vy * v * D];

      /* --- Is there a face here at all? The cheap structural tests first. --- */
      const patch = (arr, u, v, rad = 0.16) => {
        let s = 0, n = 0;
        for (let dv = -rad; dv <= rad; dv += rad) {
          for (let du = -rad; du <= rad; du += rad) {
            const [x, y] = at(u + du, v + dv);
            if (x < 0 || y < 0 || x >= w || y >= h) return null;
            s += arr[px(x, y)]; n++;
          }
        }
        return n ? s / n : null;
      };

      const cheekRed = patch(red, -P.cheekU, P.cheekV, 0.2);
      const cheekRed2 = patch(red, P.cheekU, P.cheekV, 0.2);
      if (cheekRed === null || cheekRed2 === null) continue;
      const cheekR = (cheekRed + cheekRed2) / 2;

      // The mouth: the reddest band where a mouth would have to be.
      let mouthR = -Infinity;
      for (let v = P.toMouth - 0.28; v <= P.toMouth + 0.28; v += 0.09) {
        for (let u = -0.24; u <= 0.24; u += 0.12) {
          const r = patch(red, u, v, 0.14);
          if (r !== null && r > mouthR) mouthR = r;
        }
      }
      if (!isFinite(mouthR) || mouthR - cheekR < 1.1) continue;

      // The brows: darker than the forehead above them.
      const foreheadL = patch(lum, 0, -P.toHairline * 0.55, 0.2);
      const browL = patch(lum, -0.5, -P.browV, 0.16);
      const browR = patch(lum, 0.5, -P.browV, 0.16);
      if (foreheadL === null || browL === null || browR === null) continue;
      const browDrop = foreheadL - Math.min(browL, browR);
      if (browDrop < 5) continue;

      /* --- Then the expensive one: is the implied face mostly skin? --- */
      const faceH = (P.toHairline + P.toChin) * D;
      const ccx = mx + vx * ((P.toChin - P.toHairline) / 2) * D;
      const ccy = my + vy * ((P.toChin - P.toHairline) / 2) * D;

      let inside = 0, isSkinCount = 0, outOfFrame = 0;
      const step = Math.max(1, Math.round(D / 12));
      for (let y = Math.round(ccy - faceH / 2); y <= ccy + faceH / 2; y += step) {
        for (let x = Math.round(ccx - faceW / 2); x <= ccx + faceW / 2; x += step) {
          const du = (x - ccx) * ux + (y - ccy) * uy;
          const dv = (x - ccx) * vx + (y - ccy) * vy;
          if ((du / (faceW / 2)) ** 2 + (dv / (faceH / 2)) ** 2 > 1) continue;
          inside++;
          if (x < 0 || y < 0 || x >= w || y >= h) { outOfFrame++; continue; }
          const k = y * w + x;
          if (skin[k] && fg[k]) isSkinCount++;
        }
      }
      if (inside < 40) continue;
      if (outOfFrame / inside > 0.22) continue;             // a face mostly off-frame
      const skinFrac = isSkinCount / inside;
      if (skinFrac < 0.60) continue;

      /* --- And the test a wrong pair cannot pass: symmetry. -----------------
         Pair one real eye with a highlight beside the nose and you still get a
         box full of skin with a mouth under it — the region simply sits at an
         angle, off to one side. But a face is symmetric about its own midline
         and a misplaced frame is not, so mirroring the frame across that line
         and comparing is what separates them. A turned head costs a little
         symmetry; a frame anchored on the wrong point loses far more. */
      const diffs = [];
      for (let v = -0.7; v <= 1.45; v += 0.15) {
        for (let u = 0.2; u <= 0.95; u += 0.15) {
          const [xa, ya] = at(u, v), [xb, yb] = at(-u, v);
          if (xa < 0 || ya < 0 || xa >= w || ya >= h) continue;
          if (xb < 0 || yb < 0 || xb >= w || yb >= h) continue;
          diffs.push(Math.abs(lum[px(xa, ya)] - lum[px(xb, yb)]));
        }
      }
      if (diffs.length < 20) continue;

      /* The median, not the mean.
         The frame has to reach the edges of the face for this test to have any
         power — narrow it to the interior and a patch of hair, which is
         self-similar everywhere, passes as a face. But at those edges hair
         falls differently on the two sides of almost every portrait, and a
         handful of pairs comparing cheek against black hair is enough to drag
         a mean past the threshold and reject a perfectly centred photograph.
         A real face is symmetric in most of the pairs and wildly asymmetric in
         a few; a wrong frame is moderately wrong in all of them. The median
         reads that difference and the mean cannot. */
      diffs.sort((m, n) => m - n);
      const symDiff = diffs[diffs.length >> 1];
      const symmetry = 1 - clamp(symDiff / 55, 0, 1);
      if (symmetry < 0.25) continue;

      const level = 1 - Math.abs(dy) / Math.max(dx, 1);
      const score = skinFrac * 1.6
                  + symmetry * 2.6
                  + clamp((mouthR - cheekR) / 6, 0, 1.4) * 1.8
                  + clamp(browDrop / 45, 0, 1.2) * 1.2
                  + level * 0.6
                  - (sizeRatio - 1) * 0.10;

      if (!best || score > best.score) {
        best = {
          a, b, D, mx, my, ux, uy, vx, vy, ccx, ccy, faceW, faceH,
          skinFrac, symmetry, mouthLift: mouthR - cheekR, browDrop, score,
        };
      }
    }
  }
  return best;
}

/**
 * Build the whole region map from three points: the two pupils and the centre
 * of the mouth.
 *
 * Those three are all the geometry a face map needs — the pupils set the
 * scale and the tilt, the mouth sets how far the head is turned — and every
 * other region follows from them by proportion. Keeping this separate from the
 * detector means the same map can be rebuilt from points a person placed by
 * hand, which is the only way to be certain it is right.
 *
 * @param anchors {eyeL,eyeR,mouth} in normalized image coordinates, plus
 *                optional lipHalfW / lipHalfH in units of the pupil distance.
 * @param w,h     the image's pixel dimensions, so angles come out true.
 */
export function regionsFromAnchors(anchors, w, h) {
  let eL = [anchors.eyeL.x * w, anchors.eyeL.y * h];
  let eR = [anchors.eyeR.x * w, anchors.eyeR.y * h];
  if (eR[0] < eL[0]) { const t = eL; eL = eR; eR = t; }

  const dx = eR[0] - eL[0], dy = eR[1] - eL[1];
  const D = Math.max(Math.hypot(dx, dy), 2);
  const ux = dx / D, uy = dy / D;
  const vx = -uy, vy = ux;                              // down the face
  const mx = (eL[0] + eR[0]) / 2, my = (eL[1] + eR[1]) / 2;
  const rollDeg = (Math.atan2(uy, ux) * 180) / Math.PI;
  const at = (u, v) => [mx + ux * u * D + vx * v * D, my + uy * u * D + vy * v * D];
  const off = ([x, y], u, v) => [x + ux * u * D + vx * v * D, y + uy * u * D + vy * v * D];

  // Where the mouth sits in the face's own frame.
  let mouthU = 0, mouthV = P.toMouth;
  if (anchors.mouth) {
    const px = anchors.mouth.x * w - mx, py = anchors.mouth.y * h - my;
    mouthU = (px * ux + py * uy) / D;
    mouthV = (px * vx + py * vy) / D;
  }

  const halfW = clamp(anchors.lipHalfW ?? 0.26, 0.18, 0.42);
  const halfH = clamp(anchors.lipHalfH ?? 0.13, 0.07, Math.min(0.17, halfW * 0.62));

  /* The head's turn, read from how far the mouth sits off the eye line's
     midpoint. It shifts the lower half of the face — but NOT the mouth, which
     is already where it was measured. Applying it there too moved the lips by
     the offset twice, which is why they kept landing beside the mouth rather
     than on it. */
  const yaw = clamp(mouthU, -0.16, 0.16);
  const lower = (u, v) => at(u + yaw * (v / P.toMouth), v);

  const nx = (v) => clamp(v / w, 0, 1);
  const ny = (v) => clamp(v / h, 0, 1);
  const ell = ([x, y], rxD, ryD, rot = rollDeg) => ({
    cx: nx(x), cy: ny(y), rx: (rxD * D) / w, ry: (ryD * D) / h, rot,
  });

  const eyeHalfW = 0.24, eyeHalfH = 0.24 * 0.42;
  const faceW = P.faceW * D;
  const faceH = (P.toHairline + P.toChin) * D;
  const [ccx, ccy] = at(0, (P.toChin - P.toHairline) / 2);

  const regions = {
    face: { cx: nx(ccx), cy: ny(ccy), rx: (faceW / 2) / w, ry: (faceH / 2) / h, rot: rollDeg },
    forehead:  ell(at(0, -P.toHairline * 0.45), 0.55, 0.26),
    nose:      ell(lower(0, P.toNose), 0.17, 0.30),
    chin:      ell(lower(0, P.toChin * 0.92), 0.30, 0.18),

    eye_left:   ell(eL, eyeHalfW, eyeHalfH),
    eye_right:  ell(eR, eyeHalfW, eyeHalfH),
    lid_left:   ell(off(eL, 0, -P.lidV), eyeHalfW * 1.05, eyeHalfH * 1.2),
    lid_right:  ell(off(eR, 0, -P.lidV), eyeHalfW * 1.05, eyeHalfH * 1.2),
    brow_left:  ell(off(eL, -0.03, -P.browV), eyeHalfW * 1.1, eyeHalfH * 0.38),
    brow_right: ell(off(eR, 0.03, -P.browV), eyeHalfW * 1.1, eyeHalfH * 0.38),

    cheek_left:  ell(lower(-P.cheekU, P.cheekV), 0.30, 0.24),
    cheek_right: ell(lower(P.cheekU, P.cheekV), 0.30, 0.24),
    bone_left:   ell(lower(-P.boneU, P.boneV), 0.28, 0.12, rollDeg - 10),
    bone_right:  ell(lower(P.boneU, P.boneV), 0.28, 0.12, rollDeg + 10),
    jaw_left:    ell(lower(-P.jawU, P.jawV), 0.18, 0.30, rollDeg - 6),
    jaw_right:   ell(lower(P.jawU, P.jawV), 0.18, 0.30, rollDeg + 6),

    lips:      ell(at(mouthU, mouthV), halfW, halfH),
    lip_upper: ell(at(mouthU, mouthV - halfH * 0.48), halfW * 0.97, halfH * 0.5),
    lip_lower: ell(at(mouthU, mouthV + halfH * 0.50), halfW * 0.9, halfH * 0.54),
  };

  return { regions, at, off, lower, eL, eR, frame: { D, rollDeg, mx, my, ux, uy, vx, vy } };
}

export async function analyzeFaceLocal(shot) {
  const { data, w, h } = await sample(shot.dataUrl || shot, FACE_EDGE);
  const N = w * h;

  const lum = new Float32Array(N);
  const chroma = new Float32Array(N);
  const red = new Float32Array(N);
  const skin = new Uint8Array(N);

  for (let i = 0; i < N; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const { y, cb, cr } = ycbcr(r, g, b);
    lum[i] = y;
    chroma[i] = Math.abs(cb - 128) + Math.abs(cr - 128);
    red[i] = cr - cb;
    if (isSkin(r, g, b)) skin[i] = 1;
  }

  const fg = foreground(data, w, h);
  const cands = mergeNear(
    snapToPupil(scleraCandidates(lum, chroma, skin, fg, w, h), lum, fg, w, h),
    w * 0.022);
  const eyes = cands.length >= 2 ? pickEyePair(cands, { lum, red, skin, fg, w, h }) : null;

  // No pair of eyes, no face. Saying so beats painting a cheek onto an ear.
  if (!eyes) throw new AIError('unclear_photo');

  const { D, mx, my, ux, uy, vx, vy, ccx, ccy, faceW, faceH } = eyes;
  const at = (u, v) => [mx + ux * u * D + vx * v * D, my + uy * u * D + vy * v * D];
  const rollDeg = (Math.atan2(uy, ux) * 180) / Math.PI;

  /* --- The mouth, refined by looking for it ------------------------------
     Its predicted place is good to a few per cent; searching for the reddest
     band nearby makes it exact, and how far it sits off the face's own axis
     is the cheapest read there is on how far the head is turned. */
  const skinRed = (() => {
    let s = 0, n = 0;
    for (const [u, v] of [[P.cheekU, P.cheekV], [-P.cheekU, P.cheekV]]) {
      const [x, y] = at(u, v);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = clamp(Math.round(x + dx), 0, w - 1), yy = clamp(Math.round(y + dy), 0, h - 1);
        s += red[yy * w + xx]; n++;
      }
    }
    return n ? s / n : 30;
  })();

  /* The proportions already put the mouth within a few pixels of where it is.
     The search is here to correct that, not to relocate it — so it looks in a
     narrow window and pays a price for wandering off centre, which stops a
     warm patch of cheek from winning against the actual lips. */
  let mouthU = 0, mouthV = P.toMouth, bestRed = -Infinity;
  for (let v = P.toMouth - 0.24; v <= P.toMouth + 0.24; v += 0.03) {
    for (let u = -0.24; u <= 0.24; u += 0.04) {
      let s = 0, n = 0;
      for (let du = -0.26; du <= 0.26; du += 0.065) {
        const [x, y] = at(u + du, v);
        const xx = clamp(Math.round(x), 0, w - 1), yy = clamp(Math.round(y), 0, h - 1);
        s += red[yy * w + xx] - skinRed; n++;
      }
      // A turned head lights one cheek more than the other, and the lit cheek
      // is warmer than the shaded one — enough to pull an unweighted search off
      // the mouth entirely. The penalty means only the lips can win.
      const avg = (n ? s / n : 0) - Math.abs(u) * 16 - Math.abs(v - P.toMouth) * 6;
      if (avg > bestRed) { bestRed = avg; mouthU = u; mouthV = v; }
    }
  }
  // A mouth that is barely redder than the cheek was not found; fall back to
  // where the proportions say it is rather than to wherever the noise peaked.
  if (bestRed < 1.2) { mouthU = 0; mouthV = P.toMouth; }

  const mouthRedFloor = skinRed + Math.max(bestRed * 0.5, 1.2);
  let halfW = 0.30, halfH = 0.11;
  {
    let uMax = 0;
    for (let du = 0; du <= 0.62; du += 0.03) {
      const [x1, y1] = at(mouthU + du, mouthV);
      const [x2, y2] = at(mouthU - du, mouthV);
      const r1 = red[clamp(Math.round(y1), 0, h - 1) * w + clamp(Math.round(x1), 0, w - 1)];
      const r2 = red[clamp(Math.round(y2), 0, h - 1) * w + clamp(Math.round(x2), 0, w - 1)];
      if (r1 > mouthRedFloor || r2 > mouthRedFloor) uMax = du;
    }
    let vMax = 0;
    for (let dv = 0; dv <= 0.30; dv += 0.02) {
      const [x1, y1] = at(mouthU, mouthV + dv);
      const [x2, y2] = at(mouthU, mouthV - dv);
      const r1 = red[clamp(Math.round(y1), 0, h - 1) * w + clamp(Math.round(x1), 0, w - 1)];
      const r2 = red[clamp(Math.round(y2), 0, h - 1) * w + clamp(Math.round(x2), 0, w - 1)];
      if (r1 > mouthRedFloor || r2 > mouthRedFloor) vMax = dv;
    }
    halfW = clamp(uMax || 0.26, 0.20, 0.42);
    // A mouth is roughly twice as wide as it is tall. Left to run, the vertical
    // scan walks off the lips into the warm skin above and below them and comes
    // back with a circle, which then gets painted as one.
    halfH = clamp(vMax || 0.12, 0.07, Math.min(0.17, halfW * 0.62));
  }

  const { regions, lower, off, eL, eR } = regionsFromAnchors({
    eyeL: { x: eyes.a.cx / w, y: eyes.a.cy / h },
    eyeR: { x: eyes.b.cx / w, y: eyes.b.cy / h },
    mouth: { x: at(mouthU, mouthV)[0] / w, y: at(mouthU, mouthV)[1] / h },
    lipHalfW: halfW, lipHalfH: halfH,
  }, w, h);

  /* --- The assessment, measured inside the face we just located --- */
  const sampleSkinAt = (u, v, rad = 0.16) => {
    const px = [];
    for (let dv = -rad; dv <= rad; dv += rad / 2) {
      for (let du = -rad; du <= rad; du += rad / 2) {
        const [x, y] = lower(u + du, v + dv);
        const xx = clamp(Math.round(x), 0, w - 1), yy = clamp(Math.round(y), 0, h - 1);
        const i = yy * w + xx;
        if (skin[i]) px.push(i);
      }
    }
    return px;
  };

  const facePix = [
    ...sampleSkinAt(-P.cheekU, P.cheekV, 0.26),
    ...sampleSkinAt(P.cheekU, P.cheekV, 0.26),
    ...sampleSkinAt(0, -P.toHairline * 0.45, 0.26),
  ];
  const pick = (o) => (facePix.length ? mean(facePix.map(i => data[i * 4 + o])) : 128);
  const avgR = pick(0), avgG = pick(1), avgB = pick(2);
  const skinLum = mean(facePix.map(i => lum[i])) || 150;

  const depth = skinLum > 205 ? 'fair' : skinLum > 180 ? 'light' : skinLum > 150 ? 'medium' : skinLum > 118 ? 'tan' : 'deep';

  const mx2 = Math.max(avgR, avgG, avgB), mn2 = Math.min(avgR, avgG, avgB);
  const chr = mx2 - mn2;
  const hue = chr ? ((avgG - avgB) / chr) * 60 : 25;
  const sat = mx2 ? chr / mx2 : 0;
  let undertone = 'neutral';
  if (hue >= 32 && sat < 0.44) undertone = 'olive';
  else if (hue >= 30) undertone = 'warm';
  else if (hue <= 21) undertone = 'cool';

  const browLum = (() => {
    const px = [];
    for (const e of [eL, eR]) {
      for (let du = -0.35; du <= 0.35; du += 0.1) {
        const [x, y] = off(e, du, -P.browV);
        px.push(lum[clamp(Math.round(y), 0, h - 1) * w + clamp(Math.round(x), 0, w - 1)]);
      }
    }
    return mean(px);
  })();
  const spread = Math.abs(skinLum - browLum);
  const contrast = spread > 78 ? 'high' : spread > 42 ? 'medium' : 'low';

  /* Face width measured from the skin mask, along the face's own axis. */
  const widthAt = (v) => {
    let n = 0;
    for (let u = -1.3; u <= 1.3; u += 0.04) {
      const [x, y] = lower(u, v);
      const xx = clamp(Math.round(x), 0, w - 1), yy = clamp(Math.round(y), 0, h - 1);
      if (skin[yy * w + xx]) n++;
    }
    return n * 0.04;
  };
  const foreheadW = widthAt(-P.toHairline * 0.5) || 1.8;
  const cheekW = widthAt(P.cheekV) || 2.0;
  const jawW = widthAt(P.toChin * 0.72) || 1.7;

  const aspect = (P.toHairline + P.toChin) / P.faceW;
  const widthSpread = Math.max(foreheadW, cheekW, jawW) / Math.max(0.1, Math.min(foreheadW, cheekW, jawW));
  let shape;
  if (widthSpread < 1.22) shape = jawW > foreheadW * 1.05 ? 'square' : 'oval';
  else if (foreheadW > jawW * 1.24) shape = 'heart';
  else if (jawW > foreheadW * 1.24) shape = 'triangle';
  else if (cheekW > foreheadW * 1.2 && cheekW > jawW * 1.2) shape = 'diamond';
  else shape = aspect > 1.28 ? 'long' : 'oval';

  const eyeAspect = (eyes.a.n + eyes.b.n) / 2 / Math.max(1, (D * 0.24) ** 2);
  const eye_shape = eyeAspect < 0.22 ? 'hooded' : eyeAspect > 0.62 ? 'round' : 'almond';
  const lipRatio = (halfH * 2) / (P.toChin - P.toHairline);
  const lip_fullness = lipRatio > 0.115 ? 'full' : lipRatio < 0.07 ? 'thin' : 'medium';
  const brow_shape = contrast === 'low' ? 'sparse' : spread > 92 ? 'full' : 'straight';

  const confidence = clamp(
    0.30 + eyes.skinFrac * 0.30 + (bestRed > 1.2 ? 0.12 : 0) + (contrast !== 'low' ? 0.08 : 0),
    0.25, 0.75);

  const APPLY = {
    hooded: { he: 'עפעף נפול — הנח צללית מעל הקמט, אחרת היא נעלמת כשהעין פקוחה.', en: 'Hooded lids — place shadow above the crease or it disappears when your eyes are open.' },
    round:  { he: 'עין עגולה — מתיחה החוצה בזווית החיצונית מאריכה את הצורה.', en: 'Round eyes — extend the outer corner to lengthen the shape.' },
    almond: { he: 'עין שקדית — כמעט כל טכניקה עובדת; שמור על הקמט נקי.', en: 'Almond eyes — nearly any technique works; keep the crease clean.' },
  };

  return {
    engine: 'local',
    face: {
      shape,
      skin_undertone: undertone,
      skin_depth: depth,
      contrast,
      eye_shape,
      lip_fullness,
      brow_shape,
      notes_he: `פנים ${shape} · אנדרטון ${undertone} · עומק ${depth} · קונטרסט ${contrast}`,
      notes_en: `${shape} face · ${undertone} undertone · ${depth} depth · ${contrast} contrast`,
      apply_he: APPLY[eye_shape]?.he || '', apply_en: APPLY[eye_shape]?.en || '',
      confidence,
    },
    regions,
  };
}
/* ============================================================
   2 · Body
   ============================================================ */

const BODY_EDGE = 240;

export async function analyzeBodyLocal(shot, profile = {}) {
  const { data, w, h } = await sample(shot.dataUrl || shot, BODY_EDGE);
  const N = w * h;

  /* --- Separate the person from the background ---------------------------
     The same border flood fill the try-on uses on garment photos: whatever is
     connected to the edge of the frame and matches its colour is not you. */
  const border = [];
  for (let x = 0; x < w; x++) { border.push(x); border.push((h - 1) * w + x); }
  for (let y = 1; y < h - 1; y++) { border.push(y * w); border.push(y * w + w - 1); }

  const med = (vals) => { const s = Float64Array.from(vals).sort(); return s[s.length >> 1]; };
  const br = med(border.map(i => data[i * 4]));
  const bg = med(border.map(i => data[i * 4 + 1]));
  const bb = med(border.map(i => data[i * 4 + 2]));
  const TOL = 46;
  const nearBg = (i) => Math.abs(data[i * 4] - br) <= TOL &&
                        Math.abs(data[i * 4 + 1] - bg) <= TOL &&
                        Math.abs(data[i * 4 + 2] - bb) <= TOL;

  let odd = 0;
  for (const i of border) if (!nearBg(i)) odd++;
  // A photo taken against a room, not a wall. The width profile would be the
  // furniture's, not the body's, so refuse rather than mislead.
  if (odd / border.length > 0.34) throw new AIError('unclear_photo');

  const isBg = new Uint8Array(N);
  const queue = new Int32Array(N);
  let qs = 0, qe = 0;
  for (const i of border) if (!isBg[i] && nearBg(i)) { isBg[i] = 1; queue[qe++] = i; }
  while (qs < qe) {
    const i = queue[qs++];
    const x = i % w, y = (i / w) | 0;
    if (x > 0     && !isBg[i - 1] && nearBg(i - 1)) { isBg[i - 1] = 1; queue[qe++] = i - 1; }
    if (x < w - 1 && !isBg[i + 1] && nearBg(i + 1)) { isBg[i + 1] = 1; queue[qe++] = i + 1; }
    if (y > 0     && !isBg[i - w] && nearBg(i - w)) { isBg[i - w] = 1; queue[qe++] = i - w; }
    if (y < h - 1 && !isBg[i + w] && nearBg(i + w)) { isBg[i + w] = 1; queue[qe++] = i + w; }
  }

  const person = new Uint8Array(N);
  for (let i = 0; i < N; i++) person[i] = isBg[i] ? 0 : 1;
  const blob = subjectBlob(person, w, h);
  if (blob.length / N < 0.05) throw new AIError('unclear_photo');

  const rowMin = new Int32Array(h).fill(w);
  const rowMax = new Int32Array(h).fill(-1);
  for (const i of blob) {
    const x = i % w, y = (i / w) | 0;
    if (x < rowMin[y]) rowMin[y] = x;
    if (x > rowMax[y]) rowMax[y] = x;
  }
  const width = new Float32Array(h);
  for (let y = 0; y < h; y++) width[y] = rowMax[y] >= 0 ? rowMax[y] - rowMin[y] + 1 : 0;

  let topY = 0; while (topY < h && !width[topY]) topY++;
  let botY = h - 1; while (botY > topY && !width[botY]) botY--;
  const bodyH = botY - topY;
  // Standing, whole body in frame — anything shorter is a crop, not a figure.
  if (bodyH < h * 0.45) throw new AIError('unclear_photo');

  // Smooth the profile: a stray sleeve pixel should not become the shoulder.
  const smooth = new Float32Array(h);
  const k = Math.max(2, Math.round(bodyH * 0.02));
  for (let y = topY; y <= botY; y++) {
    let s = 0, n = 0;
    for (let d = -k; d <= k; d++) { const yy = y + d; if (yy >= topY && yy <= botY) { s += width[yy]; n++; } }
    smooth[y] = n ? s / n : 0;
  }

  const at = (frac) => clamp(Math.round(topY + bodyH * frac), topY, botY);
  const argmax = (a, b) => { let by = a, bv = -1; for (let y = a; y <= b; y++) if (smooth[y] > bv) { bv = smooth[y]; by = y; } return by; };
  const argmin = (a, b) => { let by = a, bv = Infinity; for (let y = a; y <= b; y++) if (smooth[y] < bv) { bv = smooth[y]; by = y; } return by; };

  // Head ends at the neck: the narrowest point in the top fifth.
  const neckY = argmin(at(0.06), at(0.22));
  const shoulderY = argmax(neckY, at(0.34));
  const waistY = argmin(at(0.36), at(0.56));
  const hipY = argmax(waistY, at(0.70));

  /* Measure with percentiles of the raw profile, not the smoothed peak.
     A shoulder is a sharp step and a hip a broad plateau, so smoothing shaves
     the shoulder and leaves the hip intact — which tips every balanced figure
     into looking hip-dominant. */
  const pct = (a, b, q) => {
    const vals = [];
    for (let y = clamp(a, topY, botY); y <= clamp(b, topY, botY); y++) if (width[y]) vals.push(width[y]);
    if (!vals.length) return 0;
    vals.sort((m, n) => m - n);
    return vals[clamp(Math.round((vals.length - 1) * q), 0, vals.length - 1)];
  };

  const shoulderW = pct(neckY, at(0.34), 0.92);
  const waistW = pct(at(0.36), at(0.56), 0.10);
  const hipW = pct(waistY, at(0.70), 0.92);
  if (!shoulderW || !hipW) throw new AIError('unclear_photo');

  /* --- Shape from the three measurements it is actually defined by --- */
  const shRatio = shoulderW / hipW;
  const waistRatio = waistW / Math.min(shoulderW, hipW);
  const presentation = profile.gender_presentation || 'women';

  let shape;
  if (waistRatio > 0.97) shape = presentation === 'men' ? 'oval' : 'apple';
  else if (shRatio > 1.08) shape = 'inverted-triangle';
  else if (shRatio < 0.92) shape = presentation === 'men' ? 'triangle' : 'pear';
  else if (waistRatio < 0.80) shape = presentation === 'men' ? 'trapezoid' : 'hourglass';
  else shape = 'rectangle';

  const ratio = shRatio > 1.06 ? 'shoulder-dominant' : shRatio < 0.94 ? 'hip-dominant' : 'balanced';

  /* --- Regions, normalised as boxes --- */
  const boxFor = (y0, y1) => {
    let lo = w, hi = -1;
    for (let y = clamp(y0, 0, h - 1); y <= clamp(y1, 0, h - 1); y++) {
      if (rowMax[y] < 0) continue;
      lo = Math.min(lo, rowMin[y]);
      hi = Math.max(hi, rowMax[y]);
    }
    if (hi < 0) { lo = 0; hi = w - 1; }
    return { x: lo / w, y: clamp(y0, 0, h - 1) / h, w: (hi - lo + 1) / w, h: Math.max(1, y1 - y0) / h };
  };

  const feetTop = Math.round(botY - bodyH * 0.06);
  const regions = {
    head:   boxFor(topY, neckY),
    torso:  boxFor(shoulderY, waistY),
    waist:  boxFor(waistY - Math.round(bodyH * 0.02), waistY + Math.round(bodyH * 0.02)),
    hips:   boxFor(waistY, hipY + Math.round(bodyH * 0.05)),
    legs:   boxFor(waistY, feetTop),
    feet:   boxFor(feetTop, botY),
    full:   boxFor(topY, botY),
  };

  /* --- Fit advice, per shape. Balance, never concealment. --- */
  const NOTES = {
    'pear': {
      prop: { he: 'הירך רחבה מהכתף — הכובד התמונתי נמצא למטה.', en: 'Hips read wider than shoulders — the visual weight sits low.' },
      focus: { he: 'להוסיף נוכחות לכתף, ולהשאיר את התחתון נקי.', en: 'Add presence at the shoulder and keep the lower half quiet.' },
      notes: [
        ['tops', 'עליוניות עם כתף מובנית, צווארון רחב או פרט בכתף', 'Tops with a structured shoulder, a wide neckline or shoulder detail'],
        ['bottoms', 'תחתונים בגוון כהה ובגזרה ישרה — בלי הדפס גדול', 'Bottoms in a darker tone and a straight cut — no large print'],
        ['outerwear', 'בלייזר מובנה שנגמר מעל הירך הרחבה ביותר', 'A structured blazer ending above the widest point of the hip'],
        ['proportion', 'מותן מוגדרת — חגורה היא הכלי הכי זול כאן', 'Define the waist — a belt is the cheapest tool you have'],
      ],
    },
    'inverted-triangle': {
      prop: { he: 'הכתף רחבה מהירך — הכובד למעלה.', en: 'Shoulders read wider than hips — the weight sits high.' },
      focus: { he: 'להוסיף נפח למטה ולהשאיר את הכתף נקייה.', en: 'Add volume below and keep the shoulder clean.' },
      notes: [
        ['bottoms', 'רגל רחבה, פליסה או חצאית מתרחבת', 'Wide leg, pleats or an A-line skirt'],
        ['tops', 'צווארון V וכתף רכה — בלי כרית כתף', 'A V neckline and a soft shoulder — no padding'],
        ['outerwear', 'שכבות ללא מבנה בכתף', 'Layers with no structure at the shoulder'],
        ['proportion', 'להוריד את נקודת העניין אל קו המותן ומטה', 'Move the point of interest to the waist and below'],
      ],
    },
    'hourglass': {
      prop: { he: 'כתף וירך מאוזנות עם מותן צרה.', en: 'Shoulders and hips balance, with a defined waist.' },
      focus: { he: 'לשמור על המותן גלויה — זו הפרופורציה.', en: 'Keep the waist visible — that is the proportion.' },
      notes: [
        ['dresses', 'שמלת מעטפת או גזרת עיפרון', 'A wrap dress or a sheath cut'],
        ['tops', 'עליונית שנכנסת פנימה או נגמרת במותן', 'Tops tucked in, or ending at the waist'],
        ['outerwear', 'מעיל עם חגורה, לא ישר וגזור', 'A belted coat rather than a straight cut'],
        ['proportion', 'להימנע מנפח בשני החלקים יחד', 'Avoid volume on both halves at once'],
      ],
    },
    'rectangle': {
      prop: { he: 'כתף, מותן וירך בקו דומה.', en: 'Shoulders, waist and hips run close to the same line.' },
      focus: { he: 'ליצור מותן — כאן אין מה לאזן, יש מה לבנות.', en: 'Create a waist — there is nothing to balance here, only something to build.' },
      notes: [
        ['proportion', 'חגורה מעל כל שכבה — זה השינוי היחיד שמשנה הכול', 'A belt over any layer — the one change that changes everything'],
        ['tops', 'פפלום, קשירה או גזרה שנכנסת במותן', 'Peplum, a tie, or a cut that draws in at the waist'],
        ['bottoms', 'מותן גבוהה', 'A high rise'],
        ['outerwear', 'מעיל עם חגורה', 'A belted coat'],
      ],
    },
    'apple': {
      prop: { he: 'הרוחב מרוכז במרכז הגוף.', en: 'The width is concentrated through the middle.' },
      focus: { he: 'קו אנכי ארוך, בלי לחיצה במרכז.', en: 'A long vertical line, with nothing gripping the middle.' },
      notes: [
        ['outerwear', 'שכבה ארוכה ופתוחה — קרדיגן ארוך או טרנץ׳', 'A long open layer — a long cardigan or a trench'],
        ['tops', 'נופלת ישר מהחזה, לא צמודה במותן', 'Falling straight from the bust, not clinging at the waist'],
        ['bottoms', 'מותן ישרה וגזרה נקייה', 'A straight rise and a clean cut'],
        ['proportion', 'צווארון V מאריך את קו האמצע', 'A V neckline lengthens the centre line'],
      ],
    },
    'trapezoid': {
      prop: { he: 'כתף רחבה עם מותן צרה יחסית — פרופורציה מאוזנת.', en: 'A broad shoulder with a relatively narrow waist — a balanced frame.' },
      focus: { he: 'לשמור על הקו, לא להוסיף נפח מיותר.', en: 'Keep the line and avoid adding unnecessary volume.' },
      notes: [
        ['tops', 'גזרה תואמת גוף, לא רחבה', 'A fitted cut rather than a wide one'],
        ['outerwear', 'בלייזר בגזרה מדויקת', 'A blazer cut close'],
        ['bottoms', 'רגל ישרה', 'A straight leg'],
        ['proportion', 'רוב הגזרות יעבדו — התאמה במידה חשובה יותר מכל כלל', 'Most cuts will work — fit matters more here than any rule'],
      ],
    },
  };
  NOTES.triangle = NOTES.pear;
  NOTES.oval = NOTES.apple;

  const spec = NOTES[shape] || NOTES.rectangle;

  return {
    engine: 'local',
    body: {
      shape,
      ratio,
      proportions_he: `${spec.prop.he} יחס כתף-ירך ${shRatio.toFixed(2)}, מותן ${(waistRatio * 100) | 0}% מהרחב ביותר.`,
      proportions_en: `${spec.prop.en} Shoulder-to-hip ${shRatio.toFixed(2)}, waist at ${(waistRatio * 100) | 0}% of the widest point.`,
      focus_he: spec.focus.he, focus_en: spec.focus.en,
      fit_notes: spec.notes.map(([area, he, en]) => ({ area, advice_he: he, advice_en: en })),
      confidence: clamp(0.30 + (bodyH / h) * 0.34, 0.25, 0.68),
    },
    regions,
  };
}
