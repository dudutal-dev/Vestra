/* ============================================================
   VESTRA · Try-on preview + lookbook export

   This places your catalogued pieces over the body regions detected in your
   own photo. It is a styling illustration — the garments are positioned and
   feathered into the photo, not warped onto your body — so treat it as a
   composition aid, not a photorealistic render.

   The garment photos are shot on a plain background, per the guide. Pasting
   them straight onto the body brings that background with them, which is what
   made the old preview read as a stack of rectangles. So each thumbnail is
   first cut out: flood-fill the plain surround from the border, drop it to
   transparent, and soften the resulting edge. When the background turns out
   not to be plain, the cutout is abandoned and the piece falls back to the
   feathered paste — better a soft rectangle than a garment with a hole in it.
   ============================================================ */

import { loadImage } from './makeup.js';

/* ---------------- geometry ---------------- */
const px = (box, w, h) => ({
  x: (box?.x ?? 0) * w, y: (box?.y ?? 0) * h,
  w: (box?.w ?? 0) * w, h: (box?.h ?? 0) * h,
});

const grow = (b, fx, fy) => ({
  x: b.x - b.w * fx, y: b.y - b.h * fy,
  w: b.w * (1 + fx * 2), h: b.h * (1 + fy * 2),
});

/** Slice a vertical portion of a box: part(b, 0, 0.6) = the top 60%. */
const part = (b, from, to) => ({
  x: b.x, y: b.y + b.h * from, w: b.w, h: b.h * (to - from),
});

/**
 * Where each garment category lands on the body.
 * Returns null for anything that shouldn't be painted over the photo.
 */
function placement(item, R) {
  const torso = R.torso, legs = R.legs, feet = R.feet, hips = R.hips, head = R.head;
  switch (item.category) {
    case 'top':        return torso ? part(torso, 0.06, 0.98) : null;
    case 'dress':      return torso && legs
      ? { x: torso.x, y: torso.y + torso.h * 0.06, w: torso.w, h: (legs.y + legs.h * 0.55) - (torso.y + torso.h * 0.06) }
      : torso;
    case 'outerwear':  return torso ? grow(part(torso, 0.02, 1.15), 0.10, 0) : null;
    case 'bottom':     return legs ? part(legs, 0, item.length === 'ankle' || item.subcategory === 'shorts' ? 0.45 : 0.92) : null;
    case 'activewear': return legs ? part(legs, 0, 0.9) : null;
    case 'shoes':      return feet || (legs ? part(legs, 0.92, 1) : null);
    case 'headwear':   return head ? part(head, 0, 0.55) : null;
    case 'bag':        return hips
      ? { x: hips.x + hips.w * 0.78, y: hips.y, w: hips.w * 0.52, h: hips.h * 1.1 }
      : null;
    default:           return null; // belts, jewellery — too small to read
  }
}

/* ============================================================
   Background removal
   ============================================================ */

/* Keyed on the thumbnail data URL. The opacity slider re-renders on every
   input event, and without this each drag re-decoded and re-cut every piece. */
const CUTOUTS = new Map();
const CUTOUT_LIMIT = 48;

const TOL = 38;              // per-channel distance that still counts as background
const BUSY_BORDER = 0.35;    // above this share of odd border pixels, don't try
const MIN_REMOVED = 0.06;    // below this, the cut found nothing worth having
const MAX_REMOVED = 0.94;    // above this, it ate the garment

const median = (arr) => {
  const s = Float64Array.from(arr).sort();
  return s[s.length >> 1];
};

/**
 * Cut the plain background out of a garment photo.
 * @returns {HTMLCanvasElement|null} null when the photo isn't a clean shot.
 */
