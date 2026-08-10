/* ============================================================
   VESTRA · Taxonomy
   Categories, occasions, formality tables, beauty looks.
   Mirrors SKILL.md Modules 1, 3 and 7.
   ============================================================ */

import { lang } from './i18n.js';

const L = (he, en) => ({ he, en });
export const lbl = (o) => (o ? o[lang()] ?? o.en : '');

/* ---------------- Categories ---------------- */
export const CATEGORIES = [
  { key: 'top',        icon: '👕', name: L('עליוניות', 'Tops') },
  { key: 'bottom',     icon: '👖', name: L('תחתוניות', 'Bottoms') },
  { key: 'dress',      icon: '👗', name: L('שמלות', 'Dresses') },
  { key: 'outerwear',  icon: '🧥', name: L('מעילים', 'Outerwear') },
  { key: 'shoes',      icon: '👞', name: L('נעליים', 'Shoes') },
  { key: 'bag',        icon: '👜', name: L('תיקים', 'Bags') },
  { key: 'accessory',  icon: '🧣', name: L('אקססוריז', 'Accessories') },
  { key: 'jewelry',    icon: '💍', name: L('תכשיטים', 'Jewelry') },
  { key: 'activewear', icon: '🏃', name: L('ספורט', 'Activewear') },
  { key: 'swim',       icon: '🩱', name: L('בגדי ים', 'Swim') },
  { key: 'headwear',   icon: '🧢', name: L('כובעים', 'Headwear') },
  { key: 'underlayer', icon: '🩲', name: L('שכבת בסיס', 'Base layer') },
];

export const catName = (key) => lbl(CATEGORIES.find(c => c.key === key)?.name) || key;
export const catIcon = (key) => CATEGORIES.find(c => c.key === key)?.icon || '👕';

/* ---------------- Subcategories per category ---------------- */
export const SUBCATS = {
  top: ['t-shirt','tank','button-down','polo','blouse','knit-sweater','cardigan','hoodie','sweatshirt','bodysuit','crop-top','vest'],
  bottom: ['jeans','chinos','tailored-trousers','wide-leg','shorts','joggers','leggings','midi-skirt','mini-skirt','maxi-skirt','pencil-skirt'],
  dress: ['slip-dress','wrap-dress','shirt-dress','maxi-dress','midi-dress','mini-dress','sheath-dress','evening-gown','jumpsuit'],
  outerwear: ['blazer','trench','puffer','leather-jacket','denim-jacket','bomber','overcoat','shearling','raincoat','cardigan-long'],
  shoes: ['sneakers','loafers','derby','oxford','heels','sandals','flip-flops','mules','ankle-boots','tall-boots','chelsea-boots','ballet-flats','espadrilles','slides'],
  bag: ['tote','crossbody','shoulder','clutch','backpack','messenger','belt-bag','weekender'],
  accessory: ['belt','scarf','sunglasses','gloves','tie','bow-tie','pocket-square','watch'],
  jewelry: ['necklace','earrings','bracelet','ring','anklet','brooch'],
  activewear: ['sports-bra','training-top','training-shorts','running-tights','track-jacket','training-shoes'],
  swim: ['bikini','one-piece','swim-shorts','cover-up','kaftan'],
  headwear: ['cap','beanie','bucket-hat','fedora','wide-brim','baker-boy'],
  underlayer: ['base-tee','thermal','slip','shapewear','socks','tights'],
};

