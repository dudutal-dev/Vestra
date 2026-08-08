/* ============================================================
   VESTRA · Closet organizer + wardrobe health report
   ============================================================ */

import { el, icon, esc, toast, observeReveal } from '../ui.js';
import { t, pick, isHe } from '../i18n.js';
import { state } from '../state.js';
import { hasKey } from '../store.js';
import { wardrobeHealth, errText } from '../ai.js';
import { healthLocal } from '../stylist.js';
import { slimItem } from './studio.js';
import { catName, formalityName, hexFor } from '../taxonomy.js';

export function renderCloset(root, ctx) {
  const latest = state.closets[0];

  const header = el('div', {},
    el('h1', { style: { fontSize: 'var(--t-2xl)' }, text: t('closet') }),
    el('p', { class: 'tiny muted', style: { marginTop: '6px' }, text: t('closet_sub') }),
  );

  const shootBtn = el('button', {
    class: 'btn btn-primary btn-block',
    html: icon('camera') + `<span>${esc(t('q_closet'))}</span>`,
    onclick: () => ctx.go('capture', { mode: 'closet' }),
  });

  const method = el('div', { class: 'card card-flat' },
    el('div', { class: 'eyebrow', text: t('cl_method') }),
    el('div', { class: 'serif-xl', style: { marginBlock: '8px', fontSize: 'var(--t-lg)' }, text: t('cl_method_sub') }),
  );

  root.replaceChildren(
    el('div', { class: 'pad stack g5', style: { paddingTop: 'var(--s4)' } },
      header,
      shootBtn,
      latest ? renderAnalysis(latest) : method,
      el('hr', { class: 'rule' }),
      renderHealth(ctx),
    ),
  );
  observeReveal(root);
}

/* ---------------- Closet photo analysis ---------------- */
function renderAnalysis(a) {
  const score = Number(a.score) || 0;

  return el('div', { class: 'stack g5' },
    el('div', { class: 'card row g4', style: { alignItems: 'center' } },
      el('div', { class: 'ring', style: { '--p': score } }, el('b', { text: score })),
      el('div', { class: 'grow' },
        el('div', { class: 'eyebrow', text: t('cl_score') }),
        el('div', { class: 'tiny muted', style: { marginTop: '4px' },
          text: `${a.estimated_items?.hanging ?? 0} · ${a.estimated_items?.folded ?? 0} · ${a.estimated_items?.shoes ?? 0}` }),
      ),
      a.thumb ? el('img', { src: a.thumb, alt: '',
        style: { width: '58px', height: '58px', objectFit: 'cover', borderRadius: 'var(--r-sm)' } }) : null,
    ),

    (a.zones || []).length ? group(t('cl_zones'),
      el('div', { class: 'stack g2' },
        a.zones.map(z => el('div', { class: 'card card-flat' },
          el('div', { class: 'row between g2' },
            el('b', { class: 'tiny', text: pick(z, 'position') || z.type }),
            el('span', { class: 'tag', text: `${z.occupancy_pct ?? 0}%` }),
          ),
          el('div', { class: 'bar-track', style: { marginBlock: '8px' } },
            el('div', { class: 'bar-fill', style: { width: `${Math.min(z.occupancy_pct ?? 0, 100)}%` } })),
          el('div', { class: 'micro muted', text: pick(z, 'note') }),
        ))),
    ) : null,

    (a.problems || []).length ? group(t('cl_problems'),
      el('div', { class: 'stack g2' },
        a.problems.map(p => el('div', { class: `alert alert-${p.severity === 'high' ? 'high' : p.severity === 'medium' ? 'med' : 'ok'}` },
          el('span', { html: icon('alert') }),
          el('div', { class: 'grow' },
            el('b', { text: pick(p, 'title') }),
            el('div', { style: { marginTop: '3px' }, text: pick(p, 'detail') }),
          ),
        ))),
    ) : null,

    (a.plan || []).length ? group(t('cl_plan'),
      el('div', {}, a.plan.map(s => el('div', { class: 'step' },
        el('div', { class: 'step-num', text: String(s.step) }),
        el('div', { class: 'grow' },
          el('div', { class: 'row between g2' },
            el('b', { class: 'slot-name', text: pick(s, 'title') }),
            s.minutes ? el('span', { class: 'tag', text: `${s.minutes} ${t('minutes')}` }) : null,
          ),
          el('div', { class: 'tiny muted', style: { marginTop: '4px' }, text: pick(s, 'action') }),
        ),
      ))),
    ) : null,

    (a.storage_suggestions || []).length ? group(t('cl_storage'),
      el('div', { class: 'stack g2' },
        a.storage_suggestions.map(s => el('div', { class: 'gap-row' },
          el('span', { html: icon('bag'), style: { width: '18px', flex: 'none', color: 'var(--cocoa)' } }),
          el('div', { class: 'grow' },
            el('b', { class: 'tiny', text: pick(s, 'item') }),
            el('div', { class: 'micro muted', text: pick(s, 'why') }),
          ),
          s.est_price_ils ? el('span', { class: 'tag tag-gold', text: `≈₪${s.est_price_ils}` }) : null,
        ))),
    ) : null,
  );
}

