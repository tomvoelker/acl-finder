import {AREA_COLORS, readAtlasLabel} from '../atlas.mjs';

export function validateTopics(data) {
  if (data?.version !== 2 || !data.sessions || typeof data.sessions !== 'object' || !Array.isArray(data.areas) || !Array.isArray(data.topics)) throw new Error('Invalid Atlas dataset');
  const ids = (rows, limit) => {
    const found = new Set();
    for (const row of rows) {
      if (!Number.isInteger(row.id) || row.id < 0 || row.id >= limit || found.has(row.id) || typeof row.label !== 'string' || !row.label.trim()) throw new Error('Invalid Atlas label');
      found.add(row.id);
    }
    return found;
  };
  const areas = ids(data.areas, AREA_COLORS.length), topics = ids(data.topics, 100);
  if (data.topics.some(topic => !areas.has(topic.area))) throw new Error('Unknown Atlas area');
  for (const session of Object.values(data.sessions)) {
    if (!Array.isArray(session.assignments)) throw new Error('Invalid Atlas session');
    const boards = new Set();
    for (const entry of session.assignments) {
      if (entry.area !== undefined && (!areas.has(entry.area) || entry.topic !== null)) throw new Error('Invalid local area assignment');
      if (!Number.isInteger(entry.board) || entry.board < 1 || entry.board > 424 || boards.has(entry.board) || (entry.topic !== null && !topics.has(entry.topic)) || typeof entry.title !== 'string' || !entry.title.trim() || (entry.paperId !== null && typeof entry.paperId !== 'string')) throw new Error('Invalid Atlas assignment');
      boards.add(entry.board);
    }
  }
  return data;
}

// Topic data is immutable after validation. Identity checks still gate each lookup.
export function indexTopics(data) {
  return new Map(Object.entries(data?.sessions || {}).map(([session, value]) =>
    [session, new Map(value.assignments.map(row => [row.board, row]))]));
}

export function topicForEntry(data, session, entry, index = null) {
  if (!entry?.verified) return null;
  const assignment = index ? index.get(session)?.get(entry.board) : data?.sessions[session]?.assignments.find(row => row.board === entry.board && row.paperId === entry.paperId && row.title === entry.title);
  if (!assignment || assignment.paperId !== entry.paperId || assignment.title !== entry.title) return null;
  return readAtlasLabel(data, assignment.topic, assignment.area);
}

export function matchesTopic(topic, areaId = null, topicId = null) {
  if (areaId === 'unclassified') return topic === null;
  return (areaId === null || topic?.area === areaId) && (topicId === null || topic?.id === topicId);
}

export function topicChoices(data, session, entries, index = null) {
  const areaCounts = new Map(), topicCounts = new Map();
  let unclassified = 0, local = 0;
  for (const entry of entries.filter(entry => entry.verified)) {
    const topic = topicForEntry(data, session, entry, index);
    if (!topic) { unclassified++; continue; }
    areaCounts.set(topic.area, (areaCounts.get(topic.area) || 0) + 1);
    if (topic.id !== null) topicCounts.set(topic.id, (topicCounts.get(topic.id) || 0) + 1);
    else local++;
  }
  const count = (rows, counts) => (rows || []).filter(row => counts.has(row.id))
    .map(row => ({...row, count:counts.get(row.id)})).sort((a,b) => a.label.localeCompare(b.label, 'en'));
  return {areas:count(data?.areas, areaCounts), topics:count(data?.topics, topicCounts), unclassified, local};
}

export function topicEntries(data, session, entries, areaId = null, topicId = null, index = null) {
  return entries.filter(entry => entry.verified && matchesTopic(topicForEntry(data, session, entry, index), areaId, topicId))
    .sort((a,b) => a.board - b.board);
}
