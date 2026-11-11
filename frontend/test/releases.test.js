import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, productStatus } from '../src/core/releases.js';

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
