# 1000 Decisions

A personal daily accountability tool. You log small acts of discipline ("decisions") toward a goal of 1000. Every decision belongs to a priority-ranked category, and the app shows, by color, whether each priority is getting the **right amount** of attention. It flags when your top priority is being neglected while easy categories get farmed.

- **One page. No backend, no login.** Everything is stored in `localStorage` on your device.
- **Fast.** Plain HTML, CSS and JavaScript with no framework and no build step. It opens instantly and works offline.
- **Under 30 seconds a day.** Tap **+**, tap a category, type what you did, press Enter twice.

## What's on the page

| Section | What it does |
| --- | --- |
| **Summary** | `X / 1000` in huge type, **Day N**, and a 1000-dot grid. Each dot is one decision, colored by its category. |
| **Balance** | One bar per category. Length = all-time decisions. Color = health over the last 7 days. Tap a bar for a detail popup: totals, a 7-day chart, target vs. actual share, the status in plain words, and recent decisions. |
| **Priorities** | Drag to reorder, or use the arrow keys on the handle. Reordering instantly changes targets and recomputes health. Edit a category to rename, recolor or delete it; **New category** creates one at any position. |
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

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
npm start            # serves on http://localhost:8080
```

### Put it on your phone

1. Host the folder anywhere static. GitHub Pages is easiest: **Settings → Pages → Deploy from a branch**, pick the branch and `/ (root)`.
2. Open the URL on your phone, then **Share → Add to Home Screen** (iOS) or **Install app** (Android). It then launches full screen and works offline.

> **Your data lives only in that browser.** On iPhone, the home-screen app and Safari keep separate storage, so pick one and stick with it. Use **Settings → Export JSON** now and then, and before switching phones. **Import JSON** restores a backup.

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
js/card.js              Instagram card renderer (Canvas 2D, no dependencies)
js/app.js               state, rendering, interactions
sw.js                   offline cache (bump VERSION when shipping changes)
manifest.webmanifest    install metadata
fonts/                  Archivo, Archivo Expanded, Instrument Serif Italic (OFL, self-hosted)
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

Fonts: [Archivo](https://github.com/Omnibus-Type/Archivo) and [Instrument Serif](https://github.com/Instrument/instrument-serif), both under the SIL Open Font License (see `fonts/`). They are subset to Latin, and Archivo is pinned to two widths.
