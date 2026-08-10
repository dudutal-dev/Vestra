/* ============================================================
   VESTRA · Place the anchors yourself

   The on-device detector finds a face by looking for a pair of eye whites. It
   is good on the photograph the guide asks for and it fails honestly when it
   cannot be sure — but "honestly" still means the beauty screen has nothing to
   show, and some perfectly good portraits fail it. A head turned even slightly
   shows white on one side of an iris only, so the patch it finds sits at the
   corner of the eye rather than on the pupil, and a frame built from a corner
   is tilted enough to be thrown out.

   Three taps settle it. `regionsFromAnchors` was written to be driven this way
   — the pupils set the scale and the tilt, the mouth sets how far the head is
   turned, and every other region follows by proportion — so a map placed by
   hand is not a downgraded map. It is the same map, from better anchors.
   ============================================================ */

import { el, icon, esc, toast, buzz } from '../ui.js';
import { t, isHe } from '../i18n.js';
import { state, refreshMedia } from '../state.js';
import { Media } from '../store.js';
import { regionsFromAnchors } from '../vision.js';
import { loadImage } from '../makeup.js';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/* Where the pins start when there is nothing to start from. Roughly where the
   features of a framed portrait sit, so most photos need a nudge rather than a
   placement. */
const DEFAULTS = {
  eyeL: { x: 0.40, y: 0.40 },
  eyeR: { x: 0.60, y: 0.40 },
  mouth: { x: 0.50, y: 0.62 },
};

const PIN = [
  { key: 'eyeL', color: '#5C1A22' },
  { key: 'eyeR', color: '#5C1A22' },
  { key: 'mouth', color: '#C7A96B' },
];

/** Read the current anchors out of an existing region map, if there is one. */
function fromRegions(regions) {
  if (!regions?.eye_left || !regions?.eye_right) return null;
  return {
    eyeL: { x: regions.eye_left.cx, y: regions.eye_left.cy },
    eyeR: { x: regions.eye_right.cx, y: regions.eye_right.cy },
    mouth: regions.lips
      ? { x: regions.lips.cx, y: regions.lips.cy }
      : { ...DEFAULTS.mouth },
  };
}

