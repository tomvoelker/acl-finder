import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateTopics, topicForEntry, topicGroups, topicEntries, TOPIC_COLORS} from '../poster-map/topics.mjs';
import {sessionGroups, mapEntries, assignmentAt} from '../poster-map/catalog.mjs';

const data = () => ({version:1, sessions:{A:{groups:[{id:0,label:'Translation'}], assignments:[{board:1,paperId:'x',title:'Example',group:0,margin:.1}]} }});
const entry = {session:'A',board:1,paperId:'x',title:'Example',verified:true};

test('topic lookup requires the same session, board, title, paper and verified assignment', () => {
  assert.equal(topicForEntry(data(),'A',entry).label, 'Translation');
  for (const changed of [{board:2},{paperId:'y'},{title:'Changed'}, {verified:false}]) {
    assert.equal(topicForEntry(data(),'A',{...entry,...changed}),null);
  }
  assert.equal(topicForEntry(data(),'B',entry),null);
  assert.equal(topicForEntry(null,'A',entry),null);
  assert.equal(topicForEntry(data(),'A',null),null);
});

test('legend counts only current verified entries', () => {
  assert.equal(topicGroups(data(),'A',[entry,{...entry,board:2}])[0].count,1);
  assert.deepEqual(topicGroups(data(),'B',[entry]),[]);
});

test('malformed groups, duplicate boards and nonexistent groups are rejected', () => {
  assert.equal(validateTopics(data()).version,1);
  for (const change of [d => d.version=2, d => d.sessions.A.groups.push({id:0,label:'Duplicate'}),
    d => d.sessions.A.assignments.push({...entry,group:0}), d => d.sessions.A.assignments[0].group=99,
    d => d.sessions.A.groups[0].label='', d => delete d.sessions.A.assignments[0].margin,
    d => d.sessions.A.assignments[0].margin=NaN]) {
    const invalid=data(); change(invalid); assert.throws(() => validateTopics(invalid));
  }
});

test('topic browsing ranks margins, keeps low-margin papers and breaks ties by board', () => {
  const topics = data();
  topics.sessions.A.assignments = [
    {...topics.sessions.A.assignments[0], margin:-.01},
    {...topics.sessions.A.assignments[0], board:3, margin:.3},
    {...topics.sessions.A.assignments[0], board:2, margin:.3}
  ];
  const entries = topics.sessions.A.assignments.map(row => ({...row, verified:true}));
  assert.deepEqual(topicEntries(topics,'A',entries,0).map(row=>row.board),[2,3,1]);
  assert.deepEqual(topicEntries(topics,'B',entries,0),[]);
});

test('legend sorts by label with mixed groups last', () => {
  const topics = data();
  topics.sessions.A.groups = [{id:0,label:'Alpha (mixed)'},{id:1,label:'Zebra'},{id:2,label:'Agents'}];
  topics.sessions.A.assignments = topics.sessions.A.groups.map(g => ({board:g.id+1,paperId:'x',title:'Example',group:g.id,margin:.1}));
  assert.deepEqual(topicGroups(topics,'A',topics.sessions.A.assignments.map(row=>({...row,verified:true}))).map(g=>g.id),[2,1,0]);
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
  const colors=TOPIC_COLORS.map(linear), ink=luminance(linear('#202733'));
  for (const rgb of colors) assert.ok((luminance(rgb)+.05)/(ink+.05)>=4.5, 'board text needs AA contrast');
  const labs=colors.map(lab);
  for(let i=0;i<labs.length;i++) for(let j=i+1;j<labs.length;j++) {
    const distance=Math.hypot(...labs[i].map((v,k)=>v-labs[j][k]));
    assert.ok(distance>=18, `swatches ${i} and ${j} are too similar: ${distance}`);
  }
});

test('published experimental topics cover exactly the unambiguous physical poster assignments', () => {
  const catalog=JSON.parse(readFileSync(new URL('../data/poster-boards.json',import.meta.url)));
  const topics=validateTopics(JSON.parse(readFileSync(new URL('../data/poster-topics.json',import.meta.url))));
  const sessions=sessionGroups(catalog.sessions), entries=mapEntries(catalog.entries,sessions);
  let verified=0;
  for (const session of sessions) {
    const current=entries.filter(e => e.session===session.id);
    for (const entry of current) {
      const assignment=assignmentAt(entries,session.id,entry.board).entry;
      if (assignment) { assert.ok(topicForEntry(topics,session.id,assignment),`${session.id} board ${entry.board}`); verified++; }
      else assert.equal(topics.sessions[session.id].assignments.some(a => a.board===entry.board),false);
    }
    assert.equal(topicGroups(topics,session.id,current).reduce((n,g)=>n+g.count,0),topics.sessions[session.id].assignments.length);
  }
  assert.equal(verified, Object.values(topics.sessions).reduce((n,s)=>n+s.assignments.length,0));
});
