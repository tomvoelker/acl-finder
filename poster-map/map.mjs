import {MAP, BANKS, BOARDS, BOARD_BY_NUMBER, MARKERS, LABELS} from './layout.mjs';
import {validateCatalog, sessionGroups, mapEntries, assignmentAt, savedAssignments, savedPosterStops, nextSavedPoster, defaultSession, authorsText, boardHash, searchText} from './catalog.mjs';
import {SAVED_PAPERS_KEY, readSavedPapers, setSavedPaper} from '../saved-papers.mjs';
import {createAnalytics} from '../analytics.mjs';
import {renderTitle, titleSearchText} from '../math-titles.mjs';
import {fitView, constrainView, zoomAt, pinchAt, panBy, resizeView} from './camera.mjs';
import {validateTopics, topicForEntry, topicGroups, topicEntries} from './topics.mjs';

const $ = selector => document.querySelector(selector);
const svg = $('#floor-map');
const stage = $('#map-stage');
const analytics = createAnalytics();
let selected = null, sessions = [], assignments = [], activeSession = '', catalogReady = false;
let catalog = null;
let finderUnavailable = false;
let topics = null, topicsEnabled = false, selectedTopic = null, topicSession = '';
const papers = new Map();
let savedPapers = readSavedPapers(), savedBoards = new Map(), savedStops = [];
let viewport = {width: stage.clientWidth, height: stage.clientHeight};
let view = fitView(MAP, viewport);
// Start with legible positions on a phone. Fit remains available for the overview.
if (viewport.width <= 640) view = zoomAt(view, 1/3, {x:0.5,y:0.5}, MAP, viewport);
const elements = new Map();

