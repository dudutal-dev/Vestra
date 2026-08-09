/* ============================================================
   VESTRA · Makeup simulation renderer

   Paints a look onto the owner's own photo using the facial regions returned
   by analyzeFace() — or by the on-device engine in vision.js. Pure canvas, no
   ML runtime in the page.

   Products are not all the same shape, and painting them as though they were
   is what makes a simulation look like a filter. So each one is drawn the way
   it is actually worn:

     foundation   the skin is evened out — a soft blur of itself, then a wash
                  of the shade, so texture settles instead of being covered
     lipstick     a lip outline with a cupid's bow, a darker rim where a liner
                  would sit, and the mouth line kept visible
     eyeliner     a tapered stroke along the upper lash line, with a wing when
                  the look calls for one
     lashes       short strokes from the lash line, not a smear over the eye
     brows        a tapered arc, full at the head and fine at the tail
     shadow       a wash on the mobile lid, above the eye it belongs to
     blush        angled along the cheek, not a circle on it
     contour      a soft shadow under the cheekbone
     highlighter  a narrow catch of light along the top of the bone

   Three rules hold across all of them:

   · Everything is masked to a soft ellipse of the face before it composites,
     so a region estimated a few percent wide fades out at the jaw instead of
     tinting the hair behind it.
   · Eye products cut the eye opening back out of their own layer, so the iris
     stays bright.
   · Blend mode is decided from the skin tone sampled under each region, so a
     shade lighter than the skin adds light and a darker one adds pigment —
     which is what keeps blush visible on fair skin and clean on deep skin.
   ============================================================ */

/* Regions that exist on both sides of the face and are painted twice. */
const PAIRED = new Set(['eye', 'lid', 'brow', 'cheek', 'bone', 'jaw']);

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function rgba(hex, a) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
  if (!m) return `rgba(180,120,120,${a})`;
  const [r, g, b] = [1, 2, 3].map(i => parseInt(m[i], 16));
  return `rgba(${r},${g},${b},${a})`;
}

function hexRGB(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
  return m ? [1, 2, 3].map(i => parseInt(m[i], 16)) : [180, 120, 120];
}

const hexLuminance = (hex) => luminance(...hexRGB(hex));

/** Darken a hex by a factor — used for the rim a lip liner leaves. */
function darker(hex, factor, a) {
  const [r, g, b] = hexRGB(hex).map(v => clamp(Math.round(v * factor), 0, 255));
  return `rgba(${r},${g},${b},${a})`;
}

/* ============================================================
   Technique — what kind of product a step is
   ============================================================ */

const TECHNIQUES = new Set([
  'base', 'lipstick', 'liner', 'lashes', 'brow',
  'shadow', 'blush', 'contour', 'highlight', 'none',
]);

const LINER_RE = /liner|eyeliner|wing|cat-?eye|kohl|kajal|tightline|אייליינר|קו עין|מתיחה|כוחל/i;
const LASH_RE = /mascara|lash|falsies|מסקרה|ריסים/i;
const HIGHLIGHT_RE = /highlight|luminizer|glow|shimmer on|היילייטר|זוהר|ברק/i;
const WING_RE = /wing|cat-?eye|graphic|double|מתיחה|כנף/i;

/**
 * Which product this step is. `technique` wins when the step carries one; the
 * built-in looks set it explicitly. Anything from the model is inferred from
 * area plus the wording of the instruction, in either language, because
 * "smudged liner" and "nude shadow across the lid" are both `eyes` and want
 * completely different shapes.
 */
export function techniqueFor(step) {
  if (step.technique && TECHNIQUES.has(step.technique)) return step.technique;

  const area = (step.area || '').toLowerCase();
  const region = (step.region || '').toLowerCase();
  const text = [step.instruction_en, step.instruction_he, step.product_type_en, step.product_type_he]
    .filter(Boolean).join(' ');

  if (area === 'lips' || region.startsWith('lip')) return 'lipstick';
  if (area === 'brows' || region === 'brow') return 'brow';
  if (area === 'eyes' || region === 'lid' || region === 'eye') {
    if (LINER_RE.test(text)) return 'liner';
    if (LASH_RE.test(text)) return 'lashes';
    return 'shadow';
  }
  if (area === 'highlight' || region === 'bone') return 'highlight';
  if (area === 'contour' || region === 'jaw') return 'contour';
  if (area === 'cheeks' || region === 'cheek') return HIGHLIGHT_RE.test(text) ? 'highlight' : 'blush';
  if (area === 'skin' || area === 'base' || region === 'face') return 'base';
  return 'none';   // hair, fragrance, nails, beard — nothing to paint on a face
}

