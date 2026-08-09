/* ============================================================
   VESTRA · Capture
   Four modes: a garment, the open closet, your face, your body.
   ============================================================ */

import { el, icon, esc, toast, openSheet, sparkle, buzz, $ } from '../ui.js';
import { t, isHe, pick } from '../i18n.js';
import { state, refreshItems, refreshClosets, refreshMedia } from '../state.js';
import { Items, Closets, Media, newId, hasKey, getProfile, setProfile } from '../store.js';
import {
  compressImage, catalogItem, analyzeCloset, analyzeFace, analyzeBody, errText, AIError,
} from '../ai.js';
import { analyzeFaceLocal, analyzeBodyLocal } from '../vision.js';
import {
  CATEGORIES, SUBCATS, SUBCAT_NAMES, FITS, FIT_NAMES, PATTERNS, PATTERN_NAMES,
  FABRICS, FABRIC_NAMES, FORMALITY, SEASONS, catName, subName, lbl, hexFor,
} from '../taxonomy.js';

const MODES = [
  { key: 'item',   tKey: 'mode_item' },
  { key: 'closet', tKey: 'mode_closet' },
  { key: 'face',   tKey: 'mode_face' },
  { key: 'body',   tKey: 'mode_body' },
];

/* Modes the on-device engine can handle, so an owner with no API key is not
   left holding a photo the app refuses to do anything with. Closet analysis
   has no local equivalent and says so instead. */
const OFFLINE_MODES = new Set(['face', 'body']);

const COPY = {
  item:   { sub: 'capture_sub',      hintT: 'shot_hint_t', hintS: 'shot_hint_s', cta: 'analyze',      busy: 'scanning' },
  closet: { sub: 'closet_sub',       hintT: 'shot_hint_t', hintS: 'shot_hint_s', cta: 'analyze_closet', busy: 'scanning_closet' },
  face:   { sub: 'capture_face_sub', hintT: 'shot_face_t', hintS: 'shot_face_s', cta: 'analyze_face', busy: 'scanning_face' },
  body:   { sub: 'capture_body_sub', hintT: 'shot_body_t', hintS: 'shot_body_s', cta: 'analyze_body', busy: 'scanning_body' },
};

