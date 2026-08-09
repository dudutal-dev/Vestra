/* ============================================================
   VESTRA · Makeup simulation renderer
   Paints a look onto the owner's own photo using the facial regions
   returned by analyzeFace(). Pure canvas — no ML runtime in the page.

   Each region is an ellipse in normalized image coordinates. We fill it with
   a radial gradient that fades to fully transparent at the rim, which gives
   the soft airbrushed edge real makeup has. The layer is then composited with
   the blend mode that matches the product: multiply for pigment that sits on
   skin, soft-light for a wash of colour, screen for anything luminous.

   Three things keep it from looking painted-on:

   · Every product goes through a scratch layer that is masked to a soft
     ellipse of the face before it is composited, so nothing bleeds onto hair,
     glasses or the background when a region is estimated a little wide.
   · Eye products erase the eye opening out of their own layer, so shadow sits
     on the lid instead of greying out the iris.
   · Lip colour follows the two lip lobes when the model returned them, so it
     stops at the lip line instead of covering the gap between the lips.
   ============================================================ */

/* Regions that exist on both sides of the face and are painted twice. */
const PAIRED = new Set(['eye', 'lid', 'brow', 'cheek', 'bone', 'jaw']);

/* How each product behaves on skin. hardness = where the gradient starts to
   fall off (0 = soft from the centre, 0.9 = near-solid with a thin feathered rim). */
const STYLE = {
  // `adaptive` picks multiply vs screen from the skin tone actually under the
  // region: a pigment darker than the skin sits on it (multiply), a pigment
  // lighter than the skin adds light (screen). Without this, blush is invisible
  // on fair skin in screen mode and muddy on deep skin in multiply.
  skin:      { key: 'skin',      blend: 'soft-light', alpha: 0.30, hardness: 0.55, adaptive: true },
  base:      { key: 'skin',      blend: 'soft-light', alpha: 0.30, hardness: 0.55, adaptive: true },
  lips:      { key: 'lips',      blend: 'multiply',   alpha: 0.80, hardness: 0.78 },
  eyes:      { key: 'eyes',      blend: 'multiply',   alpha: 0.46, hardness: 0.42 },
  brows:     { key: 'brows',     blend: 'multiply',   alpha: 0.44, hardness: 0.60 },
  cheeks:    { key: 'cheeks',    blend: 'multiply',   alpha: 0.42, hardness: 0.20, adaptive: true },
  contour:   { key: 'contour',   blend: 'multiply',   alpha: 0.26, hardness: 0.18 },
  highlight: { key: 'highlight', blend: 'screen',     alpha: 0.34, hardness: 0.22, dimOnDark: true },
  default:   { key: 'default',   blend: 'multiply',   alpha: 0.40, hardness: 0.40 },
};

const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function hexLuminance(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
  if (!m) return 128;
  return luminance(...[1, 2, 3].map(i => parseInt(m[i], 16)));
}

/* Which style an AI step maps to. `area` is the primary signal; the region is
   the fallback, because a "skin" step aimed at the jaw is really contour. */
function styleFor(step) {
  const a = (step.area || '').toLowerCase();
  const r = (step.region || '').toLowerCase();
  if (a === 'lips' || r.startsWith('lip')) return STYLE.lips;
  if (a === 'cheeks' && r === 'bone') return STYLE.highlight;
  if (a === 'highlight' || r === 'bone') return STYLE.highlight;
  if (a === 'contour' || r === 'jaw') return STYLE.contour;
  if (a === 'cheeks' || r === 'cheek') return STYLE.cheeks;
  if (a === 'brows' || r === 'brow') return STYLE.brows;
  if (a === 'eyes' || r === 'lid' || r === 'eye') return STYLE.eyes;
  if (a === 'skin' || r === 'face') return STYLE.skin;
  return STYLE.default;
}

/* A shimmer finish gets a second, softer pass in screen mode so it catches light. */
const hasSheen = (step) => ['shimmer', 'satin'].includes((step.finish || '').toLowerCase());

