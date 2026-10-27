import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {searchText, validateCatalog, sessionGroups, sessionOptionLabel, mapEntries, indexAssignments, assignmentAt, savedAssignments, savedPosterStops, defaultSession, boardHash, authorsText, boardSearchNumber, matchesPosterSearch} from '../catalog.mjs';

test('poster search matches author and title words, accents, IDs and exact board numbers', () => {
  const poster = {title:'Graph Reasoning with LLMs', authors:['José García'], paperId:'1234-MAIN', board:329};
  for (const query of ['reasoning garcia', 'JOSE graph', '1234-main', '329', 'Board 329']) {
    assert.equal(matchesPosterSearch(poster, query), true, query);
  }
  for (const query of ['32', 'graph missing', 'other author']) assert.equal(matchesPosterSearch(poster, query), false, query);
  assert.equal(matchesPosterSearch({...poster, authors:'José García'}, 'garcia'), true);
});

test('board shortcuts accept only a complete, physical board number', () => {
  for (const [query, expected] of [['1',1],[' 424 ',424],['board 329',329],['0',null],['425',null],['32.9',null],['329 paper',null],['D1','D1'],['d7','D7'],['Board D12','D12'],['D0',null],['D13',null],['D01',null]]) {
    assert.equal(boardSearchNumber(query), expected, query);
  }
});

const sessions = [
  {id:'A',label:'Poster Session A',date:'2026-10-25',start:'11:00',end:'12:30',room:'Hall H'},
  {id:'D',aliases:['Industry6'],label:'Poster Session D',date:'2026-10-26',start:'11:00',end:'12:30',room:'Hall H'},
];
const entry = (session,board,title,verified=true) => ({session,board,title,authors:['One Author','Another Author'],sourceRow:42,paperId:'test-paper',verified});
const catalog = entries => ({version:2,source:{url:'https://example.test/sheet',sheet:'Author Presentations',column:'L',updatedAt:'2026-10-26'},sessions,entries});

test('official catalog validates source identity and board range without inventing paper IDs', () => {
  assert.equal(validateCatalog(catalog([entry('A',424,'Unmatched official title')])).entries[0].paperId,'test-paper');
  for (const board of [0,425,1.5,'1','d1','D0','D13','D01',null]) assert.throws(() => validateCatalog(catalog([entry('A',board,'Title')])),/board must/);
  assert.throws(() => validateCatalog(catalog([entry('Unknown',1,'Title')])),/unknown schedule session/);
  assert.throws(() => validateCatalog(catalog([{...entry('A',1,'Title'),sourceRow:0}])),/positive source row/);
  const missingFlag = entry('A',1,'Title'); delete missingFlag.verified;
  assert.throws(() => validateCatalog(catalog([missingFlag])),/verified flag/);
  assert.throws(() => validateCatalog({...catalog([]),version:1}),/version 2/);
});

test('shared physical slots combine main and industry aliases and preserve reused boards on other days', () => {
  const groups = sessionGroups(sessions);
  assert.equal(groups.length,2);
  assert.deepEqual(groups[1].aliases,['D','Industry6']);
  assert.equal(groups[1].id,'D');
  assert.equal(groups[1].shortLabel,'Session D');
  const entries = mapEntries([entry('A',1,'Day one'),entry('Industry6',1,'Industry paper'),entry('D',158,'Main paper')],groups);
  assert.equal(assignmentAt(entries,'A',1).entry.title,'Day one');
  assert.equal(assignmentAt(entries,'D',1).entry.title,'Industry paper');
  assert.equal(assignmentAt(entries,'D',158).entry.title,'Main paper');
});

test('conflicting and unverified schedule entries cannot become verified map assignments', () => {
  const entries = [entry('D',311,'First',false),entry('D',311,'Second',false),entry('A',2,'Unsupported',false)];
  assert.equal(assignmentAt([entry('D',311,'First'),entry('D',311,'Second')],'D',311).entry,null);
  const result = assignmentAt(entries,'D',311);
  assert.equal(result.entry,null);
  assert.deepEqual(result.conflicts.map(row=>row.title),['First','Second']);
  assert.equal(assignmentAt(entries,'A',2).entry,null);
  const noFlag = {...entry('A',1,'Missing flag')}; delete noFlag.verified;
  assert.equal(assignmentAt([noFlag],'A',1).entry,null);
});

test('session defaults use Budapest local time and canonical hashes always identify the session', () => {
  const groups = sessionGroups(sessions);
  assert.equal(defaultSession(groups,new Date('2026-10-26T10:15:00Z')),'D');
  assert.equal(defaultSession(groups,new Date('2026-10-25T23:15:00Z')),'D');
  assert.equal(defaultSession(groups,new Date('2026-10-20T10:15:00Z')),'A');
  assert.equal(boardHash('D',311),'#session=D&board=311');
  assert.equal(authorsText(entry('A',1,'Title')),'One Author, Another Author');
});