/* How strongly each product sits on skin, and how far its edge feathers. */
const STRENGTH = {
  base:      { alpha: 0.26, blend: 'soft-light', adaptive: true },
  lipstick:  { alpha: 0.78, blend: 'source-over' },
  liner:     { alpha: 0.82, blend: 'multiply' },
  lashes:    { alpha: 0.80, blend: 'multiply' },
  brow:      { alpha: 0.52, blend: 'multiply' },
  shadow:    { alpha: 0.46, blend: 'multiply' },
  blush:     { alpha: 0.40, blend: 'multiply', adaptive: true },
  contour:   { alpha: 0.26, blend: 'multiply' },
  highlight: { alpha: 0.34, blend: 'screen', dimOnDark: true },
};

/* A shimmer finish gets a second, softer pass in screen mode so it catches light. */
const hasSheen = (step) => ['shimmer', 'satin', 'metallic', 'glossy']
  .includes((step.finish || '').toLowerCase());

/* ============================================================
   Shape primitives — all drawn in a region's own coordinates,
   where the region spans -1..1 on both axes.
   ============================================================ */

/** Run `draw` with the canvas transformed into a region's local space. */
function inRegion(ctx, region, w, h, draw) {
  if (!region || typeof region.cx !== 'number') return false;
  const rx = Math.max(Math.abs(region.rx || 0) * w, 1.5);
  const ry = Math.max(Math.abs(region.ry || 0) * h, 1.5);
  ctx.save();
  ctx.translate(clamp(region.cx, -0.2, 1.2) * w, clamp(region.cy, -0.2, 1.2) * h);
  ctx.rotate(((region.rot || 0) * Math.PI) / 180);
  ctx.scale(rx, ry);
  draw(ctx, rx, ry);
  ctx.restore();
  return true;
}

