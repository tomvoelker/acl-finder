// Atlas IDs are global: an area keeps the same colour in every session.
export const AREA_COLORS = ['#88b9e0', '#edb270', '#91c99a', '#ccabe2', '#e69caa', '#7fc9c7', '#d5c875', '#8088d0', '#bfbd9a', '#d7a88b', '#bbdb68', '#c4b1c6', '#d078d0', '#78d078', '#789888', '#c078a8'];

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
      if (!Number.isInteger(entry.board) || entry.board < 1 || entry.board > 424 || boards.has(entry.board) || (entry.topic !== null && !topics.has(entry.topic)) || typeof entry.title !== 'string' || !entry.title.trim() || (entry.paperId !== null && typeof entry.paperId !== 'string')) throw new Error('Invalid Atlas assignment');
      boards.add(entry.board);
    }
  }
  return data;
}

export function topicForEntry(data, session, entry) {
  if (!entry?.verified) return null;
  const assignment = data?.sessions[session]?.assignments.find(row => row.board === entry.board && row.paperId === entry.paperId && row.title === entry.title);
  if (!assignment || assignment.topic === null) return null;
  const topic = data.topics.find(topic => topic.id === assignment.topic);
  const area = data.areas.find(area => area.id === topic.area);
  return {...topic, areaLabel:area.label, color:AREA_COLORS[area.id]};
}

export function matchesTopic(topic, areaId = null, topicId = null) {
  if (areaId === 'unclassified') return topic === null;
  return (areaId === null || topic?.area === areaId) && (topicId === null || topic?.id === topicId);
}

export function topicChoices(data, session, entries) {
  const areaCounts = new Map(), topicCounts = new Map();
  let unclassified = 0;
  for (const entry of entries.filter(entry => entry.verified)) {
    const topic = topicForEntry(data, session, entry);
    if (!topic) { unclassified++; continue; }
    areaCounts.set(topic.area, (areaCounts.get(topic.area) || 0) + 1);
    topicCounts.set(topic.id, (topicCounts.get(topic.id) || 0) + 1);
  }
  const count = (rows, counts) => (rows || []).filter(row => counts.has(row.id))
    .map(row => ({...row, count:counts.get(row.id)})).sort((a,b) => a.label.localeCompare(b.label, 'en'));
  return {areas:count(data?.areas, areaCounts), topics:count(data?.topics, topicCounts), unclassified};
}

export function topicEntries(data, session, entries, areaId = null, topicId = null) {
  return entries.filter(entry => entry.verified && matchesTopic(topicForEntry(data, session, entry), areaId, topicId))
    .sort((a,b) => a.board - b.board);
}
