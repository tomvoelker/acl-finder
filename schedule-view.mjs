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
  if (!paper._timed) return `unconfirmed:${paper.date || 'undated'}`;
  return JSON.stringify([paper.date, paper.start, paper.end, paper.session]);
}

export function expandSessions(state) {
  return !!(state.q.trim() || state.saved || state.paper || Object.values(state.filters).some((value) => value !== null));
}
