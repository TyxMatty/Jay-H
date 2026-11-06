// The Jay line (docs/ARQUITETURA.md, section 1). A new Jay product = a new entry here.
// A function, so the descriptions are translated in the language set at startup.
import { t } from './i18n.js';

/**
 * @returns {Array<{ id: string, name: string, repo: string, exe: string, icon: string, summary: string }>}
 *   `repo` is the GitHub "owner/name"; `name` is also the installer's productName (its registry key).
 */
export const products = () => [
  {
    id: 'jay-c',
    name: 'Jay-C',
    repo: 'TyxMatty/JayC',
    exe: 'jay-c.exe',
    icon: 'video',
    summary: t('Calls and screen sharing: camera, chat, live streams with sound and your own server.'),
  },
  {
    id: 'jay-a',
    name: 'Jay-A',
    repo: 'TyxMatty/Jay-A',
    exe: 'jay-a.exe',
    icon: 'waveform',
    summary: t('Audio: microphone filters for Jay-C, a soundboard, an editor and format conversion.'),
  },
];
