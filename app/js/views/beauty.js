/* ============================================================
   VESTRA · Beauty & grooming
   ============================================================ */

import { el, icon, esc, toast, sparkle, buzz, observeReveal } from '../ui.js';
import { t, pick, isHe } from '../i18n.js';
import { state } from '../state.js';
import { hasKey } from '../store.js';
import { beautyLook, errText } from '../ai.js';
import { renderMakeup, loadImage } from '../makeup.js';
import { downloadCanvas } from '../tryon.js';
import { openMakeupBrief, openFullBrief } from './brief.js';
import { BEAUTY_LOOKS, OCCASION_BEAUTY, OCCASIONS, occName, lbl } from '../taxonomy.js';

/* Offline reference looks — SKILL.md Module 7.2 / 7.3 */
/* Offline reference looks — SKILL.md Module 7.2 / 7.3

   Every step names a real product as well as a hex.

   That is how the industry actually talks: a makeup artist does not say "a
   blue-red matte", they say Ruby Woo, and the person buying it needs a name on
   a shelf. It also sharpens the render brief, because a famous shade carries
   more information to an image model than any adjective — it has seen it.

   Two rules keep it honest. `ref` is a well-known reference and `alt` is
   something from a pharmacy shelf, so the look is buyable at either end. And
   the hex is the authority, not the name: shade names get renamed and
   formulations get discontinued, so the colour is what the simulation and the
   brief actually use, with the product named alongside it as the thing to look
   for. */
