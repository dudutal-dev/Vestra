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
import { hasGoogleKey } from '../store.js';
import { renderImage } from '../gemini.js';
import { errText } from '../ai.js';
import { addRenders } from './renders.js';

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
 * Three details make it work rather than nearly work. The files are built
 * before the tap, because iOS treats the user gesture as spent once an await
 * has resolved and refuses the share. The clipboard write is started but not
 * awaited, for the same reason — it lands during the gesture while `share` is
 * still the thing being called from it. And it is started *first*: `share`
 * spends the gesture the instant it is called, so a clipboard write placed
 * after it is refused every time. Reversing those two lines looks harmless,
 * costs nothing on desktop, and silently ships an iPhone the photographs with
 * no brief to paste beside them.
 */

/**
 * Put the brief on the clipboard from inside a user gesture.
 *
 * Safari added the promise form of `ClipboardItem` for exactly this: the write
 * is authorised at the moment of the tap and the content is allowed to arrive
 * later. `writeText` has to have its string ready synchronously, and is the
 * fallback everywhere else.
 */
function copyForShare(text) {
  const clip = navigator.clipboard;
  if (!clip) return Promise.reject(new Error('no clipboard'));
  try {
    if (typeof ClipboardItem === 'function' && clip.write) {
      const blob = new Blob([text], { type: 'text/plain' });
      return clip.write([new ClipboardItem({ 'text/plain': Promise.resolve(blob) })]);
    }
  } catch { /* fall through to writeText */ }
  return clip.writeText(text);
}

/**
 * Call `navigator.share` without letting it take the app down with it.
 *
 * Two things go wrong on iOS, and neither is ours to fix — only to survive. The
 * promise `share` returns does not always settle: dismissed with a swipe rather
 * than the Cancel button, it can simply hang. And WebKit refuses a second share
 * while it believes one is still in flight, so once one has hung every share
 * after it fails too. That is what "the whole app is stuck" actually is — a
 * disabled button, a scrim over everything, and nothing that will ever answer.
 *
 * So: one share at a time, and the UI stops waiting after a few seconds
 * whatever the promise decides to do. The share itself is left running — if the
 * sheet really is still up, the owner can still pick an app from it.
 */
let sharing = false;

function shareOnce(payload) {
  if (sharing) return Promise.resolve('busy');
  sharing = true;

  let settled = false;
  const done = (v) => { settled = true; sharing = false; return v; };

  const call = navigator.share(payload).then(
    () => done('shared'),
    (e) => done(e?.name === 'AbortError' ? 'cancelled' : 'unsupported'));

  /* The watchdog frees the button; it does not cancel the share. Two and a half
     seconds, not six: while the system sheet is up the page is covered anyway,
     so the only thing a long wait buys is a dead button once the sheet closes —
     which is the freeze itself, seen from the owner's side. It releases
     `sharing` too, because a share that has not answered by now is one WebKit
     has lost track of, and refusing every later attempt on its behalf helps
     nobody. */
  const watchdog = new Promise(resolve => setTimeout(() => {
    if (settled) return;
    sharing = false;
    resolve('pending');
  }, 2500));

  return Promise.race([call, watchdog]);
}

async function sharePhotosAndCopy(text, files) {
  if (!navigator.share || !files?.length) return { share: 'unsupported', copied: false };
  const payload = { files };
  if (navigator.canShare && !navigator.canShare(payload)) return { share: 'unsupported', copied: false };

  // Clipboard first, share second, neither awaited before the other is called.
  // See the note above — the order is the whole trick.
  let copied = true;
  try {
    copyForShare(text).catch(() => { copied = false; });
  } catch {
    copied = false;
  }

  const share = await shareOnce(payload);
  return { share, copied };
}

/** Text and files in one share — right where the platform allows it. */
async function shareEverything(text, files) {
  if (!navigator.share || !files?.length) return 'unsupported';
  const payload = { text, files };
  if (navigator.canShare && !navigator.canShare(payload)) return { share: 'unsupported', copied: true };
  // The text travels inside the share here, so there is nothing to copy.
  return { share: await shareOnce(payload), copied: true };
}

/**
 * Open the brief for a look.
 *
 * @param kind   'makeup' | 'tryon'
 * @param prompt the instruction text
 * @param photos [{ label, dataUrl, filename }] — the references it mentions
 * @param look   the look the render belongs to, so the picture that comes back
 *               lands on it. May be unsaved — attaching the render saves it.
 */