function node(tag, attrs = {}, text) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key,value] of Object.entries(attrs)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
}
function feedback(message) { $('#feedback').textContent = message; }
function applyView() {
  svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.width} ${view.height}`);
  const ratio = fitView(MAP, viewport).width / view.width;
  $('#zoom-level').textContent = `${Math.round(ratio * 100)}%`;
  const destinationRatio = fitView(MAP, viewport).width / (zoomTarget || view).width;
  $('#zoom-in').disabled = destinationRatio >= 8 - 0.001;
  $('#zoom-out').disabled = destinationRatio <= 1 + 0.001;
}
function transitionTo(target) {
  const start = {...view};
  stopMotion();
  if (reducedMotion.matches) {
    view = target; applyView(); return;
  }
  zoomTarget = target;
  const started = performance.now();
  const tick = now => {
    const time = Math.min(1, (now-started)/260);
    const eased = 1-Math.pow(1-time,3);
    // Interpolate scale logarithmically so each step feels even as it slows.
    const width = start.width * Math.pow(target.width/start.width,eased);
    const amount = Math.abs(target.width-start.width) < 0.001 ? eased : (width-start.width)/(target.width-start.width);
    view = {
      x:start.x+(target.x-start.x)*amount,
      y:start.y+(target.y-start.y)*amount,
      width, height:start.height+(target.height-start.height)*amount,
    };
    if (time === 1) { view = target; zoomTarget = null; zoomFrame = 0; }
    else zoomFrame = requestAnimationFrame(tick);
    applyView();
  };
  applyView();
  zoomFrame = requestAnimationFrame(tick);
}
function fitMap() { transitionTo(fitView(MAP, viewport)); }
function zoom(factor, anchor = {x:0.5,y:0.5}, animate = false) {
  const target = zoomAt(animate && zoomTarget ? zoomTarget : view, factor, anchor, MAP, viewport);
  if (animate) transitionTo(target);
  else { stopMotion(); view = target; applyView(); }
}
function openDetails({topic = false} = {}) {
  stopMotion();
  const panel = $('#details-panel');
  panel.classList.toggle('topic-list', topic);
  $('#details-title').textContent = topic ? topics.sessions[activeSession].groups.find(g => g.id === selectedTopic).label : 'Map details';
  if (!panel.open) panel.showModal();
  $('.panel-body').scrollTop = 0;
  if (topic) $('#details-title').focus({preventScroll:true});
}
function displayTitle(entry) { return papers.get(entry.paperId)?.title || entry.title; }
function displayAuthors(entry) { return papers.get(entry.paperId)?.authors?.join(', ') || authorsText(entry); }
function currentAssignment(number) { return assignmentAt(assignments, activeSession, number).entry; }
function conflictingEntries(number) { return assignmentAt(assignments, activeSession, number).conflicts; }
function currentSession() { return sessions.find(session => session.id === activeSession); }
function currentEntries() { return assignments.filter(entry => entry.session === activeSession); }
function currentTopic(entry) { return topicForEntry(topics, activeSession, entry); }
function renderTopicLegend() {
  if (topicSession !== activeSession) { selectedTopic = null; topicSession = activeSession; }
  const groups = topicGroups(topics, activeSession, currentEntries().filter(entry => currentAssignment(entry.board)));
  const available = groups.length > 0;
  const selectedGroup = topicsEnabled && groups.find(group => group.id === selectedTopic);
  $('#topic-browse').hidden = !selectedGroup;
  if (selectedGroup) $('#topic-browse').textContent = `Browse ${selectedGroup.count} posters`;
  $('#topics-toggle').disabled = !available;
  $('#topics-toggle').setAttribute('aria-pressed', String(topicsEnabled && available));
  $('#topic-legend').hidden = !topicsEnabled || !available;
  if (topics) $('#topics-note').textContent = available ? 'Inferred · not official tracks' : 'Topics unavailable for this session.';
  const legend = $('#topic-legend');
  legend.replaceChildren();
  if (!topicsEnabled || !available) return;
  for (const group of [{id:null, label:'All topics', count:groups.reduce((n,g) => n+g.count, 0)}, ...groups]) {
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'topic-key'; button.dataset.topic = group.id ?? 'all';
    button.setAttribute('aria-pressed', String(selectedTopic === group.id));
    if (group.color) {
      const swatch = document.createElement('span'); swatch.className = 'topic-swatch';
      swatch.style.backgroundColor = group.color; swatch.setAttribute('aria-hidden','true'); button.append(swatch);
    }
    const label = document.createElement('span'); label.textContent = group.label; button.append(label);
    const count = document.createElement('span'); count.className = 'topic-count'; count.textContent = group.count; button.append(count);
    button.addEventListener('click', () => {
      selectedTopic = group.id;
      refreshAssignments(); renderPaperResults();
      const activeKey = $('#topic-legend').querySelector(`[data-topic="${group.id ?? 'all'}"]`);
      activeKey?.focus({preventScroll:true});
      if (matchMedia('(max-width: 640px)').matches) activeKey?.scrollIntoView({block:'nearest', inline:'center'});
      $('#map-status').textContent = group.id === null ? 'Showing all topics.' : `Highlighted ${group.count} posters: ${group.label}. Other boards remain selectable.`;
    });
    legend.append(button);
  }
}
function topicLabel(entry) {
  const topic = topicsEnabled && currentTopic(entry);
  if (!topic) return null;
  const label = document.createElement('p'); label.className = 'paper-topic';
  const swatch = document.createElement('span'); swatch.className = 'topic-swatch';
  swatch.style.backgroundColor = topic.color; swatch.setAttribute('aria-hidden','true');
  label.append(swatch, document.createTextNode(`Inferred topic: ${topic.label}`));
  return label;
}
function updateHash() {
  history.replaceState(null, '', `${location.pathname}${location.search}${boardHash(activeSession, selected)}`);
}
function selectBoard(number, {reveal = false, focus = false, hash = true, keepZoom = false} = {}) {
  if (!BOARD_BY_NUMBER.has(number)) return;
  selected = number;
  const board = BOARD_BY_NUMBER.get(number);
  for (const [id,element] of elements) {
    element.classList.toggle('selected', id === selected);
    element.setAttribute('aria-pressed', String(id === selected));
    element.setAttribute('tabindex', id === selected ? '0' : '-1');
  }
  $('#board-number').value = number;
  $('#selection-title').textContent = `Board ${number}`;
  $('#selection-location').textContent = `Row ${board.row + 1} from the top · ${board.face === 0 ? 'Upper' : 'Lower'} position`;
  const notes = [];
  if (board.needsReview) notes.push('The source labels around 41–56 overlap. Confirm this position before relying on it.');
  if (board.yellow) notes.push('Highlighted yellow in the photograph. Its meaning has not been confirmed.');
  $('#selection-note').textContent = notes.join(' ');
  $('#selection-note').hidden = !notes.length;
  $('#selection-chip').hidden = false;
  $('#selection-chip').textContent = `Board ${number}${board.needsReview ? ' · Check source' : ''}`;
  $('#selection-chip').setAttribute('aria-label', `Selected board ${number}`);
  $('#map-status').textContent = `Selected board ${number}${board.needsReview ? '. Source numbering needs confirmation.' : '.'}`;
  renderAssignment();
  renderPaperResults();
  if (reveal) {
    stopMotion();
    const width = keepZoom ? view.width : Math.min(view.width, 430);
    const height = width * viewport.height / viewport.width;
    view = constrainView({x:board.x + MAP.faceWidth/2 - width/2, y:board.y + MAP.faceHeight/2 - height/2, width, height}, MAP, viewport);
    applyView();
  }
  if (focus) elements.get(number).focus({preventScroll:true});
  if (hash) updateHash();
}
function renderAssignment() {
  const entry = currentAssignment(selected);
  const detail = $('#selection-assignment');
  detail.replaceChildren();
  detail.hidden = selected === null;
  $('#paper-search').disabled = !catalogReady;
  if (selected === null) return;
  const sessionLabel = currentSession()?.shortLabel || 'Session unavailable';
  const conflicts = conflictingEntries(selected);
  $('#selection-title').textContent = `Board ${selected} · ${activeSession ? currentSession()?.shortLabel : 'Floor plan'}`;
  const title = document.createElement('strong');
  if (conflicts.length) title.textContent = 'Conflicting handbook entries';
  else if (entry) renderTitle(title, displayTitle(entry));
  else title.textContent = catalogReady ? 'No assignment listed in handbook for this session' : 'Handbook assignments unavailable';
  detail.append(title);
  for (const conflict of conflicts) {
    const conflictTitle = document.createElement('p'); renderTitle(conflictTitle, conflict.title); detail.append(conflictTitle);
    const conflictSource = document.createElement('p');
    conflictSource.textContent = `${authorsText(conflict) ? `${authorsText(conflict)} · ` : ''}Handbook PDF page ${conflict.page}`; detail.append(conflictSource);
  }
  if (entry && displayAuthors(entry)) {
    const authors = document.createElement('p'); authors.textContent = displayAuthors(entry); detail.append(authors);
  }
  if (savedBoards.has(selected)) {
    const saved = document.createElement('p');
    saved.className = 'saved-paper-label'; saved.textContent = '★ Saved paper'; detail.append(saved);
  }
  const note = document.createElement('p');
  note.textContent = conflicts.length ? 'The handbook lists both papers at this board. Confirm the location with conference staff.' : entry ? `${sessionLabel} · Handbook PDF page ${entry.page}` : 'Board numbers are reused between sessions. Check the selected session.';
  detail.append(note);
  if (entry?.paperId && papers.has(entry.paperId)) {
    const link = document.createElement('a');
    link.href = `../?paper=${encodeURIComponent(entry.paperId)}`;
    link.className = 'paper-link'; link.textContent = 'View paper in finder'; detail.append(link);
  }
  const chip = $('#selection-chip');
  chip.replaceChildren();
  const label = document.createElement('p');
  label.className = 'selection-card-label';
  label.textContent = `${savedBoards.has(selected) ? 'Saved · ' : ''}${activeSession ? `${currentSession()?.shortLabel} · ` : ''}Board ${selected}${BOARD_BY_NUMBER.get(selected).needsReview ? ' · Check source' : ''}`;
  const heading = document.createElement('div'); heading.className = 'selection-card-heading';
  heading.append(label);
  if (entry?.paperId) {
    const isSaved = savedPapers.has(entry.paperId);
    const save = document.createElement('button');
    save.type = 'button'; save.id = 'selection-save'; save.className = 'selection-save';
    save.setAttribute('aria-pressed', String(isSaved));
    save.setAttribute('aria-label', `${isSaved ? 'Unstar' : 'Star'} ${displayTitle(entry)}`);
    save.title = isSaved ? 'Remove saved paper' : 'Save paper';
    const star = node('svg', {viewBox:'0 0 24 24', 'aria-hidden':'true', focusable:'false'});
    star.append(node('path', {d:'M12 3.6l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.62 6.9 19.3l.98-5.68L3.75 9.6l5.7-.83z'}));
    save.append(star);
    save.addEventListener('click', () => {
      const updated = setSavedPaper(entry.paperId, !isSaved);
      if (updated === null) {
        const error = document.createElement('p'); error.className = 'selection-save-error';
        error.setAttribute('role','status'); error.textContent = 'Could not update saved papers in this browser.';
        chip.querySelector('.selection-save-error')?.remove(); chip.append(error);
        return;
      }
      savedPapers = updated;
      analytics.track(isSaved ? 'shortlist_remove' : 'shortlist_add');
      refreshAssignments(); renderPaperResults();
      $('#selection-save')?.focus({preventScroll:true});
      $('#map-status').textContent = `${isSaved ? 'Removed from' : 'Added to'} saved papers: ${displayTitle(entry)}.`;
    });
    heading.append(save);
  }
  chip.append(heading);
  const paperTitle = document.createElement('h2'); paperTitle.className = 'chip-title';
  if (entry) renderTitle(paperTitle, displayTitle(entry));
  else paperTitle.textContent = conflicts.length ? 'Conflicting handbook entries' : catalogReady ? 'No verified paper assignment' : 'Floor plan position';
  chip.append(paperTitle);
  const topic = topicLabel(entry);
  if (topic) { chip.append(topic); detail.append(topic.cloneNode(true)); }
  if (topicsEnabled && selectedTopic !== null) {
    const members = topicEntries(topics, activeSession, currentEntries(), selectedTopic);
    const index = members.findIndex(row => row.board === selected);
    const navigation = document.createElement('div'); navigation.className = 'topic-navigation';
    const position = document.createElement('span');
    position.textContent = index < 0 ? 'Outside highlighted topic' : `${index + 1} of ${members.length} in topic`;
    navigation.append(position);
    for (const [step, text] of [[-1,'← Previous'], [1,'Next →']]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
      button.id = step < 0 ? 'topic-previous' : 'topic-next';
      button.setAttribute('aria-label', step < 0 ? 'Previous poster in topic' : 'Next poster in topic');
      button.addEventListener('click', () => {
        const next = index < 0 ? (step < 0 ? members.length - 1 : 0) : (index + step + members.length) % members.length;
        selectBoard(members[next].board, {reveal:true});
        $(`#${button.id}`).focus({preventScroll:true});
      });
      navigation.append(button);
    }
    chip.append(navigation);
  }
  const session = currentSession();
  if (session) {
    const time = document.createElement('p'); time.className = 'selection-card-time';
    time.textContent = `${session.date} · ${session.start}–${session.end} Budapest time`;
    chip.append(time);
  }
  const actions = document.createElement('div'); actions.className = 'selection-card-actions';
  const details = document.createElement('button'); details.type = 'button'; details.textContent = 'Details';
  details.setAttribute('aria-haspopup','dialog'); details.setAttribute('aria-controls','details-panel');
  details.addEventListener('click', openDetails); actions.append(details);
  if (entry?.paperId && papers.has(entry.paperId)) {
    const link = document.createElement('a'); link.href = `../?paper=${encodeURIComponent(entry.paperId)}`;
    link.textContent = 'View paper'; actions.append(link);
  }
  chip.append(actions);
  chip.setAttribute('aria-label', `${sessionLabel}. Selected board ${selected}${savedBoards.has(selected) ? '. Saved paper' : ''}`);
}
function refreshAssignments() {
  renderTopicLegend();
  savedBoards = savedAssignments(assignments, activeSession, savedPapers);
  savedStops = savedPosterStops(assignments, sessions, savedPapers);
  for (const board of BOARDS) {
    const element = elements.get(board.number);
    const entry = currentAssignment(board.number);
    element.classList.toggle('has-paper', Boolean(entry));
    element.classList.toggle('is-saved', savedBoards.has(board.number));
    element.classList.toggle('has-conflict', conflictingEntries(board.number).length > 0);
    const topic = topicsEnabled ? currentTopic(entry) : null;
    element.classList.toggle('has-topic', Boolean(topic));
    element.classList.toggle('topic-dimmed', topicsEnabled && selectedTopic !== null && topic?.id !== selectedTopic);
    if (topic) element.style.setProperty('--topic-color', topic.color);
    else element.style.removeProperty('--topic-color');
    element.setAttribute('aria-label', `Board ${board.number}${activeSession ? `, Session ${activeSession}` : ''}${savedBoards.has(board.number) ? ', saved paper' : ''}${board.needsReview ? ', numbering needs confirmation' : ''}${entry ? `, ${displayTitle(entry)}` : conflictingEntries(board.number).length ? ', conflicting handbook entries' : ', no verified assignment listed'}`);
    element.querySelector('title').textContent = `Board ${board.number}${savedBoards.has(board.number) ? ' · Saved paper' : ''}${entry ? ': ' + displayTitle(entry) : conflictingEntries(board.number).length ? ': Conflicting handbook entries' : ''}`;
    if (topic) {
      element.setAttribute('aria-label', `${element.getAttribute('aria-label')}, inferred topic: ${topic.label}`);
      element.querySelector('title').textContent += ` · Inferred topic: ${topic.label}`;
    }
  }
  $('#saved-map-count').textContent = `${savedStops.length} saved ${savedStops.length === 1 ? 'poster' : 'posters'}`;
  $('#next-saved').disabled = savedStops.length === 0;
  $('#next-saved').title = savedStops.length ? 'Jump through saved posters across all sessions' : 'No saved papers have a confirmed poster board';
  $('#next-saved').setAttribute('aria-label', savedStops.length ? `Next saved poster. ${savedStops.length} across all poster sessions.` : 'No saved posters with confirmed boards');
  const session = currentSession();
  $('#assignment-count').textContent = session ? `${currentEntries().filter(entry => currentAssignment(entry.board)).length} verified handbook assignments · ${session.room || 'Room not listed'}` : 'Handbook assignments unavailable';
  $('#session-note').textContent = session ? `${session.label} · ${session.date} · ${session.start}–${session.end} Budapest time. Boards are reused each session.` : 'The complete floor plan remains available.';
  renderAssignment();
}
function renderPaperResults() {
  const results = $('#paper-results');
  results.replaceChildren();
  if (!catalogReady) return;
  const query = searchText(titleSearchText($('#paper-search').value)).trim();
  const topicFilter = topicsEnabled && selectedTopic !== null;
  $('.paper-search-panel label').textContent = topicFilter ? 'Search within the highlighted topic' : 'Find a paper in this session';
  if (!query && !topicFilter) return;
  const words = query.split(/\s+/);
  const entries = topicFilter ? topicEntries(topics, activeSession, currentEntries(), selectedTopic) : currentEntries();
  const matches = entries.filter(entry => (entry.verified === true || conflictingEntries(entry.board).length) && words.every(word => searchText(`${titleSearchText(displayTitle(entry))} ${displayAuthors(entry)} ${entry.paperId || ''}`).includes(word)));
  if (topicFilter) {
    const note = document.createElement('p');
    note.textContent = `${matches.length} posters · strongest matches first · inferred grouping`;
    results.append(note);
  }
  if (!matches.length) {
    const note = document.createElement('p');
    note.textContent = topicFilter ? 'No matching paper in this topic. Close this list and choose All topics to search the whole session.' : 'No matching handbook assignment in this session.'; results.append(note); return;
  }
  const limit = topicFilter ? matches.length : 20;
  for (const entry of matches.slice(0,limit)) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'paper-result';
    const title = document.createElement('span'); renderTitle(title, displayTitle(entry)); button.append(title);
    const meta = document.createElement('small');
    meta.textContent = `Board ${entry.board}${topicFilter && currentTopic(entry).margin < .02 ? ' · Loose fit' : ''}${savedBoards.has(entry.board) ? ' · ★ Saved' : ''}${conflictingEntries(entry.board).length ? ' · Conflicting entries' : ''}${displayAuthors(entry) ? ` · ${displayAuthors(entry)}` : ''}`;
    button.append(meta);
    button.addEventListener('click', () => {
      selectBoard(entry.board, {reveal:true});
      if ($('#details-panel').classList.contains('topic-list')) $('#details-panel').close();
      else $('.panel-body').scrollTop = 0;
    });
    results.append(button);
  }
  if (matches.length > limit) {
    const note = document.createElement('p'); note.textContent = `${matches.length} matches. Refine your search to see more.`; results.append(note);
  }
}

