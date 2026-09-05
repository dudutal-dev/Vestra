/* ============================================================
   VESTRA · Renders — the picture that comes back

   The brief leaves the app, an image model answers it, and until now that was
   the end: the best image the app ever produced lived in a camera roll with no
   idea which look it belonged to.

   This closes the loop. A render is added straight to the look it came from,
   so a saved look carries the styling, the pieces, the reasoning — and the
   photograph. Anything can go in, not only a render: a photo of the outfit
   actually worn, a screenshot from a shop, a reference someone sent.

   Renders live on the look record rather than in their own store, because a
   render with no look is a picture of nothing. When there is no look to attach
   to, one is made for the image — a look whose only content is the picture is
   still a look worth keeping.
   ============================================================ */

import { el, icon, esc, toast, buzz, openSheet, confirmSheet } from '../ui.js';
import { t, isHe } from '../i18n.js';
import { state, refreshLooks } from '../state.js';
import { Looks, newId } from '../store.js';
import { compressImage } from '../ai.js';

/* Renders are photographs and they live in IndexedDB alongside everything
   else, so they are held to the same size discipline as a garment shot. */
const MAX_EDGE = 1400;
const QUALITY = 0.88;

/** Ask for image files and return them compressed, in the order chosen. */
function pickImages({ multiple = true } = {}) {
  return new Promise((resolve) => {
    const input = el('input', {
      type: 'file', accept: 'image/*', multiple: multiple || null,
      style: { position: 'fixed', left: '-9999px', top: '0' },
    });
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; input.remove(); resolve(v); } };
    input.addEventListener('change', async () => {
      const files = [...(input.files || [])];
      if (!files.length) return done([]);
      const out = [];
      for (const f of files) {
        try { out.push(await compressImage(f, MAX_EDGE, QUALITY)); } catch { /* skip the unreadable one */ }
      }
      done(out);
    });
    // A cancelled picker fires no event at all in most browsers, so the promise
    // is released on the next focus instead of hanging on the page forever.
    addEventListener('focus', () => setTimeout(() => done([]), 800), { once: true });
    document.body.append(input);
    input.click();
  });
}

/**
 * The makeup half of a look, in the shape it is stored.
 *
 * A render of the face is only half of what the owner needs to walk out the
 * door wearing that face: the other half is what went where, in which shade,
 * bought under which name. The beauty screen has all of it, and then loses it
 * the moment the app is closed. So the look carries it — every step with its
 * hex and its product names, plus the intensity the simulation was set to, so
 * a saved look can reopen the same brief it was rendered from.
 *
 * Slimmed on purpose: the beauty response is kept, the transient bits are not.
 */
export function makeupRecord(makeup, intensity = 1) {
  if (!makeup?.steps?.length) return null;
  return {
    look_key: makeup.look_key || null,
    look_name_he: makeup.look_name_he || '', look_name_en: makeup.look_name_en || '',
    duration_minutes: makeup.duration_minutes || null,
    steps: makeup.steps.map(s => ({
      area: s.area || '',
      technique: s.technique || null,
      finish: s.finish || null,
      instruction_he: s.instruction_he || '', instruction_en: s.instruction_en || '',
      product_type_he: s.product_type_he || '', product_type_en: s.product_type_en || '',
      shade_he: s.shade_he || '', shade_en: s.shade_en || '',
      shade_hex: s.shade_hex || null,
      ref: s.ref || null, alt: s.alt || null,
    })),
    trend_note_he: makeup.trend_note_he || '', trend_note_en: makeup.trend_note_en || '',
    longevity_tip_he: makeup.longevity_tip_he || '', longevity_tip_en: makeup.longevity_tip_en || '',
    engine: makeup.engine || 'ai',
    intensity: Number.isFinite(+intensity) ? +intensity : 1,
    savedAt: Date.now(),
  };
}

/** A look with its makeup stamped on — a no-op when there is nothing to stamp. */
export function withMakeup(look, makeup, intensity = 1) {
  const rec = makeupRecord(makeup, intensity);
  if (!rec) return look;
  return { ...look, makeup: rec, makeup_look: rec.look_key || look?.makeup_look || null };
}

/**
 * Attach images to a look, saving the look if it was never saved.
 *
 * Each shot may say what it is — `kind: 'outfit' | 'face'` — so the makeup
 * render can be told apart from the outfit render on the shelf. When the
 * makeup that was rendered is passed along, its details are saved on the same
 * record in the same write: the picture and the steps that made it, together.
 *
 * @returns the stored look record, or null.
 */
export async function addRenders(look, shots, { makeup = null, intensity = 1 } = {}) {
  if (!shots?.length) return null;
  const base = makeup ? withMakeup(look, makeup, intensity) : { ...look };
  const record = {
    ...base,
    id: look?.id || newId('look'),
    createdAt: look?.createdAt || Date.now(),
    renders: [...(look?.renders || []), ...shots.map(s => ({
      dataUrl: s.dataUrl || s,
      w: s.w || null, h: s.h || null,
      kind: s.kind || null,
      addedAt: Date.now(),
    }))],
  };
  await Looks.put(record);
  await refreshLooks();
  return record;
}

