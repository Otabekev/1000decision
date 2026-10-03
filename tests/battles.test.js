'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../js/battles.js');

const NOW = new Date(2026, 9, 3, 12, 0, 0);
function ago(d, h = 10) { const x = new Date(NOW); x.setDate(x.getDate() - d); x.setHours(h, 0, 0, 0); return x.toISOString(); }
function battle(id, title, area, startAgo, endAgo, extra = {}) {
  return Object.assign({ id, title, area, weight: 3, startedAt: ago(startAgo), status: endAgo == null ? 'active' : 'won', endedAt: endAgo == null ? null : ago(endAgo), helped: [], note: '', updates: [] }, extra);
}

test('days count from start (day 1) to end or today', () => {
  assert.equal(B.days(battle('a', 'x', 'Money', 5, 0), NOW), 6);
  assert.equal(B.days(battle('b', 'x', 'Money', 5, null), NOW), 6);
});

test('summary and typical length per area', () => {
  const list = [battle('a', 'Client did not pay', 'Money', 60, 43), battle('b', 'Late payment', 'Money', 30, 21), battle('c', 'Back pain', 'Health', 20, 15), battle('d', 'Lost client', 'Money', 4, null)];
  const s = B.summary(list, NOW);
  assert.deepEqual([s.fought, s.over, s.open], [4, 3, 1]);
  assert.equal(B.typicalDays(list, 'Money').days, 14); // 18 and 10
  assert.equal(B.typicalDays(list, 'Work').basis, 'all');
});

test('been here before prefers same area, then similar words', () => {
  const list = [battle('a', 'Client did not pay', 'Money', 60, 43, { note: 'Make the calls' }), battle('b', 'Fight with brother', 'Family', 30, 21), battle('c', 'Client left', 'Work', 20, 15)];
  const hits = B.beenHere(list, 'Money', 'Lost my biggest client');
  assert.equal(hits[0].id, 'a');
  assert.equal(hits[1].id, 'c');
  assert.equal(B.beenHere(list, 'Health', 'Back pain').length, 0);
});

test('repeats flag 3+ battles in an area within 6 months', () => {
  const list = [battle('a', 'x', 'Money', 150, 130), battle('b', 'y', 'Money', 90, 70), battle('c', 'z', 'Money', 10, null), battle('d', 'q', 'Work', 10, 5)];
  const r = B.repeats(list, NOW);
  assert.equal(r.length, 1);
  assert.equal(r[0].area, 'Money');
  assert.equal(r[0].count, 3);
});

test('what works ranks helpers by speed', () => {
  const list = [
    battle('a', 'x', 'Money', 30, 20, { helped: ['action'] }), battle('b', 'y', 'Work', 50, 40, { helped: ['action', 'talked'] }),
    battle('c', 'z', 'Mind', 80, 50, { helped: ['time'] }), battle('d', 'w', 'Mind', 120, 90, { helped: ['time', 'talked'] })
  ];
  const w = B.whatWorks(list);
  assert.equal(w[0].key, 'action');
  assert.equal(w[w.length - 1].key, 'time');
});

test('check-in due every 14 days since last battle or check-in', () => {
  assert.equal(B.checkinDue([], [], NOW, 14), true);
  assert.equal(B.checkinDue([battle('a', 'x', 'Money', 5, null)], [], NOW, 14), false);
  assert.equal(B.checkinDue([battle('a', 'x', 'Money', 20, 10)], [{ at: ago(15) }], NOW, 14), true);
});

test('care line only for heavy battles running long', () => {
  const list = [battle('a', 'x', 'Mind', 40, 30), battle('b', 'y', 'Mind', 20, null, { weight: 5 })];
  assert.match(B.careLine(list[1], list, NOW), /longer than usual/);
  assert.equal(B.careLine(battle('c', 'z', 'Mind', 3, null, { weight: 5 }), list, NOW), null);
});

test('discipline under fire compares decision rates', () => {
  const list = [battle('a', 'x', 'Money', 10, 6)];
  const decs = [];
  for (let d = 10; d >= 0; d--) for (let k = 0; k < (d <= 10 && d >= 6 ? 2 : 4); k++) decs.push({ timestamp: ago(d, 9 + k) });
  const r = B.disciplineUnderFire(list, decs, NOW);
  assert.equal(r.hardRate, 2);
  assert.equal(r.calmRate, 4);
});