/* ---------------- colour helpers ---------------- */
function rgba(hex, a) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
  if (!m) return `rgba(180,120,120,${a})`;
  const [r, g, b] = [1, 2, 3].map(i => parseInt(m[i], 16));
  return `rgba(${r},${g},${b},${a})`;
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/* ---------------- one ellipse ---------------- */
function paintEllipse(ctx, region, w, h, hex, hardness, alpha) {
  if (!region || typeof region.cx !== 'number') return;

  const rx = Math.max(Math.abs(region.rx || 0) * w, 2);
  const ry = Math.max(Math.abs(region.ry || 0) * h, 2);

  ctx.save();
  ctx.translate(clamp(region.cx, -0.2, 1.2) * w, clamp(region.cy, -0.2, 1.2) * h);
  ctx.rotate(((region.rot || 0) * Math.PI) / 180);
  ctx.scale(rx, ry);

  // Built in the unit circle, then stretched by the scale above — so the
  // gradient becomes elliptical along with the shape.
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  const solidTo = clamp(hardness, 0, 0.92);
  grad.addColorStop(0, rgba(hex, alpha));
  grad.addColorStop(solidTo, rgba(hex, alpha));
  grad.addColorStop(1, rgba(hex, 0));

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Cut an ellipse back out of a layer — used to keep the eye opening clear. */
function eraseEllipse(ctx, region, w, h, shrink = 1) {
  if (!region || typeof region.cx !== 'number') return;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  paintEllipse(ctx, { ...region, rx: (region.rx || 0) * shrink, ry: (region.ry || 0) * shrink },
    w, h, '#000', 0.35, 1);
  ctx.restore();
}

/**
 * A small copy of the untouched photo, used to read the skin tone under a
 * region. Sampling the live canvas would read makeup that was already painted.
 */
function makeSampler(photo) {
  const S = 96;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(photo, 0, 0, S, S);
  return (region) => {
    const x = clamp(Math.round((region?.cx ?? 0.5) * S), 1, S - 2);
    const y = clamp(Math.round((region?.cy ?? 0.5) * S), 1, S - 2);
    try {
      const d = ctx.getImageData(x - 1, y - 1, 3, 3).data;
      let sum = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { sum += luminance(d[i], d[i + 1], d[i + 2]); n++; }
      return n ? sum / n : 128;
    } catch {
      return 128; // a tainted canvas shouldn't break the render
    }
  };
}

/**
 * A soft-edged mask of the face, at the photo's own scale.
 *
 * Every product is masked through this before it reaches the photo, so a
 * cheek ellipse estimated a few percent wide fades out at the jaw instead of
 * tinting the hair behind it. Grown slightly past the face ellipse so the
 * mask never clips makeup that legitimately sits at the hairline or jaw.
 */
function buildFaceMask(face, w, h, box) {
  if (!face || typeof face.cx !== 'number') return null;
  const c = document.createElement('canvas');
  c.width = box.w; c.height = box.h;
  const ctx = c.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, -box.x, -box.y);
  paintEllipse(ctx, { ...face, rx: (face.rx || 0) * 1.12, ry: (face.ry || 0) * 1.12 },
    w, h, '#000000', 0.80, 1);
  return c;
}

/**
 * The rectangle every product falls inside. Working at face size instead of
 * photo size keeps the intensity slider smooth: the scratch layer is cleared
 * and composited once per region, and on a portrait the face is a small
 * fraction of the frame.
 */
function faceBox(face, w, h) {
  if (!face || typeof face.cx !== 'number') return { x: 0, y: 0, w, h };
  const rx = Math.abs(face.rx || 0) * w * 1.35;
  const ry = Math.abs(face.ry || 0) * h * 1.35;
  const x = clamp(Math.floor(face.cx * w - rx), 0, w - 2);
  const y = clamp(Math.floor(face.cy * h - ry), 0, h - 2);
  const x2 = clamp(Math.ceil(face.cx * w + rx), x + 2, w);
  const y2 = clamp(Math.ceil(face.cy * h + ry), y + 2, h);
  return { x, y, w: x2 - x, h: y2 - y };
}

/* Where a step lands when it carries no explicit region — covers the built-in
   offline looks and any AI response that omits the field. */
const AREA_REGION = {
  skin: 'face', base: 'face',
  eyes: 'lid', brows: 'brow', lips: 'lips',
  cheeks: 'cheek', contour: 'jaw', highlight: 'bone',
  hair: 'none', beard: 'none', fragrance: 'none', nails: 'none',
};

/* Resolve a step's region name to the actual region objects to paint. */
function regionsFor(step, regions) {
  const name = (step.region || AREA_REGION[(step.area || '').toLowerCase()] || '').toLowerCase();
  if (!name || name === 'none') return [];

  // Lip colour stops at the lip line. One ellipse over the whole mouth also
  // covers the gap between the lips and the teeth behind it; the two lobes
  // follow the actual shape.
  if (name === 'lips' && regions.lip_upper && regions.lip_lower) {
    return [regions.lip_upper, regions.lip_lower];
  }
  // Shadow belongs on the mobile lid. If the model only mapped the opening,
  // lift the ellipse onto the lid rather than painting over the iris.
  if (name === 'eye') {
    const lids = [regions.lid_left, regions.lid_right].filter(Boolean);
    if (lids.length) return lids;
    return [regions.eye_left, regions.eye_right].filter(Boolean).map(liftToLid);
  }
  if (PAIRED.has(name)) {
    return [regions[`${name}_left`], regions[`${name}_right`]].filter(Boolean);
  }
  return [regions[name]].filter(Boolean);
}

