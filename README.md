# Gearnomic — Gear Manager

A web app for hikers, backpackers, and bikepackers to organize gear, plan trips, and track weight.

**Live:** [gearnomic.com](https://gearnomic.com)

---

## Features

### Gear Closet
- Full CRUD with inline cell editing — click any cell to edit directly in the table
- Sort by weight, cost, $/gram, usage, A–Z, category grouping, or custom drag-to-reorder
- Drag ⠿ handle to reorder items or reassign categories; drag category headers to reorder groups
- Filter by category and condition
- Custom fields — define your own gear attributes (R-value, fill power, loft, etc.), toggle as editable columns
- Manage categories — rename, reorder, recolour, set per-category weight targets

### Trips
- Grouped list (Planning / Confirmed / Past) with compact rows
- Trip detail with three sections: **Loadouts**, **Meal Plan**, **Info**
- Attach multiple loadouts to a trip — gear deduplicated across loadouts for accurate weight totals
- Attach a meal plan to a trip
- Weight target with progress bar and over/under indicator
- Share any trip via a public URL

### Loadouts
- Reusable named gear lists with carry types (packed / worn / consumable)
- Attach one or more loadouts to any trip (e.g. "Bike Kit" + "Camp Kit" for bikepacking)
- Share via public URL — recipients can save to their own account
- Save a trip's merged gear list as a new loadout

### Wishlist
- Research new gear with $/gram comparisons vs. what you own
- One-click convert to Gear Closet item
- Unlimited for all users

### Food Planning
- Day-by-day meal grid (breakfast / snack / lunch / dinner)
- Adjustable calorie and weight targets with per-meal percentage splits
- Skip individual meal slots per day
- Recipe library with 5 starter recipes
- Demo plan pre-loaded for all users to explore the feature
- Attach a plan to a trip

### Analytics
- **Free:** Weight by category bar chart, category weight targets
- **Supporter:** Full analytics — cost distribution, trip weight history, best/worst $/gram, gear never used, most-used gear

### Sharing
- Any trip or loadout shareable via a public URL — free for all users
- Recipients see a read-only gear list and can save it to their own account

### Feedback
- Bug report and feature request forms accessible from the footer and Settings
- Pre-fills user email and current page context automatically
- Submits via email to hello@gearnomic.com

### Accounts & Sync
- Email/password auth via Supabase with confirmation email
- Free: local storage only · Supporter: automatic cloud sync across all devices
- Forgot password / reset flow · Settings: units, display name, export, import

### Free vs Supporter

| Feature | Free | Supporter ($3.99/mo · $29/yr) |
|---------|------|-------------------------------|
| Gear items | Up to 30 | Unlimited |
| Trips | Up to 3 | Unlimited |
| Loadouts | Up to 2 | Unlimited |
| Wishlist | Unlimited | Unlimited |
| Sharing | ✓ | ✓ |
| Food planning | Explore only | Full — save & attach to trips |
| Custom fields | ✗ | ✓ |
| Full analytics | ✗ | ✓ |
| Cloud sync | ✗ | ✓ |

---

## Getting started (local)

Open `index.html` in any modern browser. No build step, no server.

```bash
git clone https://github.com/strawspapers/gearnomic.git
cd gearnomic
open index.html   # macOS
start index.html  # Windows
```

---

## Deploy to GitHub Pages

1. Push to a GitHub repository → **Settings → Pages**
2. Source: `Deploy from a branch` → `main` → `/` (root) → Save
3. Live at `https://YOUR_USERNAME.github.io/gearnomic`

> Hard refresh after pushing (`Cmd+Shift+R`) — GitHub Pages caches JS aggressively.

---

## Supabase setup

1. Create a free project at [supabase.com](https://supabase.com)
2. Run in the SQL editor in order:
   - `supabase/setup.sql`
   - `supabase/02_shared_lists.sql`
   - `supabase/03_supporter.sql`
3. Fill in `js/config.js` with your Project URL and anon key
4. **Authentication → URL Configuration** → set Site URL to your production domain

---

## Stripe (Supporter billing)

1. Create a product with two prices: $3.99/month and $29/year
2. Create Payment Links for each, enable "Allow promotion codes"
3. Set `STRIPE_MONTHLY_URL` and `STRIPE_ANNUAL_URL` in `js/app.js`
4. Deploy `supabase/functions/stripe-webhook/index.ts` as a Supabase Edge Function
5. Register webhook in Stripe, add secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

---

## Admin panel

Open `admin.html` locally (it's in `.gitignore` — never pushed to GitHub). Log in with your Supabase Project URL and service role key. Grants, revokes, and deletes take effect immediately.

---

## File structure

```
gearnomic/
├── index.html                          # App shell, nav, all panels, auth modal, footer
├── admin.html                          # Local-only admin panel (gitignored)
├── css/style.css                       # Full design system (Fraunces + DM Sans)
├── js/
│   ├── config.js                       # Supabase credentials (edit this)
│   ├── data.js                         # Seed + demo data
│   └── app.js                          # All application logic (~4,900 lines)
├── supabase/
│   ├── setup.sql                       # Run first
│   ├── 02_shared_lists.sql             # Run second
│   ├── 03_supporter.sql                # Run third
│   └── functions/
│       ├── stripe-webhook/index.ts     # Stripe webhook (Deno)
│       └── admin-grant-supporter/      # Admin API (optional — admin.html works without it)
├── schema/schema.sql                   # Reference PostgreSQL schema
└── README.md
```

---

## Tech stack

- Vanilla HTML + CSS + JavaScript (no framework, no build step)
- [Supabase JS v2](https://supabase.com/docs/reference/javascript) — auth + sync
- [Chart.js 4.4](https://www.chartjs.org/) — analytics
- [Stripe](https://stripe.com) — billing via Payment Links + webhook
- [Google Fonts](https://fonts.google.com/) — Fraunces + DM Sans
- `localStorage` — local cache, works without an account

---

## Roadmap

### Live ✓
- [x] Gear Closet with drag-to-reorder and category management
- [x] Trips with multiple attached loadouts
- [x] Loadouts (reusable gear lists)
- [x] Trip and loadout sharing via public URL
- [x] Food planning with day-by-day grid and recipe library
- [x] Cloud sync for Supporter accounts
- [x] Stripe billing with free/Supporter tier
- [x] Custom gear fields (Supporter)
- [x] Full analytics (Supporter)
- [x] Custom email confirmation flow
- [x] Bug report and feature request forms (footer + Settings)
- [x] Local admin panel (grant/revoke Supporter, delete accounts)

### Quality of life
- [ ] **Keyboard shortcuts** — `N` for new item, `F` to focus search, `Escape` to close modals — for power users who live in the app
- [ ] **Undo / undo history** — accidental deletes are painful; a simple undo toast ("Item deleted · Undo") for the last destructive action
- [ ] **Bulk actions in Gear Closet** — select multiple items to delete, recategorize, or add to a loadout at once
- [ ] **Gear Closet column chooser** — let users show/hide columns (cost, condition, usage) to reduce visual noise
- [ ] **Quick-add from header** — a `+` button always visible in the nav that opens a fast gear entry form without switching tabs
- [ ] **Weight unit toggle** — a single click to switch between grams, ounces, and pounds anywhere weights are displayed, without going into Settings
- [ ] **Trip weight history on dashboard** — small sparkline showing how base weight has changed across completed trips
- [ ] **Empty state improvements** — cleaner first-run experience with guided prompts for each empty tab
- [ ] **Mobile layout polish** — the app works on mobile but the gear table needs a more compact card layout for small screens

### Near-term features
- [ ] **Google OAuth** — "Continue with Google" sign-in via Supabase Auth provider; shown as primary CTA on the auth modal and save-prompt banner for guests
- [ ] **PWA / installable app** — service worker + manifest so Gearnomic installs on phone home screens and works offline
- [ ] **Gear maintenance reminders** — flag items due for inspection based on logged usage
- [ ] **Bikepacking-specific fields** — frame bag volume, bike fit notes, drivetrain notes
- [ ] **REI rebate tracker** — log purchases and track 10% dividend
- [ ] **In-app feedback submission** — replace mailto with a Formspree or Supabase-backed form so feedback is captured in-app without opening an email client
- [ ] **Staging environment** — second Supabase project + GitHub repo for QA before production deploys

### Analytics & observability
- [ ] **Visit analytics** — Plausible or Umami (privacy-friendly, no cookies, no consent banner)
- [ ] **Uptime monitoring** — UptimeRobot free tier
- [ ] **Error tracking** — Sentry free tier

### Growth & community
- [ ] **Community gear database** — wishlist data seeds a searchable database with real-world weights and prices
- [ ] **r/ultralight share formatting** — one-click share optimized for Reddit posts
- [ ] **Referral / gifting** — give a friend a free month of Supporter access

### Admin panel
- [ ] **User dashboard** — sign-up trends, active users, churn rate
- [ ] **Aggregated gear analytics** — most popular items across all users, average base weight by trip type
- [ ] **Content moderation** — review/remove public shared lists
- [ ] **Server-side free tier enforcement** — Postgres trigger validating item/trip/loadout counts so limits can't be bypassed via console or direct API calls; intentionally deferred until post-launch when abuse is a real concern

### Longer-term
- [ ] **Category comparison tables** — side-by-side comparison of e.g. all sleeping bags
- [ ] **Food planner v2** — nutrition breakdown (protein/carb/fat), import from Cronometer
- [ ] **Gear lending tracker** — log gear lent to friends, track returns
- [ ] **Trip journal** — attach photos and notes to completed trips
- [ ] **Resupply planner** — for thru-hikers: map resupply points, calculate food drops per section
- [ ] **Mobile app** — native iOS/Android via Capacitor once web product is stable

---

## To-do

- [ ] **Revisit font pairing** — Fraunces + DM Sans is solid but common in indie SaaS. If the brand should feel more distinctively "expedition log," consider something like Tiempos/Söhne, or pair Fraunces with a more characterful mono for data tables.
