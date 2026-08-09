<div align="center">

# VESTRA

### Your AI Atelier · האטלייה האישי שלך

**Photograph your wardrobe. Get a complete look for any occasion.**
Built on a world-class fashion-stylist skill, updated to F/W 2026-27.

`Hebrew + English` · `RTL + LTR` · `Mobile-first PWA` · `Runs entirely on your device`

</div>

---

## What it is

VESTRA is two things that work together:

| | |
|---|---|
| 🧠 **The skill** — `skill/vestra-fashion-stylist/` | A senior personal-stylist expert for Claude: wardrobe cataloging, occasion dressing, colour analysis, body-shape balance, closet organization, beauty, and live trend intelligence. |
| 📱 **The app** — `app/` | A mobile-first PWA that puts the skill in your pocket: shoot a garment, it gets catalogued automatically; pick an occasion, it builds a look **from clothes you actually own**. |

---

## Features

### 📸 Shoot it, and it's catalogued
Photograph any garment and Claude's vision identifies **category, subcategory, colour (with hex), pattern, fabric, texture, season, weight, formality (1-6), fit, neckline, sleeve, length, undertone, versatility score and trend status** — in Hebrew and English at once. Shoot several pieces in one frame and it returns them as separate items.

### ✨ A complete look for any occasion
30+ occasions from *errands* to *black tie*, with Israeli dress codes built in (synagogue, shiva, bar mitzvah, heatwave). Every look is assembled **only from your catalogued wardrobe** — never invented — and passes 7 quality gates before you see it:

> existence · formality spread ≤ 2 levels · weather sanity · silhouette balance · ≤ 3 colour families · ≤ 3 points of interest · physically wearable

Each look comes with a palette, the silhouette logic, **why it works**, a trend reference, one alternative, and a `🛒 GAP` list for anything missing — with a price estimate and a stand-in from your closet.

### 👔 "What do I wear with this?"
Pick one piece and get **three** complete outfits around it — *dressed down*, *everyday*, *dressed up*. The engine first classifies your anchor as a **statement**, a **neutral base**, or a **texture** piece, then builds accordingly.

### 🚪 Closet organization from a photo
Shoot your closet standing open. You get zone mapping with occupancy percentages, diagnosed problems (rod over 70% = creasing and invisibility; folded stacks over 5 = the bottom never gets worn), a step-by-step plan with time estimates, and storage recommendations — all following the **CCLS** method: Category → Colour → Length → Season.

### 💄 Beauty — simulated on your own face
Upload one front-facing photo and Claude maps your features — face shape, undertone, skin depth, contrast, eye shape, lip fullness — plus the exact regions of your lips, lids, brows, cheeks, cheekbones and jaw.

The app then **paints the look onto your photo**: a before/after wipe with an intensity slider, and every product drawn as the shape it actually is: a lipstick follows the lip outline with a cupid's bow and leaves the mouth line readable, eyeliner is a tapered stroke along the lash line with a wing when the look calls for one, mascara is short strokes rather than a smear, brows taper from head to tail, and foundation evens the skin with a softened copy of itself before any colour goes on. Blend mode is chosen from the skin tone sampled under each region, so blush reads correctly on fair and deep skin alike, and everything is masked to the face so nothing tints your hair. Five makeup looks plus a grooming track, all current to F/W 26-27: oxblood lips, deliberate imperfection, smudged smokey, monochromatic face, double cat-eye, cosmic highlighter.

### 🪞 See the look on you
Upload a full-length photo and you get body shape, shoulder-to-hip ratio, proportions and concrete cut advice — plus the outfit **positioned over your own photo** with an opacity slider, and a **downloadable lookbook** card (1080×1350).

The card is set like a magazine page rather than assembled like a screenshot: the wordmark with its own V overprinted in oxblood, a hairline rule carrying a short gold tick, the occasion as the headline, and a credit line underneath — body shape, formality, weather — reading straight from your profile and your request rather than from a template. The pieces are framed as plates, each cut out of its background and named by what it actually is, and the palette, the styling note and the footer are anchored to the bottom, so a three-piece look and an eight-piece look land on the same grid instead of drifting. It mirrors whole in Hebrew: the masthead, the reading edge, the plate order, the swatch run and even the direction the light falls from.

