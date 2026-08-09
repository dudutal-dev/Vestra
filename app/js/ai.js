/* ============================================================
   VESTRA · Claude API client
   Browser → api.anthropic.com, no server in between.
   Prompts mirror skill/vestra-fashion-stylist/references/app-integration.md
   ============================================================ */

import { Settings, hasKey } from './store.js';
import { t } from './i18n.js';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

/* ---------------- Image compression ----------------
   Shrinks to 1280px on the long edge · JPEG q0.85.
   Cuts ~70% of image tokens with no measurable loss in recognition. */
export function compressImage(file, maxEdge = 1280, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read_failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode_failed'));
      img.onload = () => {
        let { width: w, height: h } = img;
        const scale = Math.min(1, maxEdge / Math.max(w, h));
        w = Math.round(w * scale); h = Math.round(h * scale);

        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        const dataUrl = c.toDataURL('image/jpeg', quality);
        resolve({ dataUrl, base64: dataUrl.split(',')[1], mediaType: 'image/jpeg', w, h });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------------- Response parsing ---------------- */
export function parseAIResponse(text) {
  let s = String(text ?? '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = s.search(/[[{]/);
  if (start > 0) s = s.slice(start);
  const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (end > -1) s = s.slice(0, end + 1);
  return JSON.parse(s);
}

/* ---------------- Errors ---------------- */
export class AIError extends Error {
  constructor(code, detail) { super(code); this.code = code; this.detail = detail; }
  get message_key() {
    return {
      no_key: 'no_key_t', bad_key: 'err_key', rate_limit: 'err_rate',
      bad_image: 'err_image', parse: 'err_parse', offline: 'err_network',
      unclear_photo: 'err_unclear', refusal: 'err_generic',
    }[this.code] || 'err_generic';
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ---------------- Core request ---------------- */
async function callClaude({ system, content, maxTokens = 3000, effort = 'medium', attempt = 0 }) {
  if (!hasKey()) throw new AIError('no_key');
  if (!navigator.onLine) throw new AIError('offline');

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': Settings.apiKey.trim(),
        'anthropic-version': API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: Settings.model,
        max_tokens: maxTokens,
        // claude-opus-5 thinks by default; max_tokens covers thinking + text,
        // so the budget above is sized for both. `effort` keeps it snappy.
        output_config: { effort },
        system,
        messages: [{ role: 'user', content }],
      }),
    });
  } catch {
    throw new AIError('offline');
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) throw new AIError('bad_key', body);
    if (res.status === 429 || res.status === 529) {
      if (attempt < 3) {
        await sleep(1200 * (attempt + 1));
        return callClaude({ system, content, maxTokens, effort, attempt: attempt + 1 });
      }
      throw new AIError('rate_limit', body);
    }
    if (res.status === 400 && /image/i.test(body)) throw new AIError('bad_image', body);
    if (res.status >= 500 && attempt < 2) {
      await sleep(1500);
      return callClaude({ system, content, maxTokens, effort, attempt: attempt + 1 });
    }
    throw new AIError('http_' + res.status, body);
  }

  const data = await res.json();

  // Safety classifiers can decline: HTTP 200 with an empty/partial content array.
  if (data.stop_reason === 'refusal') throw new AIError('refusal', data.stop_details);

  const text = (data.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  if (!text.trim()) throw new AIError('parse', data.stop_reason);

  try {
    return parseAIResponse(text);
  } catch {
    if (attempt < 1) {
      return callClaude({
        system: system + '\n\nCRITICAL: Return ONLY a valid JSON value. No prose, no code fences.',
        content, maxTokens, effort, attempt: attempt + 1,
      });
    }
    throw new AIError('parse', text.slice(0, 400));
  }
}

const imageBlock = (img) => ({
  type: 'image',
  source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
});

/* ============================================================
   1 · Catalog an item from a photo
   ============================================================ */
