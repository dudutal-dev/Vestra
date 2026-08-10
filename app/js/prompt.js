/* ============================================================
   VESTRA · Render prompts

   A canvas can place colour on a photograph. It cannot make fabric fall on a
   body or makeup sit on skin — those need an image model, and an image model
   is only as good as what it is told.

   This is that instruction. It is deliberately provider-independent: the same
   text works for Flux Kontext, Seedream, Nano Banana or GPT Image, because
   none of what matters here is provider-specific. What matters is that the
   brief is exact about the product, exact about where it goes, and explicit
   about everything that must NOT change — which is the clause that decides
   whether the person in the result is still recognisably themselves.

   Prompts are written in English regardless of the app's language: image
   models are trained overwhelmingly on English, and a Hebrew prompt measurably
   degrades adherence. The explanation shown to the owner is localised; the
   instruction sent to the model is not.
   ============================================================ */

import { techniqueFor } from './makeup.js';
import {
  SUBCAT_NAMES, CATEGORIES, OCCASIONS, FABRIC_NAMES, PATTERN_NAMES, FIT_NAMES,
} from './taxonomy.js';

/* Always the English label, whatever the app is currently displaying — the
   prompt is read by a model, not by the owner. */
const enSub = (k) => SUBCAT_NAMES[k]?.en || k || '';
const enCat = (k) => CATEGORIES.find(c => c.key === k)?.name?.en || k || '';
const enOcc = (k) => OCCASIONS.find(o => o.key === k)?.name?.en || k || '';

/* What every edit must leave alone. Without this a model happily returns a
   different person wearing the right lipstick. */
const PRESERVE = 'Preserve the subject exactly: same face, same facial structure and identity, '
  + 'same head angle and expression, same hair, same body, same pose, same camera angle, '
  + 'same lighting direction and colour temperature, same background. '
  + 'Keep natural skin texture — pores, freckles and fine lines must remain visible. '
  + 'Do not smooth, slim, reshape or beautify anything. Do not change age. '
  + 'This is a retouch of one photograph, not a new photograph.';

