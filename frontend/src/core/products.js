// The Jay line (docs/ARQUITETURA.md, section 1). A new Jay product = a new entry in products.json,
// which the Rust side reads too (it builds the download URLs from it, never from the page), plus
// its description here.
// A function, so the descriptions are translated in the language set at startup.
import catalog from './products.json' with { type: 'json' };
import { t } from './i18n.js';

const summaries = () => ({
  'jay-c': t('Calls and screen sharing: camera, chat, live streams with sound and your own server.'),
  'jay-a': t('Audio: microphone filters for Jay-C, a soundboard, an editor and format conversion.'),
  'jay-h': t('This hub: it updates itself like the other apps.'),
});

/** Jay-H's own entry: its version is the running one, and it updates by quitting into its installer. */
export const SELF_ID = 'jay-h';

/**
 * @returns {Array<{ id: string, name: string, repo: string, exe: string, icon: string, summary: string }>}
 *   `repo` is the GitHub "owner/name"; `name` is also the installer's productName (its registry key).
 */
export const products = () => catalog.map((p) => ({ ...p, summary: summaries()[p.id] }));