export const SUBCAT_NAMES = {
  't-shirt': L('טי-שירט','T-shirt'), 'tank': L('גופייה','Tank'),
  'button-down': L('חולצה מכופתרת','Button-down'), 'polo': L('פולו','Polo'),
  'blouse': L('חולצת נשים','Blouse'), 'knit-sweater': L('סריג','Knit sweater'),
  'cardigan': L('קרדיגן','Cardigan'), 'hoodie': L('קפוצ׳ון','Hoodie'),
  'sweatshirt': L('סווטשירט','Sweatshirt'), 'bodysuit': L('בגד גוף','Bodysuit'),
  'crop-top': L('קרופ טופ','Crop top'), 'vest': L('וסט','Vest'),
  'jeans': L('ג׳ינס','Jeans'), 'chinos': L('צ׳ינו','Chinos'),
  'tailored-trousers': L('מכנס מחויט','Tailored trousers'), 'wide-leg': L('מכנס רחב','Wide-leg'),
  'shorts': L('שורט','Shorts'), 'joggers': L('ג׳וגר','Joggers'), 'leggings': L('לגינס','Leggings'),
  'midi-skirt': L('חצאית מידי','Midi skirt'), 'mini-skirt': L('חצאית מיני','Mini skirt'),
  'maxi-skirt': L('חצאית מקסי','Maxi skirt'), 'pencil-skirt': L('חצאית עיפרון','Pencil skirt'),
  'slip-dress': L('שמלת סליפ','Slip dress'), 'wrap-dress': L('שמלת מעטפת','Wrap dress'),
  'shirt-dress': L('שמלת חולצה','Shirt dress'), 'maxi-dress': L('שמלת מקסי','Maxi dress'),
  'midi-dress': L('שמלת מידי','Midi dress'), 'mini-dress': L('שמלת מיני','Mini dress'),
  'sheath-dress': L('שמלת מעטפת צרה','Sheath dress'), 'evening-gown': L('שמלת ערב','Evening gown'),
  'jumpsuit': L('אוברול','Jumpsuit'),
  'blazer': L('בלייזר','Blazer'), 'trench': L('טרנץ׳','Trench'), 'puffer': L('פאפר','Puffer'),
  'leather-jacket': L('ז׳קט עור','Leather jacket'), 'denim-jacket': L('ז׳קט ג׳ינס','Denim jacket'),
  'bomber': L('בומבר','Bomber'), 'overcoat': L('מעיל ארוך','Overcoat'),
  'shearling': L('שירלינג','Shearling'), 'raincoat': L('מעיל גשם','Raincoat'),
  'cardigan-long': L('קרדיגן ארוך','Long cardigan'),
  'sneakers': L('סניקרס','Sneakers'), 'loafers': L('מוקסין','Loafers'),
  'derby': L('דרבי','Derby'), 'oxford': L('אוקספורד','Oxford'), 'heels': L('עקבים','Heels'),
  'sandals': L('סנדלים','Sandals'), 'flip-flops': L('כפכפים','Flip-flops'),
  'mules': L('מיול','Mules'), 'ankle-boots': L('אנקל בוט','Ankle boots'),
  'tall-boots': L('מגף גבוה','Tall boots'), 'chelsea-boots': L('צ׳לסי בוט','Chelsea boots'),
  'ballet-flats': L('בלרינה','Ballet flats'), 'espadrilles': L('אספדריל','Espadrilles'),
  'slides': L('סליידס','Slides'),
  'tote': L('טוט','Tote'), 'crossbody': L('קרוסבודי','Crossbody'),
  'shoulder': L('תיק כתף','Shoulder bag'), 'clutch': L('קלאץ׳','Clutch'),
  'backpack': L('תיק גב','Backpack'), 'messenger': L('מסנג׳ר','Messenger'),
  'belt-bag': L('תיק מותן','Belt bag'), 'weekender': L('תיק נסיעה','Weekender'),
  'belt': L('חגורה','Belt'), 'scarf': L('צעיף','Scarf'),
  'sunglasses': L('משקפי שמש','Sunglasses'), 'gloves': L('כפפות','Gloves'),
  'tie': L('עניבה','Tie'), 'bow-tie': L('פפיון','Bow tie'),
  'pocket-square': L('ממחטת חזה','Pocket square'), 'watch': L('שעון','Watch'),
  'necklace': L('שרשרת','Necklace'), 'earrings': L('עגילים','Earrings'),
  'bracelet': L('צמיד','Bracelet'), 'ring': L('טבעת','Ring'),
  'anklet': L('צמיד רגל','Anklet'), 'brooch': L('סיכה','Brooch'),
  'sports-bra': L('ספורט-בר','Sports bra'), 'training-top': L('חולצת אימון','Training top'),
  'training-shorts': L('שורט אימון','Training shorts'), 'running-tights': L('טייץ ריצה','Running tights'),
  'track-jacket': L('ז׳קט אימון','Track jacket'), 'training-shoes': L('נעלי אימון','Training shoes'),
  'bikini': L('ביקיני','Bikini'), 'one-piece': L('בגד ים שלם','One-piece'),
  'swim-shorts': L('מכנס ים','Swim shorts'), 'cover-up': L('כיסוי','Cover-up'), 'kaftan': L('קפטן','Kaftan'),
  'cap': L('קסקט','Cap'), 'beanie': L('כובע צמר','Beanie'), 'bucket-hat': L('באקט','Bucket hat'),
  'fedora': L('פדורה','Fedora'), 'wide-brim': L('כובע רחב שוליים','Wide-brim hat'),
  'baker-boy': L('בייקר בוי','Baker boy'),
  'base-tee': L('טי בסיס','Base tee'), 'thermal': L('תרמי','Thermal'),
  'slip': L('קומבניזון','Slip'), 'shapewear': L('מחטב','Shapewear'),
  'socks': L('גרביים','Socks'), 'tights': L('גרביונים','Tights'),
};
export const subName = (k) => lbl(SUBCAT_NAMES[k]) || k;