const SYS_CATALOG = `You are VESTRA's wardrobe cataloging engine — a senior fashion editor with an
expert eye for garment construction, fabric, and color.

You receive ONE photo of a clothing item, pair of shoes, bag, or accessory.
Return ONLY a valid JSON object. No markdown fences. No prose before or after.

Schema:
{
  "category": "top|bottom|dress|outerwear|shoes|bag|accessory|jewelry|activewear|swim|headwear|underlayer",
  "subcategory": "t-shirt|button-down|blazer|jeans|midi-skirt|sneakers|loafers|heels|sandals|flip-flops|tote|belt|... ",
  "name_he": "", "name_en": "",
  "color_primary": {"name_he":"","name_en":"","hex":"#RRGGBB"},
  "color_secondary": [{"name_he":"","name_en":"","hex":"#RRGGBB"}],
  "pattern": "solid|stripe|pinstripe|plaid|check|houndstooth|floral|animal|polka|geometric|tie-dye|logo|colorblock",
  "fabric_guess": "cotton|linen|denim|wool|cashmere|silk|satin|viscose|polyester|leather|suede|shearling|faux-fur|knit|jersey|corduroy|velvet|tweed|technical",
  "texture": "smooth|ribbed|cable|brushed|glossy|matte|sheer|quilted|distressed",
  "season": ["spring","summer","fall","winter"],
  "weight": "ultralight|light|mid|heavy",
  "formality": 1,
  "fit": "slim|regular|relaxed|oversized|tailored|cropped|wide",
  "neckline": null, "sleeve": null, "length": null, "rise": null,
  "color_family": "neutral|earth|jewel|pastel|brights|monochrome-black|white",
  "undertone_match": "warm|cool|neutral",
  "versatility_score": 0,
  "trend_status": "timeless|current-2026|rising|fading|dated",
  "care": "machine-wash|hand-wash|dry-clean|delicate",
  "occasions": ["work","casual","date","evening","beach","sport","wedding-guest","travel","home"],
  "notes_he": "", "notes_en": "",
  "confidence": 0.0
}

Rules:
- formality: 1=lounge/sport, 2=casual, 3=smart-casual, 4=business, 5=cocktail, 6=black-tie.
- Colors must be commercial and specific: "navy blue", "camel", "sage green" — never bare "blue".
- Unknown or not visible -> null. Never guess wildly; lower "confidence" instead.
- versatility_score 0-100: how many different outfits this piece could anchor.
- trend_status reflects Fall/Winter 2026-27: monochrome black, soft power tailoring,
  low-pile fur & shearling, plaid/tartan/checkerboard, brocade & jacquard, relaxed
  menswear, leather total looks. Pantone 2026 = Cloud Dancer (soft white).
- If the photo shows MORE THAN ONE distinct garment, return an ARRAY of these objects.
- If the photo is too blurry or dark to analyze, return exactly:
  {"error":"unclear_photo","message_he":"...","message_en":"..."}`;

export async function catalogItem(img) {
  const out = await callClaude({
    system: SYS_CATALOG,
    content: [imageBlock(img), { type: 'text', text: 'Catalog this item.' }],
    maxTokens: 3000,
    effort: 'medium',
  });
  if (out && out.error === 'unclear_photo') throw new AIError('unclear_photo', out);
  return Array.isArray(out) ? out : [out];
}

/* ============================================================
   2 · Build a look for an occasion
   ============================================================ */
