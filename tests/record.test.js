'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/record.js');

const NOW = new Date(2026, 9, 3, 12);
const ago = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();

test('reviews come due at 3, 6 and 12 months, one at a time', () => {
  const bet = { madeAt: ago(30), reviews: [] };
  assert.deepEqual(R.nextReview(bet, NOW), { months: 3, due: false, inDays: 61 });
  bet.madeAt = ago(100);
  assert.equal(R.nextReview(bet, NOW).due, true);
  bet.reviews.push({ checkpoint: 3, verdict: 'right' });
  assert.deepEqual(R.nextReview(bet, NOW), { months: 6, due: false, inDays: 82 });
  bet.madeAt = ago(400);
  bet.reviews.push({ checkpoint: 6, verdict: 'mixed' }, { checkpoint: 12, verdict: 'right' });
  assert.equal(R.nextReview(bet, NOW), null);
});

test('due reviews list only bets past a checkpoint', () => {
  const bets = [{ id: 'a', madeAt: ago(200), reviews: [] }, { id: 'b', madeAt: ago(10), reviews: [] }, { id: 'c', madeAt: ago(95), reviews: [] }];
  assert.deepEqual(R.dueReviews(bets, NOW).map((b) => b.id), ['a', 'c']);
});

test('judgment uses the latest verdict and calibrates confidence', () => {
  const bets = [
    { confidence: 5, reviews: [{ checkpoint: 3, verdict: 'wrong' }, { checkpoint: 6, verdict: 'right' }] },
    { confidence: 4, reviews: [{ checkpoint: 3, verdict: 'right' }] },
    { confidence: 2, reviews: [{ checkpoint: 3, verdict: 'wrong' }] },
    { confidence: 3, reviews: [] }
  ];
  const j = R.judgment(bets);
  assert.equal(j.made, 4);
  assert.equal(j.reviewed, 3);
  assert.equal(j.right, 2);
  assert.equal(j.rate, 2 / 3);
  assert.equal(j.confRight, 4.5);
  assert.equal(j.confWrong, 2);
});

test('firsts group by year, newest first; lessons pin first', () => {
  const g = R.firstsByYear([{ date: '2025-03-01' }, { date: '2026-05-01' }, { date: '2026-01-02' }]);
  assert.deepEqual(g.map((x) => x.year), ['2026', '2025']);
  assert.equal(g[0].items[0].date, '2026-05-01');
  const v = R.lessonsView([{ text: 'a', area: 'Money', at: ago(1) }, { text: 'b', area: 'Money', at: ago(2) }, { text: 'c', area: 'Mind', at: ago(3), pinned: true }]);
  assert.equal(v.pinned[0].text, 'c');
  assert.equal(v.areas[0].area, 'Money');
  assert.equal(v.areas[0].items[0].text, 'a');
  assert.equal(R.fmtDuration(75.4), '1:15');
});