> This is a styling illustration, not a photorealistic render — the pieces are placed and feathered onto detected body regions, not warped onto your body.

### 📊 Wardrobe health
The report builds a look for **every occasion the app knows** and then counts what happened, so the numbers are observed rather than estimated. Your workhorses are the pieces that actually turned up in the most outfits. **Pieces that never make a look** are the ones the engine never once reached for. The shopping list is ranked by how often a missing piece genuinely stopped an outfit from closing.

Alongside it: distribution by category, formality, colour and season · single-colour dominance warnings · near-duplicate detection.

### 🌍 Genuinely bilingual
Hebrew (RTL) and English (LTR) throughout — including the AI's own output, which is generated in both languages in a single call. Serif display type switches per script.

### 🔌 Works without an API key
No key? The built-in **rules engine** still builds looks, pairs items, and runs the health report locally — using the same scoring model as the skill. Cataloguing falls back to a full manual form. Add a key whenever you want automatic recognition.

**Your face and body are read on the device too.** With no key, VESTRA analyses both photos in the browser and nothing is uploaded at all. Skin is segmented in chroma to find the face; the eyes are located by the sclera rather than by darkness, because a brow is darker than an iris; lips are found by being redder than the skin around them; and the remaining regions — lid, cheek, cheekbone, jaw — are derived from those anchors by proportion, the way a makeup artist maps a face. For the body, the silhouette is separated from the background and its width at each height gives shoulders, waist and hips, which is what body shape is defined by in the first place. It is an estimate, the app labels it as one, and when a photo can't support a conclusion it says so instead of inventing one.

It holds the same seven gates, and reads your profile the same way. Your **coverage level** and **never-wearing** list remove pieces before scoring rather than merely discouraging them. **Fabric is judged against the weather** — wool and heavy layers leave a hot day on their own. Your **body shape** moves where volume and interest land: up top for a pear, down for an inverted triangle, a long vertical line for an apple, a defined waist for a rectangle. And the same request always returns the same look.

---

### 📸 Batch cataloging
Select ten garment photos at once and they catalog in sequence with a progress readout — the fastest way to get a wardrobe in.

### 🎬 A brief for a full render
The simulations on the look card and in the beauty view are drawn on canvas — instant, free, and offline, but a drawing. When you want a photograph, **Render brief** writes the instruction an image model needs and hands you the photos it refers to.

The brief names each product by where it sits rather than what it is called, carries every shade as a hex, and lets the face analysis shape it — hooded lids get the shadow placed above the crease, a warm undertone is told not to correct itself away. For an outfit it lists colour, fabric, cut and placement per piece, and attaches your actual garment photographs, because a model that can see the garment reproduces it while one reading a description invents something similar. Its longest paragraph is the one about what must *not* change: same face, same pose, same lighting, same background, skin texture intact, nothing smoothed or slimmed.

Copy it, attach the photos, and run it wherever you already have an image model — a Claude conversation with an image connector, for instance. VESTRA is a static site with no server, so it writes the brief rather than running the render; nothing leaves your device until you attach it yourself.

### 🧪 A sample wardrobe to try it against
**Profile → Load sample wardrobe** drops in a 25-piece capsule spanning formality 2 to 6, so the Studio can close a look and the health report has something to count before you have photographed anything of your own. The garments are drawn by the app rather than shipped as files — laid flat on a plain ground, which is the same shot the guide asks you for and the same one the try-on's cutout expects. One tap removes them again, and nothing you added yourself is touched.

---

## Privacy

**There is no VESTRA server.** The app is static files.

- Photos, wardrobe and looks live in **IndexedDB on your device**
- Your profile and API key live in **localStorage on your device**
- Your API key goes **directly to `api.anthropic.com`** and nowhere else
- Your **face and body photos never leave the device** except at the moment you press *Analyze*, and are excluded from backups unless you explicitly opt in
- Export your whole closet to JSON at any time; erase everything with one button

The face and body prompts instruct the model to assess features for styling only — never to identify the person, and never to comment on weight, attractiveness or health.

> ⚠️ **Back up.** Your data lives in one browser. Clearing history, private browsing, or switching devices wipes it. **Profile → Export closet** writes a JSON file; the app shows you when you last did it.

---

## 📖 User guide

