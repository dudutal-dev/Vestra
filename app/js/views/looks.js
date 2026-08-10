/* ============================================================
   VESTRA · My looks — the shelf

   A look is expensive to make. It costs a render, or a model call, or the
   minutes it takes to answer the studio's questions — and until now the only
   place any of them lived was eight tiles on the home screen, with the rest
   falling off the end.

   This is the whole shelf. It is also the answer to the question the app kept
   failing to ask: before building a look for Saturday night, is there already
   one? `matchingLooks` reads the saved shelf against an occasion and offers
   what fits, so the second wedding costs nothing.

   A look that carries a render leads with the render. That photograph is the
   best picture the app has of that outfit; showing garment thumbnails in front
   of it would be filing the print behind the negatives.
   ============================================================ */

import { el, icon, esc, toast, buzz, observeReveal, confirmSheet } from '../ui.js';
import { t, isHe, pick } from '../i18n.js';
import { state, refreshLooks, itemById } from '../state.js';
import { Looks } from '../store.js';
import { OCCASIONS, occName, occFormality, catIcon } from '../taxonomy.js';
import { newLookFromImages } from './renders.js';

/** The occasion a look was built for, as a key, when it is recoverable. */
function occasionKeyOf(look) {
  if (look?.occasion_key) return look.occasion_key;
  const label = (look?.occasion_he || look?.occasion_en || '').trim().toLowerCase();
  if (!label) return null;
  const hit = OCCASIONS.find(o => (o.name.he || '').toLowerCase() === label
    || (o.name.en || '').toLowerCase() === label);
  return hit?.key || null;
}

/**
 * Saved looks that would work for an occasion, best first.
 *
 * The exact occasion wins outright. Failing that, formality is what actually
 * decides whether an outfit can be worn somewhere — a cocktail look goes to a
 * gala and a gym look does not — so a look within one level is offered, and
 * anything further is not offered at all. Silence is a fair answer here; a bad
 * suggestion costs more than no suggestion, because acting on it means
 * arriving dressed wrong.
 */
