/* ============================================================
   VESTRA · Profile & settings
   ============================================================ */

import { el, icon, esc, toast, buzz, confirmSheet, openSheet, observeReveal, $ } from '../ui.js';
import { t, isHe, setLang, lang } from '../i18n.js';
import { state, refreshAll, refreshMedia } from '../state.js';
import {
  getProfile, setProfile, Settings, Media, exportAll, importAll, wipeAll, closetScore, hasKey, hasGoogleKey, renderCountThisMonth,
} from '../store.js';
import { BODY_SHAPES, COLOR_SEASONS, ARCHETYPES, lbl } from '../taxonomy.js';
import { loadDemoWardrobe, removeDemoWardrobe, countDemo, DEMO_SIZE } from '../demo.js';

/* Bumped by hand when something ships that the owner would notice. */
const APP_VERSION = '1.6 · F/W 26-27';

export function renderProfile(root, ctx) {
  const p = { ...getProfile() };
  const save = () => { setProfile(p); state.profile = p; };

  const bodyShapeSelect = el('select', { class: 'select', onchange: e => { p.body_shape = e.target.value; save(); } });
  const fillShapes = () => bodyShapeSelect.replaceChildren(
    el('option', { value: '', text: '—' }),
    ...(BODY_SHAPES[p.gender_presentation] || BODY_SHAPES.women).map(s =>
      el('option', { value: s.key, selected: p.body_shape === s.key || null, text: lbl(s.name) })));
  fillShapes();

  root.replaceChildren(
    el('div', { class: 'pad stack g6', style: { paddingTop: 'var(--s4)' } },

      el('div', { class: 'row between g3' },
        el('div', {},
          el('h1', { style: { fontSize: 'var(--t-2xl)' }, text: t('profile') }),
          el('p', { class: 'tiny muted', style: { marginTop: '6px' },
            text: `${state.items.length} ${t('stat_items')} · ${t('stat_score')} ${closetScore(state.items)}` }),
        ),
        el('div', { class: 'ring', style: { '--p': closetScore(state.items) } },
          el('b', { text: closetScore(state.items) })),
      ),

      /* ---------- Basics ---------- */
      card(t('p_basics'),
        field(t('p_name'), el('input', {
          class: 'input', value: p.name,
          oninput: e => { p.name = e.target.value; save(); },
        })),
        field(t('p_gender'), seg(
          [['women', t('g_women')], ['men', t('g_men')], ['non-binary', t('g_nb')]],
          p.gender_presentation,
          v => { p.gender_presentation = v; p.body_shape = ''; save(); fillShapes(); },
        )),
        el('div', { class: 'row g3' },
          el('div', { class: 'grow' }, field(t('p_age'), el('input', {
            class: 'input', type: 'number', min: '12', max: '110', value: p.age,
            oninput: e => { p.age = +e.target.value || 0; save(); },
          }))),
          el('div', { class: 'grow' }, field(t('p_height'), el('input', {
            class: 'input', type: 'number', min: '120', max: '220', value: p.height_cm,
            oninput: e => { p.height_cm = +e.target.value || 0; save(); },
          }))),
        ),
      ),

      /* ---------- Body & colour ---------- */
      card(t('p_body'),
        field(t('p_body_shape'), bodyShapeSelect),
        field(t('p_undertone'), seg(
          [['warm', t('ut_warm')], ['cool', t('ut_cool')], ['neutral', t('ut_neutral')], ['olive', t('ut_olive')]],
          p.skin_undertone, v => { p.skin_undertone = v; save(); },
        )),
        field(t('p_depth'), seg(
          [['fair', t('dp_fair')], ['light', t('dp_light')], ['medium', t('dp_medium')], ['tan', t('dp_tan')], ['deep', t('dp_deep')]],
          p.skin_depth, v => { p.skin_depth = v; save(); },
        )),
        field(t('p_season'), el('select', {
          class: 'select', onchange: e => { p.color_season = e.target.value; save(); },
        },
          el('option', { value: '', text: '—' }),
          COLOR_SEASONS.map(s => el('option', { value: s, selected: p.color_season === s || null, text: s })),
        )),
        el('div', { class: 'row g3' },
          el('div', { class: 'grow' }, field(t('p_hair'), el('input', {
            class: 'input', value: p.hair_color, oninput: e => { p.hair_color = e.target.value; save(); },
          }))),
          el('div', { class: 'grow' }, field(t('p_eyes'), el('input', {
            class: 'input', value: p.eye_color, oninput: e => { p.eye_color = e.target.value; save(); },
          }))),
        ),
      ),

      /* ---------- Style ---------- */
      card(t('p_style'),
        field(t('p_archetypes'), el('div', { class: 'seg' },
          ARCHETYPES.map(a => el('button', {
            class: `chip ${p.style_archetypes.includes(a.key) ? 'is-on' : ''}`, text: lbl(a.name),
            onclick: (e) => {
              const on = p.style_archetypes.includes(a.key);
              p.style_archetypes = on
                ? p.style_archetypes.filter(x => x !== a.key)
                : [...p.style_archetypes, a.key];
              e.currentTarget.classList.toggle('is-on', !on);
              save();
            },
          })),
        )),
        field(t('p_modesty'), seg(
          [['none', t('md_none')], ['shoulders', t('md_shoulders')], ['knees', t('md_knees')], ['full-cover', t('md_full')]],
          p.modesty_level, v => { p.modesty_level = v; save(); },
        )),
        field(t('p_climate'), seg(
          [['hot-humid', t('cl_hot_humid')], ['hot-dry', t('cl_hot_dry')], ['temperate', t('cl_temperate')], ['cold', t('cl_cold')]],
          p.climate, v => { p.climate = v; save(); },
        )),
        field(t('p_nogo'), el('textarea', {
          class: 'textarea', placeholder: t('p_nogo_ph'), value: p.no_go,
          oninput: e => { p.no_go = e.target.value; save(); },
        })),
      ),

      /* ---------- Guide ---------- */
      el('button', {
        class: 'card card-lift row between g3 on-scroll',
        style: { width: '100%', textAlign: 'start', cursor: 'pointer' },
        onclick: openGuide,
      },
        el('div', { class: 'grow' },
          el('div', { class: 'eyebrow', text: t('p_guide') }),
          el('div', { class: 'slot-name', style: { marginTop: '4px' }, text: t('guide_title') }),
        ),
        el('span', { html: icon('sparkles'), style: { width: '22px', color: 'var(--oxblood)' } }),
      ),

      /* ---------- About ---------- */
      el('button', {
        class: 'card card-lift row between g3 on-scroll',
        style: { width: '100%', textAlign: 'start', cursor: 'pointer' },
        onclick: openAbout,
      },
        el('div', { class: 'grow' },
          el('div', { class: 'eyebrow', text: t('p_about') }),
          el('div', { class: 'slot-name', style: { marginTop: '4px' }, text: t('about_title') }),
        ),
        el('span', { html: icon('user'), style: { width: '22px', color: 'var(--oxblood)' } }),
      ),

      /* ---------- My photos ---------- */
      card(t('p_photos'),
        el('div', { class: 'row g3' },
          photoSlot('face', t('p_face_photo'), ctx),
          photoSlot('body', t('p_body_photo'), ctx),
        ),
        el('p', { class: 'micro muted', style: { marginTop: 'var(--s4)', marginBottom: 0 }, text: t('photos_privacy') }),
      ),

      /* ---------- App settings ---------- */
      card(t('p_app'),
        field(t('p_lang'), seg([['he', 'עברית'], ['en', 'English']], lang(), v => {
          setLang(v);
          ctx.reboot();
        })),

        el('div', { class: 'kv', style: { paddingBlock: 'var(--s4)' } },
          el('dt', { class: 'label', style: { margin: 0 }, text: t('p_theme') }),
          el('dd', {}, themeSwitch()),
        ),

        field(t('p_key'), el('div', { class: 'stack g2' },
          el('input', {
            class: 'input', type: 'password', autocomplete: 'off', spellcheck: 'false',
            placeholder: t('p_key_ph'), value: Settings.apiKey,
            oninput: e => { Settings.apiKey = e.target.value.trim(); },
          }),
          el('p', { class: 'micro muted', style: { margin: 0 }, text: t('p_key_help') }),
          el('a', {
            class: 'micro', href: 'https://console.anthropic.com/settings/keys',
            target: '_blank', rel: 'noopener noreferrer',
            style: { color: 'var(--oxblood)', textDecoration: 'none' },
            text: t('p_get_key') + ' →',
          }),
        )),

        field(t('p_gkey'), el('div', { class: 'stack g2' },
          el('input', {
            class: 'input', type: 'password', autocomplete: 'off', spellcheck: 'false',
            placeholder: t('p_gkey_ph'), value: Settings.googleKey,
            oninput: e => { Settings.googleKey = e.target.value.trim(); },
          }),
          el('p', { class: 'micro muted', style: { margin: 0 }, text: t('p_gkey_help') }),
          el('a', {
            class: 'micro', href: 'https://aistudio.google.com/apikey',
            target: '_blank', rel: 'noopener noreferrer',
            style: { color: 'var(--oxblood)', textDecoration: 'none' },
            text: t('p_get_gkey') + ' →',
          }),
          /* A local estimate, not Google's ledger — but close enough to know
             whether this month cost half a shekel or a whole one. */
          hasGoogleKey() ? el('p', {
            class: 'micro muted', style: { margin: 0 },
            text: `${t('p_rcount')}: ${renderCountThisMonth()} · ≈ $${(renderCountThisMonth() * 0.067).toFixed(2)}`,
          }) : null,
        )),

        /* Update on demand. The service worker already skips waiting and
           claims clients, so a fresh registration takes over on its own —
           this button just asks for it now instead of on the next visit. */
        el('button', {
          class: 'btn btn-quiet btn-block btn-sm', style: { marginTop: 'var(--s3)' },
          html: icon('refresh') + `<span>${esc(t('p_refresh'))} · ${esc(APP_VERSION.split(' ')[0])}</span>`,
          onclick: async (e) => {
            e.currentTarget.disabled = true;
            buzz(12);
            try {
              const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
              await Promise.all(regs.map(r => r.update().catch(() => {})));
            } catch { /* no SW — the reload alone still refetches everything */ }
            location.reload();
          },
        }),

        field(t('p_model'), el('select', {
          class: 'select', onchange: e => { Settings.model = e.target.value; },
        },
          [['claude-opus-5', 'Claude Opus 5 · ' + (isHe() ? 'הכי מדויק' : 'most capable')],
           ['claude-sonnet-5', 'Claude Sonnet 5 · ' + (isHe() ? 'מהיר וחסכוני' : 'fast & economical')],
           ['claude-haiku-4-5', 'Claude Haiku 4.5 · ' + (isHe() ? 'הכי מהיר' : 'fastest')]]
            .map(([v, label]) => el('option', { value: v, selected: Settings.model === v || null, text: label })),
        )),

        sampleWardrobeBlock(),

        el('div', { class: 'alert alert-med', style: { marginTop: 'var(--s5)' } },
          el('span', { html: icon('download') }),
          el('div', { class: 'grow' },
            el('div', { text: t('backup_reminder') }),
            el('div', { class: 'micro muted', style: { marginTop: '5px' },
              text: `${t('last_backup')}: ${Settings.lastBackup
                ? new Date(+Settings.lastBackup).toLocaleDateString(isHe() ? 'he-IL' : 'en-GB')
                : t('never')}` }),
          ),
        ),
        el('div', { class: 'row g2 wrap', style: { marginTop: 'var(--s3)' } },
          el('button', {
            class: 'btn btn-primary btn-sm grow', html: icon('download') + `<span>${esc(t('p_export'))}</span>`,
            onclick: doExport,
          }),
          el('button', {
            class: 'btn btn-ghost btn-sm grow', html: icon('upload') + `<span>${esc(t('p_import'))}</span>`,
            onclick: doImport,
          }),
        ),
        el('button', {
          class: 'btn btn-quiet btn-block btn-sm', style: { color: 'var(--danger)', marginTop: 'var(--s2)' },
          html: icon('trash') + `<span>${esc(t('p_wipe'))}</span>`,
          onclick: doWipe,
        }),
      ),

      /* ---------- About ---------- */
      el('div', { class: 'center stack g2', style: { paddingBlock: 'var(--s7)' } },
        el('div', { class: 'brand-mark', style: { fontSize: 'var(--t-2xl)' },
          html: '<span class="v">V</span>ESTRA' }),
        el('div', { class: 'micro muted', text: 'v1.0 · Your AI Atelier' }),
        el('div', { class: 'micro muted', text: isHe()
          ? 'כל הנתונים נשמרים במכשיר שלך בלבד.'
          : 'All data stays on your device.' }),
      ),
    ),
  );
  observeReveal(root);

  /* ---------- sample wardrobe ---------- */
  function sampleWardrobeBlock() {
    const loaded = countDemo(state.items);
    return el('div', { class: 'card card-flat', style: { marginTop: 'var(--s5)' } },
      el('div', { class: 'eyebrow', text: t('demo_title') }),
      el('div', { class: 'micro muted', style: { marginTop: '6px' }, text: t('demo_sub') }),
      el('button', {
        class: `btn btn-sm btn-block ${loaded ? 'btn-quiet' : 'btn-ghost'}`,
        style: { marginTop: 'var(--s3)' },
        html: icon(loaded ? 'trash' : 'plus') +
          `<span>${esc(loaded ? `${t('demo_remove')} (${loaded})` : `${t('demo_load')} (${DEMO_SIZE})`)}</span>`,
        onclick: async (e) => {
          // Hold the node: `currentTarget` is cleared once the event finishes
          // dispatching, and everything below this line runs after that.
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            const n = loaded ? await removeDemoWardrobe() : await loadDemoWardrobe();
            await refreshAll();
            toast(loaded ? `${t('demo_removed')} · ${n}` : `${t('demo_loaded')} · ${n}`);
            ctx.rerender();
          } catch {
            toast(t('err_generic'), 'bad');
            btn.disabled = false;
          }
        },
      }),
    );
  }

  /* ---------- data actions ---------- */
  async function doExport() {
    const hasPhotos = !!(state.face || state.body);
    // Photos of the owner are opt-in: a wardrobe backup shouldn't quietly
    // carry pictures of them into a file they might share or sync.
    const includePhotos = hasPhotos
      ? await confirmSheet({
          title: t('p_export'),
          body: t('export_photos_q'),
          confirmLabel: t('export_with_photos'),
          cancelLabel: t('export_wardrobe_only'),
        })
      : false;

    const data = await exportAll({ includePhotos });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = el('a', {
      href: URL.createObjectURL(blob),
      download: `vestra-backup-${new Date().toISOString().slice(0, 10)}.json`,
    });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    Settings.lastBackup = Date.now();
    toast(t('exported'));
    ctx.rerender();
  }

  function doImport() {
    const input = $('#importPicker');
    input.value = '';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const n = await importAll(JSON.parse(await f.text()));
        await refreshAll();
        toast(`${t('imported')} · ${n}`);
        ctx.reboot();
      } catch {
        toast(t('err_generic'), 'bad');
      }
    };
    input.click();
  }

  async function doWipe() {
    const ok = await confirmSheet({
      title: t('p_wipe'), body: t('confirm_wipe'),
      confirmLabel: t('p_wipe'), cancelLabel: t('cancel'), danger: true,
    });
    if (!ok) return;
    await wipeAll();
    await refreshAll();
    toast(t('wiped'));
    ctx.reboot();
  }
}

