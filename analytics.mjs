// Public collector address. No keys, identifiers, or user input belong here.
export const ANALYTICS_ENDPOINT = 'https://emnlp-finder-stats.orange-snowflake-5fbf.workers.dev/';

const EVENTS = new Set([
  'search', 'filter', 'author_open', 'paper_open', 'shortlist_add',
  'shortlist_remove', 'shortlist_view', 'calendar_export', 'anthology_open',
  'underline_open', 'contact_click',
]);

export function createAnalytics({
  location = globalThis.location,
  navigator = globalThis.navigator,
  fetch = globalThis.fetch?.bind(globalThis),
  endpoint = ANALYTICS_ENDPOINT,
  setTimeout = globalThis.setTimeout,
  clearTimeout = globalThis.clearTimeout,
} = {}) {
  function track(event) {
    try {
      if (!EVENTS.has(event) || location?.hostname !== 'emnlp.vlkr.org' ||
          navigator?.globalPrivacyControl === true ||
          ['1', 'yes'].includes(String(navigator?.doNotTrack).toLowerCase())) return;
      // Only the event name crosses the network. Omit cookies and page URLs.
      Promise.resolve(fetch(endpoint, {
        method: 'POST', body: JSON.stringify({ event }),
        headers: { 'Content-Type': 'text/plain' }, keepalive: true,
        credentials: 'omit', referrerPolicy: 'no-referrer',
      })).catch(() => {});
    } catch { /* Analytics must never interrupt the finder. */ }
  }

  // Query text exists only in this closure for debounce/deduplication. It is
  // never transmitted or persisted. Returning to an earlier query counts again.
  let timer;
  let lastQuery = '';
  function search(query, { submit = false } = {}) {
    clearTimeout(timer);
    const normalized = String(query).trim().replace(/\s+/g, ' ').toLowerCase();
    if (!normalized) { lastQuery = ''; return; }
    const count = () => {
      if (normalized !== lastQuery) {
        track('search');
        lastQuery = normalized;
      }
    };
    if (submit) count();
    else timer = setTimeout(count, 1000);
  }

  function cancelSearch() {
    clearTimeout(timer);
    lastQuery = '';
  }
  return { track, search, cancelSearch };
}
