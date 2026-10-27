import {MAP, BANKS, BOARDS, BOARD_BY_NUMBER, MARKERS, LABELS, DEMO_BOARDS} from './layout.mjs';
import {validateCatalog, sessionGroups, sessionOptionLabel, mapEntries, indexAssignments, assignmentAt, savedAssignments, savedPosterStops, nextSavedPoster, defaultSession, authorsText, boardHash, boardSearchNumber, matchesPosterSearch} from './catalog.mjs';
import {SAVED_PAPERS_KEY, readSavedPapers, setSavedPaper} from '../saved-papers.mjs';
import {createAnalytics} from '../analytics.mjs';
import {renderTitle, titleSearchText} from '../math-titles.mjs';
import {fitView, constrainView, zoomAt, pinchAt, panBy, resizeView} from './camera.mjs';
import {validateTopics, indexTopics, topicForEntry, topicChoices, topicEntries, matchesTopic} from './topics.mjs';
import {AREA_COLORS} from '../atlas.mjs';

const $ = selector => document.querySelector(selector);
const svg = $('#floor-map');
const stage = $('#map-stage');
const zoomControls = $('.zoom-controls');
const inlineZoom = matchMedia('(max-width: 640px) and (min-height: 501px)');
const desktopHover = matchMedia('(hover: hover) and (pointer: fine)');
let previewed = null, suggestionMatches = [], activeSuggestion = -1;
const posterSearchCache = new Map();
const analytics = createAnalytics();
let selected = null, sessions = [], assignments = [], activeSession = '', catalogReady = false;
let catalog = null;
let assignmentIndex = indexAssignments([]), topicIndex = null;
let sessionEntries = new Map();
let topics = null, topicsEnabled = true, selectedArea = null, selectedTopic = null, topicSession = '';
const papers = new Map();
let savedPapers = readSavedPapers(), savedBoards = new Map(), savedStops = [];
let viewport = {width: stage.clientWidth, height: stage.clientHeight};
let view = fitView(MAP, viewport);
let revealedBoard = null;
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
function placeZoomControls() {
  const actions = inlineZoom.matches && $('#selection-chip:not([hidden]) .selection-card-actions');
  (actions || stage.parentElement).append(zoomControls);
}
inlineZoom.addEventListener('change', placeZoomControls);
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
function fitMap() { revealedBoard = null; transitionTo(fitView(MAP, viewport)); }
function zoom(factor, anchor = {x:0.5,y:0.5}, animate = false) {
  revealedBoard = null;
  const target = zoomAt(animate && zoomTarget ? zoomTarget : view, factor, anchor, MAP, viewport);
  if (animate) transitionTo(target);
  else { stopMotion(); view = target; applyView(); }
}
function openDetails({topic = false, search = false} = {}) {
  stopMotion();
  if (previewed !== null) { clearPreview(); renderAssignment(); }
  closeSearchSuggestions();
  $('#filters-panel').close();
  const panel = $('#details-panel');
  panel.classList.toggle('topic-list', topic);
  panel.classList.toggle('search-list', search);
  if (!topic && !search) $('#paper-search').value = '';
  $('#details-title').textContent = search ? 'Search posters' : topic ? currentTopicHeading() : 'Map details';
  if (!panel.open) panel.showModal();
  renderAssignment(selected, {detailsOnly:true});
  renderPaperResults();
  $('.panel-body').scrollTop = 0;
  if (topic) $('#details-title').focus({preventScroll:true});
  if (search) $('#paper-search').focus({preventScroll:true});
}
function displayTitle(entry) { return papers.get(entry.paperId)?.title || entry.title; }
function displayAuthors(entry) { return papers.get(entry.paperId)?.authors?.join(', ') || authorsText(entry); }
function currentAssignment(number) { return assignmentAt(assignments, activeSession, number, assignmentIndex).entry; }
function conflictingEntries(number) { return assignmentAt(assignments, activeSession, number, assignmentIndex).conflicts; }
function currentSession() { return sessions.find(session => session.id === activeSession); }
function currentEntries() { return sessionEntries.get(activeSession) || []; }
function clearPreview() {
  elements.get(previewed)?.classList.remove('previewing');
  previewed = null;
}
function previewBoard(number) {
  if (previewed === number) return;
  clearPreview();
  previewed = number;
  elements.get(number)?.classList.add('previewing');
  renderAssignment();
}
function currentTopic(entry) { return topicForEntry(topics, activeSession, entry, topicIndex); }
function hasTopicFilter() { return topicsEnabled && (selectedArea !== null || selectedTopic !== null); }
function currentTopicHeading() {
  if (selectedTopic !== null) return topics.topics.find(topic => topic.id === selectedTopic).label;
  if (selectedArea === 'unclassified') return 'Not classified in Atlas';
  return selectedArea === null ? 'All posters in this session' : topics.areas.find(area => area.id === selectedArea).label;
}
function topicMembers() { return topicEntries(topics, activeSession, currentEntries(), selectedArea, selectedTopic, topicIndex); }
function renderTopicControls() {
  if (topicSession !== activeSession) { selectedArea = selectedTopic = null; topicSession = activeSession; }
  const choices = topicChoices(topics, activeSession, currentEntries().filter(entry => currentAssignment(entry.board)), topicIndex);
  const available = choices.areas.length > 0;
  $('#topics-toggle').disabled = !available;
  $('#topics-toggle').setAttribute('aria-pressed', String(topicsEnabled && available));
  $('#topic-filters').hidden = $('#topic-browse').hidden = !topicsEnabled || !available;
  if (topics) $('#topics-note').textContent = available ? 'Inferred · not official tracks' : 'Topics unavailable for this session.';
  $('#open-filters .filter-label').textContent = hasTopicFilter() ? 'Filters · 1' : 'Filters';
  if (!topicsEnabled || !available) return;
  const option = (parent, value, label) => {
    const item = document.createElement('option'); item.value = value; item.textContent = label; parent.append(item);
  };
  const areas = $('#topic-area'), fine = $('#topic-select');
  areas.replaceChildren(); fine.replaceChildren();
  option(areas, '', 'All areas');
  for (const area of choices.areas) option(areas, area.id, `${area.label} (${area.count})`);
  if (choices.unclassified) option(areas, 'unclassified', `Not classified in Atlas (${choices.unclassified})`);
  areas.value = selectedArea ?? '';
  areas.title = selectedArea === null ? 'Filter by Atlas area' : areas.selectedOptions[0].textContent;
  option(fine, '', 'All topics');
  for (const area of choices.areas.filter(area => selectedArea === null || area.id === selectedArea)) {
    const group = document.createElement('optgroup'); group.label = area.label;
    for (const topic of choices.topics.filter(topic => topic.area === area.id)) option(group, topic.id, `${topic.label} (${topic.count})`);
    fine.append(group);
  }
  fine.value = selectedTopic ?? '';
  fine.disabled = selectedArea === 'unclassified';
  fine.title = selectedTopic === null ? 'Filter by Atlas topic' : currentTopicHeading();
  const swatch = $('#area-swatch'); swatch.hidden = !Number.isInteger(selectedArea);
  if (!swatch.hidden) swatch.style.backgroundColor = AREA_COLORS[selectedArea];
  $('#topic-browse').textContent = `Browse ${topicMembers().length} posters`;
}

