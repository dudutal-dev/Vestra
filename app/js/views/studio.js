/* ============================================================
   VESTRA · Styling Studio — occasion → look, and the pair engine
   ============================================================ */

import { el, icon, esc, toast, sparkle, buzz, observeReveal } from '../ui.js';
import { t, isHe, pick } from '../i18n.js';
import { state, refreshLooks, itemById } from '../state.js';
import { Looks, newId, hasKey } from '../store.js';
import { buildLook, pairWithItem, errText } from '../ai.js';
import { buildLookLocal, pairWithItemLocal } from '../stylist.js';
import { renderTryOn, renderLookbook, downloadCanvas } from '../tryon.js';
import { loadImage } from '../makeup.js';
import { OCCASIONS, TIMES, WEATHER, MOODS, occName, catIcon, lbl, formalityName } from '../taxonomy.js';
import { renderLookCard } from './lookcard.js';
import { matchingLooks, lookTile } from './looks.js';

const MIN_ITEMS = 4;

export function renderStudio(root, ctx) {
  const anchor = state.anchorId ? itemById(state.anchorId) : null;

  // A result is already on screen
  if (state.pairResult) return renderPairResult(root, ctx);
  if (state.lastLook)   return renderSingleResult(root, ctx);

  const r = state.request;

  /* Before building anything, check the shelf.
     A look costs a render or a model call or a few minutes of answering
     questions, and the second wedding should not cost any of them again. This
     appears the moment an occasion is picked and says nothing at all when
     there is no good match — a wrong suggestion here means arriving dressed
     wrong, which is worse than no suggestion. */
  const savedMatch = el('div', { class: 'stack g2' });
  const paintMatch = () => {
    const hits = r.occasion ? matchingLooks(r.occasion) : [];
    savedMatch.replaceChildren(...(hits.length ? [
      el('div', { class: 'card stack g3' },
        el('div', {},
          el('div', { class: 'eyebrow', text: t('looks_saved_match') }),
          el('p', { class: 'tiny muted', style: { margin: '4px 0 0' }, text: t('looks_saved_match_s') }),
        ),
        el('div', { class: 'row g3 scroll-x', style: { alignItems: 'flex-start' } },
          hits.slice(0, 3).map(m => el('div', { style: { width: '138px' } },
            lookTile(m.look, (l) => ctx.openLook(l))))),
      ),
    ] : []));
    /* The tiles carry `.on-scroll`, which starts at opacity 0 and is lifted only
       when the reveal observer sees them scroll in. That is wrong here: this card
       is the answer to a tap, and the occasion grid is tall enough that it often
       lands below the fold — the suggestion would be an empty box until the user
       happened to scroll. Reveal them outright. */
    savedMatch.querySelectorAll('.on-scroll').forEach(n => n.classList.add('is-in'));
  };

  const occGrid = el('div', { class: 'grid-items stagger', style: { gridTemplateColumns: 'repeat(auto-fill,minmax(112px,1fr))' } },
    OCCASIONS.map(o => el('button', {
      class: `card card-lift ${r.occasion === o.key ? 'is-picked' : ''}`,
      style: { padding: 'var(--s4) var(--s3)', textAlign: 'center',
               boxShadow: r.occasion === o.key ? '0 0 0 2px var(--oxblood)' : null },
      onclick: (e) => {
        r.occasion = o.key;
        [...occGrid.children].forEach(n => { n.style.boxShadow = ''; });
        e.currentTarget.style.boxShadow = '0 0 0 2px var(--oxblood)';
        paintMatch();
        buzz();
      },
    },
      el('div', { style: { fontSize: '24px', marginBottom: '6px' }, text: o.icon }),
      el('div', { class: 'micro', style: { fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }, text: lbl(o.name) }),
    )),
  );

  const timeSeg = chipRow(TIMES, r.time, v => { r.time = v; });
  const weatherSeg = chipRow(WEATHER, r.weather, v => { r.weather = v; });
  const moodSeg = chipRow(MOODS.map(m => ({ ...m, icon: '' })), r.mood, v => { r.mood = v; });

  const notes = el('textarea', {
    class: 'textarea', placeholder: t('st_notes_ph'), value: r.notes,
    oninput: e => { r.notes = e.target.value; },
  });

  const anchorCard = anchor ? el('div', { class: 'card row g3', style: { alignItems: 'center' } },
    anchor.thumb
      ? el('img', { src: anchor.thumb, alt: '', style: { width: '54px', height: '68px', objectFit: 'cover', borderRadius: 'var(--r-sm)' } })
      : el('div', { style: { width: '54px', height: '68px', display: 'grid', placeItems: 'center', background: 'var(--cloud-3)', borderRadius: 'var(--r-sm)', fontSize: '24px' }, text: catIcon(anchor.category) }),
    el('div', { class: 'grow' },
      el('div', { class: 'eyebrow', text: t('pair_anchor') }),
      el('div', { class: 'slot-name', text: (isHe() ? anchor.name_he : anchor.name_en) || anchor.subcategory }),
    ),
    el('button', { class: 'icon-btn', html: icon('close'), onclick: () => { state.anchorId = null; ctx.rerender(); } }),
  ) : null;

  const buildBtn = el('button', {
    class: 'btn btn-lux btn-block',
    html: icon('sparkles') + `<span>${esc(t('build'))}</span>`,
    onclick: (e) => run(e),
  });

  // Beauty on its own. The occasion still sets the register, but nothing here
  // reads the wardrobe, so an empty closet is no reason to be turned away.
  const makeupBtn = el('button', {
    class: 'btn btn-ghost btn-block',
    html: icon('lipstick') + `<span>${esc(t('makeup_only'))}</span>`,
    onclick: () => {
      if (!r.occasion) return toast(t('need_occasion'), 'warn');
      buzz();
      ctx.go('beauty');
    },
  });

  root.replaceChildren(
    el('div', { class: 'pad stack g5', style: { paddingTop: 'var(--s4)' } },
      el('div', {},
        el('h1', { style: { fontSize: 'var(--t-2xl)' }, text: t('studio') }),
        el('p', { class: 'tiny muted', style: { marginTop: '6px' }, text: t('studio_sub') }),
      ),
      anchorCard,
      block(t('st_occasion'), occGrid),
      savedMatch,
      block(t('st_time'), timeSeg),
      block(t('st_weather'), weatherSeg),
      block(t('st_mood'), moodSeg),
      block(t('st_notes'), notes),
      buildBtn,
      el('div', { class: 'stack g1' },
        makeupBtn,
        el('p', { class: 'micro muted', style: { margin: '2px 0 0', textAlign: 'center' }, text: t('makeup_only_sub') }),
      ),
    ),
  );
  paintMatch();          // an occasion may already be chosen from last time
  observeReveal(root);

  /* ---------- build ---------- */
  async function run(evt) {
    if (!r.occasion) return toast(t('need_occasion'), 'warn');
    if (state.items.length < MIN_ITEMS) return toast(t('err_empty_wardrobe'), 'warn');

    const overlay = buildingOverlay();
    root.append(overlay.node);
    buildBtn.disabled = true;

    const payload = {
      wardrobe: state.items.map(slimItem),
      profile: state.profile,
      request: {
        occasion: r.occasion, occasion_label: occName(r.occasion),
        time_of_day: r.time, weather: r.weather, mood: r.mood, notes: r.notes,
        date: new Date().toISOString().slice(0, 10),
      },
    };

    try {
      let result;
      if (anchor) {
        result = hasKey()
          ? await pairWithItem({ ...payload, anchor_id: anchor.id })
          : pairWithItemLocal({ ...payload, anchor });
        result.createdAt = Date.now();
        state.pairResult = result;
      } else {
        result = hasKey()
          ? await buildLook(payload)
          : buildLookLocal(payload);
        result.createdAt = Date.now();
        result.occasion_he ||= occName(r.occasion);
        result.occasion_en ||= occName(r.occasion);
        // The key, not just the label: a saved look is matched against a future
        // occasion by this, and a translated label cannot be matched at all.
        result.occasion_key = r.occasion;
        result.weather = r.weather || null;
        state.lastLook = result;
      }
      buzz(20);
      const b = buildBtn.getBoundingClientRect();
      sparkle(b.left + b.width / 2, b.top + b.height / 2, 22);
      ctx.rerender();
    } catch (e) {
      toast(errText(e), 'bad');
      // Never leave the user stranded — fall back to the local engine
      const local = anchor
        ? pairWithItemLocal({ ...payload, anchor })
        : buildLookLocal(payload);
      local.createdAt = Date.now();
      if (anchor) state.pairResult = local; else state.lastLook = local;
      ctx.rerender();
    } finally {
      overlay.stop();
      buildBtn.disabled = false;
    }
  }
}

