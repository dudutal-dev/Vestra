/* ============================================================
   VESTRA · Application shell & router
   ============================================================ */

import { $, $$, el, icon, toast, buzz, openSheet, closeAllSheets } from './ui.js';
import { t, setLang, lang, applyStaticText, isHe } from './i18n.js';
import { state, refreshAll, itemById } from './state.js';
import { Settings } from './store.js';

import { renderHome } from './views/home.js';
import { renderWardrobe, openItemSheet } from './views/wardrobe.js';
import { renderCapture } from './views/capture.js';
import { renderStudio } from './views/studio.js';
import { renderCloset } from './views/closet.js';
import { renderBeauty } from './views/beauty.js';
import { renderProfile } from './views/profile.js';
import { renderAnchors } from './views/anchors.js';
import { renderLooks, deleteLook } from './views/looks.js';
import { renderLookCard } from './views/lookcard.js';

const VIEWS = {
  home:     renderHome,
  wardrobe: renderWardrobe,
  capture:  renderCapture,
  studio:   renderStudio,
  closet:   renderCloset,
  beauty:   renderBeauty,
  anchors:  renderAnchors,
  looks:    renderLooks,
  profile:  renderProfile,
};

const TAB_ICONS = { home: 'home', wardrobe: 'hanger', studio: 'sparkles', profile: 'user' };

/* ---------------- Router ---------------- */
function go(view, opts = {}) {
  if (!VIEWS[view]) view = 'home';

  state.view = view;
  ctx.opts = opts;
  history.replaceState({ view }, '', `#${view}`);

  $$('.view').forEach(v => v.classList.toggle('is-active', v.dataset.view === view));
  $$('.tab').forEach(b => b.classList.toggle('is-active', b.dataset.goto === view));

  render();
  scrollTo(0, 0);
}

function render() {
  const root = $(`#view-${state.view}`);
  if (root) VIEWS[state.view](root, ctx);
}

const ctx = {
  opts: {},
  go,
  rerender: render,
  openItem: (item) => openItemSheet(item, ctx),
  openLook: (look) => {
    // A look on the shelf can be taken off it. A studio result that has not
    // been saved yet has nothing stored to remove, so it gets no delete button.
    const onShelf = state.looks.some(l => l.id === look?.id);
    const close = openSheet(el('div', {}, renderLookCard(look, {
      onDelete: onShelf
        ? async (l) => { if (await deleteLook(l)) { close(); render(); } }
        : null,
    })));
  },
  startPair: (item) => {
    state.anchorId = item.id;
    state.pairResult = null;
    state.lastLook = null;
    go('studio');
  },
  reboot: () => boot(),
};

/* ---------------- Chrome ---------------- */
function paintChrome() {
  document.documentElement.lang = lang();
  document.documentElement.dir = isHe() ? 'rtl' : 'ltr';
  document.documentElement.dataset.theme = Settings.theme;

  applyStaticText(document);

  // Bottom nav icons
  $$('.tab').forEach(b => {
    const key = b.dataset.goto;
    if (key === 'capture') {
      b.querySelector('.shoot-btn').innerHTML = icon('camera');
    } else {
      b.querySelector('.ic').innerHTML = icon(TAB_ICONS[key] || 'home');
    }
  });

  // Language toggle
  $$('#langToggle button').forEach(b => {
    b.classList.toggle('is-on', b.dataset.lang === lang());
    b.onclick = () => {
      if (b.dataset.lang === lang()) return;
      setLang(b.dataset.lang);
      boot();
    };
  });

  // Theme button
  const tb = $('#themeBtn');
  const paintTheme = () => {
    tb.innerHTML = icon(Settings.theme === 'dark' ? 'star' : 'moon');
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', Settings.theme === 'dark' ? '#100E0D' : '#FBFAF7');
  };
  paintTheme();
  tb.onclick = () => {
    Settings.theme = Settings.theme === 'dark' ? 'light' : 'dark';
    paintTheme();
    buzz();
  };

  // Tabs
  $$('.tab').forEach(b => { b.onclick = () => { buzz(); go(b.dataset.goto); }; });
}

/* ---------------- Sticky app bar ---------------- */
let scrollBound = false;
function bindScroll() {
  if (scrollBound) return;
  scrollBound = true;
  const bar = $('#appbar');
  addEventListener('scroll', () => {
    bar.classList.toggle('is-stuck', scrollY > 6);
  }, { passive: true });
}

/* ---------------- Boot ---------------- */
async function boot() {
  closeAllSheets();
  setLang(lang());
  paintChrome();
  bindScroll();

  await refreshAll();

  const hash = location.hash.replace('#', '');
  go(VIEWS[hash] ? hash : 'home');

  // Retire the splash once the first view is painted
  const splash = $('#splash');
  if (splash && !splash.classList.contains('is-done')) {
    setTimeout(() => {
      splash.classList.add('is-done');
      splash.addEventListener('animationend', () => splash.remove(), { once: true });
    }, Settings.seen ? 520 : 1500);
    Settings.seen = true;
  }
}

addEventListener('hashchange', () => {
  const h = location.hash.replace('#', '');
  if (VIEWS[h] && h !== state.view) go(h);
});

addEventListener('online',  () => toast(isHe() ? 'חזרת לרשת' : 'Back online'));
addEventListener('offline', () => toast(t('err_network'), 'warn'));

boot().catch(err => {
  console.error(err);
  const splash = $('#splash');
  splash?.remove();
  toast(t('err_generic'), 'bad');
});

/* ---------------- Service worker ----------------
   Skipped on localhost: the cache-first shell would otherwise serve stale
   modules during development, which looks exactly like a code change that
   "didn't take". Offline caching still applies on any deployed origin. */
const IS_LOCAL = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);

if ('serviceWorker' in navigator && location.protocol === 'https:' && !IS_LOCAL) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => reg.update().catch(() => {}))
      .catch(() => { /* offline caching is optional */ });
  });

  // A new worker taking over means the modules already running on this page
  // came from the previous build. Reload once, so the visit that fetched the
  // update is also the visit that shows it.
  //
  // Only when a worker was already in charge: on a first-ever visit the
  // controller arrives for the first time, and reloading there would be a
  // pointless flash. The flag stops a worker that re-claims from looping the
  // page forever.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
} else if ('serviceWorker' in navigator && IS_LOCAL) {
  navigator.serviceWorker.getRegistrations()
    .then(rs => rs.forEach(r => r.unregister()))
    .catch(() => {});
}
