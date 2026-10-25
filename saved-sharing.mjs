const MAX_FRAGMENT_LENGTH = 32768;
const MAX_IDS = 6000;
const TRACK_PATTERN = /^[A-Z][A-Z0-9]{0,11}$/;
const ID_PATTERN = /^([1-9][0-9]*)-([A-Z][A-Z0-9]{0,11})$/;

function compareTracks(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Build a portable snapshot. All saved IDs stay in the URL fragment. */
export function buildSavedListUrl(baseUrl, ids) {
  const groups = new Map();
  let count = 0;
  for (const id of ids) {
    const match = typeof id === 'string' ? ID_PATTERN.exec(id) : null;
    const number = match ? Number(match[1]) : NaN;
    if (!match || !Number.isSafeInteger(number)) {
      throw new Error(`Invalid saved paper ID: ${String(id)}`);
    }
    const track = match[2];
    if (!groups.has(track)) groups.set(track, new Set());
    const numbers = groups.get(track);
    if (!numbers.has(number)) {
      numbers.add(number);
      count += 1;
      if (count > MAX_IDS) throw new Error(`Saved list exceeds ${MAX_IDS} papers.`);
    }
  }

  const parts = ['list=v1'];
  for (const track of [...groups.keys()].sort(compareTracks)) {
    let previous = 0;
    const deltas = [...groups.get(track)].sort((a, b) => a - b).map(number => {
      const delta = number - previous;
      previous = number;
      return delta.toString(36);
    });
    parts.push(`${track}:${deltas.join('.')}`);
  }
  const fragment = `#${parts.join(';')}`;
  if (fragment.length > MAX_FRAGMENT_LENGTH) {
    throw new Error(`Saved list link exceeds ${MAX_FRAGMENT_LENGTH} fragment characters.`);
  }
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = fragment;
  return url.href;
}

/** Read a snapshot without fetching data or changing local saved papers. */
export function readSharedList(hash) {
  const raw = typeof hash === 'string' ? hash.replace(/^#/, '') : '';
  const prefix = raw.slice(0, 64).replace(/%([0-9a-f]{2})/gi,
    (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
  if (raw.length + 1 > MAX_FRAGMENT_LENGTH) return /^list(?:=|$)/.test(prefix)
    ? { ids: null, error: `Saved list link exceeds ${MAX_FRAGMENT_LENGTH} fragment characters.` } : null;
  let value;
  try {
    value = decodeURIComponent(raw);
  } catch {
    // An unrelated anchor must not trigger the import flow.
    return /^list(?:=|$)/.test(prefix)
      ? { ids: null, error: 'Saved list contains malformed URL encoding.' }
      : null;
  }
  if (!/^list(?:=|$)/.test(value)) return null;
  const invalid = error => ({ ids: null, error });
  if (raw.length + 1 > MAX_FRAGMENT_LENGTH || value.length + 1 > MAX_FRAGMENT_LENGTH) {
    return invalid(`Saved list link exceeds ${MAX_FRAGMENT_LENGTH} fragment characters.`);
  }
  const [version, ...parts] = value.split(';');
  if (version !== 'list=v1') return invalid('Unsupported or malformed saved list version.');
  const groups = new Map();
  let count = 0;
  for (const part of parts) {
    const pair = part.split(':');
    const [track, encoded] = pair;
    if (pair.length !== 2 || !TRACK_PATTERN.test(track) || !encoded) {
      return invalid('Saved list contains a malformed track group.');
    }
    if (groups.has(track)) return invalid('Saved list contains a duplicate track group.');
    const numbers = [];
    let previous = 0;
    for (const token of encoded.split('.')) {
      if (!/^[1-9a-z][0-9a-z]*$/.test(token)) {
        return invalid('Saved list contains an invalid positive delta.');
      }
      const delta = Number.parseInt(token, 36);
      const number = previous + delta;
      if (!Number.isSafeInteger(delta) || !Number.isSafeInteger(number)) {
        return invalid('Saved list contains a paper number outside the safe integer range.');
      }
      numbers.push(number);
      previous = number;
      count += 1;
      if (count > MAX_IDS) return invalid(`Saved list exceeds ${MAX_IDS} papers.`);
    }
    groups.set(track, numbers);
  }
  const ids = [...groups.keys()].sort(compareTracks).flatMap(track =>
    groups.get(track).map(number => `${number}-${track}`));
  return { ids, error: null };
}
