import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {searchText, validateCatalog, sessionGroups, mapEntries, assignmentAt, defaultSession, boardHash, authorsText} from '../catalog.mjs';

const sessions = [
  {id:'A',label:'Poster Session A',date:'2026-10-25',start:'11:00',end:'12:30',room:'Hall H'},
  {id:'D',label:'Poster Session D',date:'2026-10-26',start:'11:00',end:'12:30',room:'Hall H'},
  {id:'Industry6',label:'Industry Poster Session 6',date:'2026-10-26',start:'11:00',end:'12:30',room:'Hall H'},
];
const entry = (session,board,title,verified=true) => ({session,board,title,authors:['One Author','Another Author'],page:42,paperId:null,verified});
const catalog = entries => ({version:1,source:{url:'https://example.test/handbook.pdf'},sessions,entries});

test('official catalog validates source identity and board range without inventing paper IDs', () => {
  assert.equal(validateCatalog(catalog([entry('A',424,'Unmatched official title')])).entries[0].paperId,null);
  for (const board of [0,425,1.5,'1',null]) assert.throws(() => validateCatalog(catalog([entry('A',board,'Title')])),/board must/);
  assert.throws(() => validateCatalog(catalog([entry('Unknown',1,'Title')])),/unknown handbook session/);
  assert.throws(() => validateCatalog(catalog([{...entry('A',1,'Title'),page:0}])),/physical PDF page/);
});

test('shared physical slots combine main and industry aliases and preserve reused boards on other days', () => {
  const groups = sessionGroups(sessions);
  assert.equal(groups.length,2);
  assert.deepEqual(groups[1].aliases,['D','Industry6']);
  assert.equal(groups[1].id,'D');
  assert.equal(groups[1].shortLabel,'Session D + Industry');
  const entries = mapEntries([entry('A',1,'Day one'),entry('Industry6',1,'Industry paper'),entry('D',158,'Main paper')],groups);
  assert.equal(assignmentAt(entries,'A',1).entry.title,'Day one');
  assert.equal(assignmentAt(entries,'D',1).entry.title,'Industry paper');
  assert.equal(assignmentAt(entries,'D',158).entry.title,'Main paper');
});

test('conflicting and unverified handbook entries cannot become verified map assignments', () => {
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
test('the published handbook catalog uses valid board and session identities', () => {
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
