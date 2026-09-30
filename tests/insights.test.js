'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../js/insights.js');

const NOW = new Date(2026, 8, 30, 15, 0, 0); // Wed Sep 30 2026, 3pm local

function at(daysAgo, hour, min = 0) {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}

test('money parsing: symbols, words, thousands, losses ignored', () => {
  assert.deepEqual(I.parseMoney('Saved $40'), { currency: 'USD', amount: 40 });
  assert.deepEqual(I.parseMoney('Kept 1,250 dollars'), { currency: 'USD', amount: 1250 });
  assert.deepEqual(I.parseMoney('€12.50 back'), { currency: 'EUR', amount: 12.5 });
  assert.deepEqual(I.parseMoney("Saved 50 000 so'm"), { currency: 'UZS', amount: 50000 });
  assert.deepEqual(I.parseMoney('saved 200k sum'), { currency: 'UZS', amount: 200000 });
  assert.equal(I.parseMoney('Spent $30 on junk'), null);
  assert.equal(I.parseMoney('Slept deeper'), null);
});

test('time parsing adds hours and minutes', () => {
  assert.equal(I.parseMinutes('Got 90 minutes back'), 90);
  assert.equal(I.parseMinutes('2 hours of focus and 15 min walk'), 135);
  assert.equal(I.parseMinutes('1.5h deep work'), 90);
  assert.equal(I.parseMinutes('Felt great'), 0);
});

test('proof totals per category with a headline', () => {
  const cats = [{ name: 'Money', priorityRank: 1 }, { name: 'Work', priorityRank: 2 }, { name: 'Gym', priorityRank: 3 }];
  const decs = [
    { categoryName: 'Money', result: 'Saved $40', timestamp: at(2, 9) },
    { categoryName: 'Money', result: 'Saved $18', timestamp: at(1, 9) },
    { categoryName: 'Money', result: '', timestamp: at(1, 10) },
    { categoryName: 'Work', result: 'Got 90 minutes back', timestamp: at(1, 11) },
    { categoryName: 'Work', result: '2 hours of focus', timestamp: at(0, 9) },
    { categoryName: 'Gym', result: 'Slept deeper', timestamp: at(0, 7) }
  ];
  const p = I.proof(cats, decs);
  assert.equal(p.total, 5);
  assert.equal(p.rows[0].headline, '$58 saved');
  assert.equal(p.rows[1].headline, '3.5 h back');
  assert.equal(p.rows[2].headline, '1 result');
  assert.equal(p.results[0].result, '2 hours of focus');
});

function steady(days, perDay, name = 'Gym', hour = 8) {
  const out = [];
  for (let d = days; d >= 1; d--) for (let k = 0; k < perDay; k++) out.push({ categoryName: name, timestamp: at(d, hour + (k % 3), k) });
  return out;
}

test('patterns wait for 14 days and 50 decisions', () => {
  const cats = [{ name: 'Gym', priorityRank: 1 }];
  const p = I.patterns(cats, steady(10, 6), NOW);
  assert.equal(p.ready, false);
  assert.equal(p.progress.days, 11); // 10 days ago through today
  assert.equal(I.topLine(p, NOW), null);
  assert.equal(I.patterns(cats, steady(20, 3), NOW).ready, true);
});

test('strongest window and quiet day', () => {
  const cats = [{ name: 'Gym', priorityRank: 1 }];
  const p = I.patterns(cats, steady(20, 4), NOW);
  assert.equal(p.strongest.label, '8–11am');
  assert.ok(p.strongest.share > 0.9);
  const line = I.topLine(p, NOW);
  assert.equal(line.tone, 'quiet');
  assert.match(line.text, /usually at 4 by now/);
});

test('#1 priority silence beats a quiet day', () => {
  const cats = [{ name: 'Gym', priorityRank: 1 }, { name: 'Money', priorityRank: 2 }];
  const decs = [...steady(25, 2, 'Gym').filter((d) => Date.parse(d.timestamp) < Date.parse(at(5, 0))), ...steady(25, 3, 'Money')];
  const p = I.patterns(cats, decs, NOW);
  const gym = p.categories.find((c) => c.name === 'Gym');
  assert.equal(gym.quietDays, 6);
  assert.equal(gym.silent, true);
  assert.match(I.topLine(p, NOW).label, /Gym: 6 days quiet/);
});

test('risk weekday shows on that weekday when nothing is logged yet', () => {
  const cats = [{ name: 'Gym', priorityRank: 1 }];
  // Gym every day except Wednesdays, for 6 weeks. NOW is a Wednesday.
  const decs = [];
  for (let d = 42; d >= 1; d--) {
    const day = new Date(at(d, 8));
    if (day.getDay() === 3) continue;
    decs.push({ categoryName: 'Gym', timestamp: at(d, 8) }, { categoryName: 'Gym', timestamp: at(d, 18) });
  }
  const p = I.patterns(cats, decs, NOW);
  const gym = p.categories[0];
  assert.equal(gym.risk.label, 'Wednesdays');
  const line = I.topLine(p, NOW);
  assert.equal(line.label, 'Heads up');
  assert.match(line.text, /Wednesdays are when Gym goes quiet/);
});

test('yesterday evening quiet is detected; reasons are counted', () => {
  const cats = [{ name: 'Gym', priorityRank: 1 }];
  const decs = [];
  for (let d = 20; d >= 2; d--) decs.push({ categoryName: 'Gym', timestamp: at(d, 9) }, { categoryName: 'Gym', timestamp: at(d, 19) }, { categoryName: 'Gym', timestamp: at(d, 20) });
  decs.push({ categoryName: 'Gym', timestamp: at(1, 9) });
  const p = I.patterns(cats, decs, NOW, [{ date: 'x', answer: 'phone' }, { date: 'y', answer: 'phone' }, { date: 'z', answer: 'tired' }, { date: 'w', answer: 'none' }]);
  assert.equal(p.yesterdayQuiet.window, 'evening');
  assert.deepEqual(p.reasons, { top: 'phone', count: 2, of: 3 });
});
