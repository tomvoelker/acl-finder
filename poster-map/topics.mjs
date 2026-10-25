// Inferred groups are scoped to one physical session, never official research areas.
export const TOPIC_COLORS = ['#88b9e0', '#edb270', '#91c99a', '#ccabe2', '#e69caa', '#7fc9c7', '#d5c875', '#8088d0', '#bfbd9a', '#d7a88b', '#bbdb68', '#c4b1c6'];

export function validateTopics(data) {
  if (data?.version !== 1 || !data.sessions || typeof data.sessions !== 'object') throw new Error('Invalid topic dataset');
  for (const session of Object.values(data.sessions)) {
    if (!Array.isArray(session.groups) || session.groups.length > TOPIC_COLORS.length || !Array.isArray(session.assignments)) throw new Error('Invalid topic session');
    const ids = new Set();
    for (const group of session.groups) {
      if (!Number.isInteger(group.id) || group.id < 0 || group.id >= TOPIC_COLORS.length || ids.has(group.id) || typeof group.label !== 'string' || !group.label.trim()) throw new Error('Invalid topic group');
      ids.add(group.id);
    }
    const boards = new Set();
    for (const entry of session.assignments) {
      if (!Number.isInteger(entry.board) || entry.board < 1 || entry.board > 424 || boards.has(entry.board) || !ids.has(entry.group) || typeof entry.title !== 'string' || !Number.isFinite(entry.margin)) throw new Error('Invalid topic assignment');
      boards.add(entry.board);
    }
  }
  return data;
}

export function topicForEntry(data, session, entry) {
  if (!entry?.verified) return null;
  const topics = data?.sessions[session];
  const assignment = topics?.assignments.find(row => row.board === entry.board && row.paperId === entry.paperId && row.title === entry.title);
  if (!assignment) return null;
  const group = topics.groups.find(group => group.id === assignment.group);
  return group ? {...group, color:TOPIC_COLORS[group.id], margin:assignment.margin} : null;
}

export function topicGroups(data, session, entries) {
  const counts = new Map();
  for (const entry of entries) {
    const topic = topicForEntry(data, session, entry);
    if (topic) counts.set(topic.id, (counts.get(topic.id) || 0) + 1);
  }
  return (data?.sessions[session]?.groups || []).filter(group => counts.has(group.id))
    .map(group => ({...group, count:counts.get(group.id), color:TOPIC_COLORS[group.id]}))
    .sort((a,b) => Number(a.label.endsWith('(mixed)')) - Number(b.label.endsWith('(mixed)')) || a.label.localeCompare(b.label, 'en'));
}

export function topicEntries(data, session, entries, groupId) {
  return entries.map(entry => ({entry, topic:topicForEntry(data, session, entry)}))
    .filter(row => row.topic?.id === groupId)
    .sort((a,b) => b.topic.margin - a.topic.margin || a.entry.board - b.entry.board)
    .map(row => row.entry);
}