/* ---------------- widgets ---------------- */
const field = (label, control) => el('div', { class: 'field' },
  el('label', { class: 'label', text: label }), control);

const card = (title, ...kids) => el('section', { class: 'card on-scroll' },
  el('div', { class: 'eyebrow', style: { marginBottom: 'var(--s4)' }, text: title }),
  ...kids,
);

function seg(pairs, current, onPick) {
  const row = el('div', { class: 'seg' },
    pairs.map(([v, label]) => el('button', {
      class: `chip ${current === v ? 'is-on' : ''}`, text: label,
      onclick: (e) => {
        onPick(v);
        [...row.children].forEach(n => n.classList.remove('is-on'));
        e.currentTarget.classList.add('is-on');
      },
    })),
  );
  return row;
}

/* ---------------- The in-app guide ---------------- */
export function openGuide() {
  const steps = t('guide_steps') || [];
  const body = el('div', {},
    el('div', { class: 'eyebrow', text: t('p_guide') }),
    el('h3', { style: { marginBlock: '6px var(--s5)' }, text: t('guide_title') }),

    el('div', {}, steps.map(([title, text]) => el('div', { class: 'step' },
      el('div', { class: 'step-num', html: icon('check') }),
      el('div', { class: 'grow' },
        el('b', { class: 'slot-name', text: title }),
        el('div', { class: 'tiny muted', style: { marginTop: '4px' }, text }),
      ),
    ))),

    el('div', { class: 'alert alert-ok', style: { marginTop: 'var(--s3)' } },
      el('span', { html: icon('sparkles') }),
      el('div', { class: 'grow' },
        el('b', { text: t('guide_tip_title') }),
        el('div', { style: { marginTop: '4px' }, text: t('guide_tip') }),
      ),
    ),

    el('button', {
      class: 'btn btn-primary btn-block', style: { marginTop: 'var(--s5)' },
      text: t('done'), onclick: () => close(),
    }),
  );
  const close = openSheet(body);
}