export function renderCapture(root, ctx) {
  if (ctx.opts?.mode) state.captureMode = ctx.opts.mode;
  const mode = state.captureMode;
  const copy = COPY[mode];

  const zone = el('div', { class: 'shot-zone scan-frame' },
    el('span', { class: 'br' }),
    el('div', { class: 'shot-hint' },
      el('div', { html: icon(mode === 'face' ? 'user' : mode === 'body' ? 'hanger' : 'camera') }),
      el('b', { class: 'slot-name', text: t(copy.hintT) }),
      el('div', { class: 'tiny muted', style: { marginTop: '6px' }, text: t(copy.hintS) }),
    ),
  );

  const modeSeg = el('div', { class: 'seg' },
    MODES.map(m => el('button', {
      class: `chip ${mode === m.key ? 'is-on' : ''}`, text: t(m.tKey),
      onclick: () => { state.captureMode = m.key; state.shot = null; ctx.rerender(); },
    })),
  );

  const actions = el('div', { class: 'row g2' },
    el('button', {
      class: 'btn btn-primary grow', html: icon('camera') + `<span>${esc(t('take_photo'))}</span>`,
      onclick: () => pick('#cameraPicker', false),
    }),
    el('button', {
      class: 'btn btn-ghost grow',
      html: icon('image') + `<span>${esc(mode === 'item' ? t('upload_many') : t('pick_photo'))}</span>`,
      onclick: () => pick('#filePicker', mode === 'item'),
    }),
  );

  const analyzeBtn = el('button', {
    class: 'btn btn-lux btn-block hidden',
    html: icon('sparkles') + `<span>${esc(t(copy.cta))}</span>`,
    onclick: (e) => run(e),
  });

  const retakeBtn = el('button', {
    class: 'btn btn-quiet btn-block hidden tiny', text: t('retake'),
    onclick: () => { state.shot = null; ctx.rerender(); },
  });

  const manualBtn = mode === 'item' ? el('button', {
    class: 'btn btn-ghost btn-block', html: icon('plus') + `<span>${esc(t('manual_add'))}</span>`,
    onclick: () => openManualForm(ctx),
  }) : null;

  const privacyNote = (mode === 'face' || mode === 'body') ? el('div', { class: 'alert alert-ok' },
    el('span', { html: icon('check') }),
    // Without a key nothing is uploaded at all, and saying otherwise would be
    // both wrong and needlessly alarming.
    el('div', { text: hasKey() ? t('photos_privacy') : t('photos_privacy_local') }),
  ) : null;

  const existing = (mode === 'face' && state.face) || (mode === 'body' && state.body)
    ? existingCard(mode === 'face' ? state.face : state.body, mode, ctx)
    : null;

  const offlineHere = !hasKey() && OFFLINE_MODES.has(mode);
  const keyBanner = hasKey() ? null : el('div', { class: `alert ${offlineHere ? 'alert-ok' : 'alert-med'}` },
    el('span', { html: icon(offlineHere ? 'check' : 'key') }),
    el('div', { class: 'grow' },
      el('b', { text: offlineHere ? t('on_device_t') : t('no_key_t') }),
      el('div', { style: { marginTop: '4px' }, text: offlineHere ? t('on_device_s') : t('no_key_s') }),
      el('button', {
        class: 'btn btn-sm btn-ghost', style: { marginTop: '10px' },
        text: t('open_settings'), onclick: () => ctx.go('profile'),
      }),
    ),
  );

  root.replaceChildren(
    el('div', { class: 'pad stack g5', style: { paddingTop: 'var(--s4)' } },
      el('div', {},
        el('h1', { style: { fontSize: 'var(--t-2xl)' },
          text: mode === 'closet' ? t('closet') : mode === 'face' ? t('sim_title') : mode === 'body' ? t('tryon_title') : t('capture') }),
        el('p', { class: 'tiny muted', style: { marginTop: '6px' }, text: t(copy.sub) }),
      ),
      modeSeg,
      existing,
      zone,
      actions,
      analyzeBtn,
      retakeBtn,
      manualBtn,
      privacyNote,
      keyBanner,
    ),
  );

  if (state.shot) showShot(state.shot);

  /* ---------- file input ---------- */
  function pick(sel, multiple) {
    const input = $(sel);
    input.value = '';
    input.multiple = !!multiple;
    input.onchange = async () => {
      const files = [...(input.files || [])];
      if (!files.length) return;

      if (multiple && files.length > 1) { await runBatch(files); return; }

      try {
        const img = await compressImage(files[0]);
        state.shot = img;
        showShot(img);
      } catch {
        toast(t('err_image'), 'bad');
      }
    };
    input.click();
  }

  function showShot(img) {
    zone.classList.add('has-img');
    zone.replaceChildren(el('span', { class: 'br' }), el('img', { src: img.dataUrl, alt: '' }));
    // Face and body run on the device, so the button stays live without a key.
    analyzeBtn.classList.toggle('hidden', !hasKey() && !OFFLINE_MODES.has(mode));
    retakeBtn.classList.remove('hidden');
    if (hasKey()) return;

    if (mode === 'item') {
      toast(t('offline_mode'), 'warn');
      openManualForm(ctx, img);
    } else if (mode === 'closet') {
      toast(t('need_key_closet'), 'warn');
    }
  }

  /* ---------- batch upload ---------- */
  async function runBatch(files) {
    if (!hasKey()) { toast(t('no_key_s'), 'warn'); return; }

    const status = el('div', { class: 'scan-status' },
      el('span', { html: icon('sparkles'), style: { width: '18px' } }),
      el('span', { class: 'grow', text: '' }),
      el('span', { class: 'bar' }, el('i')),
    );
    zone.classList.add('has-img', 'scanning');
    zone.append(status);
    const label = status.children[1];

    let saved = 0, failed = 0;
    for (const [i, file] of files.entries()) {
      label.textContent = `${t('batch_progress')} ${i + 1} ${t('of')} ${files.length}`;
      try {
        const img = await compressImage(file);
        zone.replaceChildren(el('span', { class: 'br' }), el('img', { src: img.dataUrl, alt: '' }), status);
        const results = await catalogItem(img);
        for (const [idx, r] of results.entries()) {
          await persistItem(r, idx === 0 ? img.dataUrl : null);
          saved++;
        }
      } catch {
        failed++;
      }
    }

    zone.classList.remove('scanning');
    status.remove();
    await refreshItems();
    buzz(20);
    toast(failed
      ? `${saved} ${t('saved_items')} · ${failed} ✕`
      : `${saved} ${t('saved_items')}`, failed ? 'warn' : '');
    state.shot = null;
    ctx.go('wardrobe');
  }

  /* ---------- single analysis ---------- */
  async function run(evt) {
    if (!state.shot) return;
    const steps = t('scan_steps');
    let step = 0;

    zone.classList.add('scanning');
    const status = el('div', { class: 'scan-status' },
      el('span', { html: icon('sparkles'), style: { width: '18px' } }),
      el('span', { class: 'grow', text: mode === 'item' ? steps[0] : t(copy.busy) }),
      el('span', { class: 'bar' }, el('i')),
    );
    zone.append(status);
    const label = status.children[1];
    const tick = setInterval(() => {
      step = (step + 1) % steps.length;
      label.textContent = mode === 'item' ? steps[step] : t(copy.busy);
    }, 1700);

    analyzeBtn.disabled = true;
    retakeBtn.disabled = true;

    try {
      const shot = state.shot;

      if (mode === 'closet') {
        const res = await analyzeCloset(shot);
        await Closets.put({ id: newId('cls'), createdAt: Date.now(), thumb: shot.dataUrl, ...res });
        await refreshClosets();
        celebrate(evt);
        state.shot = null;
        ctx.go('closet');

      } else if (mode === 'face') {
        const res = hasKey() ? await analyzeFace(shot) : await analyzeFaceLocal(shot);
        await Media.put({
          slot: 'face', createdAt: Date.now(), photo: shot.dataUrl,
          w: shot.w, h: shot.h, face: res.face || null, regions: res.regions || null,
          engine: res.engine || 'ai',
        });
        await refreshMedia();
        syncProfileFromFace(res.face);
        celebrate(evt);
        toast(t('face_saved'));
        state.shot = null;
        ctx.go('beauty');

      } else if (mode === 'body') {
        const res = hasKey() ? await analyzeBody(shot) : await analyzeBodyLocal(shot, state.profile);
        await Media.put({
          slot: 'body', createdAt: Date.now(), photo: shot.dataUrl,
          w: shot.w, h: shot.h, body: res.body || null, regions: res.regions || null,
          engine: res.engine || 'ai',
        });
        await refreshMedia();
        syncProfileFromBody(res.body);
        celebrate(evt);
        toast(t('body_saved'));
        state.shot = null;
        ctx.go('studio');

      } else {
        const results = await catalogItem(shot);
        const saved = [];
        for (const [idx, r] of results.entries()) {
          saved.push(await persistItem(r, idx === 0 ? shot.dataUrl : null));
        }
        await refreshItems();
        celebrate(evt);
        toast(saved.length > 1 ? `${saved.length} ${t('saved_items')}` : t('saved_item'));
        state.shot = null;
        if (saved.length === 1) openReview(saved[0], ctx);
        else ctx.go('wardrobe');
      }
    } catch (e) {
      toast(errText(e), 'bad');
      if (e instanceof AIError && e.code === 'no_key') ctx.go('profile');
    } finally {
      clearInterval(tick);
      zone.classList.remove('scanning');
      status.remove();
      analyzeBtn.disabled = false;
      retakeBtn.disabled = false;
    }
  }

  function celebrate(evt) {
    buzz(18);
    const r = evt?.currentTarget?.getBoundingClientRect?.();
    if (r) sparkle(r.left + r.width / 2, r.top);
  }
}

