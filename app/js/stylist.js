/* ============================================================
   VESTRA · Local styling engine
   A rules-based fallback so the app is fully usable with no API key.
   Implements the scoring model from SKILL.md Module 4.1.

   Three kinds of rule, in descending authority:

   1. HARD FILTERS — the piece never reaches a look. Coverage level and the
      "never wearing" list are the owner's own instructions, so they are not
      negotiable. Fabric-vs-weather is hard too, but relaxes for a slot that
      would otherwise come up empty.
   2. GATES — the seven documented quality rules. A candidate that breaks one
      is set aside; it is only used when every candidate breaks one, so the
      look still gets built rather than silently losing a slot.
   3. WEIGHTS — the scoring model, which orders whatever survives.
   ============================================================ */

import {
  occFormality, WEATHER_SEASON, hexFor, catName, subName,
  FABRIC_NAMES, OCCASIONS, formalityName,
} from './taxonomy.js';
import { isHe } from './i18n.js';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/* ---------------- Colour helpers ---------------- */
const NEUTRALS = ['black', 'white', 'cream', 'ivory', 'navy', 'grey', 'gray', 'charcoal',
  'beige', 'camel', 'tan', 'khaki', 'brown', 'sand', 'stone', 'taupe', 'off-white'];

const isNeutral = (item) => {
  const n = (item.color_primary?.name_en || '').toLowerCase();
  return item.color_family === 'neutral' || item.color_family === 'white' ||
         item.color_family === 'monochrome-black' || NEUTRALS.some(k => n.includes(k));
};

/* The health report builds a look per occasion per weather, so the same few
   dozen hex values are converted thousands of times. Memoised. */
const HSL_CACHE = new Map();

function hexToHsl(hex) {
  if (HSL_CACHE.has(hex)) return HSL_CACHE.get(hex);
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  let out = null;
  if (m) {
    const [r, g, b] = [1, 2, 3].map(i => parseInt(m[i], 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) {
      out = { h: 0, s: 0, l };
    } else {
      const d = max - min;
      const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      let h;
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      out = { h: h * 60, s, l };
    }
  }
  if (HSL_CACHE.size < 4000) HSL_CACHE.set(hex, out);
  return out;
}

const rgbOf = (hex) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  return m ? [1, 2, 3].map(i => parseInt(m[i], 16)) : null;
};

