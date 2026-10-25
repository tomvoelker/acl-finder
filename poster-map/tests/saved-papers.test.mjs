import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SAVED_PAPERS_KEY, readSavedPapers} from '../../saved-papers.mjs';
import {sessionGroups, mapEntries, savedAssignments} from '../catalog.mjs';

test('saved papers use the finder key and tolerate malformed or unavailable storage', () => {
  assert.equal(SAVED_PAPERS_KEY, 'emnlp2026-finder.shortlist.v1');
  const storage = {getItem(key) {
    assert.equal(key, SAVED_PAPERS_KEY);
    return JSON.stringify(['paper-a', 'paper-a', 3, null, {}, 'x'.repeat(80), 'valid']);
  }};
  assert.deepEqual([...readSavedPapers(storage)], ['paper-a', 'valid']);
  for (const raw of [null, '', '{bad', '{}', '42', 'null']) {
    assert.deepEqual([...readSavedPapers({getItem: () => raw})], []);
  }
  assert.deepEqual([...readSavedPapers({getItem() { throw new Error('Blocked'); }})], []);
  assert.deepEqual([...readSavedPapers(null)], []);
});

test('a blocked default localStorage getter does not prevent loading saved papers', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', {configurable:true, get() { throw new Error('Blocked'); }});
    assert.deepEqual([...readSavedPapers()], []);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

test('saved board markers are isolated by physical session, include Industry aliases and reject ambiguous positions', () => {
  const sessions = sessionGroups([
    {id:'A',label:'Session A',date:'2026-10-25',start:'11:00',end:'12:30',room:'Hall H'},
    {id:'D',label:'Session D',date:'2026-10-26',start:'11:00',end:'12:30',room:'Hall H'},
    {id:'Industry6',label:'Industry Session 6',date:'2026-10-26',start:'11:00',end:'12:30',room:'Hall H'},
  ]);
  const row = (session,board,paperId,verified=true) => ({session,board,paperId,verified});
  const entries = mapEntries([
    row('A',1,'saved-a'), row('D',1,'unsaved-d'), row('Industry6',2,'saved-industry'),
    row('D',3,'saved-main'), row('D',4,'saved-unverified',false),
    row('D',311,'saved-conflict'), row('Industry6',311,'other-conflict'),
  ], sessions);
  const saved = new Set(['saved-a','saved-industry','saved-main','saved-unverified','saved-conflict']);
  assert.deepEqual([...savedAssignments(entries,'A',saved).keys()], [1]);
  assert.deepEqual([...savedAssignments(entries,'D',saved).keys()], [2,3]);
  assert.deepEqual([...savedAssignments(entries,'D',new Set()).keys()], []);
  assert.deepEqual([...savedAssignments(entries,'missing',saved).keys()], []);
});

test('the published catalog never resolves the D311 conflict into a saved board marker', () => {
  const catalog = JSON.parse(readFileSync(new URL('../../data/poster-boards.json',import.meta.url),'utf8'));
  const entries = mapEntries(catalog.entries, sessionGroups(catalog.sessions));
  const saved = new Set(entries.map(entry => entry.paperId).filter(Boolean));
  const marked = savedAssignments(entries,'D',saved);
  assert.equal(marked.has(311),false);
  for (const entry of marked.values()) assert.equal(entry.verified,true);
  assert.ok(marked.size > 0);
});