function drawMap() {
  svg.setAttribute('viewBox', `0 0 ${MAP.width} ${MAP.height}`);
  for (const bank of BANKS) {
    const height = bank.id === 'D' ? 1190 : 920;
    svg.append(node('rect', {x:bank.x-16,y:75,width:252,height,rx:5,class:'bank-region'}));
    svg.append(node('line', {x1:bank.x-16,y1:541,x2:bank.x+236,y2:541,class:'bank-divider'}));
    if (bank.id === 'D') svg.append(node('line', {x1:bank.x-16,y1:988,x2:bank.x+236,y2:988,class:'bank-divider'}));
  }
  for (const label of LABELS) {
    const bank = BANKS.find(bank => bank.id === label.bank);
    svg.append(node('text', {x:bank.x+110,y:label.y,'text-anchor':'middle',class:'section-label'}, label.text));
  }
  for (const marker of MARKERS) {
    const group = node('g', {class:'marker'});
    group.append(node('rect', {x:marker.x-14,y:marker.y-12,width:28,height:24,rx:2}));
    group.append(node('text', {x:marker.x,y:marker.y}, marker.id));
    svg.append(group);
  }
  svg.append(node('text', {x:812,y:1100,'text-anchor':'middle',class:'floor-note'}, 'DEMO SESSIONS'));
  for (const board of BOARDS) {
    const group = node('g', {class:`board${board.yellow ? ' source-yellow' : ''}${board.needsReview ? ' needs-review' : ''}`,
      role:'button',tabindex:board.number === 1 ? '0' : '-1','aria-pressed':'false','data-board':board.number});
    group.append(node('title', {}, `Board ${board.number}`));
    group.append(node('rect', {x:board.x,y:board.y,width:MAP.faceWidth,height:MAP.faceHeight,rx:2}));
    group.append(node('text', {x:board.x+MAP.faceWidth/2,y:board.y+MAP.faceHeight/2}, board.number));
    const savedMarker = node('g', {class:'saved-marker', 'aria-hidden':'true'});
    savedMarker.append(node('circle', {cx:board.x+MAP.faceWidth-1,cy:board.y+2,r:8}));
    savedMarker.append(node('text', {x:board.x+MAP.faceWidth-1,y:board.y+2,class:'saved-star'}, '★'));
    group.append(savedMarker);
    group.addEventListener('click', event => { if (event.detail === 0) selectBoard(board.number); });
    group.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); selectBoard(board.number); return;}
      const directions = {ArrowRight:[1,0], ArrowLeft:[-1,0], ArrowDown:[0,1], ArrowUp:[0,-1]};
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault();
      const [dx,dy] = direction;
      const candidates = BOARDS.filter(next => (next.x-board.x)*dx + (next.y-board.y)*dy > 0);
      candidates.sort((a,b) => {
        const score = next => Math.abs((next.x-board.x)*dy-(next.y-board.y)*dx)*5 + Math.hypot(next.x-board.x,next.y-board.y);
        return score(a)-score(b);
      });
      if (candidates[0]) selectBoard(candidates[0].number, {focus:true,reveal:view.width < fitView(MAP,viewport).width - 0.01,keepZoom:true});
    });
    elements.set(board.number, group); svg.append(group);
  }
}