function topicLabel(entry) {
  if (!topicsEnabled || !entry?.verified) return null;
  const topic = currentTopic(entry);
  const label = document.createElement('p'); label.className = 'paper-topic';
  if (!topic) { label.textContent = 'Not classified in Atlas'; return label; }
  const swatch = document.createElement('span'); swatch.className = 'topic-swatch';
  swatch.style.backgroundColor = topic.color; swatch.setAttribute('aria-hidden','true');
  const text = document.createElement('span');
  text.append(document.createTextNode(topic.areaLabel));
  if (topic.label) {
    const fine = document.createElement('small'); fine.textContent = topic.label; text.append(fine);
  }
  label.append(swatch, text); label.title = topic.description || `Inferred area: ${topic.areaLabel}`;
  return label;
}
function updateHash() {
  history.replaceState(null, '', `${location.pathname}${location.search}${boardHash(activeSession, selected)}`);
}
function selectBoard(number, {reveal = false, focus = false, hash = true, keepZoom = false} = {}) {
  if (!BOARD_BY_NUMBER.has(number)) return;
  clearPreview();
  closeSearchSuggestions();
  if (reveal) revealedBoard = number;
  else if (selected !== number) revealedBoard = null;
  const previous = selected;
  selected = number;
  const board = BOARD_BY_NUMBER.get(number);
  for (const id of new Set([previous ?? 1, selected])) {
    if (id === null) continue;
    const element = elements.get(id);
    element.classList.toggle('selected', id === selected);
    element.setAttribute('aria-pressed', String(id === selected));
    element.setAttribute('tabindex', id === selected ? '0' : '-1');
  }
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
function scheduleRowLink(entry) {
  const link = document.createElement('a');
  link.textContent = `Schedule row ${entry.sourceRow}`;
  try {
    const url = new URL(catalog.source.url);
    if (!['https:', 'http:'].includes(url.protocol)) return link;
    const gid = url.searchParams.get('gid') || (/gid=(\d+)/.exec(url.hash) || [])[1];
    url.hash = `${gid ? `gid=${gid}&` : ''}range=A${entry.sourceRow}:L${entry.sourceRow}`;
    link.href = url.href; link.target = '_blank'; link.rel = 'noopener';
  } catch { /* Keep the row label when source metadata is unusable. */ }
  return link;
}
function renderAssignment(number = previewed ?? selected, {detailsOnly = false} = {}) {
  const detailsOpen = $('#details-panel').open;
  const entry = currentAssignment(number);
  const detail = $('#selection-assignment');
  if (detailsOpen) detail.replaceChildren();
  detail.hidden = number === null;
  $('#paper-search').disabled = !catalogReady;
  $('#map-search').disabled = !catalogReady;
  $('#selection-chip').hidden = number === null;
  if (number === null) { placeZoomControls(); return; }
  const sessionLabel = currentSession()?.shortLabel || 'Session unavailable';
  const conflicts = conflictingEntries(number);
  const unconfirmed = !entry && !conflicts.length ? assignmentIndex.get(activeSession)?.get(number)?.[0] : null;
  $('#selection-title').textContent = `Board ${number} · ${activeSession ? currentSession()?.shortLabel : 'Floor plan'}`;
  if (detailsOpen) {
    const title = document.createElement('strong');
    if (conflicts.length) title.textContent = 'Conflicting schedule entries';
    else if (entry) renderTitle(title, displayTitle(entry));
    else if (unconfirmed) renderTitle(title, displayTitle(unconfirmed));
    else title.textContent = catalogReady ? 'No assignment listed in schedule for this session' : 'Schedule assignments unavailable';
    detail.append(title);
    for (const conflict of conflicts) {
      const conflictTitle = document.createElement('p'); renderTitle(conflictTitle, conflict.title); detail.append(conflictTitle);
      const conflictSource = document.createElement('p');
      conflictSource.append(`${authorsText(conflict) ? `${authorsText(conflict)} · ` : ''}`, scheduleRowLink(conflict)); detail.append(conflictSource);
    }
    if (entry && displayAuthors(entry)) {
      const authors = document.createElement('p'); authors.textContent = displayAuthors(entry); detail.append(authors);
    }
    if (savedBoards.has(number)) {
      const saved = document.createElement('p');
      saved.className = 'saved-paper-label'; saved.textContent = '★ Saved paper'; detail.append(saved);
    }
    const note = document.createElement('p');
    note.textContent = conflicts.length ? 'The schedule lists multiple papers at this board. Confirm the location with conference staff.' : unconfirmed ? unconfirmed.issue || 'Board assignment unconfirmed.' : entry ? `${sessionLabel} · ` : 'Board numbers are reused between sessions. Check the number session.';
    if (entry || unconfirmed) note.append(' ', scheduleRowLink(entry || unconfirmed));
    detail.append(note);
    if (entry?.paperId && papers.has(entry.paperId)) {
      const link = document.createElement('a');
      link.href = `../?paper=${encodeURIComponent(entry.paperId)}`;
      link.className = 'paper-link'; link.textContent = 'View paper in finder'; detail.append(link);
    }
    const topic = topicLabel(entry);
    if (topic) detail.append(topic);
  }
  if (detailsOnly) return;
  const chip = $('#selection-chip');
  chip.replaceChildren();
  const label = document.createElement('p');
  label.className = 'selection-card-label';
  label.textContent = `Board ${number}${BOARD_BY_NUMBER.get(number).needsReview ? ' · Check source' : ''}`;
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
      if (previewed !== null) selectBoard(number);
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
  else if (unconfirmed) renderTitle(paperTitle, displayTitle(unconfirmed));
  else paperTitle.textContent = conflicts.length ? 'Conflicting schedule entries' : catalogReady ? 'No verified paper assignment' : 'Floor plan position';
  chip.append(paperTitle);
  if (unconfirmed) {
    const warning = document.createElement('p'); warning.className = 'selection-card-time';
    warning.textContent = 'Board assignment unconfirmed. Check Details before attending.';
    chip.append(warning);
  }
  if (hasTopicFilter()) {
    const members = topicMembers();
    const index = members.findIndex(row => row.board === number);
    const navigation = document.createElement('div'); navigation.className = 'topic-navigation';
    const position = document.createElement('span');
    position.textContent = index < 0 ? 'Outside highlighted group' : `${index + 1} of ${members.length} posters`;
    navigation.append(position);
    for (const [step, text] of [[-1,'← Previous'], [1,'Next →']]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
      button.id = step < 0 ? 'topic-previous' : 'topic-next';
      button.setAttribute('aria-label', step < 0 ? 'Previous highlighted poster' : 'Next highlighted poster');
      button.addEventListener('click', () => {
        const next = index < 0 ? (step < 0 ? members.length - 1 : 0) : (index + step + members.length) % members.length;
        selectBoard(members[next].board, {reveal:true});
        $(`#${button.id}`).focus({preventScroll:true});
      });
      navigation.append(button);
    }
    chip.append(navigation);
  }
  const actions = document.createElement('div'); actions.className = 'selection-card-actions';
  const details = document.createElement('button'); details.type = 'button'; details.textContent = 'Details';
  details.setAttribute('aria-haspopup','dialog'); details.setAttribute('aria-controls','details-panel');
  details.addEventListener('click', () => { selectBoard(number); openDetails(); }); actions.append(details);
  if (entry?.paperId && papers.has(entry.paperId)) {
    const link = document.createElement('a'); link.href = `../?paper=${encodeURIComponent(entry.paperId)}`;
    link.textContent = 'View paper'; actions.append(link);
  }
  chip.append(actions);
  placeZoomControls();
  chip.setAttribute('aria-label', `${sessionLabel}. ${previewed === null ? 'Selected' : 'Previewing'} board ${number}${savedBoards.has(number) ? '. Saved paper' : ''}`);
}
function refreshAssignments() {
  clearPreview();
  renderTopicControls();
  savedBoards = savedAssignments(assignments, activeSession, savedPapers, assignmentIndex);
  savedStops = savedPosterStops(assignments, sessions, savedPapers, assignmentIndex);
  for (const board of BOARDS) {
    const element = elements.get(board.number);
    const entry = currentAssignment(board.number);
    element.classList.toggle('has-paper', Boolean(entry));
    element.classList.toggle('is-saved', savedBoards.has(board.number));
    element.classList.toggle('has-conflict', conflictingEntries(board.number).length > 0);
    const topic = topicsEnabled ? currentTopic(entry) : null;
    element.classList.toggle('has-topic', Boolean(topic));
    element.classList.toggle('topic-dimmed', hasTopicFilter() && (!entry || !matchesTopic(topic, selectedArea, selectedTopic)));
    if (topic) element.style.setProperty('--topic-color', topic.color);
    else element.style.removeProperty('--topic-color');
    element.setAttribute('aria-label', `Board ${board.number}${activeSession ? `, Session ${activeSession}` : ''}${savedBoards.has(board.number) ? ', saved paper' : ''}${board.needsReview ? ', numbering needs confirmation' : ''}${entry ? `, ${displayTitle(entry)}` : conflictingEntries(board.number).length ? ', conflicting schedule entries' : ', no verified assignment listed'}`);
    element.querySelector('title').textContent = `Board ${board.number}${savedBoards.has(board.number) ? ' · Saved paper' : ''}${entry ? ': ' + displayTitle(entry) : conflictingEntries(board.number).length ? ': Conflicting schedule entries' : ''}`;
    if (topic) {
      const label = `Inferred area: ${topic.areaLabel}${topic.label ? `, topic: ${topic.label}` : ''}`;
      element.setAttribute('aria-label', `${element.getAttribute('aria-label')}, ${label}`);
      element.querySelector('title').textContent += ` · ${label}`;
    }
  }
  $('#saved-map-count').textContent = `${savedStops.length} saved`;
  $('#next-saved').disabled = savedStops.length === 0;
  $('#next-saved').title = savedStops.length ? 'Jump through saved posters across all sessions' : 'No saved papers have a confirmed poster board';
  $('#next-saved').setAttribute('aria-label', savedStops.length ? `Next saved poster. ${savedStops.length} across all poster sessions.` : 'No saved posters with confirmed boards');
  const session = currentSession();
  $('#assignment-count').textContent = session ? `${currentEntries().filter(entry => currentAssignment(entry.board)).length} verified schedule assignments · ${session.room || 'Room not listed'}` : 'Schedule assignments unavailable';
  $('#session-note').textContent = session ? `${session.label} · ${session.date} · ${session.start}–${session.end} Budapest time. Boards are reused each session.` : 'The complete floor plan remains available.';
  renderAssignment();
}
function matchingPosters(query, entries = assignments) {
  query = titleSearchText(query);
  return entries.filter(entry => {
    if (!posterSearchCache.has(entry.paperId)) {
      posterSearchCache.set(entry.paperId, {...entry, title:titleSearchText(displayTitle(entry)), authors:displayAuthors(entry)});
    }
    return matchesPosterSearch(posterSearchCache.get(entry.paperId), query);
  });
}
function choosePoster(entry) {
  activeSession = entry.session;
  $('#session').value = activeSession;
  $('#session').title = sessionOptionLabel(currentSession()) + ' · Budapest time';
  $('#map-search').blur();
  refreshAssignments();
  selectBoard(entry.board, {reveal:true});
}
function closeSearchSuggestions() {
  $('#map-search-popup').hidden = true;
  $('#map-search').setAttribute('aria-expanded', 'false');
  $('#map-search').removeAttribute('aria-activedescendant');
  activeSuggestion = -1;
}
function setActiveSuggestion(index) {
  activeSuggestion = index;
  for (const [i, option] of [...$('#map-search-results').children].entries()) {
    option.setAttribute('aria-selected', String(i === index));
  }
  const option = $('#map-search-results').children[index];
  if (option) {
    $('#map-search').setAttribute('aria-activedescendant', option.id);
    option.scrollIntoView({block:'nearest'});
  }
}
function updateSearchPlacement() {
  const bottom = $('.header').getBoundingClientRect().bottom;
  const visibleBottom = window.visualViewport ? window.visualViewport.height + window.visualViewport.offsetTop : innerHeight;
  document.documentElement.style.setProperty('--map-header-bottom', `${bottom}px`);
  document.documentElement.style.setProperty('--map-search-height', `${Math.max(80, visibleBottom - bottom - 16)}px`);
}
function renderSearchSuggestions() {
  const query = $('#map-search').value.trim();
  const results = $('#map-search-results');
  results.replaceChildren();
  suggestionMatches = [];
  activeSuggestion = -1;
  $('#map-search').removeAttribute('aria-activedescendant');
  if (!query || !catalogReady) { closeSearchSuggestions(); return; }
  const matches = matchingPosters(query).sort((a, b) => Number(b.session === activeSession) - Number(a.session === activeSession));
  suggestionMatches = matches.slice(0, 6);
  $('#map-search-status').textContent = matches.length ? `${matches.length} poster${matches.length === 1 ? '' : 's'} · all sessions · Budapest time` : 'No matching poster. Try another title, author or paper ID.';
  for (const [index, entry] of suggestionMatches.entries()) {
    const option = document.createElement('button');
    option.type = 'button';
    option.tabIndex = -1;
    option.id = `poster-suggestion-${index}`;
    option.className = 'search-suggestion';
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', 'false');
    const title = document.createElement('span'); renderTitle(title, displayTitle(entry)); option.append(title);
    const meta = document.createElement('small');
    const slot = sessions.find(session => session.id === entry.session);
    const conflict = assignmentAt(assignments, entry.session, entry.board, assignmentIndex).conflicts.length;
    meta.textContent = `${sessionOptionLabel(slot)} · Board ${entry.board}${conflict ? ' · Conflicting entries' : entry.verified !== true ? ' · Board unconfirmed' : ''}${savedPapers.has(entry.paperId) ? ' · ★ Saved' : ''}`;
    option.append(meta);
    if (displayAuthors(entry)) {
      const authors = document.createElement('small'); authors.className = 'suggestion-authors'; authors.textContent = displayAuthors(entry); option.append(authors);
    }
    option.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse') event.preventDefault();
    });
    option.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse') setActiveSuggestion(index);
    });
    option.addEventListener('click', () => choosePoster(entry));
    results.append(option);
  }
  $('#map-search-more').hidden = matches.length <= suggestionMatches.length;
  $('#map-search-more').textContent = 'See more results →';
  updateSearchPlacement();
  $('#map-search-popup').hidden = false;
  $('#map-search').setAttribute('aria-expanded', 'true');
}
function renderPaperResults() {
  if (!$('#details-panel').open) return;
  const results = $('#paper-results');
  results.replaceChildren();
  if (!catalogReady) return;
  const query = titleSearchText($('#paper-search').value).trim();
  const allSessions = $('#details-panel').classList.contains('search-list');
  const topicFilter = topicsEnabled && $('#details-panel').classList.contains('topic-list');
  $('.paper-search-panel label').textContent = allSessions ? 'Title, author, paper ID or board · all sessions' : topicFilter ? 'Search this poster list' : 'Find a paper in this session';
  if (!query && !topicFilter) return;
  const entries = allSessions ? assignments : topicFilter ? topicMembers() : currentEntries();
  const matches = matchingPosters(query, entries);
  if (topicFilter) {
    const note = document.createElement('p');
    note.textContent = `${matches.length} posters · board order · Atlas topics are inferred`;
    results.append(note);
  }
  if (!matches.length) {
    const note = document.createElement('p');
    note.textContent = allSessions ? 'No matching poster. Try another title, author or paper ID.' : topicFilter ? 'No matching paper in this list. Clear the search or close the list and choose All areas.' : 'No matching schedule assignment in this session.'; results.append(note); return;
  }
  const limit = topicFilter ? matches.length : 20;
  for (const entry of matches.slice(0,limit)) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'paper-result';
    const title = document.createElement('span'); renderTitle(title, displayTitle(entry)); button.append(title);
    const meta = document.createElement('small');
    const slot = sessions.find(session => session.id === entry.session);
    const conflicts = assignmentAt(assignments, entry.session, entry.board, assignmentIndex).conflicts;
    meta.textContent = `${allSessions ? `${sessionOptionLabel(slot)} · Budapest time · ` : ''}Board ${entry.board}${savedPapers.has(entry.paperId) ? ' · ★ Saved' : ''}${conflicts.length ? ' · Conflicting entries' : entry.verified !== true ? ' · Board unconfirmed' : ''}`;
    button.append(meta);
    if (displayAuthors(entry)) {
      const authors = document.createElement('small'); authors.textContent = displayAuthors(entry); button.append(authors);
    }
    button.addEventListener('click', () => {
      if (allSessions) choosePoster(entry);
      else selectBoard(entry.board, {reveal:true});
      if (allSessions || $('#details-panel').classList.contains('topic-list')) $('#details-panel').close();
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
  const demos = node('g', {role:'img', 'aria-label':'Demo boards D1 to D10. Approximate row, anchored by D7 facing poster 201.'});
  demos.append(node('text', {x:659,y:1048,'text-anchor':'middle',class:'floor-note'}, 'DEMO SESSIONS'));
  for (const board of DEMO_BOARDS) {
    const label = node('g', {class:'demo-board'});
    label.append(node('title', {}, `${board.id} · approximate demo position`));
    label.append(node('rect', {x:board.x,y:board.y,width:MAP.faceWidth,height:MAP.faceHeight,rx:2}));
    label.append(node('text', {x:board.x+MAP.faceWidth/2,y:board.y+MAP.faceHeight/2}, board.id));
    demos.append(label);
  }
  const anchorX = BOARD_BY_NUMBER.get(201).x + MAP.faceWidth/2;
  demos.append(node('path', {d:`M${anchorX},1072 V982 m-5,7 5,-7 5,7`,class:'demo-direction'}));
  demos.append(node('text', {x:anchorX+12,y:1015,class:'demo-note'}, 'D7 faces 201'));
  demos.append(node('text', {x:659,y:1134,'text-anchor':'middle',class:'demo-note'}, 'Approximate demo layout'));
  svg.append(demos);
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
    group.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse' && desktopHover.matches && !pointers.size && !$('#details-panel').open && !$('#filters-panel').open && $('#map-search-popup').hidden) previewBoard(board.number);
    });
    group.addEventListener('click', event => {
      if (event.detail === 0) { selectBoard(board.number); openDetails(); }
    });
    group.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); selectBoard(board.number); openDetails(); return;}
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
    revealedBoard = null;
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
  revealedBoard = null;
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
    const desktopClick = event.pointerType === 'mouse' && desktopHover.matches;
    if (!desktopClick && lastTap && now-lastTap.time < 320 && Math.hypot(point.x-lastTap.x,point.y-lastTap.y) < 28) {
      zoom(0.5,anchorAt(point)); lastTap = null;
    } else {
      lastTap = {...point,time:now};
      const hit = document.elementFromPoint(point.x,point.y)?.closest('[data-board]');
      if (hit) {
        selectBoard(Number(hit.dataset.board));
        if (desktopClick) openDetails();
      }
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
  revealedBoard = null;
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
  // Loading the selected-paper card can shrink a phone's map more than once.
  // Keep a linked/jumped-to board in view until the visitor moves the camera.
  const board = next.width <= 640 && revealedBoard === selected ? BOARD_BY_NUMBER.get(selected) : null;
  const focus = board ? {x:board.x + MAP.faceWidth/2, y:board.y + MAP.faceHeight/2} : null;
  view = resizeView(view,viewport,next,MAP,focus);
  viewport = next; pointers.clear(); drag = null; pinch = null;
  stage.classList.remove('dragging'); applyView();
}).observe(stage);
// Reserve room for the phone selection card so Fit and centered boards
// remain above it. The existing stage observer keeps camera geometry in sync.
new ResizeObserver(() => {
  const card = $('#selection-chip');
  stage.parentElement.style.setProperty('--selection-height', `${card.hidden ? 0 : card.offsetHeight}px`);
}).observe($('#selection-chip'));
$('#zoom-in').addEventListener('click', () => zoom(1/1.4, {x:0.5,y:0.5}, true));
$('#zoom-out').addEventListener('click', () => zoom(1.4, {x:0.5,y:0.5}, true));
$('#fit').addEventListener('click',fitMap);
$('#open-filters').addEventListener('click', () => { closeSearchSuggestions(); $('#filters-panel').showModal(); });
$('#close-filters').addEventListener('click', () => $('#filters-panel').close());
$('#close-details').addEventListener('click', () => $('#details-panel').close());
$('#details-panel').addEventListener('click', event => {
  const panel = $('#details-panel'), rect = panel.getBoundingClientRect();
  if (event.target === panel && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) panel.close();
});
function openSearchResults() {
  const query = $('#map-search').value.trim();
  if (!query) return;
  $('#paper-search').value = query;
  openDetails({search:true});
}
$('#map-search').addEventListener('input', renderSearchSuggestions);
$('#map-search').addEventListener('focus', renderSearchSuggestions);
$('#map-search').addEventListener('keydown', event => {
  if (event.isComposing) return;
  if (event.key === 'Escape' && !$('#map-search-popup').hidden) {
    event.preventDefault(); closeSearchSuggestions();
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if ($('#map-search-popup').hidden) renderSearchSuggestions();
    if (!suggestionMatches.length) return;
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const index = activeSuggestion < 0 ? (step > 0 ? 0 : suggestionMatches.length - 1) : (activeSuggestion + step + suggestionMatches.length) % suggestionMatches.length;
    setActiveSuggestion(index);
  } else if (event.key === 'Enter' && !$('#map-search-popup').hidden && activeSuggestion >= 0) {
    event.preventDefault(); choosePoster(suggestionMatches[activeSuggestion]);
  }
});
$('#map-search-more').addEventListener('click', openSearchResults);
$('#find-form').addEventListener('focusout', event => {
  // Mobile keyboards can blur the input before dispatching the result's click.
  // A null target is not evidence of leaving the form. Outside pointer presses
  // still dismiss results, and Tab to another control supplies a concrete target.
  if (event.relatedTarget && !$('#find-form').contains(event.relatedTarget)) closeSearchSuggestions();
});
document.addEventListener('pointerdown', event => {
  if (!$('#find-form').contains(event.target)) closeSearchSuggestions();
});
const headerObserver = new ResizeObserver(updateSearchPlacement);
headerObserver.observe($('.header'));
headerObserver.observe($('.feedback-bar'));
window.visualViewport?.addEventListener('resize', updateSearchPlacement);
window.visualViewport?.addEventListener('scroll', updateSearchPlacement);
$('#find-form').addEventListener('submit', event => {
  event.preventDefault();
  const board = boardSearchNumber($('#map-search').value);
  if (board !== null) { selectBoard(board, {reveal:true,focus:true}); return; }
  openSearchResults();
});
$('#session').addEventListener('change', () => {
  activeSession = $('#session').value; $('#paper-search').value = '';
  $('#session').title = sessionOptionLabel(currentSession()) + ' · Budapest time';
  refreshAssignments(); renderPaperResults(); updateHash(); feedback('');
});
$('#next-saved').addEventListener('click', () => {
  const target = nextSavedPoster(savedStops, activeSession, selected);
  if (!target) return;
  activeSession = target.session;
  $('#session').value = activeSession;
  $('#session').title = currentSession() ? sessionOptionLabel(currentSession()) + ' · Budapest time' : 'Poster session';
  $('#paper-search').value = '';
  refreshAssignments();
  selectBoard(target.board, {reveal:true});
  const slot = currentSession();
  $('#map-status').textContent += ` ${slot.shortLabel}, ${slot.date}, ${slot.start}–${slot.end} Budapest time. Saved poster ${savedStops.findIndex(stop => stop.session === target.session && stop.board === target.board) + 1} of ${savedStops.length}. ${displayTitle(target.entry)}.`;
});
$('#paper-search').addEventListener('input', () => {
  if ($('#details-panel').classList.contains('search-list')) $('#map-search').value = $('#paper-search').value;
  renderPaperResults();
});
$('#topics-toggle').addEventListener('click', () => {
  topicsEnabled = !topicsEnabled; selectedArea = selectedTopic = null;
  refreshAssignments(); renderPaperResults();
  $('#map-status').textContent = topicsEnabled ? 'Area colours on. Choose an area or topic to highlight its posters.' : 'Area colours off.';
});
function changeTopicFilter() {
  refreshAssignments(); renderPaperResults();
  $('#map-status').textContent = `${currentTopicHeading()}: ${topicMembers().length} posters. Other boards remain selectable.`;
}
$('#topic-area').addEventListener('change', () => {
  const value = $('#topic-area').value;
  selectedArea = value === '' ? null : value === 'unclassified' ? value : Number(value);
  selectedTopic = null; changeTopicFilter();
});
$('#topic-select').addEventListener('change', () => {
  const value = $('#topic-select').value;
  selectedTopic = value === '' ? null : Number(value);
  if (selectedTopic !== null) selectedArea = topics.topics.find(topic => topic.id === selectedTopic).area;
  changeTopicFilter();
});
$('#topic-browse').addEventListener('click', () => {
  $('#paper-search').value = ''; openDetails({topic:true});
});

