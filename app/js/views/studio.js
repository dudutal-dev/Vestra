/* ============================================================
   VESTRA · Styling Studio — occasion → look, and the pair engine
   ============================================================ */

import { el, icon, esc, toast, sparkle, buzz, observeReveal } from '../ui.js';
import { t, isHe } from '../i18n.js';
import { state, refreshLooks, itemById } from '../state.js';
import { Looks, newId, hasKey } from '../store.js';
import { buildLook, pairWithItem, errText } from '../ai.js';
import { buildLookLocal, pairWithItemLocal } from '../stylist.js';
import { OCCASIONS, TIMES, WEATHER, MOODS, occName, catIcon, lbl } from '../taxonomy.js';
import { renderLookCard } from './lookcard.js';

const MIN_ITEMS = 4;

export function renderStudio(root, ctx) {
  const anchor = state.anchorId ? itemById(state.anchorId) : null;

  // A result is already on screen
  if (state.pairResult) return renderPairResult(root, ctx);
  if (state.lastLook)   return renderSingleResult(root, ctx);

  const r = state.request;

  const occGrid = el('div', { class: 'grid-items stagger', style: { gridTemplateColumns: 'repeat(auto-fill,minmax(112px,1fr))' } },
    OCCASIONS.map(o => el('button', {
      class: `card card-lift ${r.occasion === o.key ? 'is-picked' : ''}`,
      style: { padding: 'var(--s4) var(--s3)', textAlign: 'center',
               boxShadow: r.occasion === o.key ? '0 0 0 2px var(--oxblood)' : null },
      onclick: (e) => {
        r.occasion = o.key;
        [...occGrid.children].forEach(n => { n.style.boxShadow = ''; });
        e.currentTarget.style.boxShadow = '0 0 0 2px var(--oxblood)';
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

  root.replaceChildren(
    el('div', { class: 'pad stack g5', style: { paddingTop: 'var(--s4)' } },
      el('div', {},
        el('h1', { style: { fontSize: 'var(--t-2xl)' }, text: t('studio') }),
        el('p', { class: 'tiny muted', style: { marginTop: '6px' }, text: t('studio_sub') }),
      ),
      anchorCard,
      block(t('st_occasion'), occGrid),
      block(t('st_time'), timeSeg),
      block(t('st_weather'), weatherSeg),
      block(t('st_mood'), moodSeg),
      block(t('st_notes'), notes),
      buildBtn,
    ),
  );
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
    ),
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
    host.replaceChildren(renderLookCard(look, {
      onSave: (l, e) => saveLook(l, e, ctx),
      onBeauty: (l) => ctx.go('beauty', { look: l }),
    }));
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
