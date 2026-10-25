import assert from 'node:assert/strict';
import test from 'node:test';
import { conferenceNow, initialDay, sessionKey, posterBrowsing, resultPage, RESULT_PAGE_SIZE, presenterAuthorIndices } from '../schedule-view.mjs';

const days = ['all', '2026-10-25', '2026-10-26', '2026-10-27', 'undated'];
const empty = { q: '', day: '2026-10-25', saved: false, paper: null, filters: { track: null, room: null } };

test('default day follows Budapest midnight, including the daylight-saving change', () => {
  for (const [instant, date, time] of [
    ['2026-10-24T22:30:00Z', '2026-10-25', '00:30'],
    ['2026-10-25T01:30:00Z', '2026-10-25', '02:30'],
    ['2026-10-25T23:15:00Z', '2026-10-26', '00:15'],
    ['2026-10-26T23:15:00Z', '2026-10-27', '00:15'],
  ]) {
    const now = conferenceNow('Europe/Budapest', new Date(instant));
    assert.deepEqual(now, { date, time });
    assert.equal(initialDay(null, days, now.date), date);
  }
});

test('an explicit day, including All days, overrides today', () => {
  for (const day of days) assert.equal(initialDay(day, days, '2026-10-26'), day);
});

test('outside the schedule defaults to All days; invalid URL days do not hide results', () => {
  for (const today of ['2026-10-24', '2026-10-28']) assert.equal(initialDay(null, days, today), 'all');
  assert.equal(initialDay('invalid', days, '2026-10-26'), '2026-10-26');
});

test('poster browsing applies only to an unsearched poster view', () => {
  const landing = { ...empty, view: 'posters', author: null, posterSession: null };
  assert.equal(posterBrowsing(landing), true);
  assert.equal(posterBrowsing({ ...landing, q: '   ', day: 'all', posterSession: 'A' }), true);
  assert.equal(posterBrowsing({ ...landing, filters: { room: 'Hall H' } }), true);
  for (const change of [{ view: 'programme' }, { q: 'german' }, { saved: true },
    { paper: '9736-FIND' }, { author: 'Tom Völker' }]) {
    assert.equal(posterBrowsing({ ...landing, ...change }), false);
  }
});

test('result pages have bounded sizes and correct boundaries', () => {
  assert.equal(RESULT_PAGE_SIZE, 16);
  for (const count of [0, 1, 15, 16, 17, 32, 33]) {
    const items = Array.from({ length: count }, (_, i) => i);
    const pages = Math.max(1, Math.ceil(count / RESULT_PAGE_SIZE));
    const first = resultPage(items);
    assert.deepEqual(first, { items: items.slice(0, RESULT_PAGE_SIZE), page: 0, pages, start: 0 });
    const last = resultPage(items, pages - 1);
    assert.equal(last.start, (pages - 1) * RESULT_PAGE_SIZE);
    assert.equal(last.items.length, count ? count - last.start : 0);
    assert.ok(last.items.length <= RESULT_PAGE_SIZE);
  }
});

test('paging replaces slices without losing or duplicating papers', () => {
  const items = Array.from({ length: 5603 }, (_, id) => ({ id }));
  const snapshot = items.slice();
  const { pages } = resultPage(items);
  const seen = [];
  for (let page = 0; page < pages; page++) {
    const result = resultPage(items, page);
    assert.equal(result.page, page);
    assert.equal(result.start, page * RESULT_PAGE_SIZE);
    assert.ok(result.items.length <= RESULT_PAGE_SIZE);
    seen.push(...result.items);
  }
  assert.deepEqual(seen, items);
  assert.equal(new Set(seen).size, items.length);
  assert.deepEqual(items, snapshot, 'The source collection is not mutated');
});

test('invalid and out-of-range pages stay inside available bounds', () => {
  const items = Array.from({ length: RESULT_PAGE_SIZE * 2 + 1 }, (_, i) => i);
  for (const page of [-100, -1, NaN, -Infinity]) assert.equal(resultPage(items, page).page, 0);
  for (const page of [3, 100, Infinity]) assert.equal(resultPage(items, page).page, 2);
  assert.equal(resultPage(items, 1.9).page, 1);
  assert.deepEqual(resultPage([], 100), { items: [], page: 0, pages: 1, start: 0 });
});