function photoSlot(slot, label, ctx) {
  const rec = state[slot];
  const box = { width: '100%', aspectRatio: '3/4', borderRadius: 'var(--r-md)', objectFit: 'cover' };

  return el('div', { class: 'grow stack g2' },
    rec?.photo
      ? el('div', { style: { position: 'relative' } },
          el('img', { src: rec.photo, alt: label, style: box }),
          el('button', {
            class: 'icon-btn', html: icon('trash'), 'aria-label': t('remove_photo'),
            style: { position: 'absolute', insetInlineEnd: '8px', top: '8px', width: '32px', height: '32px' },
            onclick: async () => {
              const ok = await confirmSheet({
                title: t('remove_photo'), confirmLabel: t('remove_photo'),
                cancelLabel: t('cancel'), danger: true,
              });
              if (!ok) return;
              await Media.remove(slot);
              await refreshMedia();
              toast(t('photo_removed'));
              ctx.rerender();
            },
          }),
        )
      : el('button', {
          class: 'card card-flat center',
          style: { ...box, display: 'grid', placeItems: 'center', border: '2px dashed var(--line)' },
          onclick: () => ctx.go('capture', { mode: slot }),
        },
          el('div', { html: icon(slot === 'face' ? 'user' : 'hanger'), style: { width: '28px', margin: '0 auto', color: 'var(--ink-4)' } }),
        ),
    el('div', { class: 'micro muted center', text: label }),
    el('div', { class: 'micro center', style: { color: rec ? 'var(--ok)' : 'var(--ink-4)' },
      text: rec ? '✓' : t('p_no_photo') }),
  );
}

