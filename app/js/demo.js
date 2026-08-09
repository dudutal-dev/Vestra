/* ============================================================
   VESTRA · Sample wardrobe

   A coherent capsule to try the app against before you have catalogued
   anything of your own — enough pieces, at enough formality levels, that the
   Studio can actually close a look and the health report has something to
   count.

   The garments are drawn here rather than shipped as image files. That keeps
   the repository free of two dozen photographs, and it means the thumbnails
   are laid flat on a plain near-white ground — exactly the shot the guide asks
   you for, which is also exactly what the try-on's background cutout expects.

   Every piece is tagged `demo: true`, so the sample can be removed later
   without touching anything you added yourself.
   ============================================================ */

import { Items, newId } from './store.js';

export const DEMO_TAG = 'demo';

/* ---------------- drawing ---------------- */
const W = 480, H = 600;
const GROUND = '#FAF8F5';

function surface() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = GROUND;
  g.fillRect(0, 0, W, H);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  return { c, g };
}

/** Slightly darker than the garment, for seams and folds. */
function shadeOf(hex, f) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return '#999';
  const [r, gg, b] = [1, 2, 3].map(i => Math.round(parseInt(m[i], 16) * f));
  return `rgb(${Math.min(r, 255)},${Math.min(gg, 255)},${Math.min(b, 255)})`;
}

const path = (g, pts, close = true) => {
  g.beginPath();
  g.moveTo(pts[0][0] * W, pts[0][1] * H);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] * W, pts[i][1] * H);
  if (close) g.closePath();
};

const fillPath = (g, pts, color) => { path(g, pts); g.fillStyle = color; g.fill(); };

const seam = (g, pts, color) => {
  path(g, pts, false);
  g.strokeStyle = color;
  g.lineWidth = 3;
  g.stroke();
};

/* ---------------- garment shapes ---------------- */

/**
 * Tops, from a tee to a blazer. `sleeve` sets the arm length, `open` draws a
 * front opening (a jacket rather than a pullover), `long` extends the hem.
 */
function drawTop(g, color, { sleeve = 'short', open = false, long = false, collar = false, hood = false } = {}) {
  const dark = shadeOf(color, 0.82);
  const hem = long ? 0.86 : 0.74;
  const sleeveEnd = sleeve === 'none' ? 0.30 : sleeve === 'short' ? 0.44 : 0.66;
  const sleeveOut = sleeve === 'none' ? 0.20 : 0.09;

  // body
  fillPath(g, [
    [0.28, 0.20], [0.72, 0.20], [0.76, hem], [0.24, hem],
  ], color);

  // sleeves
  if (sleeve !== 'none') {
    fillPath(g, [[0.28, 0.20], [0.30, 0.19], [0.12, sleeveEnd], [0.05, sleeveEnd - 0.03]], color);
    fillPath(g, [[0.72, 0.20], [0.70, 0.19], [0.88, sleeveEnd], [0.95, sleeveEnd - 0.03]], color);
  } else {
    fillPath(g, [[0.28, 0.20], [0.24, 0.20 + sleeveOut], [0.28, 0.20 + sleeveOut]], color);
    fillPath(g, [[0.72, 0.20], [0.76, 0.20 + sleeveOut], [0.72, 0.20 + sleeveOut]], color);
  }

  // shoulders and neckline
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0.28 * W, 0.20 * H);
  g.quadraticCurveTo(0.50 * W, 0.15 * H, 0.72 * W, 0.20 * H);
  g.lineTo(0.72 * W, 0.24 * H);
  g.quadraticCurveTo(0.50 * W, 0.19 * H, 0.28 * W, 0.24 * H);
  g.closePath();
  g.fill();

  g.fillStyle = GROUND;
  g.beginPath();
  g.ellipse(0.5 * W, 0.20 * H, 0.10 * W, 0.035 * H, 0, 0, Math.PI * 2);
  g.fill();

  if (hood) {
    g.fillStyle = dark;
    g.beginPath();
    g.ellipse(0.5 * W, 0.19 * H, 0.17 * W, 0.055 * H, 0, Math.PI, Math.PI * 2);
    g.fill();
  }

  if (collar) {
    fillPath(g, [[0.42, 0.185], [0.50, 0.27], [0.58, 0.185], [0.50, 0.21]], dark);
  }

  if (open) {
    // lapels and the gap between the two front panels
    fillPath(g, [[0.50, 0.20], [0.38, 0.34], [0.46, hem], [0.50, hem]], shadeOf(color, 0.92));
    fillPath(g, [[0.50, 0.20], [0.62, 0.34], [0.54, hem], [0.50, hem]], shadeOf(color, 0.92));
    seam(g, [[0.50, 0.24], [0.50, hem]], dark);
    fillPath(g, [[0.44, 0.20], [0.50, 0.33], [0.56, 0.20]], dark);
  } else {
    seam(g, [[0.30, hem - 0.02], [0.70, hem - 0.02]], dark);
  }
}

