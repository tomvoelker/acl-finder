import test from 'node:test';
import assert from 'node:assert/strict';
import {readPosterLocation, posterMapHref, posterSlotDiffers, parsePosterQuery, matchesPosterQuery, posterBrowseDay, posterGroups, isPosterBoard, posterBoardOrder} from '../poster-view.mjs';
const slot = {id:'A',label:'Poster Session A',date:'2026-10-25',start:'11:00',end:'12:30',room:'Hall H'};
const sessions = new Map([['A',slot]]);

test('a board link preserves its schedule session so reused numbers remain distinct', () => {
  const poster=readPosterLocation({posterBoard:166,posterSession:'A',posterSourceRow:52},sessions);
  assert.equal(posterMapHref(poster),'poster-map/#session=A&board=166');
  assert.equal(posterMapHref({...poster,id:'B'}),'poster-map/#session=B&board=166');
  assert.equal(poster.sourceRow,52);
});
test('unknown sessions, missing data and invalid physical board values produce no location', () => {
  for(const board of [0,425,1.5,'166',null,true]) assert.equal(readPosterLocation({posterBoard:board,posterSession:'A'},sessions),null);
  assert.equal(readPosterLocation({posterBoard:166,posterSession:'unknown'},sessions),null);
  assert.equal(readPosterLocation({},sessions),null);
  assert.equal(posterMapHref(null),null);
});
test('schedule poster times remain distinct from oral or differently scheduled sheet entries', () => {
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
  assert.deepEqual(parsePosterQuery('board #d10 demo'), {boards:['D10'],text:'demo'});
  assert.equal(matchesPosterQuery({board:'D1'}, ['D1']),true);
  assert.equal(matchesPosterQuery({board:'D10'}, ['D1']),false);
  assert.equal(matchesPosterQuery({board:'D1'}, [1]),false);
  assert.equal(readPosterLocation({board:'D1'},sessions),null);
});

test('poster browsing uses schedule dates independently of sheet presentation details', () => {
  for (const presentation of ['Oral', 'Virtual', 'Poster', null]) {
    const paper = { presentation, date: '2026-10-27', _day: '2026-10-27', poster: slot };
    assert.equal(posterBrowseDay(paper), '2026-10-25');
    assert.equal(posterBrowseDay({ ...paper, _inactive: true }), null);
  }
  assert.equal(posterBrowseDay({ presentation: 'Poster', _day: 'undated' }), 'undated');
  assert.equal(posterBrowseDay({ presentation: 'Poster', _day: '2026-10-26' }), '2026-10-26');
  assert.equal(posterBrowseDay({ presentation: 'Virtual', posterIssue: 'Board unconfirmed', _day: '2026-10-26' }), null);
  assert.equal(posterBrowseDay({ presentation: null, posterIssue: 'Board unconfirmed', _day: '2026-10-26' }), '2026-10-26');
  for (const presentation of ['Oral', 'Virtual', null]) {
    assert.equal(posterBrowseDay({ presentation, _day: '2026-10-25' }), null);
  }
});

test('poster groups use schedule session IDs, retain sheet details and suppress inactive entries', () => {
  const later = { ...slot, id: 'F', label: 'Poster Session F', date: '2026-10-27', start: '09:00', end: '10:30' };
  const d = { ...slot, id: 'D', date: '2026-10-26' };
  const industry = d;
  const oral = { id: 'oral', presentation: 'Oral', date: '2026-10-27', start: '16:00', room: 'F7', _day: '2026-10-27', poster: slot };
  const virtual = { id: 'virtual', presentation: 'Virtual', _day: 'undated', poster: slot };
  const unconfirmed = { id: 'conflict', presentation: 'Poster', _day: '2026-10-26', posterIssue: 'Board unconfirmed' };
  const unknown = { id: 'no-board', presentation: 'Poster', _day: 'undated' };
  const papers = [
    { id: 'late', poster: later }, { id: 'industry', poster: industry }, unconfirmed,
    oral, { id: 'inactive', poster: slot, _inactive: true }, { id: 'd', poster: d },
    virtual, unknown, { id: 'ordinary-oral', presentation: 'Oral', _day: '2026-10-25' },
  ];
  const before = structuredClone(papers);
  const groups = posterGroups(papers);
  assert.deepEqual(groups.map(([id]) => id), ['A', 'D', 'F', 'unconfirmed']);
  assert.deepEqual(groups[0][1], { slot, papers: [oral, virtual] });
  assert.deepEqual(groups.at(-1)[1], { slot: null, papers: [unconfirmed, unknown] });
  assert.deepEqual(papers, before, 'Poster projection does not rewrite source schedules');
  assert.equal(groups[0][1].papers[0].room, 'F7');
  assert.equal(groups[0][1].papers[0].presentation, 'Oral');
  assert.deepEqual(posterGroups([]), []);
});


test('physical board identity accepts numeric posters and canonical demo sides only', () => {
  for (const board of [1,424,...Array.from({length:12},(_,i)=>`D${i+1}`)]) assert.equal(isPosterBoard(board),true,String(board));
  for (const board of [0,425,1.5,'1','d1','D0','D13','D01','D1 ',null,true]) assert.equal(isPosterBoard(board),false,String(board));
  assert.deepEqual(['D12',424,'D2',1,'D10','D1'].sort((a,b)=>posterBoardOrder(a)-posterBoardOrder(b)),[1,424,'D1','D2','D10','D12']);
});

test('demo map links retain source rows and require an existing schedule session', () => {
  for (const board of ['D1','D7','D11','D12']) {
    const poster=readPosterLocation({posterBoard:board,posterSession:'A',posterSourceRow:70},sessions);
    assert.equal(poster.board,board);
    assert.equal(poster.label,'Demo Session A');
    assert.equal(poster.sourceRow,70);
    assert.equal(posterMapHref(poster),`poster-map/#session=A&board=${board}`);
    assert.equal(readPosterLocation({posterBoard:board,posterSession:'unknown'},sessions),null);
  }
});

test('demo schedule comparisons accept Demo presentation and still check time and room', () => {
  const poster={...slot,board:'D12'}, paper={...slot,presentation:'Demo'};
  assert.equal(posterSlotDiffers(paper,poster),false);
  assert.equal(posterSlotDiffers({...paper,room:'Hall'},poster),false);
  for (const change of [{presentation:'Oral'},{date:'2026-10-26'},{start:'11:01'},{end:null},{room:'Zoom'}]) {
    assert.equal(posterSlotDiffers({...paper,...change},poster),true);
  }
  assert.equal(posterSlotDiffers(paper,{...slot,board:12}),true);
});

test('explicit demo queries include all twelve sides and preserve numeric identity', () => {
  for (const board of ['D1','D7','D11','D12']) {
    assert.deepEqual(parsePosterQuery(`board #${board.toLowerCase()} demo`),{boards:[board],text:'demo'});
    assert.equal(matchesPosterQuery({poster:{board}},[board]),true);
    assert.equal(matchesPosterQuery({board},[board]),true);
  }
  for (const board of ['D0','D13','D01']) assert.deepEqual(parsePosterQuery(`board ${board}`),{boards:[],text:`board ${board}`});
  assert.equal(matchesPosterQuery({poster:{board:'D12'}},[12]),false);
});