const LOCAL = {
  'no-makeup': {
    look_name_he: 'No-Makeup', look_name_en: 'No-Makeup', duration_minutes: 5,
    steps: [
      { area: 'skin', technique: 'base', finish: 'natural', instruction_he: 'סקין-טינט דק בשכבה אחת, קונסילר נקודתי בלבד', instruction_en: 'A single thin layer of skin tint, concealer only where needed', shade_hex: '#E8CBB4',
        ref: 'Glossier Perfecting Skin Tint', alt: 'Maybelline Fit Me Fresh Tint' },
      { area: 'brows', technique: 'brow', instruction_he: 'ג׳ל גבות שקוף — לסרק כלפי מעלה', instruction_en: 'Clear brow gel, brushed upward', shade_hex: '#6B4F3F',
        ref: 'Anastasia Beverly Hills Clear Brow Gel', alt: 'Essence Make Me Brow' },
      { area: 'cheeks', technique: 'blush', instruction_he: 'קרם-בלאש אפרסק, לטפוח באצבע', instruction_en: 'Cream blush in peach, pressed in with a finger', shade_hex: '#E8A183',
        ref: 'Rare Beauty Soft Pinch Liquid Blush · Hope', alt: 'Milani Cheek Kiss Cream Blush' },
      { area: 'eyes', technique: 'lashes', instruction_he: 'מסקרה חומה, שכבה אחת', instruction_en: 'Brown mascara, one coat', shade_hex: '#4A3228',
        ref: 'Benefit They’re Real · Beyond Brown', alt: 'L’Oréal Telescopic · Brown' },
      { area: 'lips', technique: 'lipstick', finish: 'satin', instruction_he: 'באלם עם גוון', instruction_en: 'Tinted balm', shade_hex: '#C98C86',
        ref: 'Dior Lip Glow · 012 Rosewood', alt: 'Nivea Rich Care Tinted Balm' },
    ],
    trend_he: 'עור נקי וזוהר — הכיוון של Cloud Dancer 2026',
    trend_en: 'Clean luminous skin — the Cloud Dancer 2026 direction',
    tip_he: 'פריימר מרטיב לפני הכל — זה מה שמחזיק את הלוק הזה כל היום.',
    tip_en: 'A hydrating primer first — that is what carries this look all day.',
  },
  'soft-definition': {
    look_name_he: 'Soft Definition', look_name_en: 'Soft Definition', duration_minutes: 10,
    steps: [
      { area: 'skin', technique: 'base', instruction_he: 'פאונדיישן בכיסוי בינוני, פודרה רק ב-T', instruction_en: 'Medium-coverage foundation, powder on the T-zone only', shade_hex: '#E3C3A8',
        ref: 'NARS Light Reflecting Foundation', alt: 'L’Oréal Infaillible 24H Fresh Wear' },
      { area: 'eyes', technique: 'shadow', instruction_he: 'צללית ניוד על כל העפעף', instruction_en: 'Nude shadow across the lid', shade_hex: '#8A6A55',
        ref: 'Urban Decay Naked2 Basics · Frisk', alt: 'Catrice The Nude Blossom Palette' },
      { area: 'eyes', technique: 'liner', instruction_he: 'אייליינר חום דק בקו הריסים', instruction_en: 'A thin brown liner along the lash line', shade_hex: '#5A3E2E',
        ref: 'Bobbi Brown Long-Wear Gel Liner · Sepia Ink', alt: 'NYX Epic Ink Liner · Brown' },
      { area: 'eyes', technique: 'lashes', instruction_he: 'מסקרה שחורה, שתי שכבות', instruction_en: 'Black mascara, two coats', shade_hex: '#14110F',
        ref: 'Lancôme Hypnôse', alt: 'Maybelline Sky High' },
      { area: 'cheeks', technique: 'blush', finish: 'satin', instruction_he: 'בלאש ורוד על תפוח הלחי', instruction_en: 'Pink blush on the apple of the cheek', shade_hex: '#D98F9E',
        ref: 'NARS Blush · Orgasm', alt: 'Essence Satin Touch Blush' },
      { area: 'highlight', technique: 'highlight', finish: 'shimmer', instruction_he: 'היילייטר עדין על עצם הלחי', instruction_en: 'A soft highlighter along the cheekbone', shade_hex: '#F3DCC4',
        ref: 'Charlotte Tilbury Hollywood Flawless Filter', alt: 'Catrice Glow Lighter' },
      { area: 'lips', technique: 'lipstick', finish: 'matte', instruction_he: 'ורוד-חום מאט', instruction_en: 'Matte rose-brown', shade_hex: '#A9695E',
        ref: 'Charlotte Tilbury Matte Revolution · Pillow Talk Medium', alt: 'NYX Soft Matte Lip Cream · Cannes' },
    ],
    trend_he: 'הגדרה רכה — מספיק למצלמה, לא יותר מדי לפגישה',
    trend_en: 'Soft definition — enough for camera, not too much for a meeting',
    tip_he: 'ספריי קיבוע בסוף במרחק 30 ס״מ.',
    tip_en: 'Finish with setting spray from about 30 cm away.',
  },
  'soft-evening': {
    look_name_he: 'Soft Evening', look_name_en: 'Soft Evening', duration_minutes: 18,
    steps: [
      { area: 'skin', technique: 'base', instruction_he: 'כיסוי בינוני-מלא עם גימור סטין', instruction_en: 'Medium-to-full coverage with a satin finish', shade_hex: '#DFBB9F',
        ref: 'Estée Lauder Double Wear', alt: 'Maybelline SuperStay 30H' },
      { area: 'eyes', technique: 'shadow', instruction_he: 'צלליות חמות בקמט', instruction_en: 'Warm shadow through the crease', shade_hex: '#6B4536',
        ref: 'Anastasia Beverly Hills Soft Glam · Cyprus Umber', alt: 'Essence The Brown Edition Palette' },
      { area: 'eyes', technique: 'liner', instruction_he: 'אייליינר מרוח בכוונה (smudged)', instruction_en: 'Deliberately smudged liner', shade_hex: '#2A1E18',
        ref: 'Urban Decay 24/7 Glide-On · Perversion', alt: 'Rimmel Scandaleyes Kohl Kajal' },
      { area: 'eyes', technique: 'lashes', instruction_he: 'ריסים — שכבה כפולה או ריסי פינה', instruction_en: 'Lashes — double coat or corner lashes', shade_hex: '#14110F',
        ref: 'Too Faced Better Than Sex', alt: 'Maybelline Lash Sensational Sky High' },
      { area: 'cheeks', technique: 'blush', instruction_he: 'בלאש חם על תפוח הלחי', instruction_en: 'A warm blush on the apple of the cheek', shade_hex: '#B57A63',
        ref: 'NARS Blush · Dolce Vita', alt: 'Milani Baked Blush · Luminoso' },
      { area: 'contour', technique: 'contour', instruction_he: 'קונטור עדין מתחת לעצם הלחי', instruction_en: 'A soft contour under the cheekbone', shade_hex: '#8A6249',
        ref: 'Fenty Beauty Match Stix Matte · Amber', alt: 'Catrice Contouring Powder Stick' },
      { area: 'lips', technique: 'lipstick', finish: 'satin', instruction_he: 'חום-אדמדם או רוז׳ עמוק', instruction_en: 'Red-brown or a deep rose', shade_hex: '#8E4438',
        ref: 'MAC Satin Lipstick · Paramount', alt: 'Revlon Super Lustrous · Blase Apricot' },
    ],
    trend_he: 'Deliberate Imperfection — הכיוון המרכזי של F/W 26-27',
    trend_en: 'Deliberate imperfection — the defining mood of F/W 26-27',
    tip_he: 'לטפוח פודרה שקופה על השפתון בין שתי שכבות.',
    tip_en: 'Press translucent powder between two coats of lipstick.',
  },
  statement: {
    look_name_he: 'Statement', look_name_en: 'Statement', duration_minutes: 25,
    steps: [
      { area: 'skin', technique: 'base', instruction_he: 'כיסוי מלא, מקובע בפודרה ובספריי', instruction_en: 'Full coverage, set with powder and spray', shade_hex: '#DDB89B',
        ref: 'Estée Lauder Double Wear + Laura Mercier Translucent Powder', alt: 'Maybelline SuperStay 30H + Rimmel Stay Matte' },
      { area: 'lips', technique: 'lipstick', finish: 'satin', instruction_he: 'Oxblood — אדום עמוק עם אנדרטון חום-סגול. עיפרון בקו ואז מילוי.', instruction_en: 'Oxblood — deep red with a brown-purple undertone. Line first, then fill.', shade_hex: '#6E1F28',
        ref: 'MAC Matte Lipstick · Sin', alt: 'Maybelline SuperStay Matte Ink · Voyager' },
      { area: 'eyes', technique: 'shadow', instruction_he: 'כאן בוחרים אחד: אם השפה כהה — העין נשארת שקטה (ניוד + מסקרה).', instruction_en: 'Pick one: with a dark lip the eye stays quiet — nude shadow and mascara.', shade_hex: '#9C8574',
        ref: 'Urban Decay Naked2 Basics · Tempted', alt: 'Catrice The Nude Blossom Palette' },
      { area: 'contour', technique: 'contour', instruction_he: 'קונטור מתחת לעצם הלחי', instruction_en: 'Contour under the cheekbone', shade_hex: '#8C6046',
        ref: 'Charlotte Tilbury Filmstar Bronze & Glow', alt: 'Milani Contour Palette' },
      { area: 'highlight', technique: 'highlight', finish: 'shimmer', instruction_he: 'היילייטר קוסמי רב-גוני על עצם הלחי', instruction_en: 'A multi-tonal cosmic highlighter on the bone', shade_hex: '#C6A667',
        ref: 'Fenty Beauty Killawatt · Mo’ Hunny', alt: 'Essence Glow Like Highlighter' },
      { area: 'brows', technique: 'brow', instruction_he: 'גבות מלאות ומוגדרות', instruction_en: 'Full, defined brows', shade_hex: '#4A3228',
        ref: 'Anastasia Beverly Hills Brow Wiz · Medium Brown', alt: 'Essence Eyebrow Pencil' },
    ],
    trend_he: 'Oxblood Lip — סיפור השפתיים של העונה (Saint Laurent, Elie Saab, Carven)',
    trend_en: 'The oxblood lip — the season’s lip story (Saint Laurent, Elie Saab, Carven)',
    tip_he: 'עין דרמטית או שפה דרמטית — לא שתיהן.',
    tip_en: 'Dramatic eye or dramatic lip — never both.',
  },
  'red-carpet': {
    look_name_he: 'Classic Red', look_name_en: 'Classic Red', duration_minutes: 22,
    steps: [
      { area: 'skin', technique: 'base', instruction_he: 'כיסוי מלא בגימור סטין — אדום דורש עור אחיד', instruction_en: 'Full coverage in a satin finish — a red lip asks for even skin', shade_hex: '#E0BC9E',
        ref: 'Estée Lauder Double Wear', alt: 'L’Oréal Infaillible 32H Matte Cover' },
      { area: 'lips', technique: 'lipstick', finish: 'matte', instruction_he: 'אדום כחלחל מאט — עיפרון באותו גוון קודם, ואז מילוי מהמרכז החוצה', instruction_en: 'A true blue-red matte — line in the same shade first, then fill from the centre out', shade_hex: '#B3122B',
        ref: 'MAC Retro Matte · Ruby Woo', alt: 'Maybelline SuperStay Matte Ink · Pioneer' },
      { area: 'eyes', technique: 'liner', instruction_he: 'קו דק ונקי בלבד — האדום עושה את העבודה', instruction_en: 'A thin clean line only — the red is doing the work', shade_hex: '#14110F',
        ref: 'Stila Stay All Day Liquid Liner · Intense Black', alt: 'NYX Epic Ink Liner' },
      { area: 'eyes', technique: 'lashes', instruction_he: 'מסקרה שחורה, שתי שכבות', instruction_en: 'Black mascara, two coats', shade_hex: '#14110F',
        ref: 'Lancôme Hypnôse', alt: 'Essence Lash Princess' },
      { area: 'cheeks', technique: 'blush', instruction_he: 'בלאש קריר ומינימלי — לא להתחרות בשפה', instruction_en: 'A cool, minimal blush — nothing that competes with the lip', shade_hex: '#C98494',
        ref: 'NARS Blush · Dolce Vita', alt: 'Essence Satin Touch Blush' },
      { area: 'brows', technique: 'brow', instruction_he: 'גבות מסודרות ולא כהות מדי', instruction_en: 'Groomed brows, not too dark', shade_hex: '#4A3228',
        ref: 'Benefit Precisely My Brow', alt: 'Essence Eyebrow Pencil' },
    ],
    trend_he: 'האדום הקלאסי חוזר נקי — בלי גלוס, בלי ניצנוץ',
    trend_en: 'The classic red returns clean — no gloss, no shimmer',
    tip_he: 'לנגב את פנים השפה בטישו — זה מה שמונע אדום על השיניים.',
    tip_en: 'Blot the inside of the lip on a tissue — that is what keeps red off the teeth.',
  },
  'berry-bold': {
    look_name_he: 'Berry Bold', look_name_en: 'Berry Bold', duration_minutes: 20,
    steps: [
      { area: 'skin', technique: 'base', instruction_he: 'כיסוי בינוני, גימור טרי', instruction_en: 'Medium coverage, fresh finish', shade_hex: '#E2C0A4',
        ref: 'NARS Light Reflecting Foundation', alt: 'Maybelline Fit Me Dewy + Smooth' },
      { area: 'lips', technique: 'lipstick', finish: 'satin', instruction_he: 'פוקסיה-פטל רווי, קו נקי', instruction_en: 'A saturated raspberry fuchsia, cleanly lined', shade_hex: '#B3286B',
        ref: 'YSL Rouge Pur Couture · 27 Fuchsia Innocent', alt: 'NYX Soft Matte Lip Cream · Prague' },
      { area: 'eyes', technique: 'shadow', instruction_he: 'ניוד חמים בלבד — הפה הוא הצבע', instruction_en: 'Warm nude only — the mouth is the colour', shade_hex: '#A8846C',
        ref: 'Urban Decay Naked3 · Nooner', alt: 'Catrice The Dry Rosé Palette' },
      { area: 'eyes', technique: 'lashes', instruction_he: 'מסקרה שחורה', instruction_en: 'Black mascara', shade_hex: '#14110F',
        ref: 'Benefit They’re Real Magnet', alt: 'Maybelline Sky High' },
      { area: 'cheeks', technique: 'blush', finish: 'satin', instruction_he: 'בלאש פטל מטושטש גבוה על הלחי', instruction_en: 'A raspberry blush blurred high on the cheek', shade_hex: '#C4547E',
        ref: 'Rare Beauty Soft Pinch Liquid Blush · Grace', alt: 'Milani Cheek Kiss · Berry Bliss' },
      { area: 'brows', technique: 'brow', instruction_he: 'גבות טבעיות, מסורקות מעלה', instruction_en: 'Natural brows, brushed up', shade_hex: '#5A4133',
        ref: 'Anastasia Beverly Hills Brow Freeze', alt: 'Essence Make Me Brow' },
    ],
    trend_he: 'צבע רווי על הפה עם עין נקייה — הדרך הקלה ביותר להיראות מכוונת',
    trend_en: 'Saturated colour on the mouth with a clean eye — the easiest way to look deliberate',
    tip_he: 'פוקסיה מבליט שיניים לבנות — לבחור גוון עם אנדרטון כחול ולא כתום.',
    tip_en: 'Fuchsia flatters the teeth when the undertone is blue rather than orange.',
  },
  'copper-glow': {
    look_name_he: 'Copper Glow', look_name_en: 'Copper Glow', duration_minutes: 20,
    steps: [
      { area: 'skin', technique: 'base', finish: 'shimmer', instruction_he: 'בסיס זוהר, לא מאט', instruction_en: 'A luminous base, never matte', shade_hex: '#E4C0A0',
        ref: 'Charlotte Tilbury Beautiful Skin Foundation', alt: 'L’Oréal Lumi Glotion + Fit Me Dewy' },
      { area: 'eyes', technique: 'shadow', finish: 'shimmer', instruction_he: 'נחושת מטאלית על כל העפעף הנייד, מטושטשת בקמט', instruction_en: 'Metallic copper across the mobile lid, blurred into the crease', shade_hex: '#B26A3C',
        ref: 'Natasha Denona Bronze Palette', alt: 'Catrice Metal Shock Eyeshadow · Copper' },
      { area: 'eyes', technique: 'liner', instruction_he: 'קו חום-נחושת בקו הריסים, מרוח קלות', instruction_en: 'A copper-brown line at the lashes, lightly smudged', shade_hex: '#7A4423',
        ref: 'Urban Decay 24/7 Glide-On · Smog', alt: 'NYX Epic Wear Liner Stick · Copper' },
      { area: 'eyes', technique: 'lashes', instruction_he: 'מסקרה חומה-שחורה', instruction_en: 'Brown-black mascara', shade_hex: '#241A14',
        ref: 'Benefit They’re Real · Beyond Brown', alt: 'L’Oréal Telescopic · Brown' },
      { area: 'cheeks', technique: 'blush', instruction_he: 'בלאש אפרסק-נחושת', instruction_en: 'Peach-copper blush', shade_hex: '#CE8258',
        ref: 'NARS Blush · Luster', alt: 'Milani Baked Blush · Luminoso' },
      { area: 'highlight', technique: 'highlight', finish: 'shimmer', instruction_he: 'היילייטר זהוב-שמפניה על נקודות הגובה', instruction_en: 'A champagne-gold highlighter on the high points', shade_hex: '#E8C98F',
        ref: 'Fenty Beauty Killawatt · Trophy Wife', alt: 'Essence Glow Like Highlighter' },
      { area: 'lips', technique: 'lipstick', finish: 'glossy', instruction_he: 'גלוס קרמל שקוף', instruction_en: 'A sheer caramel gloss', shade_hex: '#B9755C',
        ref: 'Fenty Beauty Gloss Bomb · Fenty Glow', alt: 'Maybelline Lifter Gloss · Topaz' },
    ],
    trend_he: 'עין נחושת על עור זוהר — הכיוון החם של F/W 26-27',
    trend_en: 'A copper eye on luminous skin — the warm direction of F/W 26-27',
    tip_he: 'נחושת עובדת יפה במיוחד על עיניים ירוקות וחומות — היא הצבע המשלים שלהן.',
    tip_en: 'Copper flatters green and brown eyes especially — it is their complementary.',
  },
  'cobalt-liner': {
    look_name_he: 'Cobalt Liner', look_name_en: 'Cobalt Liner', duration_minutes: 16,
    steps: [
      { area: 'skin', technique: 'base', instruction_he: 'בסיס נקי ומאוזן — הצבע כולו בעין', instruction_en: 'A clean even base — all the colour is at the eye', shade_hex: '#E3C3A8',
        ref: 'NARS Light Reflecting Foundation', alt: 'Maybelline Fit Me Matte + Poreless' },
      { area: 'eyes', technique: 'liner', instruction_he: 'קו קובלט גרפי לאורך קו הריסים העליון, עם מתיחה קצרה', instruction_en: 'A graphic cobalt line along the upper lash line with a short wing', shade_hex: '#1F4FD8',
        ref: 'NYX Vivid Brights Liner · Vivid Sapphire', alt: 'Essence Colour Kick Eyeliner · Blue' },
      { area: 'eyes', technique: 'lashes', instruction_he: 'מסקרה שחורה בלבד — בלי צללית', instruction_en: 'Black mascara only — no shadow', shade_hex: '#14110F',
        ref: 'Maybelline Sky High', alt: 'Essence Lash Princess' },
      { area: 'brows', technique: 'brow', instruction_he: 'גבות מוגדרות, מסורקות מעלה', instruction_en: 'Defined brows, brushed up', shade_hex: '#4A3228',
        ref: 'Anastasia Beverly Hills Brow Wiz', alt: 'Essence Eyebrow Pencil' },
      { area: 'cheeks', technique: 'blush', instruction_he: 'בלאש אפרסק שקט', instruction_en: 'A quiet peach blush', shade_hex: '#DDA083',
        ref: 'Rare Beauty Soft Pinch · Joy', alt: 'Catrice Blush Box' },
      { area: 'lips', technique: 'lipstick', finish: 'satin', instruction_he: 'ניוד-ורדרד — הכל נשאר בעין', instruction_en: 'A rosy nude — everything stays at the eye', shade_hex: '#C08A80',
        ref: 'Charlotte Tilbury Matte Revolution · Pillow Talk', alt: 'Revlon Super Lustrous · Pink Truffle' },
    ],
    trend_he: 'צבע על קו הריסים במקום צללית — הגרסה הלבישה של הטרנד הגרפי',
    trend_en: 'Colour at the lash line instead of shadow — the wearable version of the graphic trend',
    tip_he: 'קו צבעוני דורש עין נקייה לגמרי מסביב, אחרת הוא נראה מלוכלך.',
    tip_en: 'A coloured line needs a completely clean eye around it, or it reads as smudged.',
  },
  'green-smoke': {
    look_name_he: 'Green Smoke', look_name_en: 'Green Smoke', duration_minutes: 26,
    steps: [
      { area: 'skin', technique: 'base', instruction_he: 'כיסוי בינוני-מלא, גימור סטין', instruction_en: 'Medium-to-full coverage, satin finish', shade_hex: '#DFBB9F',
        ref: 'Estée Lauder Double Wear', alt: 'L’Oréal Infaillible 24H Fresh Wear' },
      { area: 'eyes', technique: 'shadow', instruction_he: 'ירוק אזוב עמוק על העפעף, מטושטש כלפי מעלה ולחוץ', instruction_en: 'A deep moss green on the lid, blurred up and outward', shade_hex: '#3F5B3A',
        ref: 'MAC Eye Shadow · Humid', alt: 'Catrice The Ultimate Green Palette' },
      { area: 'eyes', technique: 'liner', instruction_he: 'קו ירוק כהה בתוך קו הריסים, מרוח', instruction_en: 'A dark green line tight to the lashes, smudged', shade_hex: '#26402A',
        ref: 'Urban Decay 24/7 Glide-On · Mildew', alt: 'NYX Epic Wear Liner Stick · Emerald Cut' },
      { area: 'eyes', technique: 'lashes', instruction_he: 'מסקרה שחורה, שתי שכבות', instruction_en: 'Black mascara, two coats', shade_hex: '#14110F',
        ref: 'Too Faced Better Than Sex', alt: 'Maybelline Lash Sensational' },
      { area: 'cheeks', technique: 'blush', instruction_he: 'בלאש חום-ורדרד, מינימלי', instruction_en: 'A rosy-brown blush, minimal', shade_hex: '#B5786A',
        ref: 'NARS Blush · Dolce Vita', alt: 'Milani Baked Blush · Dolce Pink' },
      { area: 'lips', technique: 'lipstick', finish: 'matte', instruction_he: 'ניוד חום — עין ירוקה עמוקה לא רוצה תחרות', instruction_en: 'A brown nude — a deep green eye wants no competition', shade_hex: '#A2705E',
        ref: 'MAC Matte Lipstick · Velvet Teddy', alt: 'NYX Soft Matte Lip Cream · Stockholm' },
    ],
    trend_he: 'ירוק במקום שחור — עשן בצבע הוא סיפור העין של העונה',
    trend_en: 'Green instead of black — coloured smoke is the season’s eye story',
    tip_he: 'ירוק בולט במיוחד על עיניים חומות ואגוזיות.',
    tip_en: 'Green sings against brown and hazel eyes.',
  },
  'lilac-wash': {
    look_name_he: 'Lilac Wash', look_name_en: 'Lilac Wash', duration_minutes: 14,
    steps: [
      { area: 'skin', technique: 'base', instruction_he: 'בסיס קל וזוהר', instruction_en: 'A light luminous base', shade_hex: '#E6C6AC',
        ref: 'Glossier Perfecting Skin Tint', alt: 'Maybelline Fit Me Fresh Tint' },
      { area: 'eyes', technique: 'shadow', instruction_he: 'שטיפת לילך על כל העפעף, בלי קו קמט', instruction_en: 'A lilac wash across the whole lid, no crease line', shade_hex: '#A98BC4',
        ref: 'NARS Single Eyeshadow · Bagatelle', alt: 'Essence The Purple Edition Palette' },
      { area: 'eyes', technique: 'lashes', instruction_he: 'מסקרה שחורה, שכבה אחת', instruction_en: 'Black mascara, one coat', shade_hex: '#14110F',
        ref: 'Benefit They’re Real', alt: 'Essence Lash Princess' },
      { area: 'cheeks', technique: 'blush', finish: 'satin', instruction_he: 'בלאש ורוד קריר', instruction_en: 'A cool pink blush', shade_hex: '#D392A6',
        ref: 'Rare Beauty Soft Pinch · Bliss', alt: 'Catrice Blush Box · Cool Berry' },
      { area: 'lips', technique: 'lipstick', finish: 'glossy', instruction_he: 'גלוס ורוד שקוף', instruction_en: 'A sheer pink gloss', shade_hex: '#CE8FA0',
        ref: 'Dior Addict Lip Maximizer · 010 Holo Pink', alt: 'Maybelline Lifter Gloss · Ice' },
      { area: 'brows', technique: 'brow', instruction_he: 'גבות רכות, לא כהות', instruction_en: 'Soft brows, nothing heavy', shade_hex: '#6B4F3F',
        ref: 'Benefit Gimme Brow+', alt: 'Essence Make Me Brow' },
    ],
    trend_he: 'פסטל רווי על העפעף — צבע בלי דרמה',
    trend_en: 'A saturated pastel on the lid — colour without drama',
    tip_he: 'לילך על עפעף עם אנדרטון ורדרד מדגיש אדמומיות — פריימר עפעפיים קודם.',
    tip_en: 'Lilac over a pink-toned lid emphasises redness — prime the lid first.',
  },
  'coral-fresh': {
    look_name_he: 'Coral Fresh', look_name_en: 'Coral Fresh', duration_minutes: 12,
    steps: [
      { area: 'skin', technique: 'base', instruction_he: 'טינט קל — לוק של אור יום', instruction_en: 'A light tint — this is a daylight look', shade_hex: '#E8CBB4',
        ref: 'Charlotte Tilbury Unreal Skin Sheer Glow Tint', alt: 'L’Oréal Lumi Glotion' },
      { area: 'cheeks', technique: 'blush', instruction_he: 'קורל חי גבוה על הלחי, נמרח כלפי הרקה', instruction_en: 'A live coral high on the cheek, swept toward the temple', shade_hex: '#F0755A',
        ref: 'NARS Blush · Exhibit A (sheered out)', alt: 'Milani Baked Blush · Luminoso' },
      { area: 'lips', technique: 'lipstick', finish: 'satin', instruction_he: 'קורל-אפרסק על השפה', instruction_en: 'Coral-peach on the lip', shade_hex: '#E4694F',
        ref: 'MAC Lipstick · Sushi Kiss', alt: 'Revlon Super Lustrous · Coral Berry' },
      { area: 'eyes', technique: 'shadow', instruction_he: 'אפרסק בהיר על העפעף בלבד', instruction_en: 'A pale peach on the lid only', shade_hex: '#E0A98C',
        ref: 'Urban Decay Naked3 · Strange', alt: 'Catrice The Coral Nude Palette' },
      { area: 'eyes', technique: 'lashes', instruction_he: 'מסקרה חומה', instruction_en: 'Brown mascara', shade_hex: '#4A3228',
        ref: 'L’Oréal Telescopic · Brown', alt: 'Essence Lash Princess · Brown' },
    ],
    trend_he: 'קורל חוזר — הצבע שהכי מחמיא לעור שזוף',
    trend_en: 'Coral returns — the shade that flatters tanned skin most',
    tip_he: 'אותו קורל על הלחי ועל השפה — זה מה שהופך אותו למכוון ולא מקרי.',
    tip_en: 'The same coral on cheek and lip — that is what makes it read as deliberate.',
  },
  'graphic-noir': {
    look_name_he: 'Graphic Noir', look_name_en: 'Graphic Noir', duration_minutes: 28,
    steps: [
      { area: 'skin', technique: 'base', instruction_he: 'עור אחיד לגמרי — גרפיקה דורשת רקע נקי', instruction_en: 'Completely even skin — graphic work needs a clean ground', shade_hex: '#DDB89B',
        ref: 'Estée Lauder Double Wear', alt: 'L’Oréal Infaillible 32H Matte Cover' },
      { area: 'eyes', technique: 'liner', instruction_he: 'קו כפול: קו ריסים חד ומתיחה שנייה מעל הקמט', instruction_en: 'A double line: a sharp lash line and a second wing above the crease', shade_hex: '#0E0C0C',
        ref: 'Stila Stay All Day Liquid Liner · Intense Black', alt: 'NYX Epic Ink Liner' },
      { area: 'eyes', technique: 'lashes', instruction_he: 'ריסים מלאים או ריסים מלאכותיים', instruction_en: 'Full lashes, or falsies', shade_hex: '#0E0C0C',
        ref: 'Too Faced Better Than Sex + Ardell Wispies', alt: 'Maybelline Lash Sensational Sky High' },
      { area: 'brows', technique: 'brow', instruction_he: 'גבות חזקות ומוגדרות', instruction_en: 'Strong, defined brows', shade_hex: '#3A2A20',
        ref: 'Anastasia Beverly Hills Dipbrow Pomade', alt: 'Catrice Brow Definer' },
      { area: 'lips', technique: 'lipstick', finish: 'matte', instruction_he: 'ניוד מאט — העין היא כל הסיפור', instruction_en: 'A matte nude — the eye is the entire story', shade_hex: '#B08476',
        ref: 'MAC Matte Lipstick · Honeylove', alt: 'NYX Soft Matte Lip Cream · Stockholm' },
      { area: 'highlight', technique: 'highlight', finish: 'shimmer', instruction_he: 'היילייטר קר על עצם הלחי', instruction_en: 'A cool highlighter on the cheekbone', shade_hex: '#EFE0D2',
        ref: 'Fenty Beauty Killawatt · Lightning Dust', alt: 'Essence Glow Like Highlighter' },
    ],
    trend_he: 'Double Cat-Eye — הקו הגרפי של F/W 26-27',
    trend_en: 'The double cat-eye — the graphic line of F/W 26-27',
    tip_he: 'לצייר את שני הקווים בעיניים פקוחות, מול המראה בגובה העיניים.',
    tip_en: 'Draw both lines with the eyes open, mirror at eye level.',
  },
  editorial: {
    look_name_he: 'Editorial', look_name_en: 'Editorial', duration_minutes: 35,
    steps: [
      { area: 'eyes', technique: 'liner', instruction_he: 'Double cat-eye — שני קווים מקבילים, או מתפצלים לכיוונים שונים', instruction_en: 'Double cat-eye — two parallel wings, or two splitting in different directions', shade_hex: '#14110F',
        ref: 'Stila Stay All Day Liquid Liner', alt: 'NYX Epic Ink Liner' },
      { area: 'eyes', technique: 'shadow', finish: 'shimmer', instruction_he: 'לחלופין: מונוכרום — צבע רווי אחד על עפעף, לחי ושפה', instruction_en: 'Alternatively: monochrome — one saturated colour across lid, cheek and lip', shade_hex: '#B9A3C4',
        ref: 'NARS Single Eyeshadow · Bagatelle', alt: 'Essence The Purple Edition Palette' },
      { area: 'skin', technique: 'base', finish: 'shimmer', instruction_he: 'עור זוהר עם ברק רב-גוני על נקודות הגובה', instruction_en: 'Luminous skin with multi-tonal shine on the high points', shade_hex: '#E8D5C0',
        ref: 'Charlotte Tilbury Hollywood Flawless Filter', alt: 'L’Oréal Lumi Glotion' },
      { area: 'lips', technique: 'lipstick', finish: 'glossy', instruction_he: 'לפי הקונספט — או שקוף לגמרי או רווי לגמרי', instruction_en: 'By concept — either fully sheer or fully saturated', shade_hex: '#C2317C',
        ref: 'Fenty Beauty Stunna Lip Paint · Unlocked', alt: 'NYX Soft Matte Lip Cream · Prague' },
    ],
    trend_he: 'Double Cat-Eye · Monochromatic Face · Cosmic Highlighter',
    trend_en: 'Double cat-eye · monochromatic face · cosmic highlighter',
    tip_he: 'לוק עורכי דורש עור מוכן — זה השלב שאסור לדלג עליו.',
    tip_en: 'An editorial look rests on prepared skin — that is the step never to skip.',
  },
  grooming: {
    look_name_he: 'Grooming', look_name_en: 'Grooming', duration_minutes: 12,
    steps: [
      { area: 'beard', instruction_he: 'בפורמליות 4+ — זקן קצר ומסודר או גילוח נקי. קו חד בלחי ובצוואר.', instruction_en: 'At formality 4+ — short tidy beard or a clean shave. Sharp cheek and neck lines.', shade_hex: '#3D3733' },
      { area: 'hair', instruction_he: 'מוצר מאט, לא ג׳ל מבריק', instruction_en: 'Matte product, never shiny gel', shade_hex: '#2E2723' },
      { area: 'skin', instruction_he: 'ניקוי + לחות. מסכה 24 שעות לפני אירוע, לא באותו יום.', instruction_en: 'Cleanse and moisturise. Mask 24 hours before an event, never the same day.', shade_hex: '#D8C7AE' },
      { area: 'nails', instruction_he: 'ציפורניים קצרות ונקיות — זה נראה בכל לחיצת יד', instruction_en: 'Short, clean nails — visible in every handshake', shade_hex: '#E8D5C0' },
      { area: 'fragrance', instruction_he: 'יום: הדרים/ארומטי. ערב: עצי/אוריינטלי. שני ריסוסים על הדופק, לא על הבגד.', instruction_en: 'Day: citrus or aromatic. Evening: woody or oriental. Two sprays on the pulse points, never on fabric.', shade_hex: '#6B4F3F' },
    ],
    trend_he: 'טיפוח מדויק — הבסיס שכל לוק גברי נשען עליו',
    trend_en: 'Precise grooming — the base every menswear look rests on',
    tip_he: 'גילוח בערב לפני אירוע בוקר — לעור יש זמן להירגע.',
    tip_en: 'Shave the evening before a morning event — the skin has time to settle.',
  },
};