/** Trousers and jeans. `wide` opens the leg, `crop` shortens it. */
function drawTrousers(g, color, { wide = false, crop = false } = {}) {
  const dark = shadeOf(color, 0.84);
  const hem = crop ? 0.76 : 0.90;
  const out = wide ? 0.20 : 0.13;

  fillPath(g, [[0.30, 0.14], [0.70, 0.14], [0.72, 0.36], [0.28, 0.36]], color);   // rise
  fillPath(g, [[0.28, 0.36], [0.49, 0.36], [0.50 - out * 0.15, hem], [0.34 - out * 0.5, hem]], color);
  fillPath(g, [[0.51, 0.36], [0.72, 0.36], [0.66 + out * 0.5, hem], [0.50 + out * 0.15, hem]], color);
  seam(g, [[0.50, 0.20], [0.50, 0.36]], dark);
  seam(g, [[0.30, 0.19], [0.70, 0.19]], dark);   // waistband
}

/** Skirts. `length` is the hem as a fraction of the frame. */
function drawSkirt(g, color, { length = 0.72, aline = true } = {}) {
  const dark = shadeOf(color, 0.84);
  const flare = aline ? 0.16 : 0.02;
  fillPath(g, [
    [0.33, 0.18], [0.67, 0.18], [0.67 + flare, length], [0.33 - flare, length],
  ], color);
  seam(g, [[0.33, 0.22], [0.67, 0.22]], dark);
}

/** Dresses — a top and a skirt in one silhouette. */
function drawDress(g, color, { sleeve = 'none', length = 0.90, flare = 0.10 } = {}) {
  const dark = shadeOf(color, 0.84);
  fillPath(g, [
    [0.32, 0.18], [0.68, 0.18], [0.66, 0.44], [0.66 + flare, length], [0.34 - flare, length], [0.34, 0.44],
  ], color);
  if (sleeve !== 'none') {
    fillPath(g, [[0.32, 0.18], [0.34, 0.17], [0.16, 0.42], [0.09, 0.39]], color);
    fillPath(g, [[0.68, 0.18], [0.66, 0.17], [0.84, 0.42], [0.91, 0.39]], color);
  }
  g.fillStyle = GROUND;
  g.beginPath();
  g.ellipse(0.5 * W, 0.185 * H, 0.09 * W, 0.03 * H, 0, 0, Math.PI * 2);
  g.fill();
  seam(g, [[0.34, 0.44], [0.66, 0.44]], dark);   // waist
}

/**
 * Shoes, in side profile: heel on the left, toe on the right, all standing on
 * the same ground line so the set reads as one photographed group.
 */
