// Stores event categories only. No request headers, addresses, URLs, or bodies
// are persisted. Origin checks reduce accidental use; counts are approximate
// and this public endpoint is not an authenticated audit log.
const ORIGIN = 'https://emnlp.vlkr.org';
const EVENTS = new Set([
  'search', 'filter', 'author_open', 'paper_open', 'shortlist_add',
  'shortlist_remove', 'shortlist_view', 'calendar_export', 'anthology_open',
  'underline_open', 'contact_click',
]);
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = { 'Cache-Control': 'no-store', 'Vary': 'Origin' };
    if (request.headers.get('Origin') !== ORIGIN) return new Response(null, { status: 403, headers });
    headers['Access-Control-Allow-Origin'] = ORIGIN;
    if (url.pathname !== '/' || url.search) return new Response(null, { status: 404, headers });
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...headers,
        'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400' } });
    }
    if (request.method !== 'POST') return new Response(null, { status: 405, headers });
    if (request.headers.get('DNT') === '1' || request.headers.get('Sec-GPC') === '1') {
      return new Response(null, { status: 204, headers });
    }
    // Read a bounded stream, including when Content-Length is absent or false.
    const reader = request.body?.getReader();
    let body = '';
    let bytes = 0;
    const decoder = new TextDecoder();
    if (!reader) return new Response(null, { status: 400, headers });
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 128) { await reader.cancel(); return new Response(null, { status: 413, headers }); }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    let data;
    try { data = JSON.parse(body); } catch { return new Response(null, { status: 400, headers }); }
    if (!data || Array.isArray(data) || Object.keys(data).length !== 1 || !EVENTS.has(data.event)) {
      return new Response(null, { status: 400, headers });
    }
    if (!env.ANALYTICS) return new Response(null, { status: 503, headers });
    env.ANALYTICS.writeDataPoint({ indexes: ['emnlp-finder'], blobs: [data.event], doubles: [1] });
    return new Response(null, { status: 204, headers });
  },
};
