/* ============================================================
   VESTRA · Makeup simulation renderer
   Paints a look onto the owner's own photo using the facial regions
   returned by analyzeFace(). Pure canvas — no ML runtime in the page.

   Each region is an ellipse in normalized image coordinates. We fill it with
   a radial gradient that fades to fully transparent at the rim, which gives
   the soft airbrushed edge real makeup has. The layer is then composited with
   the blend mode that matches the product: multiply for pigment that sits on
   skin, soft-light for a wash of colour, screen for anything luminous.
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
  skin:      { blend: 'soft-light', alpha: 0.30, hardness: 0.55, adaptive: true },
  base:      { blend: 'soft-light', alpha: 0.30, hardness: 0.55, adaptive: true },
  lips:      { blend: 'multiply',   alpha: 0.80, hardness: 0.78 },
  eyes:      { blend: 'multiply',   alpha: 0.46, hardness: 0.42 },
  brows:     { blend: 'multiply',   alpha: 0.44, hardness: 0.60 },
  cheeks:    { blend: 'multiply',   alpha: 0.42, hardness: 0.20, adaptive: true },
  contour:   { blend: 'multiply',   alpha: 0.26, hardness: 0.18 },
  highlight: { blend: 'screen',     alpha: 0.34, hardness: 0.22, dimOnDark: true },
  default:   { blend: 'multiply',   alpha: 0.40, hardness: 0.40 },
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
  if (PAIRED.has(name)) {
    return [regions[`${name}_left`], regions[`${name}_right`]].filter(Boolean);
  }
  return [regions[name]].filter(Boolean);
}

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
  let painted = 0;

  for (const step of steps) {
    const targets = regionsFor(step, regions);
    if (!targets.length || !step.shade_hex) continue;

    const style = styleFor(step);
    const shadeLum = hexLuminance(step.shade_hex);

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

      ctx.save();
      ctx.globalCompositeOperation = blend;
      paintEllipse(ctx, region, w, h, step.shade_hex, style.hardness, alpha);
      ctx.restore();

      if (hasSheen(step)) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        paintEllipse(ctx, region, w, h, step.shade_hex, style.hardness * 0.6, alpha * 0.28);
        ctx.restore();
      }
    }

    painted++;
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
