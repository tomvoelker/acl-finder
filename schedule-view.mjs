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

export function expandSessions(state) {
  return !!(state.q.trim() || state.saved || state.paper || state.author || Object.values(state.filters).some((value) => value !== null));
}

// Use publication names, preserving accents and case. These are name-based
// pages, not inferred identities or matches against the presenter field.
export function authorKey(name) {
  return name.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

export function indexAuthors(papers) {
  const index = new Map();
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
