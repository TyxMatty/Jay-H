// Products: one card per Jay app. Versions, install and update arrive in stages 1 and 2
// (docs/ARQUITETURA.md, section 4).
import { h } from './dom.js';
import { icons } from './icons.js';
import { products } from '../core/products.js';
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

function productCard(product) {
  return h(
    'article',
    { class: 'product-card', 'aria-labelledby': `product-${product.id}` },
    h(
      'div',
      { class: 'product-head' },
      h('span', { class: 'product-icon', html: icons[product.icon] }),
      h('h2', { id: `product-${product.id}` }, product.name),
    ),
    h('p', { class: 'product-summary' }, product.summary),
    h('p', { class: 'hint' }, t('Versions, install and update arrive in stage {n}.', { n: 1 })),
    h('div', { class: 'product-actions' }, externalLink(`https://github.com/${product.repo}`, t('Repository'))),
  );
}

export function createProductsPanel() {
  return h('section', { class: 'app-panel' }, h('h1', {}, t('Products')), h('div', { class: 'product-grid' }, products().map(productCard)));
}
