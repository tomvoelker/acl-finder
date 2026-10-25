// Shared with the finder. Reading saved papers must also work with storage blocked.
export const SAVED_PAPERS_KEY = 'emnlp2026-finder.shortlist.v1';

export function readSavedPapers(storage) {
  try {
    const source = storage === undefined ? globalThis.localStorage : storage;
    const raw = JSON.parse(source.getItem(SAVED_PAPERS_KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw.filter(key => typeof key === 'string' && key.length < 80) : []);
  } catch {
    return new Set();
  }
}
