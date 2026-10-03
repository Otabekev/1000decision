# 1000 Decisions

A personal daily accountability tool. You log small acts of discipline ("decisions") toward a goal of 1000. Every decision belongs to a priority-ranked category, and the app shows, by color, whether each priority is getting the **right amount** of attention. It flags when your top priority is being neglected while easy categories get farmed.

- **One page. No backend, no login.** Everything is stored in `localStorage` on your device.
- **Runs locally.** Plain HTML, CSS and JavaScript: no framework, no build step, no server. Double-click to open; works offline.
- **Under 30 seconds a day.** Tap **+**, tap a category, type what you did, press Enter twice.

## What's on the page

| Section | What it does |
| --- | --- |
| **Summary** | `X / 1000` in huge type, **Day N**, a 1000-square grid (one square per decision, today's in brass), and stats: today, last 7 days, active days / consistency, daily average, projected finish date. |
| **Statistics** | Decisions per day for 30 days (stacked by category, with the 7-day average) and each priority's actual share vs. target. |
| **Pulse** | One line at the top, only when useful: a risk day ("Wednesdays are when Gym goes quiet"), your #1 priority going silent, a quieter-than-usual day, or your strongest window. After a quiet evening, an optional one-tap "What pulled you away?" (Phone · Tired · Stress · Busy · Just didn't log). Nothing shows until 14 days and 50 decisions of data. |
| **Proof** | Every "what happened" result in one place, with totals the app reads from your words: money ("$828 saved"), time ("24 h back") or a count. |
| **Your patterns** | Weekday × hour heatmap (last 8 weeks), strongest hours, quietest window, longest silences, and what pulls you away most. |
| **Battles tab** | Track hard things you're going through. Add one in 10 seconds (title, area, how heavy); it starts that day and ends when you mark it over (Won / Passed / Accepted, what helped, one note for future you). Shows "You've been here before" with past battles in the same area, your current battles with "Day 10 · usually ends in ~17 days", a timeline of everything you've been through, problems that keep coming back, what works for you, and a clean history. Private mode hides it all; it never appears on the Instagram card. Check-in every 2 weeks. Press **B** to add one. |
| **Record tab** | **Big bets**: log life-changing decisions (why, what you expect, the "at 80, would I regret not doing it?" test, how sure you are); the app brings each one back at 3, 6 and 12 months for a right / mixed / wrong verdict and shows how good your judgment really is. **Firsts**: moments that only happen once. **Voice notes**: press **V**, talk for up to 3 minutes; audio is stored only on this computer (IndexedDB; not included in JSON backups, download each note to keep a copy). **Lessons**: your own principles, saved with one tap from closed battles and reviewed bets, pin up to 10. Private mode hides Record too. |
| **Themes** | **Stone** (light, the original), **Carbon** (dark graphite and brass) and **Terminal** (black screen, amber glow, monospace numbers). Switch in Settings or press **T**. The Instagram card keeps its own light design. |
| **Balance** | One bar per category. Length = all-time decisions. Color = health over the last 7 days. Tap a bar for a detail popup: totals, a 7-day chart, target vs. actual share, the status in plain words, and recent decisions. |
| **Priorities** | Each category can have a one-line *why*, shown only when it falls behind. Drag to reorder, or use the arrow keys on the handle. Reordering instantly changes targets and recomputes health. Edit a category to rename, recolor or delete it; **New category** creates one at any position. |
| **+ button** | Pick a category, type "what I did", optionally "what happened as a result", then save. You get an Undo toast. |
| **History** | Every decision, newest first, grouped by day and filterable by category. Tap an entry to expand it, edit it or delete it. |
| **Today's card** | Renders a 1080×1920 PNG for an Instagram story: Day N, X/1000, the dot grid, the balance bars and today's standout decision with its result. Download it, or use Share on phones that support it. |
| **Day 1 ritual** | First run is a 3-minute guided setup: rank your priorities, one honest *why* for each, a **sealed letter** to the man who reaches 1000, and your first decision. Ends on "Day 1." Re-run it from Settings. |
| **Sealed letter** | Lives in the Record tab, sealed with a progress bar. It can't be read until the goal is reached. |
| **Finale** | At decision 1000: a full-screen "chapter complete" moment, you break the seal and read the letter, then see what the season built. Keep it as **the Book of the Grind** (printable, Save as PDF: priorities and whys, the numbers, proof, battles, big bets, firsts, lessons, letters, every decision) and a **poster** (1800×2400 PNG, one colored square per decision). Then **Season 2**: the goal moves up by one season, a new letter, nothing deleted. Book and poster are also in Settings any time. |
| **Hard moment** | Press **H** or the Hard moment button when you're about to break. It shows your own words back to you: the *why* of the priority slipping most, a voice note tagged "Good day", a pinned lesson, battles already won. A slow breathing bar and one ask: make it decision N+1. |
| **Playbook** | The method in 13 short chapters (what counts, ranking, writing the why, quiet days, battles, big bets, the finish line, keeping it safe), each with a button into the part of the app that does it. Book icon in the top bar, or press **?**. |
| **Safety net** | A snapshot of everything each day you open the app (14 kept) and before every import, erase or restore, with one-click restore. **Folder backup** (Chrome, Edge, desktop app): pick a folder once, ideally in Dropbox / iCloud / OneDrive, and the app keeps `1000-decisions-latest.json`, a weekly copy and your voice notes as audio files there. |
| **PIN lock** | Optional PIN for Battles and Record, asked once per session. A privacy screen, not encryption. |
| **Settings** | Goal, start date, optional signature on the card (e.g. `@yourname`), theme, JSON export/import (everything, including battles, record and letters), the Book and poster, safety net, PIN, and erase. |

## The health algorithm

These rules are fixed on purpose and are not user settings. They live in [`js/health.js`](js/health.js) and are covered by [`tests/health.test.js`](tests/health.test.js).

```
N            = number of categories
weight       = N - priorityRank + 1            (#1 gets the largest weight)
targetShare  = weight / sum of all weights
actualShare  = category decisions in last 7 days / all decisions in last 7 days
r            = actualShare / targetShare

0.8 ≤ r ≤ 1.3   → green  "Balanced"
r < 0.8         → red    "Neglected" (deeper red as r drops; #1 priority is labeled most urgently)
r > 1.3         → amber  "Over-invested — possibly avoiding something harder"
no decisions in the last 7 days → every bar is grey
```

"Last 7 days" means today plus the six calendar days before it, in local time. **Day N** counts the start date as Day 1.

## Run it on your computer (free, no internet, no hosting)

This is a website that runs straight from a folder on your computer. There is no server and nothing to deploy or pay for.

1. **Recommended (auto-updates):** install [Git for Windows](https://git-scm.com/download/win), then in a terminal run
   `git clone -b claude/adoring-archimedes-zkijke https://github.com/Otabekev/1000decision.git "1000"`
   in the folder where you want it. `Open 1000 Decisions.bat` then pulls the latest version every time it opens.
   **Or** click **Code → Download ZIP** and unzip it somewhere permanent (no auto-updates).
2. **Windows:** double-click **`Open 1000 Decisions.bat`** (or just `index.html`).
   **Mac:** double-click **`Open 1000 Decisions (Mac).command`** (first time: right-click → Open).
3. Optional, Windows: double-click **`Turn on auto-start (Windows).bat`** and it opens every time you start your PC. `Turn off auto-start (Windows).bat` undoes it.
   Mac: System Settings → General → Login Items → **+** → pick `Open 1000 Decisions (Mac).command`.

> **Your data is saved inside the browser** (e.g. Chrome or Edge) on this computer. Always open it with the same browser, and don't clear that browser's site data. Use **Settings → Export JSON** now and then as a backup; **Import JSON** restores it (also how you move to a new computer).

Developers can also serve it: `npm start` (http://localhost:8080).

## Desktop app (Windows and macOS)

`desktop/` wraps the same app in Electron: its own window and icon, an installer, **Open at login**, the microphone for voice notes, and **automatic updates**.

- Try it: `npm run desktop` (installs Electron the first time).
- Build an installer on your machine: `npm run desktop:build` → `desktop/dist/`.
- Release: bump `version` in `desktop/package.json`, then `git tag v1.0.1 && git push origin v1.0.1`. The **Desktop app** GitHub Action builds the Windows installer and the Mac app and attaches them to a GitHub Release. Installed apps find the update on their own and install it on the next restart.

Things to know:
- **Auto-updates read GitHub Releases, so the releases must be public.** Keep this repo private if you want, and publish releases to a separate public repo (change `publish.repo` in `desktop/package.json`).
- **Code signing** is optional but recommended for selling. Unsigned, Windows shows a SmartScreen "unknown publisher" warning and macOS needs right-click → Open. Signed macOS apps are also required for macOS auto-updates. Add the certificates as repository secrets (`CSC_LINK`, `CSC_KEY_PASSWORD`, and for Mac `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`); the workflow already uses them.
- The desktop app has its own storage. Move your data with **Export JSON** in the browser and **Import JSON** in the app.

## Selling it (license key + free trial)

Off by default: the app is free and unlimited. To sell it, edit [`js/config.js`](js/config.js):

1. Create a [Lemon Squeezy](https://www.lemonsqueezy.com) store and a product; turn on **license keys** for it (activation limit, e.g. 3 computers).
2. Fill in `buyUrl` (the checkout link), `storeId`, `productId` and `price`, and set `enabled: true`.

Then: a free trial (14 days by default, counted from the first decision) → a calm "Keep going" screen with **Get a license** and a key field. After the trial the data stays readable and exportable; only creating new entries needs a key. Keys are validated against Lemon Squeezy (from the main process in the desktop app), re-checked weekly, and keep working offline for 30 days. The key is stored apart from your data, so backups never contain it. **Settings → License** shows the status and can move the license to another computer.

Honest limit: a check that runs on the customer's computer can be bypassed by someone who edits the files. It keeps honest people honest, which is the market for a one-time purchase.

## Data format

One `localStorage` key, `thousand-decisions:v1`:

```json
{
  "version": 1,
  "categories": [{ "id": "…", "name": "Gym", "color": "#2F6BFF", "priorityRank": 1 }],
  "decisions": [{ "id": "…", "categoryName": "Gym", "text": "Trained at 6am", "result": "Energy all day", "timestamp": "2026-09-28T06:12:00.000Z" }],
  "settings": { "goal": 1000, "startDate": "2026-09-17", "signature": "@yourname", "lastBackupAt": null }
}
```

Newer fields sit next to these: `battles`, `checkins`, `bets`, `firsts`, `lessons`, `voice` (metadata; audio stays in IndexedDB), `letter`, `seasons`, `hardMoments`, `onboarded`, `lock` (salted PIN hash) and `reasons`.

Exports wrap the same data as `{ "app": "1000-decisions", "version": 1, "exportedAt": "…", "data": { … } }`. Imports accept either shape, and every field is validated before it replaces anything.

## Project layout

```
index.html              the single page
css/app.css             all styles (light, warm, high-contrast)
js/health.js            health algorithm (pure, unit-tested)
js/battles.js           battles: typical length, repeats, what works, check-ins (pure, unit-tested)
js/record.js            big bets reviews, judgment, firsts, lessons (pure, unit-tested)
js/media.js             private audio storage for voice notes (IndexedDB)
js/insights.js          proof totals and rhythm/quiet-period patterns (pure, unit-tested)
js/card.js              Instagram card renderer (Canvas 2D, no dependencies)
js/app.js               state, rendering, interactions (exposes window.TD for the modules below)
js/onboarding.js        Day 1 ritual and the sealed letter
js/finale.js            finale at the goal, the Book, the poster, seasons
js/trust.js             snapshots, folder backup, PIN lock
js/playbook.js          the Playbook and the Hard moment
js/desktop.js           desktop-app extras (version, updates, open at login)
js/license.js           license key and trial (off unless enabled in js/config.js)
js/config.js            product settings: license on/off, price, store
desktop/                Electron shell, installer config (electron-builder)
.github/workflows/      desktop build and release
sw.js                   offline cache (bump VERSION when shipping changes)
manifest.webmanifest    install metadata
css/fonts.css           fonts embedded as data URIs (so it works from file://)
fonts/                  Archivo + Archivo Condensed source files (OFL)
icons/                  app icons
tests/                  unit tests + Playwright end-to-end tests
```

## Tests

```bash
npm test             # pure modules: health, insights, battles, record (no install needed)
npm install          # installs Playwright for the end-to-end tests
npm run test:e2e     # drives the real page in Chromium
npm run test:desktop # launches the packaged desktop app (build it first with --dir)
```

## Credits

Font: [Archivo](https://github.com/Omnibus-Type/Archivo), SIL Open Font License (see `fonts/`), subset to Latin and pinned to a regular and a condensed width.
