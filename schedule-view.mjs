export function conferenceNow(timeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

export function initialDay(requested, days, today) {
  if (days.includes(requested)) return requested;
  return days.includes(today) ? today : 'all';
}

export function sessionKey(paper) {
  if (paper._inactive) return paper.status;
  return JSON.stringify([
    paper._timed ? 'scheduled' : 'unconfirmed',
    paper.date, paper.start, paper.end, paper.session, paper.topic, paper.room,
  ]);
}

export function readOralSlot(paper) {
  const slot = paper.oralSlot;
  if (paper.presentation !== 'Oral' || paper.status !== 'scheduled' || paper.scheduleNote || paper.oralSlotNote || !slot) return null;
  if (slot.date !== paper.date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.end)) return null;
  if (!(paper.start <= slot.start && slot.start < slot.end && slot.end <= paper.end)) return null;
  if (slot.start === paper.start && slot.end === paper.end) return null;
  return { date: slot.date, start: slot.start, end: slot.end, room: paper.room };
}

export function presentationSlot(paper) {
  return paper.oralSlot || paper;
}

export function searchState(state, query) {
  const leaveScope = state.author || (!state.shared && state.view === 'posters' && !state.q.trim() && !state.filters?.area);
  return {
    ...state,
    ...(leaveScope ? {
      day: 'all', saved: false,
      shared: null,
      filters: Object.fromEntries(Object.keys(state.filters).map((key) => [key, null])),
    } : {}),
    q: query, paper: null, author: null, view: leaveScope ? 'programme' : state.view, posterSession: null,
  };
}

// A page replaces the previous page. DOM size never grows with the result count.
export const RESULT_PAGE_SIZE = 16;
export function resultPage(items, page = 0) {
  const pages = Math.max(1, Math.ceil(items.length / RESULT_PAGE_SIZE));
  const current = Math.max(0, Math.min(pages - 1, Math.trunc(page) || 0));
  const start = current * RESULT_PAGE_SIZE;
  return { items: items.slice(start, start + RESULT_PAGE_SIZE), page: current, pages, start };
}

export function posterBrowsing(state) {
  return posterScope(state) && !state.q.trim() && !state.author && !state.saved && !state.filters?.area;
}

export function posterScope(state) {
  return state.view === 'posters' && !state.paper;
}

// Use publication names, preserving accents and case. These are name-based
// pages, not inferred identities or matches against the presenter field.
export function authorKey(name) {
  return name.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

export function indexAuthors(papers, index = new Map()) {
  for (const paper of papers) {
    const seen = new Set();
    for (const name of paper.authors) {
      const key = authorKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (!index.has(key)) index.set(key, new Set());
      index.get(key).add(paper);
    }
  }
  return index;
}

export function presenterAuthorIndices(authors, presenter) {
  if (!presenter) return [];
  const normalize = (name) => name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
  const names = authors.map(normalize);
  const matches = presenter.split(/[,;]/).map((name) => {
    const normalized = normalize(name);
    const index = names.indexOf(normalized);
    return index >= 0 && index === names.lastIndexOf(normalized) ? index : -1;
  });
  // Keep the source presenter entry explicit if any name is missing or ambiguous.
  return matches.includes(-1) || new Set(matches).size !== matches.length ? [] : matches;
}