/* ---------------- Result: single look ---------------- */
function renderSingleResult(root, ctx) {
  const look = state.lastLook;
  const saved = state.looks.some(l => l.id && l.id === look.id);

  root.replaceChildren(
    el('div', { class: 'pad stack g5', style: { paddingTop: 'var(--s4)' } },
      el('div', { class: 'row between g3' },
        el('h1', { style: { fontSize: 'var(--t-2xl)' }, text: t('look_ready') }),
        el('button', {
          class: 'btn btn-ghost btn-sm', html: icon('refresh') + `<span>${esc(t('new_look'))}</span>`,
          onclick: () => { state.lastLook = null; ctx.rerender(); },
        }),
      ),
      renderLookCard(look, {
        saved,
        onSave: (l, e) => saveLook(l, e, ctx),
        onBeauty: (l) => { ctx.go('beauty', { look: l }); },
      }),
      tryOnBlock(look, ctx),
    ),
  );
}

/* ============================================================
   Try-on — places the outfit over the owner's own body photo
   ============================================================ */
/**
 * The credit line under the lookbook headline: body shape, formality, weather.
 * Whatever the app doesn't actually know is left out rather than guessed at,
 * so a short line means a short line — never a placeholder.
 */
function lookbookMeta(look, rec) {
  const out = [];
  if (rec?.body?.shape) out.push(rec.body.shape);
  if (look?.formality) out.push(formalityName(look.formality));
  const w = WEATHER.find(x => x.key === state.request?.weather);
  if (w) out.push(lbl(w.name).split('·')[0].trim());   // the label, without its temperature range
  return isHe() ? out : out.map(s => s.toUpperCase());
}