const published = new URL('../../data/poster-boards.json',import.meta.url);
test('native session options show the conference day and local time for all seven published slots', () => {
  const document = validateCatalog(JSON.parse(readFileSync(published,'utf8')));
  assert.deepEqual(sessionGroups(document.sessions).map(sessionOptionLabel), [
    'A · Sun 25 Oct · 11:00–12:30',
    'B · Sun 25 Oct · 16:00–17:30',
    'C · Mon 26 Oct · 09:00–10:30',
    'D · Mon 26 Oct · 11:00–12:30',
    'E · Mon 26 Oct · 16:45–18:15',
    'F · Tue 27 Oct · 09:00–10:30',
    'G · Tue 27 Oct · 11:00–12:30',
  ]);
});

test('session option labels use date-only weekdays and preserve Budapest clock times', () => {
  assert.equal(sessionOptionLabel(sessions[1]), 'D · Mon 26 Oct · 11:00–12:30');
  assert.equal(sessionOptionLabel({...sessions[0], date:'2026-01-01', start:'00:00', end:'01:30'}),
    'A · Thu 1 Jan · 00:00–01:30');
});

test('the published schedule catalog uses valid board and session identities', () => {
  const document = validateCatalog(JSON.parse(readFileSync(published,'utf8')));
  const groups = sessionGroups(document.sessions);
  const entries = mapEntries(document.entries,groups);
  assert.ok(entries.length > 0);
  assert.ok(entries.some(row=>row.verified === true),'Catalog must mark supported assignments as verified');
  for (const row of entries.filter(row=>row.verified === true)) {
    assert.ok(assignmentAt(entries,row.session,row.board).entry,`Verified entry conflicts at ${row.session}/${row.board}`);
  }
});

test('paper lookup accepts unaccented author names and PDF ligatures', () => {
  assert.equal(searchText('Tom Völker'), 'tom volker');
  assert.equal(searchText('Jan Pﬁster'), 'jan pfister');
});


test('assignment index preserves every verified, missing, unconfirmed and conflicting board result', () => {
  const document = validateCatalog(JSON.parse(readFileSync(published,'utf8')));
  const groups = sessionGroups(document.sessions);
  const entries = mapEntries(document.entries,groups);
  const index = indexAssignments(entries);
  for (const session of [...groups.map(row => row.id), 'missing']) {
    for (const board of [...Array.from({length:424},(_,i)=>i+1),...Array.from({length:12},(_,i)=>`D${i+1}`)]) {
      assert.deepEqual(assignmentAt(entries,session,board,index), assignmentAt(entries,session,board));
    }
  }
  const saved = new Set(entries.map(row => row.paperId));
  for (const session of groups) {
    assert.deepEqual(savedAssignments(entries,session.id,saved,index), savedAssignments(entries,session.id,saved));
  }
  assert.deepEqual(savedPosterStops(entries,groups,saved,index), savedPosterStops(entries,groups,saved));
  assert.equal(assignmentAt(entries,'D',311,index).entry,null);
  assert.ok(assignmentAt(entries,'D',311,index).conflicts.length > 1);
});


test('demo assignments retain the version 2 catalog and distinct numeric identities', () => {
  const document=validateCatalog(catalog([entry('A',1,'Numeric'),entry('A','D1','Demo'),entry('A','D12','Last demo')]));
  assert.equal(document.version,2);
  const entries=mapEntries(document.entries,sessionGroups(sessions)), index=indexAssignments(entries);
  for (const candidate of entries) {
    assert.strictEqual(assignmentAt(entries,'A',candidate.board,index).entry,candidate);
    assert.strictEqual(assignmentAt(entries,'A',candidate.board).entry,candidate);
  }
  assert.equal(boardHash('A','D12'),'#session=A&board=D12');
  assert.equal(assignmentAt(entries,'D','D1',index).entry,null);
});

test('demo search shortcuts match an exact board rather than another demo or numeric title', () => {
  const demo={...entry('A','D1','D12 numeric 1'),paperId:'D12'}, numeric=entry('A',1,'D1 demo');
  for (const query of ['D1','d1','Board D1']) {
    assert.equal(matchesPosterSearch(demo,query),true);
    assert.equal(matchesPosterSearch(numeric,query),false);
    assert.equal(matchesPosterSearch({...demo,board:'D10'},query),false);
  }
  assert.equal(matchesPosterSearch(demo,'1'),false);
  assert.equal(matchesPosterSearch({...demo,board:'D12'},'Board D12'),true);
});

test('published demo assignments cover the ten scheduled sides across all seven sessions', () => {
  const document=validateCatalog(JSON.parse(readFileSync(published,'utf8')));
  const demos=document.entries.filter(row=>typeof row.board==='string');
  assert.equal(demos.length,70);
  assert.deepEqual([...new Set(demos.map(row=>row.board))].sort((a,b)=>Number(a.slice(1))-Number(b.slice(1))),Array.from({length:10},(_,i)=>`D${i+1}`));
  assert.equal(new Set(demos.map(row=>row.session)).size,7);
  assert.equal(demos.every(row=>row.verified===true),true);
  assert.ok(document.entries.filter(row=>Number.isInteger(row.board)).length>2700,'Numeric assignments remain present');
});
