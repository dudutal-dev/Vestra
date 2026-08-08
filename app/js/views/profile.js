/* ============================================================
   VESTRA · Profile & settings
   ============================================================ */

import { el, icon, esc, toast, confirmSheet, observeReveal, $ } from '../ui.js';
import { t, isHe, setLang, lang } from '../i18n.js';
import { state, refreshAll } from '../state.js';
import {
  getProfile, setProfile, Settings, exportAll, importAll, wipeAll, closetScore,
} from '../store.js';
import { BODY_SHAPES, COLOR_SEASONS, ARCHETYPES, lbl } from '../taxonomy.js';

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

        field(t('p_model'), el('select', {
          class: 'select', onchange: e => { Settings.model = e.target.value; },
        },
          [['claude-opus-5', 'Claude Opus 5 · ' + (isHe() ? 'הכי מדויק' : 'most capable')],
           ['claude-sonnet-5', 'Claude Sonnet 5 · ' + (isHe() ? 'מהיר וחסכוני' : 'fast & economical')],
           ['claude-haiku-4-5', 'Claude Haiku 4.5 · ' + (isHe() ? 'הכי מהיר' : 'fastest')]]
            .map(([v, label]) => el('option', { value: v, selected: Settings.model === v || null, text: label })),
        )),

        el('div', { class: 'row g2 wrap', style: { marginTop: 'var(--s4)' } },
          el('button', {
            class: 'btn btn-ghost btn-sm grow', html: icon('download') + `<span>${esc(t('p_export'))}</span>`,
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

  /* ---------- data actions ---------- */
  async function doExport() {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = el('a', {
      href: URL.createObjectURL(blob),
      download: `vestra-closet-${new Date().toISOString().slice(0, 10)}.json`,
    });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(t('exported'));
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