export function openBrief({ kind, prompt, photos = [], look = null }) {
  if (!prompt) {
    toast(t('brief_nothing'), 'warn');
    return;
  }

  const field = el('textarea', {
    class: 'textarea', readonly: true, rows: '12',
    style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px', lineHeight: '1.5' },
    value: prompt,
  });

  const canRender = hasGoogleKey();

  const copyBtn = el('button', {
    // Quiet once sharing is on the screen: the share carries the photographs
    // too, and copying the text alone leaves the owner to find them.
    class: canRender || (photos.length && navigator.share) ? 'btn btn-ghost btn-block' : 'btn btn-primary btn-block',
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

  /* The in-app render. With a Google key on file the brief doesn't have to
     leave: the same text and the same photographs, in the same order the
     manifest numbers them, go to the image model directly, and the picture
     lands on the look it was made for. The manual handover below survives as
     the free path and the second opinion. */
  const preview = el('div');
  /* `disabled` covers a tap while a render is running; this covers the tap
     that isn't one — mobile browsers can synthesise a second click from one
     touch (the classic ghost click), and each render here costs money. */
  let rendering = false;
  const renderBtn = canRender ? el('button', {
    class: 'btn btn-primary btn-block',
    html: icon('sparkles') + `<span>${esc(t('brief_render_now'))}</span>`,
    onclick: async (e) => {
      if (rendering) return;
      rendering = true;
      const btn = e.currentTarget;
      const label = btn.querySelector('span');
      btn.disabled = true;
      label.textContent = t('brief_rendering');
      try {
        const shot = await renderImage({ prompt, photos });
        const rec = await addRenders(look || {
          engine: 'photo',
          title_he: 'הדמיה', title_en: 'Render',
          occasion_he: '', occasion_en: '',
          items: [], palette: [], gaps: [],
        }, [shot]);
        /* The caller's copy of an unsaved look has no id until this moment.
           Give it the one the render was filed under, or the next "save look"
           tap would shelve the same look twice. */
        if (look && rec) { look.id = rec.id; look.createdAt = rec.createdAt; look.renders = rec.renders; }
        preview.replaceChildren(
          el('div', { class: 'eyebrow', style: { margin: 'var(--s3) 0 var(--s2)' }, text: t('brief_render_done') }),
          el('img', { src: shot.dataUrl, alt: '',
            style: { width: '100%', borderRadius: 'var(--r-md)', display: 'block' } }),
        );
        buzz(14);
        toast(t('brief_render_done'));
      } catch (err) {
        toast(errText(err), 'warn');
      }
      label.textContent = t('brief_render_now');
      btn.disabled = false;
      rendering = false;
    },
  }) : null;

  /* Whatever the share does, the owner is told what happened to the copy.
     That is the half of the handover this screen can actually be sure about,
     and the half that decides whether there is anything to paste — a silent
     tap that moved six photographs and no brief is exactly the failure this
     split was built to avoid. */
  const shareResult = ({ share, copied }) => {
    if (share === 'busy') return;
    if (share === 'shared' || share === 'pending') {
      buzz(14);
      toast(copied ? t('brief_share_done') : t('brief_share_nocopy'), copied ? '' : 'warn');
      return;
    }
    // Backed out of the system sheet. Nothing was sent — but the brief is on
    // the clipboard either way, and that is worth a line.
    if (share === 'cancelled') { if (copied) toast(t('brief_copied')); return; }
    toast(copied ? t('brief_share_no_copied') : t('brief_share_no'), 'warn');
  };

  const shareBtn = photos.length && navigator.share ? el('button', {
    // Second place once the render happens in-app.
    class: renderBtn ? 'btn btn-ghost btn-block' : 'btn btn-primary btn-block',
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
      text: renderBtn ? t('brief_render_how') : shareBtn ? t('brief_share_how') : t('brief_how') }),

    renderBtn,
    preview,
    renderBtn ? el('div', { style: { height: 'var(--s3)' } })
      // No key yet — one quiet line saying the button exists and what it costs.
      : el('p', { class: 'micro muted', style: { marginBottom: 'var(--s3)' }, text: t('brief_render_hint') }),
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
    // A beauty look is not a look record; a render of it is filed under a
    // fresh photo-look named after it, the way newLookFromImages does.
    look: {
      engine: 'photo',
      title_he: look?.look_name_he || 'הדמיית איפור',
      title_en: look?.look_name_en || 'Makeup render',
      occasion_he: '', occasion_en: '',
      items: [], palette: [], gaps: [],
      makeup_look: look?.look_key || null,
    },
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
    look,
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
    look,
    photos: built.photos.map(p => ({
      label: p.role === 'subject' ? (isHe() ? 'את/ה' : 'the person')
        : p.role === 'face' ? (isHe() ? 'הפנים' : 'the face')
          : p.label_en,
      dataUrl: p.dataUrl,
      filename: p.filename,
    })),
  });
}
