/* ============================================================
   VESTRA · Home
   ============================================================ */

import { el, icon, esc, splitText, observeReveal } from '../ui.js';
import { t, greeting, isHe } from '../i18n.js';
import { state } from '../state.js';
import { closetScore } from '../store.js';
import { TRENDS_TICKER, catIcon, lbl } from '../taxonomy.js';
import { renderLookMini } from './lookcard.js';

export function renderHome(root, { go, openItem, openLook }) {
  const p = state.profile;
  const items = state.items;
  const score = closetScore(items);

  const hero = el('section', { class: 'hero reveal reveal-1' },
    el('div', { class: 'eyebrow', text: `${greeting()}${p.name ? ', ' + p.name : ''}` }),
    el('h1', { class: 'hero-title' }),
    el('p', { class: 'tiny muted', text: t('home_hero_sub') }),
    el('button', {
      class: 'btn btn-lux', style: { marginTop: '18px' },
      html: icon('sparkles') + `<span>${esc(t('home_cta'))}</span>`,
      onclick: () => go('studio'),
    }),
  );

  const tiles = el('div', { class: 'tiles reveal reveal-3' },
    tile('camera', t('q_add'), t('q_add_sub'), 'rgba(198,166,103,.24)', () => go('capture', { mode: 'item' })),
    tile('hanger', t('q_pair'), t('q_pair_sub'), 'rgba(110,31,40,.16)', () => go('wardrobe', { pairMode: true })),
    tile('wardrobe', t('q_closet'), t('q_closet_sub'), 'rgba(154,169,137,.24)', () => go('capture', { mode: 'closet' })),
    tile('lipstick', t('q_beauty'), t('q_beauty_sub'), 'rgba(185,163,196,.26)', () => go('beauty')),
  );

  const stats = el('section', { class: 'card reveal reveal-4' },
    el('div', { class: 'row between g4' },
      stat(items.length, t('stat_items')),
      el('span', { style: { width: '1px', height: '38px', background: 'var(--line)' } }),
      stat(state.looks.length, t('stat_looks')),
      el('span', { style: { width: '1px', height: '38px', background: 'var(--line)' } }),
      el('div', { class: 'row g3' },
        el('div', { class: 'ring', style: { '--p': score } }, el('b', { text: score })),
        el('div', { class: 'micro muted', style: { maxWidth: '70px' }, text: t('stat_score') }),
      ),
    ),
  );

  const ticker = el('div', { class: 'marquee reveal reveal-5', style: { marginInline: 'calc(var(--s5) * -1)' } },
    el('div', { class: 'marquee-track' },
      [...TRENDS_TICKER, ...TRENDS_TICKER].map((tr, i) =>
        el('span', { class: 'marquee-item' },
          el('b', { text: i % 2 ? 'F/W 26' : '2026' }),
          el('span', { text: lbl(tr) }))),
    ),
  );

  const recent = items.length
    ? section(t('home_recent'), t('nav_wardrobe'), () => go('wardrobe'),
        el('div', { class: 'scroll-x stagger' },
          items.slice(0, 10).map(i => el('button', {
            class: 'item', style: { width: '128px' }, 'data-cat': i.category,
            onclick: () => openItem(i),
          },
            i.thumb
              ? el('img', { class: 'item-img', src: i.thumb, alt: '', loading: 'lazy' })
              : el('div', { class: 'item-img', style: { display: 'grid', placeItems: 'center', fontSize: '28px' }, text: catIcon(i.category) }),
            el('div', { class: 'item-body' },
              el('div', { class: 'item-name', text: (isHe() ? i.name_he : i.name_en) || i.subcategory }),
            ),
          ))),
      )
    : el('div', { class: 'empty card card-flat reveal reveal-6' },
        el('div', { html: icon('hanger'), style: { width: '62px', margin: '0 auto var(--s4)' } }),
        el('h3', { text: t('empty_wardrobe_t') }),
        el('p', { class: 'tiny muted', text: t('empty_wardrobe_s') }),
        el('button', {
          class: 'btn btn-primary', style: { marginTop: '8px' },
          html: icon('camera') + `<span>${esc(t('add_first'))}</span>`,
          onclick: () => go('capture', { mode: 'item' }),
        }),
      );

  const looks = state.looks.length
    ? section(t('home_looks'), null, null,
        el('div', { class: 'scroll-x' },
          state.looks.slice(0, 8).map(l => renderLookMini(l, openLook))),
      )
    : null;

  root.replaceChildren(
    el('div', { class: 'pad stack g5', style: { paddingTop: 'var(--s4)' } }, hero),
    el('div', { class: 'pad' },
      el('div', { class: 'sect' },
        el('div', { class: 'eyebrow', style: { marginBottom: 'var(--s3)' }, text: t('home_quick') }),
        tiles),
      el('div', { class: 'sect' }, stats),
    ),
    el('div', { class: 'pad', style: { marginTop: 'var(--s6)' } }, ticker),
    el('div', { class: 'pad' }, recent, looks),
  );

  splitText(hero.querySelector('.hero-title'), t('home_hero_title'));
  observeReveal(root);
}

/* ---------------- helpers ---------------- */
function tile(ic, title, sub, tint, onclick) {
  return el('button', {
    class: 'tile', onclick,
    style: { '--tint': `radial-gradient(circle, ${tint}, transparent 70%)` },
  },
    el('span', { html: icon(ic) }),
    el('b', { text: title }),
    el('span', { text: sub }),
  );
}

const stat = (n, label) => el('div', { class: 'stack' },
  el('div', { class: 'serif-xl', text: String(n) }),
  el('div', { class: 'micro muted', text: label }),
);

function section(title, linkLabel, onLink, body) {
  return el('div', { class: 'sect on-scroll' },
    el('div', { class: 'sect-head' },
      el('h3', { class: 'sect-title', text: title }),
      linkLabel ? el('button', { class: 'btn btn-quiet btn-sm tiny', text: linkLabel, onclick: onLink }) : null,
    ),
    body,
  );
}
