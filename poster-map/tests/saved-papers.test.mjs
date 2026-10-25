import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SAVED_PAPERS_KEY, DEFAULT_SAVED_PAPER_ID, readSavedPapers, isDefaultSavedList, setSavedPaper, addSavedPapers} from '../../saved-papers.mjs';
import {sessionGroups, mapEntries, savedAssignments} from '../catalog.mjs';

test('saved papers use the finder key and tolerate malformed or unavailable storage', () => {
  assert.equal(SAVED_PAPERS_KEY, 'emnlp2026-finder.shortlist.v1');
  const storage = {getItem(key) {
    assert.equal(key, SAVED_PAPERS_KEY);
    return JSON.stringify(['paper-a', 'paper-a', 3, null, {}, 'x'.repeat(80), 'valid']);
  }};
  assert.deepEqual([...readSavedPapers(storage)], ['paper-a', 'valid']);
  for (const raw of ['', '{bad', '{}', '42', 'null']) {
    assert.deepEqual([...readSavedPapers({getItem: () => raw})], []);
  }
  assert.deepEqual([...readSavedPapers({getItem() { throw new Error('Blocked'); }})], []);
  assert.deepEqual([...readSavedPapers(null)], []);
});

test('a missing saved list starts with the authors poster without writing storage', () => {
  const storage = { getItem: () => null };
  assert.equal(isDefaultSavedList(storage), true);
  assert.deepEqual([...readSavedPapers(storage)], [DEFAULT_SAVED_PAPER_ID]);
  const catalog = JSON.parse(readFileSync(new URL('../../data/poster-boards.json',import.meta.url),'utf8'));
  const entry = catalog.entries.find(entry => entry.paperId === DEFAULT_SAVED_PAPER_ID);
  assert.equal(entry.verified, true);
  assert.equal(entry.session, 'F');
  assert.equal(entry.board, 200);
});

test('existing and explicitly emptied lists never get the default paper added back', () => {
  let stored = null;
  const storage = { getItem: () => stored };
  const saved = readSavedPapers(storage);
  saved.delete(DEFAULT_SAVED_PAPER_ID);
  stored = JSON.stringify([...saved]);
  assert.equal(isDefaultSavedList(storage), false);
  assert.deepEqual([...readSavedPapers(storage)], []);
  stored = JSON.stringify(['someone-else']);
  assert.deepEqual([...readSavedPapers(storage)], ['someone-else']);
  assert.equal(isDefaultSavedList(null), false);
  assert.equal(isDefaultSavedList({getItem() { throw new Error('Blocked'); }}), false);
});

test('map saves merge the latest list and unstar the default without restoring it', () => {
  let stored = null;
  const storage = {
    getItem: () => stored,
    setItem(key, value) { assert.equal(key, SAVED_PAPERS_KEY); stored = value; },
  };
  assert.deepEqual([...setSavedPaper(DEFAULT_SAVED_PAPER_ID, false, storage)], []);
  assert.deepEqual([...readSavedPapers(storage)], []);
  stored = JSON.stringify(['saved-in-another-tab']);
  assert.deepEqual([...setSavedPaper('map-paper', true, storage)], ['saved-in-another-tab','map-paper']);
  stored = JSON.stringify(['saved-in-another-tab','map-paper','newer-tab-save']);
  assert.deepEqual([...setSavedPaper('map-paper', false, storage)], ['saved-in-another-tab','newer-tab-save']);
  assert.deepEqual([...readSavedPapers(storage)], ['saved-in-another-tab','newer-tab-save']);
});

test('failed map storage reads never overwrite an existing list and failed writes report failure', () => {
  let writes = 0;
  const blockedRead = { getItem() { throw new Error('Blocked'); }, setItem() { writes++; } };
  assert.equal(setSavedPaper('paper', true, blockedRead), null);
  assert.equal(writes, 0);
  const blockedWrite = { getItem: () => '["existing"]', setItem() { throw new Error('Full'); } };
  assert.equal(setSavedPaper('paper', true, blockedWrite), null);
  for (const id of ['', null, 1, 'x'.repeat(80)]) assert.equal(setSavedPaper(id, true, blockedRead), null);
});

test('shared list import uses the exact list on new devices and merges real existing picks', () => {
  let stored = null;
  const storage = { getItem: () => stored, setItem(key, value) { assert.equal(key, SAVED_PAPERS_KEY); stored = value; } };
  assert.deepEqual([...addSavedPapers(['843-MAIN','156-MAIN'], storage)], ['843-MAIN','156-MAIN']);
  assert.equal(readSavedPapers(storage).has(DEFAULT_SAVED_PAPER_ID), false, 'Import does not inject the virtual starter');
  stored = '["local-paper","843-MAIN"]';
  assert.deepEqual([...addSavedPapers(['843-MAIN','156-MAIN'], storage)], ['local-paper','843-MAIN','156-MAIN']);
  assert.deepEqual([...readSavedPapers(storage)], ['local-paper','843-MAIN','156-MAIN']);
});

test('failed or invalid shared imports leave existing saved papers untouched', () => {
  let stored = '["local-paper"]';
  const storage = { getItem: () => stored, setItem(_, value) { stored = value; } };
  assert.equal(addSavedPapers(['valid', null], storage), null);
  assert.equal(stored, '["local-paper"]');
  assert.equal(addSavedPapers(['paper'], {getItem() { throw new Error('Blocked'); }}), null);
  assert.equal(addSavedPapers(['paper'], {getItem:()=>stored, setItem() { throw new Error('Full'); }}), null);
  assert.equal(stored, '["local-paper"]');
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
