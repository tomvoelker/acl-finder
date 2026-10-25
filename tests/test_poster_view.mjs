import test from 'node:test';
import assert from 'node:assert/strict';
import {readPosterLocation, posterMapHref, posterSlotDiffers, parsePosterQuery, matchesPosterQuery} from '../poster-view.mjs';
const slot = {id:'A',label:'Poster Session A',date:'2026-10-25',start:'11:00',end:'12:30',room:'Hall H'};
const sessions = new Map([['A',slot]]);

test('a board link preserves its handbook session so reused numbers remain distinct', () => {
  const poster=readPosterLocation({posterBoard:166,posterSession:'A',posterSourcePage:52},sessions);
  assert.equal(posterMapHref(poster),'poster-map/#session=A&board=166');
  assert.equal(posterMapHref({...poster,id:'B'}),'poster-map/#session=B&board=166');
  assert.equal(poster.page,52);
});
test('unknown sessions, missing data and invalid physical board values produce no location', () => {
  for(const board of [0,425,1.5,'166',null,true]) assert.equal(readPosterLocation({posterBoard:board,posterSession:'A'},sessions),null);
  assert.equal(readPosterLocation({posterBoard:166,posterSession:'unknown'},sessions),null);
  assert.equal(readPosterLocation({},sessions),null);
  assert.equal(posterMapHref(null),null);
});
test('handbook poster times remain distinct from oral or differently scheduled sheet entries', () => {
  const paper={...slot,presentation:'Poster'};
  assert.equal(posterSlotDiffers(paper,slot),false);
  assert.equal(posterSlotDiffers({...paper,room:'Hall'},slot),false);
  for(const change of [{presentation:'Oral'},{date:'2026-10-26'},{start:'11:01'},{end:null},{room:'Zoom'}]) {
    assert.equal(posterSlotDiffers({...paper,...change},slot),true);
  }
  assert.equal(posterSlotDiffers(paper,null),false);
});

test('explicit board queries match a board exactly without paper-ID substring false positives', () => {
  assert.deepEqual(parsePosterQuery('BOARD #200 language'), {boards:[200],text:'language'});
  assert.deepEqual(parsePosterQuery('Tom board200'), {boards:[200],text:'Tom'});
  assert.deepEqual(parsePosterQuery('paper 200-MAIN'), {boards:[],text:'paper 200-MAIN'});
  assert.equal(matchesPosterQuery({poster:{board:200}}, [200]),true);
  assert.equal(matchesPosterQuery({poster:{board:20},id:'200-MAIN'}, [200]),false);
  assert.equal(matchesPosterQuery({poster:null,posterClaimedBoard:311}, [311]),true);
  assert.equal(matchesPosterQuery({poster:{board:200}}, [200,201]),false);
});