const SYS_LOOK = `You are VESTRA — a world-class personal stylist.

You receive: "wardrobe" (the user's ACTUAL catalogued items), "profile", and "request".

ABSOLUTE RULE: build the outfit ONLY from items that exist in "wardrobe".
Every item you name MUST carry its exact "id" from the wardrobe. Never invent an item.
If a critical piece is missing, list it under "gaps" — never inside "items".

Run all 7 quality gates before responding:
1. Every item exists in the wardrobe with a real id
2. Formality spread across the outfit is at most 2 levels
3. No item contradicts the weather
4. Not two oversized pieces without a defined waist
5. At most 3 color families, undertones compatible
6. At most 3 points of visual interest
7. Physically wearable for the duration of the event

Return ONLY valid JSON, no fences:
{
 "title_he":"","title_en":"",
 "occasion_he":"","occasion_en":"",
 "formality":3,
 "items":[{"slot":"top|bottom|dress|outerwear|shoes|bag|accessory|jewelry|headwear",
           "id":"itm_...","reason_he":"","reason_en":""}],
 "palette":[{"name_he":"","name_en":"","hex":"#RRGGBB"}],
 "silhouette_he":"","silhouette_en":"",
 "why_it_works_he":"","why_it_works_en":"",
 "trend_note_he":"","trend_note_en":"",
 "alternative_he":"","alternative_en":"",
 "gaps":[{"item_he":"","item_en":"","why_he":"","why_en":"","est_price_ils":0}],
 "makeup_look":"no-makeup|soft-definition|soft-evening|statement|editorial|grooming|null",
 "confidence":0.9
}

Style context — Fall/Winter 2026-27: monochrome black (impact from silhouette and
texture, not color), soft power tailoring, texture and low-pile fur, plaid and tartan,
brocade and jacquard heirloom craft, relaxed menswear. Pantone 2026: Cloud Dancer.
Respect the user's climate — Israel is hot; favor linen, cotton and breathable shoes
in summer, and never put rubber flip-flops anywhere but the beach or the house.`;

export function buildLook({ wardrobe, profile, request }) {
  return callClaude({
    system: SYS_LOOK,
    content: [{ type: 'text', text: JSON.stringify({ wardrobe, profile, request }) }],
    maxTokens: 4000,
    effort: 'high',
  });
}

/* ============================================================
   3 · Pair engine — 3 looks around one anchor item
   ============================================================ */
const SYS_PAIR = SYS_LOOK + `

The user has selected ONE anchor item ("anchor_id"). Build THREE complete outfits
around it, all from the existing wardrobe:
  A · "down" — the most casual way to wear this piece
  B · "core" — the most correct, most-wearable everyday version
  C · "up"   — an evening / event version of the same piece

Classify the anchor first:
  STATEMENT    (bold pattern / strong color / dramatic silhouette)
               -> everything else stays quiet and neutral
  NEUTRAL BASE (jeans, white tee, black blazer)
               -> you may add ONE statement piece plus texture
  TEXTURE      (leather, shearling, satin, corduroy)
               -> pair with a CONTRASTING texture, never the same one

Every outfit must include shoes. Include a bag and at least one accessory whenever
the wardrobe contains suitable ones.

Return ONLY:
{"anchor_id":"...","anchor_role":"statement|neutral-base|texture",
 "outfits":[ <the look schema above, each with an extra "variant":"down"|"core"|"up"> ]}`;

export function pairWithItem({ wardrobe, profile, anchor_id, request }) {
  return callClaude({
    system: SYS_PAIR,
    content: [{ type: 'text', text: JSON.stringify({ wardrobe, profile, anchor_id, request }) }],
    maxTokens: 6000,
    effort: 'high',
  });
}

/* ============================================================
   4 · Closet organizer from a photo
   ============================================================ */
