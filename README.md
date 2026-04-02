# Gearnomic — Gear Manager

A web app for hikers, backpackers, and bikepackers to organize gear, plan trips, and track weight.

**Live demo:** deploy via GitHub Pages (see below)

---

## Features

- **Gear Closet** — full CRUD, search, filter by category/condition, sort by weight/cost/$/gram/usage. Click any row to expand details, log usage days and nights, and link to product pages.
- **Trips** — plan trips with gear lists, weight targets, and per-category breakdowns. Compare base weight vs. worn weight.
- **Wishlist** — research new gear with $/gram comparisons against what you own. Your "potential gear" spreadsheet sheet, built in.
- **Analytics** — weight and cost charts by category, weight targets progress bars, most-used gear table.
- **Import / Export** — download your data as JSON, reload it any time. No account required.

---

## Getting started (local)

Just open `index.html` in any modern browser. No build step, no server, no dependencies beyond the CDN-loaded Chart.js.

```bash
git clone https://github.com/YOUR_USERNAME/gearnomic.git
cd gearnomic
open index.html   # macOS
# or
start index.html  # Windows
```

Data is stored in your browser's `localStorage` under the key `trailkit_v1`.

---

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. Go to **Settings → Pages**.
3. Set **Source** to `Deploy from a branch`, choose `main`, folder `/` (root).
4. Click **Save**. Your site will be live at `https://YOUR_USERNAME.github.io/gearnomic` within a minute or two.

---

## File structure

```
gearnomic/
├── index.html          # App shell + HTML structure
├── css/
│   └── style.css       # Full design system
├── js/
│   ├── data.js         # Seed data (your spreadsheet imported here)
│   └── app.js          # All application logic
├── schema/
│   └── schema.sql      # PostgreSQL schema for future backend
└── README.md
```

---

## Adding a backend (future)

The `schema/schema.sql` file contains a complete PostgreSQL schema designed for [Supabase](https://supabase.com). To migrate from localStorage to a real database:

1. Create a Supabase project and run `schema.sql` in the SQL editor.
2. Replace the `loadState()` / `saveState()` functions in `app.js` with Supabase client calls.
3. Add authentication via Supabase Auth.

The schema supports: user accounts, gear items with all spreadsheet fields, trips with gear junction table, wishlists, REI rebate tracking, category comparisons, food planning, and trail recipes.

---

## Customizing seed data

Edit `js/data.js` to change the starter gear list. After editing, clear `localStorage` in your browser's developer tools (Application → Local Storage → delete `trailkit_v1`) and reload.

---

## Tech stack

- Vanilla HTML + CSS + JavaScript (no framework, no build step)
- [Chart.js 4.4](https://www.chartjs.org/) for analytics charts (loaded from CDN)
- [Google Fonts](https://fonts.google.com/) — Fraunces + DM Sans
- `localStorage` for persistence

---

## Roadmap

- [ ] REI rebate tracker
- [ ] Food planner (calories/day, 2lb/day rule, trail recipes)
- [ ] Category gear comparisons (sit pads style)
- [ ] Trip sharing via public URL
- [ ] Gear condition maintenance reminders
- [ ] Bikepacking-specific categories
- [ ] Mobile app (PWA)
- [ ] Supabase backend + accounts