/* ---------------- An already-analysed face/body ---------------- */
function existingCard(rec, mode, ctx) {
  const a = mode === 'face' ? rec.face : rec.body;
  return el('div', { class: 'card row g3', style: { alignItems: 'center' } },
    el('img', { src: rec.photo, alt: '',
      style: { width: '62px', height: '78px', objectFit: 'cover', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)' } }),
    el('div', { class: 'grow' },
      el('div', { class: 'eyebrow', text: mode === 'face' ? t('p_face_photo') : t('p_body_photo') }),
      el('div', { class: 'slot-name', text: a?.shape || '—' }),
      el('div', { class: 'micro muted', text: [
        rec.createdAt ? new Date(rec.createdAt).toLocaleDateString(isHe() ? 'he-IL' : 'en-GB') : null,
        rec.engine === 'local' ? t('on_device_tag') : null,
      ].filter(Boolean).join(' · ') }),
    ),
    el('button', {
      class: 'icon-btn', html: icon('trash'), 'aria-label': t('remove_photo'),
      onclick: async () => {
        await Media.remove(mode);
        await refreshMedia();
        toast(t('photo_removed'));
        ctx.rerender();
      },
    }),
  );
}

/* Fold what the analysis learned back into the styling profile, so every
   later recommendation benefits — but never overwrite a deliberate choice. */
function syncProfileFromFace(face) {
  if (!face) return;
  const p = getProfile();
  let touched = false;
  if (face.skin_undertone && p.skin_undertone === 'neutral') { p.skin_undertone = face.skin_undertone; touched = true; }
  if (face.skin_depth && p.skin_depth === 'medium') { p.skin_depth = face.skin_depth; touched = true; }
  if (touched) { setProfile(p); state.profile = p; }
}

function syncProfileFromBody(body) {
  if (!body?.shape) return;
  const p = getProfile();
  if (!p.body_shape) { p.body_shape = body.shape; setProfile(p); state.profile = p; }
}

/* ---------------- Persist an AI result ---------------- */
async function persistItem(raw, thumb) {
  const item = {
    id: newId('itm'),
    createdAt: Date.now(),
    favorite: false,
    thumb: thumb || null,
    category: raw.category || 'top',
    subcategory: raw.subcategory || null,
    name_he: raw.name_he || '', name_en: raw.name_en || '',
    color_primary: raw.color_primary || null,
    color_secondary: raw.color_secondary || [],
    pattern: raw.pattern || 'solid',
    fabric_guess: raw.fabric_guess || null,
    texture: raw.texture || null,
    season: Array.isArray(raw.season) && raw.season.length ? raw.season : ['summer', 'spring'],
    weight: raw.weight || 'mid',
    formality: Number(raw.formality) || 2,
    fit: raw.fit || 'regular',
    neckline: raw.neckline ?? null, sleeve: raw.sleeve ?? null,
    length: raw.length ?? null, rise: raw.rise ?? null,
    color_family: raw.color_family || 'neutral',
    undertone_match: raw.undertone_match || 'neutral',
    versatility_score: Number(raw.versatility_score) || 50,
    trend_status: raw.trend_status || 'timeless',
    care: raw.care || 'machine-wash',
    occasions: raw.occasions || [],
    notes_he: raw.notes_he || '', notes_en: raw.notes_en || '',
    confidence: Number(raw.confidence) || 0.8,
  };
  await Items.put(item);
  return item;
}

/* ---------------- Review a freshly catalogued item ---------------- */
function openReview(item, ctx) {
  const body = el('div', {},
    el('div', { class: 'row g3', style: { marginBottom: 'var(--s5)' } },
      item.thumb ? el('img', {
        src: item.thumb, alt: '',
        style: { width: '92px', height: '116px', objectFit: 'cover', borderRadius: 'var(--r-md)', border: '1px solid var(--line)' },
      }) : null,
      el('div', { class: 'grow' },
        el('div', { class: 'eyebrow', text: '✦ ' + catName(item.category) }),
        el('h3', { style: { marginBlock: '6px' }, text: (isHe() ? item.name_he : item.name_en) || subName(item.subcategory) }),
        el('div', { class: 'row g2' },
          el('span', { class: 'item-swatch', style: { background: hexFor(item.color_primary) } }),
          el('span', { class: 'micro muted', text: isHe() ? item.color_primary?.name_he : item.color_primary?.name_en }),
        ),
      ),
    ),
    el('div', { class: 'alert alert-ok', style: { marginBottom: 'var(--s5)' } },
      el('span', { html: icon('check') }),
      el('div', { text: t('saved_item') }),
    ),
    el('div', { class: 'row g2' },
      el('button', {
        class: 'btn btn-ghost grow', text: t('done'),
        onclick: () => { close(); ctx.go('wardrobe'); },
      }),
      el('button', {
        class: 'btn btn-primary grow',
        html: icon('camera') + `<span>${esc(t('q_add'))}</span>`,
        onclick: () => { close(); ctx.go('capture', { mode: 'item' }); },
      }),
    ),
  );
  const close = openSheet(body);
}

/* ---------------- Manual add form ---------------- */
export function openManualForm(ctx, img = null) {
  const form = { category: 'top', subcategory: 't-shirt', formality: 2, fit: 'regular',
                 pattern: 'solid', fabric_guess: 'cotton', season: ['summer'],
                 color_name: '', color_hex: '#14110F', name: '' };

  const subSelect = el('select', { class: 'select' });
  const fillSubs = () => subSelect.replaceChildren(
    ...(SUBCATS[form.category] || []).map(s =>
      el('option', { value: s, text: lbl(SUBCAT_NAMES[s]) || s })));
  fillSubs();
  subSelect.onchange = () => { form.subcategory = subSelect.value; };
  form.subcategory = (SUBCATS[form.category] || [])[0];

  const seasonChips = el('div', { class: 'seg' },
    SEASONS.map(s => el('button', {
      class: `chip ${form.season.includes(s.key) ? 'is-on' : ''}`, text: lbl(s.name),
      onclick: (e) => {
        const on = form.season.includes(s.key);
        form.season = on ? form.season.filter(x => x !== s.key) : [...form.season, s.key];
        e.currentTarget.classList.toggle('is-on', !on);
      },
    })),
  );

  const body = el('div', {},
    el('h3', { style: { marginBottom: 'var(--s5)' }, text: t('manual_add') }),

    img ? el('img', { src: img.dataUrl, alt: '',
      style: { width: '100%', maxHeight: '30svh', objectFit: 'contain',
               background: 'var(--cloud-2)', borderRadius: 'var(--r-md)', marginBottom: 'var(--s5)' } }) : null,

    field(t('f_category'), el('select', {
      class: 'select',
      onchange: (e) => { form.category = e.target.value; fillSubs(); form.subcategory = subSelect.value; },
    }, CATEGORIES.map(c => el('option', { value: c.key, text: `${c.icon}  ${lbl(c.name)}` })))),

    field(t('f_subcategory'), subSelect),

    field(t('p_name'), el('input', {
      class: 'input', placeholder: isHe() ? 'למשל: חולצת פשתן לבנה' : 'e.g. white linen shirt',
      oninput: (e) => { form.name = e.target.value; },
    })),

    field(t('f_color'), el('div', { class: 'row g2' },
      el('input', {
        class: 'input grow', placeholder: isHe() ? 'שם הצבע — לדוגמה: נייבי' : 'colour name — e.g. navy',
        oninput: (e) => { form.color_name = e.target.value; },
      }),
      el('input', {
        type: 'color', value: form.color_hex,
        style: { width: '52px', height: '48px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', background: 'none', padding: '3px' },
        oninput: (e) => { form.color_hex = e.target.value; },
      }),
    )),

    field(t('f_pattern'), el('select', { class: 'select', onchange: e => { form.pattern = e.target.value; } },
      PATTERNS.map(p => el('option', { value: p, text: lbl(PATTERN_NAMES[p]) || p })))),

    field(t('f_fabric'), el('select', { class: 'select', onchange: e => { form.fabric_guess = e.target.value; } },
      FABRICS.map(f => el('option', { value: f, text: lbl(FABRIC_NAMES[f]) || f })))),

    field(t('f_fit'), el('select', { class: 'select', onchange: e => { form.fit = e.target.value; } },
      FITS.map(f => el('option', { value: f, text: lbl(FIT_NAMES[f]) || f })))),

    field(t('f_formality'), el('select', { class: 'select', onchange: e => { form.formality = +e.target.value; } },
      FORMALITY.map(f => el('option', { value: f.v, selected: f.v === 2 || null, text: `${f.v} · ${lbl(f.name)}` })))),

    field(t('f_season'), seasonChips),

    el('div', { class: 'row g2', style: { marginTop: 'var(--s6)' } },
      el('button', { class: 'btn btn-ghost grow', text: t('cancel'), onclick: () => close() }),
      el('button', {
        class: 'btn btn-primary grow', text: t('save'),
        onclick: async () => {
          const item = {
            id: newId('itm'), createdAt: Date.now(), favorite: false,
            thumb: img?.dataUrl || null,
            category: form.category, subcategory: form.subcategory,
            name_he: form.name || subName(form.subcategory),
            name_en: form.name || subName(form.subcategory),
            color_primary: { name_he: form.color_name, name_en: form.color_name, hex: form.color_hex },
            color_secondary: [], pattern: form.pattern, fabric_guess: form.fabric_guess,
            texture: null, season: form.season.length ? form.season : ['summer'],
            weight: 'mid', formality: form.formality, fit: form.fit,
            neckline: null, sleeve: null, length: null, rise: null,
            color_family: 'neutral', undertone_match: 'neutral',
            versatility_score: 55, trend_status: 'timeless', care: 'machine-wash',
            occasions: [], notes_he: '', notes_en: '', confidence: 1,
          };
          await Items.put(item);
          await refreshItems();
          state.shot = null;
          close();
          toast(t('saved_item'));
          ctx.go('wardrobe');
        },
      }),
    ),
  );

  const close = openSheet(body);
}

const field = (label, control) => el('div', { class: 'field' },
  el('label', { class: 'label', text: label }), control);
