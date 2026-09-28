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
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
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
  assert.equal(await page.locator('#dots circle').count(), 500);
  await page.evaluate(() => { const i = document.querySelector('input[name="goal"]'); i.value = '5000'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(await page.locator('#dots .progress').count(), 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});