function buildCutout(img) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return null;

  // Working small: the cutout is an alpha shape, and the garment is redrawn
  // from it at whatever size the body box needs.
  const S = 384;
  const scale = Math.min(1, S / Math.max(iw, ih));
  const w = Math.max(4, Math.round(iw * scale));
  const h = Math.max(4, Math.round(ih * scale));

  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);

  let image;
  try {
    image = ctx.getImageData(0, 0, w, h);
  } catch {
    return null;   // tainted canvas — leave the photo alone
  }
  const d = image.data;

  // The border ring is the background sample.
  const border = [];
  for (let x = 0; x < w; x++) { border.push(x); border.push((h - 1) * w + x); }
  for (let y = 1; y < h - 1; y++) { border.push(y * w); border.push(y * w + w - 1); }

  const br = median(border.map(i => d[i * 4]));
  const bg = median(border.map(i => d[i * 4 + 1]));
  const bb = median(border.map(i => d[i * 4 + 2]));

  const isBg = (i) => {
    const o = i * 4;
    return Math.abs(d[o] - br) <= TOL && Math.abs(d[o + 1] - bg) <= TOL && Math.abs(d[o + 2] - bb) <= TOL;
  };

  // A garment shot against a room rather than a wall has a border that doesn't
  // agree with itself. Bail before doing damage.
  let odd = 0;
  for (const i of border) if (!isBg(i)) odd++;
  if (odd / border.length > BUSY_BORDER) return null;

  // Flood-fill inwards from the border. Only background connected to the edge
  // is removed, so a white shirt button stays opaque.
  const N = w * h;
  const seen = new Uint8Array(N);
  const queue = new Int32Array(N);
  let qs = 0, qe = 0;
  for (const i of border) if (!seen[i] && isBg(i)) { seen[i] = 1; queue[qe++] = i; }

  while (qs < qe) {
    const i = queue[qs++];
    const x = i % w, y = (i / w) | 0;
    if (x > 0)     { const j = i - 1; if (!seen[j] && isBg(j)) { seen[j] = 1; queue[qe++] = j; } }
    if (x < w - 1) { const j = i + 1; if (!seen[j] && isBg(j)) { seen[j] = 1; queue[qe++] = j; } }
    if (y > 0)     { const j = i - w; if (!seen[j] && isBg(j)) { seen[j] = 1; queue[qe++] = j; } }
    if (y < h - 1) { const j = i + w; if (!seen[j] && isBg(j)) { seen[j] = 1; queue[qe++] = j; } }
  }

  const frac = qe / N;
  if (frac < MIN_REMOVED || frac > MAX_REMOVED) return null;

  for (let i = 0; i < N; i++) if (seen[i]) d[i * 4 + 3] = 0;
  softenAlpha(d, w, h);

  ctx.putImageData(image, 0, 0);
  return trim(c, d, w, h);
}

/**
 * Crop away the transparent surround.
 *
 * Without this the cutout is still the whole original frame with a hole
 * punched round the garment, so fitting it to a body box fits the empty
 * margin too and the piece lands a fraction of its proper size.
 */
function trim(canvas, d, w, h) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;

  const tw = maxX - minX + 1, th = maxY - minY + 1;
  if (tw === w && th === h) return canvas;

  const out = document.createElement('canvas');
  out.width = tw; out.height = th;
  out.getContext('2d').drawImage(canvas, minX, minY, tw, th, 0, 0, tw, th);
  return out;
}

/** One 3x3 blur pass over the alpha channel, so the cut edge isn't a staircase. */
function softenAlpha(d, w, h) {
  const src = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) src[i] = d[i * 4 + 3];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      // Interior and exterior pixels are already settled; only the rim moves.
      const a = src[i];
      if (a === 255 && src[i - 1] === 255 && src[i + 1] === 255 && src[i - w] === 255 && src[i + w] === 255) continue;
      if (a === 0 && src[i - 1] === 0 && src[i + 1] === 0 && src[i - w] === 0 && src[i + w] === 0) continue;
      const sum = src[i - w - 1] + src[i - w] + src[i - w + 1]
                + src[i - 1]     + a          + src[i + 1]
                + src[i + w - 1] + src[i + w] + src[i + w + 1];
      d[i * 4 + 3] = sum / 9;
    }
  }
}

function cutoutFor(img) {
  const key = img.src;
  if (CUTOUTS.has(key)) return CUTOUTS.get(key);
  let out = null;
  try { out = buildCutout(img); } catch { out = null; }
  if (CUTOUTS.size >= CUTOUT_LIMIT) CUTOUTS.delete(CUTOUTS.keys().next().value);
  CUTOUTS.set(key, out);
  return out;
}

/* ---------------- drawing ---------------- */

/**
 * Draw a piece into a box.
 *
 * With a cutout the shape is already the garment, so it is fitted whole
 * (contain) and drawn as-is — cropping or feathering it would only cut into
 * the silhouette. Without one, the old behaviour stands: cover-fit and feather
 * the rim so the rectangle melts into the photo instead of sitting on it.
 */