export function tryOnBlock(look, ctx) {
  const rec = state.body;
  const items = (look?.items || []).map(r => itemById(r.id)).filter(Boolean);

  if (!rec?.photo || !rec.regions) {
    return el('div', { class: 'card center stack g3' },
      el('div', { html: icon('hanger'), style: { width: '40px', margin: '0 auto', color: 'var(--ink-4)' } }),
      el('div', { class: 'tiny muted', text: t('tryon_need_body') }),
      el('button', {
        class: 'btn btn-primary btn-sm', style: { margin: '0 auto' },
        html: icon('camera') + `<span>${esc(t('tryon_open_capture'))}</span>`,
        onclick: () => ctx.go('capture', { mode: 'body' }),
      }),
    );
  }

  const before = el('img', { src: rec.photo, alt: '' });
  const canvas = el('canvas', { 'aria-label': t('tryon_title') });
  const stage = el('div', { class: 'sim-stage' },
    before,
    canvas,
    el('span', { class: 'sim-tag sim-tag-a', text: t('tryon_title') }),
    el('span', { class: 'sim-divider' }),
    el('input', {
      class: 'sim-range', type: 'range', min: '0', max: '100', value: '62',
      'aria-label': t('tryon_title'),
      oninput: (e) => stage.style.setProperty('--split', e.target.value + '%'),
    }),
  );

  let opacity = 0.85;
  let photoEl = null;

  async function draw() {
    photoEl ||= await loadImage(rec.photo);
    await renderTryOn(canvas, photoEl, rec.regions, items, { opacity });
  }
  draw().catch(() => toast(t('err_generic'), 'warn'));

  const fit = rec.body;
  const fitCard = fit ? el('section', { class: 'card' },
    el('div', { class: 'eyebrow', style: { marginBottom: 'var(--s3)' }, text: t('fit_notes') }),
    el('dl', { style: { margin: 0 } },
      fit.shape ? el('div', { class: 'kv' }, el('dt', { text: t('p_body_shape') }), el('dd', { text: fit.shape })) : null,
      fit.ratio ? el('div', { class: 'kv' }, el('dt', { text: t('f_ratio') }), el('dd', { text: fit.ratio })) : null,
    ),
    pick(fit, 'proportions') ? el('div', { class: 'tiny muted', style: { marginTop: 'var(--s3)' }, text: pick(fit, 'proportions') }) : null,
    pick(fit, 'focus') ? el('div', { class: 'alert alert-ok', style: { marginTop: 'var(--s3)' } },
      el('span', { html: icon('sparkles') }),
      el('div', { text: pick(fit, 'focus') })) : null,
    (fit.fit_notes || []).length ? el('div', { class: 'stack g2', style: { marginTop: 'var(--s4)' } },
      fit.fit_notes.map(n => el('div', { class: 'gap-row' },
        el('div', { class: 'grow' },
          el('b', { class: 'micro', style: { textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-3)' }, text: n.area }),
          el('div', { class: 'tiny', text: pick(n, 'advice') }),
        ),
      ))) : null,
  ) : null;

  return el('div', { class: 'stack g3' },
    el('div', { class: 'row between g2' },
      el('span', { class: 'eyebrow', text: t('tryon_title') }),
      el('button', {
        class: 'btn btn-quiet btn-sm tiny',
        html: icon('download') + `<span>${esc(t('tryon_lookbook'))}</span>`,
        onclick: async (e) => {
          // Hold the node: `currentTarget` is cleared once the event finishes
          // dispatching, so re-reading it in `finally` would leave the button
          // disabled for good after the first card.
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            const sheet = await renderLookbook({
              bodyPhoto: photoEl,
              items,
              palette: look.palette || [],
              headline: pick(look, 'occasion') || pick(look, 'title') || t('look_ready'),
              meta: lookbookMeta(look, rec),
              note: pick(look, 'why_it_works') || '',
              rtl: isHe(),
            });
            downloadCanvas(sheet, `vestra-lookbook-${Date.now()}.png`);
            toast(t('tryon_saved'));
            buzz(14);
          } catch {
            toast(t('err_generic'), 'warn');
          } finally {
            btn.disabled = false;
          }
        },
      }),
    ),
    stage,
    el('div', {},
      el('div', { class: 'label', text: t('tryon_opacity') }),
      el('input', {
        class: 'slider', type: 'range', min: '30', max: '100', value: '85',
        'aria-label': t('tryon_opacity'),
        oninput: (e) => { opacity = +e.target.value / 100; draw(); },
      }),
    ),
    el('p', { class: 'micro muted', style: { margin: 0 }, text: t('tryon_disclaimer') }),
    fitCard,
  );
}

/* ---------------- Result: three variants ---------------- */
function renderPairResult(root, ctx) {
  const res = state.pairResult;
  const anchor = itemById(res.anchor_id);
  const roleLabel = { statement: t('anchor_statement'), 'neutral-base': t('anchor_neutral'), texture: t('anchor_texture') }[res.anchor_role] || '';

  let idx = 1; // default to "core"
  const host = el('div', {});

  const switcher = el('div', { class: 'variants' },
    ['down', 'core', 'up'].map((v, i) => el('button', {
      class: `variant ${i === idx ? 'is-on' : ''}`,
      text: { down: t('v_down'), core: t('v_core'), up: t('v_up') }[v],
      onclick: (e) => {
        idx = i;
        [...switcher.children].forEach(n => n.classList.remove('is-on'));
        e.currentTarget.classList.add('is-on');
        paint();
      },
    })),
  );

  const paint = () => {
    const look = (res.outfits || [])[idx] || (res.outfits || [])[0];
    host.replaceChildren(
      renderLookCard(look, {
        onSave: (l, e) => saveLook(l, e, ctx),
        onBeauty: (l) => ctx.go('beauty', { look: l }),
      }),
      el('div', { style: { marginTop: 'var(--s5)' } }, tryOnBlock(look, ctx)),
    );
  };

  root.replaceChildren(
    el('div', { class: 'pad stack g4', style: { paddingTop: 'var(--s4)' } },
      el('div', { class: 'row between g3' },
        el('h1', { style: { fontSize: 'var(--t-xl)' }, text: t('pair_title') }),
        el('button', {
          class: 'btn btn-ghost btn-sm', html: icon('refresh'),
          onclick: () => { state.pairResult = null; state.anchorId = null; ctx.rerender(); },
        }),
      ),
      anchor ? el('div', { class: 'card row g3', style: { alignItems: 'center' } },
        anchor.thumb
          ? el('img', { src: anchor.thumb, alt: '', style: { width: '54px', height: '68px', objectFit: 'cover', borderRadius: 'var(--r-sm)' } })
          : el('div', { style: { width: '54px', height: '68px', display: 'grid', placeItems: 'center', background: 'var(--cloud-3)', borderRadius: 'var(--r-sm)', fontSize: '24px' }, text: catIcon(anchor.category) }),
        el('div', { class: 'grow' },
          el('div', { class: 'eyebrow', text: roleLabel }),
          el('div', { class: 'slot-name', text: (isHe() ? anchor.name_he : anchor.name_en) || anchor.subcategory }),
        ),
      ) : null,
      switcher,
      host,
    ),
  );
  paint();
}

/* ---------------- Save ---------------- */
async function saveLook(look, evt, ctx) {
  const record = { ...look, id: look.id || newId('look'), createdAt: look.createdAt || Date.now() };
  await Looks.put(record);
  await refreshLooks();
  toast(t('look_saved'));
  buzz(14);
  if (evt?.currentTarget) {
    const r = evt.currentTarget.getBoundingClientRect();
    sparkle(r.left + r.width / 2, r.top + r.height / 2, 14);
    evt.currentTarget.disabled = true;
    evt.currentTarget.classList.replace('btn-primary', 'btn-ghost');
  }
}

/* ---------------- Building overlay ---------------- */
function buildingOverlay() {
  const steps = t('build_steps');
  let i = 0;
  const label = el('div', { class: 'slot-name', text: steps[0] });
  const node = el('div', {
    style: {
      position: 'fixed', inset: 0, zIndex: 300, display: 'grid', placeItems: 'center',
      background: 'color-mix(in srgb, var(--cloud) 88%, transparent)',
      backdropFilter: 'blur(10px)',
    },
  },
    el('div', { class: 'center stack g4', style: { padding: 'var(--s6)' } },
      el('div', { class: 'hanger', style: { width: '58px', margin: '0 auto', color: 'var(--oxblood)' }, html: icon('hanger') }),
      el('div', { class: 'serif-xl', text: t('building') }),
      label,
      el('div', { class: 'bar-track', style: { width: '190px', margin: '0 auto' } },
        el('div', { style: { width: '35%', height: '100%', background: 'var(--grad-lux)', animation: 'barSlide 1.3s var(--ease-out) infinite' } })),
    ),
  );
  const tick = setInterval(() => { i = (i + 1) % steps.length; label.textContent = steps[i]; }, 1900);
  return { node, stop: () => { clearInterval(tick); node.remove(); } };
}

/* ---------------- helpers ---------------- */
const block = (label, body) => el('div', { class: 'on-scroll' },
  el('div', { class: 'eyebrow', style: { marginBottom: 'var(--s3)' }, text: label }), body);

function chipRow(list, current, onPick) {
  const row = el('div', { class: 'seg' },
    list.map(o => el('button', {
      class: `chip ${current === o.key ? 'is-on' : ''}`,
      text: `${o.icon ? o.icon + ' ' : ''}${lbl(o.name)}`,
      onclick: (e) => {
        onPick(o.key);
        [...row.children].forEach(n => n.classList.remove('is-on'));
        e.currentTarget.classList.add('is-on');
        buzz();
      },
    })),
  );
  return row;
}

/** Trim items down to what the model needs — images and long fields cost tokens. */
export const slimItem = (i) => ({
  id: i.id, category: i.category, subcategory: i.subcategory,
  name_he: i.name_he, name_en: i.name_en,
  color_primary: i.color_primary, pattern: i.pattern, fabric_guess: i.fabric_guess,
  texture: i.texture, season: i.season, weight: i.weight, formality: i.formality,
  fit: i.fit, neckline: i.neckline, sleeve: i.sleeve, length: i.length, rise: i.rise,
  color_family: i.color_family, undertone_match: i.undertone_match,
  versatility_score: i.versatility_score, trend_status: i.trend_status,
  occasions: i.occasions, favorite: i.favorite,
});
