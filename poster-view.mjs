// Numbered poster locations come from the official schedule sheet.
export function readPosterLocation(raw, sessions) {
  const slot = sessions.get(raw.posterSession);
  if (!slot || !Number.isInteger(raw.posterBoard) || raw.posterBoard < 1 || raw.posterBoard > 424) return null;
  return { ...slot, board: raw.posterBoard, sourceRow: raw.posterSourceRow };
}

export function posterMapHref(poster) {
  if (!poster) return null;
  return `poster-map/#${new URLSearchParams({ session: poster.id, board: String(poster.board) })}`;
}

export function posterSlotDiffers(paper, poster) {
  if (!poster) return false;
  const room = value => String(value || '').trim().toLowerCase().replace(/^hall$/, 'hall h');
  return paper.presentation !== 'Poster' || paper.date !== poster.date ||
    paper.start !== poster.start || paper.end !== poster.end || room(paper.room) !== room(poster.room);
}

// Keep explicit board lookups separate from ordinary substring title/ID search.
export function parsePosterQuery(query) {
  const boards = [];
  const text = query.replace(/(^|\s)board\s*#?\s*(D(?:10|[1-9])|\d+)(?=\s|$)/gi, (_match, space, number) => {
    boards.push(/^d/i.test(number) ? number.toUpperCase() : Number(number));
    return space;
  }).trim();
  return { boards, text };
}

export function matchesPosterQuery(paper, boards) {
  return boards.every(board => board === (paper.poster?.board ?? paper.posterClaimedBoard ?? (/^D(?:10|[1-9])$/i.test(paper.board || '') ? paper.board.toUpperCase() : null)));
}

// A poster slot is independent of the presentation format in the source sheet.
// Inactive entries remain searchable, but are not advertised as posters to attend.
export function posterBrowseDay(paper) {
  if (paper._inactive) return null;
  if (paper.poster) return paper.poster.date;
  return paper.presentation === 'Poster' || paper.posterIssue ? paper._day : null;
}

export function posterGroups(papers) {
  const groups = new Map();
  for (const paper of papers) {
    if (!posterBrowseDay(paper)) continue;
    const key = paper.poster?.id || 'unconfirmed';
    if (!groups.has(key)) groups.set(key, { slot: paper.poster || null, papers: [] });
    groups.get(key).papers.push(paper);
  }
  return [...groups].sort(([a, ga], [b, gb]) =>
    a === 'unconfirmed' ? 1 : b === 'unconfirmed' ? -1 :
      ga.slot.date.localeCompare(gb.slot.date) || ga.slot.start.localeCompare(gb.slot.start) || a.localeCompare(b));
}
