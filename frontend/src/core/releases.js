// Versions of the Jay apps: the latest release on GitHub and how it compares with the installed one
// (docs/ARQUITETURA.md, section 1).

/** "v0.4.0" → [0, 4, 0]. A pre-release or build suffix ("-beta", "+1") is ignored. */
const parts = (version) =>
  String(version)
    .replace(/^v/i, '')
    .split(/[-+]/)[0]
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);

/** Negative if a < b, 0 if equal, positive if a > b. Missing parts count as 0 ("1.2" = "1.2.0"). */
export function compareVersions(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

/**
 * @param {{ version: string } | null} installed
 * @param {{ version: string } | null} latest
 * @returns {'no-release' | 'not-installed' | 'update' | 'up-to-date'}
 */
export function productStatus(installed, latest) {
  if (!latest) return 'no-release';
  if (!installed) return 'not-installed';
  return compareVersions(installed.version, latest.version) < 0 ? 'update' : 'up-to-date';
}

/**
 * The parts of a GitHub release the hub uses: its version and the Windows installer
 * (`<Product>_<version>_x64-setup.exe`, with the SHA-256 GitHub computes as `digest`).
 */
export function parseRelease(release) {
  const asset = release.assets?.find((a) => /_x64-setup\.exe$/i.test(a.name));
  return {
    version: release.tag_name.replace(/^v/i, ''),
    url: release.html_url,
    installer: asset ? { name: asset.name, size: asset.size, url: asset.browser_download_url, sha256: asset.digest?.replace(/^sha256:/, '') ?? null } : null,
  };
}

/** The latest release of `repo` ("owner/name"), or null when it has none. Throws on network/API errors. */
export async function fetchLatestRelease(repo, fetchImpl = fetch) {
  const response = await fetchImpl(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub ${response.status}`);
  return parseRelease(await response.json());
}