function drawShoe(g, color, { kind = 'sneaker' } = {}) {
  const dark = shadeOf(color, 0.76);
  const G = 0.66;                        // the ground
  const x = (v) => v * W, y = (v) => v * H;

  /** A sole slab under the shoe, rounded at both ends. */
  const sole = (x0, x1, thick, col) => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(x(x0), y(G));
    g.lineTo(x(x1), y(G));
    g.quadraticCurveTo(x(x1 + 0.025), y(G + thick / 2), x(x1 - 0.01), y(G + thick));
    g.lineTo(x(x0 + 0.01), y(G + thick));
    g.quadraticCurveTo(x(x0 - 0.025), y(G + thick / 2), x(x0), y(G));
    g.closePath();
    g.fill();
  };

  if (kind === 'heel') {
    // pointed pump: a long vamp, a low-cut throat, a stiletto under the heel
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x(0.24), y(G));
    g.bezierCurveTo(x(0.22), y(0.50), x(0.26), y(0.42), x(0.36), y(0.42));   // heel counter
    g.bezierCurveTo(x(0.44), y(0.42), x(0.46), y(0.52), x(0.56), y(0.56));   // throat
    g.bezierCurveTo(x(0.68), y(0.60), x(0.78), y(0.63), x(0.86), y(G));      // vamp to the toe
    g.closePath();
    g.fill();
    // the heel itself
    g.fillStyle = dark;
    g.beginPath();
    g.moveTo(x(0.245), y(G));
    g.lineTo(x(0.325), y(G));
    g.lineTo(x(0.30), y(0.84));
    g.lineTo(x(0.265), y(0.84));
    g.closePath();
    g.fill();
    sole(0.30, 0.86, 0.018, dark);

  } else if (kind === 'boot') {
    // ankle boot: a shaft, then the same foot as the flat
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x(0.26), y(0.28));
    g.lineTo(x(0.50), y(0.28));
    g.bezierCurveTo(x(0.52), y(0.44), x(0.54), y(0.52), x(0.62), y(0.56));
    g.bezierCurveTo(x(0.74), y(0.60), x(0.82), y(0.63), x(0.86), y(G));
    g.lineTo(x(0.24), y(G));
    g.closePath();
    g.fill();
    seam(g, [[0.26, 0.31], [0.50, 0.31]], dark);
    sole(0.235, 0.865, 0.035, dark);

  } else if (kind === 'sandal') {
    // a footbed with a toe strap and an ankle strap
    sole(0.22, 0.86, 0.032, dark);
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x(0.22), y(G));
    g.lineTo(x(0.86), y(G));
    g.lineTo(x(0.86), y(G - 0.022));
    g.lineTo(x(0.22), y(G - 0.022));
    g.closePath();
    g.fill();
    g.strokeStyle = color;
    g.lineWidth = 13;
    g.beginPath();                                    // toe strap
    g.moveTo(x(0.60), y(G - 0.02));
    g.quadraticCurveTo(x(0.70), y(0.56), x(0.80), y(G - 0.02));
    g.stroke();
    g.beginPath();                                    // ankle strap
    g.moveTo(x(0.28), y(G - 0.02));
    g.quadraticCurveTo(x(0.34), y(0.50), x(0.44), y(0.50));
    g.stroke();

  } else if (kind === 'flat') {
    // loafer: a low rounded upper with a saddle band across the vamp
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x(0.24), y(G));
    g.bezierCurveTo(x(0.22), y(0.52), x(0.28), y(0.47), x(0.40), y(0.47));
    g.bezierCurveTo(x(0.50), y(0.47), x(0.54), y(0.54), x(0.64), y(0.57));
    g.bezierCurveTo(x(0.76), y(0.60), x(0.83), y(0.63), x(0.87), y(G));
    g.closePath();
    g.fill();
    g.strokeStyle = dark;
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(x(0.44), y(0.475));
    g.lineTo(x(0.52), y(0.545));
    g.stroke();
    sole(0.235, 0.875, 0.03, dark);

  } else {
    // sneaker: a tall rounded upper on a pale midsole
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x(0.20), y(G));
    g.bezierCurveTo(x(0.19), y(0.50), x(0.24), y(0.42), x(0.36), y(0.42));   // heel collar
    g.lineTo(x(0.50), y(0.44));
    g.bezierCurveTo(x(0.60), y(0.48), x(0.72), y(0.55), x(0.84), y(G));      // vamp
    g.closePath();
    g.fill();
    g.strokeStyle = dark;
    g.lineWidth = 5;
    for (const [a, b] of [[0.44, 0.52], [0.50, 0.57], [0.56, 0.61]]) {       // laces
      g.beginPath();
      g.moveTo(x(a), y(0.455));
      g.lineTo(x(b), y(0.545));
      g.stroke();
    }
    sole(0.19, 0.85, 0.055, '#EFEBE3');
    g.strokeStyle = '#D8D2C6';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x(0.20), y(G + 0.03));
    g.lineTo(x(0.845), y(G + 0.03));
    g.stroke();
  }
}

