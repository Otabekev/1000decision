'use strict';
/*
 * End-to-end smoke tests: drive the real page in Chromium.
 *   npm install          (installs Playwright as a dev dependency)
 *   npm run test:e2e
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const KEY = 'thousand-decisions:v1';
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

let server, base, browser;

test.before(async () => {
  server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port + '/';
  browser = await chromium.launch(Object.assign({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] }, process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}));
});

test.after(async () => {
  await browser.close();
  server.close();
});

function sample() {
  const now = Date.now();
  const at = (hoursAgo) => new Date(now - hoursAgo * 3600e3).toISOString();
  const decisions = [];
  let n = 0;
  const add = (name, count, hoursAgo) => {
    for (let i = 0; i < count; i++) decisions.push({ id: 'd' + n++, categoryName: name, text: name + ' decision ' + i, result: i % 2 ? 'It worked' : '', timestamp: at(hoursAgo + i * 0.01) });
  };
  add('Gym', 1, 30);
  add('Money', 4, 20);
  add('Peace', 9, 10);
  add('Family', 2, 400); // older than 7 days
  decisions.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  return {
    version: 1,
    categories: [
      { id: 'c1', name: 'Gym', color: '#2F6BFF', priorityRank: 1 },
      { id: 'c2', name: 'Money', color: '#8B3DFF', priorityRank: 2 },
      { id: 'c3', name: 'Peace', color: '#E0399E', priorityRank: 3 },
      { id: 'c4', name: 'Family', color: '#FF7A1A', priorityRank: 4 }
    ],
    decisions,
    settings: { goal: 1000, startDate: '2026-01-01', signature: '', lastBackupAt: null }
  };
}

async function open(data, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 390, height: 844 }, acceptDownloads: true, reducedMotion: 'reduce' });
  if (data) {
    await ctx.addInitScript(([key, d]) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(key, JSON.stringify(d));
        sessionStorage.setItem('seeded', '1');
      }
    }, [KEY, data]);
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base);
  await page.waitForSelector('#hero-total');
  return { ctx, page, errors };
}

const stored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);

test('first run: empty state, quick categories, first decision', async () => {
  const { ctx, page, errors } = await open(null);
  assert.equal(await page.textContent('#hero-total'), '0');
  await page.click('.ritual [data-r="skip"]');
  await page.waitForSelector('.ritual', { state: 'detached' });
  assert.equal((await stored(page)).onboarded, true);
  await page.click('[data-action="quick-category"][data-name="Gym"]');
  await page.click('[data-action="quick-category"][data-name="Money"]');
  let s = await stored(page);
  assert.deepEqual(s.categories.map((c) => [c.name, c.priorityRank]), [['Gym', 1], ['Money', 2]]);

  // FAB → category → text → Enter → Enter
  await page.click('.fab');
  await page.click('.tile[data-pick="Gym"]');
  await page.fill('input[name="text"]', 'Trained before work');
  await page.press('input[name="text"]', 'Enter');
  await page.fill('input[name="result"]', 'Great energy');
  await page.press('input[name="result"]', 'Enter');
  await page.waitForFunction(() => !document.getElementById('sheet').open);
  s = await stored(page);
  assert.equal(s.decisions.length, 1);
  assert.equal(s.decisions[0].categoryName, 'Gym');
  assert.equal(s.decisions[0].result, 'Great energy');
  await page.waitForFunction(() => document.getElementById('hero-total').textContent === '1');
  assert.equal(await page.getAttribute('.bar[data-name="Gym"]', 'class'), 'bar is-over');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('empty decision text is rejected', async () => {
  const { ctx, page } = await open(sample());
  await page.click('.fab');
  await page.click('.tile[data-pick="Money"]');
  await page.click('.add-form button[type="submit"]');
  assert.equal((await stored(page)).decisions.length, 16);
  assert.match(await page.getAttribute('input[name="text"]', 'class'), /is-invalid/);
  await ctx.close();
});

test('health colors: #1 neglected is urgent, farmed category is over-invested', async () => {
  const { ctx, page, errors } = await open(sample());
  // Gym 1 of 14 recent (target 40%), Peace 9 of 14 (target 20%)
  assert.match(await page.getAttribute('.bar[data-name="Gym"]', 'class'), /is-neglected is-urgent/);
  assert.match(await page.getAttribute('.bar[data-name="Peace"]', 'class'), /is-over/);
  assert.match(await page.textContent('#insight'), /Gym is your #1 priority/);
  await page.click('.bar[data-name="Gym"]');
  await page.waitForSelector('.detail__label');
  assert.match(await page.textContent('.detail__label'), /Neglected — this is your #1 priority/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('drag to reorder changes ranks, targets and health', async () => {
  const { ctx, page } = await open(sample());
  await page.locator('#priorities').scrollIntoViewIfNeeded();
  const handle = page.locator('.prio__row[data-id="c3"] .prio__handle'); // Peace (#3)
  const first = page.locator('.prio__row[data-id="c1"]');
  const hb = await handle.boundingBox();
  const fb = await first.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 - ((hb.y - fb.y + 10) * i) / 10);
  await page.mouse.up();
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).categories[0].name === 'Peace', KEY);
  const s = await stored(page);
  assert.deepEqual(s.categories.map((c) => c.name), ['Peace', 'Gym', 'Money', 'Family']);
  assert.deepEqual(s.categories.map((c) => c.priorityRank), [1, 2, 3, 4]);
  // Peace now targets 40% and gets 64% → still over; Gym (#2, 30%) still neglected but no longer urgent
  assert.doesNotMatch(await page.getAttribute('.bar[data-name="Gym"]', 'class'), /is-urgent/);
  assert.equal(await page.textContent('.prio__row[data-id="c3"] .prio__pct'), 'Target 40%');
  await ctx.close();
});

test('keyboard reorder with arrow keys', async () => {
  const { ctx, page } = await open(sample());
  await page.focus('.prio__row[data-id="c2"] .prio__handle');
  await page.keyboard.press('ArrowUp');
  const s = await stored(page);
  assert.deepEqual(s.categories.map((c) => c.name), ['Money', 'Gym', 'Peace', 'Family']);
  assert.equal(await page.evaluate(() => document.activeElement.closest('.prio__row').dataset.id), 'c2');
  await ctx.close();
});

test('rename cascades to decisions; history filter follows', async () => {
  const { ctx, page } = await open(sample());
  await page.click('[data-action="edit-category"][data-id="c2"]');
  await page.fill('input[name="name"]', 'Finance');
  await page.click('.sheet .add-form button[type="submit"]');
  const s = await stored(page);
  assert.equal(s.categories[1].name, 'Finance');
  assert.equal(s.decisions.filter((d) => d.categoryName === 'Finance').length, 4);
  assert.equal(s.decisions.filter((d) => d.categoryName === 'Money').length, 0);
  await ctx.close();
});

test('duplicate category names are refused', async () => {
  const { ctx, page } = await open(sample());
  await page.click('#priorities [data-action="new-category"]');
  await page.fill('input[name="name"]', 'gym');
  await page.click('.sheet .add-form button[type="submit"]');
  assert.equal((await stored(page)).categories.length, 4);
  await ctx.close();
});

test('delete category and move its decisions', async () => {
  const { ctx, page } = await open(sample());
  await page.click('[data-action="edit-category"][data-id="c4"]');
  await page.click('[data-sheet="delete"]');
  await page.selectOption('#confirm select[name="target"]', 'Peace');
  await page.click('[data-confirm="ok"]');
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).categories.length === 3, KEY);
  const s = await stored(page);
  assert.equal(s.decisions.length, 16, 'total unchanged');
  assert.equal(s.decisions.filter((d) => d.categoryName === 'Peace').length, 11);
  await ctx.close();
});

test('edit, delete and undo a decision', async () => {
  const { ctx, page } = await open(sample());
  await page.click('.entry .entry__main');
  await page.click('.entry.is-open [data-action="edit-decision"]');
  await page.fill('input[name="text"]', 'Edited text');
  await page.click('.sheet .add-form button[type="submit"]');
  let s = await stored(page);
  assert.equal(s.decisions[s.decisions.length - 1].text, 'Edited text');

  // The edited entry stays expanded, so its actions are still visible.
  await page.click('.entry.is-open [data-action="delete-decision"]');
  await page.click('[data-confirm="ok"]');
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).decisions.length === 15, KEY);
  await page.click('.toast button');
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).decisions.length === 16, KEY);
  s = await stored(page);
  assert.equal(s.decisions[s.decisions.length - 1].text, 'Edited text');
  await ctx.close();
});

test('export then import restores the same data', async () => {
  const { ctx, page } = await open(sample());
  await page.click('#settings summary');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export"]')]);
  const file = await download.path();
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(payload.app, '1000-decisions');
  assert.equal(payload.data.decisions.length, 16);

  await page.click('[data-action="reset"]');
  await page.click('[data-confirm="ok"]');
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).decisions.length === 0, KEY);

  await page.setInputFiles('#import-file', file);
  await page.click('[data-confirm="ok"]');
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).decisions.length === 16, KEY);
  const s = await stored(page);
  assert.deepEqual(s.categories.map((c) => c.name), ['Gym', 'Money', 'Peace', 'Family']);
  await ctx.close();
});

test('share card downloads a 1080x1920 PNG', async () => {
  const { ctx, page, errors } = await open(sample());
  await page.click('#share .btn[data-action="share"]');
  await page.waitForTimeout(300);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-sheet="download"]')]);
  const buf = fs.readFileSync(await download.path());
  assert.equal(buf.toString('ascii', 1, 4), 'PNG');
  assert.equal(buf.readUInt32BE(16), 1080);
  assert.equal(buf.readUInt32BE(20), 1920);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('no horizontal overflow on a 320px phone; goal variants render', async () => {
  const data = sample();
  data.categories[1].name = 'A very long category name';
  data.decisions.forEach((d) => { if (d.categoryName === 'Money') d.categoryName = 'A very long category name'; });
  data.decisions[0].text = 'x'.repeat(140);
  const { ctx, page, errors } = await open(data, { width: 320, height: 640 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.equal(overflow, 0);
  await page.evaluate(() => { const i = document.querySelector('input[name="goal"]'); i.value = '500'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(await page.locator('#dots rect').count(), 500);
  await page.evaluate(() => { const i = document.querySelector('input[name="goal"]'); i.value = '5000'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(await page.locator('#dots .progress').count(), 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('why: saved from the editor and shown when the category falls behind', async () => {
  const { ctx, page, errors } = await open(sample());
  await page.click('[data-action="edit-category"][data-id="c1"]');
  await page.fill('input[name="why"]', 'so I never feel weak');
  await page.click('.sheet .add-form button[type="submit"]');
  const s = await stored(page);
  assert.equal(s.categories[0].why, 'so I never feel weak');
  assert.match(await page.textContent('#insight'), /so I never feel weak/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('proof wall counts results; save toast offers Add result', async () => {
  const { ctx, page, errors } = await open(sample());
  assert.equal(await page.textContent('#proof-count'), '7');
  await page.click('.fab');
  await page.click('.tile[data-pick="Money"]');
  await page.fill('input[name="text"]', 'Skipped takeout');
  await page.click('.add-form button[type="submit"]');
  await page.click('.toast button:has-text("Add result")');
  await page.fill('input[name="result"]', 'Saved $25');
  await page.click('.sheet .add-form button[type="submit"]');
  await page.waitForFunction(() => document.getElementById('proof-count').textContent === '8');
  assert.match(await page.textContent('#proof-body'), /\$25 saved/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('patterns: learning state before 14 days; one-tap answer is stored', async () => {
  const young = await open(sample());
  assert.match(await young.page.textContent('#patterns-body'), /Learning your rhythm/);
  await young.ctx.close();

  // 20 days, steady mornings and evenings, but nothing yesterday evening.
  const data = sample();
  const now = new Date();
  data.decisions = [];
  for (let d = 20; d >= 1; d--) {
    for (const h of [8, 9, 19, 20]) {
      if (d === 1 && h >= 17) continue;
      const t = new Date(now); t.setDate(t.getDate() - d); t.setHours(h, 0, 0, 0);
      data.decisions.push({ id: 'p' + d + h, categoryName: 'Money', text: 'x', result: '', timestamp: t.toISOString() });
    }
  }
  const { ctx, page } = await open(data);
  await page.click('.pulse__answers [data-answer="phone"]');
  const s = await stored(page);
  assert.equal(s.reasons.length, 1);
  assert.equal(s.reasons[0].answer, 'phone');
  assert.equal(await page.locator('#pulse .pulse__ask:not(.checkin-row)').count(), 0);
  await ctx.close();
});

test('battles: add, been-here-before, close into history, private mode', async () => {
  const data = sample();
  const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();
  data.battles = [{ id: 'old', title: 'Client did not pay', area: 'Money', weight: 4, step: '', startedAt: ago(60), status: 'won', endedAt: ago(40), helped: ['action'], note: 'Make the calls', updates: [] }];
  const { ctx, page, errors } = await open(data);
  await page.click('.tab[data-view="battles"]');
  await page.waitForSelector('#view-battles:not([hidden])');
  await page.click('.war [data-action="battle-new"]');
  await page.fill('input[name="title"]', 'Lost my biggest client');
  await page.click('.sheet .area-chip[data-area="Money"]');
  assert.match(await page.textContent('.been'), /Make the calls/);
  await page.click('.sheet .add-form button[type="submit"]');
  await page.waitForFunction(() => !document.getElementById('sheet').open);
  assert.equal(await page.locator('.fight').count(), 1);
  assert.equal(await page.textContent('#tab-battles-count'), '1');

  await page.click('.fight [data-action="battle-close"]');
  await page.click('.sheet [data-status="passed"]');
  await page.click('.sheet [data-helped="talked"]');
  await page.fill('input[name="note"]', 'It passed');
  await page.click('.sheet .add-form button[type="submit"]');
  await page.waitForFunction(() => !document.getElementById('sheet').open);
  const s = await stored(page);
  const b = s.battles.find((x) => x.title === 'Lost my biggest client');
  assert.equal(b.status, 'passed');
  assert.deepEqual(b.helped, ['talked']);
  assert.ok(b.endedAt);
  assert.equal(await page.locator('.fight').count(), 0);
  assert.equal(await page.locator('.won').count(), 2);

  await page.click('#private-btn');
  assert.equal(await page.isVisible('#battles-body'), false);
  assert.equal(await page.isVisible('#private-note'), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('record: big bet review comes due, lesson saved, first logged, pin limit', async () => {
  const data = sample();
  data.bets = [{ id: 'bet1', title: 'Quit my job', area: 'Work', why: 'Freedom', expect: 'Replace salary in 6 months', regret: 'Yes', confidence: 4, madeAt: new Date(Date.now() - 100 * 86400000).toISOString(), reviews: [] }];
  const { ctx, page, errors } = await open(data);
  assert.match(await page.textContent('#pulse'), /3-month review/);
  await page.click('.tab[data-view="record"]');
  assert.equal(await page.textContent('#tab-record-count'), '1');
  await page.click('#reviews-due [data-action="bet-review"]');
  await page.click('.sheet [data-verdict="mixed"]');
  await page.fill('.sheet input[name="note"]', 'Sales take twice as long');
  await page.click('.sheet .add-form button[type="submit"]');
  await page.waitForFunction(() => !document.getElementById('sheet').open);
  let s = await stored(page);
  assert.equal(s.bets[0].reviews[0].verdict, 'mixed');
  assert.equal(s.lessons[0].text, 'Sales take twice as long');
  assert.equal(s.lessons[0].source.type, 'bet');
  assert.match(await page.textContent('#judgment'), /0%/);

  await page.click('#view-record [data-action="first-new"]');
  await page.fill('.sheet input[name="title"]', 'First $1,000 month');
  await page.click('.sheet .add-form button[type="submit"]');
  await page.waitForFunction(() => !document.getElementById('sheet').open);
  assert.match(await page.textContent('#firsts-list'), /First \$1,000 month/);

  await page.click('.lesson__pin');
  s = await stored(page);
  assert.equal(s.lessons[0].pinned, true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('record: voice note records, saves to IndexedDB and plays back', async () => {
  const { ctx, page, errors } = await open(sample());
  await page.click('.tab[data-view="record"]');
  await page.click('.war [data-action="voice-new"]');
  await page.click('#rec-btn');
  await page.waitForTimeout(1300);
  await page.click('#rec-btn');
  await page.waitForSelector('#rec-form:not([hidden])');
  await page.fill('.sheet input[name="title"]', 'Night before quitting');
  await page.click('#rec-form button[type="submit"]');
  await page.waitForFunction(() => !document.getElementById('sheet').open);
  const s = await stored(page);
  assert.equal(s.voice.length, 1);
  assert.ok(s.voice[0].duration >= 1);
  const size = await page.evaluate((id) => window.TDMedia.get(id).then((b) => b && b.size), s.voice[0].id);
  assert.ok(size > 0);
  assert.match(await page.textContent('#voice-list'), /Night before quitting/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('closing a battle can save its note as a lesson; private mode hides Record', async () => {
  const data = sample();
  data.battles = [{ id: 'b1', title: 'Back pain', area: 'Health', weight: 3, step: '', startedAt: new Date(Date.now() - 5 * 86400000).toISOString(), status: 'active', endedAt: null, helped: [], note: '', updates: [] }];
  const { ctx, page } = await open(data);
  await page.click('.tab[data-view="battles"]');
  await page.click('.fight [data-action="battle-close"]');
  await page.fill('.sheet input[name="note"]', 'Stretch every morning');
  await page.click('.sheet .add-form button[type="submit"]');
  await page.waitForFunction(() => !document.getElementById('sheet').open);
  const s = await stored(page);
  assert.equal(s.lessons[0].text, 'Stretch every morning');
  assert.equal(s.lessons[0].area, 'Health');
  await page.click('#private-btn');
  await page.click('.tab[data-view="record"]');
  await page.waitForSelector('#view-record:not([hidden])');
  assert.equal(await page.isVisible('#record-body'), false);
  assert.equal(await page.isVisible('#record-private'), true);
  await ctx.close();
});

test('themes: switch with T and from settings; saved and applied on reload', async () => {
  const { ctx, page, errors } = await open(sample());
  assert.equal(await page.getAttribute('html', 'data-theme'), null);
  await page.keyboard.press('t');
  assert.equal(await page.getAttribute('html', 'data-theme'), 'carbon');
  await page.click('#settings summary');
  await page.click('.theme-opt[data-theme="terminal"]');
  assert.equal(await page.getAttribute('html', 'data-theme'), 'terminal');
  assert.equal((await stored(page)).settings.theme, 'terminal');
  await page.reload();
  await page.waitForSelector('#hero-total');
  assert.equal(await page.getAttribute('html', 'data-theme'), 'terminal');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('day 1 ritual: priorities in order, whys, sealed letter, first decision', async () => {
  const { ctx, page, errors } = await open(null, { width: 1280, height: 900 });
  await page.click('.ritual [data-r="next"]');
  await page.click('.r-chip[data-name="Money"]');
  await page.click('.r-chip[data-name="Gym"]');
  await page.fill('.ritual [name="custom"]', 'Reading');
  await page.press('.ritual [name="custom"]', 'Enter');
  await page.click('.ritual [data-r="up"][data-i="1"]'); // Gym above Money
  assert.deepEqual(await page.$$eval('.ritual__name', (els) => els.map((e) => e.textContent)), ['Gym', 'Money', 'Reading']);
  await page.click('.ritual [data-r="next"]');
  await page.fill('[data-why="Gym"]', 'so I am strong at 60');
  await page.click('.ritual [data-r="next"]');
  await page.click('.ritual [data-r="seal"]');
  assert.match(await page.getAttribute('[data-letter]', 'class'), /is-invalid/);
  await page.fill('[data-letter]', 'Dear future me, do not stop.');
  await page.click('.ritual [data-r="seal"]');
  await page.click('.r-chip[data-r="firstcat"][data-name="Money"]');
  await page.fill('[data-first]', 'Cancelled an unused subscription');
  await page.press('[data-first]', 'Enter');
  await page.waitForSelector('.ritual__title--xl');
  const s = await stored(page);
  assert.equal(s.onboarded, true);
  assert.deepEqual(s.categories.map((c) => [c.name, c.priorityRank]), [['Gym', 1], ['Money', 2], ['Reading', 3]]);
  assert.equal(s.categories[0].why, 'so I am strong at 60');
  assert.equal(s.letter.text, 'Dear future me, do not stop.');
  assert.equal(s.letter.openedAt, null);
  assert.equal(s.decisions.length, 1);
  assert.equal(s.decisions[0].categoryName, 'Money');
  await page.click('.ritual [data-r="enter"]');
  await page.waitForSelector('.ritual', { state: 'detached' });
  assert.equal(await page.textContent('#hero-total'), '1');
  await page.click('.tab[data-view="record"]');
  assert.match(await page.textContent('#letter-card'), /999 to go/);
  assert.doesNotMatch(await page.textContent('#letter-card'), /do not stop/);
  await page.reload();
  await page.waitForSelector('#letter-card');
  assert.equal(await page.$('.ritual'), null);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('letter can be written later from the Record tab', async () => {
  const { ctx, page, errors } = await open(sample());
  assert.equal(await page.$('.ritual'), null);
  await page.click('.tab[data-view="record"]');
  await page.click('#letter-card [data-action="letter-write"]');
  await page.fill('.sheet textarea[name="letter"]', 'Remember why you started.');
  await page.click('.sheet .add-form button[type="submit"]');
  await page.waitForFunction(() => !document.getElementById('sheet').open);
  assert.equal((await stored(page)).letter.text, 'Remember why you started.');
  assert.match(await page.textContent('#letter-card'), /Sealed on/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('finale at the goal: letter opens, poster saves, season 2 starts', async () => {
  const data = sample();
  data.settings.goal = 17;
  data.letter = { text: 'You made it. Keep going.', sealedAt: new Date(Date.now() - 40 * 86400000).toISOString(), openedAt: null, season: 1 };
  data.lessons = [{ id: 'l1', text: 'Small beats heroic', area: 'Mind', pinned: true, at: new Date().toISOString(), source: { type: 'manual' } }];
  const { ctx, page, errors } = await open(data, { width: 1280, height: 900 });
  assert.equal(await page.$('.finale'), null);
  await page.click('.fab, [data-action="add"]');
  await page.click('.tile[data-pick="Gym"]');
  await page.fill('input[name="text"]', 'Number seventeen');
  await page.click('.add-form button[type="submit"]');
  await page.waitForSelector('.finale');
  assert.match(await page.textContent('.finale'), /Season 1 · chapter complete/);
  assert.equal((await stored(page)).settings.finaleShownFor, 17);
  await page.click('.finale [data-f="letter"]');
  assert.doesNotMatch(await page.textContent('.finale'), /Keep going/);
  await page.click('.finale [data-f="break"]');
  await page.waitForSelector('.envelope.is-open');
  assert.match(await page.textContent('.envelope__text'), /You made it. Keep going./);
  assert.ok((await stored(page)).letter.openedAt);
  await page.click('.finale [data-f="built"]');
  assert.match(await page.textContent('.finale'), /Small beats heroic/);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('.finale [data-action="poster-save"]')]);
  assert.equal(download.suggestedFilename(), '1000-decisions-season-1.png');
  await page.click('.finale [data-f="season"]');
  await page.click('#confirm [data-confirm="ok"]');
  await page.waitForSelector('.finale', { state: 'detached' });
  const s = await stored(page);
  assert.equal(s.settings.goal, 34);
  assert.equal(s.seasons.length, 1);
  assert.equal(s.seasons[0].letter, 'You made it. Keep going.');
  assert.equal(s.letter, null);
  await page.waitForSelector('#letter-card [data-action="letter-write"]');
  // Reload must not re-open the finale.
  await page.reload();
  await page.waitForSelector('#letter-card');
  await page.waitForTimeout(800);
  assert.equal(await page.$('.finale'), null);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the Book contains every chapter and every decision', async () => {
  const data = sample();
  data.battles = [{ id: 'b1', title: 'Back pain', area: 'Health', weight: 3, step: '', startedAt: new Date(Date.now() - 9 * 86400000).toISOString(), status: 'won', endedAt: new Date(Date.now() - 2 * 86400000).toISOString(), helped: [], note: 'Stretching', updates: [] }];
  data.firsts = [{ id: 'f1', title: 'First marathon', area: 'Gym', date: '2026-05-01', note: '' }];
  data.categories[0].why = 'strong at 60';
  const { ctx, page, errors } = await open(data);
  await page.evaluate(() => { window.print = () => { window.__printed = document.documentElement.classList.contains('is-printing-book'); }; });
  await page.click('#settings summary');
  await page.click('[data-action="book-print"]');
  await page.waitForFunction(() => window.__printed !== undefined);
  assert.equal(await page.evaluate(() => window.__printed), true);
  const text = await page.textContent('#book');
  for (const s of ['The Book', 'What mattered, and why', 'strong at 60', 'The numbers', 'Proof', 'Battles', 'Back pain', 'Firsts', 'First marathon', 'Every decision', '#16']) assert.ok(text.includes(s), 'missing ' + s);
  assert.deepEqual(errors, []);
  await ctx.close();
});
