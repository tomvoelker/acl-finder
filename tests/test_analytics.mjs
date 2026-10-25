import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnalytics } from '../analytics.mjs';

function setup(overrides = {}) {
  const calls = [];
  const timers = new Map();
  let next = 0;
  const analytics = createAnalytics({
    location: { hostname: 'emnlp.vlkr.org', search: '?q=private' },
    navigator: {}, endpoint: 'https://counts.example/events',
    fetch: (...args) => { calls.push(args); return Promise.resolve(); },
    setTimeout: (fn, delay) => { const id = ++next; timers.set(id, { fn, delay }); return id; },
    clearTimeout: (id) => timers.delete(id), ...overrides,
  });
  return { ...analytics, calls, timers, flush() {
    for (const [id, { fn }] of timers) { timers.delete(id); fn(); }
  } };
}

test('only allowlisted names are sent, with no page data, cookies, or referrer', () => {
  const a = setup();
  a.track('search');
  a.track('private query');
  a.track({ event: 'search', query: 'private' });
  assert.equal(a.calls.length, 1);
  assert.deepEqual(a.calls[0], ['https://counts.example/events', {
    method: 'POST', body: '{"event":"search"}',
    headers: { 'Content-Type': 'text/plain' }, keepalive: true,
    credentials: 'omit', referrerPolicy: 'no-referrer',
  }]);
});

test('local/preview hosts, DNT, and GPC send nothing', () => {
  for (const overrides of [
    { location: { hostname: 'localhost' } },
    { location: { hostname: 'preview.emnlp.vlkr.org' } },
    { navigator: { doNotTrack: '1' } },
    { navigator: { doNotTrack: 'yes' } },
    { navigator: { globalPrivacyControl: true } },
  ]) {
    const a = setup(overrides);
    a.track('search');
    assert.equal(a.calls.length, 0);
  }
});

test('searches debounce for one second and submit deduplicates pending and settled input', () => {
  const a = setup();
  a.search('priv');
  a.search('private query');
  assert.equal(a.calls.length, 0);
  assert.equal(a.timers.size, 1);
  assert.equal([...a.timers.values()][0].delay, 1000);
  a.search('private query', { submit: true });
  a.flush();
  assert.equal(a.calls.length, 1);
  a.search(' PRIVATE   query ');
  a.flush();
  a.search('private query', { submit: true });
  assert.equal(a.calls.length, 1);
  a.search('other query');
  a.flush();
  a.search('private query', { submit: true });
  assert.equal(a.calls.length, 3);
  for (const [, options] of a.calls) assert.deepEqual(JSON.parse(options.body), { event: 'search' });
});

test('empty input and navigation cancel pending searches and allow a fresh search', () => {
  const a = setup();
  a.search('private');
  a.search('   ');
  a.flush();
  assert.equal(a.calls.length, 0);
  a.search('private', { submit: true });
  a.search('another');
  a.cancelSearch();
  a.flush();
  a.search('private', { submit: true });
  assert.equal(a.calls.length, 2);
});

test('synchronous and asynchronous transport failures are ignored', async () => {
  assert.doesNotThrow(() => setup({ fetch: () => { throw Error('offline'); } }).track('filter'));
  assert.doesNotThrow(() => setup({ fetch: () => Promise.reject(Error('offline')) }).track('filter'));
  await new Promise((resolve) => setImmediate(resolve));
});