/** Bags. */
function drawBag(g, color, { kind = 'tote' } = {}) {
  const dark = shadeOf(color, 0.78);
  if (kind === 'clutch') {
    fillPath(g, [[0.24, 0.42], [0.76, 0.42], [0.76, 0.60], [0.24, 0.60]], color);
    seam(g, [[0.24, 0.48], [0.76, 0.48]], dark);
  } else if (kind === 'crossbody') {
    fillPath(g, [[0.32, 0.42], [0.68, 0.42], [0.68, 0.64], [0.32, 0.64]], color);
    fillPath(g, [[0.32, 0.42], [0.68, 0.42], [0.68, 0.50], [0.32, 0.50]], dark);
    g.strokeStyle = dark; g.lineWidth = 6;
    g.beginPath();
    g.moveTo(0.34 * W, 0.44 * H);
    g.quadraticCurveTo(0.50 * W, 0.14 * H, 0.66 * W, 0.44 * H);
    g.stroke();
  } else {
    fillPath(g, [[0.26, 0.40], [0.74, 0.40], [0.70, 0.72], [0.30, 0.72]], color);
    g.strokeStyle = dark; g.lineWidth = 8;
    for (const x of [0.38, 0.62]) {
      g.beginPath();
      g.moveTo(x * W, 0.41 * H);
      g.quadraticCurveTo((x < 0.5 ? 0.44 : 0.56) * W, 0.24 * H, (x < 0.5 ? 0.50 : 0.50) * W, 0.30 * H);
      g.stroke();
    }
  }
}

/** Small pieces — a belt, a scarf, a necklace, a cap. */
function drawAccessory(g, color, { kind = 'belt' } = {}) {
  const dark = shadeOf(color, 0.75);
  if (kind === 'belt') {
    g.strokeStyle = color; g.lineWidth = 26;
    g.beginPath();
    g.moveTo(0.14 * W, 0.50 * H);
    g.lineTo(0.86 * W, 0.50 * H);
    g.stroke();
    g.strokeStyle = '#C7A96B'; g.lineWidth = 8;
    g.strokeRect(0.44 * W, 0.44 * H, 0.13 * W, 0.12 * H);
  } else if (kind === 'scarf') {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0.22 * W, 0.30 * H);
    g.quadraticCurveTo(0.50 * W, 0.52 * H, 0.78 * W, 0.30 * H);
    g.lineTo(0.78 * W, 0.44 * H);
    g.quadraticCurveTo(0.50 * W, 0.66 * H, 0.22 * W, 0.44 * H);
    g.closePath();
    g.fill();
    seam(g, [[0.28, 0.36], [0.72, 0.36]], dark);
  } else if (kind === 'necklace') {
    g.strokeStyle = color; g.lineWidth = 7;
    g.beginPath();
    g.moveTo(0.30 * W, 0.30 * H);
    g.quadraticCurveTo(0.50 * W, 0.62 * H, 0.70 * W, 0.30 * H);
    g.stroke();
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(0.50 * W, 0.545 * H, 0.045 * W, 0.045 * H, 0, 0, Math.PI * 2);
    g.fill();
  } else {
    // cap
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(0.50 * W, 0.50 * H, 0.20 * W, 0.13 * H, 0, Math.PI, Math.PI * 2);
    g.fill();
    fillPath(g, [[0.50, 0.485], [0.84, 0.49], [0.84, 0.53], [0.50, 0.515]], dark);
  }
}

const DRAW = {
  top: drawTop, trousers: drawTrousers, skirt: drawSkirt, dress: drawDress,
  shoe: drawShoe, bag: drawBag, accessory: drawAccessory,
};

function thumbFor(spec) {
  const { c, g } = surface();
  DRAW[spec.shape](g, spec.hex, spec.opts || {});
  return c.toDataURL('image/jpeg', 0.9);
}

/* ---------------- the capsule ----------------
   Neutral-led, with three accents, spanning formality 2 to 6 — enough that
   errands and a black-tie evening both resolve from the same closet. */