const hex = (h) => (/^#[0-9a-f]{6}$/i.test(String(h || '')) ? h.toUpperCase() : null);

/* How each product is described to a model that has never heard of our
   `technique` field. Placement matters more than the name of the product. */
const TECHNIQUE_PHRASE = {
  base: (s) => `an even, natural-coverage base in ${s}, worn on the skin rather than over it`,
  lipstick: (s) => `lipstick in ${s} on the lips, following the natural lip line, leaving the mouth line visible`,
  liner: (s) => `eyeliner in ${s} drawn along the upper lash line, thin at the inner corner and thicker toward the outer`,
  lashes: (s) => `mascara in ${s} on the upper lashes, separated rather than clumped`,
  brow: (s) => `brows filled in ${s}, full at the inner head and tapering to a fine tail`,
  shadow: (s) => `eyeshadow in ${s} blended across the mobile lid and through the crease`,
  blush: (s) => `blush in ${s} on the apples of the cheeks, blended up along the cheekbone`,
  contour: (s) => `a soft contour in ${s} in the hollow beneath the cheekbones`,
  highlight: (s) => `a highlight in ${s} along the top of the cheekbones and down the bridge of the nose`,
};

/* Features the model should account for, when the face analysis knows them. */
const FACE_NOTE = {
  hooded: 'The lids are hooded, so shadow must sit above the crease to stay visible with the eyes open.',
  monolid: 'This is a monolid, so colour must be built upward from the lash line to read at all.',
  round: 'The eyes are round; extend the outer corner rather than rounding it further.',
  downturned: 'The outer corners turn down; lift the liner at the outer corner.',
  thin: 'The lips are naturally thin — keep the lip line where it is, do not overdraw it.',
  full: 'The lips are naturally full; the colour needs no help from an overdrawn line.',
};

/**
 * The instruction for painting a beauty look onto the owner's own photograph.
 *
 * @param look    a beauty look, as returned by beautyLook() or the local set
 * @param face    the face analysis, when one exists
 * @param opts    { intensity: 0..1.5 }
 */
export function makeupPrompt({ look, face = null, intensity = 1 } = {}) {
  const steps = (look?.steps || [])
    .map(s => ({ s, technique: techniqueFor(s) }))
    .filter(({ technique, s }) => TECHNIQUE_PHRASE[technique] && hex(s.shade_hex));

  if (!steps.length) return null;

  const strength = intensity < 0.75 ? 'Keep it restrained — this should read as barely-there.'
    : intensity > 1.2 ? 'Make it deliberate and camera-ready, but still wearable.'
    : 'Everyday intensity: clearly present, never heavy.';

  const items = steps.map(({ s, technique }) =>
    `- ${TECHNIQUE_PHRASE[technique](hex(s.shade_hex))}`
    + (s.finish ? ` Finish: ${s.finish}.` : ''));

  const notes = [];
  if (face?.eye_shape && FACE_NOTE[face.eye_shape]) notes.push(FACE_NOTE[face.eye_shape]);
  if (face?.lip_fullness && FACE_NOTE[face.lip_fullness]) notes.push(FACE_NOTE[face.lip_fullness]);
  if (face?.skin_undertone) notes.push(`The skin undertone is ${face.skin_undertone}; keep the colours true to it.`);
  if (face?.skin_depth) notes.push(`Skin depth is ${face.skin_depth} — the shades below are chosen for it and must not be lightened or darkened to compensate.`);

  return [
    'Apply makeup to the person in this photograph.',
    '',
    'Apply exactly these products, and nothing else:',
    ...items,
    '',
    strength,
    ...(notes.length ? ['', ...notes] : []),
    '',
    PRESERVE,
    'Add no jewellery, no filter, no glow, and no colour grade.',
  ].join('\n');
}

/* ---------------- Try-on ---------------- */

const SLOT_PHRASE = {
  dress: 'as the dress',
  top: 'on the upper body',
  bottom: 'on the lower body',
  outerwear: 'as an open outer layer over the rest',
  shoes: 'on the feet',
  bag: 'carried in one hand or on the shoulder',
  accessory: 'as the accessory',
  jewelry: 'as the jewellery',
  headwear: 'on the head',
};

function describeItem(item, slot) {
  const bits = [];
  const colour = item.color_primary?.name_en || item.color_primary?.name_he;
  if (colour) bits.push(colour.toLowerCase());
  const h = hex(item.color_primary?.hex);
  if (h) bits.push(`(${h})`);
  if (item.fabric_guess) bits.push(FABRIC_NAMES[item.fabric_guess]?.en?.toLowerCase() || item.fabric_guess);
  bits.push((enSub(item.subcategory) || enCat(item.category)).toLowerCase());
  const trailing = [];
  if (item.fit) trailing.push(`${(FIT_NAMES[item.fit]?.en || item.fit).toLowerCase()} fit`);
  if (item.pattern && item.pattern !== 'solid') trailing.push(`${(PATTERN_NAMES[item.pattern]?.en || item.pattern).toLowerCase()} pattern`);
  if (item.length) trailing.push(`${item.length} length`);

  return `- ${bits.join(' ')} ${SLOT_PHRASE[slot] || ''}`.trimEnd()
    + (trailing.length ? ` — ${trailing.join(', ')}.` : '.');
}

/**
 * The instruction for dressing the owner's own photograph in their own clothes.
 *
 * `attachments` names the garment photos that should be sent alongside, in
 * order, so the caller can wire them to whichever slots the model exposes.
 * A model that can see the actual garment reproduces it; one working from the
 * description alone invents a plausible substitute, which is not the point.
 */
export function tryOnPrompt({ look, items = [], occasion = null, body = null } = {}) {
  const worn = (look?.items || [])
    .map(entry => ({ slot: entry.slot, item: items.find(i => i.id === entry.id) }))
    .filter(x => x.item);

  if (!worn.length) return null;

  const withPhotos = worn.filter(x => x.item.thumb);
  const lines = worn.map(({ item, slot }) => describeItem(item, slot));

  const notes = [];
  if (withPhotos.length) {
    notes.push(
      `${withPhotos.length} garment photograph${withPhotos.length > 1 ? 's are' : ' is'} attached. `
      + 'Reproduce those exact garments — their colour, fabric, cut and any detail — rather than '
      + 'inventing something similar. The written description is there to disambiguate the photograph, not to replace it.');
  }
  notes.push('The clothes must sit on the body as real cloth: correct drape, folds where the fabric '
    + 'gathers, contact shadows where it meets the body, and the hem falling where the garment length says it should.');
  if (look?.silhouette_en) notes.push(`The intended silhouette: ${look.silhouette_en}`);
  if (body?.shape) notes.push(`The body shape is ${body.shape}; the fit should read correctly on that frame.`);
  if (occasion) notes.push(`The occasion is ${enOcc(occasion)}.`);

  return [
    'Dress the person in this photograph in the following outfit, replacing what they are currently wearing.',
    '',
    ...lines,
    '',
    ...notes,
    '',
    PRESERVE,
    'Do not add any garment or accessory that is not listed above.',
  ].join('\n');
}

/** The garment photos that should be attached, in the order the prompt lists them. */
export function tryOnAttachments({ look, items = [] } = {}) {
  return (look?.items || [])
    .map(entry => items.find(i => i.id === entry.id))
    .filter(i => i?.thumb)
    .map(i => ({ id: i.id, name_en: i.name_en || enSub(i.subcategory), thumb: i.thumb }));
}

/* ============================================================
   The full brief — one photograph, both changes
   ============================================================ */

/** The garment lines, without the framing — so the full brief can reuse them. */
function garmentLines(look, items) {
  return (look?.items || [])
    .map(entry => ({ slot: entry.slot, item: items.find(i => i.id === entry.id) }))
    .filter(x => x.item)
    .map(({ item, slot }) => describeItem(item, slot));
}

/** The makeup product lines, same idea. */
function makeupLines(look) {
  return (look?.steps || [])
    .map(s => ({ s, technique: techniqueFor(s) }))
    .filter(({ technique, s }) => TECHNIQUE_PHRASE[technique] && hex(s.shade_hex))
    .map(({ s, technique }) => `- ${TECHNIQUE_PHRASE[technique](hex(s.shade_hex))}`
      + (s.finish ? ` Finish: ${s.finish}.` : ''));
}

/**
 * One brief covering the outfit and the makeup together, with the photographs
 * it refers to numbered in the order they are attached.
 *
 * Numbering is the point. A model handed six images and a paragraph has to
 * guess which one is the person and which is the handbag, and it guesses
 * wrong — the outfit comes back on the wrong body, or a garment photo gets
 * treated as the scene. Naming each photograph by its position removes the
 * guess, and it is the only reason this works as a single paste.
 *
 * Both halves share one PRESERVE clause rather than carrying their own,
 * because two paragraphs saying "do not change the face" in different words is
 * how a model ends up weighing them against each other.
 *
 * @returns {{text: string, photos: Array}|null}
 */
export function fullBrief({
  look = null, makeup = null, items = [], face = null, body = null,
  occasion = null, intensity = 1, subject = null, faceCloseUp = null,
} = {}) {
  const clothes = look ? garmentLines(look, items) : [];
  const products = makeup ? makeupLines(makeup) : [];
  if (!clothes.length && !products.length) return null;
  if (!subject) return null;

  const photos = [{ role: 'subject', label_en: 'the person', dataUrl: subject, filename: 'vestra-subject.jpg' }];
  const manifest = ['Photo 1 — the person. Every change below is applied to this photograph.'];

  const attached = look ? tryOnAttachments({ look, items }) : [];
  for (const a of attached) {
    photos.push({ role: 'garment', label_en: a.name_en, dataUrl: a.thumb, filename: `vestra-${a.name_en.replace(/[^\w]+/g, '-').toLowerCase()}.jpg` });
    manifest.push(`Photo ${photos.length} — ${a.name_en}, one of the garments to put on them.`);
  }

  // A separate, closer photograph of the face makes the makeup land; without
  // one the model works from whatever resolution the full-length shot gives it.
  if (faceCloseUp && faceCloseUp !== subject && products.length) {
    photos.push({ role: 'face', label_en: 'the face, close up', dataUrl: faceCloseUp, filename: 'vestra-face.jpg' });
    manifest.push(`Photo ${photos.length} — the same person's face, closer. Reference for the makeup only; the result is Photo 1.`);
  }

  const out = [
    'Retouch the attached photograph of one person. Return one image.',
    '',
    'PHOTOGRAPHS',
    ...manifest,
    '',
    'WHAT TO CHANGE',
  ];

  let n = 0;
  if (clothes.length) {
    out.push(`${++n}. Clothing — replace everything they are wearing with exactly this, and nothing more:`);
    out.push(...clothes.map(l => '   ' + l));
    if (attached.length) {
      out.push('   Reproduce those garments from their photographs — colour, fabric, cut, every detail —'
        + ' rather than inventing something similar. The written line is there to disambiguate the photograph, not to replace it.');
    }
    out.push('   The clothes must sit on the body as real cloth: correct drape, folds where the fabric gathers,'
      + ' contact shadows where it meets the body, and the hem falling where the stated length says it should.');
    if (look?.silhouette_en) out.push(`   Intended silhouette: ${look.silhouette_en}`);
    if (body?.shape) out.push(`   The body shape is ${body.shape}; the fit should read correctly on that frame.`);
  }

  if (products.length) {
    out.push(`${++n}. Makeup — apply exactly these products, and nothing else:`);
    out.push(...products.map(l => '   ' + l));
    out.push('   ' + (intensity < 0.75 ? 'Keep it restrained — this should read as barely-there.'
      : intensity > 1.2 ? 'Make it deliberate and camera-ready, but still wearable.'
      : 'Everyday intensity: clearly present, never heavy.'));
    if (face?.eye_shape && FACE_NOTE[face.eye_shape]) out.push('   ' + FACE_NOTE[face.eye_shape]);
    if (face?.lip_fullness && FACE_NOTE[face.lip_fullness]) out.push('   ' + FACE_NOTE[face.lip_fullness]);
    if (face?.skin_undertone) out.push(`   The skin undertone is ${face.skin_undertone}; keep the colours true to it.`);
    if (face?.skin_depth) out.push(`   Skin depth is ${face.skin_depth} — the shades are chosen for it and must not be lightened or darkened to compensate.`);
  }

  if (occasion) out.push('', `The occasion is ${enOcc(occasion)}.`);

  out.push('', 'WHAT MUST NOT CHANGE', PRESERVE);
  if (clothes.length) out.push('Do not add any garment or accessory that is not listed above.');

  return { text: out.join('\n'), photos };
}