**[GUIDE.md](GUIDE.md)** — how to work efficiently with the app, in Hebrew and English: how to shoot so recognition is accurate, the batch-cataloging strategy, how to read a look, backup practice, and cost control. It's also built into the app under **Profile → How to use VESTRA**.

---

## Quick start

### Run it locally

```bash
git clone https://github.com/<your-username>/vestra.git
cd vestra
node tools/serve.js
```

Then open <http://localhost:4173>. No build step, no dependencies — it's plain ES modules.

### Deploy to GitHub Pages

Push to `main`. The included workflow publishes `app/` automatically.
In your repo: **Settings → Pages → Source: GitHub Actions**.

### Add your API key

Get one at [console.anthropic.com](https://console.anthropic.com/settings/keys), then in the app: **Profile → Anthropic API key**.

Model options: `claude-opus-5` (most capable, the default), `claude-sonnet-5` (fast and economical), `claude-haiku-4-5` (fastest).

> **Cost note:** photos are compressed to 1280px / JPEG q0.85 before upload, which cuts image tokens by roughly 70% with no measurable loss in recognition quality.

---

## Install the skill for Claude

Copy the skill folder into your Claude skills directory:

```bash
cp -r skill/vestra-fashion-stylist ~/.claude/skills/
```

Then just talk to it — in Hebrew or English:

> *"מה ללבוש לחתונה בערב באוגוסט?"*
> *"I have a navy blazer. Give me three ways to wear it."*
> *"תסדר לי את הארון"*

The skill activates on any wardrobe, styling, outfit, dress-code, or beauty question.

---

## Project layout

```
vestra/
├── app/                          # the PWA — static, no build step
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── sw.js                     # offline shell (skipped on localhost)
│   ├── css/
│   │   ├── tokens.css            # design tokens — Cloud Dancer base + dark theme
│   │   ├── base.css              # layout, RTL/LTR, app bar, tab bar
│   │   ├── animations.css        # the motion library
│   │   └── components.css        # cards, chips, sheets, look card, forms
│   └── js/
│       ├── app.js                # router + boot
│       ├── state.js              # shared state + event bus
│       ├── store.js              # IndexedDB wardrobe/looks + settings
│       ├── i18n.js               # Hebrew/English dictionary
│       ├── taxonomy.js           # categories, occasions, formality, palettes
│       ├── ai.js                 # Claude client + prompts + image compression
│       ├── vision.js             # on-device face & body analysis — no key needed
│       ├── stylist.js            # offline rules engine
│       ├── makeup.js             # canvas makeup renderer (adaptive blend modes)
│       ├── tryon.js              # garment placement + lookbook export
│       ├── ui.js                 # icons, toasts, sheets, sparkles
│       └── views/                # home · wardrobe · capture · studio · closet · beauty · profile
├── GUIDE.md                      # user guide — Hebrew + English
├── skill/vestra-fashion-stylist/
│   ├── SKILL.md                  # the expert
│   └── references/
│       ├── body-and-color.md     # body shapes + the 12 colour seasons
│       ├── occasions-playbook.md # 32 occasions, dressed for Israel
│       ├── capsule-wardrobe.md   # 30-piece capsules + buying order
│       ├── app-integration.md    # the JSON contract between skill and app
│       └── trends-2026.md        # trend archive + refresh protocol
└── tools/serve.js                # dev server
```

---

## Staying current

The skill carries a dated trend archive and a **refresh protocol** (SKILL.md § 8.2): when more than 90 days have passed, or you ask "what's trending now", it runs live searches across approved fashion sources, accepts a trend only when 2+ independent sources agree, filters it against your age, body and climate — then writes the update back into `references/trends-2026.md`.

Current data: **August 2026** — F/W 2026-27 fashion month, Pantone 2026 *Cloud Dancer*, F/W 26-27 beauty.

---

## Design

Editorial fashion system built on **Cloud Dancer** (Pantone's 2026 Colour of the Year) with an oxblood accent — the season's signature. Playfair Display / Frank Ruhl Libre for display, Inter / Assistant for text. Motion is choreographed rather than decorative: staggered reveals, a scanning sweep during AI analysis, sparkle bursts on completion, drag-to-dismiss sheets — all of it disabled under `prefers-reduced-motion`.

---

## Licence

MIT — see [LICENSE](LICENSE).

<div align="center">

**VESTRA** · Wear your best self.

</div>