/** Move an eye-opening ellipse up onto the lid above it. */
const liftToLid = (r) => ({
  ...r,
  cy: (r.cy ?? 0) - (r.ry ?? 0) * 0.55,
  ry: (r.ry ?? 0) * 0.9,
});

/**
 * Paint a full look onto a canvas.
 *
 * @param {HTMLCanvasElement} canvas  target, resized to the photo
 * @param {HTMLImageElement}  photo   the owner's loaded face photo
 * @param {object}            regions from analyzeFace().regions
 * @param {Array}             steps   the beauty look's steps
 * @param {object}            opts    { intensity: 0..1.5, skipPhoto: boolean }
 * @returns {number} how many steps actually painted something
 */
export function renderMakeup(canvas, photo, regions, steps, opts = {}) {
  const intensity = clamp(opts.intensity ?? 1, 0, 1.5);
  const w = photo.naturalWidth || photo.width;
  const h = photo.naturalHeight || photo.height;
  if (!w || !h) return 0;

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  if (!opts.skipPhoto) ctx.drawImage(photo, 0, 0, w, h);

  if (!regions || !Array.isArray(steps)) return 0;

  const sampleSkin = makeSampler(photo);
  const box = faceBox(regions.face, w, h);
  const mask = buildFaceMask(regions.face, w, h, box);

  // One scratch layer, reused. Each region is painted into it, trimmed, and
  // composited on its own, so the adaptive blend decision stays per-side —
  // the two halves of a face are not always lit the same.
  const layer = document.createElement('canvas');
  layer.width = box.w; layer.height = box.h;
  const lctx = layer.getContext('2d');

  /** Clear the layer and put it back into full-image coordinates. */
  const resetLayer = () => {
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, box.w, box.h);
    lctx.setTransform(1, 0, 0, 1, -box.x, -box.y);
  };

  /** Trim to the face and composite onto the photo with the product's blend. */
  const flush = (blend) => {
    if (mask) {
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.globalCompositeOperation = 'destination-in';
      lctx.drawImage(mask, 0, 0);
      lctx.globalCompositeOperation = 'source-over';
    }
    ctx.save();
    ctx.globalCompositeOperation = blend;
    ctx.drawImage(layer, box.x, box.y);
    ctx.restore();
  };

  let painted = 0;

  for (const step of steps) {
    const targets = regionsFor(step, regions);
    if (!targets.length || !step.shade_hex) continue;

    const style = styleFor(step);
    const isEyeStep = style.key === 'eyes';
    const shadeLum = hexLuminance(step.shade_hex);
    let any = false;

    for (const region of targets) {
      const skinLum = sampleSkin(region);
      let blend = style.blend;
      let alpha = style.alpha;

      if (style.adaptive) {
        // Lighter than the skin → it adds light. Darker → it adds pigment.
        blend = shadeLum > skinLum + 6 ? 'screen' : 'multiply';
        if (blend === 'screen') alpha *= 0.8;
      }
      if (style.dimOnDark) {
        // Screen at full strength turns ashy on deep skin — scale it back.
        alpha *= 0.55 + 0.45 * (skinLum / 255);
      }

      alpha = clamp(alpha * intensity, 0, 1);
      if (alpha <= 0.01) continue;

      resetLayer();
      paintEllipse(lctx, region, w, h, step.shade_hex, style.hardness, alpha);
      if (isEyeStep) {
        eraseEllipse(lctx, regions.eye_left, w, h, 0.82);
        eraseEllipse(lctx, regions.eye_right, w, h, 0.82);
      }
      flush(blend);

      if (hasSheen(step)) {
        resetLayer();
        paintEllipse(lctx, region, w, h, step.shade_hex, style.hardness * 0.6, alpha * 0.28);
        if (isEyeStep) {
          eraseEllipse(lctx, regions.eye_left, w, h, 0.82);
          eraseEllipse(lctx, regions.eye_right, w, h, 0.82);
        }
        flush('screen');
      }

      any = true;
    }

    if (any) painted++;
  }

  return painted;
}

/** Load a data URL into an <img> that is ready to draw. */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image_load_failed'));
    img.src = src;
  });
}

/** Export the current simulation as a downloadable PNG data URL. */
export function toPNG(canvas) {
  return canvas.toDataURL('image/png');
}
