/*
 * EMNLP 2026 Paper Finder: an unofficial, buildless schedule search.
 * Every value from data/papers.json is untrusted text. It is rendered through
 * DOM APIs (textContent / text nodes) only, never as HTML.
 */
'use strict';

(() => {
  const DATA_URL = 'data/papers.json';
  const PAGE_SIZE = 80;
  const NONE = '__none__';
  const STORAGE_KEY = 'emnlp2026-finder.shortlist.v1';
  const DEFAULT_TZ = 'Europe/Budapest';
  const PROGRAM_URL = 'https://2026.emnlp.org/program/';
  const REPO_URL = 'https://github.com/LSX-UniWue/some-assembly-required';
  const CHAIR_URL = 'https://www.informatik.uni-wuerzburg.de/datascience/';
  const FALLBACK_SOURCE = 'https://docs.google.com/spreadsheets/d/1aXGTy_7Xeh-OXIs3iJSbDpUsZ6YhbfA76b17kBZH0Yk/edit?gid=943432490';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const STATUS_LABELS = {
    scheduled: 'Scheduled',
    unscheduled: 'Time not confirmed',
    'not presenting': 'Not presenting',
    withdrawn: 'Withdrawn',
  };
  const INACTIVE = new Set(['not presenting', 'withdrawn']);
  const STATUS_LIKE = new Set(['Not presenting', 'Withdrawn']);
  const IMPLIED_MODE = { Oral: 'In person', Poster: 'In person', Demo: 'In person', Virtual: 'Virtual', 'Virtual demo': 'Virtual' };
  const FORMAT_CLASS = { Oral: 'oral', Poster: 'poster', Demo: 'demo', Virtual: 'virtual', 'Virtual demo': 'virtual' };
  const FORMAT_RANK = { Oral: 0, Demo: 1, Poster: 2, 'Virtual demo': 3, Virtual: 4 };

  // Faceted filters: OR within a facet, AND across facets.
  const FACETS = [
    { key: 'track', param: 'track', label: 'Track', get: (p) => p.track,
      order: ['Main conference', 'Findings', 'Industry', 'Systems demonstrations', 'TACL', 'Computational Linguistics'] },
    { key: 'format', param: 'format', label: 'Format', get: (p) => p.presentation,
      order: ['Oral', 'Poster', 'Demo', 'Virtual', 'Virtual demo'], hide: STATUS_LIKE },
    { key: 'mode', param: 'attendance', label: 'Attendance', get: (p) => p.mode,
      order: ['In person', 'Virtual'], hide: STATUS_LIKE,
      hint: 'How the presenter attends. A virtual presenter can still be assigned a physical room.' },
    { key: 'room', param: 'room', label: 'Room', get: (p) => p.room, order: ['Hall H'], single: true },
    { key: 'status', param: 'status', label: 'Schedule status', get: (p) => p.status,
      order: ['scheduled', 'unscheduled', 'not presenting', 'withdrawn'], labels: STATUS_LABELS },
  ];

  const ICONS = {
    star: 'M12 3.6l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.62 6.9 19.3l.98-5.68L3.75 9.6l5.7-.83z',
    x: 'M6 6l12 12M18 6 6 18',
    cal: 'M5 6h14v14H5zM5 10h14M9 3.5v4M15 3.5v4',
    code: 'M9 8l-4 4 4 4M15 8l4 4-4 4',
  };

  const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const $ = (sel) => document.querySelector(sel);
  const els = {
    featured: $('#featured'), toolbar: $('#toolbar'), form: $('#search-form'), q: $('#q'), qClear: $('#q-clear'),
    days: $('#days'), filters: $('#filters'), facets: $('#facets'), filtersOpen: $('#filters-open'),
    filtersClose: $('#filters-close'), filtersDone: $('#filters-done'), filtersReset: $('#filters-reset'),
    filtersResetTop: $('#filters-reset-top'), filtersBadge: $('#filters-badge'), results: $('#results'),
    count: $('#results-count'), nowBtn: $('#now-btn'), savedBtn: $('#saved-btn'), savedCount: $('#saved-count'),
    clearAll: $('#clear-all'), chips: $('#chips'), shortlistBar: $('#shortlist-bar'), banner: $('#paper-banner'),
    list: $('#list'), more: $('#more'), moreStatus: $('#more-status'), moreBtn: $('#more-btn'), live: $('#live'),
  };

  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  const fmtNum = (n) => n.toLocaleString('en-GB');
  const plural = (n, one, many) => `${fmtNum(n)} ${n === 1 ? one : many}`;
  const nat = (a, b) => (a == null) - (b == null) || (a == null ? 0 : collator.compare(a, b));
  const str = (a, b) => (a == null) - (b == null) || (a == null || a === b ? 0 : a < b ? -1 : 1);
  const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const slugify = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

  let conference = {};
  let tz = DEFAULT_TZ;
  let sourceUrl = null;
  let updatedLabel = '';
  let featuredId = null;
  let papers = [];
  let byKey = new Map();
  let dayOptions = [];
  const facetOptions = Object.fromEntries(FACETS.map((f) => [f.key, []]));
  const roomSelect = { el: null };
  let results = [];
  let terms = [];
  let rendered = 0;
  let cursor = null;
  let slotEls = new Map();
  let slotCounts = new Map();
  let dayGroupCounts = new Map();
  let lastNav = null;
  let typingTimer = null;
  let announceTimer = null;
  let loaded = false;
  let shortlist = loadShortlist();
  let storageWarned = false;

  const blankState = () => ({
    q: '', day: 'all', saved: false, paper: null,
    filters: Object.fromEntries(FACETS.map((f) => [f.key, new Set()])),
  });
  const state = blankState();

  /* ---------- DOM helpers ---------- */

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  }

  function icon(name, extra = '') {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('class', `icon ${extra}`.trim());
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', ICONS[name]);
    svg.append(path);
    return svg;
  }

  const newTab = (href, label, srLabel, cls) => h('a', { href, target: '_blank', rel: 'noopener', class: cls },
    label, h('span', { class: 'visually-hidden' }, srLabel || ' (opens in a new tab)'));

  // Writes text into el, wrapping search-term matches in <mark>. Folding is done
  // per character so match offsets map back onto the original string.
  function highlightInto(el, text, words) {
    if (!words.length) { el.textContent = text; return; }
    let folded = '';
    const origin = [];
    for (let i = 0; i < text.length;) {
      const ch = String.fromCodePoint(text.codePointAt(i));
      const f = fold(ch);
      for (let k = 0; k < f.length; k++) origin.push(i);
      folded += f;
      i += ch.length;
    }
    const marked = new Uint8Array(text.length);
    let any = false;
    for (const w of words) {
      for (let at = folded.indexOf(w); at !== -1; at = folded.indexOf(w, at + w.length)) {
        const start = origin[at];
        const last = origin[at + w.length - 1];
        const end = last + (text.codePointAt(last) > 0xffff ? 2 : 1);
        marked.fill(1, start, end);
        any = true;
      }
    }
    if (!any) { el.textContent = text; return; }
    el.textContent = '';
    let i = 0;
    while (i < text.length) {
      let j = i;
      while (j < text.length && marked[j] === marked[i]) j++;
      const piece = text.slice(i, j);
      el.append(marked[i] ? h('mark', null, piece) : piece);
      i = j;
    }
  }

  /* ---------- Dates and times (Budapest; never derived from null) ---------- */

  const validDate = (v) => {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    const [y, m, d] = v.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? v : null;
  };
  const validTime = (v) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);

  function dateInfo(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return {
      wdShort: WD_SHORT[wd], wdLong: WD_LONG[wd],
      short: `${WD_SHORT[wd]} ${d} ${MON_SHORT[m - 1]}`,
      dayMonth: `${d} ${MON_LONG[m - 1]}`, dayMonthShort: `${d} ${MON_SHORT[m - 1]}`,
      full: `${d} ${MON_SHORT[m - 1]} ${y}`,
    };
  }

  const timeRange = (p) => (p.end ? `${p.start}–${p.end}` : `from ${p.start}`);

  let offsetFormatter;
  function tzOffsetMinutes(ms) {
    try {
      offsetFormatter = offsetFormatter || new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' });
      const name = (offsetFormatter.formatToParts(new Date(ms)).find((x) => x.type === 'timeZoneName') || {}).value || '';
      if (name === 'GMT' || name === 'UTC') return 0;
      const m = /^(?:GMT|UTC)([+\-−])(\d{1,2})(?::?(\d{2}))?$/.exec(name);
      if (!m) return null;
      return (m[1] === '+' ? 1 : -1) * (Number(m[2]) * 60 + Number(m[3] || 0));
    } catch {
      return null;
    }
  }

  const utcCache = new Map();
  // Converts a Budapest wall-clock time to an absolute instant (for .ics export).
  function localToUtc(date, time) {
    const key = `${date}T${time}`;
    if (utcCache.has(key)) return utcCache.get(key);
    const [y, mo, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    const naive = Date.UTC(y, mo - 1, d, hh, mm);
    let result = null;
    const guess = tzOffsetMinutes(naive);
    if (guess !== null) {
      let utc = naive - guess * 60000;
      const actual = tzOffsetMinutes(utc);
      if (actual !== null && actual !== guess) utc = naive - actual * 60000;
      result = { date: new Date(utc), offset: actual === null ? guess : actual };
    }
    utcCache.set(key, result);
    return result;
  }

  function zoneLabel(date, time) {
    const r = localToUtc(date, time);
    if (!r) return { abbr: 'Budapest', title: 'Budapest local time' };
    const sign = r.offset >= 0 ? '+' : '−';
    const hours = Math.abs(r.offset) / 60;
    const utc = `UTC${sign}${Number.isInteger(hours) ? hours : hours.toFixed(1)}`;
    const named = tz === 'Europe/Budapest' ? { 60: 'CET', 120: 'CEST' }[r.offset] : null;
    return { abbr: named || utc, title: `Budapest local time (${utc})` };
  }

  function zonedNow() {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).formatToParts(new Date());
      const get = (t) => (parts.find((x) => x.type === t) || {}).value;
      return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
    } catch {
      return null;
    }
  }

  /* ---------- Data ---------- */

  const text = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

  function safeSourceUrl(raw) {
    try {
      const u = new URL(raw);
      return u.protocol === 'https:' && u.hostname === 'docs.google.com' ? u : null;
    } catch {
      return null;
    }
  }

  function sourceRowUrl(row) {
    if (!sourceUrl || !row) return null;
    const u = new URL(sourceUrl.href);
    const gid = u.searchParams.get('gid') || (/gid=(\d+)/.exec(u.hash) || [])[1];
    u.hash = `${gid ? `gid=${gid}&` : ''}range=A${row}:K${row}`;
    return u.href;
  }

  function normalize(raw, index) {
    if (!raw || typeof raw !== 'object') return null;
    const p = {
      id: text(raw.id), title: text(raw.title), track: text(raw.track), trackCode: text(raw.trackCode),
      presentation: text(raw.presentation), mode: text(raw.mode), presenter: text(raw.presenter),
      presenterNote: text(raw.presenterNote), room: text(raw.room), session: text(raw.session),
      topic: text(raw.topic), date: validDate(raw.date), start: validTime(raw.start), end: validTime(raw.end),
      timeZone: text(raw.timeZone), status: text(raw.status), scheduleNote: text(raw.scheduleNote),
      sourceRow: Number.isInteger(raw.sourceRow) && raw.sourceRow > 0 ? raw.sourceRow : null,
    };
    p._key = p.id || `row-${index}`;
    p._inactive = INACTIVE.has(p.status);
    // A time is only presented as confirmed when the source schedules it without a conflict note.
    p._timed = p.status === 'scheduled' && !p.scheduleNote && !!p.date && !!p.start;
    p._bucket = p.status === 'withdrawn' ? 3 : p.status === 'not presenting' ? 2 : p.date ? 0 : 1;
    p._day = p._inactive ? null : p.date || 'undated';
    p._hay = fold([p.id, p.title, p.presenter, p.topic].filter(Boolean).join(' \u2002 '));
    p._f = FACETS.map((f) => f.get(p) ?? NONE);
    p._group = groupInfo(p);
    return p;
  }

  function groupInfo(p) {
    if (p._bucket === 0) {
      const d = dateInfo(p.date);
      const zone = p._timed ? zoneLabel(p.date, p.start) : null;
      return {
        dayKey: `d:${p.date}`, dayKicker: d.wdLong, dayTitle: d.dayMonth, short: d.short,
        slotKey: `d:${p.date}|${p._timed ? `${p.start}|${p.end || ''}` : 'tbc'}|${p.session || ''}`,
        time: p._timed ? timeRange(p) : null, zone, session: p.session,
      };
    }
    if (p._bucket === 1) {
      return { dayKey: 'undated', dayKicker: 'Schedule', dayTitle: 'Date not listed', slotKey: `u|${p.session || ''}`, session: p.session || 'No session listed' };
    }
    const label = p._bucket === 2 ? 'Not presenting' : 'Withdrawn';
    return {
      dayKey: p._bucket === 2 ? 'np' : 'wd', dayKicker: 'Status', dayTitle: label, slotKey: p._bucket === 2 ? 'np' : 'wd',
      untimed: 'Listed for reference',
      note: `The source marks these papers “${label}”. They are not a presentation slot to attend.`,
    };
  }

  function compare(a, b) {
    if (a._bucket !== b._bucket) return a._bucket - b._bucket;
    let c = 0;
    if (a._bucket === 0) {
      c = str(a.date, b.date) || (a._timed ? 0 : 1) - (b._timed ? 0 : 1);
      if (!c && a._timed) c = str(a.start, b.start) || str(a.end, b.end);
      if (!c) c = nat(a.session, b.session);
    } else if (a._bucket === 1) {
      c = nat(a.session, b.session);
    }
    if (!c && a._bucket <= 1) {
      c = (FORMAT_RANK[a.presentation] ?? 9) - (FORMAT_RANK[b.presentation] ?? 9) || nat(a.topic, b.topic) || nat(a.room, b.room);
    }
    return c || nat(a.title, b.title) || nat(a.id, b.id);
  }

  const calCache = new Map();
  function calendarEligible(p) {
    if (calCache.has(p._key)) return calCache.get(p._key);
    const ok = p.status === 'scheduled' && !p.scheduleNote && !!p.id && !!p.date && !!p.start && !!p.end &&
      p.end > p.start && (p.timeZone || tz) === tz && !!localToUtc(p.date, p.start) && !!localToUtc(p.date, p.end);
    calCache.set(p._key, ok);
    return ok;
  }

  /* ---------- Shortlist ---------- */

  function loadShortlist() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === 'string' && x.length < 80) : []);
    } catch {
      return new Set();
    }
  }

  function persistShortlist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...shortlist]));
    } catch {
      if (!storageWarned) announce('This browser is not storing the shortlist; it will be lost when you leave.');
      storageWarned = true;
    }
  }

  const savedPapers = () => papers.filter((p) => shortlist.has(p._key));

  function toggleSaved(p) {
    if (shortlist.has(p._key)) shortlist.delete(p._key);
    else shortlist.add(p._key);
    persistShortlist();
    refreshStars();
    if (state.saved) {
      update({ scroll: false });
      els.count.focus({ preventScroll: true });
    }
    announce(shortlist.has(p._key) ? `Saved ${p.id} to your shortlist.` : `Removed ${p.id} from your shortlist.`);
  }

  function refreshStars() {
    for (const btn of document.querySelectorAll('.star[data-key]')) {
      btn.setAttribute('aria-pressed', String(shortlist.has(btn.dataset.key)));
    }
    els.savedCount.textContent = fmtNum(savedPapers().length);
    if (state.saved) renderShortlistBar();
  }

  function starButton(p) {
    return h('button', {
      type: 'button', class: 'star', 'data-action': 'star', 'data-key': p._key,
      'aria-pressed': String(shortlist.has(p._key)), 'aria-label': `Shortlist ${p.id}`, title: 'Save to shortlist',
    }, icon('star'));
  }

  /* ---------- Calendar export ---------- */

  const icsEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const icsStamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const utf8Len = (ch) => { const c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; };

  function foldLine(line) {
    const out = [];
    let cur = '';
    let bytes = 0;
    for (const ch of line) {
      const b = utf8Len(ch);
      if (bytes + b > 75) { out.push(cur); cur = ' '; bytes = 1; }
      cur += ch;
      bytes += b;
    }
    out.push(cur);
    return out.join('\r\n');
  }

  const permalinkHref = (id) => `?paper=${encodeURIComponent(id)}`;

  function downloadIcs(list, filename) {
    const events = list.filter(calendarEligible);
    if (!events.length) {
      announce('None of these papers has a confirmed time, so there is nothing to add to a calendar.');
      return;
    }
    const stamp = icsStamp(new Date());
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EMNLP 2026 Paper Finder (unofficial)//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const p of events) {
      const description = [
        [p.track, p.presentation, p.mode && IMPLIED_MODE[p.presentation] !== p.mode ? `Attendance: ${p.mode}` : null].filter(Boolean).join(' · '),
        [p.session, p.topic].filter(Boolean).join(' — '),
        p.presenter ? `Presenter: ${p.presenter}` : null,
        `Paper ID: ${p.id}`,
        `Budapest local time. Unofficial schedule snapshot (updated ${updatedLabel}). Check ${PROGRAM_URL} for changes.`,
      ].filter(Boolean).join('\n');
      lines.push(
        'BEGIN:VEVENT',
        `UID:${p.id.replace(/[^A-Za-z0-9-]/g, '')}@emnlp2026-paper-finder`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${icsStamp(localToUtc(p.date, p.start).date)}`,
        `DTEND:${icsStamp(localToUtc(p.date, p.end).date)}`,
        `SUMMARY:${icsEscape(p.title || p.id)}`,
        p.room ? `LOCATION:${icsEscape(p.room)}` : null,
        `DESCRIPTION:${icsEscape(description)}`,
        `URL:${new URL(permalinkHref(p.id), location.href).href}`,
        'END:VEVENT',
      );
    }
    lines.push('END:VCALENDAR');
    const body = `${lines.filter(Boolean).map(foldLine).join('\r\n')}\r\n`;
    const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
    const a = h('a', { href: url, download: filename, hidden: true });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    const skipped = list.length - events.length;
    announce(`Calendar file with ${plural(events.length, 'event', 'events')} downloaded${skipped ? `; ${skipped} without a confirmed time left out` : ''}.`);
  }

  /* ---------- URL state ---------- */

  function stateFromUrl() {
    const params = new URLSearchParams(location.search);
    const s = blankState();
    const paper = text(params.get('paper'));
    if (paper) { s.paper = paper.slice(0, 64); return s; }
    s.q = (params.get('q') || '').slice(0, 200);
    const day = params.get('day');
    if (day && dayOptions.some((d) => d.value === day)) s.day = day;
    s.saved = params.get('saved') === '1';
    for (const f of FACETS) {
      const raw = params.get(f.param);
      if (!raw) continue;
      for (const slug of raw.split(',')) {
        const opt = facetOptions[f.key].find((o) => o.slug === slug.trim().toLowerCase());
        if (!opt) continue;
        if (f.single) s.filters[f.key].clear();
        s.filters[f.key].add(opt.value);
      }
    }
    return s;
  }

  function urlFromState() {
    const params = new URLSearchParams();
    if (state.paper) {
      params.set('paper', state.paper);
    } else {
      if (state.q.trim()) params.set('q', state.q.trim());
      if (state.day !== 'all') params.set('day', state.day);
      for (const f of FACETS) {
        const sel = state.filters[f.key];
        if (sel.size) params.set(f.param, facetOptions[f.key].filter((o) => sel.has(o.value)).map((o) => o.slug).join(','));
      }
      if (state.saved) params.set('saved', '1');
    }
    const qs = params.toString().replace(/%2C/g, ',');
    return location.pathname + (qs ? `?${qs}` : '');
  }

  // Discrete changes push a history entry; consecutive keystrokes share one.
  function commit(kind, opts = {}) {
    if (!loaded) return; // Typing before the data arrives is picked up by init().
    const url = urlFromState();
    if (url !== location.pathname + location.search) {
      if (kind === 'typing' && lastNav === 'typing') history.replaceState(null, '', url);
      else history.pushState(null, '', url);
    }
    lastNav = kind;
    update({ typing: kind === 'typing', ...opts });
  }

  function resetAll() {
    clearTimeout(typingTimer);
    Object.assign(state, blankState());
    syncControls();
    commit('filter');
  }

  function openPaper(id) {
    clearTimeout(typingTimer);
    Object.assign(state, blankState(), { paper: id });
    syncControls();
    commit('nav', { scroll: 'force' });
    els.count.focus({ preventScroll: true });
  }

  /* ---------- Build controls ---------- */

  function buildOptions() {
    FACETS.forEach((f, j) => {
      const seen = new Set();
      for (const p of papers) if (!(f.hide && f.hide.has(p._f[j]))) seen.add(p._f[j]);
      const rank = (v) => (v === NONE ? 1e6 : f.order && f.order.includes(v) ? f.order.indexOf(v) : 1e5);
      facetOptions[f.key] = [...seen]
        .sort((a, b) => rank(a) - rank(b) || nat(a, b))
        .map((v) => ({
          value: v,
          slug: v === NONE ? 'not-listed' : slugify(v),
          label: v === NONE ? 'Not listed' : (f.labels && f.labels[v]) || v,
        }));
    });
  }

  function buildDays() {
    const dates = [...new Set(papers.map((p) => p._day).filter((d) => d && d !== 'undated'))].sort();
    const today = (zonedNow() || {}).date;
    dayOptions = [{ value: 'all', wd: 'Programme', date: 'All days' }];
    for (const d of dates) {
      const info = dateInfo(d);
      dayOptions.push({ value: d, wd: d === today ? 'Today' : info.wdShort, date: info.dayMonthShort, today: d === today, long: info.short });
    }
    if (papers.some((p) => p._day === 'undated')) dayOptions.push({ value: 'undated', wd: 'Pending', date: 'No date' });

    for (const d of dayOptions) {
      d.input = h('input', { type: 'radio', name: 'day', value: d.value });
      d.countEl = h('span', { class: 'day-opt__count' });
      d.label = h('label', { class: 'day-opt' }, d.input,
        h('span', { class: 'day-opt__box' },
          h('span', { class: `day-opt__wd${d.today ? ' is-today' : ''}` }, d.wd),
          h('span', { class: 'day-opt__date' }, d.date),
          d.countEl, h('span', { class: 'visually-hidden' }, ' papers')));
      els.days.append(d.label);
    }
    els.nowBtn.hidden = !dates.includes(today);
  }

  function buildFacets() {
    els.facets.replaceChildren();
    FACETS.forEach((f) => {
      const opts = facetOptions[f.key];
      if (!opts.length) return;
      if (f.single) {
        const id = `facet-${f.key}`;
        const select = h('select', { class: 'select', id, 'data-facet': f.key }, h('option', { value: '' }, `All ${f.label.toLowerCase()}s`));
        for (const o of opts) { o.optionEl = h('option', { value: o.slug }, o.label); select.append(o.optionEl); }
        roomSelect.el = select;
        els.facets.append(h('div', { class: 'facet' }, h('label', { class: 'facet__legend', for: id }, f.label), select));
        return;
      }
      const box = h('div', { class: 'facet__opts' });
      for (const o of opts) {
        o.input = h('input', { type: 'checkbox', name: f.param, value: o.slug, 'data-facet': f.key });
        o.countEl = h('span', { class: 'opt__count' });
        o.row = h('label', { class: 'opt' }, o.input, h('span', { class: 'opt__label' }, o.label), o.countEl);
        box.append(o.row);
      }
      els.facets.append(h('fieldset', { class: 'facet' }, h('legend', { class: 'facet__legend' }, f.label), box,
        f.hint ? h('p', { class: 'facet__hint' }, f.hint) : null));
    });
  }

  function syncControls() {
    if (els.q.value !== state.q) els.q.value = state.q;
    els.qClear.hidden = !els.q.value;
    for (const d of dayOptions) d.input.checked = d.value === state.day;
    for (const f of FACETS) {
      for (const o of facetOptions[f.key]) if (o.input) o.input.checked = state.filters[f.key].has(o.value);
      if (f.single && roomSelect.el) {
        const v = [...state.filters[f.key]][0];
        const opt = facetOptions[f.key].find((o) => o.value === v);
        roomSelect.el.value = opt ? opt.slug : '';
      }
    }
    els.savedBtn.setAttribute('aria-pressed', String(state.saved));
  }

  function applyMeta() {
    if (sourceUrl) for (const a of document.querySelectorAll('[data-source-link]')) a.href = sourceUrl.href;
    const updated = validDate(conference.updatedAt);
    if (updated) {
      updatedLabel = dateInfo(updated).full;
      for (const t of document.querySelectorAll('[data-updated]')) { t.textContent = updatedLabel; t.setAttribute('datetime', updated); }
    }
  }

  /* ---------- Filtering ---------- */

  function update({ typing = false, scroll = true } = {}) {
    terms = fold(state.q).split(/\s+/).filter(Boolean);
    const n = FACETS.length;
    const dayCounts = new Map();
    let dayAll = 0;
    const counts = FACETS.map(() => new Map());
    const matched = [];
    for (const p of papers) {
      let m = 0;
      for (const t of terms) if (!p._hay.includes(t)) { m |= 1; break; }
      if (state.saved && !shortlist.has(p._key)) m |= 2;
      if (state.day !== 'all' && p._day !== state.day) m |= 4;
      for (let j = 0; j < n; j++) {
        const sel = state.filters[FACETS[j].key];
        if (sel.size && !sel.has(p._f[j])) m |= 8 << j;
      }
      if (m === 0) matched.push(p);
      if ((m & ~4) === 0) { dayAll++; if (p._day) dayCounts.set(p._day, (dayCounts.get(p._day) || 0) + 1); }
      for (let j = 0; j < n; j++) {
        if ((m & ~(8 << j)) === 0) counts[j].set(p._f[j], (counts[j].get(p._f[j]) || 0) + 1);
      }
    }
    const focus = state.paper ? byKey.get(state.paper) || null : null;
    results = state.paper ? (focus ? [focus] : []) : matched;

    renderDayCounts(dayCounts, dayAll);
    renderFacetCounts(counts);
    renderSummary();
    renderChips();
    renderBanner(focus);
    if (state.saved) renderShortlistBar(); else els.shortlistBar.hidden = true;
    renderList();
    if (scroll) scrollToResults(scroll === 'force');
    announce(state.paper ? (focus ? `Showing paper ${focus.id}.` : 'Paper not found.') : `${plural(results.length, 'paper', 'papers')} found.`, typing ? 800 : 150);
  }

  function renderDayCounts(dayCounts, all) {
    for (const d of dayOptions) {
      const c = d.value === 'all' ? all : dayCounts.get(d.value) || 0;
      d.countEl.textContent = fmtNum(c);
      d.label.classList.toggle('is-zero', c === 0);
    }
  }

  function renderFacetCounts(counts) {
    let active = 0;
    FACETS.forEach((f, j) => {
      active += state.filters[f.key].size;
      for (const o of facetOptions[f.key]) {
        const c = counts[j].get(o.value) || 0;
        if (o.countEl) {
          o.countEl.textContent = fmtNum(c);
          o.row.classList.toggle('is-zero', c === 0 && !state.filters[f.key].has(o.value));
        }
        if (o.optionEl) o.optionEl.textContent = `${o.label} (${fmtNum(c)})`;
      }
    });
    els.filtersBadge.hidden = active === 0;
    els.filtersBadge.textContent = String(active);
    els.filtersOpen.setAttribute('aria-label', active ? `Filters, ${active} active` : 'Filters');
  }

  function renderSummary() {
    const total = papers.length;
    if (state.paper) {
      els.count.replaceChildren('Shared paper');
    } else if (state.saved) {
      els.count.replaceChildren(h('span', { class: 'results__num' }, fmtNum(results.length)), ' saved');
    } else {
      els.count.replaceChildren(
        h('span', { class: 'results__num' }, fmtNum(results.length)), results.length === 1 ? ' paper' : ' papers');
      if (results.length !== total) {
        els.count.append(h('span', { class: 'results__of' }, ` of ${fmtNum(total)}`));
      }
    }
    els.filtersDone.textContent = `Show ${plural(results.length, 'paper', 'papers')}`;
    els.savedCount.textContent = fmtNum(savedPapers().length);
  }

  function renderChips() {
    const chips = [];
    const q = state.q.trim();
    if (q) chips.push(['Search', `“${q}”`, () => { state.q = ''; }]);
    if (state.day !== 'all') {
      const d = dayOptions.find((x) => x.value === state.day);
      chips.push(['Day', d.long || d.date, () => { state.day = 'all'; }]);
    }
    for (const f of FACETS) {
      for (const o of facetOptions[f.key]) {
        if (state.filters[f.key].has(o.value)) chips.push([f.label, o.label, () => state.filters[f.key].delete(o.value)]);
      }
    }
    if (state.saved) chips.push(['View', 'Shortlist', () => { state.saved = false; }]);

    els.chips.replaceChildren(...chips.map(([k, v, remove], i) => h('button', {
      type: 'button', class: 'chip', 'aria-label': `Remove ${k}: ${v}`,
      onclick: () => {
        remove();
        state.paper = null;
        syncControls();
        commit('filter');
        const next = els.chips.querySelectorAll('.chip');
        (next[Math.min(i, next.length - 1)] || els.count).focus();
      },
    }, h('span', { class: 'chip__k' }, `${k}:`), ' ', v, icon('x'))));
    els.chips.hidden = chips.length === 0;
    els.clearAll.hidden = chips.length === 0 && !state.paper;
  }

  function renderBanner(focus) {
    if (!state.paper) { els.banner.hidden = true; return; }
    els.banner.replaceChildren(
      h('p', null, focus ? `Showing one paper from a shared link (${focus.id}).` : `No paper with ID “${state.paper}” is in this snapshot.`),
      h('button', { type: 'button', class: 'btn btn--small', onclick: resetAll }, 'Show all papers'));
    els.banner.hidden = false;
  }

  function renderShortlistBar() {
    const saved = savedPapers();
    const eligible = saved.filter(calendarEligible).length;
    els.shortlistBar.replaceChildren(...[
      h('p', null, `Saved in this browser only. ${saved.length ? `${plural(eligible, 'paper has', 'papers have')} a confirmed time for your calendar.` : ''}`),
      eligible ? h('button', { type: 'button', class: 'btn btn--small btn--ink', onclick: () => downloadIcs(saved, 'emnlp2026-shortlist.ics') },
        icon('cal'), 'Download .ics') : null,
      saved.length ? h('button', {
        type: 'button', class: 'btn btn--small',
        onclick: () => {
          if (!window.confirm(`Remove all ${saved.length} papers from your shortlist?`)) return;
          shortlist.clear();
          persistShortlist();
          refreshStars();
          update({ scroll: false });
        },
      }, 'Clear shortlist') : null].filter(Boolean));
    els.shortlistBar.hidden = false;
  }

  /* ---------- Programme list ---------- */

  function renderList() {
    els.list.removeAttribute('aria-busy');
    els.list.replaceChildren();
    cursor = { day: null, dayEl: null, slot: null, ul: null };
    slotEls = new Map();
    slotCounts = new Map();
    dayGroupCounts = new Map();
    rendered = 0;
    if (!results.length) {
      els.list.append(emptyState());
      els.more.hidden = true;
      return;
    }
    for (const p of results) {
      slotCounts.set(p._group.slotKey, (slotCounts.get(p._group.slotKey) || 0) + 1);
      dayGroupCounts.set(p._group.dayKey, (dayGroupCounts.get(p._group.dayKey) || 0) + 1);
    }
    renderMore();
  }

  function renderMore() {
    const end = Math.min(results.length, rendered + PAGE_SIZE);
    const now = zonedNow();
    for (let i = rendered; i < end; i++) {
      const p = results[i];
      const g = p._group;
      if (g.dayKey !== cursor.day) {
        cursor.day = g.dayKey;
        cursor.slot = null;
        cursor.dayEl = h('section', { class: 'day-block' },
          h('h2', { class: 'day-title' },
            h('span', { class: 'day-title__kicker' }, g.dayKicker), h('span', null, g.dayTitle),
            h('span', { class: 'day-title__count' }, plural(dayGroupCounts.get(g.dayKey) || 0, 'paper', 'papers'))));
        els.list.append(cursor.dayEl);
      }
      if (g.slotKey !== cursor.slot) {
        cursor.slot = g.slotKey;
        const sec = slotBlock(p, now);
        cursor.ul = sec.querySelector('.papers');
        cursor.dayEl.append(sec);
        slotEls.set(g.slotKey, sec);
      }
      cursor.ul.append(paperRow(p));
    }
    rendered = end;
    els.more.hidden = false;
    els.moreStatus.textContent = `Showing ${fmtNum(rendered)} of ${plural(results.length, 'paper', 'papers')}`;
    const remaining = results.length - rendered;
    els.moreBtn.hidden = remaining <= 0;
    els.moreBtn.textContent = `Show ${fmtNum(Math.min(PAGE_SIZE, remaining))} more`;
  }

  function slotBlock(p, now) {
    const g = p._group;
    const live = !!now && p._timed && !!p.end && p.date === now.date && p.start <= now.time && now.time < p.end;
    const title = h('h3', { class: 'slot__title', tabindex: '-1' },
      g.short ? h('span', { class: 'slot__day' }, g.short) : null,
      g.time ? h('span', { class: 'slot__time' }, g.time) : h('span', { class: 'slot__time is-tbc' }, g.untimed || 'Time not confirmed'),
      g.time && g.zone ? h('abbr', { class: 'slot__tz', title: g.zone.title }, g.zone.abbr) : null,
      g.session ? h('span', { class: 'slot__session' }, g.session) : null);
    const head = h('div', { class: 'slot__head' }, title,
      live ? h('span', { class: 'slot__live' }, 'Now') : null,
      h('span', { class: 'slot__count' }, plural(slotCounts.get(g.slotKey) || 0, 'paper', 'papers')),
      g.note ? h('p', { class: 'slot__note' }, g.note) : null);
    return h('section', { class: `slot${live ? ' is-now' : ''}` }, head, h('ul', { class: 'papers' }));
  }

  function paperRow(p) {
    const li = h('li', { class: `paper${p._inactive ? ' is-inactive' : ''}${p.id && p.id === featuredId ? ' is-featured' : ''}` });

    const where = h('div', { class: 'paper__where' });
    if (p._inactive) where.append(h('span', { class: 'paper__room is-status' }, STATUS_LABELS[p.status]));
    else where.append(h('span', { class: `paper__room${p.room ? '' : ' is-missing'}` }, p.room || 'Room not listed'));
    if (p.presentation && !STATUS_LIKE.has(p.presentation)) {
      where.append(h('span', { class: `fmt fmt--${FORMAT_CLASS[p.presentation] || 'other'}` }, p.presentation));
    }

    const body = h('div', { class: 'paper__body' });
    const title = h('h4', { class: 'paper__title' });
    highlightInto(title, p.title || 'Untitled entry', terms);
    body.append(title);

    const presenter = h('p', { class: 'paper__presenter' }, h('span', { class: 'paper__label' }, 'Presenter'));
    if (p.presenter) {
      const name = h('span');
      highlightInto(name, p.presenter, terms);
      presenter.append(name);
    } else {
      presenter.append(h('span', { class: 'is-missing' }, 'not listed'));
    }
    if (p.presenterNote) presenter.append(h('span', { class: 'paper__aside' }, ` (${p.presenterNote.replace(/\.$/, '')})`));
    body.append(presenter);

    if (p.topic && !p._inactive) {
      const topic = h('p', { class: 'paper__topic' });
      highlightInto(topic, p.topic, terms);
      body.append(topic);
    }

    const flags = [];
    if (p.id && p.id === featuredId) flags.push(h('span', { class: 'flag flag--accent' }, 'Our paper · come say hello'));
    if (!p._inactive && IMPLIED_MODE[p.presentation] !== p.mode) {
      if (p.mode && !STATUS_LIKE.has(p.mode)) flags.push(h('span', { class: `flag${p.mode === 'Virtual' ? ' flag--virtual' : ''}` }, `Attendance: ${p.mode}`));
      else if (!p.mode) flags.push(h('span', { class: 'flag' }, 'Attendance not listed'));
    }
    if (flags.length) body.append(h('p', { class: 'paper__flags' }, flags));

    const note = scheduleNote(p);
    if (note) body.append(note);

    const meta = h('p', { class: 'paper__meta' });
    if (p.id) {
      const id = h('span', { class: 'paper__id' });
      highlightInto(id, p.id, terms);
      meta.append(id);
    }
    if (p.track) meta.append(h('span', null, p.track));
    if (p.id) meta.append(h('a', { href: permalinkHref(p.id), 'data-permalink': p.id, 'aria-label': `Shareable link to ${p.id}` }, 'Link'));
    const src = sourceRowUrl(p.sourceRow);
    if (src) meta.append(newTab(src, `Sheet row ${p.sourceRow}`, ' in the source spreadsheet (opens in a new tab)'));
    if (calendarEligible(p)) {
      meta.append(h('button', { type: 'button', class: 'linkish', 'data-action': 'ics', 'data-key': p._key, 'aria-label': `Add ${p.id} to calendar (.ics file)` }, 'Add to calendar'));
    }
    body.append(meta);

    li.append(where, body);
    if (p.id) li.append(starButton(p));
    return li;
  }

  function checkSource(p) {
    const src = sourceRowUrl(p.sourceRow) || (sourceUrl && sourceUrl.href);
    return src ? [' ', newTab(src, 'Check source ↗', ' sheet row (opens in a new tab)')] : [];
  }

  function scheduleNote(p) {
    if (p.scheduleNote) {
      return h('p', { class: 'note', role: 'note' }, h('strong', null, 'Schedule conflict. '), p.scheduleNote, ...checkSource(p));
    }
    if (p._inactive) {
      const label = STATUS_LABELS[p.status];
      const stale = [p.date ? dateInfo(p.date).short : null, p.start ? (p.end ? `${p.start}–${p.end}` : p.start) : null, p.session, p.topic, p.room].filter(Boolean);
      return h('p', { class: 'note note--muted' }, `Marked “${label}” in the source.`,
        stale.length ? ` The sheet still lists ${stale.join(' · ')}, which is not a slot to attend.` : '');
    }
    if (!p._timed) {
      let msg = 'No presentation time is listed in the source.';
      if (p.start && !p.end) msg = `The source lists a start of ${p.start} but no end time; not confirmed.`;
      else if (p.start && p.end) msg = `The source lists ${p.start}–${p.end} but does not mark it as scheduled.`;
      return h('p', { class: 'note' }, h('strong', null, 'Time not confirmed. '), msg, ...checkSource(p));
    }
    return null;
  }

  function emptyState() {
    const box = (title, msg, actions) => h('div', { class: 'state' }, h('h3', null, title), h('p', null, msg),
      actions.length ? h('p', { class: 'state__actions' }, actions) : null);
    if (state.paper) {
      return box('Paper not found', `“${state.paper}” is not in this snapshot (updated ${updatedLabel}). It may have been added or renamed since; the source sheet has the latest.`, [
        h('button', { type: 'button', class: 'btn btn--ink', onclick: resetAll }, 'Show all papers'),
        sourceUrl ? newTab(sourceUrl.href, 'Open source sheet', null, 'btn') : null,
      ]);
    }
    if (state.saved && savedPapers().length === 0) {
      return box('Your shortlist is empty', 'Tap the star next to any paper to keep it here. The shortlist stays in this browser only.', [
        h('button', { type: 'button', class: 'btn btn--ink', onclick: () => { state.saved = false; syncControls(); commit('filter'); } }, 'Browse all papers'),
      ]);
    }
    const q = state.q.trim();
    return box('No papers match',
      q ? `Nothing matches “${q}” with the current filters. Try fewer or different words, a paper ID such as 1234-MAIN, or remove a filter.`
        : 'No papers match this combination of filters. Remove one to see more.',
      [h('button', { type: 'button', class: 'btn btn--ink', onclick: resetAll }, 'Clear search and filters')]);
  }

  function skeleton() {
    const row = () => h('li', { class: 'paper is-skeleton' },
      h('div', { class: 'paper__where' }, h('i', { class: 'sk sk--s' })),
      h('div', { class: 'paper__body' }, h('i', { class: 'sk sk--l' }), h('i', { class: 'sk sk--m' })));
    return h('ul', { class: 'papers papers--skeleton', 'aria-hidden': 'true' }, row(), row(), row(), row());
  }

  /* ---------- Featured paper ---------- */

  function renderFeatured() {
    const p = featuredId && byKey.get(featuredId);
    if (!p) { els.featured.hidden = true; return; }
    const when = h('dd');
    if (p._timed && p._bucket === 0) {
      when.append(`${p._group.short} · `, h('span', { class: 'featured__time' }, timeRange(p)));
      if (p._group.zone) when.append(' ', h('abbr', { class: 'featured__tz', title: p._group.zone.title }, p._group.zone.abbr));
    } else {
      when.append(p._inactive ? STATUS_LABELS[p.status] : 'Time not confirmed', ...checkSource(p));
    }
    const where = h('dd', null, p._inactive ? '—' : [p.room || 'Room not listed', p.topic, p.session].filter(Boolean).join(' · '));
    const byline = [p.presenter ? `Presenter: ${p.presenter}` : null, p.track, p.presentation].filter(Boolean).join(' · ');

    els.featured.replaceChildren(h('div', { class: 'featured__card' },
      h('div', null,
        h('p', { class: 'featured__kicker' }, 'Our paper', h('span', null, ' · Come say hello')),
        h('h2', { class: 'featured__title' }, p.title || p.id),
        h('p', { class: 'featured__by' }, byline, ' · ', newTab(CHAIR_URL, 'Data Science Chair, Würzburg'))),
      h('dl', { class: 'featured__when' },
        h('div', null, h('dt', null, 'When'), when),
        h('div', null, h('dt', null, 'Where'), where)),
      h('div', { class: 'featured__actions' },
        h('a', { class: 'btn btn--ink', href: permalinkHref(p.id), 'data-permalink': p.id }, 'Show in schedule'),
        calendarEligible(p) ? h('button', { type: 'button', class: 'btn', 'data-action': 'ics', 'data-key': p._key }, icon('cal'), 'Add to calendar') : null,
        newTab(REPO_URL, [icon('code'), 'Code'], ' on GitHub (opens in a new tab)', 'btn'),
        starButton(p))));
    els.featured.hidden = false;
  }

  /* ---------- Interaction ---------- */

  function handleAction(e) {
    const btn = e.target.closest('[data-action]');
    if (btn) {
      const p = byKey.get(btn.dataset.key);
      if (!p) return;
      if (btn.dataset.action === 'star') toggleSaved(p);
      else if (btn.dataset.action === 'ics') downloadIcs([p], `emnlp2026-${p.id.replace(/[^A-Za-z0-9-]/g, '')}.ics`);
      return;
    }
    const link = e.target.closest('a[data-permalink]');
    if (link && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      openPaper(link.dataset.permalink);
    }
  }

  function scrollToResults(force) {
    const offset = els.toolbar.offsetHeight + 4;
    const top = els.results.getBoundingClientRect().top;
    if (top < offset || (force && top > offset)) window.scrollTo(0, window.scrollY + top - offset);
  }

  function announce(msg, delay = 150) {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => { els.live.textContent = msg; }, delay);
  }

  function jumpToNow() {
    const now = zonedNow();
    if (!now || !dayOptions.some((d) => d.value === now.date)) return;
    if (state.day !== now.date || state.paper) {
      state.day = now.date;
      state.paper = null;
      syncControls();
      commit('filter', { scroll: false });
    }
    const idx = results.findIndex((p) => p._timed && p.date === now.date && (p.end || p.start) > now.time);
    if (idx === -1) {
      scrollToResults(true);
      announce('No more sessions with a confirmed time today match your filters.', 50);
      return;
    }
    while (rendered <= idx) renderMore();
    const sec = slotEls.get(results[idx]._group.slotKey);
    if (!sec) return;
    sec.scrollIntoView({ block: 'start' });
    sec.querySelector('.slot__title').focus({ preventScroll: true });
  }

  const drawerQuery = window.matchMedia('(max-width: 959px)');
  const drawerOpen = () => els.filters.classList.contains('is-open');

  function openFilters() {
    if (!drawerQuery.matches) return;
    els.filters.classList.add('is-open');
    els.filters.setAttribute('role', 'dialog');
    els.filters.setAttribute('aria-modal', 'true');
    els.filtersOpen.setAttribute('aria-expanded', 'true');
    document.body.classList.add('has-drawer');
    els.filtersClose.focus();
  }

  function closeFilters(returnFocus = true) {
    if (!drawerOpen()) return;
    els.filters.classList.remove('is-open');
    els.filters.removeAttribute('role');
    els.filters.removeAttribute('aria-modal');
    els.filtersOpen.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('has-drawer');
    if (returnFocus) els.filtersOpen.focus();
  }

  function trapFocus(e) {
    const items = [...els.filters.querySelectorAll('button, input, select, a[href]')]
      .filter((el) => !el.disabled && el.getClientRects().length);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function bindEvents() {
    els.form.addEventListener('submit', (e) => {
      e.preventDefault();
      clearTimeout(typingTimer);
      state.q = els.q.value;
      state.paper = null;
      commit('typing');
      if (drawerQuery.matches) els.q.blur();
    });
    els.q.addEventListener('input', () => {
      els.qClear.hidden = !els.q.value;
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        state.q = els.q.value;
        state.paper = null;
        commit('typing');
      }, 140);
    });
    els.q.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && els.q.value) {
        e.preventDefault();
        els.q.value = '';
        els.q.dispatchEvent(new Event('input'));
      }
    });
    els.qClear.addEventListener('click', () => {
      els.q.value = '';
      clearTimeout(typingTimer);
      state.q = '';
      state.paper = null;
      syncControls();
      commit('filter');
      els.q.focus();
    });

    els.days.addEventListener('change', (e) => {
      if (e.target.name !== 'day') return;
      state.day = e.target.value;
      state.paper = null;
      commit('filter');
    });

    els.facets.addEventListener('change', (e) => {
      const t = e.target;
      const key = t.dataset.facet;
      if (!key) return;
      const opt = facetOptions[key].find((o) => o.slug === t.value);
      if (t.tagName === 'SELECT') {
        state.filters[key].clear();
        if (opt) state.filters[key].add(opt.value);
      } else if (opt) {
        if (t.checked) state.filters[key].add(opt.value);
        else state.filters[key].delete(opt.value);
      }
      state.paper = null;
      commit('filter');
    });

    els.savedBtn.addEventListener('click', () => {
      state.saved = !state.saved;
      state.paper = null;
      syncControls();
      commit('filter');
    });
    els.clearAll.addEventListener('click', () => { resetAll(); els.q.focus({ preventScroll: true }); });
    els.filtersReset.addEventListener('click', resetAll);
    els.filtersResetTop.addEventListener('click', resetAll);
    els.nowBtn.addEventListener('click', jumpToNow);
    els.moreBtn.addEventListener('click', () => {
      renderMore();
      announce(els.moreStatus.textContent, 50);
    });

    els.list.addEventListener('click', handleAction);
    els.featured.addEventListener('click', handleAction);

    els.filtersOpen.addEventListener('click', openFilters);
    els.filtersClose.addEventListener('click', () => closeFilters());
    els.filtersDone.addEventListener('click', () => { closeFilters(false); scrollToResults(true); els.count.focus({ preventScroll: true }); });
    els.filters.addEventListener('keydown', (e) => {
      if (!drawerOpen()) return;
      if (e.key === 'Escape') { e.preventDefault(); closeFilters(); }
      else if (e.key === 'Tab') trapFocus(e);
    });
    drawerQuery.addEventListener('change', () => closeFilters(false));

    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || drawerOpen()) return;
      const t = e.target;
      if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      e.preventDefault();
      els.q.focus();
      els.q.select();
    });

    window.addEventListener('popstate', () => {
      if (!loaded) return;
      clearTimeout(typingTimer);
      Object.assign(state, stateFromUrl());
      syncControls();
      lastNav = null;
      update({ scroll: false });
    });

    window.addEventListener('storage', (e) => {
      if (e.key !== STORAGE_KEY) return;
      shortlist = loadShortlist();
      refreshStars();
      if (state.saved) update({ scroll: false });
    });

    const setToolbarHeight = () => document.documentElement.style.setProperty('--toolbar-h', `${els.toolbar.offsetHeight}px`);
    if ('ResizeObserver' in window) new ResizeObserver(setToolbarHeight).observe(els.toolbar);
    setToolbarHeight();
  }

  /* ---------- Boot ---------- */

  function init(json) {
    conference = json.conference && typeof json.conference === 'object' ? json.conference : {};
    const zone = text(conference.timezone);
    if (zone) {
      try { new Intl.DateTimeFormat('en', { timeZone: zone }); tz = zone; } catch { tz = DEFAULT_TZ; }
    }
    sourceUrl = safeSourceUrl(conference.sourceUrl) || safeSourceUrl(FALLBACK_SOURCE);
    featuredId = text(conference.featuredPaperId);

    papers = json.papers.map(normalize).filter(Boolean).sort(compare);
    byKey = new Map(papers.map((p) => [p._key, p]));

    applyMeta();
    buildOptions();
    buildDays();
    buildFacets();
    renderFeatured();

    const typedEarly = els.q.value;
    Object.assign(state, stateFromUrl());
    if (!state.q && !state.paper && typedEarly.trim()) state.q = typedEarly;
    syncControls();
    loaded = true;
    update({ scroll: false });
  }

  function showError(err) {
    els.list.removeAttribute('aria-busy');
    els.count.textContent = 'Schedule unavailable';
    els.more.hidden = true;
    const src = (sourceUrl && sourceUrl.href) || FALLBACK_SOURCE;
    els.list.replaceChildren(h('div', { class: 'state', role: 'alert' },
      h('h3', null, 'The schedule couldn’t be loaded'),
      h('p', null, 'Check your connection and try again. The official sources are always available.'),
      h('p', { class: 'state__actions' },
        h('button', { type: 'button', class: 'btn btn--ink', onclick: load }, 'Try again'),
        newTab(src, 'Source sheet', null, 'btn'),
        newTab(PROGRAM_URL, 'Official programme', null, 'btn')),
      h('p', { class: 'state__detail' }, `Details: ${err && err.message ? err.message : String(err)}`)));
  }

  async function load() {
    if (loaded) return;
    els.list.setAttribute('aria-busy', 'true');
    els.list.replaceChildren(skeleton());
    els.count.textContent = 'Loading schedule…';
    try {
      const res = await fetch(DATA_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status} while loading ${DATA_URL}`);
      const json = await res.json();
      if (!json || !Array.isArray(json.papers)) throw new Error('The data file has an unexpected format.');
      init(json);
    } catch (err) {
      showError(err);
    }
  }

  bindEvents();
  load();
})();