/* ---------------- Wardrobe health ---------------- */
function renderHealth(ctx) {
  const host = el('div', { class: 'stack g4' });

  const runBtn = el('button', {
    class: 'btn btn-ghost btn-block',
    html: icon('grid') + `<span>${esc(t('health'))}</span>`,
    onclick: async () => {
      if (!state.items.length) return toast(t('empty_wardrobe_t'), 'warn');
      runBtn.disabled = true;
      runBtn.innerHTML = `<span class="tiny">${esc(t('building'))}</span>`;
      try {
        const data = hasKey()
          ? await wardrobeHealth({ wardrobe: state.items.map(slimItem), profile: state.profile })
          : healthLocal(state.items);
        paint(data);
      } catch (e) {
        toast(errText(e), 'warn');
        paint(healthLocal(state.items));
      } finally {
        runBtn.remove();
      }
    },
  });

  host.append(
    el('div', { class: 'eyebrow', text: t('health') }),
    runBtn,
  );

  function paint(d) {
    const total = d.total || state.items.length;
    const cats = Object.entries(d.by_category || {}).sort((a, b) => b[1] - a[1]);
    const fmt = Object.entries(d.by_formality || {}).sort((a, b) => +a[0] - +b[0]);

    // replaceChildren stringifies non-Node arguments, so `null` would render
    // as the literal text "null" — filter the conditional blocks out first.
    host.replaceChildren(...[
      el('div', { class: 'eyebrow', text: t('health') }),

      el('div', { class: 'card' },
        el('div', { class: 'row between g3', style: { marginBottom: 'var(--s4)' } },
          el('div', { class: 'serif-xl', text: String(total) }),
          el('div', { class: 'micro muted', text: t('stat_items') }),
        ),
        cats.map(([k, n]) => bar(catName(k), n, total)),
      ),

      fmt.length ? el('div', { class: 'card' },
        el('div', { class: 'eyebrow', style: { marginBottom: 'var(--s3)' }, text: t('f_formality') }),
        fmt.map(([k, n]) => bar(formalityName(+k), n, total)),
      ) : null,

      (d.by_color || []).length ? el('div', { class: 'card' },
        el('div', { class: 'eyebrow', style: { marginBottom: 'var(--s3)' }, text: t('f_color') }),
        el('div', { class: 'row g2 wrap' },
          d.by_color.map(c => el('div', { class: 'row g2' },
            el('span', { class: 'swatch', style: { width: '22px', height: '22px', background: hexFor(c) } }),
            el('span', { class: 'micro muted', text: `${pick(c, 'name')} ${c.pct}%` }),
          ))),
      ) : null,

      (d.warnings || []).length ? el('div', { class: 'stack g2' },
        d.warnings.map(w => el('div', { class: `alert alert-${w.severity === 'high' ? 'high' : 'med'}` },
          el('span', { html: icon('alert') }),
          el('div', { text: pick(w, 'text') }),
        ))) : null,

      (d.workhorses || []).length ? el('div', { class: 'card' },
        el('div', { class: 'eyebrow', style: { marginBottom: 'var(--s3)' }, text: '✦ ' + (isHe() ? 'עמודי התווך' : 'Workhorses') }),
        d.workhorses.map((w, n) => el('div', { class: 'kv' },
          el('dt', { text: `${n + 1}. ${pick(w, 'text')}` }),
          el('dd', { text: `${w.outfit_count || 0}` }),
        )),
      ) : null,

      (d.duplicates || []).length ? el('div', { class: 'stack g2' },
        d.duplicates.map(x => el('div', { class: 'alert alert-med' },
          el('span', { html: icon('alert') }),
          el('div', { text: pick(x, 'text') }),
        ))) : null,

      (d.buy_next || []).length ? el('div', { class: 'card' },
        el('div', { class: 'eyebrow', style: { marginBottom: 'var(--s3)' }, text: '🛒 ' + (isHe() ? 'הרכישות המשתלמות ביותר' : 'Highest-leverage buys') }),
        el('div', { class: 'stack g2' },
          d.buy_next.map(b => el('div', { class: 'gap-row' },
            el('div', { class: 'grow' },
              el('b', { class: 'tiny', text: pick(b, 'item') }),
              el('div', { class: 'micro muted', text: pick(b, 'why') }),
            ),
            el('div', { class: 'stack', style: { alignItems: 'flex-end' } },
              b.est_price_ils ? el('span', { class: 'tag tag-gold', text: `≈₪${b.est_price_ils}` }) : null,
              b.unlocks_outfits ? el('span', { class: 'micro muted', text: `+${b.unlocks_outfits}` }) : null,
            ),
          ))),
      ) : null,
    ].filter(Boolean));
  }

  return host;
}

/* ---------------- helpers ---------------- */
function bar(label, n, total) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  const row = el('div', { class: 'bar-row' },
    el('span', { class: 'micro muted', text: label }),
    el('div', { class: 'bar-track' }, el('div', { class: 'bar-fill' })),
    el('span', { class: 'micro muted', style: { textAlign: 'end' }, text: `${pct}%` }),
  );
  requestAnimationFrame(() => { row.querySelector('.bar-fill').style.width = pct + '%'; });
  return row;
}

const group = (title, body) => el('div', { class: 'on-scroll' },
  el('div', { class: 'eyebrow', style: { marginBottom: 'var(--s3)' }, text: title }), body);
