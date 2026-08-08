/* ============================================================
   VESTRA · Local styling engine
   A rules-based fallback so the app is fully usable with no API key.
   Implements the scoring model from SKILL.md Module 4.1.
   ============================================================ */

import { occFormality, WEATHER_SEASON, hexFor, catName, subName, FABRIC_NAMES } from './taxonomy.js';
import { isHe } from './i18n.js';

/* ---------------- Colour helpers ---------------- */
const NEUTRALS = ['black', 'white', 'cream', 'ivory', 'navy', 'grey', 'gray', 'charcoal',
  'beige', 'camel', 'tan', 'khaki', 'brown', 'sand', 'stone', 'taupe', 'off-white'];

const isNeutral = (item) => {
  const n = (item.color_primary?.name_en || '').toLowerCase();
  return item.color_family === 'neutral' || item.color_family === 'white' ||
         item.color_family === 'monochrome-black' || NEUTRALS.some(k => n.includes(k));
};

function hexToHsl(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return null;
  let [r, g, b] = [1, 2, 3].map(i => parseInt(m[i], 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

/** 0-1: how well two items sit together on the colour wheel. */
function colorHarmony(a, b) {
  if (isNeutral(a) || isNeutral(b)) return 0.9;
  const ha = hexToHsl(hexFor(a.color_primary));
  const hb = hexToHsl(hexFor(b.color_primary));
  if (!ha || !hb) return 0.6;
  const d = Math.abs(ha.h - hb.h) > 180 ? 360 - Math.abs(ha.h - hb.h) : Math.abs(ha.h - hb.h);
  if (d < 25)  return 0.95;                 // monochrome / near-monochrome
  if (d < 60)  return 0.8;                  // analogous
  if (d > 150) return 0.75;                 // complementary — needs a 70/30 split
  return 0.45;                              // awkward middle distance
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

/** Silhouette balance — penalises two loose pieces stacked with no waist. */
function silhouetteBalance(item, chosen) {
  const loose = ['oversized', 'relaxed', 'wide'];
  const alreadyLoose = chosen.some(c => loose.includes(c.fit));
  if (alreadyLoose && loose.includes(item.fit)) return 0.25;
  return 1;
}

const trendScore = (item) =>
  ({ 'current-2026': 1, rising: 0.95, timeless: 0.85, fading: 0.45, dated: 0.2 }[item.trend_status] ?? 0.7);

function scoreItem(item, { target, season, chosen, profile }) {
  const harmony = chosen.length
    ? chosen.reduce((acc, c) => acc + colorHarmony(item, c), 0) / chosen.length
    : 0.85;

  let score = harmony * 0.30
            + formalityFit(item, target) * 0.25
            + seasonFit(item, season) * 0.20
            + silhouetteBalance(item, chosen) * 0.15
            + trendScore(item) * 0.10;

  if (item.favorite) score += 0.06;
  score += Math.min((item.versatility_score || 50) / 100, 1) * 0.04;

  // Coverage preferences
  if (profile?.modesty_level && profile.modesty_level !== 'none') {
    if (item.sleeve === 'sleeveless') score -= 0.25;
    if (['cropped', 'mini'].includes(item.length)) score -= 0.3;
    if (profile.modesty_level === 'knees' && item.subcategory === 'mini-skirt') score -= 0.4;
  }
  // Hard no-go list
  const noGo = (profile?.no_go || '').toLowerCase().split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  const hay = [item.name_en, item.name_he, item.subcategory, item.color_primary?.name_en,
               item.color_primary?.name_he].join(' ').toLowerCase();
  if (noGo.some(t => t && hay.includes(t))) score -= 1;

  return score;
}

/* ---------------- Look assembly ---------------- */
/**
 * Formality is a hard gate, not just a weight: a piece more than two levels
 * away from the target never enters the outfit while anything closer exists.
 * Without this, the silhouette and colour weights can outvote it and pair
 * jeans with a blazer for a black-tie target.
 */
const pickBest = (pool, ctx) => {
  if (!pool.length) return null;
  const dist = (i) => Math.abs((i.formality || 2) - ctx.target);
  let use = pool.filter(i => dist(i) <= 2);
  if (!use.length) {
    // Nothing in range — fall back to whatever sits closest, so a black-tie
    // request in a casual closet still reaches for the dressiest thing owned.
    const min = Math.min(...pool.map(dist));
    use = pool.filter(i => dist(i) === min);
  }
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
  const ctx = () => ({ target, season, chosen, profile });

  const chosen = [];
  const items = [];
  const add = (item, slot) => {
    if (!item) return;
    chosen.push(item);
    items.push({ slot, id: item.id, reason_he: reasonFor(item, slot, 'he'), reason_en: reasonFor(item, slot, 'en') });
  };

  const usable = wardrobe.filter(i => (i.formality || 2) <= target + 1 && i.category !== 'underlayer');

  if (anchor) add(anchor, anchor.category === 'dress' ? 'dress' : anchor.category);

  const haveDress = chosen.some(c => c.category === 'dress');

  // Torso + legs, or a dress
  if (!haveDress) {
    const dressPool = byCat(usable, 'dress');
    const preferDress = !anchor && dressPool.length && target >= 4 && Math.random() < 0.4;
    if (preferDress) {
      add(pickBest(dressPool, ctx()), 'dress');
    } else {
      if (!chosen.some(c => c.category === 'top'))    add(pickBest(byCat(usable, 'top'), ctx()), 'top');
      if (!chosen.some(c => c.category === 'bottom')) add(pickBest(byCat(usable, 'bottom'), ctx()), 'bottom');
    }
  }

  // Outer layer — cool weather or a formal target
  if (['mild', 'cool', 'cold', 'rain'].includes(request.weather) || target >= 4) {
    add(pickBest(byCat(usable, 'outerwear'), ctx()), 'outerwear');
  }

  // Shoes are never optional
  const shoePool = byCat(usable, 'shoes').filter(s => {
    if (s.subcategory === 'flip-flops') return request.occasion === 'beach' || request.occasion === 'home';
    if (['heatwave', 'hot'].includes(request.weather) &&
        ['tall-boots', 'ankle-boots', 'chelsea-boots'].includes(s.subcategory)) return false;
    return true;
  });
  add(pickBest(shoePool, ctx()), 'shoes');

  add(pickBest(byCat(usable, 'bag'), ctx()), 'bag');

  // At most 3 points of interest overall — one accessory, one jewel
  add(pickBest(byCat(usable, 'accessory'), ctx()), 'accessory');
  if (target >= 4) add(pickBest(byCat(usable, 'jewelry'), ctx()), 'jewelry');

  const palette = [];
  const seen = new Set();
  for (const c of chosen) {
    const hex = hexFor(c.color_primary);
    if (!seen.has(hex) && palette.length < 4) {
      seen.add(hex);
      palette.push({
        name_he: c.color_primary?.name_he || '', name_en: c.color_primary?.name_en || '', hex,
      });
    }
  }

  const gaps = [];
  if (!chosen.some(c => c.category === 'shoes')) {
    gaps.push({
      item_he: 'זוג נעליים מתאים לדרגת הפורמליות הזו',
      item_en: 'A pair of shoes at this formality level',
      why_he: 'אין בארון נעל שמתאימה לאירוע ולמזג האוויר',
      why_en: 'No shoe in the closet matches this occasion and weather',
      est_price_ils: 350,
    });
  }
  if (!haveDress && !chosen.some(c => c.category === 'top')) {
    gaps.push({
      item_he: 'עליונית בדרגת פורמליות מתאימה', item_en: 'A top at the right formality',
      why_he: 'חסרה עליונית שמתאימה לאירוע', why_en: 'No suitable top in the closet',
      est_price_ils: 180,
    });
  }

  const loose = chosen.filter(c => ['oversized', 'relaxed', 'wide'].includes(c.fit)).length;
  const silhouette = loose >= 1
    ? { he: 'שכבה רפויה אחת מאוזנת מול גזרה נקייה — מותן מוגדרת', en: 'One relaxed layer balanced against a clean line — defined waist' }
    : { he: 'קו נקי ואנכי לאורך כל הלוק', en: 'A clean vertical line throughout' };

  return {
    engine: 'local',
    title_he: 'הלוק שלך', title_en: 'Your look',
    occasion_he: '', occasion_en: '',
    formality: target,
    items,
    palette,
    silhouette_he: silhouette.he, silhouette_en: silhouette.en,
    why_it_works_he: whyWorks(chosen, palette, 'he'),
    why_it_works_en: whyWorks(chosen, palette, 'en'),
    trend_note_he: trendNote(chosen, 'he'),
    trend_note_en: trendNote(chosen, 'en'),
    alternative_he: altText(chosen, 'he'),
    alternative_en: altText(chosen, 'en'),
    gaps,
    makeup_look: null,
    confidence: 0.7,
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

function whyWorks(chosen, palette, lang) {
  const fabrics = [...new Set(chosen.map(c => c.fabric_guess).filter(Boolean))]
    .slice(0, 2)
    .map(f => (lang === 'he' ? FABRIC_NAMES[f]?.he : FABRIC_NAMES[f]?.en) || f);
  const mixed = fabrics.length >= 2;
  if (lang === 'he') {
    return `${palette.length} צבעים בלוק${mixed ? `, וניגוד מרקמים בין ${fabrics[0]} ל${fabrics[1]}` : ''}. ` +
           `הפער בין הפריט הפורמלי ביותר לפחות פורמלי לא עובר שתי דרגות, כך שהלוק נקרא כיחידה אחת.`;
  }
  return `${palette.length} colours in the outfit${mixed ? `, with a texture contrast between ${fabrics[0]} and ${fabrics[1]}` : ''}. ` +
         `The spread between the most and least formal piece stays within two levels, so it reads as one deliberate look.`;
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
export function healthLocal(wardrobe) {
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
    .sort((a, b) => (b.versatility_score || 0) - (a.versatility_score || 0))
    .slice(0, 3)
    .map(i => ({
      id: i.id, outfit_count: Math.round((i.versatility_score || 50) / 6),
      text_he: i.name_he || catName(i.category), text_en: i.name_en || catName(i.category),
    }));

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

  const buy_next = [];
  if (!wardrobe.some(i => i.subcategory === 'blazer')) {
    buy_next.push({
      item_he: 'בלייזר לא-מובנה בניטרלי', item_en: 'Unstructured blazer in a neutral',
      est_price_ils: 420, unlocks_outfits: 12,
      why_he: 'הפריט היחיד שמעלה כל לוק בשתי דרגות', why_en: 'The one piece that lifts any outfit two levels',
    });
  }
  if (!wardrobe.some(i => i.category === 'accessory' && i.subcategory === 'belt')) {
    buy_next.push({
      item_he: 'חגורת עור (קאמל או שחור)', item_en: 'Leather belt (camel or black)',
      est_price_ils: 180, unlocks_outfits: 9,
      why_he: 'מגדירה מותן — הכלי הכי זול לשיפור פרופורציה', why_en: 'Defines the waist — the cheapest proportion fix there is',
    });
  }
  if (!wardrobe.some(i => i.category === 'shoes' && i.formality >= 4)) {
    buy_next.push({
      item_he: 'נעל עור בדרגת ערב', item_en: 'Evening-level leather shoe',
      est_price_ils: 390, unlocks_outfits: 8,
      why_he: 'פותחת את כל האירועים הפורמליים', why_en: 'Unlocks every formal occasion you own clothes for',
    });
  }

  return { total, by_category, by_formality, by_color, by_season, warnings, workhorses, duplicates, dead_items: [], buy_next, engine: 'local' };
}
