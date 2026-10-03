'use strict';
/*
 * Desktop smoke test: launches the packaged Electron app (desktop/dist/*-unpacked)
 * and checks it loads, saves, and keeps data across a restart.
 *   cd desktop && npm install && npx electron-builder --dir --publish never
 *   node tests/desktop.smoke.js        (Linux CI: xvfb-run node tests/desktop.smoke.js)
 */
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert/strict');

// EXE=<path> tests an installed copy; otherwise the unpacked build in desktop/dist.
function findExe() {
  if (process.env.EXE) return process.env.EXE;
  const dist = path.join(__dirname, '..', 'desktop', 'dist');
  const dirs = fs.readdirSync(dist);
  if (process.platform === 'darwin') {
    const d = dirs.find((x) => /^mac/.test(x) && fs.existsSync(path.join(dist, x, '1000 Decisions.app')));
    return path.join(dist, d, '1000 Decisions.app', 'Contents', 'MacOS', '1000 Decisions');
  }
  const d = dirs.find((x) => /unpacked$/.test(x));
  return path.join(dist, d, process.platform === 'win32' ? '1000 Decisions.exe' : '1000-decisions-desktop');
}
const exe = findExe();
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'td-desktop-'));

async function launch() {
  const app = await electron.launch({ executablePath: exe, args: (process.platform === 'linux' ? ['--no-sandbox'] : []).concat(['--user-data-dir=' + userData]) });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForSelector('#hero-total', { state: 'attached' });
  return { app, page, errors };
}

(async () => {
  let { app, page, errors } = await launch();
  const info = await page.evaluate(() => window.TDDesktop && window.TDDesktop.info());
  assert.equal(info.packaged, true);
  await page.waitForSelector('.ritual');
  await page.click('.ritual [data-r="next"]');
  await page.click('.r-chip[data-name="Gym"]');
  await page.click('.ritual [data-r="next"]');
  await page.click('.ritual [data-r="next"]');
  await page.click('.ritual [data-r="next"]');
  await page.fill('[data-first]', 'Trained before work');
  await page.click('.ritual [data-r="finish"]');
  await page.click('.ritual [data-r="enter"]');
  await page.waitForFunction(() => document.getElementById('hero-total').textContent === '1');
  await page.waitForSelector('#desktop-settings', { state: 'attached' });
  assert.match(await page.textContent('#desktop-settings'), /Version 1\.0\.0/);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  assert.deepEqual(errors, []);
  await app.close();

  ({ app, page, errors } = await launch());
  await page.waitForFunction(() => document.getElementById('hero-total').textContent === '1');
  assert.equal(await page.$('.ritual'), null);
  assert.deepEqual(errors, []);
  await app.close();
  console.log('desktop smoke: ok (' + info.platform + ', v' + info.version + ')');
})().catch((e) => { console.error(e); process.exit(1); });