/** Straight RGB distance — enough to tell "two blacks" from "black and navy". */
function hexDistance(a, b) {
  const x = rgbOf(a), y = rgbOf(b);
  if (!x || !y) return a === b ? 0 : 999;
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

const hueDist = (a, b) => {
  const d = Math.abs(a - b);
  return d > 180 ? 360 - d : d;
};

/** 0-1: how well two items sit together on the colour wheel. */
function colorHarmony(a, b) {
  const na = isNeutral(a), nb = isNeutral(b);
  const ha = hexToHsl(hexFor(a.color_primary));
  const hb = hexToHsl(hexFor(b.color_primary));

  if (na && nb) {
    // Two neutrals nearly always work. The exception is two different hues at
    // the same depth — mid-grey with mid-taupe reads as a near-miss rather
    // than a decision, because nothing tells the eye it was deliberate.
    if (!ha || !hb) return 0.9;
    if (Math.abs(ha.l - hb.l) < 0.08 && hueDist(ha.h, hb.h) > 25) return 0.62;
    return 0.94;
  }
  if (na || nb) return 0.9;                 // one neutral carries any colour
  if (!ha || !hb) return 0.6;

  const d = hueDist(ha.h, hb.h);
  if (d < 25) return 0.95;                  // monochrome / near-monochrome
  if (d < 60) return 0.8;                   // analogous
  if (d > 150) {
    // Complementary only works on a 70/30 split. Two saturated pieces at equal
    // weight compete; once either side is muted, one of them recedes.
    return (ha.s > 0.5 && hb.s > 0.5) ? 0.5 : 0.82;
  }
  return 0.45;                              // awkward middle distance
}

/* ---------------- Quality gates ---------------- */
const MAX_FORMALITY_SPREAD = 2;
const MAX_COLOR_FAMILIES = 3;
const MAX_POINTS_OF_INTEREST = 3;

const LOUD_PATTERN = new Set(['plaid', 'check', 'houndstooth', 'floral', 'animal',
  'polka', 'geometric', 'tie-dye', 'logo', 'colorblock']);
const LOUD_FABRIC = new Set(['satin', 'velvet', 'shearling', 'faux-fur', 'leather', 'suede', 'tweed']);
const LOUD_TEXTURE = new Set(['glossy', 'quilted', 'sheer', 'distressed']);

/** A piece the eye stops on. Three of these is a look; four is noise. */
function isPointOfInterest(item) {
  if (LOUD_PATTERN.has(item.pattern)) return true;
  if (LOUD_FABRIC.has(item.fabric_guess)) return true;
  if (LOUD_TEXTURE.has(item.texture)) return true;
  if (item.category === 'jewelry') return true;
  if (!isNeutral(item)) {
    const h = hexToHsl(hexFor(item.color_primary));
    if (h && h.s > 0.55 && h.l > 0.2 && h.l < 0.8) return true;
  }
  return false;
}

const familyOf = (item) => (isNeutral(item) ? 'neutral' : (item.color_family || 'other'));
const familyCount = (list) => new Set(list.map(familyOf)).size;

const formalitySpread = (list) => {
  if (!list.length) return 0;
  const f = list.map(c => c.formality || 2);
  return Math.max(...f) - Math.min(...f);
};

function breaksGate(item, chosen) {
  const all = [...chosen, item];
  if (formalitySpread(all) > MAX_FORMALITY_SPREAD) return true;
  if (familyCount(all) > MAX_COLOR_FAMILIES) return true;
  if (all.filter(isPointOfInterest).length > MAX_POINTS_OF_INTEREST) return true;
  return false;
}

/* ---------------- Hard filters ---------------- */
const COVERED_CATS = new Set(['top', 'bottom', 'dress', 'activewear', 'swim']);
const BARE_SUBS = new Set(['tank', 'crop-top', 'sports-bra', 'bikini', 'one-piece', 'slip-dress']);
const SHORT_SUBS = new Set(['mini-skirt', 'shorts', 'mini-dress', 'training-shorts', 'swim-shorts']);

/**
 * The coverage level is an instruction, not a preference — a piece that fails
 * it is removed before scoring rather than penalised and occasionally chosen
 * anyway.
 */
function coverageOK(item, level) {
  if (!level || level === 'none') return true;
  if (!COVERED_CATS.has(item.category)) return true;

  const sleeve = String(item.sleeve || '').toLowerCase();
  const length = String(item.length || '').toLowerCase();
  const sub = item.subcategory;

  const upper = ['top', 'dress', 'swim', 'activewear'].includes(item.category);
  const lower = ['bottom', 'dress', 'swim', 'activewear'].includes(item.category);

  const bareShoulder = ['sleeveless', 'strapless', 'halter', 'spaghetti', 'cami', 'tube']
    .some(k => sleeve.includes(k)) || BARE_SUBS.has(sub);
  // "cropped" on a trouser means ankle-length, not bare midriff — so the
  // midriff and hemline tests only apply to the half of the body they describe.
  const midriff = upper && (length.includes('crop') || item.fit === 'cropped' || sub === 'crop-top');
  const aboveKnee = lower && (['mini', 'micro', 'above-knee'].some(k => length.includes(k))
    || SHORT_SUBS.has(sub));

  if (level === 'shoulders') return !bareShoulder && !midriff;
  if (level === 'knees') return !bareShoulder && !midriff && !aboveKnee;
  if (level === 'full-cover') {
    if (bareShoulder || midriff || aboveKnee) return false;
    if (item.texture === 'sheer') return false;
    if (['short', 'cap', 'elbow'].includes(sleeve)) return false;
    return true;
  }
  return true;
}

/** Compile the "never wearing" list into word-boundary matchers, once. */
function compileNoGo(profile) {
  return String(profile?.no_go || '')
    .toLowerCase()
    .split(/[,\n;]/)
    .map(s => s.trim())
    .filter(s => s.length >= 2)
    .map(term => {
      const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Bound on non-letters rather than \b: \b is defined over ASCII word
      // characters, so it fires in the middle of a Hebrew word. Without the
      // boundary, "tan" also strikes out every tank top.
      try {
        return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}([^\\p{L}\\p{N}]|$)`, 'u');
      } catch {
        return new RegExp(`(^|[^A-Za-z0-9])${esc}([^A-Za-z0-9]|$)`);
      }
    });
}

function noGoHit(item, matchers) {
  if (!matchers.length) return false;
  const hay = [item.name_en, item.name_he, item.subcategory, subName(item.subcategory),
               item.color_primary?.name_en, item.color_primary?.name_he,
               item.pattern, item.fabric_guess]
    .filter(Boolean).join(' · ').toLowerCase();
  return matchers.some(re => re.test(hay));
}

const CLOTHING = new Set(['top', 'bottom', 'dress', 'outerwear', 'activewear']);
const HEAVY_FABRIC = new Set(['wool', 'cashmere', 'shearling', 'faux-fur', 'velvet', 'tweed', 'corduroy']);
const HOT_WEATHER = new Set(['heatwave', 'hot']);
const HOT_BOOTS = new Set(['tall-boots', 'ankle-boots', 'chelsea-boots']);

/**
 * Fabric against weather. Restricted to clothing on purpose: leather is a
 * heavy fabric on a coat and an ordinary one on a sandal, so shoes and bags
 * are judged by subcategory instead.
 */
function weatherOK(item, weather) {
  // Flip-flops are gated by occasion in the look builder, not here.
  if (item.category === 'shoes') {
    return !(HOT_WEATHER.has(weather) && HOT_BOOTS.has(item.subcategory));
  }
  if (!CLOTHING.has(item.category)) return true;

  if (HOT_WEATHER.has(weather)) {
    if (HEAVY_FABRIC.has(item.fabric_guess)) return false;
    if (item.weight === 'heavy') return false;
    if (weather === 'heatwave' && item.category === 'outerwear') return false;
  }
  if (weather === 'cold') {
    if (item.fabric_guess === 'linen') return false;
    if (item.texture === 'sheer') return false;
    if (item.weight === 'ultralight' && item.category !== 'top') return false;
  }
  return true;
}

/* ---------------- Scoring ---------------- */
function seasonFit(item, season) {
  const s = item.season || [];
  if (!s.length) return 0.6;
  if (s.includes(season)) return 1;
  const adjacent = { summer: ['spring'], spring: ['summer', 'fall'], fall: ['spring', 'winter'], winter: ['fall'] };
  return (adjacent[season] || []).some(x => s.includes(x)) ? 0.5 : 0.1;
}

const formalityFit = (item, target) => {
  const d = Math.abs((item.formality || 2) - target);
  return d === 0 ? 1 : d === 1 ? 0.75 : d === 2 ? 0.35 : 0.05;
};

const LOOSE_FITS = ['oversized', 'relaxed', 'wide'];
const TIGHT_FITS = ['slim', 'tailored'];
const CORE_CATS = new Set(['top', 'bottom', 'dress']);

/**
 * Silhouette balance. Volume needs a counterweight, and so does its absence:
 * two loose core pieces lose the body entirely, and an all-fitted look has no
 * line to read. Outerwear is exempt — a relaxed coat over a clean base is the
 * counterweight, not a second offence.
 */
function silhouetteBalance(item, chosen) {
  if (!CORE_CATS.has(item.category)) return 1;
  const others = chosen.filter(c => CORE_CATS.has(c.category));
  if (!others.length) return 1;
  if (LOOSE_FITS.includes(item.fit) && others.some(c => LOOSE_FITS.includes(c.fit))) return 0.25;
  if (TIGHT_FITS.includes(item.fit) && others.every(c => TIGHT_FITS.includes(c.fit))) return 0.7;
  return 1;
}

const trendScore = (item) =>
  ({ 'current-2026': 1, rising: 0.95, timeless: 0.85, fading: 0.45, dated: 0.2 }[item.trend_status] ?? 0.7);

const STRUCTURED_OUTER = new Set(['blazer', 'trench', 'overcoat', 'bomber', 'denim-jacket', 'leather-jacket']);
const LONG_OPEN_OUTER = new Set(['cardigan-long', 'trench', 'overcoat']);
const WAIST_MAKERS = new Set(['belt', 'wrap-dress', 'sheath-dress', 'pencil-skirt']);

/**
 * Body-shape balance, as a -1..1 adjustment rather than a weight, so a profile
 * with no shape set scores exactly as it did before.
 *
 * The principle throughout is balance, never concealment: add volume and
 * interest where you want width, add structure and vertical line where you
 * want length.
 */
function bodyDelta(item, profile) {
  const shape = profile?.body_shape;
  if (!shape) return 0;

  const { category: cat, subcategory: sub, fit } = item;
  const wide = LOOSE_FITS.includes(fit);
  const clean = ['tailored', 'slim', 'regular'].includes(fit);
  const loud = isPointOfInterest(item);
  let d = 0;

  switch (shape) {
    case 'pear':
    case 'triangle':
      // Width belongs on the shoulder line; the lower half stays quiet.
      if (cat === 'top' && (loud || wide)) d += 0.6;
      if (cat === 'outerwear' && STRUCTURED_OUTER.has(sub)) d += 0.5;
      if (cat === 'bottom' && loud) d -= 0.7;
      if (cat === 'bottom' && clean) d += 0.4;
      break;

    case 'inverted-triangle':
      // The mirror image — volume moves down.
      if (cat === 'bottom' && (wide || loud)) d += 0.6;
      if (cat === 'top' && loud) d -= 0.5;
      if (cat === 'top' && clean) d += 0.4;
      if (cat === 'outerwear' && ['puffer', 'shearling'].includes(sub)) d -= 0.5;
      break;

    case 'apple':
    case 'oval':
      // One long vertical line, and nothing gripping the middle.
      if (cat === 'outerwear' && LONG_OPEN_OUTER.has(sub)) d += 0.7;
      if (cat === 'top' && fit === 'slim') d -= 0.5;
      if (cat === 'top' && ['regular', 'relaxed'].includes(fit)) d += 0.4;
      if (sub === 'crop-top' || item.length === 'cropped') d -= 0.6;
      break;

    case 'rectangle':
      // Nothing to counterbalance — the job is to create a waist.
      if (WAIST_MAKERS.has(sub)) d += 0.7;
      if (cat === 'top' && fit === 'oversized') d -= 0.4;
      break;

    case 'hourglass':
      // The waist is the proportion; volume on both halves buries it.
      if (wide && CORE_CATS.has(cat)) d -= 0.5;
      if (WAIST_MAKERS.has(sub)) d += 0.6;
      break;

    default:
      break;   // trapezoid and anything unmapped: no adjustment
  }
  return clamp(d, -1, 1);
}

function scoreItem(item, { target, season, chosen, profile }) {
  const harmony = chosen.length
    ? chosen.reduce((acc, c) => acc + colorHarmony(item, c), 0) / chosen.length
    : 0.85;

  let score = harmony * 0.30
            + formalityFit(item, target) * 0.25
            + seasonFit(item, season) * 0.20
            + silhouetteBalance(item, chosen) * 0.15
            + trendScore(item) * 0.10;

  score += bodyDelta(item, profile) * 0.12;
  if (item.favorite) score += 0.06;
  score += Math.min((item.versatility_score || 50) / 100, 1) * 0.04;

  return score;
}

/* ---------------- Look assembly ---------------- */
/**
 * Formality is a hard gate, not just a weight: a piece more than two levels
 * away from the target never enters the outfit while anything closer exists.
 * Without this, the silhouette and colour weights can outvote it and pair
 * jeans with a blazer for a black-tie target.
 */
const pickBest = (pool, ctx, { optional = false } = {}) => {
  if (!pool.length) return null;

  // A piece already worn in this look can't fill a second slot too.
  const usedIds = new Set(ctx.chosen.map(c => c.id));
  let use = pool.filter(i => !usedIds.has(i.id));
  if (!use.length) return null;

  const dist = (i) => Math.abs((i.formality || 2) - ctx.target);
  const inRange = use.filter(i => dist(i) <= 2);
  if (inRange.length) {
    use = inRange;
  } else {
    // Nothing in range — fall back to whatever sits closest, so a black-tie
    // request in a casual closet still reaches for the dressiest thing owned.
    const min = Math.min(...use.map(dist));
    use = use.filter(i => dist(i) === min);
  }

  const clean = use.filter(i => !breaksGate(i, ctx.chosen));
  // A garment the look cannot do without is worth a broken gate — the gap list
  // then says so. A belt is not: an accessory that pulls the formality spread
  // open is simply left off, which is what a stylist would do.
  if (!clean.length && optional) return null;
  if (clean.length) use = clean;

  return use
    .map(i => ({ i, s: scoreItem(i, ctx) }))
    .sort((a, b) => b.s - a.s)[0].i;
};

const byCat = (items, cat) => items.filter(i => i.category === cat);

/**
 * Build one outfit from the wardrobe using local rules only.
 * Returns a payload shaped exactly like the AI look schema so the same
 * renderer handles both engines.
 */
export function buildLookLocal({ wardrobe, profile, request, anchor = null }) {
  const target = request.formality ?? occFormality(request.occasion);
  const season = WEATHER_SEASON[request.weather] || 'summer';
  const weather = request.weather;
  const noGo = compileNoGo(profile);

  const chosen = [];
  const items = [];
  const ctx = () => ({ target, season, chosen, profile });

  const add = (item, slot) => {
    if (!item) return;
    chosen.push(item);
    items.push({ slot, id: item.id, reason_he: reasonFor(item, slot, 'he'), reason_en: reasonFor(item, slot, 'en') });
  };

  // Coverage and the no-go list are the owner's instructions — always applied.
  // Weather is applied too, but `relaxed` keeps a version without it so a slot
  // that would otherwise be empty can still be filled.
  const allowed = wardrobe.filter(i =>
    i.category !== 'underlayer' &&
    (i.formality || 2) <= target + 1 &&
    coverageOK(i, profile?.modesty_level) &&
    !noGoHit(i, noGo));

  const usable = allowed.filter(i => weatherOK(i, weather));

  /** Pieces of a category, falling back past the weather rule only if asked. */
  const poolFor = (cat, { relax = true } = {}) => {
    const strict = byCat(usable, cat);
    return (strict.length || !relax) ? strict : byCat(allowed, cat);
  };

  if (anchor) add(anchor, anchor.category === 'dress' ? 'dress' : anchor.category);

  /* --- Torso + legs, or a dress --- */
  if (!chosen.some(c => c.category === 'dress')) {
    const haveTop = chosen.some(c => c.category === 'top');
    const haveBottom = chosen.some(c => c.category === 'bottom');
    const bottomPool = poolFor('bottom');
    const bestTop = haveTop ? null : pickBest(poolFor('top'), ctx());
    // Deterministic: a dress wins when the closet can't dress the two halves,
    // or when the occasion is formal and the best dress outscores the best top.
    // (This used to be a coin flip, so the same request produced a different
    // look each time it was asked.)
    const bestDress = (anchor || haveTop || haveBottom) ? null : pickBest(poolFor('dress'), ctx());
    let useDress = false;
    if (bestDress) {
      if (!bestTop || !bottomPool.length) useDress = true;
      else if (target >= 4) useDress = scoreItem(bestDress, ctx()) >= scoreItem(bestTop, ctx());
    }

    if (useDress) {
      add(bestDress, 'dress');
    } else {
      if (!haveTop) add(bestTop, 'top');
      if (!haveBottom) add(pickBest(bottomPool, ctx()), 'bottom');
    }
  }

  const haveDress = chosen.some(c => c.category === 'dress');

  /* --- Shoes are never optional, so they are settled before the extras and
         may break a gate if the closet leaves no choice. --- */
  const shoePool = poolFor('shoes').filter(s =>
    s.subcategory !== 'flip-flops' || ['beach', 'home'].includes(request.occasion));
  add(pickBest(shoePool, ctx()), 'shoes');

  /* --- Outer layer — cool weather, or a formal target on a day that can
         carry one. A formal occasion in the heat does not want a layer, so it
         must not report one as missing either. --- */
  const wantsOuter = ['mild', 'cool', 'cold', 'rain'].includes(weather) ||
                     (target >= 4 && !HOT_WEATHER.has(weather));
  if (wantsOuter) {
    // No weather fallback here: relaxing it would put a wool coat on a hot day
    // purely because the occasion is formal. Cold and rain make the layer
    // genuinely necessary; a formal target on its own does not.
    const needed = ['cold', 'rain'].includes(weather);
    add(pickBest(poolFor('outerwear', { relax: false }), ctx(), { optional: !needed }), 'outerwear');
  }

  /* --- The extras. Every one of these is a nice-to-have, so a candidate that
         would break a gate is dropped rather than forced in. --- */
  add(pickBest(poolFor('bag'), ctx(), { optional: true }), 'bag');
  add(pickBest(poolFor('accessory'), ctx(), { optional: true }), 'accessory');
  if (target >= 4) add(pickBest(poolFor('jewelry'), ctx(), { optional: true }), 'jewelry');

  /* --- Palette ---
     Deduped by eye rather than by string: an all-black outfit whose pieces are
     catalogued as #1A1A1C and #17171A is one colour, and showing it as four
     swatches reads as a rendering fault rather than as a colour story. --- */
  const palette = [];
  for (const c of chosen) {
    if (palette.length >= 4) break;
    const hex = hexFor(c.color_primary);
    if (palette.some(p => hexDistance(p.hex, hex) < 30)) continue;
    palette.push({
      name_he: c.color_primary?.name_he || '', name_en: c.color_primary?.name_en || '', hex,
    });
  }

  /* --- Gaps: every slot the engine wanted and the closet couldn't fill.
         The health report counts these across every occasion, which is what
         turns them into a shopping list. --- */
  const fName = formalityName(target);
  const gaps = [];
  const gap = (slot, item_he, item_en, why_he, why_en, est_price_ils) =>
    gaps.push({ slot, item_he, item_en, why_he, why_en, est_price_ils });

  if (!chosen.some(c => c.category === 'shoes')) {
    gap('shoes', 'זוג נעליים מתאים לדרגת הפורמליות הזו', 'A pair of shoes at this formality level',
      'אין בארון נעל שמתאימה לאירוע ולמזג האוויר', 'No shoe in the closet matches this occasion and weather', 350);
  }
  if (!haveDress && !chosen.some(c => c.category === 'top')) {
    gap('top', `עליונית בדרגת ${fName}`, `A top at ${fName} level`,
      'חסרה עליונית שמתאימה לאירוע', 'No suitable top in the closet', 180);
  }
  if (!haveDress && !chosen.some(c => c.category === 'bottom')) {
    gap('bottom', `פריט תחתון בדרגת ${fName}`, `A bottom at ${fName} level`,
      'חסר פריט תחתון שמתאים לאירוע', 'No suitable bottom in the closet', 260);
  }
  if (wantsOuter && !chosen.some(c => c.category === 'outerwear')) {
    gap('outerwear', 'שכבת חוץ מתאימה למזג האוויר ולאירוע', 'An outer layer for this weather and occasion',
      'האירוע או מזג האוויר דורשים שכבה, ואין אחת מתאימה', 'The occasion or the weather calls for a layer and none fits', 480);
  }

  const spread = formalitySpread(chosen);
  if (spread > MAX_FORMALITY_SPREAD) {
    gap('formality', `פריט ביניים בדרגת ${fName}`, `A bridging piece at ${fName} level`,
      `הפער בין הפריט הפורמלי ביותר לפחות פורמלי הוא ${spread} דרגות — הלוק לא נקרא כיחידה אחת`,
      `The spread between the most and least formal piece is ${spread} levels — the look doesn't read as one`, 300);
  }

  const loose = chosen.filter(c => CORE_CATS.has(c.category) && LOOSE_FITS.includes(c.fit)).length;
  const silhouette = loose >= 2
    ? { he: 'שתי שכבות רפויות — שקול להחליף אחת בגזרה נקייה', en: 'Two relaxed layers — consider swapping one for a clean line' }
    : loose === 1
      ? { he: 'שכבה רפויה אחת מאוזנת מול גזרה נקייה — מותן מוגדרת', en: 'One relaxed layer balanced against a clean line — defined waist' }
      : { he: 'קו נקי ואנכי לאורך כל הלוק', en: 'A clean vertical line throughout' };

  const confidence = clamp(
    0.45
    + (chosen.length >= 4 ? 0.15 : 0)
    + (spread <= MAX_FORMALITY_SPREAD ? 0.15 : 0)
    + (gaps.length === 0 ? 0.15 : 0)
    + (chosen.some(c => c.category === 'shoes') ? 0.08 : 0),
    0, 0.95);

  return {
    engine: 'local',
    title_he: 'הלוק שלך', title_en: 'Your look',
    occasion_he: '', occasion_en: '',
    formality: target,
    items,
    palette,
    silhouette_he: silhouette.he, silhouette_en: silhouette.en,
    why_it_works_he: whyWorks(chosen, palette, profile, 'he'),
    why_it_works_en: whyWorks(chosen, palette, profile, 'en'),
    trend_note_he: trendNote(chosen, 'he'),
    trend_note_en: trendNote(chosen, 'en'),
    alternative_he: altText(chosen, 'he'),
    alternative_en: altText(chosen, 'en'),
    gaps,
    makeup_look: null,
    confidence,
  };
}

/* ---------------- Pair engine (local) ---------------- */
export function pairWithItemLocal({ wardrobe, profile, anchor, request }) {
  const base = occFormality(request.occasion || 'casual-day');
  const role = classifyAnchor(anchor);
  const variants = [
    { variant: 'down', formality: Math.max(1, Math.min(base, (anchor.formality || 2)) - 1) },
    { variant: 'core', formality: anchor.formality || 2 },
    { variant: 'up',   formality: Math.min(6, (anchor.formality || 2) + 2) },
  ];

  return {
    anchor_id: anchor.id,
    anchor_role: role,
    engine: 'local',
    outfits: variants.map(v => ({
      ...buildLookLocal({
        wardrobe: wardrobe.filter(i => i.id !== anchor.id),
        profile,
        request: { ...request, formality: v.formality },
        anchor,
      }),
      variant: v.variant,
    })),
  };
}

function classifyAnchor(item) {
  const textures = ['leather', 'suede', 'shearling', 'faux-fur', 'satin', 'velvet', 'corduroy', 'tweed'];
  if (item.pattern && item.pattern !== 'solid') return 'statement';
  if (!isNeutral(item)) return 'statement';
  if (textures.includes(item.fabric_guess)) return 'texture';
  return 'neutral-base';
}

/* ---------------- Copy generation ---------------- */
const nameOf = (i) => (isHe() ? (i.name_he || subName(i.subcategory)) : (i.name_en || subName(i.subcategory)));

function reasonFor(item, slot, lang) {
  const he = {
    top: 'מאזן את הסילואט ויושב נכון בדרגת הפורמליות',
    bottom: 'הגזרה מאריכה את הקו ומתאימה לעליונית',
    dress: 'פריט אחד שסוגר את כל הלוק',
    outerwear: 'שכבה שמוסיפה מבנה ומעלה דרגה',
    shoes: 'תואמת את דרגת הפורמליות ואת מזג האוויר',
    bag: 'הגודל נכון לאורך האירוע',
    accessory: 'נקודת העניין היחידה — בדיוק כמו שצריך',
    jewelry: 'תכשיט אחד, לא שלושה',
  };
  const en = {
    top: 'Balances the silhouette and sits right for this formality',
    bottom: 'The cut lengthens the line and works with the top',
    dress: 'One piece that closes the whole look',
    outerwear: 'A layer that adds structure and lifts the formality',
    shoes: 'Matches both the dress code and the weather',
    bag: 'Right size for the length of the event',
    accessory: 'The single point of interest — exactly as it should be',
    jewelry: 'One piece of jewellery, not three',
  };
  return (lang === 'he' ? he : en)[slot] || '';
}

const SHAPE_PRINCIPLE = {
  pear: { he: 'נפח למעלה, קו נקי למטה', en: 'volume up top, a clean line below' },
  triangle: { he: 'נפח למעלה, קו נקי למטה', en: 'volume up top, a clean line below' },
  'inverted-triangle': { he: 'נפח למטה מול כתף נקייה', en: 'volume below against a clean shoulder' },
  apple: { he: 'קו אנכי ארוך בלי לחיצה במרכז', en: 'a long vertical line with nothing gripping the middle' },
  oval: { he: 'קו אנכי ארוך בלי לחיצה במרכז', en: 'a long vertical line with nothing gripping the middle' },
  rectangle: { he: 'מותן מוגדרת שיוצרת עקומה', en: 'a defined waist to create the curve' },
  hourglass: { he: 'המותן נשארת גלויה', en: 'the waist stays visible' },
};

function whyWorks(chosen, palette, profile, lang) {
  const fabrics = [...new Set(chosen.map(c => c.fabric_guess).filter(Boolean))]
    .slice(0, 2)
    .map(f => (lang === 'he' ? FABRIC_NAMES[f]?.he : FABRIC_NAMES[f]?.en) || f);
  const mixed = fabrics.length >= 2;
  const poi = chosen.filter(isPointOfInterest).length;
  const shape = SHAPE_PRINCIPLE[profile?.body_shape];

  if (lang === 'he') {
    return `${palette.length} צבעים בלוק${mixed ? `, וניגוד מרקמים בין ${fabrics[0]} ל${fabrics[1]}` : ''}. ` +
           `${poi <= 1 ? 'נקודת עניין אחת' : `${poi} נקודות עניין`} — העין יודעת לאן ללכת. ` +
           `הפער בין הפריט הפורמלי ביותר לפחות פורמלי לא עובר שתי דרגות, כך שהלוק נקרא כיחידה אחת` +
           `${shape ? `, והפרופורציה בנויה על ${shape.he}` : ''}.`;
  }
  return `${palette.length} colours in the outfit${mixed ? `, with a texture contrast between ${fabrics[0]} and ${fabrics[1]}` : ''}. ` +
         `${poi <= 1 ? 'One point of interest' : `${poi} points of interest`} — the eye knows where to go. ` +
         `The spread between the most and least formal piece stays within two levels, so it reads as one deliberate look` +
         `${shape ? `, built around ${shape.en}` : ''}.`;
}

function trendNote(chosen, lang) {
  const allBlack = chosen.length >= 3 && chosen.every(c => isNeutral(c) &&
    /black|שחור/i.test(c.color_primary?.name_en + ' ' + c.color_primary?.name_he));
  if (allBlack) return lang === 'he' ? 'Monochrome Black · F/W 26-27' : 'Monochrome Black · F/W 26-27';
  if (chosen.some(c => c.subcategory === 'blazer')) {
    return lang === 'he' ? 'Soft Power Tailoring · F/W 26-27' : 'Soft Power Tailoring · F/W 26-27';
  }
  if (chosen.some(c => ['plaid', 'check', 'houndstooth'].includes(c.pattern))) {
    return lang === 'he' ? 'Plaid & Tartan · F/W 26-27' : 'Plaid & Tartan · F/W 26-27';
  }
  return lang === 'he' ? 'Quiet Luxury · Cloud Dancer 2026' : 'Quiet Luxury · Cloud Dancer 2026';
}

function altText(chosen, lang) {
  const shoe = chosen.find(c => c.category === 'shoes');
  if (!shoe) return '';
  return lang === 'he'
    ? `החלף את ${nameOf(shoe)} בנעל בדרגה אחת מעל או מתחת — זה כל ההבדל בין יום לערב.`
    : `Swap the ${nameOf(shoe)} for a shoe one level up or down — that alone moves this from day to evening.`;
}

/* ---------------- Local health report ---------------- */
/* Categories the look builder actually places. A swimsuit that never appears
   in an outfit isn't a dead item, it's just outside the model. */
const PLACED_CATS = new Set(['dress', 'top', 'bottom', 'outerwear', 'shoes', 'bag', 'accessory', 'jewelry']);

/**
 * Build one look per occasion per weather and record what happened. Everything
 * downstream — workhorses, dead items, the shopping list — is counted from
 * this pass rather than guessed from a versatility score.
 */
function probe(wardrobe, profile) {
  // A big closet makes each build more expensive, so the sweep narrows rather
  // than letting the report take seconds.
  const weathers = wardrobe.length > 120 ? ['mild'] : ['hot', 'cool'];
  const uses = new Map();
  const gapHits = new Map();
  let looks = 0;

  for (const occ of OCCASIONS) {
    for (const w of weathers) {
      const look = buildLookLocal({ wardrobe, profile, request: { occasion: occ.key, weather: w } });
      looks++;
      for (const it of look.items) uses.set(it.id, (uses.get(it.id) || 0) + 1);
      for (const g of look.gaps || []) {
        const rec = gapHits.get(g.slot) || { n: 0, gap: g };
        rec.n++;
        gapHits.set(g.slot, rec);
      }
    }
  }
  return { uses, gapHits, looks };
}

export function healthLocal(wardrobe, profile = {}) {
  const total = wardrobe.length;
  const by_category = {}, by_formality = {}, by_season = {}, colorCount = {};

  for (const i of wardrobe) {
    by_category[i.category] = (by_category[i.category] || 0) + 1;
    by_formality[i.formality || 2] = (by_formality[i.formality || 2] || 0) + 1;
    (i.season || []).forEach(s => { by_season[s] = (by_season[s] || 0) + 1; });
    const key = i.color_primary?.name_en || i.color_primary?.name_he || '—';
    colorCount[key] = colorCount[key] || { n: 0, hex: hexFor(i.color_primary), he: i.color_primary?.name_he || key };
    colorCount[key].n++;
  }

  const by_color = Object.entries(colorCount)
    .sort((a, b) => b[1].n - a[1].n).slice(0, 6)
    .map(([name_en, v]) => ({ name_en, name_he: v.he, hex: v.hex, pct: Math.round((v.n / Math.max(total, 1)) * 100) }));

  const { uses, gapHits, looks } = total ? probe(wardrobe, profile) : { uses: new Map(), gapHits: new Map(), looks: 0 };

  const warnings = [];
  if (by_color[0] && by_color[0].pct > 30) {
    warnings.push({
      severity: 'medium',
      text_he: `${by_color[0].pct}% מהארון בגוון ${by_color[0].name_he} — הארון "שוקע". הוסף 2-3 ניטרלים אחרים.`,
      text_en: `${by_color[0].pct}% of the closet is ${by_color[0].name_en} — it flattens out. Add 2-3 other neutrals.`,
    });
  }
  const dressy = (by_formality[5] || 0) + (by_formality[6] || 0);
  if (dressy < 4) {
    warnings.push({
      severity: 'high',
      text_he: `רק ${dressy} פריטי ערב — אתה חשוף לאירוע פתאומי.`,
      text_en: `Only ${dressy} evening-level pieces — a sudden event would catch you out.`,
    });
  }
  if (!Object.keys(by_category).length) {
    warnings.push({ severity: 'low', text_he: 'הארון ריק.', text_en: 'The closet is empty.' });
  }

  const workhorses = [...wardrobe]
    .map(i => ({ i, n: uses.get(i.id) || 0 }))
    .filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n || (b.i.versatility_score || 0) - (a.i.versatility_score || 0))
    .slice(0, 3)
    .map(({ i, n }) => ({
      id: i.id,
      outfit_count: n,
      text_he: i.name_he || catName(i.category),
      text_en: i.name_en || catName(i.category),
    }));

  // Never chosen across the whole occasion sweep — the closet is carrying it
  // for nothing. Only stated once there are enough pieces for it to mean
  // something.
  const candidates = wardrobe.filter(i => PLACED_CATS.has(i.category));
  const dead_items = (looks && candidates.length >= 8)
    ? candidates.filter(i => !uses.get(i.id)).map(i => i.id)
    : [];

  if (dead_items.length >= 3) {
    warnings.push({
      severity: 'medium',
      text_he: `${dead_items.length} פריטים לא נבחרו באף אחד מ-${looks} הלוקים שנבדקו — בדוק אם הם עדיין שייכים לארון.`,
      text_en: `${dead_items.length} pieces were not chosen in any of the ${looks} looks tested — worth asking if they still belong.`,
    });
  }

  // Near-duplicates: same category + subcategory + primary colour
  const groups = {};
  for (const i of wardrobe) {
    const k = `${i.category}|${i.subcategory}|${(i.color_primary?.name_en || '').toLowerCase()}`;
    (groups[k] = groups[k] || []).push(i);
  }
  const duplicates = Object.values(groups).filter(g => g.length >= 3).map(g => ({
    ids: g.map(i => i.id),
    text_he: `יש לך ${g.length} פריטים כמעט זהים: ${g[0].name_he || subName(g[0].subcategory)}`,
    text_en: `You have ${g.length} near-identical pieces: ${g[0].name_en || subName(g[0].subcategory)}`,
  }));

  // The shopping list is the gap list, ranked by how often the gap actually
  // stopped a look — not a fixed set of suggestions.
  const buy_next = [...gapHits.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map(({ n, gap }) => ({
      item_he: gap.item_he, item_en: gap.item_en,
      why_he: gap.why_he, why_en: gap.why_en,
      est_price_ils: gap.est_price_ils,
      unlocks_outfits: n,
    }));

  // Two pieces earn a place even when nothing is technically missing, because
  // they change what the rest of the closet can do.
  if (buy_next.length < 3 && !wardrobe.some(i => i.subcategory === 'blazer')) {
    buy_next.push({
      item_he: 'בלייזר לא-מובנה בניטרלי', item_en: 'Unstructured blazer in a neutral',
      est_price_ils: 420,
      why_he: 'הפריט היחיד שמעלה כל לוק בשתי דרגות', why_en: 'The one piece that lifts any outfit two levels',
    });
  }
  if (buy_next.length < 3 && !wardrobe.some(i => i.category === 'accessory' && i.subcategory === 'belt')) {
    buy_next.push({
      item_he: 'חגורת עור (קאמל או שחור)', item_en: 'Leather belt (camel or black)',
      est_price_ils: 180,
      why_he: 'מגדירה מותן — הכלי הכי זול לשיפור פרופורציה', why_en: 'Defines the waist — the cheapest proportion fix there is',
    });
  }

  return {
    total, by_category, by_formality, by_color, by_season,
    warnings, workhorses, duplicates, dead_items, buy_next,
    looks_tested: looks,
    engine: 'local',
  };
}
