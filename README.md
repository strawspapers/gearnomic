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

# Gearnomic — Gear Manager

A web app for hikers, backpackers, and bikepackers to organize gear, plan trips, and track weight.

**Live demo:** deploy via GitHub Pages (see below)

---

## Features

- **Gear Closet** — full CRUD, inline cell editing, search, filter, and sort (including custom drag-to-reorder). Category headers with drag-and-drop recategorization. Custom fields you define (R-value, fill power, etc.) shown as editable columns.
- **Trips** — three-section layout (Planning / Confirmed / Past). Per-trip gear lists with category grouping, carry type badges (packed / worn / consumable), weight targets, miles, and nights auto-computed from dates.
- **Templates** — reusable gear loadouts with carry types. Apply to any trip in replace or merge mode.
- **Wishlist** — research new gear with $/gram comparisons vs. what you own. One-click convert to Gear Closet item.
- **Food Planning** — day-by-day meal grid (breakfast / snack / lunch / dinner) with calorie and weight targets. Recipe library with 5 starter recipes.
- **Analytics** — weight and cost charts by category, weight-target progress bars, most-used gear table.
- **Custom fields** — define your own gear attributes (number or text), toggle them as editable columns in the Gear Closet, and set values inline.
- **Category management** — rename, reorder, recolour, and set per-category weight targets.
- **Accounts & sync** — Supabase auth (email/password), cloud sync with debounced background saves, forgot-password flow, user settings (display name, units, base weight target, password change).
- **Import / Export** — download your full data as JSON, reload it any time.

---

## Getting started (local)

Just open `index.html` in any modern browser. No build step, no server.

```bash
git clone https://github.com/YOUR_USERNAME/gearnomic.git
cd gearnomic
open index.html   # macOS
start index.html  # Windows
```

Data is stored in your browser's `localStorage` under the key `trailkit_v1`.

---

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. Go to **Settings → Pages**.
3. Set **Source** to `Deploy from a branch`, choose `main`, folder `/` (root).
4. Click **Save**. Your site will be live at `https://YOUR_USERNAME.github.io/gearnomic` within a minute or two.

> **Note:** GitHub Pages aggressively caches JS files. After pushing updates, do a hard refresh (`Cmd+Shift+R` / `Ctrl+Shift+R`) or open an incognito window to see changes immediately.

---

## Supabase backend setup

1. Create a free project at [supabase.com](https://supabase.com).
2. Run `supabase/setup.sql` in the Supabase SQL editor.
3. Fill in `js/config.js` with your Project URL and anon public key.
4. Push and deploy.

The app stores each user's full state as a single JSONB row — no schema migration needed when adding new features.

---

## File structure

```
gearnomic/
├── index.html              # App shell + all tab panels + auth modal
├── css/
│   └── style.css           # Full design system (Fraunces + DM Sans)
├── js/
│   ├── config.js           # Supabase credentials (edit this)
│   ├── data.js             # Seed data (categories, trip types, starter recipes)
│   └── app.js              # All application logic (~3,400 lines)
├── supabase/
│   └── setup.sql           # Run once in Supabase SQL editor
├── schema/
│   └── schema.sql          # Reference PostgreSQL schema
└── README.md
```

---

## Tech stack

- Vanilla HTML + CSS + JavaScript (no framework, no build step)
- [Supabase JS v2](https://supabase.com/docs/reference/javascript) — auth + database sync
- [Chart.js 4.4](https://www.chartjs.org/) — analytics charts
- [Google Fonts](https://fonts.google.com/) — Fraunces + DM Sans
- `localStorage` — local cache (instant load, works offline)

---

## Roadmap

### Near-term
- [ ] Trip sharing via public URL
- [ ] Gear condition maintenance reminders
- [ ] Bikepacking-specific categories and fields
- [ ] PWA / mobile app (offline-first, installable)
- [ ] REI rebate tracker

### Analytics & observability
- [ ] **Visit analytics** — add Plausible or Umami (single script tag, privacy-friendly, no cookies)
- [ ] **Uptime monitoring** — UptimeRobot (free, email alerts if GitHub Pages goes down)
- [ ] **Error tracking** — Sentry free tier

### Admin panel
- [ ] **User management** — view all registered accounts, sign-up trends, last-active dates; currently available in Supabase dashboard but a dedicated UI would be cleaner
- [ ] **Aggregated gear analytics** — most popular gear items across all users, most common categories, average base weight by trip type; requires a Supabase Edge Function that queries across all `user_data` rows using the service role key (never exposed in the frontend)
- [ ] **Content moderation tools** — if trip sharing is added, ability to review/remove public content
- [ ] **Admin auth** — protected `/admin` route, separate from regular user auth, keyed to specific email addresses or a Supabase custom claim

### Longer-term
- [ ] Category gear comparisons (lighterpack-style comparison tables)
- [ ] Food planner enhancements — import from MyFitnessPal, nutrition breakdown
- [ ] Gear lending / loaning tracker (lend gear to friends, track returns)
- [ ] Community gear database — look up weights and specs for common items without manual entry