/* ---------------- Enums ---------------- */
export const SEASONS = [
  { key: 'spring', name: L('אביב','Spring') },
  { key: 'summer', name: L('קיץ','Summer') },
  { key: 'fall',   name: L('סתיו','Fall') },
  { key: 'winter', name: L('חורף','Winter') },
];

export const FITS = ['slim','regular','relaxed','oversized','tailored','cropped','wide'];
export const FIT_NAMES = {
  slim: L('צמוד','Slim'), regular: L('רגיל','Regular'), relaxed: L('רפוי','Relaxed'),
  oversized: L('אוברסייז','Oversized'), tailored: L('מחויט','Tailored'),
  cropped: L('קרופ','Cropped'), wide: L('רחב','Wide'),
};

export const PATTERNS = ['solid','stripe','pinstripe','plaid','check','houndstooth','floral','animal','polka','geometric','tie-dye','logo','colorblock'];
export const PATTERN_NAMES = {
  solid: L('חלק','Solid'), stripe: L('פסים','Stripe'), pinstripe: L('פס דק','Pinstripe'),
  plaid: L('משבצות','Plaid'), check: L('שח-מט','Check'), houndstooth: L('רגל תרנגולת','Houndstooth'),
  floral: L('פרחוני','Floral'), animal: L('הדפס חיה','Animal'), polka: L('נקודות','Polka dot'),
  geometric: L('גיאומטרי','Geometric'), 'tie-dye': L('טאי-דאי','Tie-dye'),
  logo: L('לוגו','Logo'), colorblock: L('קולור-בלוק','Colorblock'),
};

export const FABRICS = ['cotton','linen','denim','wool','cashmere','silk','satin','viscose','polyester','leather','suede','shearling','faux-fur','knit','jersey','corduroy','velvet','tweed','technical'];
export const FABRIC_NAMES = {
  cotton: L('כותנה','Cotton'), linen: L('פשתן','Linen'), denim: L('דנים','Denim'),
  wool: L('צמר','Wool'), cashmere: L('קשמיר','Cashmere'), silk: L('משי','Silk'),
  satin: L('סאטן','Satin'), viscose: L('ויסקוזה','Viscose'), polyester: L('פוליאסטר','Polyester'),
  leather: L('עור','Leather'), suede: L('זמש','Suede'), shearling: L('שירלינג','Shearling'),
  'faux-fur': L('פרוות פוקס','Faux fur'), knit: L('סרוג','Knit'), jersey: L('ג׳רזי','Jersey'),
  corduroy: L('קורדרוי','Corduroy'), velvet: L('קטיפה','Velvet'), tweed: L('טוויד','Tweed'),
  technical: L('בד טכני','Technical'),
};

