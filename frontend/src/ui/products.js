// Products: one card per Jay app, with the installed version (Windows registry, through Rust) and the
// latest release on GitHub, and the buttons to install, update (products.rs) and open the app.
import { h } from './dom.js';
import { icons } from './icons.js';
import { products, SELF_ID } from '../core/products.js';
import { productStatus } from '../core/releases.js';
import { t } from '../core/i18n.js';

const isTauri = '__TAURI_INTERNALS__' in window;

/** In the app, links open in the default browser (the WebView would ignore target=_blank). */
function externalLink(href, text) {
  const link = h('a', { class: 'btn btn-secondary', href, target: '_blank', rel: 'noreferrer' }, h('span', { class: 'btn-icon', html: icons.external }), text);
  if (isTauri) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(href)).catch((error) => console.warn('[opener]', error));
    });
  }
  return link;
}

/** { version, location } or null; undefined in the browser, which can't read the registry. */
async function readInstalled(id) {
  if (id === SELF_ID) return { version: __APP_VERSION__ };
  if (!isTauri) return undefined;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('installed_app', { id });
}

/** { version, installer } or null (no release yet); undefined in the browser. Rust asks GitHub. */
async function readLatest(id) {
  if (!isTauri) return undefined;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('latest_release', { id });
}

const errorText = (error) => error?.message ?? String(error);

const BADGES = {
  update: () => t('Update available'),
  'up-to-date': () => t('Up to date'),
};

function productCard(product) {
  const installedValue = h('dd', {}, '…');
  const latestValue = h('dd', {}, '…');
  const badge = h('span', { class: 'badge', hidden: true });
  const error = h('p', { class: 'hint', 'data-tone': 'error', role: 'status', hidden: true });
  // Install / update: a progress bar while downloading, then a line about the installer.
  const bar = h('progress', { class: 'product-progress', max: 100, hidden: true, 'aria-label': t('Download') });
  const note = h('p', { class: 'hint', role: 'status', hidden: true });
  const installButton = h('button', { type: 'button', class: 'btn', hidden: true });
  const openButton = h('button', { type: 'button', class: 'btn btn-secondary', hidden: true }, t('Open'));

  const card = h(
    'article',
    { class: 'product-card', 'aria-labelledby': `product-${product.id}`, 'aria-busy': 'true' },
    h(
      'div',
      { class: 'product-head' },
      h('span', { class: 'product-icon', html: icons[product.icon] }),
      h('h2', { id: `product-${product.id}` }, product.name),
      badge,
    ),
    h('p', { class: 'product-summary' }, product.summary),
    h('dl', { class: 'product-versions' }, h('div', {}, h('dt', {}, t('Installed')), installedValue), h('div', {}, h('dt', {}, t('Latest')), latestValue)),
    error,
    bar,
    note,
    h('div', { class: 'product-actions' }, installButton, openButton, externalLink(`https://github.com/${product.repo}`, t('Repository'))),
  );

  openButton.addEventListener('click', async () => {
    error.hidden = true;
    const { invoke } = await import('@tauri-apps/api/core');
    invoke('open_app', { id: product.id }).catch((e) => {
      error.textContent = t("Couldn't open {name}: {error}", { name: product.name, error: errorText(e) });
      error.hidden = false;
    });
  });

  async function install() {
    const { invoke, Channel } = await import('@tauri-apps/api/core');
    installButton.disabled = openButton.disabled = true;
    error.hidden = true;
    bar.value = 0;
    bar.hidden = note.hidden = false;
    note.textContent = t('Downloading…');
    const onProgress = new Channel();
    onProgress.onmessage = (p) => {
      if (p.stage === 'download') {
        bar.value = Math.round((p.done * 100) / p.total);
      } else {
        bar.hidden = true;
        note.textContent =
          product.id === SELF_ID
            ? t('Checked. Jay-H closes, updates and opens again.')
            : p.update
              ? t('Checked. Installing the update…')
              : t('Checked. Finish in the installer window.');
      }
    };
    try {
      const code = await invoke('install_app', { id: product.id, onProgress });
      note.textContent = code === 0 ? t('Done.') : t('The installer closed without finishing (code {code}).', { code });
    } catch (e) {
      note.hidden = true;
      error.textContent = t("Couldn't install: {error}", { error: errorText(e) });
      error.hidden = false;
    }
    bar.hidden = true;
    installButton.disabled = openButton.disabled = false;
    await check();
  }
  installButton.addEventListener('click', install);

  /** Reads both versions and updates the card. Returns its status (productStatus), 'error' or 'unknown' (browser). */
  async function check() {
    card.setAttribute('aria-busy', 'true');
    installedValue.textContent = latestValue.textContent = '…';
    badge.hidden = error.hidden = installButton.hidden = openButton.hidden = true;
    const [installed, latest] = await Promise.allSettled([readInstalled(product.id), readLatest(product.id)]);

    if (installed.status === 'rejected') installedValue.textContent = '—';
    else if (installed.value === undefined) installedValue.textContent = t('Only in the app');
    else installedValue.textContent = installed.value?.version ?? t('Not installed');

    if (latest.status === 'rejected') latestValue.textContent = '—';
    else if (latest.value === undefined) latestValue.textContent = t('Only in the app');
    else latestValue.textContent = latest.value?.version ?? t('No release yet');

    const problem = installed.reason ?? latest.reason;
    let status = 'unknown';
    if (problem) {
      status = 'error';
      error.textContent = t("Couldn't check: {error}", { error: errorText(problem) });
      error.hidden = false;
    } else if (installed.value !== undefined) {
      status = productStatus(installed.value, latest.value);
      if (BADGES[status]) {
        badge.textContent = BADGES[status]();
        badge.dataset.status = status;
        badge.hidden = false;
      }
      // Without an installer on GitHub there is nothing to install (Rust checks again before downloading).
      if (latest.value?.installer && (status === 'not-installed' || status === 'update')) {
        const text = status === 'update' ? t('Update to {version}', { version: latest.value.version }) : t('Install');
        installButton.replaceChildren(h('span', { class: 'btn-icon', html: icons.download }), text);
        installButton.hidden = false;
      }
      openButton.hidden = !installed.value || product.id === SELF_ID;
      openButton.className = installButton.hidden ? 'btn' : 'btn btn-secondary';
    }
    card.setAttribute('aria-busy', 'false');
    return status;
  }

  return { id: product.id, card, check, install };
}