function themeSwitch() {
  const sw = el('button', {
    class: `switch ${Settings.theme === 'dark' ? 'is-on' : ''}`,
    'aria-label': t('p_theme'),
    onclick: () => {
      const next = Settings.theme === 'dark' ? 'light' : 'dark';
      Settings.theme = next;
      sw.classList.toggle('is-on', next === 'dark');
      document.querySelector('meta[name="theme-color"]')?.setAttribute(
        'content', next === 'dark' ? '#100E0D' : '#FBFAF7');
    },
  });
  return sw;
}

/* ============================================================
   About
   ============================================================ */
export function openAbout() {
  /* `ltr` on values that are pure Latin/punctuation. Left to inherit, a string
     like "1.4 · F/W 26-27" gets reordered by the bidi algorithm inside an RTL
     page — the neutral separator flips the two runs and the version reads
     backwards. */
  const line = (label, value, ltr = false) => el('div', { class: 'kv' },
    el('dt', { text: label }),
    el('dd', { text: value, dir: ltr ? 'ltr' : null }));

  openSheet(el('div', {},
    el('div', { class: 'eyebrow', text: t('p_about') }),
    el('h3', { style: { marginBlock: '6px var(--s2)', fontSize: 'var(--t-2xl)' }, text: 'VESTRA' }),
    el('p', { class: 'tiny muted', style: { marginBottom: 'var(--s4)' }, text: t('about_tagline') }),

    el('div', { class: 'card stack g2' },
      el('div', { class: 'eyebrow', text: t('about_by') }),
      el('div', { class: 'slot-name', style: { fontSize: 'var(--t-lg)', fontWeight: 600 }, text: 'Dudu Tal · דודו טל' }),
      el('p', { class: 'tiny muted', style: { margin: 0 }, text: t('about_by_note') }),
    ),

    el('p', { class: 'tiny', style: { marginTop: 'var(--s4)', lineHeight: 1.6 }, text: t('about_what') }),
    el('p', { class: 'tiny', style: { marginTop: 'var(--s3)', lineHeight: 1.6 }, text: t('about_privacy') }),

    el('div', { class: 'card stack g1', style: { marginTop: 'var(--s4)' } },
      line(t('about_engine'), hasKey() ? 'Claude · api.anthropic.com' : t('about_engine_local'), hasKey()),
      line(t('about_render_engine'), hasGoogleKey() ? `Gemini · ${Settings.imageModel}` : t('about_render_local'), hasGoogleKey()),
      line(t('about_items'), String(state.items.length)),
      line(t('about_looks'), String(state.looks.length)),
      line(t('about_version'), APP_VERSION, true),
    ),

    el('p', { class: 'micro muted', style: { marginTop: 'var(--s4)' }, text: t('about_licence') }),
  ));
}
