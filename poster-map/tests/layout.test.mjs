import test from 'node:test';
import assert from 'node:assert/strict';
import {MAP, BOARDS, BOARD_BY_NUMBER, MARKERS, YELLOW} from '../layout.mjs';

test('the reconstruction contains every numbered position exactly once and inside the map', () => {
  assert.equal(BOARDS.length,424);
  assert.equal(BOARD_BY_NUMBER.size,424);
  assert.deepEqual([...BOARD_BY_NUMBER.keys()].sort((a,b)=>a-b),Array.from({length:424},(_,i)=>i+1));
  const occupied = new Set();
  for (const board of BOARDS) {
    assert.ok(board.x >= 0 && board.x+MAP.faceWidth <= MAP.width);
    assert.ok(board.y >= 0 && board.y+MAP.faceHeight <= MAP.height);
    const coordinate = `${board.x},${board.y}`;
    assert.ok(!occupied.has(coordinate),`Two faces occupy ${coordinate}`);
    occupied.add(coordinate);
  }
  assert.equal(MARKERS.length,10);
  assert.equal(new Set(MARKERS.map(marker=>marker.id)).size,10);
  assert.deepEqual([...YELLOW].sort((a,b)=>a-b),[197,198,199,200,297,298,299,300]);
});

test('clear source anchors retain their pairing and the two highlighted edges', () => {
  for (const [upper,lower] of [[323,328],[324,327],[325,326],[351,356],[352,355],[353,354],[419,424]]) {
    const a=BOARD_BY_NUMBER.get(upper),b=BOARD_BY_NUMBER.get(lower);
    assert.equal(a.x,b.x); assert.equal(a.y+MAP.faceHeight,b.y);
  }
  assert.equal(BOARD_BY_NUMBER.get(197).face,1);
  assert.equal(BOARD_BY_NUMBER.get(297).face,0);
  assert.ok(BOARD_BY_NUMBER.get(49).needsReview);
});