/* Areas that only apply to one presentation. Someone who set their profile to
   women should not be offered a beard track, and should not have to scroll
   past one inside a look either. */
const AREA_FOR = { beard: ['men', 'non-binary'] };

const areaApplies = (area, presentation) => {
  const allowed = AREA_FOR[(area || '').toLowerCase()];
  return !allowed || allowed.includes(presentation);
};

const visibleSteps = (look, presentation) =>
  (look?.steps || []).filter(s => areaApplies(s.area, presentation));

export function renderBeauty(root, ctx) {
  const fromLook = ctx.opts?.look || null;
  const presentation = state.profile.gender_presentation || 'women';
  const isMen = presentation === 'men';
  // The grooming track is a beard-and-shave routine; it has no place in a
  // menu for someone who told us they don't want one.
  const looks = BEAUTY_LOOKS.filter(b => b.key !== 'grooming' || presentation !== 'women');
  const suggested = fromLook?.makeup_look
    || (state.request.occasion ? OCCASION_BEAUTY[state.request.occasion] : null)
    || (isMen ? 'grooming' : 'soft-definition');

  const host = el('div', { class: 'stack g5' });

  const cards = el('div', { class: 'stack g3 stagger' },
    looks.map(b => el('button', {
      class: `beauty-card ${state.beauty?.look_key === b.key ? 'is-on' : ''}`,
      style: { '--bloom': b.bloom, textAlign: 'start' },
      onclick: () => run(b.key),
    },
      el('div', { class: 'row between g3' },
        el('div', {},
          el('div', { class: 'eyebrow', text: b.key === suggested ? (isHe() ? '★ מומלץ' : '★ Suggested') : '' }),
          el('div', { class: 'serif-xl', style: { fontSize: 'var(--t-lg)' }, text: t(b.tKey) }),
          el('div', { class: 'micro muted', style: { marginTop: '3px' }, text: t(b.dKey) }),
        ),
        el('span', { html: icon(b.key === 'grooming' ? 'user' : 'lipstick'), style: { width: '22px', color: 'var(--ink-3)' } }),
      ),
    )),
  );

  const autoBtn = el('button', {
    class: 'btn btn-lux btn-block',
    html: icon('sparkles') + `<span>${esc(t('bt_auto'))}</span>`,
    onclick: () => run(suggested),
  });

  root.replaceChildren(
    el('div', { class: 'pad stack g5', style: { paddingTop: 'var(--s4)' } },
      el('div', {},
        el('h1', { style: { fontSize: 'var(--t-2xl)' }, text: t('beauty') }),
        el('p', { class: 'tiny muted', style: { marginTop: '6px' }, text: t('beauty_sub') }),
      ),
      fromLook ? el('div', { class: 'card card-flat row g2', style: { alignItems: 'center' } },
        el('span', { html: icon('palette'), style: { width: '20px', color: 'var(--oxblood)' } }),
        el('div', { class: 'grow tiny', text: pick(fromLook, 'title') }),
        el('div', { class: 'palette' },
          (fromLook.palette || []).slice(0, 3).map(c =>
            el('span', { class: 'swatch', style: { width: '22px', height: '22px', background: c.hex || '#ccc' } }))),
      ) : null,
      el('div', { class: 'eyebrow', text: t('bt_pick') }),
      autoBtn,
      cards,
      host,
    ),
  );
  observeReveal(root);

  if (state.beauty) paint(state.beauty);

  async function run(key) {
    buzz();
    [...cards.children].forEach(n => n.classList.remove('is-on'));
    cards.children[looks.findIndex(b => b.key === key)]?.classList.add('is-on');

    host.replaceChildren(skeleton());

    const payload = {
      profile: state.profile,
      occasion: state.request.occasion ? occName(state.request.occasion) : null,
      time_of_day: state.request.time,
      palette: fromLook?.palette || null,
      look_key: key,
      // When the owner has mapped their own face, every step gets tailored to it.
      face: state.face?.face || null,
    };

    try {
      const data = hasKey() ? await beautyLook(payload) : localLook(key);
      state.beauty = data;
      paint(data);
      const r = host.getBoundingClientRect();
      sparkle(r.left + r.width / 2, r.top + 40, 12);
    } catch (e) {
      toast(errText(e), 'warn');
      const data = localLook(key);
      state.beauty = data;
      paint(data);
    }
  }

  function paint(d) {
    const steps = visibleSteps(d, presentation);
    host.replaceChildren(...[
      simulationBlock({ ...d, steps }, ctx),
      faceCard(),
      el('article', { class: 'look-card' },
        el('div', { class: 'look-head' },
          el('div', { class: 'eyebrow', text: '✦ ' + (isHe() ? 'הלוק שנבחר' : 'Selected look') }),
          el('h2', { class: 'look-title', text: pick(d, 'look_name') }),
          d.duration_minutes ? el('div', { class: 'row g2', style: { marginTop: '8px' } },
            el('span', { html: icon('clock'), style: { width: '15px', color: 'var(--ink-3)' } }),
            el('span', { class: 'tiny muted', text: `${t('bt_time')}: ${d.duration_minutes} ${t('minutes')}` }),
          ) : null,
        ),
        el('div', { class: 'look-slots' },
          steps.map(s => el('div', { class: 'slot' },
            el('span', { class: 'shade-dot', style: { background: s.shade_hex || 'var(--cloud-3)' } }),
            el('div', { class: 'grow' },
              el('div', { class: 'slot-role', text: s.area }),
              el('div', { class: 'slot-name', style: { fontWeight: 500 }, text: pick(s, 'instruction') }),
              pick(s, 'shade') || pick(s, 'product_type')
                ? el('div', { class: 'slot-why', text: [pick(s, 'product_type'), pick(s, 'shade')].filter(Boolean).join(' · ') })
                : null,
              // The shopping list. A hex tells the simulation what to paint; a
              // name is what you can actually ask for at a counter, and it is
              // how the trade talks about a shade in the first place.
              s.ref ? el('div', { class: 'slot-why', style: { marginTop: '3px' } },
                el('b', { style: { color: 'var(--ink-2)' }, text: s.ref }),
                s.alt ? el('span', { text: ` · ${t('step_alt')}: ${s.alt}` }) : null,
              ) : null,
            ),
          ))),
        steps.some(x => x.ref) ? el('p', { class: 'micro muted', style: { marginTop: 'var(--s3)' },
          text: t('products_note') }) : null,
        pick(d, 'trend_note') ? el('div', { class: 'look-note' },
          el('span', { class: 'note-label', text: t('bt_trend') }),
          el('div', { class: 'tiny', text: pick(d, 'trend_note') })) : null,
        pick(d, 'longevity_tip') ? el('div', { class: 'look-note' },
          el('span', { class: 'note-label', text: t('bt_tip') }),
          el('div', { class: 'tiny', text: pick(d, 'longevity_tip') })) : null,

        /* The brief belongs to the look, not to the simulation.
           It used to live inside the simulation block, which only renders when
           there is a usable face map — so a photo the detector could not read
           took the makeup brief down with it, and the brief is the part that
           actually produces a good picture. It needs the look and, at most, a
           photograph; it never needed the region map. */
        el('div', { class: 'stack g2', style: { marginTop: 'var(--s4)' } },
          state.lastLook ? el('button', {
            class: 'btn btn-primary btn-block btn-sm',
            html: icon('sparkles') + `<span>${esc(t('brief_full_open'))}</span>`,
            onclick: () => openFullBrief(state.lastLook, { makeup: d, intensity: 1 }),
          }) : null,
          el('button', {
            class: state.lastLook ? 'btn btn-quiet btn-block btn-sm' : 'btn btn-primary btn-block btn-sm',
            html: icon('sparkles') + `<span>${esc(t('brief_makeup_open'))}</span>`,
            onclick: () => openMakeupBrief(d, { intensity: 1 }),
          }),
        ),
      ),
    ].filter(Boolean));
    observeReveal(host);
  }
}

