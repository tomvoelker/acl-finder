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
    return decodeSavedPapers(source.getItem(SAVED_PAPERS_KEY));
  } catch {
    return new Set();
  }
}

function decodeSavedPapers(stored) {
  // A missing list gets one quiet starter. Explicit empty lists stay empty.
  if (stored === null) return new Set([DEFAULT_SAVED_PAPER_ID]);
  try {
    const raw = JSON.parse(stored || '[]');
    return new Set(Array.isArray(raw) ? raw.filter(key => typeof key === 'string' && key.length < 80) : []);
  } catch {
    return new Set();
  }
}

// Read the latest list before changing one paper, preserving saves from other
// tabs. Return null on failure so the UI never claims a failed write succeeded.
export function setSavedPaper(paperId, shouldSave, storage) {
  if (typeof paperId !== 'string' || !paperId || paperId.length >= 80 || typeof shouldSave !== 'boolean') return null;
  try {
    const source = storage === undefined ? globalThis.localStorage : storage;
    const saved = decodeSavedPapers(source.getItem(SAVED_PAPERS_KEY));
    if (shouldSave) saved.add(paperId); else saved.delete(paperId);
    source.setItem(SAVED_PAPERS_KEY, JSON.stringify([...saved]));
    return saved;
  } catch {
    return null;
  }
}
