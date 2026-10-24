import assert from 'node:assert/strict';
import test from 'node:test';
import { conferenceNow, initialDay, sessionKey, expandSessions } from '../schedule-view.mjs';

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

test('session groups keep distinct dates, times and source session labels separate', () => {
  const paper = { date: '2026-10-26', start: '16:45', end: '18:15', session: 'Session 9', _timed: true };
  assert.equal(sessionKey(paper), sessionKey({ ...paper, room: 'Hall H', title: 'Another paper' }));
  for (const change of [{ date: '2026-10-27' }, { start: '16:46' }, { end: '18:00' }, { session: 'Virtual 4' }]) {
    assert.notEqual(sessionKey(paper), sessionKey({ ...paper, ...change }));
  }
});

test('inactive and unconfirmed entries never become scheduled session groups', () => {
  const stale = { date: '2026-10-25', start: '11:00', end: '12:30', session: 'Session 2' };
  const scheduled = sessionKey({ ...stale, _timed: true });
  for (const status of ['not presenting', 'withdrawn']) {
    assert.equal(sessionKey({ ...stale, status, _inactive: true }), status);
    assert.notEqual(sessionKey({ ...stale, status, _inactive: true }), scheduled);
  }
  assert.notEqual(sessionKey({ ...stale, _timed: false }), scheduled);
  assert.notEqual(sessionKey({ ...stale, _timed: false }), sessionKey({ date: null, _timed: false }));
});