export function renderAnchors(root, ctx) {
  const rec = state.face;
  if (!rec?.photo) {
    toast(t('anchor_need_photo'), 'warn');
    ctx.go('profile');
    return;
  }

  const anchors = fromRegions(rec.regions) || { ...DEFAULTS };
  let active = 'eyeL';

  const img = el('img', {
    src: rec.photo, alt: '', draggable: 'false',
    style: { width: '100%', display: 'block', borderRadius: 'var(--r-md)', userSelect: 'none' },
  });

  const stage = el('div', {
    style: { position: 'relative', touchAction: 'none', cursor: 'crosshair' },
  }, img);

  const pins = {};
  for (const { key, color } of PIN) {
    pins[key] = el('div', {
      'aria-hidden': 'true',
      style: {
        position: 'absolute', width: '26px', height: '26px', marginLeft: '-13px', marginTop: '-13px',
        borderRadius: '50%', border: `2px solid ${color}`, background: 'rgba(255,255,255,0.28)',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.8), 0 2px 8px rgba(0,0,0,0.35)',
        pointerEvents: 'none', transition: 'box-shadow .15s',
      },
    },
      // A dot in the middle: the ring alone is hard to centre on a pupil.
      el('div', {
        style: {
          position: 'absolute', inset: '11px', borderRadius: '50%', background: color,
        },
      }),
    );
    stage.append(pins[key]);
  }

  const place = () => {
    for (const { key } of PIN) {
      pins[key].style.left = `${anchors[key].x * 100}%`;
      pins[key].style.top = `${anchors[key].y * 100}%`;
      pins[key].style.boxShadow = key === active
        ? '0 0 0 3px var(--oxblood), 0 2px 10px rgba(0,0,0,0.4)'
        : '0 0 0 1px rgba(255,255,255,0.8), 0 2px 8px rgba(0,0,0,0.35)';
    }
  };

  /* One handler for tap and drag alike. Tapping the photo moves whichever pin
     is selected — on a phone that is far easier than hitting a 26px target,
     and it means the three steps can be walked through without ever dragging. */
  const moveTo = (e) => {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    anchors[active] = {
      x: clamp((e.clientX - r.left) / r.width, 0, 1),
      y: clamp((e.clientY - r.top) / r.height, 0, 1),
    };
    place();
  };

  let dragging = false;
  stage.addEventListener('pointerdown', (e) => {
    // Grab the nearest pin if the touch landed on one, so a drag feels direct.
    const r = stage.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    let near = null, bestD = Infinity;
    for (const { key } of PIN) {
      const d = Math.hypot((anchors[key].x - px) * r.width, (anchors[key].y - py) * r.height);
      if (d < 26 && d < bestD) { bestD = d; near = key; }
    }
    if (near) { active = near; step.textContent = LABEL(); }
    dragging = true;
    stage.setPointerCapture(e.pointerId);
    moveTo(e);
    buzz(8);
  });
  stage.addEventListener('pointermove', (e) => { if (dragging) moveTo(e); });
  stage.addEventListener('pointerup', () => { dragging = false; });
  stage.addEventListener('pointercancel', () => { dragging = false; });

  const LABEL = () => (active === 'eyeL' ? t('anchor_eye_l')
    : active === 'eyeR' ? t('anchor_eye_r') : t('anchor_mouth'));

  const step = el('div', { class: 'slot-name', text: LABEL() });

  const chips = el('div', { class: 'seg', style: { marginTop: 'var(--s3)' } },
    PIN.map(({ key }) => el('button', {
      class: `chip ${key === active ? 'is-on' : ''}`,
      text: key === 'eyeL' ? t('anchor_eye_l') : key === 'eyeR' ? t('anchor_eye_r') : t('anchor_mouth'),
      onclick: (e) => {
        active = key;
        [...e.currentTarget.parentElement.children].forEach(n => n.classList.remove('is-on'));
        e.currentTarget.classList.add('is-on');
        step.textContent = LABEL();
        place();
      },
    })),
  );

  const save = el('button', {
    class: 'btn btn-primary btn-block', style: { marginTop: 'var(--s4)' },
    html: icon('check') + `<span>${esc(t('anchor_save'))}</span>`,
    onclick: async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        // The map is built in the photo's own pixels, so the angle between the
        // eyes comes out true rather than stretched by the aspect ratio.
        const photo = await loadImage(rec.photo);
        const w = photo.naturalWidth || rec.w || 1;
        const h = photo.naturalHeight || rec.h || 1;
        const built = regionsFromAnchors(anchors, w, h);

        await Media.put({
          ...rec,
          regions: built.regions,
          anchors,
          engine: 'manual',
          createdAt: rec.createdAt || Date.now(),
        });
        await refreshMedia();
        buzz(14);
        toast(t('anchor_saved'));
        ctx.go('beauty');
      } catch {
        toast(t('err_generic'), 'warn');
        btn.disabled = false;
      }
    },
  });

  root.replaceChildren(
    el('div', { class: 'pad stack g4', style: { paddingTop: 'var(--s4)' } },
      el('div', {},
        el('h1', { style: { fontSize: 'var(--t-2xl)' }, text: t('anchor_title') }),
        el('p', { class: 'tiny muted', style: { marginTop: '6px' }, text: t('anchor_how') }),
      ),
      el('div', { class: 'card', style: { padding: 'var(--s3)' } },
        stage,
        el('div', { style: { marginTop: 'var(--s3)' } },
          el('div', { class: 'eyebrow', text: t('anchor_placing') }),
          step,
        ),
        chips,
      ),
      save,
      el('button', {
        class: 'btn btn-ghost btn-block', text: t('cancel'),
        onclick: () => ctx.go(rec.regions ? 'beauty' : 'profile'),
      }),
    ),
  );

  place();
  // The image may not have laid out yet; percentages need its box to exist.
  if (!img.complete) img.addEventListener('load', place, { once: true });
}

export const anchorsAvailable = () => Boolean(state.face?.photo);
export const anchorsLangHint = () => (isHe() ? 'rtl' : 'ltr');
