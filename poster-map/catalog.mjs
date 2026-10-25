// The handbook is the assignment source. Board numbers are reused each session.
export function validateCatalog(document) {
  if (document?.version !== 1 || !Array.isArray(document.sessions) || !Array.isArray(document.entries)) {
    throw new Error('Expected a version 1 handbook catalog with sessions and entries.');
  }
  const ids = new Set();
  for (const session of document.sessions) {
    if (typeof session.id !== 'string' || !/^[A-Za-z0-9-]+$/.test(session.id) || ids.has(session.id)) throw new Error('Handbook session IDs must be unique.');
    if (!session.label || !/^\d{4}-\d{2}-\d{2}$/.test(session.date) || !/^\d{2}:\d{2}$/.test(session.start) || !/^\d{2}:\d{2}$/.test(session.end)) {
      throw new Error(`Session ${session.id}: missing label, date or time.`);
    }
    ids.add(session.id);
  }
  if (!ids.size) throw new Error('The handbook catalog has no poster sessions.');
  for (const entry of document.entries) {
    if (!ids.has(entry.session)) throw new Error('An assignment has an unknown handbook session.');
    if (!Number.isInteger(entry.board) || entry.board < 1 || entry.board > 424) throw new Error('Handbook board must be an integer from 1 to 424.');
    if (typeof entry.title !== 'string' || !entry.title.trim() || !Number.isInteger(entry.page) || entry.page < 1) {
      throw new Error('A handbook assignment needs a title and physical PDF page.');
    }
    if (entry.paperId !== null && typeof entry.paperId !== 'string') throw new Error('A handbook paper ID must be a string or null.');
  }
  return document;
}

export function sessionGroups(sessions) {
  const groups = new Map();
  for (const session of sessions) {
    const key = JSON.stringify([session.date, session.start, session.end, String(session.room || '').replace(/\s+/g, '').toLocaleLowerCase()]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(session);
  }
  return [...groups.values()].map(members => {
    const main = members.find(session => /^[A-G]$/.test(session.id)) || members[0];
    const industry = members.some(session => /industry/i.test(session.id + session.label));
    return {...main, aliases: members.map(session => session.id), label: members.map(session => session.label).join(' + '),
      shortLabel: `Session ${main.id}${members.length > 1 && industry ? ' + Industry' : ''}`};
  });
}

export function mapEntries(entries, sessions) {
  return entries.map(entry => ({...entry, sourceSession:entry.session,
    session:sessions.find(session => session.aliases.includes(entry.session)).id}));
}

export function assignmentAt(entries, session, board) {
  const listed = entries.filter(entry => entry.session === session && entry.board === board);
  return {entry:listed.length === 1 && listed[0].verified === true ? listed[0] : null,
    conflicts:listed.length > 1 ? listed : []};
}

// Entries must use the canonical physical sessions returned by mapEntries.
export function savedAssignments(entries, session, savedPapers) {
  const saved = new Map();
  for (const candidate of entries) {
    if (candidate.session !== session || !savedPapers.has(candidate.paperId)) continue;
    const {entry} = assignmentAt(entries, session, candidate.board);
    if (entry) saved.set(entry.board, entry);
  }
  return saved;
}

export function savedPosterStops(entries, sessions, savedIds) {
  const saved = new Set(savedIds);
  const physicalSessions = new Map(sessions.map(session => [session.id, session]));
  const stops = [];
  for (const session of sessions) {
    for (const [board, entry] of savedAssignments(entries, session.id, saved)) {
      stops.push({session:session.id, board, entry});
    }
  }
  const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0;
  return stops.sort((a,b) => {
    const first = physicalSessions.get(a.session), second = physicalSessions.get(b.session);
    return compare(first.date,second.date) || compare(first.start,second.start) ||
      a.board-b.board || compare(a.session,b.session);
  });
}

export function nextSavedPoster(stops, currentSession, selectedBoard) {
  if (!stops.length) return null;
  const current = stops.findIndex(stop => stop.session === currentSession && stop.board === selectedBoard);
  if (current !== -1) return stops[(current+1) % stops.length];
  return stops.find(stop => stop.session === currentSession) || stops[0];
}

export function defaultSession(sessions, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(part => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}`;
  const today = sessions.filter(session => session.date === date);
  const active = today.filter(session => session.start <= time && time < session.end);
  return (active.length === 1 ? active[0] : today[0] || sessions[0])?.id || '';
}

export function authorsText(entry) {
  return Array.isArray(entry.authors) ? entry.authors.join(', ') : typeof entry.authors === 'string' ? entry.authors : '';
}

export function boardHash(session, board) {
  const params = new URLSearchParams();
  if (session) params.set('session', session);
  if (board !== null) params.set('board', board);
  return params.size ? `#${params}` : '';
}

export function searchText(value) {
  return String(value || '').normalize('NFKD').replace(/\p{Mark}/gu, '').toLocaleLowerCase();
}