/**
 * The products: a header (Jay-C's lobby hero, smaller) over one card per app.
 * @param {{ onSummary: (s: { state: 'checking' | 'updates' | 'online' | 'browser' | 'offline', updates: number }) => void }} options
 */
export function createProductsPanel({ onSummary }) {
  const cards = products().map(productCard);
  const subtitle = h('p', {}, t('Install, update and open every Jay app from here.'));
  const checkButton = h('button', { type: 'button', class: 'btn btn-secondary' }, t('Check again'));
  const updateAllButton = h('button', { type: 'button', class: 'btn', hidden: true }, h('span', { class: 'btn-icon', html: icons.download }), t('Update all'));
  let pending = []; // the cards with an update, from the last check

  const checkAll = async () => {
    checkButton.disabled = true;
    updateAllButton.hidden = true;
    onSummary({ state: 'checking', updates: 0 });
    const statuses = await Promise.all(cards.map((c) => c.check()));
    pending = cards.filter((_, i) => statuses[i] === 'update');
    updateAllButton.hidden = pending.length < 2; // one update: its own card's button is enough
    checkButton.disabled = false;
    // 'unknown' = in a browser, which asks nothing (no registry, no GitHub): only the app can check.
    const state = statuses.includes('error') ? 'offline' : pending.length ? 'updates' : statuses.includes('unknown') ? 'browser' : 'online';
    onSummary({ state, updates: pending.length });
  };

  updateAllButton.addEventListener('click', async () => {
    updateAllButton.disabled = checkButton.disabled = true;
    // One installer at a time (products.rs refuses two); Jay-H last, since updating it closes the hub.
    for (const card of [...pending].sort((a, b) => (a.id === SELF_ID) - (b.id === SELF_ID))) await card.install();
    updateAllButton.disabled = false;
    await checkAll();
  });
  checkButton.addEventListener('click', checkAll);
  checkAll();

  const element = h(
    'section',
    { class: 'products' },
    h(
      'div',
      { class: 'products-hero' },
      h('span', { class: 'products-hero-mark wolf-mark', 'aria-hidden': 'true' }),
      h('div', { class: 'products-hero-text' }, h('h1', {}, t('Every Jay app in one place')), subtitle),
      h('div', { class: 'products-hero-actions' }, updateAllButton, checkButton),
    ),
    h('div', { class: 'product-grid', role: 'list', 'aria-label': t('Products') }, cards.map((c) => (c.card.setAttribute('role', 'listitem'), c.card))),
  );
  return { element, checkAll };
}