/* ============================================================
   The simulation — paints the look onto the owner's own photo
   ============================================================ */
function simulationBlock(look, ctx) {
  const rec = state.face;

  if (!rec?.photo || !rec.regions) {
    return el('div', { class: 'card center stack g3' },
      el('div', { html: icon('user'), style: { width: '40px', margin: '0 auto', color: 'var(--ink-4)' } }),
      el('div', { class: 'tiny muted', text: t('sim_need_face') }),
      el('button', {
        class: 'btn btn-primary btn-sm', style: { margin: '0 auto' },
        html: icon('camera') + `<span>${esc(t('sim_open_capture'))}</span>`,
        onclick: () => ctx.go('capture', { mode: 'face' }),
      }),
    );
  }

  const before = el('img', { src: rec.photo, alt: t('sim_before') });
  const canvas = el('canvas', { 'aria-label': t('sim_after') });
  const stage = el('div', { class: 'sim-stage' },
    before,
    canvas,
    el('span', { class: 'sim-tag sim-tag-a', text: t('sim_after') }),
    el('span', { class: 'sim-tag sim-tag-b', text: t('sim_before') }),
    el('span', { class: 'sim-divider' }),
    el('input', {
      class: 'sim-range', type: 'range', min: '0', max: '100', value: '62',
      'aria-label': `${t('sim_before')} / ${t('sim_after')}`,
      oninput: (e) => stage.style.setProperty('--split', e.target.value + '%'),
    }),
  );

  let intensity = 1;
  const intensityRange = el('input', {
    class: 'slider', type: 'range', min: '0', max: '150', value: '100',
    'aria-label': t('sim_intensity'),
    oninput: (e) => { intensity = +e.target.value / 100; scheduleDraw(); },
  });

  let intensityForBrief = () => intensity;
  let photoEl = null;

  // A drag fires `input` far faster than a full repaint of the face, and every
  // event but the last one is already stale by the time it is drawn. One
  // render per frame, on the newest value.
  let queued = 0;
  function scheduleDraw() {
    if (queued) return;
    queued = requestAnimationFrame(() => { queued = 0; draw(); });
  }

  async function draw() {
    try {
      photoEl ||= await loadImage(rec.photo);
      const n = renderMakeup(canvas, photoEl, rec.regions, look.steps || [], { intensity });
      if (!n) canvas.getContext('2d').drawImage(photoEl, 0, 0, canvas.width, canvas.height);
    } catch {
      toast(t('err_generic'), 'warn');
    }
  }
  draw();

  return el('div', { class: 'stack g3' },
    el('div', { class: 'row between g2' },
      el('span', { class: 'eyebrow', text: t('sim_title') }),
      el('button', {
        class: 'btn btn-quiet btn-sm tiny', html: icon('download'),
        'aria-label': t('p_export'),
        onclick: () => {
          downloadCanvas(canvas, `vestra-makeup-${Date.now()}.png`);
          buzz(12);
        },
      }),
    ),
    stage,
    el('div', {},
      el('div', { class: 'label', text: t('sim_intensity') }),
      intensityRange,
    ),
    el('p', { class: 'micro muted', style: { margin: 0 }, text: t('sim_disclaimer') }),
    // The same two briefs as under the look, but carrying the intensity the
    // slider is actually showing.
    state.lastLook ? el('button', {
      class: 'btn btn-primary btn-block btn-sm',
      html: icon('sparkles') + `<span>${esc(t('brief_full_open'))}</span>`,
      onclick: () => openFullBrief(state.lastLook, { makeup: look, intensity: intensityForBrief() }),
    }) : null,
    el('button', {
      class: state.lastLook ? 'btn btn-quiet btn-block btn-sm' : 'btn btn-ghost btn-block btn-sm',
      style: state.lastLook ? { marginTop: 'var(--s2)' } : null,
      html: icon('sparkles') + `<span>${esc(t('brief_makeup_open'))}</span>`,
      onclick: () => openMakeupBrief(look, { intensity: intensityForBrief() }),
    }),
    // The detector places the anchors well or says it cannot. It has no way to
    // place them *badly and know it*, so the judgement of whether the makeup
    // landed belongs to whoever is looking at their own face.
    el('button', {
      class: 'btn btn-quiet btn-block btn-sm tiny',
      html: icon('user') + `<span>${esc(t('anchor_fix'))}</span>`,
      onclick: () => ctx.go('anchors'),
    }),
  );
}

