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
import { openMakeupBrief } from './brief.js';
import { BEAUTY_LOOKS, OCCASION_BEAUTY, OCCASIONS, occName, lbl } from '../taxonomy.js';

/* Offline reference looks — SKILL.md Module 7.2 / 7.3 */
const LOCAL = {
  'no-makeup': {
    look_name_he: 'No-Makeup', look_name_en: 'No-Makeup', duration_minutes: 5,
    steps: [
      { area: 'skin', technique: 'base', finish: 'natural', instruction_he: 'סקין-טינט דק בשכבה אחת, קונסילר נקודתי בלבד', instruction_en: 'A single thin layer of skin tint, concealer only where needed', shade_hex: '#E8CBB4' },
      { area: 'brows', technique: 'brow', instruction_he: 'ג׳ל גבות שקוף — לסרק כלפי מעלה', instruction_en: 'Clear brow gel, brushed upward', shade_hex: '#6B4F3F' },
      { area: 'cheeks', technique: 'blush', instruction_he: 'קרם-בלאש אפרסק, לטפוח באצבע', instruction_en: 'Cream blush in peach, pressed in with a finger', shade_hex: '#E8A183' },
      { area: 'eyes', technique: 'lashes', instruction_he: 'מסקרה חומה, שכבה אחת', instruction_en: 'Brown mascara, one coat', shade_hex: '#4A3228' },
      { area: 'lips', technique: 'lipstick', finish: 'satin', instruction_he: 'באלם עם גוון', instruction_en: 'Tinted balm', shade_hex: '#C98C86' },
    ],
    trend_he: 'עור נקי וזוהר — הכיוון של Cloud Dancer 2026',
    trend_en: 'Clean luminous skin — the Cloud Dancer 2026 direction',
    tip_he: 'פריימר מרטיב לפני הכל — זה מה שמחזיק את הלוק הזה כל היום.',
    tip_en: 'A hydrating primer first — that is what carries this look all day.',
  },
  'soft-definition': {
    look_name_he: 'Soft Definition', look_name_en: 'Soft Definition', duration_minutes: 10,
    steps: [
      { area: 'skin', technique: 'base', instruction_he: 'פאונדיישן בכיסוי בינוני, פודרה רק ב-T', instruction_en: 'Medium-coverage foundation, powder on the T-zone only', shade_hex: '#E3C3A8' },
      { area: 'eyes', technique: 'shadow', instruction_he: 'צללית ניוד על כל העפעף', instruction_en: 'Nude shadow across the lid', shade_hex: '#8A6A55' },
      { area: 'eyes', technique: 'liner', instruction_he: 'אייליינר חום דק בקו הריסים', instruction_en: 'A thin brown liner along the lash line', shade_hex: '#5A3E2E' },
      { area: 'eyes', technique: 'lashes', instruction_he: 'מסקרה שחורה, שתי שכבות', instruction_en: 'Black mascara, two coats', shade_hex: '#14110F' },
      { area: 'cheeks', technique: 'blush', finish: 'satin', instruction_he: 'בלאש ורוד על תפוח הלחי', instruction_en: 'Pink blush on the apple of the cheek', shade_hex: '#D98F9E' },
      { area: 'highlight', technique: 'highlight', finish: 'shimmer', instruction_he: 'היילייטר עדין על עצם הלחי', instruction_en: 'A soft highlighter along the cheekbone', shade_hex: '#F3DCC4' },
      { area: 'lips', technique: 'lipstick', finish: 'matte', instruction_he: 'ורוד-חום מאט', instruction_en: 'Matte rose-brown', shade_hex: '#A9695E' },
    ],
    trend_he: 'הגדרה רכה — מספיק למצלמה, לא יותר מדי לפגישה',
    trend_en: 'Soft definition — enough for camera, not too much for a meeting',
    tip_he: 'ספריי קיבוע בסוף במרחק 30 ס״מ.',
    tip_en: 'Finish with setting spray from about 30 cm away.',
  },
  'soft-evening': {
    look_name_he: 'Soft Evening', look_name_en: 'Soft Evening', duration_minutes: 18,
    steps: [
      { area: 'skin', technique: 'base', instruction_he: 'כיסוי בינוני-מלא עם גימור סטין', instruction_en: 'Medium-to-full coverage with a satin finish', shade_hex: '#DFBB9F' },
      { area: 'eyes', technique: 'shadow', instruction_he: 'צלליות חמות בקמט', instruction_en: 'Warm shadow through the crease', shade_hex: '#6B4536' },
      { area: 'eyes', technique: 'liner', instruction_he: 'אייליינר מרוח בכוונה (smudged)', instruction_en: 'Deliberately smudged liner', shade_hex: '#2A1E18' },
      { area: 'eyes', technique: 'lashes', instruction_he: 'ריסים — שכבה כפולה או ריסי פינה', instruction_en: 'Lashes — double coat or corner lashes', shade_hex: '#14110F' },
      { area: 'cheeks', technique: 'blush', instruction_he: 'בלאש חם על תפוח הלחי', instruction_en: 'A warm blush on the apple of the cheek', shade_hex: '#B57A63' },
      { area: 'contour', technique: 'contour', instruction_he: 'קונטור עדין מתחת לעצם הלחי', instruction_en: 'A soft contour under the cheekbone', shade_hex: '#8A6249' },
      { area: 'lips', technique: 'lipstick', finish: 'satin', instruction_he: 'חום-אדמדם או רוז׳ עמוק', instruction_en: 'Red-brown or a deep rose', shade_hex: '#8E4438' },
    ],
    trend_he: 'Deliberate Imperfection — הכיוון המרכזי של F/W 26-27',
    trend_en: 'Deliberate imperfection — the defining mood of F/W 26-27',
    tip_he: 'לטפוח פודרה שקופה על השפתון בין שתי שכבות.',
    tip_en: 'Press translucent powder between two coats of lipstick.',
  },
  statement: {
    look_name_he: 'Statement', look_name_en: 'Statement', duration_minutes: 25,
    steps: [
      { area: 'skin', technique: 'base', instruction_he: 'כיסוי מלא, מקובע בפודרה ובספריי', instruction_en: 'Full coverage, set with powder and spray', shade_hex: '#DDB89B' },
      { area: 'lips', technique: 'lipstick', finish: 'satin', instruction_he: 'Oxblood — אדום עמוק עם אנדרטון חום-סגול. עיפרון בקו ואז מילוי.', instruction_en: 'Oxblood — deep red with a brown-purple undertone. Line first, then fill.', shade_hex: '#6E1F28' },
      { area: 'eyes', technique: 'shadow', instruction_he: 'כאן בוחרים אחד: אם השפה כהה — העין נשארת שקטה (ניוד + מסקרה).', instruction_en: 'Pick one: with a dark lip the eye stays quiet — nude shadow and mascara.', shade_hex: '#9C8574' },
      { area: 'contour', technique: 'contour', instruction_he: 'קונטור מתחת לעצם הלחי', instruction_en: 'Contour under the cheekbone', shade_hex: '#8C6046' },
      { area: 'highlight', technique: 'highlight', finish: 'shimmer', instruction_he: 'היילייטר קוסמי רב-גוני על עצם הלחי', instruction_en: 'A multi-tonal cosmic highlighter on the bone', shade_hex: '#C6A667' },
      { area: 'brows', technique: 'brow', instruction_he: 'גבות מלאות ומוגדרות', instruction_en: 'Full, defined brows', shade_hex: '#4A3228' },
    ],
    trend_he: 'Oxblood Lip — סיפור השפתיים של העונה (Saint Laurent, Elie Saab, Carven)',
    trend_en: 'The oxblood lip — the season\'s lip story (Saint Laurent, Elie Saab, Carven)',
    tip_he: 'עין דרמטית או שפה דרמטית — לא שתיהן.',
    tip_en: 'Dramatic eye or dramatic lip — never both.',
  },
  editorial: {
    look_name_he: 'Editorial', look_name_en: 'Editorial', duration_minutes: 35,
    steps: [
      { area: 'eyes', technique: 'liner', instruction_he: 'Double cat-eye — שני קווים מקבילים, או מתפצלים לכיוונים שונים', instruction_en: 'Double cat-eye — two parallel wings, or two splitting in different directions', shade_hex: '#14110F' },
      { area: 'eyes', technique: 'shadow', finish: 'shimmer', instruction_he: 'לחלופין: מונוכרום — צבע רווי אחד על עפעף, לחי ושפה', instruction_en: 'Alternatively: monochrome — one saturated colour across lid, cheek and lip', shade_hex: '#B9A3C4' },
      { area: 'skin', technique: 'base', finish: 'shimmer', instruction_he: 'עור זוהר עם ברק רב-גוני על נקודות הגובה', instruction_en: 'Luminous skin with multi-tonal shine on the high points', shade_hex: '#E8D5C0' },
      { area: 'lips', technique: 'lipstick', finish: 'glossy', instruction_he: 'לפי הקונספט — או שקוף לגמרי או רווי לגמרי', instruction_en: 'By concept — either fully sheer or fully saturated', shade_hex: '#C2317C' },
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
    el('button', {
      class: 'btn btn-ghost btn-block btn-sm',
      html: icon('sparkles') + `<span>${esc(t('brief_open'))}</span>`,
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