const SYS_CLOSET = `You receive a photo of an OPEN closet or wardrobe.
Analyze the physical storage — not the individual garments.

Return ONLY valid JSON:
{
 "zones":[{"type":"hanging-rod|shelf|drawer|shoe-area|dead-space",
           "position_he":"","position_en":"","occupancy_pct":0,
           "note_he":"","note_en":""}],
 "estimated_items":{"hanging":0,"folded":0,"shoes":0},
 "problems":[{"severity":"high|medium|low","title_he":"","title_en":"",
              "detail_he":"","detail_en":""}],
 "plan":[{"step":1,"title_he":"","title_en":"","action_he":"","action_en":"","minutes":0}],
 "storage_suggestions":[{"item_he":"","item_en":"","why_he":"","why_en":"","est_price_ils":0}],
 "score":0
}

Diagnose against these thresholds:
- Hanging rod above 70% occupancy -> garments crease and become invisible
- Folded stacks taller than 5 items -> the bottom items never get worn
- Shoes piled on the floor -> damage plus wasted time every morning
- Unused vertical space above the top shelf -> lost capacity
- No seasonal separation -> current-season pieces compete with off-season

Recommend the CCLS method: Category -> Color (light to dark) -> Length -> Season.
"score" is 0-100 for overall closet organization health.
If the photo is unusable, return {"error":"unclear_photo","message_he":"","message_en":""}.`;

export async function analyzeCloset(img) {
  const out = await callClaude({
    system: SYS_CLOSET,
    content: [imageBlock(img), { type: 'text', text: 'Analyze this closet.' }],
    maxTokens: 4000,
    effort: 'medium',
  });
  if (out && out.error === 'unclear_photo') throw new AIError('unclear_photo', out);
  return out;
}

/* ============================================================
   4b · Face mapping — powers the makeup simulation
   ============================================================ */
const SYS_FACE = `You receive a front-facing photo of the app owner's own face. They uploaded it
themselves to preview makeup on their features. Analyze the face for styling purposes only:
never attempt to identify who the person is, guess their name, or infer anything beyond
what a makeup artist would assess in the chair.

Return ONLY valid JSON, no fences.

You must return TWO things.

(1) "face" — the assessment:
{
  "shape": "oval|round|square|heart|long|diamond|triangle",
  "skin_undertone": "warm|cool|neutral|olive",
  "skin_depth": "fair|light|medium|tan|deep",
  "contrast": "low|medium|high",
  "eye_shape": "almond|round|hooded|monolid|downturned|upturned|deep-set|wide-set|close-set",
  "lip_fullness": "thin|medium|full",
  "brow_shape": "straight|arched|rounded|angled|sparse|full",
  "notes_he": "", "notes_en": "",
  "apply_he": "", "apply_en": "",
  "confidence": 0.0
}
"notes" = what the features are. "apply" = the one adjustment that matters most for
THIS face (e.g. hooded eyes -> place shadow above the crease so it stays visible open).

(2) "regions" — where the features sit, so the app can paint makeup onto the photo.
Every region is an ELLIPSE in coordinates NORMALIZED to the image: cx and rx are
fractions of the image WIDTH, cy and ry are fractions of the image HEIGHT, both from
0 (left/top) to 1 (right/bottom). "rot" is the ellipse rotation in degrees, positive
clockwise, usually between -30 and 30.

{
  "lips":        {"cx":0,"cy":0,"rx":0,"ry":0,"rot":0},
  "lip_upper":   {...},   "lip_lower":  {...},
  "eye_left":    {...},   "eye_right":  {...},
  "lid_left":    {...},   "lid_right":  {...},
  "brow_left":   {...},   "brow_right": {...},
  "cheek_left":  {...},   "cheek_right":{...},
  "bone_left":   {...},   "bone_right": {...},
  "jaw_left":    {...},   "jaw_right":  {...},
  "nose":        {...},   "forehead":   {...},
  "chin":        {...},   "face":       {...}
}

Region meanings — be precise, the app paints exactly here:
- "lips": the whole mouth. "lip_upper"/"lip_lower": each lip alone.
- "eye_left"/"eye_right": the visible eye opening. LEFT means the left side of the
  IMAGE as you look at it, not the person's own left. Same for every paired region.
- "lid_left"/"lid_right": the mobile eyelid above the eye, where shadow sits.
- "brow_left"/"brow_right": the eyebrow itself.
- "cheek_left"/"cheek_right": the apple of the cheek, where blush goes.
- "bone_left"/"bone_right": the top of the cheekbone, where highlighter goes —
  higher and further out than the apple.
- "jaw_left"/"jaw_right": the hollow under the cheekbone along the jaw, for contour.
- "nose": the bridge. "forehead": centre of the forehead. "chin": the chin.
- "face": one ellipse covering the whole face, hairline to chin — used for base.

Every region is REQUIRED. Estimate carefully from the photo; a region that is a few
percent off still looks right once the app blurs the edges.

If the face is not clearly visible, cropped, turned far to the side, or too dark to
map, return exactly:
{"error":"unclear_photo","message_he":"...","message_en":"..."}`;