test('parallel sessions stay separate by topic and room as well as date, time and session label', () => {
  const paper = { date: '2026-10-25', start: '11:00', end: '12:30', session: 'Session 2',
    topic: 'Question Answering', room: 'G7-8', _timed: true };
  for (const change of [{ date: '2026-10-27' }, { start: '11:01' }, { end: '12:00' }, { session: 'Virtual 4' },
    { room: 'F8' }, { room: null }, { topic: 'Machine Learning for NLP 1' }, { topic: null }]) {
    assert.notEqual(sessionKey(paper), sessionKey({ ...paper, ...change }));
  }
});

test('papers in the same session stay together across tracks and missing presentation formats', () => {
  const paper = { date: '2026-10-25', start: '11:00', end: '12:30', session: 'Session 2',
    topic: 'Poster Session A', room: 'Hall H', trackCode: 'MAIN', presentation: 'Poster', _timed: true };
  assert.equal(sessionKey(paper), sessionKey({ ...paper, title: 'Another paper', trackCode: 'FIND', presentation: null }));
  assert.notEqual(sessionKey(paper), sessionKey({ ...paper, topic: 'Demo Session A', presentation: 'Demo' }));
});

test('inactive and unconfirmed entries never become scheduled session groups', () => {
  const stale = { date: '2026-10-25', start: '11:00', end: '12:30', session: 'Session 2' };
  const scheduled = sessionKey({ ...stale, _timed: true });
  for (const status of ['not presenting', 'withdrawn', 'desk rejected']) {
    assert.equal(sessionKey({ ...stale, status, _inactive: true }), status);
    assert.notEqual(sessionKey({ ...stale, status, _inactive: true }), scheduled);
  }
  assert.notEqual(sessionKey({ ...stale, _timed: false }), scheduled);
  assert.notEqual(sessionKey({ ...stale, _timed: false }), sessionKey({ date: null, _timed: false }));
  assert.notEqual(sessionKey({ ...stale, _timed: false, room: 'Hall H' }),
    sessionKey({ ...stale, _timed: false, room: 'Zoom' }));
});

test('presenters match full author names despite case, accents or whitespace', () => {
  assert.deepEqual(presenterAuthorIndices(['Jan Pfister', 'Tom Völker', 'Andreas Hotho'], ' JAN  PFISTER '), [0]);
  assert.deepEqual(presenterAuthorIndices(['Jan Pfister', 'Tom Völker', 'Andreas Hotho'], 'Tom Volker'), [1]);
});

test('multiple named presenters are identified without changing author order', () => {
  const authors = ['Yi-Sheng Hsu', 'Nils Feldhus', 'Manfred Stede'];
  assert.deepEqual(presenterAuthorIndices(authors, 'Nils Feldhus, Yi-Sheng Hsu'), [1, 0]);
  assert.deepEqual(presenterAuthorIndices(authors, 'Nils Feldhus; Yi-Sheng Hsu'), [1, 0]);
});

test('missing names, name differences and outside presenters are not guessed', () => {
  for (const presenter of [null, '', 'Taylor', 'Samuel Taylor', 'Someone Else']) {
    assert.deepEqual(presenterAuthorIndices(['Samuel M. Taylor', 'Benjamin K. Bergen'], presenter), []);
  }
  assert.deepEqual(presenterAuthorIndices([], 'Jan Pfister'), []);
});

test('ambiguous or partially matched presenter lists stay explicit', () => {
  assert.deepEqual(presenterAuthorIndices(['José Li', 'Jose Li'], 'Jose Li'), []);
  assert.deepEqual(presenterAuthorIndices(['Jan Pfister', 'Tom Völker'], 'Jan Pfister, Someone Else'), []);
  assert.deepEqual(presenterAuthorIndices(['Jan Pfister'], 'Jan Pfister, Jan Pfister'), []);
});
