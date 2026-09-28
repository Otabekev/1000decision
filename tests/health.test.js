'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../js/health.js');

const NOW = new Date(2026, 8, 28, 15, 0, 0); // Sep 28 2026, 3pm local

function cats(...names) {
  return names.map((name, i) => ({ name, priorityRank: i + 1 }));
}

function daysAgo(n, hour = 12) {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function log(name, count, ago = 0) {
  return Array.from({ length: count }, () => ({ categoryName: name, timestamp: daysAgo(ago) }));
}

test('target shares follow priority weights (N - rank + 1)', () => {
  const h = H.computeHealth(cats('Gym', 'Money', 'Peace'), [], NOW);
  assert.deepEqual(h.list.map((x) => x.weight), [3, 2, 1]);
  assert.deepEqual(h.list.map((x) => +x.targetShare.toFixed(4)), [0.5, 0.3333, 0.1667]);
});

test('no decisions in the last 7 days makes every category idle (grey)', () => {
  const old = log('Gym', 20, 30);
  const h = H.computeHealth(cats('Gym', 'Money'), old, NOW);
  assert.equal(h.total7, 0);
  assert.ok(h.list.every((x) => x.status === 'idle'));
  assert.equal(h.byName.Gym.total, 20, 'all-time totals still count');
});

test('exactly on target is balanced', () => {
  // targets 50 / 33 / 17 -> 3 / 2 / 1 of 6
  const d = [...log('Gym', 3), ...log('Money', 2), ...log('Peace', 1)];
  const h = H.computeHealth(cats('Gym', 'Money', 'Peace'), d, NOW);
  assert.deepEqual(h.list.map((x) => x.status), ['balanced', 'balanced', 'balanced']);
});

test('band edges 0.8 and 1.3 are inclusive despite floating point', () => {
  // Two categories: targets 2/3 and 1/3. Gym 8 of 15 -> 0.5333 / 0.6667 = 0.8 exactly.
  const d = [...log('Gym', 8), ...log('Money', 7)];
  const h = H.computeHealth(cats('Gym', 'Money'), d, NOW);
  assert.equal(h.byName.Gym.ratio, 0.8);
  assert.equal(h.byName.Gym.status, 'balanced');
  // Money 7 of 15 -> 0.4667 / 0.3333 = 1.4 -> over
  assert.equal(h.byName.Money.status, 'over');

  // 13 of 30 for a 1/3 target -> ratio 1.3 exactly -> balanced
  const d2 = [...log('Gym', 17), ...log('Money', 13)];
  const h2 = H.computeHealth(cats('Gym', 'Money'), d2, NOW);
  assert.equal(h2.byName.Money.ratio, 1.3);
  assert.equal(h2.byName.Money.status, 'balanced');
});

test('neglected #1 priority is flagged urgent and farming an easy category is over-invested', () => {
  const d = [...log('Gym', 1), ...log('Money', 2), ...log('Peace', 9)];
  const h = H.computeHealth(cats('Gym', 'Money', 'Peace'), d, NOW);
  assert.equal(h.byName.Gym.status, 'neglected');
  assert.equal(h.byName.Gym.urgent, true);
  assert.equal(h.byName.Peace.status, 'over');
  assert.match(H.describe(h.byName.Gym).label, /this is your #1 priority/);
  assert.match(H.describe(h.byName.Peace).label, /possibly avoiding something harder/);
});

test('red deepens as the ratio drops', () => {
  const mild = H.computeHealth(cats('Gym', 'Money'), [...log('Gym', 5), ...log('Money', 5)], NOW).byName.Gym;
  const zero = H.computeHealth(cats('Gym', 'Money'), log('Money', 5), NOW).byName.Gym;
  assert.ok(mild.severity > 0 && mild.severity < zero.severity);
  assert.equal(zero.severity, 1);
  assert.notEqual(H.colorsFor(mild).fill, H.colorsFor(zero).fill);
  assert.equal(H.colorsFor(zero).fill, H.COLORS.neglectedDeep.fill);
});

test('reordering priorities changes targets and health immediately', () => {
  const d = [...log('Gym', 6), ...log('Peace', 2)];
  const before = H.computeHealth(cats('Gym', 'Peace'), d, NOW);
  assert.equal(before.byName.Gym.status, 'balanced');
  const after = H.computeHealth(cats('Peace', 'Gym'), d, NOW);
  assert.equal(after.byName.Gym.status, 'over');
  assert.equal(after.byName.Peace.status, 'neglected');
  assert.equal(after.byName.Peace.urgent, true);
});

test('rolling window is today plus the 6 previous calendar days', () => {
  const d = [...log('Gym', 1, 6), ...log('Money', 1, 7)];
  const h = H.computeHealth(cats('Gym', 'Money'), d, NOW);
  assert.equal(h.byName.Gym.count7, 1, '6 days ago is inside');
  assert.equal(h.byName.Money.count7, 0, '7 days ago is outside');
  assert.equal(h.byName.Money.total, 1);
});

test('a single category with recent decisions is balanced', () => {
  const h = H.computeHealth(cats('Gym'), log('Gym', 3), NOW);
  assert.equal(h.byName.Gym.targetShare, 1);
  assert.equal(h.byName.Gym.status, 'balanced');
});

test('decisions for unknown categories are ignored', () => {
  const h = H.computeHealth(cats('Gym'), [...log('Gym', 1), ...log('Ghost', 4)], NOW);
  assert.equal(h.total7, 1);
});
