// Versions of the Jay apps: how the latest release compares with the installed one
// (docs/ARQUITETURA.md, section 1). The latest release itself comes from Rust (products.rs, latest_release).

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