function drawPiece(ctx, img, cut, box, alpha, radius = 0.16) {
  if (!box || box.w <= 2 || box.h <= 2) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (cut) {
    const iw = cut.width, ih = cut.height;
    const s = Math.min(box.w / iw, box.h / ih);
    const dw = iw * s, dh = ih * s;
    ctx.drawImage(cut, box.x + (box.w - dw) / 2, box.y + (box.h - dh) / 2, dw, dh);
    ctx.restore();
    return;
  }

  const off = document.createElement('canvas');
  off.width = Math.max(2, Math.round(box.w));
  off.height = Math.max(2, Math.round(box.h));
  const o = off.getContext('2d');

  // cover-fit
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.max(off.width / iw, off.height / ih);
  const dw = iw * scale, dh = ih * scale;
  o.drawImage(img, (off.width - dw) / 2, (off.height - dh) / 2, dw, dh);

  // destination-in keeps only what the gradient marks as opaque.
  const g = o.createRadialGradient(
    off.width / 2, off.height / 2, 0,
    off.width / 2, off.height / 2, Math.max(off.width, off.height) * 0.62,
  );
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(1 - radius, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  o.globalCompositeOperation = 'destination-in';
  o.fillStyle = g;
  o.fillRect(0, 0, off.width, off.height);

  ctx.drawImage(off, box.x, box.y, box.w, box.h);
  ctx.restore();
}

/** Draw a mirrored copy of a piece — the second shoe of a pair. */
function drawMirrored(ctx, img, cut, box, alpha) {
  ctx.save();
  ctx.translate(box.x + box.w, box.y);
  ctx.scale(-1, 1);
  drawPiece(ctx, img, cut, { x: 0, y: 0, w: box.w, h: box.h }, alpha);
  ctx.restore();
}

/* The order pieces stack on the body — inner layers first. */
const LAYER = ['dress', 'top', 'bottom', 'activewear', 'outerwear', 'shoes', 'bag', 'headwear'];

/**
 * Paint an outfit over a body photo.
 * @returns {number} how many pieces were actually placed
 */
export async function renderTryOn(canvas, bodyPhoto, regions, items, opts = {}) {
  const alpha = Math.min(1, Math.max(0, opts.opacity ?? 0.85));
  const w = bodyPhoto.naturalWidth || bodyPhoto.width;
  const h = bodyPhoto.naturalHeight || bodyPhoto.height;
  if (!w || !h) return 0;

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(bodyPhoto, 0, 0, w, h);

  if (!regions) return 0;

  const R = Object.fromEntries(
    Object.entries(regions).map(([k, v]) => [k, px(v, w, h)]),
  );

  const ordered = [...items].sort(
    (a, b) => LAYER.indexOf(a.category) - LAYER.indexOf(b.category),
  );

  // Decode every thumbnail at once rather than one await at a time — the
  // preview used to appear piece by piece.
  const loaded = await Promise.all(ordered.map(item =>
    item.thumb
      ? loadImage(item.thumb).then(img => ({ item, img })).catch(() => null)
      : null));

  let placed = 0;
  for (const entry of loaded) {
    if (!entry) continue;                    // a broken thumbnail shouldn't sink the preview
    const { item, img } = entry;
    const box = placement(item, R);
    if (!box) continue;

    const cut = cutoutFor(img);

    // Shoes come as one photo of a pair, so one box over both feet stretches
    // them into a smear. Half the box each, the second mirrored.
    if (item.category === 'shoes' && box.w > 8) {
      const half = { x: box.x, y: box.y, w: box.w / 2, h: box.h };
      drawPiece(ctx, img, cut, half, alpha);
      drawMirrored(ctx, img, cut, { ...half, x: box.x + box.w / 2 }, alpha);
    } else {
      drawPiece(ctx, img, cut, box, alpha);
    }
    placed++;
  }
  return placed;
}

/* ============================================================
   Lookbook — a shareable card, generated at print-ish resolution
   ============================================================ */

const CLOUD = '#FBFAF7', INK = '#14110F', LINE = '#E3DDD2', MUTED = '#7A716A';

export async function renderLookbook({
  bodyPhoto = null, items = [], palette = [], title = 'VESTRA', subtitle = '', note = '', rtl = false,
}) {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = rtl ? 'right' : 'left';
  const tx = rtl ? W - 72 : 72;

  // background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, CLOUD);
  bg.addColorStop(0.55, '#F2ECE2');
  bg.addColorStop(1, '#E8DFD2');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // header
  ctx.fillStyle = INK;
  ctx.font = '600 46px Georgia, "Playfair Display", serif';
  ctx.fillText('VESTRA', tx, 92);
  ctx.fillStyle = MUTED;
  ctx.font = '500 21px Inter, Assistant, sans-serif';
  ctx.fillText(subtitle || 'Your AI Atelier', tx, 126);

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(72, 158); ctx.lineTo(W - 72, 158); ctx.stroke();

  // title
  ctx.fillStyle = INK;
  ctx.font = '500 54px Georgia, "Frank Ruhl Libre", serif';
  ctx.fillText(clip(ctx, title, W - 160), tx, 232);

  // body photo panel
  const panel = { x: 72, y: 276, w: 420, h: 700 };
  if (bodyPhoto) {
    ctx.save();
    roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 26);
    ctx.clip();
    const iw = bodyPhoto.naturalWidth || bodyPhoto.width;
    const ih = bodyPhoto.naturalHeight || bodyPhoto.height;
    const s = Math.max(panel.w / iw, panel.h / ih);
    ctx.drawImage(bodyPhoto, panel.x + (panel.w - iw * s) / 2, panel.y + (panel.h - ih * s) / 2, iw * s, ih * s);
    ctx.restore();
    ctx.strokeStyle = LINE;
    roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 26);
    ctx.stroke();
  }

  // item grid on the other side
  const gridX = bodyPhoto ? 532 : 72;
  const gridW = W - gridX - 72;
  const cols = 2;
  const cell = Math.floor((gridW - 20) / cols);
  const cellH = Math.round(cell * 1.28);

  for (const [i, item] of items.slice(0, bodyPhoto ? 4 : 8).entries()) {
    const cx = gridX + (i % cols) * (cell + 20);
    const cy = 276 + Math.floor(i / cols) * (cellH + 20);
    ctx.save();
    roundRect(ctx, cx, cy, cell, cellH, 18);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.clip();
    if (item.thumb) {
      try {
        const img = await loadImage(item.thumb);
        const iw = img.naturalWidth, ih = img.naturalHeight;
        const s = Math.max(cell / iw, cellH / ih);
        ctx.drawImage(img, cx + (cell - iw * s) / 2, cy + (cellH - ih * s) / 2, iw * s, ih * s);
      } catch { /* fall through to the empty card */ }
    }
    ctx.restore();
    ctx.strokeStyle = LINE;
    roundRect(ctx, cx, cy, cell, cellH, 18);
    ctx.stroke();
  }

  // palette
  let py = 1040;
  if (palette.length) {
    palette.slice(0, 6).forEach((p, i) => {
      const sx = rtl ? W - 72 - 56 - i * 68 : 72 + i * 68;
      ctx.fillStyle = p.hex || '#ccc';
      ctx.beginPath();
      ctx.arc(sx + 28, py + 28, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = LINE;
      ctx.stroke();
    });
    py += 92;
  }

  // note
  if (note) {
    ctx.fillStyle = MUTED;
    ctx.font = '400 23px Inter, Assistant, sans-serif';
    wrap(ctx, note, tx, py + 8, W - 160, 32, 3);
  }

  // footer rule
  ctx.strokeStyle = LINE;
  ctx.beginPath(); ctx.moveTo(72, H - 74); ctx.lineTo(W - 72, H - 74); ctx.stroke();
  ctx.fillStyle = MUTED;
  ctx.font = '600 19px Inter, Assistant, sans-serif';
  ctx.fillText('vestra · ' + new Date().toLocaleDateString(rtl ? 'he-IL' : 'en-GB'), tx, H - 38);

  return c;
}

/* ---------------- canvas text helpers ---------------- */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function clip(ctx, text, maxW) {
  let s = String(text || '');
  while (s.length > 4 && ctx.measureText(s).width > maxW) s = s.slice(0, -2);
  return s;
}

function wrap(ctx, text, x, y, maxW, lh, maxLines) {
  const words = String(text).split(/\s+/);
  let line = '', lines = 0;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y + lines * lh);
      lines++;
      line = word;
      if (lines >= maxLines) return;
    } else {
      line = test;
    }
  }
  if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lh);
}

/** Trigger a browser download for a canvas. */
export function downloadCanvas(canvas, filename) {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
}