// Pointer events cover mouse, pen and touch with the same screen-to-map math.
const pointers = new Map();
let drag = null, pinch = null, gestureMoved = false, lastTap = null, inertiaFrame = 0;
let zoomFrame = 0, zoomTarget = null;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function stopMotion() {
  cancelAnimationFrame(inertiaFrame); inertiaFrame = 0;
  cancelAnimationFrame(zoomFrame); zoomFrame = 0;
  const interrupted = zoomTarget; zoomTarget = null;
  if (interrupted) applyView();
}
reducedMotion.addEventListener('change', () => {
  if (!reducedMotion.matches) return;
  const target = zoomTarget;
  stopMotion();
  if (target) { view = target; applyView(); }
});
function anchorAt(point) {
  const rect = stage.getBoundingClientRect();
  return {x:(point.x-rect.left)/rect.width, y:(point.y-rect.top)/rect.height};
}
function midpoint(a,b) { return {x:(a.x+b.x)/2,y:(a.y+b.y)/2}; }
function startDrag(id, point) {
  drag = {id, start:point, previous:point, time:performance.now(), view:{...view}, vx:0, vy:0};
}
function coast(vx,vy) {
  if (reducedMotion.matches || Math.hypot(vx,vy) < 0.12) return;
  vx = Math.max(-1.5,Math.min(1.5,vx)); vy = Math.max(-1.5,Math.min(1.5,vy));
  const started = performance.now(); let previous = started;
  const tick = now => {
    const elapsed = Math.min(32,now-previous); previous = now;
    const next = panBy(view,{x:vx*elapsed,y:vy*elapsed},MAP,viewport);
    const moved = Math.abs(next.x-view.x)+Math.abs(next.y-view.y);
    view = next; applyView();
    const decay = Math.exp(-elapsed/160); vx *= decay; vy *= decay;
    if (moved > 0.01 && Math.hypot(vx,vy) > 0.025 && now-started < 650) inertiaFrame = requestAnimationFrame(tick);
    else inertiaFrame = 0;
  };
  inertiaFrame = requestAnimationFrame(tick);
}
stage.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  stopMotion();
  const point = {x:event.clientX,y:event.clientY};
  pointers.set(event.pointerId,point);
  stage.setPointerCapture(event.pointerId);
  if (pointers.size === 1) { gestureMoved = false; startDrag(event.pointerId,point); }
  if (pointers.size === 2) {
    const [a,b] = [...pointers.values()];
    pinch = {distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),middle:midpoint(a,b),view:{...view}};
    gestureMoved = true; lastTap = null; drag = null;
  }
});
stage.addEventListener('pointermove', event => {
  if (!pointers.has(event.pointerId)) return;
  const point = {x:event.clientX,y:event.clientY};
  pointers.set(event.pointerId,point);
  if (pinch && pointers.size >= 2) {
    const [a,b] = [...pointers.values()];
    const middle = midpoint(a,b);
    const distance = Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
    view = pinchAt(pinch.view,pinch.distance/distance,anchorAt(pinch.middle),anchorAt(middle),MAP,viewport);
    applyView(); return;
  }
  if (!drag || drag.id !== event.pointerId) return;
  const dx = point.x-drag.start.x, dy = point.y-drag.start.y;
  if (Math.hypot(dx,dy) < 6 && !gestureMoved) return;
  gestureMoved = true; lastTap = null; stage.classList.add('dragging');
  const now = performance.now(), elapsed = Math.max(1,now-drag.time);
  drag.vx = (point.x-drag.previous.x)/elapsed;
  drag.vy = (point.y-drag.previous.y)/elapsed;
  drag.previous = point; drag.time = now;
  view = panBy(drag.view,{x:dx,y:dy},MAP,viewport);
  applyView();
});
function endPointer(event) {
  if (!pointers.has(event.pointerId)) return;
  pointers.delete(event.pointerId);
  const wasPinching = Boolean(pinch);
  pinch = null;
  if (pointers.size >= 2) {
    const [a,b] = [...pointers.values()];
    pinch = {distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),middle:midpoint(a,b),view:{...view}};
    gestureMoved = true; drag = null;
    return;
  }
  if (pointers.size) {
    // Rebase the remaining finger, avoiding a jump from its pre-pinch position.
    const [id,point] = pointers.entries().next().value;
    startDrag(id,point); gestureMoved = true;
    return;
  }
  stage.classList.remove('dragging');
  if (!gestureMoved && event.type === 'pointerup') {
    const point = {x:event.clientX,y:event.clientY};
    const now = performance.now();
    if (lastTap && now-lastTap.time < 320 && Math.hypot(point.x-lastTap.x,point.y-lastTap.y) < 28) {
      zoom(0.5,anchorAt(point)); lastTap = null;
    } else {
      lastTap = {...point,time:now};
      const hit = document.elementFromPoint(point.x,point.y)?.closest('[data-board]');
      if (hit) selectBoard(Number(hit.dataset.board));
    }
  } else if (!wasPinching && drag && event.type === 'pointerup' && performance.now()-drag.time < 70) {
    coast(drag.vx,drag.vy);
  }
  drag = null;
}
stage.addEventListener('pointerup',endPointer);
stage.addEventListener('pointercancel',endPointer);
stage.addEventListener('lostpointercapture', event => {
  if (pointers.has(event.pointerId)) endPointer({...event,pointerId:event.pointerId,type:'pointercancel'});
});
stage.addEventListener('wheel', event => {
  event.preventDefault(); stopMotion();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.height : 1;
  if (event.ctrlKey || event.metaKey || event.deltaMode === 1) {
    zoom(Math.exp(Math.max(-200,Math.min(200,event.deltaY*unit))*0.006),anchorAt({x:event.clientX,y:event.clientY}));
  } else {
    view = panBy(view,{x:-event.deltaX*unit,y:-event.deltaY*unit},MAP,viewport);
    applyView();
  }
}, {passive:false});
new ResizeObserver(() => {
  const next = {width:stage.clientWidth,height:stage.clientHeight};
  if (!next.width || !next.height || (next.width === viewport.width && next.height === viewport.height)) return;
  stopMotion();
  view = resizeView(view,viewport,next,MAP);
  viewport = next; pointers.clear(); drag = null; pinch = null;
  stage.classList.remove('dragging'); applyView();
}).observe(stage);
// Reserve room for the larger phone selection card so Fit and centered boards
// remain above it. The existing stage observer keeps camera geometry in sync.
new ResizeObserver(() => {
  const card = $('#selection-chip');
  stage.parentElement.style.setProperty('--selection-height', `${card.hidden ? 0 : card.offsetHeight}px`);
}).observe($('#selection-chip'));
$('#zoom-in').addEventListener('click', () => zoom(1/1.4, {x:0.5,y:0.5}, true));
$('#zoom-out').addEventListener('click', () => zoom(1.4, {x:0.5,y:0.5}, true));
$('#fit').addEventListener('click',fitMap);
$('#open-details').addEventListener('click',openDetails);
$('#close-details').addEventListener('click', () => $('#details-panel').close());
$('#details-panel').addEventListener('click', event => {
  const panel = $('#details-panel'), rect = panel.getBoundingClientRect();
  if (event.target === panel && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) panel.close();
});
$('#find-form').addEventListener('submit', event => {
  event.preventDefault(); selectBoard(Number($('#board-number').value), {reveal:true,focus:true});
});
$('#session').addEventListener('change', () => {
  activeSession = $('#session').value; $('#paper-search').value = '';
  refreshAssignments(); renderPaperResults(); updateHash(); feedback('');
});
$('#next-saved').addEventListener('click', () => {
  const target = nextSavedPoster(savedStops, activeSession, selected);
  if (!target) return;
  activeSession = target.session;
  $('#session').value = activeSession;
  $('#session').title = currentSession()?.label || 'Poster session';
  $('#paper-search').value = '';
  refreshAssignments();
  selectBoard(target.board, {reveal:true});
  const slot = currentSession();
  $('#map-status').textContent += ` ${slot.shortLabel}, ${slot.date}, ${slot.start}–${slot.end} Budapest time. Saved poster ${savedStops.findIndex(stop => stop.session === target.session && stop.board === target.board) + 1} of ${savedStops.length}. ${displayTitle(target.entry)}.`;
});
$('#paper-search').addEventListener('input',renderPaperResults);
$('#topics-toggle').addEventListener('click', () => {
  topicsEnabled = !topicsEnabled; selectedTopic = null;
  refreshAssignments(); renderPaperResults();
  $('#map-status').textContent = topicsEnabled ? 'Topic colours on. Choose a topic to highlight its posters.' : 'Topic colours off.';
});
$('#topic-browse').addEventListener('click', () => {
  $('#paper-search').value = ''; renderPaperResults(); openDetails({topic:true});
});

