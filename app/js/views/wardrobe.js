/* ============================================================
   VESTRA · Wardrobe grid + item detail
   ============================================================ */

import { el, icon, esc, toast, openSheet, confirmSheet, observeReveal, buzz } from '../ui.js';
import { t, isHe } from '../i18n.js';
import { state, refreshItems } from '../state.js';
import { Items } from '../store.js';
import {
  CATEGORIES, catName, catIcon, subName, hexFor, formalityName,
  FIT_NAMES, PATTERN_NAMES, FABRIC_NAMES, TREND_STATUS, SEASONS, lbl,
} from '../taxonomy.js';

let pairMode = false;

export function renderWardrobe(root, ctx) {
  pairMode = !!ctx.opts?.pairMode;

  const search = el('input', {
    class: 'input', type: 'search', value: state.query,
    'data-tph': 'search_ph', placeholder: t('search_ph'),
    oninput: (e) => { state.query = e.target.value; paint(); },
  });

  const chips = el('div', { class: 'scroll-x' },
    [{ key: 'all', name: null, icon: '✦' }, ...CATEGORIES].map(c => {
      const count = c.key === 'all'
        ? state.items.length
        : state.items.filter(i => i.category === c.key).length;
      if (c.key !== 'all' && !count) return null;
      return el('button', {
        class: `chip ${state.filter === c.key ? 'is-on' : ''}`,
        'data-cat': c.key === 'all' ? null : c.key,
        onclick: (e) => {
          state.filter = c.key;
          [...chips.children].forEach(n => n.classList.remove('is-on'));
          e.currentTarget.classList.add('is-on');
          paint();
        },
      },
        c.key === 'all' ? null : el('span', { class: 'chip-dot' }),
        el('span', { text: c.key === 'all' ? t('filter_all') : lbl(c.name) }),
        el('span', { class: 'micro muted', text: String(count) }),
      );
    }).filter(Boolean),
  );

  const grid = el('div', { class: 'grid-items stagger' });

  root.replaceChildren(
    el('div', { class: 'pad stack g4', style: { paddingTop: 'var(--s4)' } },
      el('div', { class: 'row between g3' },
        el('h1', { style: { fontSize: 'var(--t-2xl)' }, text: pairMode ? t('pair_title') : t('wardrobe') }),
        el('span', { class: 'count-pill', text: String(state.items.length) }),
      ),
      pairMode ? el('p', { class: 'tiny muted', text: t('pair_pick') }) : null,
      search,
      el('div', { class: 'filters' }, chips),
      grid,
    ),
  );

  paint();

  function paint() {
    const q = state.query.trim().toLowerCase();
    const list = state.items.filter(i => {
      if (state.filter !== 'all' && i.category !== state.filter) return false;
      if (!q) return true;
      return [i.name_he, i.name_en, i.subcategory, i.category,
              i.color_primary?.name_he, i.color_primary?.name_en,
              i.fabric_guess, i.pattern].join(' ').toLowerCase().includes(q);
    });

    if (!list.length) {
      grid.replaceChildren(el('div', { class: 'empty', style: { gridColumn: '1/-1' } },
        el('div', { html: icon(state.items.length ? 'search' : 'hanger'), style: { width: '62px', margin: '0 auto var(--s4)' } }),
        el('h3', { text: state.items.length ? t('empty_search_t') : t('empty_wardrobe_t') }),
        el('p', { class: 'tiny muted', text: state.items.length ? t('empty_search_s') : t('empty_wardrobe_s') }),
        state.items.length ? null : el('button', {
          class: 'btn btn-primary', html: icon('camera') + `<span>${esc(t('add_first'))}</span>`,
          onclick: () => ctx.go('capture', { mode: 'item' }),
        }),
      ));
      return;
    }

    grid.replaceChildren(...list.map(i => itemCard(i, ctx)));
    observeReveal(grid);
  }
}

