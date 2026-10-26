import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateTopics, topicForEntry, topicChoices, topicEntries, matchesTopic, AREA_COLORS} from '../poster-map/topics.mjs';
import {sessionGroups, mapEntries, assignmentAt} from '../poster-map/catalog.mjs';

const data = () => ({version:2, areas:[{id:0,label:'Language'},{id:1,label:'Reasoning'}], topics:[{id:0,area:0,label:'Translation'},{id:1,area:1,label:'Maths'}], sessions:{A:{assignments:[{board:1,paperId:'x',title:'Example',topic:0},{board:2,paperId:'y',title:'Unknown',topic:null},{board:3,paperId:'z',title:'Proofs',topic:1}]}}});
const entry = {session:'A',board:1,paperId:'x',title:'Example',verified:true};
const entries = () => data().sessions.A.assignments.map(row=>({...row,verified:true}));

test('topic lookup requires the same session, board, title, paper and verified assignment', () => {
  assert.equal(topicForEntry(data(),'A',entry).label, 'Translation');
  for (const changed of [{board:2},{paperId:'y'},{title:'Changed'}, {verified:false}]) assert.equal(topicForEntry(data(),'A',{...entry,...changed}),null);
  assert.equal(topicForEntry(data(),'B',entry),null);
  assert.equal(topicForEntry(null,'A',entry),null);
  assert.equal(topicForEntry(data(),'A',null),null);
  assert.equal(topicForEntry(data(),'A',entries()[1]),null);
});

test('selectors count verified posters and keep missing Atlas entries explicit', () => {
  const choices = topicChoices(data(),'A',[...entries(),{...entry,verified:false}]);
  assert.deepEqual(choices.areas.map(row=>[row.label,row.count]), [['Language',1],['Reasoning',1]]);
  assert.equal(choices.unclassified,1);
  assert.deepEqual(choices.topics.map(row=>row.label),['Maths','Translation']);
});

test('malformed topics, duplicate boards and unknown parent areas are rejected', () => {
  assert.equal(validateTopics(data()).version,2);
  for (const change of [d=>d.version=1, d=>d.areas.push(d.areas[0]), d=>d.areas[0].id=16,
    d=>d.sessions.A.assignments.push(d.sessions.A.assignments[0]), d=>d.sessions.A.assignments[0].topic=99,
    d=>d.topics[0].area=99, d=>d.topics[0].label='',d=>delete d.sessions.A.assignments[1].topic]) {
    const invalid=data(); change(invalid); assert.throws(()=>validateTopics(invalid));
  }
});

test('browsing uses board order and supports areas, fine topics, and unclassified posters', () => {
  const all = entries().reverse();
  assert.deepEqual(topicEntries(data(),'A',all).map(row=>row.board),[1,2,3]);
  assert.deepEqual(topicEntries(data(),'A',all,0).map(row=>row.board),[1]);
  assert.deepEqual(topicEntries(data(),'A',all,null,1).map(row=>row.board),[3]);
  assert.deepEqual(topicEntries(data(),'A',all,'unclassified').map(row=>row.board),[2]);
  assert.equal(matchesTopic(null,0),false);
  assert.equal(matchesTopic(null,'unclassified'),true);
  assert.deepEqual(topicEntries(data(),'A',all,0,1),[]);
});

test('area colours and labels stay identical between sessions', () => {
  const topics=data(); topics.sessions.B=structuredClone(topics.sessions.A);
  assert.deepEqual(topicForEntry(topics,'A',entry),topicForEntry(topics,'B',entry));
  assert.equal(topicForEntry(topics,'A',entry).color, AREA_COLORS[0]);
});

test('topic swatches retain text contrast and basic colour separation', () => {
  const linear = hex => hex.match(/[a-f\d]{2}/gi).map(n => {
    const v=parseInt(n,16)/255; return v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4;
  });
  const luminance = rgb => .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
  const lab = rgb => {
    const [r,g,b]=rgb;
    const xyz=[(.4124564*r+.3575761*g+.1804375*b)/.95047, .2126729*r+.7151522*g+.072175*b, (.0193339*r+.119192*g+.9503041*b)/1.08883]
      .map(v=>v>.008856 ? Math.cbrt(v) : 7.787*v+16/116);
    return [116*xyz[1]-16,500*(xyz[0]-xyz[1]),200*(xyz[1]-xyz[2])];
  };
  const colors=AREA_COLORS.map(linear), ink=luminance(linear('#202733'));
  for (const rgb of colors) assert.ok((luminance(rgb)+.05)/(ink+.05)>=4.5, 'board text needs AA contrast');
  const labs=colors.map(lab);
  for(let i=0;i<labs.length;i++) for(let j=i+1;j<labs.length;j++) {
    const distance=Math.hypot(...labs[i].map((v,k)=>v-labs[j][k]));
    assert.ok(distance>=18, `swatches ${i} and ${j} are too similar: ${distance}`);
  }
});


test('published Atlas assignments cover all unambiguous boards without classifying missing papers', () => {
  const catalog=JSON.parse(readFileSync(new URL('../data/poster-boards.json',import.meta.url)));
  const topics=validateTopics(JSON.parse(readFileSync(new URL('../data/poster-topics.json',import.meta.url))));
  const audit=JSON.parse(readFileSync(new URL('../data/atlas/audit.json',import.meta.url)));
  const sessions=sessionGroups(catalog.sessions), entries=mapEntries(catalog.entries,sessions);
  let classified=0, unclassified=0;
  for (const session of sessions) {
    const current=entries.filter(e=>e.session===session.id);
    const valid=current.filter(e=>assignmentAt(entries,session.id,e.board).entry);
    assert.deepEqual(topics.sessions[session.id].assignments.map(e=>e.board),valid.map(e=>e.board).sort((a,b)=>a-b));
    for (const entry of current) {
      const assignment=assignmentAt(entries,session.id,entry.board).entry;
      if (!assignment) assert.equal(topics.sessions[session.id].assignments.some(a=>a.board===entry.board),false);
      else if(topicForEntry(topics,session.id,assignment)) classified++;
      else { unclassified++; assert.ok(audit.unclassified.some(e=>e.session===session.id&&e.board===entry.board)); }
    }
    const choices=topicChoices(topics,session.id,valid);
    assert.equal(choices.areas.length,16);
    assert.equal(choices.topics.reduce((n,t)=>n+t.count,0)+choices.unclassified,valid.length);
  }
  assert.equal(classified,2803); assert.equal(unclassified,28);
});