export async function analyzeFace(img) {
  const out = await callClaude({
    system: SYS_FACE,
    content: [imageBlock(img), { type: 'text', text: 'Map this face.' }],
    maxTokens: 4000,
    effort: 'high',
  });
  if (out && out.error === 'unclear_photo') throw new AIError('unclear_photo', out);
  return out;
}

/* ============================================================
   4c · Body mapping — powers fit advice and the try-on preview
   ============================================================ */
const SYS_BODY = `You receive a full-length photo of the app owner, uploaded by them so the app
can recommend cuts and place outfit pieces over the photo. Assess proportions the way a
tailor or personal stylist would. Never identify the person or comment on their weight,
attractiveness, or health — proportion and balance only, and always in neutral,
constructive language.

Return ONLY valid JSON, no fences.

(1) "body" — the assessment:
{
  "shape": "hourglass|pear|apple|rectangle|inverted-triangle|trapezoid|oval|triangle",
  "ratio": "balanced|shoulder-dominant|hip-dominant",
  "proportions_he": "", "proportions_en": "",
  "focus_he": "", "focus_en": "",
  "fit_notes": [{"area":"tops|bottoms|dresses|outerwear|shoes|proportion",
                 "advice_he":"","advice_en":""}],
  "confidence": 0.0
}
"proportions" = what the proportions are (leg-to-torso, where the waist sits,
shoulder vs hip width). "focus" = the single balancing principle for this figure.
"fit_notes" = 3-5 concrete cut recommendations.

Guiding principle: never "hide" — BALANCE. Add volume where you want width, add
structure and vertical line where you want length.

(2) "regions" — where the body sits, NORMALIZED to the image as boxes:
{"head":{"x":0,"y":0,"w":0,"h":0}, "torso":{...}, "waist":{...},
 "hips":{...}, "legs":{...}, "feet":{...}, "full":{...}}
x and w are fractions of image WIDTH, y and h fractions of image HEIGHT, origin
top-left. "torso" spans shoulders to waist, "legs" waist to ankle, "feet" the shoes,
"full" the whole silhouette. Every region is REQUIRED.

If the photo does not show a full standing body, return exactly:
{"error":"unclear_photo","message_he":"...","message_en":"..."}`;

export async function analyzeBody(img) {
  const out = await callClaude({
    system: SYS_BODY,
    content: [imageBlock(img), { type: 'text', text: 'Map this body.' }],
    maxTokens: 4000,
    effort: 'high',
  });
  if (out && out.error === 'unclear_photo') throw new AIError('unclear_photo', out);
  return out;
}

/* ============================================================
   5 · Beauty / grooming
   ============================================================ */
