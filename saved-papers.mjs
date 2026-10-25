// Shared with the finder. Reading saved papers must also work with storage blocked.
export const SAVED_PAPERS_KEY = 'emnlp2026-finder.shortlist.v1';
export const DEFAULT_SAVED_PAPER_ID = '9736-FIND';

export function isDefaultSavedList(storage) {
  try {
    const source = storage === undefined ? globalThis.localStorage : storage;
    return source.getItem(SAVED_PAPERS_KEY) === null;
  } catch {
    return false;
  }
}

export function readSavedPapers(storage) {
  try {
    const source = storage === undefined ? globalThis.localStorage : storage;
    const stored = source.getItem(SAVED_PAPERS_KEY);
    // A missing list gets one quiet starter. An explicit empty list stays empty,
    // so removing it or clearing saved papers is never undone on the next visit.
    if (stored === null) return new Set([DEFAULT_SAVED_PAPER_ID]);
    const raw = JSON.parse(stored || '[]');
    return new Set(Array.isArray(raw) ? raw.filter(key => typeof key === 'string' && key.length < 80) : []);
  } catch {
    return new Set();
  }
}