/* The face analysis itself, once it exists. */
function faceCard() {
  const f = state.face?.face;
  if (!f) return null;

  const row = (label, value) => value
    ? el('div', { class: 'kv' }, el('dt', { text: label }), el('dd', { text: value }))
    : null;

  return el('section', { class: 'card' },
    el('div', { class: 'row between g2', style: { marginBottom: 'var(--s3)' } },
      el('div', { class: 'eyebrow', text: t('face_analysis') }),
      // Say which engine read the face — an on-device map is a good estimate,
      // not the same thing as Claude looking at the photo.
      state.face?.engine === 'local' ? el('span', { class: 'tag', text: t('on_device_tag') }) : null,
    ),
    el('dl', { style: { margin: 0 } },
      row(t('f_face_shape'), f.shape),
      row(t('p_undertone'), f.skin_undertone),
      row(t('p_depth'), f.skin_depth),
      row(t('f_contrast'), f.contrast),
      row(t('f_eye_shape'), f.eye_shape),
      row(t('f_lip'), f.lip_fullness),
    ),
    pick(f, 'apply') ? el('div', { class: 'alert alert-ok', style: { marginTop: 'var(--s4)' } },
      el('span', { html: icon('sparkles') }),
      el('div', { class: 'grow' },
        el('b', { text: t('f_apply') }),
        el('div', { style: { marginTop: '3px' }, text: pick(f, 'apply') }),
      ),
    ) : null,
  );
}