/** A soft radial wash — blush, shadow, contour, highlighter. */
function paintWash(ctx, region, w, h, hex, hardness, alpha) {
  return inRegion(ctx, region, w, h, () => {
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    const solidTo = clamp(hardness, 0, 0.92);
    grad.addColorStop(0, rgba(hex, alpha));
    grad.addColorStop(solidTo, rgba(hex, alpha));
    grad.addColorStop(1, rgba(hex, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** The outline of a mouth: two peaks, a dip between them, one full lower lip. */
function lipOutline(ctx) {
  ctx.beginPath();
  ctx.moveTo(-1, 0.02);
  ctx.bezierCurveTo(-0.74, -0.66, -0.54, -0.94, -0.34, -0.80);
  ctx.bezierCurveTo(-0.22, -0.70, -0.10, -0.40, 0, -0.46);
  ctx.bezierCurveTo(0.10, -0.40, 0.22, -0.70, 0.34, -0.80);
  ctx.bezierCurveTo(0.54, -0.94, 0.74, -0.66, 1, 0.02);
  ctx.bezierCurveTo(0.72, 0.78, 0.36, 1.0, 0, 1.0);
  ctx.bezierCurveTo(-0.36, 1.0, -0.72, 0.78, -1, 0.02);
  ctx.closePath();
}

/**
 * Lipstick.
 *
 * A single ellipse over the mouth covers the teeth and the line between the
 * lips, which is exactly what makes a preview look pasted on. This fills the
 * lip shape, darkens the rim the way a lip pencil does, and leaves the mouth
 * line readable.
 */
function paintLips(ctx, region, w, h, hex, alpha) {
  return inRegion(ctx, region, w, h, (c) => {
    lipOutline(c);

    // Centre a touch lighter than the rim — how a lip actually catches light.
    const grad = c.createRadialGradient(0, 0.12, 0.04, 0, 0, 1.3);
    grad.addColorStop(0, rgba(hex, alpha));
    grad.addColorStop(0.58, rgba(hex, alpha));
    grad.addColorStop(1, darker(hex, 0.80, alpha));
    c.fillStyle = grad;
    c.fill();

    // The pencil rim.
    c.strokeStyle = darker(hex, 0.72, alpha * 0.85);
    c.lineWidth = 0.07;
    c.stroke();

    // The mouth line, so the lips stay two lips.
    c.strokeStyle = darker(hex, 0.50, alpha * 0.55);
    c.lineWidth = 0.05;
    c.beginPath();
    c.moveTo(-0.92, 0.02);
    c.quadraticCurveTo(0, 0.16, 0.92, 0.02);
    c.stroke();
  });
}

/**
 * Eyeliner along the upper lash line.
 * `outward` is +1 when the eye's outer corner points right in the image.
 * `wing` is 0 for a tightline and 1 for a full cat-eye.
 */
function paintLiner(ctx, region, w, h, hex, alpha, outward, wing) {
  return inRegion(ctx, region, w, h, (c) => {
    const s = outward >= 0 ? 1 : -1;
    const t = 0.30;                       // how thick the stroke gets at its middle
    const wx = s * (1.05 + 0.62 * wing);
    const wy = -1.05 - 0.55 * wing;

    c.beginPath();
    c.moveTo(-s * 1.04, 0.02);                                   // inner corner
    c.quadraticCurveTo(0, -1.30, s * 0.94, -0.52);               // over the lash line
    if (wing > 0.02) c.lineTo(wx, wy);                           // the flick
    c.quadraticCurveTo(s * 0.86, -0.44 + t, s * 0.72, -0.34 + t);
    c.quadraticCurveTo(0, -1.22 + t * 1.6, -s * 1.04, 0.02 + t * 0.35);
    c.closePath();
    c.fillStyle = rgba(hex, alpha);
    c.fill();
  });
}

/**
 * Mascara: short strokes lifting off the upper lash line.
 *
 * Kept deliberately short and fine. Lashes are the one product where drawing
 * what you can see in a mirror — long, separated, dark — reads on a photo as a
 * comb sitting on the eye rather than as mascara.
 */
function paintLashes(ctx, region, w, h, hex, alpha, outward) {
  return inRegion(ctx, region, w, h, (c, rx) => {
    const s = outward >= 0 ? 1 : -1;
    c.strokeStyle = rgba(hex, alpha);
    c.lineCap = 'round';
    c.lineWidth = Math.max(0.05, 1.1 / rx);
    for (let k = 0; k <= 9; k++) {
      const u = -0.86 + (k / 9) * 1.72;                 // along the lid
      const base = -Math.cos(u * 1.15) * 0.92;          // the lash line's curve
      const lean = s * (0.04 + 0.16 * Math.max(0, u * s));   // outer lashes fan out
      c.beginPath();
      c.moveTo(u, base + 0.06);
      c.quadraticCurveTo(u + lean * 0.5, base - 0.14, u + lean, base - 0.30);
      c.stroke();
    }
  });
}

/** A brow: full at the head, fine at the tail, with the arch two-thirds along. */
function paintBrow(ctx, region, w, h, hex, alpha, outward) {
  return inRegion(ctx, region, w, h, (c) => {
    const s = outward >= 0 ? 1 : -1;
    c.beginPath();
    c.moveTo(-s * 1.05, 0.85);
    c.bezierCurveTo(-s * 0.5, -1.5, s * 0.35, -1.9, s * 1.12, -0.35);   // top edge
    c.bezierCurveTo(s * 0.4, -0.95, -s * 0.45, -0.35, -s * 1.05, 0.85); // back along the bottom
    c.closePath();
    c.fillStyle = rgba(hex, alpha);
    c.fill();
  });
}

/**
 * Foundation.
 *
 * Skin does not get evener because a colour was laid over it; it gets evener
 * because the variation is reduced. So the face is composited with a softened
 * copy of itself first, and only then given a wash of the shade.
 */
function paintSmoothing(ctx, photo, region, w, h, alpha, blurPx) {
  if (!region || typeof region.cx !== 'number') return false;
  if (typeof ctx.filter !== 'string') return false;   // no blur support, skip the pass

  ctx.save();
  // The ellipse is described in image coordinates, and the layer is already
  // translated into them — so no transform juggling is needed here.
  ctx.beginPath();
  ctx.ellipse(
    region.cx * w, region.cy * h,
    Math.abs(region.rx || 0) * w * 0.96, Math.abs(region.ry || 0) * h * 0.96,
    ((region.rot || 0) * Math.PI) / 180, 0, Math.PI * 2,
  );
  ctx.clip();
  ctx.filter = `blur(${blurPx}px)`;
  ctx.globalAlpha = clamp(alpha, 0, 0.8);
  ctx.drawImage(photo, 0, 0, w, h);
  ctx.restore();
  return true;
}

/** Cut a shape back out of a layer — used to keep the eye opening clear. */
function eraseWash(ctx, region, w, h, shrink = 1) {
  if (!region || typeof region.cx !== 'number') return;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  paintWash(ctx, { ...region, rx: (region.rx || 0) * shrink, ry: (region.ry || 0) * shrink },
    w, h, '#000', 0.35, 1);
  ctx.restore();
}

/* ============================================================
   Sampling and masking
   ============================================================ */

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

/** The rectangle every product falls inside — the scratch layer's size. */
function faceBox(face, w, h) {
  if (!face || typeof face.cx !== 'number') return { x: 0, y: 0, w, h };
  const rx = Math.abs(face.rx || 0) * w * 1.4;
  const ry = Math.abs(face.ry || 0) * h * 1.4;
  const x = clamp(Math.floor(face.cx * w - rx), 0, w - 2);
  const y = clamp(Math.floor(face.cy * h - ry), 0, h - 2);
  const x2 = clamp(Math.ceil(face.cx * w + rx), x + 2, w);
  const y2 = clamp(Math.ceil(face.cy * h + ry), y + 2, h);
  return { x, y, w: x2 - x, h: y2 - y };
}

/** A soft-edged mask of the face, grown slightly so nothing clips at the jaw. */
function buildFaceMask(face, w, h, box) {
  if (!face || typeof face.cx !== 'number') return null;
  const c = document.createElement('canvas');
  c.width = box.w; c.height = box.h;
  const ctx = c.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, -box.x, -box.y);
  paintWash(ctx, { ...face, rx: (face.rx || 0) * 1.14, ry: (face.ry || 0) * 1.14 },
    w, h, '#000000', 0.80, 1);
  return c;
}

/* Where a step lands when it carries no explicit region. */
const AREA_REGION = {
  skin: 'face', base: 'face',
  eyes: 'lid', brows: 'brow', lips: 'lips',
  cheeks: 'cheek', contour: 'jaw', highlight: 'bone',
  hair: 'none', beard: 'none', fragrance: 'none', nails: 'none',
};

/** Move an eye-opening ellipse up onto the lid above it. */
const liftToLid = (r) => ({
  ...r,
  cy: (r.cy ?? 0) - (r.ry ?? 0) * 0.55,
  ry: (r.ry ?? 0) * 0.9,
});

/**
 * The regions a step paints, tagged with which side of the face they are on so
 * a wing or a brow tail knows which way is outward.
 */
function targetsFor(step, technique, regions) {
  const side = (r, outward) => ({ region: r, outward });

  // Liner and lashes belong on the eye opening; shadow on the lid above it.
  if (technique === 'liner' || technique === 'lashes') {
    const l = regions.eye_left, r = regions.eye_right;
    if (l || r) return [l && side(l, -1), r && side(r, 1)].filter(Boolean);
  }
  if (technique === 'shadow') {
    const l = regions.lid_left || (regions.eye_left && liftToLid(regions.eye_left));
    const r = regions.lid_right || (regions.eye_right && liftToLid(regions.eye_right));
    return [l && side(l, -1), r && side(r, 1)].filter(Boolean);
  }
  if (technique === 'lipstick') {
    return regions.lips ? [side(regions.lips, 1)] : [];
  }
  if (technique === 'brow') {
    return [regions.brow_left && side(regions.brow_left, -1),
            regions.brow_right && side(regions.brow_right, 1)].filter(Boolean);
  }
  if (technique === 'base') {
    return regions.face ? [side(regions.face, 1)] : [];
  }

  const name = (step.region || AREA_REGION[(step.area || '').toLowerCase()] || '').toLowerCase();
  if (!name || name === 'none') return [];
  if (PAIRED.has(name)) {
    return [regions[`${name}_left`] && side(regions[`${name}_left`], -1),
            regions[`${name}_right`] && side(regions[`${name}_right`], 1)].filter(Boolean);
  }
  return regions[name] ? [side(regions[name], 1)] : [];
}

/* ============================================================
   The render
   ============================================================ */

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
  const blurPx = Math.max(1, Math.round((regions.face?.rx || 0.25) * w * 0.035));

  // One scratch layer, reused. Each region is painted, trimmed to the face and
  // composited on its own, so the adaptive blend decision stays per-side — the
  // two halves of a face are not always lit the same.
  const layer = document.createElement('canvas');
  layer.width = box.w; layer.height = box.h;
  const lctx = layer.getContext('2d');

  const resetLayer = () => {
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.globalAlpha = 1;
    lctx.filter = 'none';
    lctx.clearRect(0, 0, box.w, box.h);
    lctx.setTransform(1, 0, 0, 1, -box.x, -box.y);
  };

  const flush = (blend) => {
    if (mask) {
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.globalCompositeOperation = 'destination-in';
      lctx.globalAlpha = 1;
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
    const technique = techniqueFor(step);
    if (technique === 'none' || !step.shade_hex) continue;

    const strength = STRENGTH[technique];
    if (!strength) continue;

    const targets = targetsFor(step, technique, regions);
    if (!targets.length) continue;

    const shadeLum = hexLuminance(step.shade_hex);
    // Only shadow gets the eye opening cut out of it. A liner sits on the lash
    // line and lashes start there — erasing the opening would take the product
    // with it, which is exactly how the wing went missing.
    const eyeProduct = technique === 'shadow';
    const wing = WING_RE.test([step.instruction_en, step.instruction_he].filter(Boolean).join(' ')) ? 1 : 0.32;
    let any = false;

    for (const { region, outward } of targets) {
      const skinLum = sampleSkin(region);
      let blend = strength.blend;
      let alpha = strength.alpha;

      if (strength.adaptive) {
        // Lighter than the skin → it adds light. Darker → it adds pigment.
        blend = shadeLum > skinLum + 6 ? 'screen' : 'multiply';
        if (blend === 'screen') alpha *= 0.8;
      }
      if (strength.dimOnDark) {
        // Screen at full strength turns ashy on deep skin — scale it back.
        alpha *= 0.55 + 0.45 * (skinLum / 255);
      }

      alpha = clamp(alpha * intensity, 0, 1);
      if (alpha <= 0.01) continue;

      // Foundation is two passes with different jobs: even the skin out with a
      // softened copy of itself, then lay the shade over it. Running both
      // through one blend mode would either tint nothing or smooth nothing.
      if (technique === 'base') {
        resetLayer();
        if (paintSmoothing(lctx, photo, region, w, h, alpha * 1.9, blurPx)) flush('source-over');
        resetLayer();
        paintWash(lctx, region, w, h, step.shade_hex, 0.55, alpha);
        flush(blend);
        any = true;
        continue;
      }

      const draw = (a) => {
        switch (technique) {
          case 'lipstick':  return paintLips(lctx, region, w, h, step.shade_hex, a);
          case 'liner':     return paintLiner(lctx, region, w, h, step.shade_hex, a, outward, wing);
          case 'lashes':    return paintLashes(lctx, region, w, h, step.shade_hex, a, outward);
          case 'brow':      return paintBrow(lctx, region, w, h, step.shade_hex, a, outward);
          case 'shadow':    return paintWash(lctx, region, w, h, step.shade_hex, 0.34, a);
          case 'blush':     return paintWash(lctx, region, w, h, step.shade_hex, 0.18, a);
          case 'contour':   return paintWash(lctx, region, w, h, step.shade_hex, 0.16, a);
          case 'highlight': return paintWash(lctx, region, w, h, step.shade_hex, 0.22, a);
          default:          return false;
        }
      };

      resetLayer();
      if (!draw(alpha)) continue;
      if (eyeProduct) {
        eraseWash(lctx, regions.eye_left, w, h, 0.80);
        eraseWash(lctx, regions.eye_right, w, h, 0.80);
      }
      flush(blend);

      // Opaque products get a second, gentler pass so they read as coverage
      // rather than a tint — a lipstick that only multiplies looks like a stain.
      if (technique === 'lipstick') {
        resetLayer();
        draw(alpha * 0.55);
        flush('multiply');
      }

      if (hasSheen(step)) {
        resetLayer();
        draw(alpha * 0.3);
        if (eyeProduct) {
          eraseWash(lctx, regions.eye_left, w, h, 0.80);
          eraseWash(lctx, regions.eye_right, w, h, 0.80);
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
