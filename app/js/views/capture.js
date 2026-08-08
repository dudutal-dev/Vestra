/* ============================================================
   VESTRA · Capture — item cataloging & closet analysis
   ============================================================ */

import { el, icon, esc, toast, openSheet, sparkle, buzz, $ } from '../ui.js';
import { t, isHe } from '../i18n.js';
import { state, refreshItems, refreshClosets } from '../state.js';
import { Items, Closets, newId, hasKey } from '../store.js';
import { compressImage, catalogItem, analyzeCloset, errText, AIError } from '../ai.js';
import {
  CATEGORIES, SUBCATS, SUBCAT_NAMES, FITS, FIT_NAMES, PATTERNS, PATTERN_NAMES,
  FABRICS, FABRIC_NAMES, FORMALITY, SEASONS, catName, subName, lbl, hexFor,
} from '../taxonomy.js';

export function renderCapture(root, ctx) {
  if (ctx.opts?.mode) state.captureMode = ctx.opts.mode;

  const zone = el('div', { class: 'shot-zone scan-frame' },
    el('span', { class: 'br' }),
    el('div', { class: 'shot-hint' },
      el('div', { html: icon('camera') }),
      el('b', { class: 'slot-name', text: t('shot_hint_t') }),
      el('div', { class: 'tiny muted', style: { marginTop: '6px' }, text: t('shot_hint_s') }),
    ),
  );

  const modeSeg = el('div', { class: 'seg' },
    ['item', 'closet'].map(m => el('button', {
      class: `chip ${state.captureMode === m ? 'is-on' : ''}`,
      onclick: () => { state.captureMode = m; ctx.rerender(); },
      text: m === 'item' ? t('mode_item') : t('mode_closet'),
    })),
  );

  const actions = el('div', { class: 'row g2' },
    el('button', {
      class: 'btn btn-primary grow', html: icon('camera') + `<span>${esc(t('take_photo'))}</span>`,
      onclick: () => pick('#cameraPicker'),
    }),
    el('button', {
      class: 'btn btn-ghost grow', html: icon('image') + `<span>${esc(t('pick_photo'))}</span>`,
      onclick: () => pick('#filePicker'),
    }),
  );

  const analyzeBtn = el('button', {
    class: 'btn btn-lux btn-block hidden',
    html: icon('sparkles') + `<span>${esc(state.captureMode === 'closet' ? t('analyze_closet') : t('analyze'))}</span>`,
    onclick: (e) => run(e),
  });

  const retakeBtn = el('button', {
    class: 'btn btn-quiet btn-block hidden tiny', text: t('retake'),
    onclick: () => { state.shot = null; ctx.rerender(); },
  });

  const manualBtn = el('button', {
    class: 'btn btn-ghost btn-block', html: icon('plus') + `<span>${esc(t('manual_add'))}</span>`,
    onclick: () => openManualForm(ctx),
  });

  const keyBanner = hasKey() ? null : el('div', { class: 'alert alert-med' },
    el('span', { html: icon('key') }),
    el('div', { class: 'grow' },
      el('b', { text: t('no_key_t') }),
      el('div', { style: { marginTop: '4px' }, text: t('no_key_s') }),
      el('button', {
        class: 'btn btn-sm btn-ghost', style: { marginTop: '10px' },
        text: t('open_settings'), onclick: () => ctx.go('profile'),
      }),
    ),
  );

  root.replaceChildren(
    el('div', { class: 'pad stack g5', style: { paddingTop: 'var(--s4)' } },
      el('div', {},
        el('h1', { style: { fontSize: 'var(--t-2xl)' }, text: state.captureMode === 'closet' ? t('closet') : t('capture') }),
        el('p', { class: 'tiny muted', style: { marginTop: '6px' },
          text: state.captureMode === 'closet' ? t('closet_sub') : t('capture_sub') }),
      ),
      modeSeg,
      zone,
      actions,
      analyzeBtn,
      retakeBtn,
      state.captureMode === 'item' ? manualBtn : null,
      keyBanner,
    ),
  );

  if (state.shot) showShot(state.shot);

  /* ---------- file input ---------- */
  function pick(sel) {
    const input = $(sel);
    input.value = '';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const img = await compressImage(file);
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
    analyzeBtn.classList.toggle('hidden', !hasKey());
    retakeBtn.classList.remove('hidden');
    if (!hasKey() && state.captureMode === 'item') {
      toast(t('offline_mode'), 'warn');
      openManualForm(ctx, img);
    }
  }

  /* ---------- run AI ---------- */
  async function run(evt) {
    if (!state.shot) return;
    const steps = t('scan_steps');
    let step = 0;

    zone.classList.add('scanning');
    const status = el('div', { class: 'scan-status' },
      el('span', { html: icon('sparkles'), style: { width: '18px' } }),
      el('span', { class: 'grow', text: state.captureMode === 'closet' ? t('scanning_closet') : steps[0] }),
      el('span', { class: 'bar' }, el('i')),
    );
    zone.append(status);
    const label = status.children[1];
    const tick = setInterval(() => {
      step = (step + 1) % steps.length;
      label.textContent = state.captureMode === 'closet' ? t('scanning_closet') : steps[step];
    }, 1700);

    analyzeBtn.disabled = true;
    retakeBtn.disabled = true;

    try {
      if (state.captureMode === 'closet') {
        const res = await analyzeCloset(state.shot);
        const record = { id: newId('cls'), createdAt: Date.now(), thumb: state.shot.dataUrl, ...res };
        await Closets.put(record);
        await refreshClosets();
        buzz(18);
        const r = evt.currentTarget.getBoundingClientRect();
        sparkle(r.left + r.width / 2, r.top);
        state.shot = null;
        ctx.go('closet');
      } else {
        const results = await catalogItem(state.shot);
        const saved = [];
        for (const [idx, r] of results.entries()) {
          saved.push(await persistItem(r, idx === 0 ? state.shot.dataUrl : null));
        }
        await refreshItems();
        buzz(18);
        const r = evt.currentTarget.getBoundingClientRect();
        sparkle(r.left + r.width / 2, r.top);
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
