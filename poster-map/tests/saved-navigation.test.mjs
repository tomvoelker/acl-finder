import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionGroups, mapEntries, savedPosterStops, nextSavedPoster} from '../catalog.mjs';

const session = (id,date,start='11:00',room='Hall H') => ({id,label:`Session ${id}`,date,start,end:'12:30',room});
const row = (session,board,paperId,verified=true) => ({session,board,paperId,verified});
const positions = stops => stops.map(stop => `${stop.session}/${stop.board}`);

test('saved stops sort by date, start and board, preserving board reuse and canonical Industry placements', () => {
  const sessions = sessionGroups([
    session('F','2026-10-27'), session('D','2026-10-26'),
    session('Industry6','2026-10-26'), session('B','2026-10-25','15:00'), session('A','2026-10-25'),
  ]);
  const entries = mapEntries([
    row('F',200,'saved-f'), row('D',20,'saved-d'), row('Industry6',2,'saved-industry'),
    row('B',1,'saved-b'), row('A',20,'saved-a20'), row('A',1,'saved-a1'),
  ],sessions);
  const savedIds = [...entries.map(entry => entry.paperId), 'saved-a1', 'saved-industry'];
  const stops = savedPosterStops(entries,sessions,savedIds);
  assert.deepEqual(positions(stops), ['A/1','A/20','B/1','D/2','D/20','F/200']);
  assert.equal(stops[3].entry.sourceSession,'Industry6');
  assert.strictEqual(stops[3].entry,entries[2]);
  assert.deepEqual(entries.map(entry => entry.session), ['F','D','D','B','A','A']);
});

test('simultaneous physical sessions use board ordering and a deterministic canonical ID tie break', () => {
  const sessions = sessionGroups([
    session('Z','2026-10-25','11:00','Hall Z'), session('A','2026-10-25','11:00','Hall A'),
  ]);
  const entries = mapEntries([row('Z',2,'z2'),row('Z',1,'z1'),row('A',1,'a1')],sessions);
  assert.deepEqual(positions(savedPosterStops(entries,sessions,new Set(['z2','z1','a1']))), ['A/1','Z/1','Z/2']);
});

test('unverified and conflicting saved assignments are excluded, including cross-alias D311 conflicts', () => {
  const sessions = sessionGroups([session('D','2026-10-26'),session('Industry6','2026-10-26')]);
  const entries = mapEntries([
    row('D',311,'saved-conflict'), row('Industry6',311,'unsaved-conflict'),
    row('D',10,'unverified',false), row('D',11,'missing-flag',undefined),
    row('D',12,'confirmed'),row('D',13,'unsaved'),
  ],sessions);
  delete entries[3].verified;
  const stops = savedPosterStops(entries,sessions,new Set(['saved-conflict','unverified','missing-flag','confirmed']));
  assert.deepEqual(positions(stops), ['D/12']);
  assert.deepEqual(savedPosterStops(entries,sessions,new Set()), []);
});

test('navigation moves across sessions and wraps, matching the selected physical session and board together', () => {
  const stops = [
    {session:'A',board:1}, {session:'A',board:20}, {session:'D',board:1}, {session:'F',board:200},
  ];
  assert.strictEqual(nextSavedPoster(stops,'A',1),stops[1]);
  assert.strictEqual(nextSavedPoster(stops,'A',20),stops[2]);
  assert.strictEqual(nextSavedPoster(stops,'D',1),stops[3]);
  assert.strictEqual(nextSavedPoster(stops,'F',200),stops[0]);
  assert.strictEqual(nextSavedPoster(stops,'D',20),stops[2]);
  assert.strictEqual(nextSavedPoster(stops,'D',null),stops[2]);
  assert.strictEqual(nextSavedPoster(stops,'B',1),stops[0]);
});

test('empty and single-stop navigation remain usable', () => {
  assert.equal(nextSavedPoster([],'A',1),null);
  const stop = {session:'F',board:200};
  assert.strictEqual(nextSavedPoster([stop],'A',null),stop);
  assert.strictEqual(nextSavedPoster([stop],'F',200),stop);
});


test('saved demos sort naturally after numeric boards with canonical sessions and board reuse', () => {
  const sessions=sessionGroups([session('A','2026-10-25'),session('D','2026-10-26'),session('Demo2','2026-10-26')]);
  const entries=mapEntries([
    row('D','D12','last'),row('A','D1','first-day'),row('Demo2','D2','demo-alias'),
    row('D',424,'numeric'),row('D','D10','ten'),row('D','D1','one'),row('D',1,'first-numeric'),
  ],sessions);
  const stops=savedPosterStops(entries,sessions,entries.map(entry=>entry.paperId));
  assert.deepEqual(positions(stops),['A/D1','D/1','D/424','D/D1','D/D2','D/D10','D/D12']);
  assert.equal(stops[4].entry.sourceSession,'Demo2');
  assert.strictEqual(nextSavedPoster(stops,'D',424),stops[3]);
  assert.strictEqual(nextSavedPoster(stops,'D','D1'),stops[4]);
  assert.strictEqual(nextSavedPoster(stops,'D','D12'),stops[0]);
  assert.strictEqual(nextSavedPoster(stops,'A','D1'),stops[1]);
});

test('demo alias conflicts and unverified demos stay out of saved navigation', () => {
  const sessions=sessionGroups([session('D','2026-10-26'),session('Demo2','2026-10-26')]);
  const entries=mapEntries([row('D','D1','conflict'),row('Demo2','D1','other'),row('D','D2','unverified',false),row('Demo2','D12','confirmed'),row('D',1,'numeric')],sessions);
  const stops=savedPosterStops(entries,sessions,new Set(['conflict','unverified','confirmed','numeric']));
  assert.deepEqual(positions(stops),['D/1','D/D12']);
});