export function matchingLooks(occasion, looks = state.looks, limit = 4) {
  if (!occasion) return [];
  const want = occFormality(occasion);

  return looks
    .map((look) => {
      const key = occasionKeyOf(look);
      const f = look.formality || (key ? occFormality(key) : null);
      const gap = f === null ? 99 : Math.abs(f - want);
      if (key !== occasion && gap > 1) return null;
      return {
        look,
        exact: key === occasion,
        gap,
        // A look with a render is worth more than one without: it is the only
        // version of the outfit anyone has actually seen.
        score: (key === occasion ? 100 : 0) + (10 - gap * 4)
          + ((look.renders || []).length ? 6 : 0)
          + Math.min(3, (look.items || []).length / 2),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || (b.look.createdAt || 0) - (a.look.createdAt || 0))
    .slice(0, limit);
}

/** One tile: the render if there is one, the pieces if there is not. */
export function lookTile(look, onOpen) {
  const render = (look.renders || [])[0];
  const items = (look.items || []).map(r => itemById(r.id)).filter(Boolean);

  return el('button', {
    class: 'card card-lift on-scroll',
    style: { padding: '0', overflow: 'hidden', textAlign: 'start', cursor: 'pointer', width: '100%' },
    onclick: () => onOpen(look),
  },
    render
      ? el('img', {
          src: render.dataUrl, alt: '', loading: 'lazy',
          style: { width: '100%', aspectRatio: '3/4', objectFit: 'cover', display: 'block' },
        })
      /* No render: the pieces stand in for it. A look whose garments have since
         been deleted has neither, and an empty beige rectangle reads as a broken
         image — say so instead. */
      : items.length
        ? el('div', {
            style: {
              width: '100%', aspectRatio: '3/4', display: 'grid',
              gridTemplateColumns: 'repeat(2,1fr)', gap: '2px', background: 'var(--cloud-3)',
            },
          },
          items.slice(0, 4).map(i => (i.thumb
            ? el('img', { src: i.thumb, alt: '', loading: 'lazy',
                style: { width: '100%', height: '100%', objectFit: 'cover' } })
            : el('div', { style: { display: 'grid', placeItems: 'center', fontSize: '22px' },
                text: catIcon(i.category) }))))
        : el('div', {
            style: {
              width: '100%', aspectRatio: '3/4', display: 'grid', placeItems: 'center',
              background: 'var(--cloud-3)', gap: '6px', textAlign: 'center', padding: 'var(--s3)',
            },
          },
          el('div', { style: { fontSize: '26px', opacity: .5 }, text: '👗' }),
          el('div', { class: 'micro muted', text: t('looks_empty_tile') })),
    el('div', { style: { padding: 'var(--s3)' } },
      el('div', { class: 'slot-name', style: { fontWeight: 600 },
        text: pick(look, 'occasion') || pick(look, 'title') || t('look_ready') }),
      el('div', { class: 'micro muted', style: { marginTop: '2px' },
        text: [
          (look.renders || []).length ? `${(look.renders || []).length} 📷` : null,
          items.length ? `${items.length} ${t('stat_items')}` : null,
          look.createdAt ? new Date(look.createdAt).toLocaleDateString(isHe() ? 'he-IL' : 'en-GB') : null,
        ].filter(Boolean).join(' · ') }),
    ),
  );
}

/**
 * Everything about a look that is worth searching, as one lowercase string.
 *
 * A look is remembered by its pieces far more often than by its label — "the
 * one with the camel coat", "that black dress" — and none of those words are in
 * the title. So the index reaches through to the garments and pulls in their
 * names, subcategories and colours alongside the look's own writing, in both
 * languages, because the owner switches between them and the saved look does
 * not.
 */
export function lookText(look) {
  const parts = [
    look.title_he, look.title_en, look.occasion_he, look.occasion_en,
    look.silhouette_he, look.silhouette_en, look.why_it_works_he, look.why_it_works_en,
    look.trend_note_he, look.trend_note_en, look.notes,
  ];
  for (const c of look.palette || []) parts.push(c.name_he, c.name_en);
  for (const row of look.items || []) {
    parts.push(row.reason_he, row.reason_en);
    const item = itemById(row.id);
    if (!item) continue;
    parts.push(item.name_he, item.name_en, item.subcategory, item.category,
      item.pattern, item.fabric_guess);
    // A colour is an object, not a string — pushing it whole indexes the words
    // "object Object" on every look and none of the colours on any of them.
    for (const c of [item.color_primary, ...(item.color_secondary || [])]) {
      if (c) parts.push(c.name_he, c.name_en);
    }
  }
  return parts.filter(s => typeof s === 'string').join(' ').toLowerCase();
}

/** Saved looks matching a free-text query — every word must appear somewhere. */
export function searchLooks(query, looks = state.looks) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return looks;
  return looks.filter((look) => {
    const hay = lookText(look);
    return words.every(w => hay.includes(w));
  });
}

export function renderLooks(root, ctx) {
  const looks = state.looks;

  let filter = ctx.opts?.occasion || '';
  let query = '';

  const grid = el('div', { class: 'grid-items stagger',
    style: { gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))' } });

  const paint = () => {
    /* Exact, not `matchingLooks`. That function answers "could this be worn
       there", which is what a suggestion wants; a chip labelled "cocktail" that
       lists a gym look is just wrong. */
    const byOcc = filter ? looks.filter(l => occasionKeyOf(l) === filter) : looks;
    const list = searchLooks(query, byOcc);
    grid.replaceChildren(...(list.length
      ? list.map(l => lookTile(l, ctx.openLook))
      : [el('p', { class: 'tiny muted',
          text: query ? t('looks_none_found') : filter ? t('looks_none_match') : t('looks_none') })]));
    observeReveal(grid);
  };

  const search = el('input', {
    class: 'input', type: 'search', placeholder: t('looks_search_ph'),
    oninput: (e) => { query = e.target.value; paint(); },
  });

  const chips = el('div', { class: 'seg scroll-x' },
    el('button', {
      class: `chip ${filter ? '' : 'is-on'}`, text: t('filter_all'),
      onclick: (e) => {
        filter = '';
        [...e.currentTarget.parentElement.children].forEach(n => n.classList.remove('is-on'));
        e.currentTarget.classList.add('is-on');
        paint();
      },
    }),
    /* Only the occasions a look was actually saved for. Filtering on
       `matchingLooks` instead would list nearly every occasion, because that
       function is deliberately generous — it answers "could this be worn
       there", which is the right question for a suggestion and the wrong one
       for a filter. */
    OCCASIONS.filter(o => looks.some(l => occasionKeyOf(l) === o.key)).map(o => el('button', {
      class: `chip ${filter === o.key ? 'is-on' : ''}`, text: `${o.icon} ${occName(o.key)}`,
      onclick: (e) => {
        filter = o.key;
        [...e.currentTarget.parentElement.children].forEach(n => n.classList.remove('is-on'));
        e.currentTarget.classList.add('is-on');
        paint();
      },
    })),
  );

  paint();

  root.replaceChildren(
    el('div', { class: 'pad stack g4', style: { paddingTop: 'var(--s4)' } },
      el('div', { class: 'row between g3' },
        el('div', {},
          el('h1', { style: { fontSize: 'var(--t-2xl)' }, text: t('looks_title') }),
          el('p', { class: 'tiny muted', style: { marginTop: '6px' },
            text: `${looks.length} ${t('stat_looks')}` }),
        ),
        el('button', {
          class: 'btn btn-quiet btn-sm tiny',
          html: icon('image') + `<span>${esc(t('render_new_look'))}</span>`,
          onclick: async () => { if (await newLookFromImages()) ctx.rerender(); },
        }),
      ),
      looks.length ? search : null,
      looks.length ? chips : null,
      grid,
    ),
  );
  observeReveal(root);
}

/** Delete a saved look, from the card. */
export async function deleteLook(look) {
  const ok = await confirmSheet({
    title: t('looks_delete'), body: t('looks_delete_ask'),
    confirmLabel: t('looks_delete'), cancelLabel: t('cancel'), danger: true,
  });
  if (!ok) return false;
  await Looks.remove(look.id);
  await refreshLooks();
  toast(t('looks_deleted'));
  buzz(12);
  return true;
}