const PIECES = [
  { shape: 'top', hex: '#F4F1EA', opts: { sleeve: 'short' },
    category: 'top', subcategory: 't-shirt', name_he: 'טי שירט לבנה', name_en: 'White tee',
    color: ['לבן', 'white'], family: 'white', fabric: 'cotton', formality: 2, fit: 'regular',
    sleeve: 'short', season: ['spring', 'summer'], vs: 88, trend: 'timeless' },

  { shape: 'top', hex: '#1C2B45', opts: { sleeve: 'long', collar: true },
    category: 'top', subcategory: 'button-down', name_he: 'חולצה מכופתרת נייבי', name_en: 'Navy button-down',
    color: ['נייבי', 'navy'], family: 'neutral', fabric: 'cotton', formality: 4, fit: 'tailored',
    sleeve: 'long', season: ['spring', 'fall', 'winter'], vs: 82, trend: 'timeless' },

  { shape: 'top', hex: '#EDE3D2', opts: { sleeve: 'long' },
    category: 'top', subcategory: 'blouse', name_he: 'בלוזת משי שמנת', name_en: 'Cream silk blouse',
    color: ['שמנת', 'cream'], family: 'neutral', fabric: 'silk', formality: 4, fit: 'regular',
    sleeve: 'long', season: ['spring', 'summer', 'fall'], vs: 76, trend: 'current-2026' },

  { shape: 'top', hex: '#7C4A52', opts: { sleeve: 'long' },
    category: 'top', subcategory: 'knit-sweater', name_he: 'סוודר קשמיר אוקסבלד', name_en: 'Oxblood cashmere knit',
    color: ['אוקסבלד', 'oxblood'], family: 'jewel', fabric: 'cashmere', formality: 3, fit: 'relaxed',
    sleeve: 'long', weight: 'heavy', season: ['fall', 'winter'], vs: 64, trend: 'current-2026' },

  { shape: 'top', hex: '#3E3B37', opts: { sleeve: 'long', hood: true },
    category: 'top', subcategory: 'hoodie', name_he: 'קפוצ׳ון גרפיט', name_en: 'Graphite hoodie',
    color: ['גרפיט', 'graphite'], family: 'neutral', fabric: 'jersey', formality: 1, fit: 'oversized',
    sleeve: 'long', season: ['fall', 'winter'], vs: 48, trend: 'timeless' },

  { shape: 'top', hex: '#2A2A2C', opts: { sleeve: 'long', open: true },
    category: 'outerwear', subcategory: 'blazer', name_he: 'בלייזר שחור לא-מובנה', name_en: 'Unstructured black blazer',
    color: ['שחור', 'black'], family: 'monochrome-black', fabric: 'wool', formality: 4, fit: 'relaxed',
    sleeve: 'long', season: ['spring', 'fall', 'winter'], vs: 90, trend: 'current-2026' },

  { shape: 'top', hex: '#B99566', opts: { sleeve: 'long', open: true, long: true },
    category: 'outerwear', subcategory: 'trench', name_he: 'טרנץ׳ קאמל', name_en: 'Camel trench',
    color: ['קאמל', 'camel'], family: 'neutral', fabric: 'cotton', formality: 4, fit: 'regular',
    sleeve: 'long', season: ['spring', 'fall'], vs: 78, trend: 'timeless' },

  { shape: 'top', hex: '#4A4E42', opts: { sleeve: 'long', open: true },
    category: 'outerwear', subcategory: 'denim-jacket', name_he: 'ג׳קט אוליב', name_en: 'Olive jacket',
    color: ['אוליב', 'olive'], family: 'earth', fabric: 'denim', formality: 2, fit: 'regular',
    sleeve: 'long', season: ['spring', 'fall'], vs: 58, trend: 'rising' },

  { shape: 'trousers', hex: '#33405C', opts: {},
    category: 'bottom', subcategory: 'jeans', name_he: 'ג׳ינס אינדיגו ישר', name_en: 'Straight indigo jeans',
    color: ['אינדיגו', 'indigo'], family: 'neutral', fabric: 'denim', formality: 2, fit: 'regular',
    season: ['spring', 'fall', 'winter'], vs: 86, trend: 'timeless' },

  { shape: 'trousers', hex: '#35373B', opts: {},
    category: 'bottom', subcategory: 'tailored-trousers', name_he: 'מכנסי חליפה פחם', name_en: 'Charcoal tailored trousers',
    color: ['פחם', 'charcoal'], family: 'neutral', fabric: 'wool', formality: 4, fit: 'tailored',
    season: ['fall', 'winter', 'spring'], vs: 80, trend: 'current-2026' },

  { shape: 'trousers', hex: '#E4DACA', opts: { wide: true, crop: true },
    category: 'bottom', subcategory: 'wide-leg', name_he: 'מכנסי פשתן רחבים', name_en: 'Wide linen trousers',
    color: ['חול', 'sand'], family: 'neutral', fabric: 'linen', formality: 3, fit: 'wide',
    weight: 'light', season: ['summer', 'spring'], vs: 66, trend: 'current-2026' },

  { shape: 'skirt', hex: '#232326', opts: { length: 0.78, aline: false },
    category: 'bottom', subcategory: 'pencil-skirt', name_he: 'חצאית עיפרון שחורה', name_en: 'Black pencil skirt',
    color: ['שחור', 'black'], family: 'monochrome-black', fabric: 'wool', formality: 4, fit: 'slim',
    length: 'midi', season: ['fall', 'winter', 'spring'], vs: 62, trend: 'timeless' },

  { shape: 'skirt', hex: '#8E6F4E', opts: { length: 0.84 },
    category: 'bottom', subcategory: 'midi-skirt', name_he: 'חצאית מידי טאופ', name_en: 'Taupe midi skirt',
    color: ['טאופ', 'taupe'], family: 'earth', fabric: 'viscose', formality: 3, fit: 'regular',
    length: 'midi', season: ['spring', 'summer', 'fall'], vs: 60, trend: 'rising' },

  { shape: 'dress', hex: '#5A1E27', opts: { length: 0.93, flare: 0.12 },
    category: 'dress', subcategory: 'evening-gown', name_he: 'שמלת ערב אוקסבלד', name_en: 'Oxblood evening gown',
    color: ['אוקסבלד', 'oxblood'], family: 'jewel', fabric: 'satin', formality: 6, fit: 'slim',
    sleeve: 'sleeveless', length: 'maxi', season: ['fall', 'winter'], vs: 34, trend: 'current-2026' },

  { shape: 'dress', hex: '#2B2B2E', opts: { sleeve: 'long', length: 0.80, flare: 0.06 },
    category: 'dress', subcategory: 'sheath-dress', name_he: 'שמלת מעטפת שחורה', name_en: 'Black sheath dress',
    color: ['שחור', 'black'], family: 'monochrome-black', fabric: 'viscose', formality: 5, fit: 'tailored',
    sleeve: 'long', length: 'midi', season: ['fall', 'winter', 'spring'], vs: 70, trend: 'timeless' },

  { shape: 'dress', hex: '#C6A9A0', opts: { length: 0.86, flare: 0.08 },
    category: 'dress', subcategory: 'slip-dress', name_he: 'שמלת סליפ רוז׳', name_en: 'Rose slip dress',
    color: ['רוז׳', 'rose'], family: 'pastel', fabric: 'satin', formality: 4, fit: 'slim',
    sleeve: 'sleeveless', length: 'midi', season: ['summer', 'spring'], vs: 52, trend: 'rising' },

  { shape: 'shoe', hex: '#F0EDE7', opts: { kind: 'sneaker' },
    category: 'shoes', subcategory: 'sneakers', name_he: 'סניקרס לבנות', name_en: 'White sneakers',
    color: ['לבן', 'white'], family: 'white', fabric: 'leather', formality: 2, fit: 'regular',
    season: ['spring', 'summer', 'fall'], vs: 84, trend: 'timeless' },

  { shape: 'shoe', hex: '#1A1A1C', opts: { kind: 'heel' },
    category: 'shoes', subcategory: 'heels', name_he: 'עקבים שחורים', name_en: 'Black heels',
    color: ['שחור', 'black'], family: 'monochrome-black', fabric: 'leather', formality: 5, fit: 'regular',
    season: ['spring', 'summer', 'fall', 'winter'], vs: 58, trend: 'timeless' },

  { shape: 'shoe', hex: '#6B4A33', opts: { kind: 'flat' },
    category: 'shoes', subcategory: 'loafers', name_he: 'לוֹפֶרס עור חום', name_en: 'Brown leather loafers',
    color: ['חום', 'brown'], family: 'neutral', fabric: 'leather', formality: 3, fit: 'regular',
    season: ['spring', 'fall', 'winter'], vs: 74, trend: 'current-2026' },

  { shape: 'shoe', hex: '#2E2A28', opts: { kind: 'boot' },
    category: 'shoes', subcategory: 'ankle-boots', name_he: 'מגפוני עור', name_en: 'Leather ankle boots',
    color: ['שחור', 'black'], family: 'monochrome-black', fabric: 'leather', formality: 3, fit: 'regular',
    season: ['fall', 'winter'], vs: 68, trend: 'timeless' },

  { shape: 'shoe', hex: '#C2A278', opts: { kind: 'sandal' },
    category: 'shoes', subcategory: 'sandals', name_he: 'סנדלי עור', name_en: 'Leather sandals',
    color: ['טאן', 'tan'], family: 'neutral', fabric: 'leather', formality: 2, fit: 'regular',
    season: ['summer'], vs: 56, trend: 'timeless' },

  { shape: 'bag', hex: '#8A6A47', opts: { kind: 'tote' },
    category: 'bag', subcategory: 'tote', name_he: 'תיק טוט עור', name_en: 'Leather tote',
    color: ['קוניאק', 'cognac'], family: 'neutral', fabric: 'leather', formality: 3, fit: 'regular',
    season: ['spring', 'summer', 'fall', 'winter'], vs: 72, trend: 'timeless' },

  { shape: 'bag', hex: '#1E1E20', opts: { kind: 'clutch' },
    category: 'bag', subcategory: 'clutch', name_he: 'קלאץ׳ שחור', name_en: 'Black clutch',
    color: ['שחור', 'black'], family: 'monochrome-black', fabric: 'satin', formality: 5, fit: 'regular',
    season: ['fall', 'winter', 'spring', 'summer'], vs: 40, trend: 'timeless' },

  { shape: 'accessory', hex: '#7A5334', opts: { kind: 'belt' },
    category: 'accessory', subcategory: 'belt', name_he: 'חגורת עור קאמל', name_en: 'Camel leather belt',
    color: ['קאמל', 'camel'], family: 'neutral', fabric: 'leather', formality: 3, fit: 'regular',
    season: ['spring', 'summer', 'fall', 'winter'], vs: 70, trend: 'timeless' },

  { shape: 'accessory', hex: '#C8A24A', opts: { kind: 'necklace' },
    category: 'jewelry', subcategory: 'necklace', name_he: 'שרשרת זהב', name_en: 'Gold pendant necklace',
    color: ['זהב', 'gold'], family: 'neutral', fabric: 'technical', formality: 4, fit: 'regular',
    season: ['spring', 'summer', 'fall', 'winter'], vs: 66, trend: 'current-2026' },
];

