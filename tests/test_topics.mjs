import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateTopics, topicForEntry, topicGroups} from '../poster-map/topics.mjs';
import {sessionGroups, mapEntries, assignmentAt} from '../poster-map/catalog.mjs';

const data = () => ({version:1, sessions:{A:{groups:[{id:0,label:'Translation'}], assignments:[{board:1,paperId:'x',title:'Example',group:0}]} }});
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
    d => d.sessions.A.groups[0].label='']) {
    const invalid=data(); change(invalid); assert.throws(() => validateTopics(invalid));
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