function readHash({reveal = true} = {}) {
  const hash = new URLSearchParams(location.hash.slice(1));
  const requestedSession = hash.get('session');
  if (catalogReady) {
    const requested = sessions.find(session => session.aliases.includes(requestedSession));
    activeSession = requested?.id || activeSession || defaultSession(sessions);
    $('#session').value = activeSession;
    $('#session').title = currentSession()?.label || 'Poster session';
    if (hash.has('board') && !requested) {
      feedback(`This board link has no valid session. Showing Session ${activeSession}. Check the session before using this assignment.`);
    }
  }
  const number = Number(hash.get('board'));
  if (BOARD_BY_NUMBER.has(number)) selectBoard(number, {reveal,hash:false});
  refreshAssignments(); renderPaperResults();
}
window.addEventListener('hashchange', () => readHash());
function refreshSavedPapers() {
  savedPapers = readSavedPapers();
  refreshAssignments(); renderPaperResults();
}
window.addEventListener('storage', event => {
  if (event.key === SAVED_PAPERS_KEY || event.key === null) refreshSavedPapers();
});
window.addEventListener('focus', refreshSavedPapers);
window.addEventListener('pageshow', refreshSavedPapers);
drawMap(); applyView(); refreshAssignments(); readHash();

// A missing finder dataset must not hide official handbook assignments.
const paperRequest = fetch('../data/papers.json', {cache:'no-cache'}).then(async response => {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const schedule = await response.json();
  if (!Array.isArray(schedule.papers)) throw new Error('Missing paper list');
  for (const paper of schedule.papers) papers.set(paper.id, paper);
  refreshAssignments(); renderPaperResults();
}).catch(() => {
  finderUnavailable = true;
  if (catalogReady) feedback('Paper finder links are unavailable. Handbook assignments still appear on the map.');
});
try {
  const response = await fetch('../data/poster-boards.json', {cache:'no-cache'});
  if (!response.ok) throw new Error(`Handbook catalog returned HTTP ${response.status}.`);
  catalog = validateCatalog(await response.json());
  sessions = sessionGroups(catalog.sessions);
  assignments = mapEntries(catalog.entries, sessions);
  $('#session').replaceChildren();
  for (const session of sessions) {
    const option = document.createElement('option'); option.value = session.id;
    option.textContent = session.aliases.length > 1 ? `${session.id} + Industry` : session.shortLabel;
    option.title = session.label;
    $('#session').append(option);
  }
  $('#session').disabled = false;
  activeSession = defaultSession(sessions);
  catalogReady = true;
  const source = $('#handbook-source');
  try {
    const url = new URL(catalog.source?.url);
    if (url.protocol === 'https:' || url.protocol === 'http:') { source.href = url.href; source.hidden = false; }
  } catch { /* Assignments remain readable if source metadata has no usable URL. */ }
  readHash({reveal:false});
  if (finderUnavailable) feedback('Paper finder links are unavailable. Handbook assignments still appear on the map.');
} catch (error) {
  $('#session-note').textContent = 'Handbook assignments unavailable. The complete floor plan still works.';
  feedback(error.message);
}
await paperRequest;
try {
  const response = await fetch('../data/poster-topics.json', {cache:'no-cache'});
  if (!response.ok) throw new Error('Topics unavailable');
  topics = validateTopics(await response.json());
  refreshAssignments();
} catch {
  $('#topics-note').textContent = 'Experimental topics unavailable. The floor plan still works.';
}