export const FORMALITY = [
  { v: 1, name: L('בית / ספורט','Lounge / sport') },
  { v: 2, name: L('קז׳ואל','Casual') },
  { v: 3, name: L('סמארט קז׳ואל','Smart casual') },
  { v: 4, name: L('עסקי','Business') },
  { v: 5, name: L('קוקטייל','Cocktail') },
  { v: 6, name: L('ערב / גאלה','Black tie / gala') },
];
export const formalityName = (v) => lbl(FORMALITY.find(f => f.v === v)?.name) || String(v);

export const TREND_STATUS = {
  timeless:      L('קלאסי נצחי','Timeless'),
  'current-2026':L('עכשווי 2026','Current 2026'),
  rising:        L('בעלייה','Rising'),
  fading:        L('בדעיכה','Fading'),
  dated:         L('מיושן','Dated'),
};

/* ---------------- Occasions (mirrors occasions-playbook.md) ---------------- */
export const OCCASIONS = [
  { key: 'casual-day',    f: 2, icon: '☕', name: L('סידורים / יומיום','Errands / everyday') },
  { key: 'coffee',        f: 2, icon: '🥐', name: L('קפה עם חברים','Coffee with friends') },
  { key: 'work-tech',     f: 3, icon: '💻', name: L('משרד היי-טק','Tech office') },
  { key: 'work-corp',     f: 4, icon: '🏢', name: L('משרד קורפורייט','Corporate office') },
  { key: 'interview',     f: 5, icon: '🎯', name: L('ראיון עבודה','Job interview') },
  { key: 'client-meet',   f: 4, icon: '🤝', name: L('פגישת לקוח','Client meeting') },
  { key: 'conference',    f: 3, icon: '🎤', name: L('כנס / תערוכה','Conference') },
  { key: 'video-call',    f: 3, icon: '📹', name: L('שיחת וידאו','Video call') },
  { key: 'date',          f: 3, icon: '🌹', name: L('דייט','Date night') },
  { key: 'dinner',        f: 3, icon: '🍽️', name: L('ארוחת ערב','Dinner out') },
  { key: 'birthday',      f: 4, icon: '🎂', name: L('יום הולדת','Birthday party') },
  { key: 'bar-club',      f: 3, icon: '🍸', name: L('בר / מועדון','Bar / club') },
  { key: 'wedding-day',   f: 5, icon: '💐', name: L('חתונה — יום','Wedding — daytime') },
  { key: 'wedding-night', f: 5, icon: '💍', name: L('חתונה — ערב','Wedding — evening') },
  { key: 'bar-mitzvah',   f: 4, icon: '📜', name: L('בר / בת מצווה','Bar / bat mitzvah') },
  { key: 'brit',          f: 3, icon: '🍼', name: L('ברית / בייבי שאוור','Brit / baby shower') },
  { key: 'funeral',       f: 4, icon: '🕯️', name: L('הלוויה / שבעה','Funeral / shiva') },
  { key: 'synagogue',     f: 4, icon: '🕍', name: L('בית כנסת','Synagogue') },
  { key: 'cocktail',      f: 5, icon: '🥂', name: L('קוקטייל','Cocktail') },
  { key: 'black-tie',     f: 6, icon: '🎩', name: L('Black Tie','Black tie') },
  { key: 'gala',          f: 6, icon: '✨', name: L('גאלה / צדקה','Gala') },
  { key: 'theatre',       f: 4, icon: '🎭', name: L('תיאטרון / אופרה','Theatre / opera') },
  { key: 'gallery',       f: 4, icon: '🖼️', name: L('גלריה / תערוכה','Gallery opening') },
  { key: 'festival',      f: 2, icon: '🎪', name: L('פסטיבל','Festival') },
  { key: 'beach',         f: 1, icon: '🏖️', name: L('חוף / בריכה','Beach / pool') },
  { key: 'picnic',        f: 2, icon: '🧺', name: L('פיקניק / פארק','Picnic / park') },
  { key: 'travel',        f: 2, icon: '✈️', name: L('יום נסיעה','Travel day') },
  { key: 'gym',           f: 1, icon: '🏋️', name: L('חדר כושר','Gym / run') },
  { key: 'home',          f: 1, icon: '🏠', name: L('בית','At home') },
];
export const occName = (k) => lbl(OCCASIONS.find(o => o.key === k)?.name) || k;
export const occFormality = (k) => OCCASIONS.find(o => o.key === k)?.f ?? 3;

