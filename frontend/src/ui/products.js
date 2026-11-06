// Products: one card per Jay app, with the installed version (Windows registry, through Rust) and the
// latest release on GitHub. Install and update arrive in stage 2 (docs/ARQUITETURA.md, section 4).
import { h } from './dom.js';
import { icons } from './icons.js';
import { products } from '../core/products.js';
import { fetchLatestRelease, productStatus } from '../core/releases.js';
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
async function readInstalled(name) {
  if (!isTauri) return undefined;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('installed_app', { name });
}

const BADGES = {
  update: () => t('Update available'),
  'up-to-date': () => t('Up to date'),
};

function productCard(product) {
  const installedValue = h('dd', {}, '…');
  const latestValue = h('dd', {}, '…');
  const badge = h('span', { class: 'badge', hidden: true });
  const error = h('p', { class: 'hint', 'data-tone': 'error', role: 'status', hidden: true });

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
    h('div', { class: 'product-actions' }, externalLink(`https://github.com/${product.repo}`, t('Repository'))),
  );

  async function check() {
    card.setAttribute('aria-busy', 'true');
    installedValue.textContent = latestValue.textContent = '…';
    badge.hidden = error.hidden = true;
    const [installed, latest] = await Promise.allSettled([readInstalled(product.name), fetchLatestRelease(product.repo)]);

    if (installed.status === 'rejected') installedValue.textContent = '—';
    else if (installed.value === undefined) installedValue.textContent = t('Only in the app');
    else installedValue.textContent = installed.value?.version ?? t('Not installed');

    if (latest.status === 'rejected') latestValue.textContent = '—';
    else latestValue.textContent = latest.value?.version ?? t('No release yet');

    const problem = installed.reason ?? latest.reason;
    if (problem) {
      error.textContent = t("Couldn't check: {error}", { error: problem.message ?? String(problem) });
      error.hidden = false;
    } else if (installed.value !== undefined) {
      const status = productStatus(installed.value, latest.value);
      if (BADGES[status]) {
        badge.textContent = BADGES[status]();
        badge.dataset.status = status;
        badge.hidden = false;
      }
    }
    card.setAttribute('aria-busy', 'false');
  }

  return { card, check };
}

export function createProductsPanel() {
  const cards = products().map(productCard);
  const button = h('button', { type: 'button', class: 'btn btn-secondary' }, t('Check again'));
  const checkAll = async () => {
    button.disabled = true;
    await Promise.all(cards.map((c) => c.check()));
    button.disabled = false;
  };
  button.addEventListener('click', checkAll);
  checkAll();

  return h(
    'section',
    { class: 'app-panel' },
    h('div', { class: 'panel-head' }, h('h1', {}, t('Products')), button),
    h('div', { class: 'product-grid' }, cards.map((c) => c.card)),
  );
}
