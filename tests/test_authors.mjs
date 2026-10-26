import assert from 'node:assert/strict';
import test from 'node:test';
import { authorKey, indexAuthors, posterBrowsing } from '../schedule-view.mjs';

test('author pages group a full publication name across days and tracks', () => {
  const papers = [
    { id: 'one', authors: ['Tom Völker', 'Jan Pfister'], date: '2026-10-25', track: 'Main conference' },
    { id: 'two', authors: ['Andreas Hotho', 'Tom Völker'], date: '2026-10-27', track: 'Findings' },
    { id: 'three', authors: [], presenter: 'Tom Völker', date: '2026-10-26' },
  ];
  const index = indexAuthors(papers);
  assert.deepEqual([...index.get('Tom Völker')], papers.slice(0, 2));
  assert.equal(index.get('Jan Pfister').size, 1);
  assert.equal(index.get('Andreas Hotho').size, 1);
});

test('Unicode composition and whitespace normalize without merging distinct names', () => {
  const papers = [
    { authors: ['José Li', 'Jose Li', 'JOSÉ LI', 'Li', 'Jose\u0301  Li'] },
    { authors: [' José Li '] },
  ];
  const index = indexAuthors(papers);
  assert.equal(authorKey(' Jose\u0301  Li '), 'José Li');
  assert.equal(index.size, 4);
  assert.equal(index.get('José Li').size, 2);
  for (const name of ['Jose Li', 'JOSÉ LI', 'Li']) assert.equal(index.get(name).size, 1);
  assert.equal(index.has('José'), false);
});

test('duplicate author credits count each paper once; absent authors are not inferred', () => {
  const paper = { authors: ['A. Author', 'A. Author', ''], presenter: 'Another Person' };
  const index = indexAuthors([paper]);
  assert.equal(index.size, 1);
  assert.deepEqual([...index.get('A. Author')], [paper]);
  assert.equal(index.has('Another Person'), false);
});

test('incremental author indexing preserves complete membership and insertion order', () => {
  const papers = [
    { authors: ['José Li', 'A. Author', 'A. Author'] },
    { authors: ['B. Author', 'Jose\u0301 Li'] },
    { authors: ['A. Author'] },
  ];
  const index = new Map();
  for (const paper of papers) assert.equal(indexAuthors([paper], index), index);
  assert.deepEqual(index, indexAuthors(papers));
  indexAuthors(papers, index);
  assert.deepEqual(index, indexAuthors(papers));
});

test('author pages bypass poster browsing regardless of their incoming view', () => {
  for (const view of ['posters', 'programme']) {
    assert.equal(posterBrowsing({ view, q: '', saved: false, paper: null, author: 'Tom Völker', filters: {} }), false);
  }
});
