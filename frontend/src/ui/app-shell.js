// The window, laid out like Jay-C's: a top bar (brand, status pill, theme, settings) over the
// products. Settings opens in a <dialog>, like Jay-C's settings modal.
import { h } from './dom.js';
import { icons } from './icons.js';
import { createProductsPanel } from './products.js';
import { toggleTheme, currentTheme } from './theme.js';
import { settings } from '../store/settings.js';
import { resolveStyle } from '../core/style.js';
import { t } from '../core/i18n.js';

/** Each language in its own name, so it can be found whichever one is showing. */
const LANGUAGES = [
  ['system', null],
  ['en', 'English'],
  ['pt-BR', 'Português (Brasil)'],
];

function createThemeToggle() {
  const button = h('button', { type: 'button', class: 'icon-btn' });
  const render = () => {
    const dark = currentTheme() === 'dark';
    button.innerHTML = dark ? icons.sun : icons.moon;
    button.setAttribute('aria-label', dark ? t('Switch to light mode') : t('Switch to dark mode'));
    button.title = button.getAttribute('aria-label');
  };
  button.addEventListener('click', toggleTheme);
  // The theme can also change from Settings or the OS.
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  render();
  return button;
}

/**
 * Radios for the setting `key`, kept checked on its current value, also when it changes elsewhere
 * (the header's theme button). `renderOption(input, value, label)` builds each option's <label>.
 */
function radioGroup(key, attrs, options, renderOption) {
  const group = h(
    'div',
    { role: 'radiogroup', ...attrs },
    options.map(([value, label]) =>
      renderOption(h('input', { type: 'radio', name: key, value, onChange: () => settings.update({ [key]: value }) }), value, label),
    ),
  );
  const sync = () => {
    const current = key === 'style' ? resolveStyle(settings.get().style) : settings.get()[key];
    for (const input of group.querySelectorAll('input')) input.checked = input.value === current;
  };
  settings.subscribe(sync);
  sync();
  return group;
}

function createSettingsPanel() {
  // Each style option is a small preview drawn with that style's own tokens (styles/theme.css).
  const styleGroup = radioGroup(
    'style',
    { class: 'style-picker', 'aria-labelledby': 'style-label' },
    [['calm', t('Calm')], ['neon', t('Neon')], ['soft', t('Soft')]],
    (input, value, label) =>
      h(
        'label',
        { class: 'style-option' },
        input,
        h(
          'span',
          { class: 'style-preview', 'data-style-preview': value, 'aria-hidden': 'true' },
          h('span', { class: 'style-preview-tile' }, h('span', { class: 'style-preview-avatar' })),
          h('span', { class: 'style-preview-bar' }, h('span', {}), h('span', {}), h('span', { class: 'is-danger' })),
        ),
        h('span', { class: 'style-option-name' }, label),
      ),
  );
  const themeGroup = radioGroup(
    'theme',
    { class: 'segmented', 'aria-labelledby': 'theme-label' },
    [['system', t('System')], ['light', t('Light')], ['dark', t('Dark')]],
    (input, value, label) => h('label', {}, input, label),
  );
  const languageSelect = h(
    'select',
    { class: 'input', id: 'settings-language', 'aria-describedby': 'language-hint', onChange: (e) => settings.update({ language: e.target.value }) },
    LANGUAGES.map(([value, name]) => h('option', { value, selected: settings.get().language === value }, name ?? t('System'))),
  );

  const closeButton = h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('Close'), title: t('Close'), html: icons.close });
  const dialog = h(
    'dialog',
    { class: 'modal', 'aria-labelledby': 'settings-title' },
    h('div', { class: 'modal-header' }, h('h2', { id: 'settings-title' }, t('Settings')), closeButton),
    h(
      'div',
      { class: 'modal-body' },
      h(
        'fieldset',
        {},
        h('h3', {}, t('Appearance')),
        h('div', { class: 'field' }, h('span', { class: 'field-label', id: 'style-label' }, t('Style')), styleGroup),
        h('div', { class: 'field' }, h('span', { class: 'field-label', id: 'theme-label' }, t('Theme')), themeGroup),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'settings-language' }, t('Language')),
          languageSelect,
          h('p', { class: 'hint', id: 'language-hint' }, t('Jay-H reloads to change the language.')),
        ),
      ),
      h(
        'fieldset',
        {},
        h('h3', {}, t('About')),
        h(
          'div',
          { class: 'field' },
          h('p', { class: 'hint' }, t('Jay-H {version}', { version: __APP_VERSION__ })),
          h('p', { class: 'hint' }, t('The hub of the Jay line: every Jay app in one place.')),
        ),
      ),
    ),
  );
  closeButton.addEventListener('click', () => dialog.close());
  // A click on the backdrop (outside the box) closes it too.
  dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());
  return dialog;
}

/** Jay-C's server pill, here for the products: what the last check found. Clicking it checks again. */
function createStatusPill() {
  const pill = h('button', { type: 'button', class: 'status-pill', 'data-state': 'checking' }, t('Checking…'));
  const TEXT = {
    checking: () => t('Checking…'),
    updates: (n) => (n === 1 ? t('1 update') : t('{n} updates', { n })),
    online: () => t('All up to date'),
    reachable: () => t('GitHub online'),
    offline: () => t("Couldn't reach GitHub"),
  };
  return {
    pill,
    /** @param {{ state: 'checking' | 'updates' | 'online' | 'reachable' | 'offline', updates: number }} summary */
    show({ state, updates }) {
      pill.dataset.state = state;
      pill.textContent = TEXT[state](updates);
    },
  };
}

export function mountApp(root) {
  const status = createStatusPill();
  const panel = createProductsPanel({ onSummary: status.show });
  status.pill.addEventListener('click', panel.checkAll);

  const settingsDialog = createSettingsPanel();
  const settingsButton = h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('Settings'), title: t('Settings'), html: icons.settings });
  settingsButton.addEventListener('click', () => settingsDialog.showModal());

  const header = h(
    'header',
    { class: 'topbar' },
    h('div', { class: 'brand' }, h('span', { class: 'brand-mark wolf-mark', 'aria-hidden': 'true' }), h('span', { class: 'brand-name' }, 'Jay', h('span', {}, '-'), 'H')),
    status.pill,
    createThemeToggle(),
    settingsButton,
  );

  // A new language applies on a fresh page.
  settings.subscribe((next, prev) => {
    if (next.language !== prev.language) location.reload();
  });

  root.replaceChildren(header, h('main', { class: 'app-main' }, panel.element, h('p', { class: 'app-version' }, t('Jay-H {version}', { version: __APP_VERSION__ }))), settingsDialog);
}