/* ---------------- loading ---------------- */
function toItem(spec) {
  return {
    id: newId('itm'),
    createdAt: Date.now(),
    source: DEMO_TAG,
    demo: true,
    favorite: false,
    thumb: thumbFor(spec),
    category: spec.category,
    subcategory: spec.subcategory,
    name_he: spec.name_he, name_en: spec.name_en,
    color_primary: { name_he: spec.color[0], name_en: spec.color[1], hex: spec.hex },
    color_secondary: [],
    pattern: spec.pattern || 'solid',
    fabric_guess: spec.fabric,
    texture: spec.texture || 'smooth',
    season: spec.season,
    weight: spec.weight || 'mid',
    formality: spec.formality,
    fit: spec.fit,
    neckline: null,
    sleeve: spec.sleeve ?? null,
    length: spec.length ?? null,
    rise: null,
    color_family: spec.family,
    undertone_match: 'neutral',
    versatility_score: spec.vs,
    trend_status: spec.trend,
    care: 'machine-wash',
    occasions: [],
    notes_he: 'פריט לדוגמה — אפשר להסיר בכל רגע מהפרופיל.',
    notes_en: 'Sample piece — removable any time from your profile.',
    confidence: 1,
  };
}

/** Add the sample capsule. Returns how many pieces went in. */
export async function loadDemoWardrobe() {
  const items = PIECES.map(toItem);
  await Items.putMany(items);
  return items.length;
}

/** Take the sample capsule back out, leaving everything else alone. */
export async function removeDemoWardrobe() {
  const all = await Items.all();
  const mine = all.filter(i => i.source === DEMO_TAG || i.demo === true);
  for (const it of mine) await Items.remove(it.id);
  return mine.length;
}

export const countDemo = (items) => items.filter(i => i.source === DEMO_TAG || i.demo === true).length;
export const DEMO_SIZE = PIECES.length;
