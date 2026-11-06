import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, productStatus, parseRelease, fetchLatestRelease } from '../src/core/releases.js';

test('compareVersions: numeric parts, optional v, missing parts and suffixes', () => {
  assert.ok(compareVersions('0.2.4', '0.4.0') < 0);
  assert.ok(compareVersions('0.10.0', '0.9.9') > 0); // numbers, not text
  assert.equal(compareVersions('v1.2', '1.2.0'), 0);
  assert.equal(compareVersions('1.0.0-beta', '1.0.0'), 0);
  assert.ok(compareVersions('1.0.1', 'v1.0.0') > 0);
});

test('productStatus', () => {
  assert.equal(productStatus(null, null), 'no-release');
  assert.equal(productStatus({ version: '0.1.0' }, null), 'no-release');
  assert.equal(productStatus(null, { version: '0.4.0' }), 'not-installed');
  assert.equal(productStatus({ version: '0.2.4' }, { version: '0.4.0' }), 'update');
  assert.equal(productStatus({ version: '0.4.0' }, { version: '0.4.0' }), 'up-to-date');
  assert.equal(productStatus({ version: '0.5.0' }, { version: '0.4.0' }), 'up-to-date'); // a dev build ahead
});

// The shape of Jay-C's v0.4.0 release (api.github.com, 2026-11-06), trimmed.
const jayC = {
  tag_name: 'v0.4.0',
  html_url: 'https://github.com/TyxMatty/Jay-C/releases/tag/v0.4.0',
  assets: [
    {
      name: 'Jay-C_0.4.0_x64-setup.exe',
      size: 2302415,
      browser_download_url: 'https://github.com/TyxMatty/Jay-C/releases/download/v0.4.0/Jay-C_0.4.0_x64-setup.exe',
      digest: 'sha256:848005e8a2f42200b36f5553fd144a9d8aefdcbddbbf1ad49b56c65f473d63de',
    },
  ],
};

test('parseRelease picks the version and the x64 installer', () => {
  assert.deepEqual(parseRelease(jayC), {
    version: '0.4.0',
    url: jayC.html_url,
    installer: {
      name: 'Jay-C_0.4.0_x64-setup.exe',
      size: 2302415,
      url: jayC.assets[0].browser_download_url,
      sha256: '848005e8a2f42200b36f5553fd144a9d8aefdcbddbbf1ad49b56c65f473d63de',
    },
  });
  assert.equal(parseRelease({ tag_name: 'v1.0.0', assets: [{ name: 'notes.txt' }] }).installer, null);
});

test('fetchLatestRelease: 404 = no release, other errors throw', async () => {
  const reply = (status, body) => async () => ({ status, ok: status < 300, json: async () => body });
  assert.equal(await fetchLatestRelease('TyxMatty/Jay-A', reply(404)), null);
  assert.equal((await fetchLatestRelease('TyxMatty/Jay-C', reply(200, jayC))).version, '0.4.0');
  await assert.rejects(fetchLatestRelease('TyxMatty/Jay-C', reply(403)), /GitHub 403/);
});
