import assert from 'node:assert/strict';
import test from 'node:test';
import { conferenceNow, initialDay, sessionKey, expandSessions, presenterAuthorIndices } from '../schedule-view.mjs';

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

test('browsing days stays collapsed; searches, facets, shortlist and paper links expand', () => {
  assert.equal(expandSessions(empty), false);
  assert.equal(expandSessions({ ...empty, day: 'all', q: '   ' }), false);
  for (const change of [{ q: 'german' }, { saved: true }, { paper: '9736-FIND' }, { filters: { room: 'Hall H' } }]) {
    assert.equal(expandSessions({ ...empty, ...change }), true);
  }
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