const SYS_BEAUTY = `You are VESTRA's beauty advisor.

Input: "profile" (gender presentation, age, skin undertone, skin depth, hair, eyes),
"occasion", "time_of_day", optional "palette" from the outfit, optional "look_key",
and optional "face" — a real analysis of this person's own face. When "face" is
present, tailor every step to it (hooded lids, thin lips, low contrast, olive
undertone…) and say so in the instruction rather than giving generic advice.

Offer makeup as an OPTION, never an obligation. If gender presentation is "men",
default to grooming guidance (beard, hair, skincare, fragrance, nails) — but give full
makeup guidance if the user explicitly asked for it.

Match Fall/Winter 2026-27 beauty: oxblood lips (deep red with brown-purple undertone),
deliberate imperfection, smudged smokey eyes, monochromatic single-color face,
double cat-eye, cosmic multi-tonal highlighter. Pantone 2026 Cloud Dancer also supports
a luminous, ultra-clean skin direction.

Rule: dramatic eye OR dramatic lip — never both, unless the look is editorial.

Return ONLY valid JSON:
{
 "look_key":"no-makeup|soft-definition|soft-evening|statement|editorial|grooming",
 "look_name_he":"","look_name_en":"",
 "steps":[{"area":"skin|eyes|brows|lips|cheeks|contour|highlight|hair|beard|fragrance|nails",
           "technique":"base|lipstick|liner|lashes|brow|shadow|blush|contour|highlight|none",
           "region":"face|lips|lip_upper|lip_lower|eye|lid|brow|cheek|bone|jaw|nose|forehead|chin|none",
           "finish":"matte|satin|shimmer|sheer",
           "instruction_he":"","instruction_en":"",
           "product_type_he":"","product_type_en":"",
           "shade_he":"","shade_en":"","shade_hex":"#RRGGBB"}],
 "trend_note_he":"","trend_note_en":"",
 "duration_minutes":0,
 "longevity_tip_he":"","longevity_tip_en":""
}

"region" tells the app where to paint this step on the user's photo — use "none" for
anything with no colour on the face (hair, fragrance, nails, skincare prep). Paired
regions ("eye", "lid", "brow", "cheek", "bone", "jaw") are painted on both sides
automatically, so name them in the singular. "shade_hex" must be the actual product
colour and is required for every step whose region is not "none".

"technique" tells the app what SHAPE to draw, which matters more than the region: a
liner is a stroke along the lash line, a lipstick follows the lip outline, a blush is
a soft wash. Give exactly ONE technique per step — if a step would carry two ("shadow
plus liner", "contour plus highlighter"), split it into two steps so each can be drawn
and followed separately. Use "none" for hair, beard, fragrance, nails and skincare.`;

export function beautyLook(payload) {
  return callClaude({
    system: SYS_BEAUTY,
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    maxTokens: 3000,
    effort: 'medium',
  });
}

/* ============================================================
   6 · Wardrobe health report
   ============================================================ */
const SYS_HEALTH = `Input: the full "wardrobe" array and "profile".
Compute distributions and return ONLY valid JSON:
{
 "total":0,
 "by_category":{},
 "by_formality":{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0},
 "by_color":[{"name_he":"","name_en":"","hex":"#RRGGBB","pct":0}],
 "by_season":{"summer":0,"spring":0,"fall":0,"winter":0},
 "warnings":[{"severity":"high|medium|low","text_he":"","text_en":""}],
 "workhorses":[{"id":"itm_...","text_he":"","text_en":"","outfit_count":0}],
 "duplicates":[{"ids":["itm_..."],"text_he":"","text_en":""}],
 "dead_items":["itm_..."],
 "buy_next":[{"item_he":"","item_en":"","est_price_ils":0,"unlocks_outfits":0,
              "why_he":"","why_en":""}],
 "score":0
}
Warn when a single color exceeds 30% of the wardrobe, when formality levels 5-6 hold
fewer than 4 items, or when 3 or more items are near-identical.`;

export function wardrobeHealth({ wardrobe, profile }) {
  return callClaude({
    system: SYS_HEALTH,
    content: [{ type: 'text', text: JSON.stringify({ wardrobe, profile }) }],
    maxTokens: 3500,
    effort: 'medium',
  });
}

/* ---------------- Friendly error text ---------------- */
export const errText = (e) => (e instanceof AIError ? t(e.message_key) : t('err_generic'));
