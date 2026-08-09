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
   ============================================================ */

const FACE_EDGE = 260;

export async function analyzeFaceLocal(shot) {
  const { data, w, h } = await sample(shot.dataUrl || shot, FACE_EDGE);
  const N = w * h;

  const skin = new Uint8Array(N);
  const lum = new Float32Array(N);
  const red = new Float32Array(N);          // Cr − Cb: how much redder than neutral
  let skinCount = 0;

  for (let i = 0; i < N; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const { y, cb, cr } = ycbcr(r, g, b);
    lum[i] = y;
    red[i] = cr - cb;
    if (isSkin(r, g, b)) { skin[i] = 1; skinCount++; }
  }

  // A face photo that is 2% skin is not a face photo.
  if (skinCount / N < 0.03) throw new AIError('unclear_photo');

  const blob = largestBlob(skin, w, h);
  if (blob.length / N < 0.02) throw new AIError('unclear_photo');

  /* --- The face within the skin region ---------------------------------
     The neck and chest are skin too and usually connect to the chin, so the
     blob is wider than the face is tall. Row widths separate them: the face
     is the broad upper mass, the neck the narrow column beneath it. */
  const rowMin = new Int32Array(h).fill(w);
  const rowMax = new Int32Array(h).fill(-1);
  const rowCount = new Int32Array(h);
  for (const i of blob) {
    const x = i % w, y = (i / w) | 0;
    if (x < rowMin[y]) rowMin[y] = x;
    if (x > rowMax[y]) rowMax[y] = x;
    rowCount[y]++;
  }

  let top = 0; while (top < h && !rowCount[top]) top++;
  let bottom = h - 1; while (bottom > top && !rowCount[bottom]) bottom--;
  if (bottom - top < 12) throw new AIError('unclear_photo');

  const widths = [];
  for (let y = top; y <= bottom; y++) widths.push(rowCount[y] ? rowMax[y] - rowMin[y] + 1 : 0);
  const maxW = Math.max(...widths);

  // Walk down from the widest row; the chin is where the face has narrowed to
  // about a third of its widest point, or where the neck pinches in.
  const widestRow = top + widths.indexOf(maxW);
  let chin = bottom;
  for (let y = widestRow; y <= bottom; y++) {
    if (widths[y - top] < maxW * 0.36) { chin = y; break; }
  }
  // A neck reads as a long stretch of roughly constant, narrow width.
  for (let y = widestRow + Math.round((bottom - widestRow) * 0.25); y <= bottom; y++) {
    if (widths[y - top] < maxW * 0.55 && y < chin) { chin = y; break; }
  }

  const faceTop = top;
  const faceBottom = clamp(chin, faceTop + 10, bottom);
  const faceH = faceBottom - faceTop;
  const faceRows = [];
  for (let y = faceTop; y <= faceBottom; y++) if (rowCount[y]) faceRows.push(y);
  const faceLeft = Math.min(...faceRows.map(y => rowMin[y]));
  const faceRight = Math.max(...faceRows.map(y => rowMax[y]));
  const faceW = faceRight - faceLeft;
  if (faceW < 12 || faceH < 12) throw new AIError('unclear_photo');

  const fcx = (faceLeft + faceRight) / 2;
  const fcy = (faceTop + faceBottom) / 2;

  /* --- Widths at three heights, which is what face shape is --- */
  const widthAt = (frac) => {
    const y = clamp(Math.round(faceTop + faceH * frac), 0, h - 1);
    return rowCount[y] ? rowMax[y] - rowMin[y] + 1 : 0;
  };
  const foreheadW = widthAt(0.22);
  const cheekW = widthAt(0.50);
  const jawW = widthAt(0.82);

  /* --- Eyes: dark, and not skin, in the upper-middle band --- */
  const eyeBand = [Math.round(faceTop + faceH * 0.28), Math.round(faceTop + faceH * 0.55)];
  const skinLum = mean(blob.map(i => lum[i]));
  const darkThreshold = skinLum * 0.72;

  const eyeCols = new Float32Array(w);
  for (let y = eyeBand[0]; y <= eyeBand[1]; y++) {
    for (let x = faceLeft; x <= faceRight; x++) {
      const i = y * w + x;
      if (!skin[i] && lum[i] < darkThreshold) eyeCols[x] += (darkThreshold - lum[i]);
    }
  }

  const pickEye = (from, to) => {
    let bx = -1, bv = 0;
    for (let x = from; x <= to; x++) if (eyeCols[x] > bv) { bv = eyeCols[x]; bx = x; }
    return bv > 0 ? bx : -1;
  };
  // Each eye lives in its own half — searching the whole face finds one eye twice.
  let eyeLx = pickEye(Math.round(faceLeft + faceW * 0.10), Math.round(fcx - faceW * 0.06));
  let eyeRx = pickEye(Math.round(fcx + faceW * 0.06), Math.round(faceRight - faceW * 0.10));
  if (eyeLx < 0) eyeLx = Math.round(fcx - faceW * 0.21);
  if (eyeRx < 0) eyeRx = Math.round(fcx + faceW * 0.21);

  /* The brow is darker than the iris and has more of it, so darkness alone
     finds the brow twice and never the eye. The sclera is what only an eye
     has: bright, and almost colourless. Look for that, and fall back to the
     lower of the two dark bands when the eyes are narrowed or the light is
     flat. */
  const isSclera = (i) => {
    if (skin[i] || lum[i] < skinLum * 0.92) return false;
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const { cb, cr } = ycbcr(r, g, b);
    return Math.abs(cb - 128) + Math.abs(cr - 128) < 26;
  };

  const eyeRowFor = (cx) => {
    const x0 = Math.round(cx - faceW * 0.08), x1 = Math.round(cx + faceW * 0.08);
    let scleraBest = eyeBand[0], scleraVal = 0;
    const dark = [];

    for (let y = eyeBand[0]; y <= eyeBand[1]; y++) {
      let s = 0, d = 0;
      for (let x = x0; x <= x1; x++) {
        const i = clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1);
        if (isSclera(i)) s++;
        if (!skin[i] && lum[i] < darkThreshold) d += (darkThreshold - lum[i]);
      }
      if (s > scleraVal) { scleraVal = s; scleraBest = y; }
      dark.push({ y, d });
    }
    if (scleraVal >= 2) return scleraBest;

    // No usable sclera. Take the two strongest dark bands and keep the lower
    // one — brows sit above eyes, never below.
    const ranked = [...dark].sort((a, b) => b.d - a.d);
    const first = ranked[0];
    if (!first || first.d <= 0) return Math.round(faceTop + faceH * 0.42);
    const apart = ranked.find(r => Math.abs(r.y - first.y) > faceH * 0.05 && r.d > first.d * 0.35);
    return apart ? Math.max(first.y, apart.y) : first.y;
  };
  const eyeLy = eyeRowFor(eyeLx);
  const eyeRy = eyeRowFor(eyeRx);
  const eyeY = (eyeLy + eyeRy) / 2;

  // How tall the dark run is at the eye column — the eye opening.
  const eyeHeightAt = (cx, cy) => {
    let n = 0;
    for (let y = Math.round(cy - faceH * 0.09); y <= Math.round(cy + faceH * 0.09); y++) {
      const i = clamp(y, 0, h - 1) * w + clamp(Math.round(cx), 0, w - 1);
      if (!skin[i] && lum[i] < darkThreshold) n++;
    }
    return Math.max(n, 2);
  };
  const eyeH = (eyeHeightAt(eyeLx, eyeLy) + eyeHeightAt(eyeRx, eyeRy)) / 2;
  const eyeW = Math.max(faceW * 0.11, 4);

  /* --- Brows: the dark band above each eye --- */
  const browRowFor = (cx, ey) => {
    let by = Math.round(ey - faceH * 0.09), bv = -1;
    for (let y = Math.round(ey - faceH * 0.16); y <= Math.round(ey - faceH * 0.04); y++) {
      let v = 0;
      for (let x = Math.round(cx - faceW * 0.08); x <= Math.round(cx + faceW * 0.08); x++) {
        const i = clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1);
        if (lum[i] < darkThreshold) v += (darkThreshold - lum[i]);
      }
      if (v > bv) { bv = v; by = y; }
    }
    return clamp(by, faceTop + 1, ey - 2);
  };
  const browLy = browRowFor(eyeLx, eyeLy);
  const browRy = browRowFor(eyeRx, eyeRy);

  /* --- Mouth: the reddest band in the lower third --- */
  const mouthBand = [Math.round(faceTop + faceH * 0.60), Math.round(faceTop + faceH * 0.90)];
  const skinRed = mean(blob.map(i => red[i]));
  let mouthY = Math.round(faceTop + faceH * 0.73), bestRed = -Infinity;
  for (let y = mouthBand[0]; y <= mouthBand[1]; y++) {
    let v = 0, n = 0;
    for (let x = Math.round(fcx - faceW * 0.20); x <= Math.round(fcx + faceW * 0.20); x++) {
      const i = clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1);
      v += red[i] - skinRed;
      n++;
    }
    const avg = n ? v / n : 0;
    if (avg > bestRed) { bestRed = avg; mouthY = y; }
  }

  // Mouth width and height from the rows that stay redder than the cheeks.
  const redderThan = skinRed + Math.max(bestRed * 0.45, 1.5);
  let mouthLeft = fcx, mouthRight = fcx;
  for (let x = Math.round(fcx - faceW * 0.30); x <= Math.round(fcx + faceW * 0.30); x++) {
    const i = mouthY * w + clamp(x, 0, w - 1);
    if (red[i] > redderThan) { mouthLeft = Math.min(mouthLeft, x); mouthRight = Math.max(mouthRight, x); }
  }
  let mouthTop = mouthY, mouthBottom = mouthY;
  for (let y = mouthBand[0]; y <= mouthBand[1]; y++) {
    let n = 0;
    for (let x = Math.round(fcx - faceW * 0.14); x <= Math.round(fcx + faceW * 0.14); x++) {
      if (red[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)] > redderThan) n++;
    }
    if (n > faceW * 0.10) { mouthTop = Math.min(mouthTop, y); mouthBottom = Math.max(mouthBottom, y); }
  }
  const mouthW = Math.max(mouthRight - mouthLeft, faceW * 0.22);
  const mouthH = Math.max(mouthBottom - mouthTop, faceH * 0.05);

  /* --- Normalise everything to the image ---------------------------------
     Regions are ellipses in image fractions: rx of width, ry of height. */
  const nx = (v) => clamp(v / w, 0, 1);
  const ny = (v) => clamp(v / h, 0, 1);
  const e = (cx, cy, rx, ry, rot = 0) => ({ cx: nx(cx), cy: ny(cy), rx: rx / w, ry: ry / h, rot });

  const eyeLnx = eyeLx, eyeRnx = eyeRx;
  const cheekY = eyeY + (mouthY - eyeY) * 0.52;
  const boneY = eyeY + (mouthY - eyeY) * 0.26;
  const outward = faceW * 0.30;

  const regions = {
    face:       e(fcx, fcy, faceW / 2, faceH / 2),
    forehead:   e(fcx, faceTop + faceH * 0.16, faceW * 0.26, faceH * 0.09),
    nose:       e(fcx, (eyeY + mouthY) / 2, faceW * 0.07, faceH * 0.11),
    chin:       e(fcx, faceBottom - faceH * 0.06, faceW * 0.13, faceH * 0.06),

    eye_left:   e(eyeLnx, eyeLy, eyeW * 0.5, eyeH * 0.5),
    eye_right:  e(eyeRnx, eyeRy, eyeW * 0.5, eyeH * 0.5),
    lid_left:   e(eyeLnx, eyeLy - eyeH * 0.75, eyeW * 0.55, eyeH * 0.65),
    lid_right:  e(eyeRnx, eyeRy - eyeH * 0.75, eyeW * 0.55, eyeH * 0.65),
    brow_left:  e(eyeLnx, browLy, eyeW * 0.62, faceH * 0.018),
    brow_right: e(eyeRnx, browRy, eyeW * 0.62, faceH * 0.018),

    cheek_left:  e(fcx - outward * 0.78, cheekY, faceW * 0.15, faceH * 0.085),
    cheek_right: e(fcx + outward * 0.78, cheekY, faceW * 0.15, faceH * 0.085),
    bone_left:   e(fcx - outward, boneY, faceW * 0.13, faceH * 0.045, -12),
    bone_right:  e(fcx + outward, boneY, faceW * 0.13, faceH * 0.045, 12),
    jaw_left:    e(fcx - faceW * 0.36, mouthY, faceW * 0.10, faceH * 0.13, -8),
    jaw_right:   e(fcx + faceW * 0.36, mouthY, faceW * 0.10, faceH * 0.13, 8),

    lips:      e((mouthLeft + mouthRight) / 2, mouthY, mouthW / 2, mouthH / 2),
    lip_upper: e((mouthLeft + mouthRight) / 2, mouthY - mouthH * 0.26, mouthW * 0.5, mouthH * 0.26),
    lip_lower: e((mouthLeft + mouthRight) / 2, mouthY + mouthH * 0.28, mouthW * 0.46, mouthH * 0.30),
  };

  /* --- The assessment --- */
  const skinPix = blob.map(i => ({ r: data[i * 4], g: data[i * 4 + 1], b: data[i * 4 + 2] }));
  const avgR = mean(skinPix.map(p => p.r));
  const avgG = mean(skinPix.map(p => p.g));
  const avgB = mean(skinPix.map(p => p.b));
  const { cb: avgCb, cr: avgCr } = ycbcr(avgR, avgG, avgB);

  const depth = skinLum > 205 ? 'fair' : skinLum > 180 ? 'light' : skinLum > 150 ? 'medium' : skinLum > 118 ? 'tan' : 'deep';

  /* Undertone is a question about hue, not about how red the skin is. All
     skin is red-dominant; what separates warm from cool is where between
     yellow and pink it sits. Human skin lands roughly 12°-45°, and the split
     runs through the middle of that. */
  const mx = Math.max(avgR, avgG, avgB), mn = Math.min(avgR, avgG, avgB);
  const chroma = mx - mn;
  const hue = chroma ? ((avgG - avgB) / chroma) * 60 : 25;   // red is the max for all skin
  const sat = mx ? chroma / mx : 0;

  let undertone = 'neutral';
  if (hue >= 32 && sat < 0.44) undertone = 'olive';
  else if (hue >= 30) undertone = 'warm';
  else if (hue <= 21) undertone = 'cool';

  const browLum = mean([browLy, browRy].map(y =>
    mean(Array.from({ length: 9 }, (_, k) =>
      lum[clamp(y, 0, h - 1) * w + clamp(Math.round(fcx - faceW * 0.2 + k * faceW * 0.05), 0, w - 1)]))));
  const spread = Math.abs(skinLum - browLum);
  const contrast = spread > 78 ? 'high' : spread > 42 ? 'medium' : 'low';

  const eyeRatio = eyeH / Math.max(eyeW, 1);
  const lidRoom = (eyeLy - browLy) / Math.max(faceH, 1);
  const eye_shape = lidRoom < 0.085 ? 'hooded' : eyeRatio > 0.48 ? 'round' : eyeRatio < 0.26 ? 'monolid' : 'almond';

  const lipRatio = mouthH / faceH;
  const lip_fullness = lipRatio > 0.085 ? 'full' : lipRatio < 0.052 ? 'thin' : 'medium';

  const aspect = faceH / Math.max(faceW, 1);
  const widthSpread = Math.max(foreheadW, cheekW, jawW) / Math.max(1, Math.min(foreheadW, cheekW, jawW));
  let shape;
  if (aspect > 1.62) shape = 'long';
  else if (aspect < 1.15) shape = 'round';
  // Three widths that barely differ is not a diamond or a heart — it is the
  // face reading the same all the way down.
  else if (widthSpread < 1.32) shape = jawW > foreheadW * 1.06 ? 'square' : 'oval';
  else if (foreheadW > jawW * 1.22) shape = 'heart';
  else if (jawW > foreheadW * 1.22) shape = 'triangle';
  else if (cheekW > foreheadW * 1.20 && cheekW > jawW * 1.20) shape = 'diamond';
  else shape = 'oval';

  const brow_shape = contrast === 'low' ? 'sparse' : spread > 90 ? 'full' : 'straight';

  // Honest about its own footing: a small face in the frame, or an eye it had
  // to guess at, should not present as a confident reading.
  const coverage = (faceW * faceH) / N;
  const confidence = clamp(0.34 + coverage * 1.4 + (bestRed > 2 ? 0.14 : 0) + (contrast !== 'low' ? 0.10 : 0), 0.25, 0.72);

  const APPLY = {
    hooded: { he: 'עפעף נפול — הנח צללית מעל הקמט, אחרת היא נעלמת כשהעין פקוחה.', en: 'Hooded lids — place shadow above the crease or it disappears when your eyes are open.' },
    round:  { he: 'עין עגולה — מתיחה החוצה בזווית החיצונית מאריכה את הצורה.', en: 'Round eyes — extend the outer corner to lengthen the shape.' },
    monolid: { he: 'מונוליד — בנה צבע בשכבות מקו הריסים כלפי מעלה, הוא צריך להיראות כשהעין פקוחה.', en: 'Monolid — build colour upward from the lash line so it reads with the eye open.' },
    almond: { he: 'עין שקדית — כמעט כל טכניקה עובדת; שמור על הקמט נקי.', en: 'Almond eyes — nearly any technique works; keep the crease clean.' },
  };

  const NOTES = {
    he: `פנים ${shape} · אנדרטון ${undertone} · עומק ${depth} · קונטרסט ${contrast}`,
    en: `${shape} face · ${undertone} undertone · ${depth} depth · ${contrast} contrast`,
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
      notes_he: NOTES.he, notes_en: NOTES.en,
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
