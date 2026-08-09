/* ============================================================
   VESTRA · UI primitives
   Icons, toasts, sheets, sparkles, DOM helpers.
   ============================================================ */

/* ---------------- DOM ---------------- */
export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    // A textarea has no `value` attribute — its content is its value — so
    // setAttribute silently does nothing and the field renders empty. Set the
    // property, and keep the attribute where one legitimately exists.
    else if (k === 'value' && 'value' in n) {
      n.value = v;
      if (n.tagName === 'INPUT' || n.tagName === 'OPTION') n.setAttribute('value', v);
    }
    else n.setAttribute(k, v);
  }
  kids.flat().forEach(c => c != null && n.append(c.nodeType ? c : document.createTextNode(c)));
  return n;
};

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- Icons (Lucide-style, 24px stroke) ---------------- */
const P = (d) => `<path d="${d}"/>`;
const ICONS = {
  home:      P('M3 10.5 12 3l9 7.5') + P('M5 9.5V21h14V9.5'),
  hanger:    P('M12 3a2.5 2.5 0 0 0-2 4l2 2') + P('M12 9 3.6 15.2A1.5 1.5 0 0 0 4.5 18h15a1.5 1.5 0 0 0 .9-2.8L12 9Z'),
  camera:    P('M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z') + '<circle cx="12" cy="13.5" r="3.5"/>',
  sparkles:  P('M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z') + P('M18 15l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9L18 15Z'),
  user:      '<circle cx="12" cy="8" r="4"/>' + P('M4 21c0-4.2 3.6-6.5 8-6.5s8 2.3 8 6.5'),
  heart:     P('M12 20s-7-4.6-7-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7 2.6C19 15.4 12 20 12 20Z'),
  plus:      P('M12 5v14M5 12h14'),
  close:     P('M6 6l12 12M18 6 6 18'),
  back:      P('M15 5l-7 7 7 7'),
  search:    '<circle cx="11" cy="11" r="7"/>' + P('M20 20l-3.5-3.5'),
  image:     P('M4 5h16v14H4z') + '<circle cx="9" cy="10" r="1.6"/>' + P('M4 17l5-4 4 3 3-2 4 3'),
  wardrobe:  P('M4 3h16v18H4z') + P('M12 3v18') + P('M9.5 11v2M14.5 11v2'),
  palette:   P('M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-1.8 0-1.4-1.6-1.6-1.6-3 0-1 .8-1.7 1.9-1.7H16a5 5 0 0 0 5-5c0-3.6-4-6.5-9-6.5Z') + '<circle cx="8" cy="10" r="1.1"/><circle cx="12" cy="7.5" r="1.1"/><circle cx="16" cy="10" r="1.1"/>',
  lipstick:  P('M9 21h6v-6H9z') + P('M9.5 15V9.5A2.5 2.5 0 0 1 12 7l2.5-4v10.5') ,
  settings:  '<circle cx="12" cy="12" r="3"/>' + P('M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z'),
  alert:     P('M12 4 2.5 20h19L12 4Z') + P('M12 10v4M12 17.2v.1'),
  check:     P('M5 12.5l4.5 4.5L19 7'),
  trash:     P('M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13'),
  shirt:     P('M8 4 4 6.5 6 10l2-1v11h8V9l2 1 2-3.5L16 4l-2 2h-4L8 4Z'),
  shoe:      P('M3 16h11l3-3 4 1v2H3z') + P('M3 16v-4h4l2 2'),
  bag:       P('M5 8h14l1 12H4L5 8Z') + P('M9 8V6a3 3 0 0 1 6 0v2'),
  grid:      P('M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'),
  download:  P('M12 4v11M8 11l4 4 4-4M5 20h14'),
  upload:    P('M12 20V9M8 12l4-4 4 4M5 4h14'),
  refresh:   P('M20 12a8 8 0 1 1-2.4-5.7') + P('M20 4v4h-4'),
  globe:     '<circle cx="12" cy="12" r="9"/>' + P('M3 12h18M12 3c2.5 2.7 2.5 15 0 18M12 3c-2.5 2.7-2.5 15 0 18'),
  moon:      P('M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z'),
  key:       '<circle cx="8" cy="12" r="4"/>' + P('M12 12h9M18 12v3M21 12v2'),
  clock:     '<circle cx="12" cy="12" r="9"/>' + P('M12 7v5l3 2'),
  star:      P('M12 4l2.3 5.1L20 9.9l-4 4 1 5.6-5-2.8-5 2.8 1-5.6-4-4 5.7-.8L12 4Z'),
};

