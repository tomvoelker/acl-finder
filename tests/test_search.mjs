import assert from 'node:assert/strict';
import test from 'node:test';
import { searchState } from '../schedule-view.mjs';

const authorView = {
  author: 'Yulan He', q: '', day: '2026-10-26', saved: true, paper: null,
  filters: { track: 'Main conference', format: 'Oral', room: 'F7' },
};

test('starting a main search leaves the author view and its constraints', () => {
  const next = searchState(authorView, 'multi-block diffusion');
  assert.deepEqual(next, {
    author: null, q: 'multi-block diffusion', day: 'all', saved: false, paper: null,
    filters: { track: null, format: null, room: null },
  });
  assert.equal(authorView.author, 'Yulan He', 'The previous state is not mutated');
});

test('an empty search also leaves the author view', () => {
  const next = searchState(authorView, '');
  assert.equal(next.author, null);
  assert.equal(next.day, 'all');
  assert.equal(next.q, '');
});

test('ordinary programme searches retain deliberate day, shortlist, and facet filters', () => {
  const programme = { ...authorView, author: null, paper: '6176-MAIN' };
  assert.deepEqual(searchState(programme, 'another paper'), {
    ...programme, q: 'another paper', paper: null,
  });
});
