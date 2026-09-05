/* ============================================================
   VESTRA · Look card renderer
   Shared by the Studio, the Pair engine and saved looks.
   ============================================================ */

import { el, icon, esc } from '../ui.js';
import { t, pick, isHe } from '../i18n.js';
import { slotName, catIcon, hexFor } from '../taxonomy.js';
import { itemById } from '../state.js';
import { openTryOnBrief, openFullBrief } from './brief.js';
import { makeupForLook, makeupBlock } from './beauty.js';
import { renderStrip } from './renders.js';

const noteBlock = (label, body) => body
  ? el('div', { class: 'look-note' },
      el('span', { class: 'note-label', text: label }),
      el('div', { class: 'tiny', text: body }))
  : null;

export function renderLookCard(look, { onSave, onBeauty, saved, onDelete } = {}) {
  if (!look) return el('div');

  const items = (look.items || [])
    .map(row => ({ row, item: itemById(row.id) }))
    .filter(x => x.item);

  const slots = el('div', { class: 'look-slots' },
    items.map(({ row, item }) => el('div', { class: 'slot' },
      item.thumb
        ? el('img', { class: 'slot-thumb', src: item.thumb, alt: '', loading: 'lazy' })
        : el('div', { class: 'slot-thumb', style: { display: 'grid', placeItems: 'center', fontSize: '20px' }, text: catIcon(item.category) }),
      el('div', { class: 'grow' },
        el('div', { class: 'slot-role', text: slotName(row.slot) }),
        el('div', { class: 'slot-name', text: pick(item, 'name') || item.subcategory }),
        el('div', { class: 'slot-why', text: pick(row, 'reason') }),
      ),
      el('span', { class: 'item-swatch', style: { background: hexFor(item.color_primary) } }),
    )),
  );

  const palette = (look.palette || []).length
    ? el('div', { class: 'look-note' },
        el('span', { class: 'note-label', text: t('palette') }),
        el('div', { class: 'palette' },
          look.palette.slice(0, 5).map(c =>
            el('span', {
              class: 'swatch', title: pick(c, 'name'),
              style: { background: hexFor(c) },
            }))),
      )
    : null;

  const gaps = (look.gaps || []).length
    ? el('div', { class: 'look-note' },
        el('span', { class: 'note-label', text: t('gaps') }),
        el('div', { class: 'stack g2' },
          look.gaps.map(g => el('div', { class: 'gap-row' },
            el('span', { html: icon('alert'), style: { width: '18px', flex: 'none', color: 'var(--warn)' } }),
            el('div', { class: 'grow' },
              el('b', { class: 'tiny', text: pick(g, 'item') }),
              el('div', { class: 'micro muted', text: pick(g, 'why') }),
            ),
            g.est_price_ils ? el('span', { class: 'tag tag-gold', text: `≈₪${g.est_price_ils}` }) : null,
          ))),
      )
    : null;

  const engineTag = look.engine === 'local'
    ? el('span', { class: 'tag', text: t('local_engine') })
    : el('span', { class: 'tag tag-gold', text: t('ai_engine') });

  return el('article', { class: 'look-card' },
    el('div', { class: 'look-head' },
      el('div', { class: 'row between g3', style: { marginBottom: '10px' } },
        el('span', { class: 'eyebrow', text: '✦ The Look' }),
        engineTag,
      ),
      el('h2', { class: 'look-title', text: pick(look, 'title') || t('look_ready') }),
      el('div', { class: 'tiny muted', text: pick(look, 'occasion') }),
    ),
    slots,
    palette,
    noteBlock(t('silhouette'), pick(look, 'silhouette')),
    noteBlock(t('why_works'), pick(look, 'why_it_works')),
    noteBlock(t('trend_note'), pick(look, 'trend_note')),
    noteBlock(t('alternative'), pick(look, 'alternative')),
    gaps,
    /* The makeup this look was rendered with — every step, shade and product
       name, kept on the look so the face in the render can be reproduced at a
       mirror. Only a look that actually carries a makeup shows one; the rest
       are offered the beauty screen below. */
    look.makeup?.steps?.length ? el('div', { class: 'look-note' },
      el('span', { class: 'note-label', text: t('look_makeup') }),
      makeupBlock(look.makeup),
    ) : null,
    el('div', { class: 'look-note row g2 wrap' },
      onSave ? el('button', {
        class: `btn btn-sm ${saved ? 'btn-ghost' : 'btn-primary'} grow`,
        html: icon('heart') + `<span>${esc(t('save_look'))}</span>`,
        onclick: (e) => onSave(look, e),
        disabled: saved || null,
      }) : null,
      onBeauty ? el('button', {
        class: 'btn btn-sm btn-ghost grow',
        html: icon('lipstick') + `<span>${esc(t('makeup_for_look'))}</span>`,
        onclick: () => onBeauty(look),
      }) : null,
    ),
    // Where the render comes back to. The strip is above the brief on purpose:
    // once a look has a photograph, that photograph is the look.
    renderStrip(look),

    // The brief that carries everything: the outfit, the matching makeup, and
    // every photograph both of them name. The canvas simulation is instant and
    // free; this is the one that comes back as a photograph.
    el('button', {
      class: 'btn btn-sm btn-primary btn-block',
      html: icon('sparkles') + `<span>${esc(t('brief_full_open'))}</span>`,
      // A saved makeup reopens the exact brief it was rendered from — same
      // steps, same intensity — rather than the reference look for its key.
      onclick: () => openFullBrief(look, {
        makeup: look.makeup?.steps?.length ? look.makeup : makeupForLook(look),
        intensity: look.makeup?.intensity ?? 1,
      }),
    }),
    el('button', {
      class: 'btn btn-sm btn-quiet btn-block',
      style: { marginTop: 'var(--s2)' },
      html: icon('sparkles') + `<span>${esc(t('brief_open'))}</span>`,
      onclick: () => openTryOnBrief(look),
    }),

    // Only offered for a look that is actually on the shelf. A studio result
    // that has not been saved has nothing to delete.
    onDelete ? el('button', {
      class: 'btn btn-sm btn-quiet btn-block',
      style: { marginTop: 'var(--s3)', color: 'var(--danger)' },
      html: icon('trash') + `<span>${esc(t('looks_delete'))}</span>`,
      onclick: () => onDelete(look),
    }) : null,
  );
}