export function icon(name, cls = '') {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
    stroke-linecap="round" stroke-linejoin="round" class="${cls}" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/* ---------------- Toast ---------------- */
export function toast(msg, kind = '') {
  const host = $('#toasts') || document.body.appendChild(el('div', { id: 'toasts' }));
  const node = el('div', { class: `toast ${kind ? 'toast-' + kind : ''}`, text: msg });
  host.append(node);
  setTimeout(() => {
    node.classList.add('is-out');
    node.addEventListener('animationend', () => node.remove(), { once: true });
  }, 2600);
}

/* ---------------- Bottom sheet ---------------- */
let sheetStack = [];

export function openSheet(contentNode, { onClose } = {}) {
  const scrim = el('div', { class: 'scrim' });
  const sheet = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
    el('div', { class: 'sheet-grip' }), contentNode);

  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    sheet.classList.add('is-closing');
    scrim.style.animation = 'scrimIn 180ms reverse both';

    // animationend is unreliable here — the element already carries a filled
    // opening animation, and an interrupted one may never emit the event. Drive
    // the teardown on a timer and treat the event as an early finish.
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sheet.remove(); scrim.remove();
      sheetStack = sheetStack.filter(s => s.close !== close);
      onClose?.();
    };
    const timer = setTimeout(finish, 240);
    sheet.addEventListener('animationend', finish, { once: true });
  };

  scrim.addEventListener('click', close);
  document.body.append(scrim, sheet);
  sheetStack.push({ close });

  // Drag-to-dismiss
  let y0 = null;
  sheet.addEventListener('touchstart', e => {
    if (sheet.scrollTop > 0) return;
    y0 = e.touches[0].clientY;
  }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (y0 === null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', () => {
    const dy = parseFloat((sheet.style.transform.match(/translateY\((\d+)/) || [0, 0])[1]);
    sheet.style.transform = '';
    if (dy > 110) close();
    y0 = null;
  });

  return close;
}

export const closeTopSheet = () => sheetStack.at(-1)?.close();

/**
 * Tear every sheet down immediately, no exit animation.
 * Called on language change and reboot — an open sheet would otherwise survive
 * the re-render and sit there in the previous language.
 */
export function closeAllSheets() {
  sheetStack = [];
  $$('.sheet, .scrim').forEach(n => n.remove());
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeTopSheet(); });

/* ---------------- Confirm dialog ---------------- */
export function confirmSheet({ title, body, confirmLabel, cancelLabel, danger }) {
  return new Promise(resolve => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };

    const node = el('div', {},
      el('h3', { text: title, style: { marginBottom: '10px' } }),
      body ? el('p', { class: 'muted tiny', text: body }) : null,
      el('div', { class: 'row g3', style: { marginTop: '20px' } },
        el('button', {
          class: 'btn btn-ghost grow', text: cancelLabel,
          onclick: () => { done(false); close(); },
        }),
        el('button', {
          class: `btn grow ${danger ? 'btn-lux' : 'btn-primary'}`, text: confirmLabel,
          onclick: () => { done(true); close(); },
        }),
      ),
    );
    const close = openSheet(node, { onClose: () => done(false) });
  });
}

/* ---------------- Sparkle burst ---------------- */
export function sparkle(x, y, n = 16) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    const d = 60 + Math.random() * 90;
    const s = el('i', {
      class: 'sparkle',
      style: {
        left: x + 'px', top: y + 'px',
        '--dx': `${Math.cos(a) * d}px`, '--dy': `${Math.sin(a) * d}px`,
        background: i % 3 === 0 ? 'var(--oxblood)' : i % 3 === 1 ? 'var(--gold)' : 'var(--camel)',
        width: `${4 + Math.random() * 6}px`, height: `${4 + Math.random() * 6}px`,
        animationDelay: `${Math.random() * 120}ms`,
      },
    });
    document.body.append(s);
    s.addEventListener('animationend', () => s.remove(), { once: true });
  }
}

/* ---------------- Split headline into animated letters ---------------- */
export function splitText(node, text) {
  node.innerHTML = '';
  node.classList.add('split-in');

  // Each letter becomes its own inline-block so it can animate independently.
  // That also means the browser orders the spans by the container's direction
  // rather than by the text's own script — Latin text inside an RTL page comes
  // out reversed. Pin the direction to whatever the content actually is.
  node.style.direction = /[֐-׿؀-ۿ]/.test(text) ? 'rtl' : 'ltr';

  [...text].forEach((ch, i) => {
    node.append(el('span', {
      text: ch === ' ' ? ' ' : ch,
      style: { animationDelay: `${40 + i * 26}ms` },
    }));
  });
}

/* ---------------- Scroll reveal ---------------- */
const io = 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 })
  : null;

export const observeReveal = (root = document) =>
  io && $$('.on-scroll:not(.is-in)', root).forEach(n => io.observe(n));

/* ---------------- Ripple origin for buttons ---------------- */
document.addEventListener('pointerdown', e => {
  const b = e.target.closest?.('.btn');
  if (!b) return;
  const r = b.getBoundingClientRect();
  b.style.setProperty('--rx', `${((e.clientX - r.left) / r.width) * 100}%`);
  b.style.setProperty('--ry', `${((e.clientY - r.top) / r.height) * 100}%`);
}, { passive: true });

/* ---------------- Haptics ---------------- */
export const buzz = (ms = 8) => navigator.vibrate?.(ms);