/* ---------------- Item tile ---------------- */
function itemCard(i, ctx) {
  const card = el('button', {
    class: `item ${state.anchorId === i.id ? 'is-picked' : ''}`,
    'data-cat': i.category,
    onclick: () => {
      buzz();
      if (pairMode) ctx.startPair(i);
      else openItemSheet(i, ctx);
    },
  },
    i.thumb
      ? el('img', { class: 'item-img', src: i.thumb, alt: '', loading: 'lazy' })
      : el('div', { class: 'item-img', style: { display: 'grid', placeItems: 'center', fontSize: '34px' }, text: catIcon(i.category) }),
    el('span', { class: 'item-cat', text: catName(i.category) }),
    el('span', {
      class: `item-fav ${i.favorite ? 'is-on' : ''}`, html: icon('heart'),
      onclick: async (e) => {
        e.stopPropagation();
        i.favorite = !i.favorite;
        await Items.put(i);
        e.currentTarget.classList.toggle('is-on', i.favorite);
        buzz();
      },
    }),
    el('div', { class: 'item-body' },
      el('div', { class: 'item-name', text: (isHe() ? i.name_he : i.name_en) || subName(i.subcategory) }),
      el('div', { class: 'item-meta' },
        el('span', { class: 'item-swatch', style: { background: hexFor(i.color_primary) } }),
        el('span', { class: 'micro muted', text: formalityName(i.formality || 2) }),
      ),
    ),
  );
  return card;
}

/* ---------------- Item detail sheet ---------------- */
export function openItemSheet(item, ctx) {
  const kv = (label, value) => value
    ? el('div', { class: 'kv' }, el('dt', { text: label }), el('dd', { text: value }))
    : null;

  const seasons = (item.season || []).map(s => lbl(SEASONS.find(x => x.key === s)?.name) || s).join(' · ');
  const occ = (item.occasions || []).join(' · ');

  const body = el('div', {},
    item.thumb
      ? el('img', { src: item.thumb, alt: '',
          style: { width: '100%', maxHeight: '46svh', objectFit: 'contain',
                   borderRadius: 'var(--r-lg)', background: 'var(--cloud-2)', marginBottom: 'var(--s5)' } })
      : null,

    el('div', { class: 'row between g3', style: { marginBottom: 'var(--s2)' } },
      el('h3', { text: (isHe() ? item.name_he : item.name_en) || subName(item.subcategory) }),
      el('span', { class: 'item-swatch', style: { width: '26px', height: '26px', background: hexFor(item.color_primary) } }),
    ),
    el('div', { class: 'row g2 wrap', style: { marginBottom: 'var(--s5)' } },
      el('span', { class: 'tag', text: catName(item.category) }),
      el('span', { class: 'tag', text: subName(item.subcategory) }),
      item.trend_status ? el('span', { class: 'tag tag-gold', text: lbl(TREND_STATUS[item.trend_status]) || item.trend_status }) : null,
      typeof item.versatility_score === 'number'
        ? el('span', { class: 'tag tag-ox', text: `${t('f_versatility')} ${item.versatility_score}` }) : null,
    ),

    el('dl', { style: { margin: 0 } },
      kv(t('f_color'), isHe() ? item.color_primary?.name_he : item.color_primary?.name_en),
      kv(t('f_pattern'), lbl(PATTERN_NAMES[item.pattern])),
      kv(t('f_fabric'), lbl(FABRIC_NAMES[item.fabric_guess])),
      kv(t('f_fit'), lbl(FIT_NAMES[item.fit])),
      kv(t('f_formality'), formalityName(item.formality || 2)),
      kv(t('f_season'), seasons),
      kv(t('f_occasions'), occ),
      kv(t('f_care'), item.care),
      kv(t('f_notes'), isHe() ? item.notes_he : item.notes_en),
    ),

    el('div', { class: 'row g2', style: { marginTop: 'var(--s6)' } },
      el('button', {
        class: 'btn btn-primary grow',
        html: icon('sparkles') + `<span>${esc(t('style_this'))}</span>`,
        onclick: () => { close(); ctx.startPair(item); },
      }),
      el('button', {
        class: 'btn btn-ghost', html: icon('trash'),
        onclick: async () => {
          const ok = await confirmSheet({
            title: t('confirm_delete'),
            confirmLabel: t('delete_item'), cancelLabel: t('cancel'), danger: true,
          });
          if (!ok) return;
          await Items.remove(item.id);
          await refreshItems();
          close();
          toast(t('deleted'));
          ctx.rerender();
        },
      }),
    ),
  );

  const close = openSheet(body);
  return close;
}
