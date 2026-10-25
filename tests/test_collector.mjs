import { test } from 'node:test';
import assert from 'node:assert/strict';
import collector from '../worker/collector.mjs';

const origin = 'https://emnlp.vlkr.org';
function request(body, options = {}) {
  return new Request('https://stats.example/', {
    method: 'POST', headers: { Origin: origin, ...options.headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
function store() {
  const points = [];
  return { points, ANALYTICS: { writeDataPoint: point => points.push(point) } };
}
test('collector stores only an allowlisted event category and count', async () => {
  const env = store();
  const response = await collector.fetch(request({ event: 'search' }), env);
  assert.equal(response.status, 204);
  assert.deepEqual(env.points, [{ indexes: ['emnlp-finder'], blobs: ['search'], doubles: [1] }]);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
test('rejects extra data, unknown events, malformed and oversized requests', async () => {
  const env = store();
  for (const body of [{ event: 'search', query: 'private' }, { event: 'unknown' }, null, [], 'bad']) {
    assert.equal((await collector.fetch(request(body), env)).status, 400);
  }
  assert.equal((await collector.fetch(request('x'.repeat(129)), env)).status, 413);
  assert.deepEqual(env.points, []);
});
test('foreign origins cannot submit or read collector responses', async () => {
  const env = store();
  for (const originValue of ['https://other.example', 'null', '']) {
    const response = await collector.fetch(request({ event: 'search' }, { headers: { Origin: originValue } }), env);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
  assert.deepEqual(env.points, []);
});
test('honors privacy signals and refuses missing binding', async () => {
  const env = store();
  for (const headers of [{ DNT: '1' }, { 'Sec-GPC': '1' }]) {
    assert.equal((await collector.fetch(request({ event: 'search' }, { headers }), env)).status, 204);
  }
  assert.deepEqual(env.points, []);
  assert.equal((await collector.fetch(request({ event: 'search' }), {})).status, 503);
});
test('only the collector route and POST write events', async () => {
  const env = store();
  for (const route of ['https://stats.example/private', 'https://stats.example/?q=private']) {
    assert.equal((await collector.fetch(new Request(route, { method: 'POST', headers: { Origin: origin }, body: '{"event":"search"}' }), env)).status, 404);
  }
  assert.equal((await collector.fetch(new Request('https://stats.example/', { headers: { Origin: origin } }), env)).status, 405);
  const preflight = await collector.fetch(new Request('https://stats.example/', { method: 'OPTIONS', headers: { Origin: origin } }), env);
  assert.equal(preflight.status, 204);
  assert.deepEqual(env.points, []);
});
