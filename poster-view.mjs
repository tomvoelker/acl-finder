// Physical locations come from the handbook, independently of the source sheet.
export function readPosterLocation(raw, sessions) {
  const slot = sessions.get(raw.posterSession);
  if (!slot || !Number.isInteger(raw.posterBoard) || raw.posterBoard < 1 || raw.posterBoard > 424) return null;
  return { ...slot, board: raw.posterBoard, page: raw.posterSourcePage };
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
  const text = query.replace(/(^|\s)board\s*#?\s*(\d+)(?=\s|$)/gi, (_match, space, number) => {
    boards.push(Number(number));
    return space;
  }).trim();
  return { boards, text };
}

export function matchesPosterQuery(paper, boards) {
  return boards.every(board => board === (paper.poster?.board ?? paper.posterClaimedBoard));
}