/* ---------------- Weather ---------------- */
export const WEATHER = [
  { key: 'heatwave', icon: '🔥', name: L('שרב · 35°+','Heatwave · 35°+') },
  { key: 'hot',      icon: '☀️', name: L('חם · 28-34°','Hot · 28-34°') },
  { key: 'warm',     icon: '🌤️', name: L('נעים · 22-27°','Warm · 22-27°') },
  { key: 'mild',     icon: '🌥️', name: L('מעבר · 16-21°','Mild · 16-21°') },
  { key: 'cool',     icon: '🍃', name: L('קריר · 10-15°','Cool · 10-15°') },
  { key: 'cold',     icon: '❄️', name: L('קר · מתחת ל-10°','Cold · under 10°') },
  { key: 'rain',     icon: '🌧️', name: L('גשום','Rainy') },
];
export const WEATHER_SEASON = {
  heatwave: 'summer', hot: 'summer', warm: 'spring',
  mild: 'fall', cool: 'fall', cold: 'winter', rain: 'winter',
};

/* ---------------- Time of day ---------------- */
export const TIMES = [
  { key: 'morning',   icon: '🌅', name: L('בוקר','Morning') },
  { key: 'afternoon', icon: '🌤️', name: L('צהריים','Afternoon') },
  { key: 'evening',   icon: '🌆', name: L('ערב','Evening') },
  { key: 'night',     icon: '🌙', name: L('לילה','Night') },
];

/* ---------------- Mood / message ---------------- */
export const MOODS = [
  { key: 'confident', name: L('סמכותי ובטוח','Confident & authoritative') },
  { key: 'approachable', name: L('נגיש וחם','Approachable & warm') },
  { key: 'attractive', name: L('מושך ומוקפד','Attractive & polished') },
  { key: 'creative', name: L('יצירתי ולא שגרתי','Creative & unconventional') },
  { key: 'understated', name: L('שקט ומינימלי','Quiet & minimal') },
  { key: 'comfortable', name: L('נוח מעל הכל','Comfort above all') },
];

/* ---------------- Body shapes ---------------- */
export const BODY_SHAPES = {
  women: [
    { key: 'hourglass', name: L('שעון חול','Hourglass') },
    { key: 'pear', name: L('אגס / משולש','Pear / triangle') },
    { key: 'apple', name: L('תפוח / עגול','Apple / round') },
    { key: 'rectangle', name: L('מלבן','Rectangle') },
    { key: 'inverted-triangle', name: L('משולש הפוך','Inverted triangle') },
  ],
  men: [
    { key: 'trapezoid', name: L('טרפז','Trapezoid') },
    { key: 'inverted-triangle', name: L('משולש הפוך','Inverted triangle') },
    { key: 'rectangle', name: L('מלבן','Rectangle') },
    { key: 'oval', name: L('אובאל','Oval') },
    { key: 'triangle', name: L('משולש','Triangle') },
  ],
};
BODY_SHAPES['non-binary'] = [...BODY_SHAPES.women, ...BODY_SHAPES.men]
  .filter((s, i, a) => a.findIndex(x => x.key === s.key) === i);

/* ---------------- Color seasons ---------------- */
export const COLOR_SEASONS = [
  'Bright Spring','True Spring','Light Spring',
  'Light Summer','True Summer','Soft Summer',
  'Soft Autumn','True Autumn','Deep Autumn',
  'Deep Winter','True Winter','Bright Winter',
];

