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
import { catName, subName } from './taxonomy.js';

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

   The card is laid out like a magazine page rather than a screenshot: one
   margin that everything hangs off, the wordmark with its own V overprinted
   in oxblood, a hairline rule carrying a short gold tick, the occasion as the
   headline, and the pieces as framed plates. The palette and the styling note
   are anchored to the bottom, so a look with three pieces and a look with
   eight both land on the same grid instead of drifting.

   Garment plates use the same cutout the try-on uses — a piece floating on
   white reads as a lookbook, the original photograph with its background
   still attached reads as a camera roll.
   ============================================================ */

const CLOUD = '#FBFAF7', PAPER = '#F3EEE6';
const INK = '#14110F', MUTED = '#7A716A', LINE = '#DFD8CC';
const OXBLOOD = '#5C1A22', GOLD = '#C7A96B';

const SERIF_LTR = '"Playfair Display", Georgia, "Times New Roman", serif';
const SERIF_RTL = '"Frank Ruhl Libre", "Playfair Display", Georgia, serif';
const SANS = 'Inter, Assistant, "Helvetica Neue", Arial, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

const HEBREW = /[\u0590-\u05FF]/;

/* The card is drawn once, at export time, so the webfonts have to be resident
   before the first fillText — otherwise the PNG ships with Georgia in it while
   the page itself shows Playfair. */
async function lookbookFonts() {
  if (!document.fonts?.load) return;
  const faces = [
    '600 94px "Playfair Display"', '500 58px "Playfair Display"', '400 25px "Playfair Display"',
    '500 58px "Frank Ruhl Libre"', '400 25px "Frank Ruhl Libre"',
    '600 17px Inter', '400 25px Inter',
  ];
  try { await Promise.all(faces.map(f => document.fonts.load(f))); } catch { /* fall back to the stack */ }
}