/** Pick images and attach them to `look`. Returns the updated record. */
export async function addRendersFrom(look) {
  const shots = await pickImages();
  if (!shots.length) return null;
  const rec = await addRenders(look, shots);
  if (rec) {
    buzz(14);
    toast(`${t('render_added')} · ${shots.length}`);
  }
  return rec;
}

/**
 * A look built from nothing but a picture.
 *
 * For the render of an outfit the app never assembled, or a photograph of
 * something worn that day. It gets the same card and the same shelf as any
 * other look; what it does not get is invented styling it was never given.
 */
export async function newLookFromImages() {
  const shots = await pickImages();
  if (!shots.length) return null;
  const rec = await addRenders({
    engine: 'photo',
    title_he: 'לוק מתמונה', title_en: 'Look from a photo',
    occasion_he: '', occasion_en: '',
    items: [], palette: [], gaps: [],
  }, shots);
  if (rec) {
    buzz(14);
    toast(t('render_look_made'));
  }
  return rec;
}

/** Remove one render from a look. */
export async function removeRender(look, index) {
  if (!look?.id || !look.renders?.[index]) return null;
  const renders = look.renders.filter((_, i) => i !== index);
  const record = { ...look, renders };
  await Looks.put(record);
  await refreshLooks();
  return record;
}

/** The renders on a look, as a strip with a viewer, plus the add button. */
export function renderStrip(look, { onChange } = {}) {
  const shots = look?.renders || [];

  const host = el('div', { class: 'stack g2', style: { marginTop: 'var(--s3)' } });

  const paint = () => {
    const current = state.looks.find(l => l.id === look?.id) || look;
    const list = current?.renders || [];
    /* Filtered, not passed straight through. `el` drops a null child, so the
       same expression is harmless there — but `replaceChildren` is a DOM method
       and stringifies anything that is not a Node. Every look without a render
       yet was printing the word "null" above its add button. */
    host.replaceChildren(...[
      list.length ? el('div', { class: 'row g2 wrap' },
        list.map((r, i) => el('button', {
          class: 'card card-lift',
          style: { padding: '4px', width: '92px', cursor: 'zoom-in' },
          onclick: () => openViewer(current, i, () => { paint(); onChange?.(); }),
        },
          el('img', {
            src: r.dataUrl, alt: '', loading: 'lazy',
            style: { width: '100%', height: '116px', objectFit: 'cover', borderRadius: 'var(--r-sm)' },
          }),
          // The face render is the makeup; say so, or two thumbnails of the
          // same person read as one take and a retake.
          r.kind === 'face' ? el('div', { class: 'micro', style: {
            marginTop: '3px', textAlign: 'center', color: 'var(--oxblood)', fontWeight: 600,
          }, text: t('render_face_tag') }) : null,
        )),
      ) : null,
      el('button', {
        class: list.length ? 'btn btn-quiet btn-block btn-sm tiny' : 'btn btn-ghost btn-block btn-sm',
        html: icon('image') + `<span>${esc(list.length ? t('render_add_more') : t('render_add'))}</span>`,
        onclick: async () => {
          const rec = await addRendersFrom(current);
          if (rec) { Object.assign(look, rec); paint(); onChange?.(rec); }
        },
      }),
    ].filter(Boolean));
  };

  paint();
  return host;
}

/** Full-size view of one render, with the option to remove it. */
function openViewer(look, index, onChange) {
  const r = look.renders[index];
  if (!r) return;

  let close = () => {};
  close = openSheet(el('div', {},
    el('div', { class: 'eyebrow', text: r.kind === 'face' ? t('render_face_one') : t('render_one') }),
    el('img', {
      src: r.dataUrl, alt: '',
      style: { width: '100%', borderRadius: 'var(--r-md)', marginTop: 'var(--s3)', display: 'block' },
    }),
    el('div', { class: 'row g2', style: { marginTop: 'var(--s4)' } },
      el('a', {
        class: 'btn btn-ghost btn-sm grow', href: r.dataUrl,
        download: `vestra-render-${index + 1}.jpg`, text: t('render_save_file'),
      }),
      el('button', {
        class: 'btn btn-quiet btn-sm', text: t('render_remove'),
        onclick: async (e) => {
          const btn = e.currentTarget;
          const ok = await confirmSheet({
            title: t('render_remove'), confirmLabel: t('render_remove'),
            cancelLabel: t('cancel'), danger: true,
          });
          if (!ok) return;
          btn.disabled = true;
          await removeRender(look, index);
          toast(t('render_removed'));
          onChange?.();
          close();
        },
      }),
    ),
    el('p', { class: 'micro muted', style: { marginTop: 'var(--s4)' },
      text: isHe() ? 'התמונה נשמרת במכשיר שלך, בתוך הלוק.' : 'The image is stored on your device, inside the look.' }),
  ));
}
