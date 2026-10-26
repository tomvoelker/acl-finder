// The schedule sheet supplies assignments. Board numbers are reused each session.
export function validateCatalog(document) {
  if (document?.version !== 2 || !Array.isArray(document.sessions) || !Array.isArray(document.entries)) {
    throw new Error('Expected a version 2 schedule catalog with sessions and entries.');
  }
  if (!document.source?.url || !document.source.sheet || document.source.column !== 'L' || !document.source.updatedAt) {
    throw new Error('The schedule catalog needs source sheet, column L and update metadata.');
  }
  const ids = new Set(), aliases = new Set();
  for (const session of document.sessions) {
    if (typeof session.id !== 'string' || !/^[A-Za-z0-9-]+$/.test(session.id) || ids.has(session.id)) throw new Error('Schedule session IDs must be unique.');
    if (!session.label || !/^\d{4}-\d{2}-\d{2}$/.test(session.date) || !/^\d{2}:\d{2}$/.test(session.start) || !/^\d{2}:\d{2}$/.test(session.end)) {
      throw new Error(`Session ${session.id}: missing label, date or time.`);
    }
    ids.add(session.id);
    for (const alias of [session.id, ...(session.aliases || []).filter(alias => alias !== session.id)]) {
      if (typeof alias !== 'string' || !/^[A-Za-z0-9-]+$/.test(alias) || aliases.has(alias)) throw new Error('Schedule session aliases must be unique.');
      aliases.add(alias);
    }
  }
  if (!ids.size) throw new Error('The schedule catalog has no poster sessions.');
  for (const entry of document.entries) {
    if (!ids.has(entry.session)) throw new Error('An assignment has an unknown schedule session.');
    if (!Number.isInteger(entry.board) || entry.board < 1 || entry.board > 424) throw new Error('Schedule board must be an integer from 1 to 424.');
    if (typeof entry.title !== 'string' || !entry.title.trim() || !Number.isInteger(entry.sourceRow) || entry.sourceRow < 1) {
      throw new Error('A schedule assignment needs a title and positive source row.');
    }
    if (typeof entry.paperId !== 'string' || !entry.paperId || typeof entry.verified !== 'boolean' || !Array.isArray(entry.authors)) {
      throw new Error('A schedule assignment needs a paper ID, authors and verified flag.');
    }
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
    return {...main, aliases: [...new Set(members.flatMap(session => [session.id, ...(session.aliases || [])]))], label: members.map(session => session.label).join(' + '),
      shortLabel: `Session ${main.id}`};
  });
}

// Dates and clock times already describe the conference's Europe/Budapest schedule.
export function sessionOptionLabel(session) {
  const [year, month, day] = session.date.split('-').map(Number);
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekday = weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${session.id} · ${weekday} ${day} ${months[month - 1]} · ${session.start}–${session.end}`;
}

export function mapEntries(entries, sessions) {
  return entries.map(entry => ({...entry, sourceSession:entry.session,
    session:sessions.find(session => session.aliases.includes(entry.session)).id}));
}

// Build once for the immutable schedule loaded by the map. Keep every source row.
export function indexAssignments(entries) {
  const index = new Map();
  for (const entry of entries) {
    if (!index.has(entry.session)) index.set(entry.session, new Map());
    const boards = index.get(entry.session);
    if (!boards.has(entry.board)) boards.set(entry.board, []);
    boards.get(entry.board).push(entry);
  }
  return index;
}

export function assignmentAt(entries, session, board, index = null) {
  const listed = index ? index.get(session)?.get(board) || [] : entries.filter(entry => entry.session === session && entry.board === board);
  return {entry:listed.length === 1 && listed[0].verified === true ? listed[0] : null,
    conflicts:listed.length > 1 ? listed : []};
}

// Entries must use the canonical physical sessions returned by mapEntries.
export function savedAssignments(entries, session, savedPapers, index = null) {
  const saved = new Map();
  for (const candidate of entries) {
    if (candidate.session !== session || !savedPapers.has(candidate.paperId)) continue;
    const {entry} = assignmentAt(entries, session, candidate.board, index);
    if (entry) saved.set(entry.board, entry);
  }
  return saved;
}

export function savedPosterStops(entries, sessions, savedIds, index = null) {
  const saved = new Set(savedIds);
  const physicalSessions = new Map(sessions.map(session => [session.id, session]));
  const stops = [];
  for (const session of sessions) {
    for (const [board, entry] of savedAssignments(entries, session.id, saved, index)) {
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

export function boardSearchNumber(query) {
  const match = String(query).trim().match(/^(?:board\s+)?(\d+)$/i);
  const number = match ? Number(match[1]) : null;
  return Number.isInteger(number) && number >= 1 && number <= 424 ? number : null;
}

export function matchesPosterSearch(entry, query) {
  const board = boardSearchNumber(query);
  if (board !== null) return entry.board === board;
  const text = searchText(`${entry.title} ${authorsText(entry)} ${entry.paperId || ''}`);
  return searchText(query).trim().split(/\s+/).every(word => text.includes(word));
}