export async function renderLookbook({
  bodyPhoto = null, items = [], palette = [], headline = '', meta = [], note = '', rtl = false,
}) {
  await lookbookFonts();

  const W = 1080, H = 1350, M = 96;
  const inner = W - M * 2;
  const serif = rtl ? SERIF_RTL : SERIF_LTR;
  const near = rtl ? W - M : M;                 // the reading edge
  const far = rtl ? M : W - M;

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ground(ctx, W, H, rtl);

  /* ---- masthead ---- */
  const markFont = '600 94px ' + SERIF_LTR;     // the wordmark is Latin in both languages
  const markW = span(ctx, 'VESTRA', markFont, 2);
  const markLeft = rtl ? near - markW : near;
  line(ctx, 'VESTRA', { x: markLeft, y: 88, font: markFont, color: INK, track: 2 });
  line(ctx, 'V', { x: markLeft, y: 88, font: markFont, color: OXBLOOD });
  line(ctx, rtl ? 'ארון · סטייל · אופנה' : 'WARDROBE · STYLE · FASHION',
    { x: near, y: 118, font: '600 17px ' + SANS, color: MUTED, track: 7, anchor: 'start', rtl });

  rule(ctx, M, W - M, 140, LINE, 2);
  rule(ctx, near, rtl ? near - 120 : near + 120, 140, GOLD, 3);

  /* ---- the occasion, as the headline ---- */
  line(ctx, headline, { x: near, y: 222, font: '500 58px ' + serif, color: INK, anchor: 'start', rtl, maxW: inner });
  if (meta.length) {
    line(ctx, meta.join('  ·  '), { x: near, y: 262, font: '400 16px ' + MONO, color: MUTED, track: 4, anchor: 'start', rtl, maxW: inner });
  }

  /* ---- the plates ---- */
  const top = 322, bottom = 942;
  const shown = items.slice(0, bodyPhoto ? 4 : 8);

  if (bodyPhoto) {
    const pw = 400, gap = 24;
    const px0 = rtl ? W - M - pw : M;
    plate(ctx, px0, top, pw, bottom - top, () => cover(ctx, bodyPhoto, px0, top, pw, bottom - top));

    const gw = inner - pw - gap;
    const gx0 = rtl ? M : M + pw + gap;
    const cellW = (gw - 20) / 2, cellH = (bottom - top - 20) / 2;
    for (const [i, item] of shown.entries()) {
      const col = i % 2, row = (i / 2) | 0;
      const x = gx0 + (rtl ? 1 - col : col) * (cellW + 20);
      await garmentPlate(ctx, item, x, top + row * (cellH + 20), cellW, cellH, rtl);
    }
  } else {
    // No body photo: the plates are the whole picture, so size them to the count.
    const cols = shown.length <= 3 ? Math.max(1, shown.length) : 4;
    const rows = Math.ceil(shown.length / cols) || 1;
    const gap = 22;
    const cellW = (inner - gap * (cols - 1)) / cols;
    const cellH = Math.min((bottom - top - gap * (rows - 1)) / rows, cellW * 1.42);
    // The row hangs from the top of the band, so a three-piece look spends its
    // spare height as one open field rather than two half-gaps.
    const y0 = top;
    for (const [i, item] of shown.entries()) {
      const col = i % cols, row = (i / cols) | 0;
      const x = M + (rtl ? cols - 1 - col : col) * (cellW + gap);
      await garmentPlate(ctx, item, x, y0 + row * (cellH + gap), cellW, cellH, rtl);
    }
  }

  /* ---- palette ---- */
  if (palette.length) {
    line(ctx, rtl ? 'פלטה' : 'PALETTE', { x: near, y: 1012, font: '600 16px ' + SANS, color: MUTED, track: 6, anchor: 'start', rtl });
    const r = 25, step = r * 2 + 17;
    palette.slice(0, 6).forEach((p, i) => {
      const cx = rtl ? near - r - i * step : near + r + i * step;
      ctx.beginPath();
      ctx.arc(cx, 1050, r, 0, Math.PI * 2);
      ctx.fillStyle = p.hex || '#ccc';
      ctx.fill();
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }

  /* ---- the styling note ---- */
  if (note) {
    rule(ctx, M, W - M, 1092, LINE, 1);
    line(ctx, rtl ? 'למה זה עובד' : 'WHY IT WORKS',
      { x: near, y: 1126, font: '600 16px ' + SANS, color: OXBLOOD, track: 6, anchor: 'start', rtl });
    block(ctx, note, { x: near, y: 1168, font: '400 24px ' + serif, color: INK, maxW: inner, lh: 37, lines: 3, rtl });
  }

  /* ---- footer ---- */
  rule(ctx, M, W - M, 1286, LINE, 1);
  line(ctx, rtl ? 'נבנה מהארון שלך' : 'BUILT FROM YOUR OWN WARDROBE',
    { x: near, y: 1320, font: '600 16px ' + SANS, color: MUTED, track: 5, anchor: 'start', rtl });
  line(ctx, 'vestra', { x: far, y: 1320, font: '400 24px ' + SERIF_LTR, color: INK, anchor: 'end', rtl });

  grain(ctx, W, H);
  return c;
}

/* ---------------- lookbook parts ---------------- */

/** Warm paper, lit from the masthead corner — which swaps sides with the script. */
function ground(ctx, W, H, rtl) {
  const litX = rtl ? W * 0.82 : W * 0.18;
  const shadeX = W - litX;

  const g = ctx.createLinearGradient(rtl ? W : 0, 0, rtl ? W * 0.65 : W * 0.35, H);
  g.addColorStop(0, CLOUD);
  g.addColorStop(0.62, '#F7F3EC');
  g.addColorStop(1, PAPER);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const lit = ctx.createRadialGradient(litX, H * 0.10, 0, litX, H * 0.10, W * 0.62);
  lit.addColorStop(0, 'rgba(255,255,255,0.55)');
  lit.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = lit;
  ctx.fillRect(0, 0, W, H);

  const shade = ctx.createRadialGradient(shadeX, H * 0.97, 0, shadeX, H * 0.97, W * 0.55);
  shade.addColorStop(0, 'rgba(233,224,211,0.55)');
  shade.addColorStop(1, 'rgba(233,224,211,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
}

/** A white card with a hairline edge; `paint` runs clipped to it. */
function plate(ctx, x, y, w, h, paint) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 14);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.clip();
  paint();
  ctx.restore();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, 14);
  ctx.stroke();
}

/**
 * One garment, framed.
 *
 * The piece sits on a warm inner panel rather than straight on the white card:
 * an ivory shirt cut out onto white leaves nothing to look at, and a photo
 * whose own background survived the cut needs its rectangle to look intended.
 * One panel solves both.
 */