function readHash({reveal = true} = {}) {
  const hash = new URLSearchParams(location.hash.slice(1));
  const requestedSession = hash.get('session');
  if (catalogReady) {
    const requested = sessions.find(session => session.aliases.includes(requestedSession));
    activeSession = requested?.id || activeSession || defaultSession(sessions);
    $('#session').value = activeSession;
    $('#session').title = currentSession() ? sessionOptionLabel(currentSession()) + ' · Budapest time' : 'Poster session';
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

try {
  const response = await fetch('../data/poster-boards.json');
  if (!response.ok) throw new Error(`Schedule catalog returned HTTP ${response.status}.`);
  catalog = validateCatalog(await response.json());
  sessions = sessionGroups(catalog.sessions);
  assignments = mapEntries(catalog.entries, sessions);
  assignmentIndex = indexAssignments(assignments);
  sessionEntries = new Map(sessions.map(session => [session.id, assignments.filter(entry => entry.session === session.id)]));
  // The build validates IDs and enriches this standalone catalog with finder authors.
  for (const entry of catalog.entries) papers.set(entry.paperId, {id:entry.paperId, title:entry.title, authors:entry.authors});
  posterSearchCache.clear();
  $('#session').replaceChildren();
  for (const session of sessions) {
    const option = document.createElement('option'); option.value = session.id;
    option.textContent = sessionOptionLabel(session);
    option.title = session.label;
    $('#session').append(option);
  }
  $('#session').disabled = false;
  activeSession = defaultSession(sessions);
  catalogReady = true;
  const source = $('#schedule-source');
  try {
    const url = new URL(catalog.source?.url);
    if (url.protocol === 'https:' || url.protocol === 'http:') { source.href = url.href; source.hidden = false; }
  } catch { /* Assignments remain readable if source metadata has no usable URL. */ }
  readHash({reveal:false});
} catch (error) {
  $('#session-note').textContent = 'Schedule assignments unavailable. The complete floor plan still works.';
  feedback(error.message);
}
try {
  const response = await fetch('../data/map-topics.json');
  if (!response.ok) throw new Error('Topics unavailable');
  topics = validateTopics(await response.json());
  topicIndex = indexTopics(topics);
  refreshAssignments();
} catch {
  $('#topics-note').textContent = 'Atlas topics unavailable. The floor plan still works.';
}
