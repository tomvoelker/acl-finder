/*
 * EMNLP 2026 Paper Finder: an unofficial, static schedule search.
 * Every value from data/papers.json is untrusted text. It is rendered through
 * DOM APIs (textContent / text nodes), never as raw HTML. Delimited title
 * formulas are parsed by KaTeX with untrusted input settings.
 */
'use strict';

import { conferenceNow, initialDay, sessionKey, readOralSlot, presentationSlot, presenterAuthorIndices, authorKey, indexAuthors, searchState, resultPage, RESULT_PAGE_SIZE, posterBrowsing, posterScope } from './schedule-view.mjs';
import { renderTitle, titleSearchText } from './math-titles.mjs';
import { createAnalytics } from './analytics.mjs';
import { readPosterLocation, posterMapHref, posterSlotDiffers, parsePosterQuery, matchesPosterQuery, posterBrowseDay, posterGroups } from './poster-view.mjs';
import { SAVED_PAPERS_KEY as STORAGE_KEY, DEFAULT_SAVED_PAPER_ID, readSavedPapers, isDefaultSavedList, addSavedPapers } from './saved-papers.mjs';
import { buildSavedListUrl, readSharedList } from './saved-sharing.mjs';
import { readAtlasLabel } from './atlas.mjs';

(() => {
  const analytics = createAnalytics();
  const DATA_URL = 'data/papers.json';
  const NONE = '__none__';
  const DEFAULT_TZ = 'Europe/Budapest';
  const PROGRAM_URL = 'https://2026.emnlp.org/program/';
  const FALLBACK_SOURCE = 'https://docs.google.com/spreadsheets/d/1aXGTy_7Xeh-OXIs3iJSbDpUsZ6YhbfA76b17kBZH0Yk/edit?gid=943432490';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const PAGE_TITLE = document.title;

  const STATUS_LABELS = {
    scheduled: 'Scheduled',
    unscheduled: 'Time not confirmed',
    'not presenting': 'Not presenting',
    withdrawn: 'Withdrawn',
    'desk rejected': 'Desk rejected',
  };
  const INACTIVE = new Set(['not presenting', 'withdrawn', 'desk rejected']);
  const STATUS_LIKE = new Set(['Not presenting', 'Withdrawn', 'Desk rejected']);
  const IMPLIED_MODE = { Oral: 'In person', Poster: 'In person', Demo: 'In person', Virtual: 'Virtual', 'Virtual demo': 'Virtual' };
  const FORMAT_RANK = { Oral: 0, Demo: 1, Poster: 2, 'Virtual demo': 3, Virtual: 4 };

  const FACETS = [
    { key: 'area', param: 'area', label: 'Area', all: 'All areas', get: (p) => p.atlas?.areaLabel,
      noneLabel: 'Not classified in Atlas', hint: 'Broad inferred areas from Hadi Mohammadi’s EMNLP Atlas, not official acceptance tracks.' },
    { key: 'track', param: 'track', label: 'Track', all: 'All tracks', get: (p) => p.track,
      order: ['Main conference', 'Findings', 'Industry', 'Systems demonstrations', 'TACL', 'Computational Linguistics'] },
    { key: 'format', param: 'format', label: 'Presentations', all: 'All', get: (p) => p.presentation,
      labels: { Poster: 'Posters', Oral: 'Orals', Demo: 'Demos', 'Virtual demo': 'Virtual demos' },
      order: ['Poster', 'Oral', 'Demo', 'Virtual', 'Virtual demo'], hide: STATUS_LIKE },
    { key: 'mode', param: 'attendance', label: 'Attendance', all: 'Any', get: (p) => p.mode,
      order: ['In person', 'Virtual'], hide: STATUS_LIKE,
      hint: 'How the presenter attends. A virtual presenter can still be assigned a physical room.' },
    { key: 'room', param: 'room', label: 'Room', all: 'All rooms', get: (p) => p.room, order: ['Hall H'] },
    { key: 'status', param: 'status', label: 'Status', all: 'Any status', get: (p) => p.status,
      order: ['scheduled', 'unscheduled', 'not presenting', 'withdrawn', 'desk rejected'], labels: STATUS_LABELS },
  ];

  const ICONS = {
    star: 'M12 3.6l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.62 6.9 19.3l.98-5.68L3.75 9.6l5.7-.83z',
    cal: 'M5 6h14v14H5zM5 10h14M9 3.5v4M15 3.5v4',
  };

  const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const $ = (sel) => document.querySelector(sel);
  const els = {
    toolbar: $('#toolbar'), form: $('#search-form'), q: $('#q'), qClear: $('#q-clear'),
    day: $('#day'), daySelect: $('#day-select'), facets: $('#facets'), results: $('#results'),
    filtersToggle: $('#filters-toggle'), filtersCount: $('#filters-count'),
    count: $('#results-count'), nowBtn: $('#now-btn'), savedBtn: $('#saved-btn'), savedCount: $('#saved-count'),
    clearAll: $('#clear-all'), shortlistBar: $('#shortlist-bar'), banner: $('#paper-banner'), browseLink: $('#browse-link'),
    list: $('#list'), live: $('#live'), authorProfile: $('#author-profile'),
  };

  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  const fmtNum = (n) => n.toLocaleString('en-GB');
  const plural = (n, one, many) => `${fmtNum(n)} ${n === 1 ? one : many}`;
  const nat = (a, b) => (a == null) - (b == null) || (a == null ? 0 : collator.compare(a, b));
  const str = (a, b) => (a == null) - (b == null) || (a == null || a === b ? 0 : a < b ? -1 : 1);
  const fold = (s) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  const slugify = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

  let conference = {};
  let atlas = null;
  let posterSessions = new Map();
  let tz = DEFAULT_TZ;
  let sourceUrl = null;
  let updatedLabel = '';
  let papers = [];
  let posterOrderedPapers = [];
  let byKey = new Map();
  let authors = new Map();
  let dayOptions = [];
  const facetOptions = Object.fromEntries(FACETS.map((f) => [f.key, []]));
  const facetSelects = {};
  let results = [];
  let terms = [];
  const sessions = new Map();
  const sessionOpen = new Map();
  let lastNav = null;
  let typingTimer = null;
  let renderTicket = 0;
  let announceTimer = null;
  let loaded = false;
  let hydratedUrl = null;
  let searchBeforeLoad = false;
  let shortlist = readSavedPapers();
  let defaultSavedList = isDefaultSavedList();
  let storageWarned = false;

  const blankState = () => ({
    q: '', day: 'all', saved: false, paper: null, author: null, view: 'posters', posterSession: null, shared: null,
    filters: Object.fromEntries(FACETS.map((f) => [f.key, null])),
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
    // Most author names do not match the query. Avoid allocating a per-character
    // Unicode offset map unless this string will actually contain a highlight.
    const searchable = fold(text);
    if (!words.some(word => searchable.includes(word))) { el.textContent = text; return; }
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
      short: `${WD_SHORT[wd]} ${d} ${MON_SHORT[m - 1]}`,
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
      return conferenceNow(tz);
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
    u.hash = `${gid ? `gid=${gid}&` : ''}range=A${row}:L${row}`;
    return u.href;
  }

  function normalize(raw, index) {
    if (!raw || typeof raw !== 'object') return null;
    const p = {
      id: text(raw.id), title: text(raw.title), track: text(raw.track), trackCode: text(raw.trackCode),
      presentation: text(raw.presentation), mode: text(raw.mode), presenter: text(raw.presenter),
      authors: Array.isArray(raw.authors) ? raw.authors.map(text).filter(Boolean) : [],
      presenterNote: text(raw.presenterNote), room: text(raw.room), session: text(raw.session),
      topic: text(raw.topic), date: validDate(raw.date), start: validTime(raw.start), end: validTime(raw.end),
      atlas: readAtlasLabel(atlas, raw.atlasTopic, raw.atlasArea), atlasAreaBasis: text(raw.atlasAreaBasis),
      timeZone: text(raw.timeZone), status: text(raw.status), scheduleNote: text(raw.scheduleNote),
      oralSlotNote: text(raw.oralSlotNote),
      board: /^D(?:10|[1-9])$/i.test(text(raw.board) || '') ? text(raw.board).toUpperCase() : null,
      poster: readPosterLocation(raw, posterSessions), posterIssue: text(raw.posterLocationIssue),
      posterClaimedBoard: Number.isInteger(raw.posterClaimedBoard) && raw.posterClaimedBoard >= 1 && raw.posterClaimedBoard <= 424 ? raw.posterClaimedBoard : null,
      sourceRow: Number.isInteger(raw.sourceRow) && raw.sourceRow > 0 ? raw.sourceRow : null,
      anthologyUrl: typeof raw.anthologyId === 'string' && /^\d{4}\.[a-z0-9-]+\.[1-9]\d*$/.test(raw.anthologyId)
        ? `https://aclanthology.org/${raw.anthologyId}/` : null,
      underlineUrl: typeof raw.underlineUrl === 'string' && /^https:\/\/underline\.io\/events\/535\/schedule\/sessions\/[1-9]\d*\/lecture\/[1-9]\d*-[a-z0-9_-]+$/.test(raw.underlineUrl)
        ? raw.underlineUrl : null,
    };
    p.oralSlot = readOralSlot({ ...p, oralSlot: raw.oralSlot });
    p._key = p.id || `row-${index}`;
    p._inactive = INACTIVE.has(p.status);
    // A time is only presented as confirmed when the source schedules it without a conflict note.
    p._timed = p.status === 'scheduled' && !p.scheduleNote && !!p.date && !!p.start;
    p._bucket = p.status === 'desk rejected' ? 4 : p.status === 'withdrawn' ? 3 : p.status === 'not presenting' ? 2 : p.date ? 0 : 1;
    p._day = p._inactive ? null : p.date || 'undated';
    p._hay = fold([p.id, p.title, titleSearchText(p.title || ''), ...p.authors, p.presenter, p.topic, p.atlas?.areaLabel, p.atlas?.label, p.poster ? `board ${p.poster.board} board${p.poster.board} ${p.poster.label}` : null, p.board ? `board ${p.board} board${p.board}` : null, p.posterIssue].filter(Boolean).join(' \u2002 '));
    p._f = FACETS.map((f) => f.get(p) ?? NONE);
    return p;
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
    if (!c && (a.oralSlot || b.oralSlot)) c = str(presentationSlot(a).start, presentationSlot(b).start);
    return c || nat(a.title, b.title) || nat(a.id, b.id);
  }

  function comparePosterFirst(a, b) {
    return (a._inactive ? 2 : a.poster ? 0 : 1) - (b._inactive ? 2 : b.poster ? 0 : 1) ||
      str(a.poster?.date, b.poster?.date) || str(a.poster?.start, b.poster?.start) ||
      (a.poster?.board || 0) - (b.poster?.board || 0) || compare(a, b);
  }

  const calCache = new Map();
  function calendarEligible(p) {
    if (calCache.has(p._key)) return calCache.get(p._key);
    const slot = presentationSlot(p);
    const ok = p.status === 'scheduled' && !p.scheduleNote && !p.oralSlotNote && !p.posterIssue && !!p.id && !!slot.date && !!slot.start && !!slot.end &&
      slot.end > slot.start && (p.timeZone || tz) === tz && !!localToUtc(slot.date, slot.start) && !!localToUtc(slot.date, slot.end);
    calCache.set(p._key, ok);
    return ok;
  }

  /* ---------- Shortlist ---------- */

  function persistShortlist() {
    defaultSavedList = false;
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
    analytics.track(shortlist.has(p._key) ? 'shortlist_add' : 'shortlist_remove');
    persistShortlist();
    refreshStars();
    if (state.saved) {
      update({ scroll: false });
      els.count.focus({ preventScroll: true });
    }
    announce(shortlist.has(p._key) ? `Saved ${p.title}.` : `Removed ${p.title} from saved papers.`);
  }

  function refreshStars() {
    for (const btn of document.querySelectorAll('.star[data-key]')) {
      btn.setAttribute('aria-pressed', String(shortlist.has(btn.dataset.key)));
      btn.title = shortlist.has(btn.dataset.key) ? 'Remove saved paper' : 'Save paper';
    }
    els.savedCount.textContent = fmtNum(savedPapers().length);
    if (state.saved) renderShortlistBar();
  }

  function starButton(p) {
    return h('button', {
      type: 'button', class: 'star', 'data-action': 'star', 'data-key': p._key,
      'aria-pressed': String(shortlist.has(p._key)), 'aria-label': `Save ${p.title}`, title: shortlist.has(p._key) ? 'Remove saved paper' : 'Save paper',
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
      const slot = presentationSlot(p);
      const description = [
        [p.track, p.presentation, p.mode && IMPLIED_MODE[p.presentation] !== p.mode ? `Attendance: ${p.mode}` : null].filter(Boolean).join(' · '),
        [p.session, p.topic].filter(Boolean).join(' — '),
        p.presenter ? `Presenter: ${p.presenter}` : null,
        `Paper ID: ${p.id}`,
        p.oralSlot ? `Individual oral time from Underline: ${p.underlineUrl}. Programme session: ${p.start}–${p.end} CET.` : null,
        p.poster ? `Schedule poster: ${p.poster.label}, board ${p.poster.board}, ${p.poster.date} ${p.poster.start}–${p.poster.end}, ${p.poster.room}.` : p.posterIssue,
        p.board ? `Demo board: ${p.board}.` : null,
        p.poster ? `Poster map: ${new URL(posterMapHref(p.poster), location.href).href}` : null,
        `Budapest local time. Unofficial schedule snapshot (updated ${updatedLabel}). Check ${PROGRAM_URL} for changes.`,
      ].filter(Boolean).join('\n');
      lines.push(
        'BEGIN:VEVENT',
        `UID:${p.id.replace(/[^A-Za-z0-9-]/g, '')}@emnlp2026-paper-finder`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${icsStamp(localToUtc(slot.date, slot.start).date)}`,
        `DTEND:${icsStamp(localToUtc(slot.date, slot.end).date)}`,
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
    analytics.track('calendar_export');
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    const skipped = list.length - events.length;
    announce(`Calendar file with ${plural(events.length, 'event', 'events')} downloaded${skipped ? `; ${skipped} without a confirmed time left out` : ''}.`);
  }

  /* ---------- URL state ---------- */

  function stateFromUrl() {
    const params = new URLSearchParams(location.search);
    const s = blankState();
    const shared = readSharedList(location.hash);
    if (shared) s.shared = { ...shared, hash: location.hash };
    const paper = text(params.get('paper'));
    if (paper && !shared) { s.paper = paper.slice(0, 64); s.view = 'programme'; return s; }
    s.author = shared ? null : authorKey((params.get('author') || '').slice(0, 512)) || null;
    s.q = (params.get('q') || '').slice(0, 200);
    s.saved = !!shared || params.get('saved') === '1';
    s.posterSession = posterSessions.has(params.get('poster')) || params.get('poster') === 'unconfirmed' ? params.get('poster') : null;
    for (const f of FACETS) {
      const raw = params.get(f.param);
      if (!raw) continue;
      const opt = facetOptions[f.key].find((o) => o.slug === raw);
      if (opt) s.filters[f.key] = opt.value;
    }
    const format = params.get('format');
    const requestedPosters = format === 'poster' || params.get('view') === 'posters' || s.posterSession;
    const requestedProgramme = format === 'all' || (format && format !== 'poster') || (!format && params.get('view') === 'programme');
    s.view = requestedProgramme ? 'programme' : requestedPosters ? 'posters' :
      s.author || s.saved || s.q.trim() || FACETS.some(f => params.has(f.param)) ? 'programme' : 'posters';
    if (s.view === 'posters') s.filters.format = null;
    s.day = initialDay(params.get('day'), dayOptions.map((d) => d.value),
      s.author || s.q.trim() || s.saved || s.posterSession ? null : zonedNow()?.date);
    if (s.view !== 'posters') s.posterSession = null;
    return s.author && s.q.trim() ? searchState(s, s.q) : s;
  }

  function urlFromState() {
    const params = new URLSearchParams();
    if (state.paper) {
      params.set('paper', state.paper);
    } else {
      params.set('format', state.view === 'posters' ? 'poster' : 'all');
      if (state.posterSession) params.set('poster', state.posterSession);
      if (state.author) params.set('author', state.author);
      if (state.q.trim()) params.set('q', state.q.trim());
      // Keep an explicit choice of All days when the page is reopened during the conference.
      if (!state.author || state.day !== 'all') params.set('day', state.day);
      for (const f of FACETS) {
        const opt = facetOptions[f.key].find((o) => o.value === state.filters[f.key]);
        if (opt) params.set(f.param, opt.slug);
      }
      if (state.saved) params.set('saved', '1');
    }
    const qs = params.toString();
    return location.pathname + (qs ? `?${qs}` : '') + (state.shared?.hash || '');
  }

  // Discrete changes push a history entry; consecutive keystrokes share one.
  function commit(kind, opts = {}) {
    if (!loaded) return; // Typing before the data arrives is picked up by init().
    const url = urlFromState();
    if (url !== location.pathname + location.search + location.hash) {
      if (kind === 'filter') analytics.track('filter');
      if (kind === 'typing' && lastNav === 'typing') history.replaceState(null, '', url);
      else history.pushState(null, '', url);
    }
    lastNav = kind;
    hydratedUrl = location.href;
    update({ typing: kind === 'typing', ...opts });
  }

  function resetAll() {
    analytics.cancelSearch();
    clearTimeout(typingTimer);
    Object.assign(state, blankState());
    syncControls();
    commit('filter');
  }

  function authorHref(name) {
    return `${location.pathname}?${new URLSearchParams({ author: authorKey(name) })}`;
  }

  function selectArea(value) {
    state.filters.area = value;
    state.paper = null;
    syncControls();
    commit('filter', { scroll: false });
  }

  function openAuthor(name) {
    analytics.cancelSearch();
    clearTimeout(typingTimer);
    Object.assign(state, blankState(), { author: authorKey(name), view: 'programme' });
    syncControls();
    commit('nav', { scroll: false });
    els.authorProfile.scrollIntoView({ block: 'start' });
    $('#author-name').focus({ preventScroll: true });
  }

  function openPaper(id) {
    analytics.cancelSearch();
    clearTimeout(typingTimer);
    Object.assign(state, blankState(), { paper: id, view: 'programme' });
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
          label: v === NONE ? f.noneLabel || 'Not listed' : (f.labels && f.labels[v]) || v,
        }));
    });
  }

  function buildDays() {
    const dates = [...new Set(papers.map((p) => p._day).filter((d) => d && d !== 'undated'))].sort();
    const today = (zonedNow() || {}).date;
    dayOptions = [{ value: 'all', label: 'All days' }, ...dates.map((date) => ({
      value: date, label: `${dateInfo(date).short}${date === today ? ' · Today' : ''}`,
    }))];
    if (papers.some((p) => p._day === 'undated')) dayOptions.push({ value: 'undated', label: 'No date' });
    els.day.replaceChildren();
    els.daySelect.replaceChildren();
    for (const d of dayOptions) {
      d.buttonEl = h('button', { type: 'button', class: 'day-nav__button', 'data-day': d.value, 'aria-pressed': 'false' }, d.label);
      els.day.append(d.buttonEl);
      els.daySelect.append(h('option', { value: d.value, title: d.label }, d.label.replace(' · Today', '')));
    }
    els.nowBtn.hidden = !dates.includes(today);
  }

  function buildFacets() {
    FACETS.forEach((f) => {
      const opts = facetOptions[f.key];
      const id = `facet-${f.key}`;
      const select = h('select', { class: 'select', id, 'data-facet': f.key, title: f.hint }, h('option', { value: '' }, f.all));
      for (const o of opts) {
        o.optionEl = h('option', { value: o.slug }, o.label);
        select.append(o.optionEl);
      }
      facetSelects[f.key] = select;
      if (f.key === 'area') {
        select.setAttribute('aria-describedby', 'atlas-credit');
        $('#area-picker-slot').replaceWith(h('div', { class: 'area-picker' },
          h('label', { for: id }, f.label), select));
        return;
      }
      const field = h('div', { class: f.key === 'format' ? 'format-picker' : 'facet' },
        h('label', { class: f.key === 'format' ? 'visually-hidden' : 'facet__label', for: id }, f.label), select);
      if (f.key === 'format') $('#format-picker-slot').replaceWith(field);
      else els.facets.append(field);
    });
  }

  function syncControls() {
    if (els.q.value !== state.q) els.q.value = state.q;
    els.qClear.hidden = !els.q.value;
    for (const d of dayOptions) d.buttonEl.setAttribute('aria-pressed', String(d.value === state.day));
    els.daySelect.value = state.day;
    for (const f of FACETS) {
      const opt = facetOptions[f.key].find((o) => o.value === state.filters[f.key]);
      if (facetSelects[f.key]) facetSelects[f.key].value = f.key === 'format' && posterScope(state) ? 'poster' : opt ? opt.slug : '';
    }
    const active = FACETS.filter((f) => !['format', 'area'].includes(f.key) && state.filters[f.key] !== null).length;
    els.filtersCount.textContent = active;
    els.filtersCount.hidden = !active;
    els.filtersToggle.setAttribute('aria-label', active ? `Filters: ${active} active` : 'Filters');
    els.savedBtn.setAttribute('aria-pressed', String(state.saved && !state.shared));
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
    const ticket = ++renderTicket;
    const browsingPosters = posterBrowsing(state);
    const withinPosters = posterScope(state);
    const posterQuery = parsePosterQuery(state.q);
    terms = fold(posterQuery.text).split(/\s+/).filter(Boolean);
    const n = FACETS.length;
    const dayCounts = new Map();
    const counts = FACETS.map(() => new Map());
    const matched = [];
    const authorPapers = state.author ? authors.get(state.author) || new Set() : null;
    const savedSelection = state.shared ? new Set(state.shared.ids || []) : shortlist;
    for (const p of (state.q.trim() || state.author || state.saved || browsingPosters ? posterOrderedPapers : papers)) {
      if (authorPapers && !authorPapers.has(p)) continue;
      const day = withinPosters ? posterBrowseDay(p) : p._day;
      if (withinPosters && !day) continue;
      if (withinPosters && state.posterSession && (p.poster?.id || 'unconfirmed') !== state.posterSession) continue;
      let m = matchesPosterQuery(p, posterQuery.boards) ? 0 : 1;
      for (const t of terms) if (!p._hay.includes(t)) { m |= 1; break; }
      if (state.saved && !savedSelection.has(p._key)) m |= 2;
      if (state.day !== 'all' && day !== state.day) m |= 4;
      for (let j = 0; j < n; j++) {
        const sel = state.filters[FACETS[j].key];
        if (sel !== null && sel !== p._f[j]) m |= 8 << j;
      }
      if (m === 0) matched.push(p);
      if ((m & ~4) === 0) {
        dayCounts.set('all', (dayCounts.get('all') || 0) + 1);
        if (day) dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
      }
      for (let j = 0; j < n; j++) {
        if ((m & ~(8 << j)) === 0) counts[j].set(p._f[j], (counts[j].get(p._f[j]) || 0) + 1);
      }
    }
    const focus = state.paper ? byKey.get(state.paper) || null : null;
    results = state.paper ? (focus ? [focus] : []) : matched;

    renderDayCounts(dayCounts);
    renderFacetCounts(counts);
    renderSummary();
    renderAuthorProfile();
    renderBanner(focus);
    if (state.saved) renderShortlistBar(); else els.shortlistBar.hidden = true;
    const paint = () => {
      if (ticket !== renderTicket) return;
      renderList();
      // Typing keeps focus and scroll still. Layout reads here previously
      // doubled the time spent blocking the input after each search.
      if (scroll && !typing) scrollToResults(scroll === 'force');
      announce(state.paper ? (focus ? 'Showing shared paper.' : 'Paper not found.') : `${plural(results.length, 'paper', 'papers')} found.`, typing ? 800 : 150);
    };
    if (typing) {
      els.list.setAttribute('aria-busy', 'true');
      // Give input events a turn between matching and building the next page.
      setTimeout(paint, 0);
    } else paint();
  }

  function renderDayCounts(dayCounts) {
    for (const d of dayOptions) {
      const c = dayCounts.get(d.value) || 0;
      const label = `${d.label}: ${plural(c, 'paper', 'papers')}`;
      d.buttonEl.setAttribute('aria-label', label);
      d.buttonEl.title = label;
    }
  }

  function renderFacetCounts(counts) {
    FACETS.forEach((f, j) => {
      if (f.key === 'format') return;
      for (const o of facetOptions[f.key]) {
        const c = counts[j].get(o.value) || 0;
        o.optionEl.textContent = `${o.label} (${fmtNum(c)})`;
      }
    });
  }

  function renderSummary() {
    const total = state.author ? authors.get(state.author)?.size || 0 : papers.length;
    const browsingPosters = posterBrowsing(state);
    if (state.shared) {
      els.count.replaceChildren(h('span', { class: 'results__num' }, fmtNum(results.length)), results.length === 1 ? ' shared paper' : ' shared papers');
    } else if (browsingPosters && !state.posterSession) {
      els.count.textContent = 'Poster sessions';
    } else if (browsingPosters && state.posterSession !== 'unconfirmed') {
      els.count.textContent = posterSessions.get(state.posterSession)?.label.replace(/session\s+/i, '') || 'Posters';
    } else if (state.paper) {
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
    els.savedCount.textContent = fmtNum(savedPapers().length);
    els.browseLink.hidden = !browsingPosters || !state.posterSession;
    els.browseLink.textContent = 'All sessions';
    els.browseLink.href = '?format=poster&day=all';
    els.nowBtn.hidden = browsingPosters || !!state.q.trim() || !!state.author || !!state.saved || !!state.paper ||
      FACETS.some(f => state.filters[f.key] !== null) || !dayOptions.some(d => d.value === zonedNow()?.date);
    els.clearAll.hidden = !state.q.trim() && (browsingPosters || state.day === 'all') && !state.saved && !state.paper && !state.author &&
      FACETS.every((f) => state.filters[f.key] === null);
  }

  function renderAuthorProfile() {
    document.title = state.author ? `${state.author} · EMNLP 2026 Paper Finder` : PAGE_TITLE;
    els.authorProfile.hidden = !state.author;
    if (!state.author) return;
    const count = authors.get(state.author)?.size || 0;
    els.authorProfile.replaceChildren(
      h('div', { class: 'author-profile__heading' },
        h('p', { class: 'author-profile__label' }, 'Author'),
        h('h1', { id: 'author-name', tabindex: '-1' }, state.author),
        h('p', { class: 'author-profile__meta' }, `${plural(count, 'paper', 'papers')} in the conference programme`)),
      h('a', { class: 'btn btn--small', href: `${location.pathname}?view=programme&day=all`, 'data-programme': '' }, 'All conference papers'));
  }

  function renderBanner(focus) {
    if (!state.paper) { els.banner.hidden = true; return; }
    els.banner.replaceChildren(
      h('p', null, focus ? 'Shared presentation' : `No paper with ID “${state.paper}” is in this snapshot.`),
      h('button', { type: 'button', class: 'btn btn--small', onclick: resetAll }, 'Poster sessions'));
    els.banner.hidden = false;
  }

  function renderShortlistBar() {
    if (state.shared) { renderSharedListBar(); return; }
    const saved = savedPapers();
    const eligible = saved.filter(calendarEligible).length;
    els.shortlistBar.replaceChildren(...[
      h('p', null, `Saved in this browser only. ${saved.length ? `${plural(eligible, 'paper has', 'papers have')} a confirmed time for your calendar.` : ''}`),
      saved.length ? shareListControl([...shortlist]) : null,
      eligible ? h('button', { type: 'button', class: 'btn btn--small btn--ink', onclick: () => downloadIcs(saved, 'emnlp2026-shortlist.ics') },
        icon('cal'), 'Download .ics') : null,
      saved.length ? h('button', {
        type: 'button', class: 'btn btn--small',
        onclick: () => {
          if (!window.confirm(`Remove all ${saved.length} papers from your shortlist?`)) return;
          analytics.track('shortlist_remove');
          shortlist.clear();
          persistShortlist();
          refreshStars();
          update({ scroll: false });
        },
      }, 'Clear shortlist') : null].filter(Boolean));
    els.shortlistBar.hidden = false;
  }

  function shareListControl(ids) {
    const body = h('div', { class: 'saved-share__body' });
    const disclosure = h('details', { class: 'saved-share' }, h('summary', null, 'Share list'), body);
    disclosure.addEventListener('toggle', () => {
      if (!disclosure.open || body.children.length || !disclosure.isConnected) return;
      let url;
      try { url = buildSavedListUrl(location.href, ids); }
      catch { body.append(h('p', { role: 'status' }, 'This saved list could not be turned into a link.')); return; }
      const field = h('input', { class: 'select saved-share__url', type: 'url', readonly: true, value: url, 'aria-label': 'Shared saved-list link' });
      const status = h('p', { class: 'saved-share__status', role: 'status' });
      const copy = h('button', { type: 'button', class: 'btn btn--small', onclick: async () => {
        try {
          await navigator.clipboard.writeText(url);
          copy.textContent = 'Copied';
          status.textContent = 'Link copied. Open it on your other device.';
        } catch {
          field.focus(); field.select();
          status.textContent = 'Select and copy the link above.';
        }
      } }, 'Copy link');
      const actions = h('div', { class: 'saved-share__actions' }, copy);
      if (typeof navigator.share === 'function') actions.append(h('button', {
        type: 'button', class: 'btn btn--small', onclick: async () => {
          try { await navigator.share({ title: 'EMNLP 2026 saved papers', url }); }
          catch (error) { if (error?.name !== 'AbortError') status.textContent = 'Use Copy link to share this list.'; }
        },
      }, 'Share…'));
      body.append(field, actions,
        h('p', null, 'A snapshot of this list. Open the link on your phone, then choose Save on this device.'), status);
    });
    return disclosure;
  }

  function renderSharedListBar() {
    const shared = state.shared;
    if (shared.error) {
      els.shortlistBar.replaceChildren(h('p', { role: 'alert' }, `This shared list could not be opened. ${shared.error}`),
        h('button', { type: 'button', class: 'btn btn--small', onclick: resetAll }, 'Back to papers'));
    } else {
      const missing = shared.ids.filter(id => !byKey.has(id)).length;
      const alreadySaved = !defaultSavedList && shared.ids.every(id => shortlist.has(id));
      const message = alreadySaved ? 'These papers are saved on this device.' : 'Save this shared list on your device to use its stars on the map. Existing picks are kept.';
      els.shortlistBar.replaceChildren(...[h('p', null, message),
        h('button', { type: 'button', class: 'btn btn--small btn--ink', disabled: alreadySaved, onclick: () => {
          const updated = addSavedPapers(shared.ids);
          if (updated === null) {
            const error = h('p', { role: 'status' }, 'Could not save this list in this browser.');
            els.shortlistBar.append(error);
            return;
          }
          shortlist = updated; defaultSavedList = false;
          if (shared.ids.length) analytics.track('shortlist_add');
          Object.assign(state, blankState(), { saved: true, view: 'programme' });
          syncControls();
          commit('nav', { scroll: false });
          announce('Shared papers saved on this device.', 50);
        } }, alreadySaved ? 'Already saved' : 'Save on this device'),
        h('button', { type: 'button', class: 'btn btn--small', onclick: () => {
          Object.assign(state, blankState(), { saved: true, view: 'programme' });
          syncControls(); commit('nav', { scroll: false });
        } }, 'My saved papers'),
        shared.ids.length ? shareListControl(shared.ids) : null,
        missing ? h('p', { class: 'shared-list__missing' }, `${plural(missing, 'paper is', 'papers are')} not in this programme snapshot.`) : null].filter(Boolean));
    }
    els.shortlistBar.hidden = false;
  }

  /* ---------- Programme list ---------- */

  function openPoster(id) {
    analytics.cancelSearch();
    clearTimeout(typingTimer);
    Object.assign(state, blankState(), { posterSession: id });
    syncControls();
    commit('filter', { scroll: false });
    els.count.focus({ preventScroll: true });
  }

  function renderPosterHome() {
    const grid = h('div', { class: 'poster-sessions' });
    const now = zonedNow();
    let previousDay = null;
    for (const [id, group] of posterGroups(results)) {
      const slot = group.slot;
      const date = slot?.date || 'unconfirmed';
      if (date !== previousDay) {
        grid.append(h('h3', { class: 'poster-sessions__day' }, slot ? dateInfo(date).short : 'Other posters'));
        previousDay = date;
      }
      const href = `?${new URLSearchParams({ poster: id })}`;
      const card = h('article', { class: 'poster-session' });
      const name = slot?.label || 'Board unconfirmed';
      const heading = h('h4', null, h('a', { href, 'data-poster': id }, name));
      const running = slot && now && slot.date === now.date && slot.start <= now.time && now.time < slot.end;
      if (running) heading.append(h('span', { class: 'flag flag--accent' }, 'Now'));
      card.append(heading,
        h('p', { class: 'poster-session__time' }, slot ? `${slot.start}–${slot.end} CET · ${slot.room}` : 'Poster entries without a confirmed board'),
        h('p', { class: 'poster-session__links' },
          h('a', { href, 'data-poster': id }, `Browse ${plural(group.papers.length, 'paper', 'papers')} →`),
          slot ? newTab(`poster-map/#${new URLSearchParams({ session: id })}`, 'Open map ↗', ` for ${name} (opens in a new tab)`) : null));
      grid.append(card);
    }
    if (!grid.children.length) {
      grid.append(h('div', { class: 'state' }, h('h3', null, 'No poster sessions match'),
        h('p', null, 'Choose another day or clear the filters.'),
        h('button', { type: 'button', class: 'btn', onclick: resetAll }, 'All poster sessions')));
    }
    els.list.append(grid);
  }

  // Only this page is materialized. Search never expands every programme group.
  function renderPaperPage(host, items, requestedPage = 0) {
    const page = resultPage(items, requestedPage);
    const list = h('ul', { class: 'papers' });
    const now = zonedNow();
    for (const paper of page.items) list.append(paperRow(paper, now));
    const fragment = document.createDocumentFragment();
    fragment.append(list);
    if (page.pages > 1) {
      const navigate = next => {
        renderPaperPage(host, items, next);
        (host.closest('.session') || els.results).scrollIntoView({ block: 'start' });
        host.querySelector('.paper__title')?.focus({ preventScroll: true });
        announce(`Papers ${next * RESULT_PAGE_SIZE + 1}–${Math.min(items.length, (next + 1) * RESULT_PAGE_SIZE)} of ${fmtNum(items.length)}.`, 50);
      };
      fragment.append(h('nav', { class: 'pagination', 'aria-label': 'Paper results pages' },
        h('p', null, `${fmtNum(page.start + 1)}–${fmtNum(page.start + page.items.length)} of ${fmtNum(items.length)}`),
        h('button', { type: 'button', class: 'btn btn--small', disabled: page.page === 0, onclick: () => navigate(page.page - 1) }, '← Previous'),
        h('button', { type: 'button', class: 'btn btn--small', disabled: page.page + 1 === page.pages, onclick: () => navigate(page.page + 1) }, 'Next →')));
    }
    host.replaceChildren(fragment);
  }

  function renderList() {
    els.list.removeAttribute('aria-busy');
    els.list.replaceChildren();
    sessions.clear();
    if (posterBrowsing(state) && !state.posterSession) {
      renderPosterHome();
      return;
    }
    if (!results.length) {
      els.list.append(emptyState());
      return;
    }
    const flat = posterBrowsing(state) || state.q.trim() || state.author || state.saved || state.paper || FACETS.some(f => state.filters[f.key] !== null);
    if (flat) {
      renderPaperPage(els.list, results);
      return;
    }
    for (const p of results) {
      const key = sessionKey(p);
      if (!sessions.has(key)) sessions.set(key, { papers: [] });
      sessions.get(key).papers.push(p);
    }
    let first = true;
    let opened = false;
    for (const [key, group] of sessions) {
      const open = !opened && (sessionOpen.get(key) ?? first);
      opened ||= open;
      first = false;
      const p = group.papers[0];
      const title = h('h3', { class: 'session__title' });
      if (p._inactive) title.append(STATUS_LABELS[p.status]);
      else {
        title.append(h('span', { class: 'session__topic' }, p.topic || 'Topic not listed'),
          h('span', { class: 'session__room' }, p.room || 'Room not listed'),
          h('span', { class: 'session__date' }, p.date ? dateInfo(p.date).short : 'No date listed'),
          h('span', { class: 'session__time' }, p._timed ? timeRange(p) : 'Time not confirmed'));
        if (p._timed) {
          const zone = zoneLabel(p.date, p.start);
          title.append(h('abbr', { class: 'session__zone', title: zone.title }, zone.abbr));
        }
      }
      const summary = h('summary', { class: 'session__header' }, title,
        h('span', { class: 'session__count' }, plural(group.papers.length, 'paper', 'papers')));
      group.list = h('div');
      group.details = h('details', { class: 'session', open }, summary, group.list);
      let observedOpen = open;
      group.details.addEventListener('toggle', () => {
        if (!group.details.isConnected) return;
        if (group.details.open !== observedOpen) {
          sessionOpen.set(key, group.details.open);
          observedOpen = group.details.open;
        }
        if (group.details.open) {
          for (const other of sessions.values()) if (other !== group) { other.details.open = false; other.list.replaceChildren(); }
          if (!group.list.children.length) renderPaperPage(group.list, group.papers);
        } else group.list.replaceChildren();
      });
      if (open) renderPaperPage(group.list, group.papers);
      els.list.append(group.details);
    }
  }

  function paperRow(p, now) {
    const li = h('li', { class: `paper${p._inactive ? ' is-inactive' : ''}` });
    const where = h('div', { class: 'paper__where' });
    const poster = !p._inactive && p.poster;
    const slot = poster || presentationSlot(p);
    if (p._inactive) where.append(h('span', { class: 'is-missing' }, STATUS_LABELS[p.status]));
    else {
      if (poster) where.append(newTab(posterMapHref(poster), `Board ${poster.board} ↗`,
        ` for ${poster.label}. Locate this poster on the map (opens in a new tab)`, 'paper__board'));
      else if (p.board) where.append(h('span', { class: 'paper__board' }, `Board ${p.board}`));
      else if (p.presentation === 'Poster' || p.posterIssue) where.append(h('span', { class: 'paper__board-warning' }, p.posterClaimedBoard ? `Board ${p.posterClaimedBoard} · location unconfirmed` : 'Board unconfirmed'));
      const label = poster ? poster.label.replace(/session\s+/i, '') : p.presentation && !STATUS_LIKE.has(p.presentation) ? p.presentation : null;
      if (label) where.append(h('span', { class: 'paper__slot-type' }, label));
      if (slot.date) where.append(h('span', { class: 'paper__date' }, dateInfo(slot.date).short));
      if (poster || p._timed) {
        const zone = zoneLabel(slot.date, slot.start);
        where.append(h('span', { class: 'paper__time' }, !poster && p.presentation === 'Oral' && !p.oralSlot ? 'Session ' : '', timeRange(slot), h('abbr', { title: zone.title }, ` ${zone.abbr}`)));
      } else where.append(h('span', { class: 'is-missing' }, 'Time unconfirmed'));
      if (slot.room) where.append(h('span', { class: 'paper__room' }, slot.room));
      if ((poster || p._timed) && now && slot.date === now.date && slot.start <= now.time && now.time < slot.end) where.append(h('span', { class: 'flag flag--accent' }, 'Now'));
      if (poster && p.oralSlot) where.append(h('span', { class: 'paper__time' }, `Oral: ${dateInfo(p.date).short} · ${timeRange(p.oralSlot)} CET · ${p.room}`));
      if (p.oralSlotNote) where.append(h('span', { class: 'flag' }, 'Talk time unconfirmed'));
    }

    const body = h('div', { class: 'paper__body' });
    const title = h('h4', { class: 'paper__title', tabindex: '-1' });
    const titleText = h('span');
    renderTitle(titleText, p.title || 'Untitled entry', (node, value) => highlightInto(node, value, terms));
    title.append(poster ? h('a', {
      href: posterMapHref(poster),
      'aria-label': `${p.title}. Open board ${poster.board}, ${poster.label}, on the poster map`,
    }, titleText) : p.id ? h('a', {
      href: permalinkHref(p.id), 'data-permalink': p.id,
      'aria-label': `Presentation details for ${p.title}`,
    }, titleText) : titleText);
    body.append(title, ...peopleLines(p, 'paper__people', terms));

    const meta = h('div', { class: 'paper__meta' });
    const area = h('button', { type: 'button', class: 'atlas-area',
      title: p.atlas ? 'Filter by this inferred area' : 'Show papers without an area classification',
      'aria-label': p.atlas ? `Filter by Atlas area: ${p.atlas.areaLabel}` : 'Show papers not classified in Atlas',
      onclick: () => selectArea(p.atlas?.areaLabel || NONE) });
    if (p.atlas) area.append(h('span', { class: 'atlas-swatch', 'aria-hidden': 'true', style: `background-color:${p.atlas.color}` }));
    area.append(p.atlas?.areaLabel || 'Not classified in Atlas');
    meta.append(area);
    if (p.anthologyUrl) meta.append(newTab(p.anthologyUrl, 'ACL Anthology ↗', ' for this paper (opens in a new tab)'));
    if (p.underlineUrl) meta.append(newTab(p.underlineUrl, 'Underline ↗', ' for this paper (opens in a new tab)'));
    if (p.id) meta.append(h('a', { href: permalinkHref(p.id), 'data-permalink': p.id, 'aria-label': `Share presentation details for ${p.title}` }, 'Share'));
    if (calendarEligible(p) && !(poster && posterSlotDiffers(p, poster))) meta.append(h('button', {
      type: 'button', class: 'linkish', 'data-action': 'ics', 'data-key': p._key,
      'aria-label': `Add programme presentation for ${p.title} to calendar (.ics file)`,
    }, 'Calendar'));

    const detailsBody = h('div', { class: 'paper__details-body' });
    if (p.track || p.topic) detailsBody.append(h('p', null, [p.track, p.topic].filter(Boolean).join(' · ')));
    if (p.atlas?.source === 'atlas') {
      const fine = h('p');
      fine.append(h('strong', null, 'Atlas topic: '));
      const label = h('span'); highlightInto(label, p.atlas.label, terms); fine.append(label);
      detailsBody.append(fine, h('p', null, p.atlas.description));
    }
    if (p.atlasAreaBasis === 'title') detailsBody.append(h('p', null, 'Area based on the title only.'));
    if (p.oralSlot) detailsBody.append(h('p', null, `Individual oral time from Underline. Full session: ${timeRange(p)} CET.`));
    if (p.oralSlotNote) detailsBody.append(h('p', { class: 'note' }, p.oralSlotNote));
    if (poster && posterSlotDiffers(p, poster)) {
      detailsBody.append(h('p', null, 'The schedule poster slot is shown above. ',
        p._inactive ? '' : `Programme entry: ${[p.presentation, p.date ? dateInfo(p.date).short : null, p._timed ? timeRange(presentationSlot(p)) : 'Time unconfirmed', p.room, p.mode].filter(Boolean).join(' · ')}.`));
      if (calendarEligible(p)) detailsBody.append(h('button', { type: 'button', class: 'linkish', 'data-action': 'ics', 'data-key': p._key }, 'Calendar for programme entry'));
    }
    if (p.posterIssue) detailsBody.append(h('p', { class: 'note' }, p.posterIssue));
    if (p.mode && IMPLIED_MODE[p.presentation] !== p.mode && !STATUS_LIKE.has(p.mode)) detailsBody.append(h('p', null, `Presenter attendance: ${p.mode}.`));
    const note = scheduleNote(p);
    if (note) detailsBody.append(note);
    if (detailsBody.children.length) meta.append(h('details', { class: 'paper__details' }, h('summary', null, 'Details'), detailsBody));
    body.append(meta);
    if (state.saved && !state.shared && defaultSavedList && p._key === DEFAULT_SAVED_PAPER_ID) {
      body.append(h('p', { class: 'paper__default-save' }, 'Saved by default. Unstar to remove.'));
    }
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
    if (state.author && !authors.has(state.author)) {
      return box('Author not found', `No papers are listed under “${state.author}” in the available author metadata.`, [
        h('button', { type: 'button', class: 'btn btn--ink', onclick: resetAll }, 'Show all conference papers'),
      ]);
    }
    if (state.shared) {
      if (!state.shared.error && state.shared.ids.length === 0) return box('This shared list is empty', 'Open My saved papers to see the papers saved on this device.', []);
      return box(state.shared.error ? 'Invalid shared list' : 'No shared papers match',
        state.shared.error ? 'Check that you copied the complete link.' : 'Try clearing the filters. Some papers may be missing from this programme snapshot.', []);
    }
    if (state.saved && savedPapers().length === 0) {
      return box('Your shortlist is empty', 'Tap the star next to any paper to keep it here. The shortlist stays in this browser only.', [
        h('button', { type: 'button', class: 'btn btn--ink', onclick: () => { state.saved = false; syncControls(); commit('filter'); } }, state.author ? 'Browse this author’s papers' : 'Browse all papers'),
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

  /* ---------- Authors and presenters ---------- */

  function peopleLines(p, className, searchTerms = []) {
    const lines = [];
    const presenters = presenterAuthorIndices(p.authors, p.presenter);
    if (p.authors.length) {
      const authors = h('p', { class: className }, h('span', { class: 'visually-hidden' }, 'Authors: '));
      p.authors.forEach((author, i) => {
        if (i) authors.append(' · ');
        const isPresenter = presenters.includes(i);
        const name = h('a', { class: 'author-link', href: authorHref(author), 'data-author': authorKey(author),
          'aria-label': `All conference papers by ${author}` });
        highlightInto(name, author, searchTerms);
        authors.append(isPresenter ? h('strong', null, name) : name);
        if (isPresenter) authors.append(h('span', { class: 'visually-hidden' }, ' (presenter)'));
      });
      lines.push(authors);
    }
    if (!presenters.length) {
      const presenter = h('p', { class: className }, h('span', { class: 'paper__label' }, 'Presenter'));
      const name = h(p.presenter ? 'strong' : 'span', { class: p.presenter ? null : 'is-missing' });
      highlightInto(name, p.presenter || 'not listed', searchTerms);
      presenter.append(name);
      if (p.presenterNote) presenter.append(h('span', { class: 'paper__aside' }, ` (${p.presenterNote.replace(/\.$/, '')})`));
      lines.push(presenter);
    }
    return lines;
  }

  /* ---------- Interaction ---------- */

  function applySearch(kind = 'typing') {
    if (!loaded) searchBeforeLoad = true;
    Object.assign(state, searchState(state, els.q.value));
    syncControls();
    commit(kind);
  }

  function handleAction(e) {
    const poster = e.target.closest('a[data-poster]');
    if (poster && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      openPoster(poster.dataset.poster);
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (btn) {
      const p = byKey.get(btn.dataset.key);
      if (!p) return;
      if (btn.dataset.action === 'star') toggleSaved(p);
      else if (btn.dataset.action === 'ics') downloadIcs([p], `emnlp2026-${p.id.replace(/[^A-Za-z0-9-]/g, '')}.ics`);
      return;
    }
    const author = e.target.closest('a[data-author]');
    if (author && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      openAuthor(author.dataset.author);
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
    const idx = results.findIndex((p) => p._timed && p.date === now.date && (presentationSlot(p).end || p.start) > now.time);
    if (idx === -1) {
      scrollToResults(true);
      announce('No more sessions with a confirmed time today match your filters.', 50);
      return;
    }
    const group = sessions.get(sessionKey(results[idx]));
    group.details.open = true;
    if (!group.list.children.length) renderPaperPage(group.list, group.papers);
    group.details.scrollIntoView({ block: 'start' });
    group.details.querySelector('summary').focus({ preventScroll: true });
  }

  function bindEvents() {
    els.form.addEventListener('submit', (e) => {
      e.preventDefault();
      clearTimeout(typingTimer);
      analytics.search(els.q.value, { submit: true });
      applySearch();
      if (window.matchMedia('(max-width: 639px)').matches) els.q.blur();
    });
    els.q.addEventListener('input', () => {
      ++renderTicket;
      analytics.search(els.q.value);
      if (!loaded) searchBeforeLoad = true;
      els.qClear.hidden = !els.q.value;
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        applySearch();
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
      analytics.cancelSearch();
      els.q.value = '';
      clearTimeout(typingTimer);
      applySearch('filter');
      els.q.focus();
    });

    els.day.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-day]');
      if (!button || !els.day.contains(button)) return;
      state.day = button.dataset.day;
      state.posterSession = null;
      state.paper = null;
      syncControls();
      commit('filter');
    });

    els.daySelect.addEventListener('change', () => {
      state.day = els.daySelect.value;
      state.posterSession = null;
      state.paper = null;
      syncControls();
      commit('filter');
    });

    els.filtersToggle.addEventListener('click', () => {
      const open = els.filtersToggle.getAttribute('aria-expanded') !== 'true';
      els.filtersToggle.setAttribute('aria-expanded', String(open));
      els.facets.classList.toggle('is-expanded', open);
    });

    els.facets.addEventListener('change', (e) => {
      const t = e.target;
      const key = t.dataset.facet;
      if (!key) return;
      const opt = facetOptions[key].find((o) => o.slug === t.value);
      state.filters[key] = opt ? opt.value : null;
      state.paper = null;
      syncControls();
      commit('filter', { scroll: !els.facets.classList.contains('is-expanded') });
    });

    $('.presentation-controls').addEventListener('change', e => {
      if (e.target.dataset.facet === 'area') {
        const opt = facetOptions.area.find(o => o.slug === e.target.value);
        selectArea(opt ? opt.value : null);
        return;
      }
      if (e.target.dataset.facet !== 'format') return;
      analytics.cancelSearch();
      clearTimeout(typingTimer);
      const opt = facetOptions.format.find(o => o.slug === facetSelects.format.value);
      state.view = opt?.value === 'Poster' ? 'posters' : 'programme';
      state.filters.format = opt?.value === 'Poster' ? null : opt?.value ?? null;
      state.posterSession = null;
      state.paper = null;
      syncControls();
      commit('filter', { scroll: false });
    });

    els.savedBtn.addEventListener('click', () => {
      const openSaved = !!state.shared || !state.saved;
      Object.assign(state, blankState(), { saved: openSaved, view: openSaved ? 'programme' : 'posters' });
      if (state.saved) analytics.track('shortlist_view');
      state.paper = null;
      syncControls();
      commit('filter');
    });
    els.clearAll.addEventListener('click', () => { resetAll(); els.q.focus({ preventScroll: true }); });
    els.nowBtn.addEventListener('click', jumpToNow);
    els.browseLink.addEventListener('click', e => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      analytics.cancelSearch();
      clearTimeout(typingTimer);
      Object.assign(state, blankState(), { view: posterBrowsing(state) && !state.posterSession ? 'programme' : 'posters' });
      syncControls();
      commit('filter', { scroll: false });
    });

    els.list.addEventListener('click', handleAction);
    // Delegation also observes modified link clicks without changing navigation.
    const trackLink = (e) => {
      if (e.type === 'auxclick' && e.button !== 1) return;
      const link = e.target.closest('a');
      if (!link) return;
      if (link.hasAttribute('data-contact-link')) analytics.track('contact_click');
      else if (link.hasAttribute('data-author')) analytics.track('author_open');
      else if (link.hasAttribute('data-permalink')) analytics.track('paper_open');
      else if (link.hostname === 'aclanthology.org') analytics.track('anthology_open');
      else if (link.hostname === 'underline.io') analytics.track('underline_open');
    };
    document.addEventListener('click', trackLink);
    document.addEventListener('auxclick', trackLink);
    els.authorProfile.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-programme]');
      if (!link || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      Object.assign(state, blankState(), { view: 'programme' });
      syncControls();
      commit('nav');
      els.count.focus({ preventScroll: true });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      e.preventDefault();
      els.q.focus();
      els.q.select();
    });

    document.querySelector('.skip-link').addEventListener('click', e => {
      if (!state.shared && !readSharedList(location.hash)) return;
      e.preventDefault();
      els.results.scrollIntoView({ block: 'start' });
      els.results.focus({ preventScroll: true });
    });

    const restoreLocation = () => {
      analytics.cancelSearch();
      if (!loaded || hydratedUrl === location.href) return;
      clearTimeout(typingTimer);
      Object.assign(state, stateFromUrl());
      hydratedUrl = location.href;
      syncControls();
      lastNav = null;
      update({ scroll: false });
    };
    window.addEventListener('popstate', restoreLocation);
    window.addEventListener('hashchange', () => {
      if (!loaded) return;
      if (!readSharedList(location.hash) && !state.shared) return;
      restoreLocation();
    });

    window.addEventListener('storage', (e) => {
      if (e.key !== STORAGE_KEY && e.key !== null) return;
      shortlist = readSavedPapers();
      defaultSavedList = isDefaultSavedList();
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
    atlas = json.atlas;
    const zone = text(conference.timezone);
    if (zone) {
      try { new Intl.DateTimeFormat('en', { timeZone: zone }); tz = zone; } catch { tz = DEFAULT_TZ; }
    }
    sourceUrl = safeSourceUrl(conference.sourceUrl) || safeSourceUrl(FALLBACK_SOURCE);

    posterSessions = new Map((json.posterSessions || []).map(slot => [slot.id, slot]));
    papers = json.papers.map(normalize).filter(Boolean).sort(compare);
    posterOrderedPapers = [...papers].sort(comparePosterFirst);
    byKey = new Map(papers.map((p) => [p._key, p]));
    authors = indexAuthors(papers);

    applyMeta();
    buildOptions();
    buildDays();
    buildFacets();

    const typedEarly = els.q.value;
    Object.assign(state, stateFromUrl());
    const hasEarlySearch = searchBeforeLoad || (!state.q && !state.paper && typedEarly.trim());
    if (hasEarlySearch) {
      clearTimeout(typingTimer);
      Object.assign(state, searchState(state, typedEarly));
    }
    searchBeforeLoad = false;
    syncControls();
    loaded = true;
    hydratedUrl = location.href;
    if (hasEarlySearch) commit('typing', { scroll: false });
    else update({ scroll: false });
  }

  function showError(err) {
    els.list.removeAttribute('aria-busy');
    els.count.textContent = 'Schedule unavailable';
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
