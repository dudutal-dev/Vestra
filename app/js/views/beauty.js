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
import { BEAUTY_LOOKS, OCCASION_BEAUTY, OCCASIONS, occName, lbl } from '../taxonomy.js';

/* Offline reference looks — SKILL.md Module 7.2 / 7.3 */
const LOCAL = {
  'no-makeup': {
    look_name_he: 'No-Makeup', look_name_en: 'No-Makeup', duration_minutes: 5,
    steps: [
      { area: 'skin', instruction_he: 'סקין-טינט דק בשכבה אחת, קונסילר נקודתי בלבד', instruction_en: 'A single thin layer of skin tint, concealer only where needed', shade_hex: '#E8CBB4' },
      { area: 'brows', instruction_he: 'ג׳ל גבות שקוף — לסרק כלפי מעלה', instruction_en: 'Clear brow gel, brushed upward', shade_hex: '#6B4F3F' },
      { area: 'cheeks', instruction_he: 'קרם-בלאש אפרסק, לטפוח באצבע', instruction_en: 'Cream blush in peach, pressed in with a finger', shade_hex: '#E8A183' },
      { area: 'eyes', instruction_he: 'מסקרה חומה, שכבה אחת', instruction_en: 'Brown mascara, one coat', shade_hex: '#4A3228' },
      { area: 'lips', instruction_he: 'באלם עם גוון', instruction_en: 'Tinted balm', shade_hex: '#C98C86' },
    ],
    trend_he: 'עור נקי וזוהר — הכיוון של Cloud Dancer 2026',
    trend_en: 'Clean luminous skin — the Cloud Dancer 2026 direction',
    tip_he: 'פריימר מרטיב לפני הכל — זה מה שמחזיק את הלוק הזה כל היום.',
    tip_en: 'A hydrating primer first — that is what carries this look all day.',
  },
  'soft-definition': {
    look_name_he: 'Soft Definition', look_name_en: 'Soft Definition', duration_minutes: 10,
    steps: [
      { area: 'skin', instruction_he: 'פאונדיישן בכיסוי בינוני, פודרה רק ב-T', instruction_en: 'Medium-coverage foundation, powder on the T-zone only', shade_hex: '#E3C3A8' },
      { area: 'eyes', instruction_he: 'צללית ניוד על כל העפעף, אייליינר חום דק בקו הריסים', instruction_en: 'Nude shadow across the lid, thin brown liner along the lashline', shade_hex: '#8A6A55' },
      { area: 'eyes', instruction_he: 'מסקרה שחורה, שתי שכבות', instruction_en: 'Black mascara, two coats', shade_hex: '#14110F' },
      { area: 'cheeks', instruction_he: 'בלאש ורוד + היילייטר עדין על עצם הלחי', instruction_en: 'Pink blush plus a soft highlighter on the cheekbone', shade_hex: '#D98F9E' },
      { area: 'lips', instruction_he: 'ורוד-חום מאט', instruction_en: 'Matte rose-brown', shade_hex: '#A9695E' },
    ],
    trend_he: 'הגדרה רכה — מספיק למצלמה, לא יותר מדי לפגישה',
    trend_en: 'Soft definition — enough for camera, not too much for a meeting',
    tip_he: 'ספריי קיבוע בסוף במרחק 30 ס״מ.',
    tip_en: 'Finish with setting spray from about 30 cm away.',
  },
  'soft-evening': {
    look_name_he: 'Soft Evening', look_name_en: 'Soft Evening', duration_minutes: 18,
    steps: [
      { area: 'skin', instruction_he: 'כיסוי בינוני-מלא עם גימור סטין', instruction_en: 'Medium-to-full coverage with a satin finish', shade_hex: '#DFBB9F' },
      { area: 'eyes', instruction_he: 'אייליינר מרוח בכוונה (smudged) + צלליות חמות בקמט', instruction_en: 'Deliberately smudged liner plus warm shadow in the crease', shade_hex: '#6B4536' },
      { area: 'eyes', instruction_he: 'ריסים — שכבה כפולה או ריסי פינה', instruction_en: 'Lashes — double coat or corner lashes', shade_hex: '#14110F' },
      { area: 'cheeks', instruction_he: 'קונטור עדין מתחת לעצם + בלאש חם', instruction_en: 'Soft contour under the bone plus a warm blush', shade_hex: '#B57A63' },
      { area: 'lips', instruction_he: 'חום-אדמדם או רוז׳ עמוק', instruction_en: 'Red-brown or a deep rose', shade_hex: '#8E4438' },
    ],
    trend_he: 'Deliberate Imperfection — הכיוון המרכזי של F/W 26-27',
    trend_en: 'Deliberate imperfection — the defining mood of F/W 26-27',
    tip_he: 'לטפוח פודרה שקופה על השפתון בין שתי שכבות.',
    tip_en: 'Press translucent powder between two coats of lipstick.',
  },
  statement: {
    look_name_he: 'Statement', look_name_en: 'Statement', duration_minutes: 25,
    steps: [
      { area: 'skin', instruction_he: 'כיסוי מלא, מקובע בפודרה ובספריי', instruction_en: 'Full coverage, set with powder and spray', shade_hex: '#DDB89B' },
      { area: 'lips', instruction_he: 'Oxblood — אדום עמוק עם אנדרטון חום-סגול. עיפרון בקו ואז מילוי.', instruction_en: 'Oxblood — deep red with a brown-purple undertone. Line first, then fill.', shade_hex: '#6E1F28' },
      { area: 'eyes', instruction_he: 'כאן בוחרים אחד: אם השפה כהה — העין נשארת שקטה (ניוד + מסקרה).', instruction_en: 'Pick one: with a dark lip the eye stays quiet — nude shadow and mascara.', shade_hex: '#9C8574' },
      { area: 'cheeks', instruction_he: 'קונטור + היילייטר קוסמי רב-גוני', instruction_en: 'Contour plus a multi-tonal cosmic highlighter', shade_hex: '#C6A667' },
      { area: 'brows', instruction_he: 'גבות מלאות ומוגדרות', instruction_en: 'Full, defined brows', shade_hex: '#4A3228' },
    ],
    trend_he: 'Oxblood Lip — סיפור השפתיים של העונה (Saint Laurent, Elie Saab, Carven)',
    trend_en: 'The oxblood lip — the season\'s lip story (Saint Laurent, Elie Saab, Carven)',
    tip_he: 'עין דרמטית או שפה דרמטית — לא שתיהן.',
    tip_en: 'Dramatic eye or dramatic lip — never both.',
  },
  editorial: {
    look_name_he: 'Editorial', look_name_en: 'Editorial', duration_minutes: 35,
    steps: [
      { area: 'eyes', instruction_he: 'Double cat-eye — שני קווים מקבילים, או מתפצלים לכיוונים שונים', instruction_en: 'Double cat-eye — two parallel wings, or two splitting in different directions', shade_hex: '#14110F' },
      { area: 'eyes', instruction_he: 'לחלופין: מונוכרום — צבע רווי אחד על עפעף, לחי ושפה', instruction_en: 'Alternatively: monochrome — one saturated colour across lid, cheek and lip', shade_hex: '#B9A3C4' },
      { area: 'skin', instruction_he: 'עור זוהר עם ברק רב-גוני על נקודות הגובה', instruction_en: 'Luminous skin with multi-tonal shine on the high points', shade_hex: '#E8D5C0' },
      { area: 'lips', instruction_he: 'לפי הקונספט — או שקוף לגמרי או רווי לגמרי', instruction_en: 'By concept — either fully sheer or fully saturated', shade_hex: '#C2317C' },
    ],
    trend_he: 'Double Cat-Eye · Monochromatic Face · Cosmic Highlighter',
    trend_en: 'Double cat-eye · monochromatic face · cosmic highlighter',
    tip_he: 'לצלם קודם — לוק אדיטוריאלי נראה אחרת במצלמה מאשר במראה.',
    tip_en: 'Photograph it first — an editorial look reads differently on camera than in the mirror.',
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

export function renderBeauty(root, ctx) {
  const fromLook = ctx.opts?.look || null;
  const isMen = state.profile.gender_presentation === 'men';
  const suggested = fromLook?.makeup_look
    || (state.request.occasion ? OCCASION_BEAUTY[state.request.occasion] : null)
    || (isMen ? 'grooming' : 'soft-definition');

  const host = el('div', { class: 'stack g5' });

  const cards = el('div', { class: 'stack g3 stagger' },
    BEAUTY_LOOKS.map(b => el('button', {
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
    cards.children[BEAUTY_LOOKS.findIndex(b => b.key === key)]?.classList.add('is-on');

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
    host.replaceChildren(...[
      simulationBlock(d, ctx),
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
          (d.steps || []).map(s => el('div', { class: 'slot' },
            el('span', { class: 'shade-dot', style: { background: s.shade_hex || 'var(--cloud-3)' } }),
            el('div', { class: 'grow' },
              el('div', { class: 'slot-role', text: s.area }),
              el('div', { class: 'slot-name', style: { fontWeight: 500 }, text: pick(s, 'instruction') }),
              pick(s, 'shade') || pick(s, 'product_type')
                ? el('div', { class: 'slot-why', text: [pick(s, 'product_type'), pick(s, 'shade')].filter(Boolean).join(' · ') })
                : null,
            ),
          ))),
        pick(d, 'trend_note') ? el('div', { class: 'look-note' },
          el('span', { class: 'note-label', text: t('bt_trend') }),
          el('div', { class: 'tiny', text: pick(d, 'trend_note') })) : null,
        pick(d, 'longevity_tip') ? el('div', { class: 'look-note' },
          el('span', { class: 'note-label', text: t('bt_tip') }),
          el('div', { class: 'tiny', text: pick(d, 'longevity_tip') })) : null,
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
    oninput: (e) => { intensity = +e.target.value / 100; draw(); },
  });

  let photoEl = null;
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
    el('div', { class: 'eyebrow', style: { marginBottom: 'var(--s3)' }, text: t('face_analysis') }),
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
function localLook(key) {
  const src = LOCAL[key] || LOCAL['soft-definition'];
  return {
    look_key: key,
    look_name_he: src.look_name_he, look_name_en: src.look_name_en,
    duration_minutes: src.duration_minutes,
    steps: src.steps.map(s => ({
      area: s.area,
      instruction_he: s.instruction_he, instruction_en: s.instruction_en,
      product_type_he: '', product_type_en: '',
      shade_he: '', shade_en: '', shade_hex: s.shade_hex,
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