/* ---------------- Style archetypes ---------------- */
export const ARCHETYPES = [
  { key: 'classic', name: L('קלאסי','Classic') },
  { key: 'minimal', name: L('מינימלי','Minimal') },
  { key: 'quiet-luxury', name: L('יוקרה שקטה','Quiet luxury') },
  { key: 'edgy', name: L('אדג׳י','Edgy') },
  { key: 'romantic', name: L('רומנטי','Romantic') },
  { key: 'sporty', name: L('ספורטיבי','Sporty') },
  { key: 'bohemian', name: L('בוהו','Bohemian') },
  { key: 'preppy', name: L('פרפי','Preppy') },
  { key: 'streetwear', name: L('סטריטוור','Streetwear') },
  { key: 'avant-garde', name: L('אוונגרד','Avant-garde') },
];

/* ---------------- Beauty looks (SKILL.md Module 7.2) ---------------- */
/* The bloom is the colour the look actually leaves on a face — it is the swatch
   on the menu, so it has to be the shade rather than a house tint. */
export const BEAUTY_LOOKS = [
  { key: 'no-makeup',       tKey: 'look_nomakeup',  dKey: 'd_nomakeup',  bloom: 'radial-gradient(circle, rgba(212,180,160,.35), transparent 70%)' },
  { key: 'soft-definition', tKey: 'look_soft',      dKey: 'd_soft',      bloom: 'radial-gradient(circle, rgba(185,163,196,.35), transparent 70%)' },
  { key: 'coral-fresh',     tKey: 'look_coral',     dKey: 'd_coral',     bloom: 'radial-gradient(circle, rgba(240,117,90,.38), transparent 70%)' },
  { key: 'soft-evening',    tKey: 'look_evening',   dKey: 'd_evening',   bloom: 'radial-gradient(circle, rgba(168,83,92,.35), transparent 70%)' },
  { key: 'lilac-wash',      tKey: 'look_lilac',     dKey: 'd_lilac',     bloom: 'radial-gradient(circle, rgba(169,139,196,.4), transparent 70%)' },
  { key: 'copper-glow',     tKey: 'look_copper',    dKey: 'd_copper',    bloom: 'radial-gradient(circle, rgba(178,106,60,.4), transparent 70%)' },
  { key: 'berry-bold',      tKey: 'look_berry',     dKey: 'd_berry',     bloom: 'radial-gradient(circle, rgba(179,40,107,.4), transparent 70%)' },
  { key: 'cobalt-liner',    tKey: 'look_cobalt',    dKey: 'd_cobalt',    bloom: 'radial-gradient(circle, rgba(31,79,216,.38), transparent 70%)' },
  { key: 'green-smoke',     tKey: 'look_green',     dKey: 'd_green',     bloom: 'radial-gradient(circle, rgba(63,91,58,.42), transparent 70%)' },
  { key: 'red-carpet',      tKey: 'look_red',       dKey: 'd_red',       bloom: 'radial-gradient(circle, rgba(179,18,43,.4), transparent 70%)' },
  { key: 'statement',       tKey: 'look_statement', dKey: 'd_statement', bloom: 'radial-gradient(circle, rgba(110,31,40,.4), transparent 70%)' },
  { key: 'graphic-noir',    tKey: 'look_noir',      dKey: 'd_noir',      bloom: 'radial-gradient(circle, rgba(14,12,12,.42), transparent 70%)' },
  { key: 'editorial',       tKey: 'look_editorial', dKey: 'd_editorial', bloom: 'radial-gradient(circle, rgba(198,166,103,.4), transparent 70%)' },
  { key: 'grooming',        tKey: 'look_grooming',  dKey: 'd_grooming',  bloom: 'radial-gradient(circle, rgba(107,79,63,.35), transparent 70%)' },
];