async function garmentPlate(ctx, item, x, y, w, h, rtl) {
  const padX = w * 0.09, padTop = h * 0.06, padBottom = h * 0.20;
  let img = null;
  if (item?.thumb) { try { img = await loadImage(item.thumb); } catch { img = null; } }

  plate(ctx, x, y, w, h, () => {
    const bx = x + padX, by = y + padTop, bw = w - padX * 2, bh = h - padTop - padBottom;
    ctx.save();
    roundRect(ctx, bx, by, bw, bh, 8);
    ctx.fillStyle = '#F4F0E8';
    ctx.fill();
    ctx.clip();
    if (img) {
      const cut = cutoutFor(img);
      if (cut) contain(ctx, cut, bx + bw * 0.06, by + bh * 0.06, bw * 0.88, bh * 0.88);
      else cover(ctx, img, bx, by, bw, bh);
    }
    ctx.restore();
  });

  // The subcategory says more than the category — "silk shirt", not "tops".
  const label = String(item ? (subName(item.subcategory) || catName(item.category)) : '').replace(/-/g, ' ');
  if (label) {
    const he = HEBREW.test(label);
    line(ctx, he ? label : label.toUpperCase(), {
      x: x + w / 2, y: y + h - padBottom * 0.42, font: '600 14px ' + SANS,
      color: MUTED, track: he ? 0 : 4, anchor: 'center', rtl, maxW: w - 16,
    });
  }
}

function cover(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const s = Math.max(w / iw, h / ih);
  ctx.drawImage(img, x + (w - iw * s) / 2, y + (h - ih * s) / 2, iw * s, ih * s);
}

function contain(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const s = Math.min(w / iw, h / ih);
  ctx.drawImage(img, x + (w - iw * s) / 2, y + (h - ih * s) / 2, iw * s, ih * s);
}

function rule(ctx, x0, x1, y, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(Math.min(x0, x1), y);
  ctx.lineTo(Math.max(x0, x1), y);
  ctx.stroke();
}

/**
 * Paper is never perfectly flat, and a canvas gradient is. A few levels of
 * noise keep the wide fields from banding on a phone screen.
 */
function grain(ctx, W, H, amount = 3) {
  let image;
  try { image = ctx.getImageData(0, 0, W, H); } catch { return; }
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount * 2;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(image, 0, 0);
}

/* ---------------- canvas typography ---------------- */

/** Width of a run, including the gaps that tracking adds between letters. */
function span(ctx, text, font, track = 0) {
  ctx.font = font;
  return ctx.measureText(text).width + track * Math.max(0, text.length - 1);
}

/**
 * One line of type.
 *
 * `x` is an edge, and `anchor` says which one in reading terms: 'start' is the
 * left in English and the right in Hebrew, so a single layout serves both.
 * Tracking is drawn letter by letter because `ctx.letterSpacing` still isn't
 * everywhere — and it is dropped for Hebrew, where spacing the letters out
 * only makes the word harder to read.
 */
function line(ctx, text, { x, y, font, color, track = 0, anchor = 'start', rtl = false, maxW = 0 }) {
  let s = String(text ?? '');
  if (!s) return;
  ctx.font = font;
  ctx.fillStyle = color;
  const sp = HEBREW.test(s) ? 0 : track;
  if (maxW) s = clip(ctx, s, maxW, sp);

  const w = span(ctx, s, font, sp);
  let left;
  if (anchor === 'center') left = x - w / 2;
  else if ((anchor === 'start') === !rtl) left = x;
  else left = x - w;

  if (!sp) { ctx.fillText(s, left, y); return; }
  let cx = left;
  for (const ch of s) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + sp;
  }
}

/** Wrapped type, same edge rules as `line`. Overflow is trimmed with an ellipsis. */
function block(ctx, text, { x, y, font, color, maxW, lh, lines = 3, rtl = false }) {
  ctx.font = font;
  const words = String(text).split(/\s+/).filter(Boolean);
  const out = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? cur + ' ' + word : word;
    if (cur && ctx.measureText(test).width > maxW) {
      out.push(cur);
      cur = word;
      if (out.length === lines) break;
    } else {
      cur = test;
    }
  }
  if (out.length < lines && cur) out.push(cur);
  if (out.length === lines && cur && out[lines - 1] !== cur) {
    out[lines - 1] = clip(ctx, out[lines - 1] + ' ' + cur, maxW, 0, '…');
  }
  out.forEach((l, i) => line(ctx, l, { x, y: y + i * lh, font, color, anchor: 'start', rtl }));
}

/* ---------------- canvas shape helpers ---------------- */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Shorten a run until it fits `maxW` at the given tracking. */
function clip(ctx, text, maxW, track = 0, suffix = '') {
  let s = String(text || '');
  const fits = (v) => ctx.measureText(v).width + track * Math.max(0, v.length - 1) <= maxW;
  if (fits(s + suffix)) return s + suffix;
  while (s.length > 1 && !fits(s + suffix)) s = s.slice(0, -1);
  return s.trimEnd() + suffix;
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
