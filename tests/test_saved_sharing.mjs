import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildSavedListUrl, readSharedList } from '../saved-sharing.mjs';

const base = 'https://example.org/';
const invalid = hash => {
  const result = readSharedList(hash);
  assert.equal(result.ids, null, hash);
  assert.equal(typeof result.error, 'string', hash);
  assert.ok(result.error.length > 0, hash);
};

test('full current dataset fits and roundtrips without loss', () => {
  const { papers } = JSON.parse(readFileSync(new URL('../data/papers.json', import.meta.url)));
  assert.equal(papers.length, 5603);
  const ids = papers.map(paper => paper.id);
  const url = new URL(buildSavedListUrl(base, ids));
  assert.ok(url.hash.length <= 32768, `fragment length: ${url.hash.length}`);
  const result = readSharedList(url.hash);
  assert.equal(result.error, null);
  assert.deepEqual(new Set(result.ids), new Set(ids));
  assert.equal(result.ids.length, ids.length);
  assert.equal(buildSavedListUrl(base, [...ids].reverse()), url.href);
});

test('deduplicates and sorts tracks and numeric paper IDs deterministically', () => {
  const url = buildSavedListUrl(base, ['10-MAIN', '2-MAIN', '3-CL', '2-MAIN', '1-CL']);
  assert.equal(url, `${base}#list=v1;CL:1.2;MAIN:2.8`);
  assert.deepEqual(readSharedList(new URL(url).hash), {
    ids: ['1-CL', '3-CL', '2-MAIN', '10-MAIN'], error: null,
  });
  assert.deepEqual(readSharedList('#list=v1;MAIN:2.8;CL:1.2').ids,
    ['1-CL', '3-CL', '2-MAIN', '10-MAIN']);
});

test('keeps root/subpath and removes the old query and fragment', () => {
  for (const pathname of ['/', '/finder/index.html']) {
    const url = new URL(buildSavedListUrl(`https://example.org${pathname}?papers=secret#old`, ['3-MAIN']));
    assert.equal(url.pathname, pathname);
    assert.equal(url.search, '');
    assert.equal(url.hash, '#list=v1;MAIN:3');
    assert.ok(!url.href.includes('?'));
  }
});

test('empty snapshots and generic track codes are supported', () => {
  assert.equal(buildSavedListUrl(base, []), `${base}#list=v1`);
  assert.deepEqual(readSharedList('#list=v1'), { ids: [], error: null });
  const ids = ['1-A', '2-TRACK1234567', `${Number.MAX_SAFE_INTEGER}-CL`];
  assert.deepEqual(new Set(readSharedList(new URL(buildSavedListUrl(base, ids)).hash).ids), new Set(ids));
});

test('accepts escaped fragments and ignores unrelated anchors', () => {
  assert.deepEqual(readSharedList(`#${encodeURIComponent('list=v1;MAIN:1.2')}`), {
    ids: ['1-MAIN', '3-MAIN'], error: null,
  });
  for (const hash of ['', '#', '#paper=1-MAIN', '#listening', '#other%zz', null]) {
    assert.equal(readSharedList(hash), null);
  }
});

test('rejects malformed, unsupported, duplicate, zero, negative and overflowing values', () => {
  for (const hash of [
    '#list', '#list=', '#list=v2', '#list=v1%zz', '#%6cist=v1%zz', '#list=v1;',
    '#list=v1;MAIN:', '#list=v1;main:1', '#list=v1;MAIN:1:2',
    '#list=v1;MAIN:1;MAIN:2', '#list=v1;MAIN:0', '#list=v1;MAIN:01',
    '#list=v1;MAIN:-1', '#list=v1;MAIN:+1', '#list=v1;MAIN:1.',
    '#list=v1;MAIN:1..2', '#list=v1;MAIN:1A',
    '#list=v1;MAIN:zzzzzzzzzzzzzzzzzzzz',
    `#list=v1;MAIN:${Number.MAX_SAFE_INTEGER.toString(36)}.1`,
    '#list=v1;TRACK12345678:1',
  ]) invalid(hash);
});

test('rejects count/size limits instead of truncating', () => {
  const maximum = Array.from({ length: 6000 }, (_, i) => `${i + 1}-MAIN`);
  assert.equal(readSharedList(new URL(buildSavedListUrl(base, maximum)).hash).ids.length, 6000);
  invalid(`#list=v1;MAIN:${Array(6001).fill('1').join('.')}`);
  invalid(`#list=v1;MAIN:${'1'.repeat(32768)}`);
  assert.throws(() => buildSavedListUrl(base,
    Array.from({ length: 6001 }, (_, i) => `${i + 1}-MAIN`)), /6000/);
  const large = Array.from({ length: 6000 }, (_, i) => `${i + 1}-T${String(i).padStart(10, '0')}`);
  assert.throws(() => buildSavedListUrl(base, large), /32768/);
});

test('encoder rejects noncanonical IDs', () => {
  for (const id of ['0-MAIN', '01-MAIN', '-1-MAIN', '1-main', '1.5-MAIN',
    '1-MAIN-extra', '1-TRACK12345678', '9007199254740992-MAIN', 1, null]) {
    assert.throws(() => buildSavedListUrl(base, [id]), /Invalid saved paper ID/);
  }
});