/* Occasion → suggested beauty look */
export const OCCASION_BEAUTY = {
  'casual-day':'no-makeup', coffee:'no-makeup', home:'no-makeup', gym:'no-makeup',
  beach:'no-makeup', picnic:'no-makeup', travel:'no-makeup',
  'work-tech':'soft-definition', 'work-corp':'soft-definition', interview:'soft-definition',
  'client-meet':'soft-definition', conference:'soft-definition', 'video-call':'soft-definition',
  brit:'soft-definition', synagogue:'soft-definition', funeral:'no-makeup',
  date:'soft-evening', dinner:'soft-evening', theatre:'soft-evening',
  'bar-club':'berry-bold',
  'wedding-day':'coral-fresh', 'wedding-night':'statement', cocktail:'red-carpet',
  'black-tie':'red-carpet', gala:'statement', birthday:'berry-bold', 'bar-mitzvah':'copper-glow',
  gallery:'graphic-noir', festival:'editorial',
};

/* ---------------- Trend ticker (from trends-2026.md) ---------------- */
export const TRENDS_TICKER = [
  L('מונוכרום שחור','Monochrome black'),
  L('חייטות רכה','Soft power tailoring'),
  L('Cloud Dancer — צבע השנה','Cloud Dancer — color of the year'),
  L('משבצות וטרטן','Plaid & tartan'),
  L('שפתון אוקסבלאד','Oxblood lip'),
  L('מרקם ופרווה','Texture & fur'),
  L('חייטות גברית רפויה','Relaxed menswear'),
  L('ברוקד וז׳קארד','Brocade & jacquard'),
];

/* ---------------- Curated color name → hex (fallback swatches) ---------------- */
export const COLOR_HEX = {
  black:'#14110F', white:'#FFFFFF', cream:'#F4F0E8', ivory:'#F7F3E9',
  navy:'#1F2A44', 'light blue':'#A7C4DC', denim:'#4A6D8C', cobalt:'#2A52BE',
  grey:'#8B8681', gray:'#8B8681', charcoal:'#36322F', beige:'#D8C7AE',
  camel:'#C39A6B', tan:'#B08D57', brown:'#6B4F3F', chocolate:'#4A3228',
  olive:'#6B7043', khaki:'#9C8F63', sage:'#9AA989', 'forest green':'#2C4A3B',
  emerald:'#2E7D5B', mint:'#A8D8C4', red:'#B0302B', oxblood:'#6E1F28',
  burgundy:'#5C1F2E', pink:'#E3A9B6', fuchsia:'#C2317C', mauve:'#9A7B8C',
  lilac:'#B9A3C4', purple:'#5E3A73', yellow:'#E0BE55', mustard:'#C99A2E',
  orange:'#D97A3E', terracotta:'#B45E3C', coral:'#E08A70', peach:'#F0C0A0',
  gold:'#C6A667', silver:'#B8B8B8', 'sage green':'#9AA989', 'cloud dancer':'#F0EEE9',
};

export function hexFor(colorObj) {
  if (!colorObj) return '#C8C2B8';
  if (colorObj.hex && /^#[0-9a-f]{3,8}$/i.test(colorObj.hex)) return colorObj.hex;
  const n = (colorObj.name_en || colorObj.name_he || '').toLowerCase().trim();
  if (COLOR_HEX[n]) return COLOR_HEX[n];
  const hit = Object.keys(COLOR_HEX).find(k => n.includes(k));
  return hit ? COLOR_HEX[hit] : '#C8C2B8';
}

/* ---------------- Outfit slot order ---------------- */
export const SLOT_ORDER = ['dress','top','bottom','outerwear','shoes','bag','accessory','jewelry','headwear'];
export const SLOT_NAMES = {
  top: L('עליונית','Top'), bottom: L('תחתונית','Bottom'), dress: L('שמלה','Dress'),
  outerwear: L('שכבה','Layer'), shoes: L('נעליים','Shoes'), bag: L('תיק','Bag'),
  accessory: L('אקססורי','Accessory'), jewelry: L('תכשיט','Jewelry'), headwear: L('כובע','Headwear'),
};
export const slotName = (k) => lbl(SLOT_NAMES[k]) || k;