/* ---------------- Compact card for the home screen ---------------- */
export function renderLookMini(look, onOpen) {
  const items = (look.items || []).map(r => itemById(r.id)).filter(Boolean);
  // Once a look has a photograph of itself worn, that photograph IS the look —
  // the newest render leads the card, and the garment thumbs stand in only
  // until one exists.
  const render = (look.renders || []).at(-1);
  return el('button', {
    class: 'card card-lift', style: { width: '210px', textAlign: 'start' },
    onclick: () => onOpen?.(look),
  },
    render
      ? el('img', {
          src: render.dataUrl, alt: '', loading: 'lazy',
          style: { width: '100%', aspectRatio: '3/4', objectFit: 'cover', objectPosition: 'top',
                   borderRadius: '10px', display: 'block', marginBottom: '10px' },
        })
      : el('div', { class: 'row g1', style: { marginBottom: '10px' } },
          items.slice(0, 4).map(i => i.thumb
            ? el('img', { src: i.thumb, alt: '', loading: 'lazy',
                style: { width: '38px', height: '48px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--line)' } })
            : el('div', { style: { width: '38px', height: '48px', display: 'grid', placeItems: 'center',
                background: 'var(--cloud-3)', borderRadius: '8px' }, text: catIcon(i.category) })),
        ),
    el('div', { class: 'slot-name', text: pick(look, 'title') || t('look_ready') }),
    el('div', { class: 'micro muted', text: pick(look, 'occasion') || new Date(look.createdAt || Date.now()).toLocaleDateString(isHe() ? 'he-IL' : 'en-GB') }),
  );
}
