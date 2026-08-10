/* ============================================================
   VESTRA · The render brief

   VESTRA is a static site with no server, so it cannot run an image model
   itself. The work splits where it naturally divides: the app knows things a
   render needs and a person would have to retype — which garments, in what
   colours and fabrics, at what formality, on what body, with which shades of
   makeup and why — so it writes the brief, and the render happens wherever the
   owner already has an image model.

   Everything on this screen is about the handover, because that is where the
   friction actually was. Copying the text is easy; what cost the owner real
   effort was the rest of it — finding four photographs in a camera roll and
   attaching them in the right order, then doing it again for the makeup. So
   the brief now goes out as one share carrying the text and the photographs
   together, and the outfit and the makeup travel as one instruction rather
   than two: the same photograph, the same person, one render.
   ============================================================ */

import { el, icon, esc, toast, openSheet, buzz } from '../ui.js';
import { t, isHe, pick } from '../i18n.js';
import { state } from '../state.js';
import { makeupPrompt, tryOnPrompt, tryOnAttachments, fullBrief } from '../prompt.js';
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

/** A data URL as a File, so it can go through the share sheet. */
async function asFile(dataUrl, filename) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const type = blob.type || 'image/jpeg';
  const name = /\.\w+$/.test(filename) ? filename : `${filename}.${type.split('/')[1] || 'jpg'}`;
  return new File([blob], name, { type });
}

/**
 * Hand the brief over the way the phone will actually let you.
 *
 * The obvious move is one share carrying the text and the photographs
 * together, and on Android and desktop that is what happens. On iOS it fails
 * in a way that looks like the feature is broken: the share sheet appears but
 * the app you wanted is missing from it. iOS only offers a target that accepts
 * *every* item in the payload, and a share extension that happily takes images
 * will not take images plus a page of text — so the list empties out.
 *
 * So the photographs go through the share sheet on their own, where every
 * image-accepting app is offered, and the text goes to the clipboard in the
 * same tap. The owner picks the app, the pictures arrive, and the brief is
 * already waiting to be pasted.
 *
 * Two details make it work rather than nearly work. The files are built before
 * the tap, because iOS treats the user gesture as spent once an await has
 * resolved and refuses the share. And the clipboard write is started but not
 * awaited, for the same reason — it lands during the gesture while `share` is
 * still the thing being called from it.
 */
async function sharePhotosAndCopy(text, files) {
  if (!navigator.share || !files?.length) return 'unsupported';
  const payload = { files };
  if (navigator.canShare && !navigator.canShare(payload)) return 'unsupported';

  let copied = true;
  try {
    navigator.clipboard?.writeText(text).catch(() => { copied = false; });
  } catch {
    copied = false;
  }

  try {
    await navigator.share(payload);
    return copied ? 'shared' : 'shared-no-copy';
  } catch (e) {
    return e?.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

/** Text and files in one share — right where the platform allows it. */
async function shareEverything(text, files) {
  if (!navigator.share || !files?.length) return 'unsupported';
  const payload = { text, files };
  if (navigator.canShare && !navigator.canShare(payload)) return 'unsupported';
  try {
    await navigator.share(payload);
    return 'shared';
  } catch (e) {
    return e?.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

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
    // Quiet once sharing is on the screen: the share carries the photographs
    // too, and copying the text alone leaves the owner to find them.
    class: photos.length && navigator.share ? 'btn btn-ghost btn-block' : 'btn btn-primary btn-block',
    html: icon('download') + `<span>${esc(t('brief_copy'))}</span>`,
    onclick: async () => {
      const done = await copyText(prompt, field);
      buzz(12);
      toast(done ? t('brief_copied') : t('brief_select'), done ? '' : 'warn');
    },
  });

  /* Built ahead of the tap. iOS counts the user gesture as spent once an await
     has resolved, so turning six data URLs into Files inside the click handler
     is enough to make `share` throw — the sheet simply never opens. */
  let files = null;
  if (photos.length && navigator.share) {
    Promise.all(photos.map(p => asFile(p.dataUrl, p.filename)))
      .then(f => { files = f; })
      .catch(() => { files = null; });
  }

  const shareResult = (res) => {
    if (res === 'shared') { buzz(14); toast(t('brief_share_done')); return; }
    if (res === 'shared-no-copy') { buzz(14); toast(t('brief_share_nocopy'), 'warn'); return; }
    if (res === 'cancelled') return;
    toast(t('brief_share_no'), 'warn');
  };

  const shareBtn = photos.length && navigator.share ? el('button', {
    class: 'btn btn-primary btn-block',
    html: icon('upload') + `<span>${esc(t('brief_share'))}</span>`,
    onclick: async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      shareResult(await sharePhotosAndCopy(prompt, files));
      btn.disabled = false;
    },
  }) : null;

  /* Kept for the platforms that do carry both at once — Android and desktop
     put the brief and the pictures into the target app in a single step. */
  const shareAllBtn = shareBtn ? el('button', {
    class: 'btn btn-quiet btn-block btn-sm tiny',
    html: icon('upload') + `<span>${esc(t('brief_share_all'))}</span>`,
    onclick: async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      shareResult(await shareEverything(prompt, files));
      btn.disabled = false;
    },
  }) : null;

  const body = el('div', {},
    el('div', { class: 'eyebrow', text: kind === 'makeup' ? t('brief_makeup') : kind === 'full' ? t('brief_full') : t('brief_tryon') }),
    el('h3', { style: { marginBlock: '6px var(--s3)' }, text: t('brief_title') }),
    el('p', { class: 'tiny muted', style: { marginBottom: 'var(--s4)' },
      text: shareBtn ? t('brief_share_how') : t('brief_how') }),

    shareBtn,
    shareBtn ? el('ol', { class: 'micro muted', style: { margin: 'var(--s2) 0 var(--s3)', paddingInlineStart: '18px' } },
      el('li', { text: t('brief_step1') }),
      el('li', { text: t('brief_step2') }),
      el('li', { text: t('brief_step3') }),
    ) : null,
    shareAllBtn,
    shareAllBtn ? el('div', { style: { height: 'var(--s3)' } }) : null,
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

/**
 * Outfit and makeup in one brief, for the owner who is going to paste it into
 * an image model anyway.
 *
 * The canvas simulations exist so there is an answer offline and instantly.
 * This exists because the answer a real image model gives is better, and the
 * only thing standing between the two was assembling the attachments by hand.
 */
export function openFullBrief(look, { makeup = null, intensity = 1 } = {}) {
  const bodyRec = state.body;
  const faceRec = state.face;
  const subject = bodyRec?.photo || faceRec?.photo || null;

  if (!subject) {
    toast(t('brief_need_photo'), 'warn');
    return;
  }

  const built = fullBrief({
    look,
    makeup,
    items: state.items,
    face: faceRec?.face || null,
    body: bodyRec?.body || null,
    occasion: state.request?.occasion || null,
    intensity,
    subject,
    faceCloseUp: faceRec?.photo || null,
  });

  if (!built) {
    toast(t('brief_nothing'), 'warn');
    return;
  }

  openBrief({
    kind: 'full',
    prompt: built.text,
    photos: built.photos.map(p => ({
      label: p.role === 'subject' ? (isHe() ? 'את/ה' : 'the person')
        : p.role === 'face' ? (isHe() ? 'הפנים' : 'the face')
          : p.label_en,
      dataUrl: p.dataUrl,
      filename: p.filename,
    })),
  });
}
