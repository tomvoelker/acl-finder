// Geometry reconstructed from the supplied venue photograph, rotated upright.
// Pairs are the two visible faces of one stand, in drawing order (top, bottom).
// Outside labels in the photo are often displaced. This is a schematic, not a survey.
const a = [
  [[97,96],[98,95],[99,94],[100,93]],
  [[89,88],[90,87],[91,86],[92,85]],
  [[82,81],[83,80],[84,79]],
  [[76,75],[77,74],[78,73]],
  [[69,68],[70,67],[71,66],[72,65]],
  [[61,60],[62,59],[63,58],[64,57]],
  [[54,53],[55,52],[56,51]],
  [[48,47],[49,46],[50,45]],
  [[41,40],[42,39],[43,38],[44,37]],
  [[33,32],[34,31],[35,30],[36,29]],
  [[26,25],[27,24],[28,23]],
  [[20,19],[21,18],[22,17]],
  [[13,12],[14,11],[15,10],[16,9]],
  [[5,4],[6,3],[7,2],[8,1]],
];
const b = [
  [[101,108],[102,107],[103,106],[104,105]],
  [[109,116],[110,115],[111,114],[112,113]],
  [[117,122],[118,121],[119,120]],
  [[123,128],[124,127],[125,126]],
  [[129,136],[130,135],[131,134],[132,133]],
  [[137,144],[138,143],[139,142],[140,141]],
  [[145,150],[146,149],[147,148]],
  [[151,156],[152,155],[153,154]],
  [[157,164],[158,163],[159,162],[160,161]],
  [[165,172],[166,171],[167,170],[168,169]],
  [[173,178],[174,177],[175,176]],
  [[179,184],[180,183],[181,182]],
  [[185,192],[186,191],[187,190],[188,189]],
  [[193,197],[194,198],[195,199],[196,200]],
];
const c = [
  [[297,293],[298,294],[299,295],[300,296]],
  [[292,285],[291,286],[290,287],[289,288]],
  [[284,279],[283,280],[282,281]],
  [[278,273],[277,274],[276,275]],
  [[272,265],[271,266],[270,267],[269,268]],
  [[264,257],[263,258],[262,259],[261,260]],
  [[256,251],[255,252],[254,253]],
  [[250,245],[249,246],[248,247]],
  [[244,237],[243,238],[242,239],[241,240]],
  [[236,229],[235,230],[234,231],[233,232]],
  [[223,228],[224,227],[225,226]],
  [[217,222],[218,221],[219,220]],
  [[216,209],[215,210],[214,211],[212,213]],
  [[208,201],[207,202],[206,203],[204,205]],
];
const d = [
  [[301,308],[302,307],[303,306],[304,305]],
  [[309,316],[310,315],[311,314],[312,313]],
  [[317,322],[318,321],[319,320]],
  [[323,328],[324,327],[325,326]],
  [[329,336],[330,335],[331,334],[332,333]],
  [[337,344],[338,343],[339,342],[340,341]],
  [[345,350],[346,349],[347,348]],
  [[351,356],[352,355],[353,354]],
  [[357,364],[358,363],[359,362],[360,361]],
  [[365,372],[366,371],[367,370],[368,369]],
  [[373,378],[374,377],[375,376]],
  [[379,384],[380,383],[381,382]],
  [[385,392],[386,391],[387,390],[388,389]],
  [[393,400],[394,399],[395,398],[396,397]],
  [[401,406],[402,405],[403,404]],
  [[407,412],[408,411],[409,410]],
  [[413,418],[414,417],[415,416]],
  [[419,424],[420,423],[421,422]],
];

export const MAP = { width: 1320, height: 1280, faceWidth: 43, faceHeight: 23 };
export const BANKS = [
  { id: 'A', x: 46, label: '1–100', rows: a },
  { id: 'B', x: 386, label: '101–200', rows: b },
  { id: 'C', x: 726, label: '201–300', rows: c },
  { id: 'D', x: 1066, label: '301–424', rows: d },
];
export const YELLOW = new Set([197,198,199,200,297,298,299,300]);
export const MARKERS = [
  {id:'B1',x:326,y:90},{id:'B2',x:326,y:537},{id:'B3',x:326,y:977},
  {id:'B6',x:666,y:90},{id:'B5',x:666,y:537},{id:'B4',x:666,y:977},
  {id:'B7',x:1006,y:90},{id:'B8',x:1006,y:537},{id:'B9',x:1006,y:977},
  {id:'B10',x:1006,y:1150},
];
// Preserve the printed labels, including its repeated Section 5. Bank letters
// are navigation aids added by this prototype, not official venue identifiers.
export const LABELS = [
  {bank:'A',y:530,text:'Section 2'}, {bank:'A',y:977,text:'Section 1'},
  {bank:'B',y:530,text:'Section 3'}, {bank:'B',y:977,text:'Section 5'},
  {bank:'C',y:530,text:'Section 6'}, {bank:'C',y:977,text:'Section 5'},
  {bank:'D',y:530,text:'Section 7'}, {bank:'D',y:977,text:'Section 8'},
  {bank:'D',y:1250,text:'Section 9'},
];

export const BOARDS = BANKS.flatMap(bank => bank.rows.flatMap((row, rowIndex) => {
  const start = bank.x + (row.length === 3 ? 31 : 0);
  const y = 104 + rowIndex * 60 + (rowIndex >= 7 ? 26 : 0) + (rowIndex >= 14 ? 26 : 0);
  return row.flatMap((pair, column) => pair.map((number, face) => ({
    number, bank: bank.id, row: rowIndex, column, face,
    x: start + column * 59, y: y + face * MAP.faceHeight,
    yellow: YELLOW.has(number), needsReview: number >= 41 && number <= 56,
  })));
}));
export const BOARD_BY_NUMBER = new Map(BOARDS.map(board => [board.number, board]));

// User-confirmed opposing sides: D1/D7, D2/D8, and so on. D7 faces 201.
// Spacing remains schematic and does not establish verified paper locations.
export const DEMO_BOARDS = Array.from({length:6}, (_, column) => [
  {id:`D${column + 7}`, x:BOARD_BY_NUMBER.get(201).x + column * 52, y:1080},
  {id:`D${column + 1}`, x:BOARD_BY_NUMBER.get(201).x + column * 52, y:1080 + MAP.faceHeight},
]).flat();

