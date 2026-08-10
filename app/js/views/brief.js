/* ============================================================
   VESTRA · The render brief

   VESTRA is a static site with no server, so it cannot run an image model
   itself and it cannot reach one through a Claude connector — a connector is
   bound to a Claude account and answers to a Claude client, not to a web page.

   So the work is split where it naturally divides. The app knows things a
   render needs and a person would have to retype: which garments, in what
   colours and fabrics, at what formality, on what body, with which shades of
   makeup and why. It writes that brief. The render happens wherever the owner
   already has an image model — a Claude conversation with an image connector,
   or any tool that takes a prompt and a few reference photos.

   What this screen has to get right is the handover: the brief in one tap, the
   photos it refers to in the next, and no retyping in between.
   ============================================================ */

import { el, icon, esc, toast, openSheet, buzz } from '../ui.js';
import { t, isHe, pick } from '../i18n.js';
import { state } from '../state.js';
import { makeupPrompt, tryOnPrompt, tryOnAttachments } from '../prompt.js';
import { subName } from '../taxonomy.js';

/** Copy text, falling back to a selectable field where the clipboard is blocked. */
async function copyText(text, field) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Safari refuses the clipboard outside a user gesture, and any page served
    // over plain http has no clipboard at all. Selecting the text is the
    // fallback that always works.
    field?.focus();
    field?.select();
    return false;
  }
}

/** Save one image to the device, so it can be attached wherever the render happens. */
function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
}

const safeName = (s) => String(s || 'item').replace(/[^\w֐-׿-]+/g, '-').slice(0, 40);

/**
 * Open the brief for a look.
 *
 * @param kind   'makeup' | 'tryon'
 * @param prompt the instruction text
 * @param photos [{ label, dataUrl, filename }] — the references it mentions
 */
export function openBrief({ kind, prompt, photos = [] }) {
  if (!prompt) {
    toast(t('brief_nothing'), 'warn');
    return;
  }

  const field = el('textarea', {
    class: 'textarea', readonly: true, rows: '12',
    style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px', lineHeight: '1.5' },
    value: prompt,
  });

  const copyBtn = el('button', {
    class: 'btn btn-primary btn-block',
    html: icon('download') + `<span>${esc(t('brief_copy'))}</span>`,
    onclick: async () => {
      const done = await copyText(prompt, field);
      buzz(12);
      toast(done ? t('brief_copied') : t('brief_select'), done ? '' : 'warn');
    },
  });

  const body = el('div', {},
    el('div', { class: 'eyebrow', text: kind === 'makeup' ? t('brief_makeup') : t('brief_tryon') }),
    el('h3', { style: { marginBlock: '6px var(--s3)' }, text: t('brief_title') }),
    el('p', { class: 'tiny muted', style: { marginBottom: 'var(--s4)' }, text: t('brief_how') }),

    copyBtn,
    el('div', { style: { marginTop: 'var(--s3)' } }, field),

    photos.length ? el('div', { style: { marginTop: 'var(--s5)' } },
      el('div', { class: 'eyebrow', style: { marginBottom: 'var(--s2)' },
        text: `${t('brief_photos')} · ${photos.length}` }),
      el('p', { class: 'micro muted', style: { marginBottom: 'var(--s3)' }, text: t('brief_photos_why') }),
      el('div', { class: 'row g2 wrap' },
        photos.map(p => el('button', {
          class: 'card card-lift',
          style: { padding: '6px', width: '84px', textAlign: 'center', cursor: 'pointer' },
          onclick: () => { downloadDataUrl(p.dataUrl, p.filename); buzz(10); },
        },
          el('img', { src: p.dataUrl, alt: '', loading: 'lazy',
            style: { width: '100%', height: '86px', objectFit: 'cover', borderRadius: 'var(--r-sm)' } }),
          el('div', { class: 'micro muted', style: { marginTop: '4px', lineHeight: 1.25 }, text: p.label }),
        ))),
      el('button', {
        class: 'btn btn-ghost btn-block btn-sm', style: { marginTop: 'var(--s3)' },
        html: icon('download') + `<span>${esc(t('brief_save_all'))}</span>`,
        onclick: () => {
          // Sequenced: browsers drop simultaneous downloads on the floor.
          photos.forEach((p, i) => setTimeout(() => downloadDataUrl(p.dataUrl, p.filename), i * 320));
          buzz(12);
          toast(`${t('brief_saved')} · ${photos.length}`);
        },
      }),
    ) : null,

    el('p', { class: 'micro muted', style: { marginTop: 'var(--s5)' }, text: t('brief_privacy') }),
  );

  openSheet(body);
}

/** The brief for the makeup look currently on screen. */
export function openMakeupBrief(look, { intensity = 1 } = {}) {
  const rec = state.face;
  const photos = [];
  if (rec?.photo) {
    photos.push({
      label: isHe() ? 'תמונת הפנים' : 'your face',
      dataUrl: rec.photo,
      filename: 'vestra-face.jpg',
    });
  }
  openBrief({
    kind: 'makeup',
    prompt: makeupPrompt({ look, face: rec?.face || null, intensity }),
    photos,
  });
}

/** The brief for an outfit — the body photo plus every garment it names. */
export function openTryOnBrief(look) {
  const items = state.items;
  const rec = state.body;
  const photos = [];

  if (rec?.photo) {
    photos.push({
      label: isHe() ? 'תמונת הגוף' : 'your body',
      dataUrl: rec.photo,
      filename: 'vestra-body.jpg',
    });
  }
  for (const a of tryOnAttachments({ look, items })) {
    photos.push({
      label: a.name_en || subName(a.id),
      dataUrl: a.thumb,
      filename: `vestra-${safeName(a.name_en)}.jpg`,
    });
  }

  openBrief({
    kind: 'tryon',
    prompt: tryOnPrompt({
      look,
      items,
      occasion: state.request?.occasion || null,
      body: rec?.body || null,
    }),
    photos,
  });
}