/* ---------------- Local reference look ---------------- */
/**
 * The makeup the app would suggest for an outfit, without opening the beauty
 * screen — so a look's brief can carry its face as well as its clothes.
 */
export function makeupForLook(look) {
  const key = look?.makeup_look
    || (state.request?.occasion ? OCCASION_BEAUTY[state.request.occasion] : null)
    || 'soft-definition';
  return localLook(key);
}

function localLook(key) {
  const src = LOCAL[key] || LOCAL['soft-definition'];
  return {
    look_key: key,
    look_name_he: src.look_name_he, look_name_en: src.look_name_en,
    duration_minutes: src.duration_minutes,
    steps: src.steps.map(s => ({
      area: s.area,
      technique: s.technique || null,
      finish: s.finish || null,
      instruction_he: s.instruction_he, instruction_en: s.instruction_en,
      product_type_he: '', product_type_en: '',
      shade_he: '', shade_en: '', shade_hex: s.shade_hex,
      ref: s.ref || null, alt: s.alt || null,
    })),
    trend_note_he: src.trend_he, trend_note_en: src.trend_en,
    longevity_tip_he: src.tip_he, longevity_tip_en: src.tip_en,
    engine: 'local',
  };
}

const skeleton = () => el('div', { class: 'stack g2' },
  el('div', { class: 'skeleton', style: { height: '92px' } }),
  el('div', { class: 'skeleton', style: { height: '58px' } }),
  el('div', { class: 'skeleton', style: { height: '58px' } }),
);
