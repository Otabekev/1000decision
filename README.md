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
| **Balance** | One bar per category. Length = all-time decisions. Color = health over the last 7 days. Tap a bar for a detail popup: totals, a 7-day chart, target vs. actual share, the status in plain words, and recent decisions. |
| **Priorities** | Each category can have a one-line *why*, shown only when it falls behind. Drag to reorder, or use the arrow keys on the handle. Reordering instantly changes targets and recomputes health. Edit a category to rename, recolor or delete it; **New category** creates one at any position. |
| **+ button** | Pick a category, type "what I did", optionally "what happened as a result", then save. You get an Undo toast. |
| **History** | Every decision, newest first, grouped by day and filterable by category. Tap an entry to expand it, edit it or delete it. |
| **Today's card** | Renders a 1080×1920 PNG for an Instagram story: Day N, X/1000, the dot grid, the balance bars and today's standout decision with its result. Download it, or use Share on phones that support it. |
| **Settings** | Goal, start date, optional signature on the card (e.g. `@yourname`), JSON export/import, and erase. |

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

Exports wrap the same data as `{ "app": "1000-decisions", "version": 1, "exportedAt": "…", "data": { … } }`. Imports accept either shape, and every field is validated before it replaces anything.

## Project layout

```
index.html              the single page
css/app.css             all styles (light, warm, high-contrast)
js/health.js            health algorithm (pure, unit-tested)
js/insights.js          proof totals and rhythm/quiet-period patterns (pure, unit-tested)
js/card.js              Instagram card renderer (Canvas 2D, no dependencies)
js/app.js               state, rendering, interactions
sw.js                   offline cache (bump VERSION when shipping changes)
manifest.webmanifest    install metadata
css/fonts.css           fonts embedded as data URIs (so it works from file://)
fonts/                  Archivo + Archivo Condensed source files (OFL)
icons/                  app icons
tests/                  unit tests + Playwright end-to-end tests
```

## Tests

```bash
npm test             # health algorithm (Node's built-in test runner, no install needed)
npm install          # installs Playwright for the end-to-end tests
npm run test:e2e     # drives the real page in Chromium
```

## Credits

Font: [Archivo](https://github.com/Omnibus-Type/Archivo), SIL Open Font License (see `fonts/`), subset to Latin and pinned to a regular and a condensed width.
