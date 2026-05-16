# Handoff: Gearnomic — Cabin v2 (monochrome editorial redesign)

## Overview

This is a redesign of the Gearnomic web app — a gear management tool for hikers, backpackers, and bikepackers, with first-class trip planning and meal planning as the differentiating value. The redesign deliberately moves the visual language **away** from the current production look (warm cream + forest-green primary + rounded cards on `gearnomic.com`) toward a flat, monochrome editorial direction.

The redesign was driven by a specific concern: the target audience is skeptical of AI tooling, and the current production design reads visually similar to generic Claude/Anthropic-style dashboards. This redesign intentionally avoids:

- Floating white "cards" with subtle borders on a tinted page background
- Rounded corners
- Forest-green (or any color) accents in the chrome
- Serif fonts beyond the wordmark
- Outdoorsy/earthy/aged-paper tropes

The information architecture also shifts to surface the **gear + trip + meal-plan cohesion** as the product's headline value: the Trips landing leads with the next trip and three sibling tiles (Pack / Itinerary / Meals) that anchor the cross-feature story.

## About the design files

The files in this bundle are **design references created in HTML/JSX** — prototypes showing intended look and behavior, not production code to copy directly. The task is to **recreate these designs inside the existing Gearnomic codebase** (`uploads/index.html` style — vanilla JS + CSS, Supabase, Chart.js) using its established patterns. Reuse existing class names (`.card`, `.btn`, `.data-table`, `.sub-nav`, etc.) and modify their CSS rather than rewriting the JS structure.

## Fidelity

**High-fidelity.** Colors, typography, spacing, borders, and interaction patterns are all final. The developer should match them precisely.

## Files

Inside this handoff folder:

- **`Gearnomic - Cabin v2.html`** — open this in a browser to see the three reference screens stacked vertically (1280px wide each).
- **`cabin-v2.jsx`** — the React/JSX source for all three screens. Contains the design tokens, scoped CSS, and component markup. Read this to see exact pixel values, class structures, and content.
- **`design-canvas.jsx`** — dependency used by the parent multi-direction file (not required when viewing this standalone deck, but kept for compatibility).

## Design tokens

All values live in the `cab2Tokens` object at the top of `cabin-v2.jsx`. Reproducing them here as the canonical reference:

### Color

| Token | Hex | Usage |
|---|---|---|
| `bg` | `#F4F4F1` | Page surface — used everywhere. Cool off-white with the faintest warm hint. NOT cream. |
| `surface2` | `#E8E7E2` | Hover/active tint on rows, focused inputs |
| `ink` | `#0F0F10` | Primary text, all borders, all button fills, all "active" states |
| `ink2` | `#3A3A3D` | Secondary text |
| `ink3` | `#7E7E80` | Tertiary text, labels, captions |
| `border` | `#0F0F10` | Same as `ink` — primary 1.5px borders |
| `borderSoft` | `#CFCEC8` | Hairline 1px row dividers inside tables and lists |

**There is no accent color.** Every active state, primary button, pill, and emphasis treatment uses `ink` against `bg`. The single exception is the cairn logo SVG, which is also `ink`.

### Typography

Two Google Fonts loaded:

- **`Fraunces`** (weights 400/500/600, optical-size 9–144) — **used only on the wordmark "Gearnomic" in the header.** Do not use Fraunces anywhere else. Earlier iterations applied it to page titles and card titles; that read as AI-default and was removed.
- **`DM Sans`** (weights 300/400/500/600) — body, page titles, card titles, hero numbers, all UI text.

Type stack fallback (used in `cab2Tokens.body`):
```css
'DM Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
```

Monospace fallback (used for the unit toggle):
```css
ui-monospace, 'SF Mono', 'Menlo', Consolas, monospace
```

Type scale used:

| Class | Size | Weight | Letter-spacing | Line-height | Notes |
|---|---|---|---|---|---|
| `.logo-name` (wordmark) | 22px | 600 | -0.015em | — | Fraunces |
| `h1.page-title` | 30px | 500 | -0.02em | 1.15 | DM Sans |
| Page hero name (e.g. "Sawtooth") | 36px | 600 | -0.025em | 1.05 | DM Sans, inline |
| Plan title (Food page) | 26px | 600 | -0.02em | 1.15 | DM Sans, inline |
| `.tile .v` (hero stat numbers) | 24px | 600 | -0.015em | — | tabular-nums |
| `.card-title` | 14px | 600 | -0.005em | — | |
| Body / table cells | 13.5–14px | 400 | — | 1.5 | |
| `.meta` | 12.5px | 400 | — | — | `ink3` |
| `.smallcap` | 11px | 500 | 0.08em | — | uppercase, `ink3` |
| Table headers | 11px | 500 | 0.04em | — | uppercase, `ink3` |

### Spacing & sizing

- **Border-radius: 0 across the board.** No element has a rounded corner. Pills, buttons, inputs, the header — all sharp-cornered. The `rSm/rMd/rLg` tokens are all `'0px'`.
- **Border weights**: structural lines (header bottom, table-head bottom, sub-nav bottom, section-header bottom, card-header bottom, button outlines, input outlines) = **1.5px solid `ink`**. Row dividers inside tables = **1px solid `borderSoft`**.
- **Max page width**: `1200px` centered with `padding: 24px`.
- **Button heights**: `.btn` = 32px, `.btn-sm` = 28px.
- **Input/select height**: 32px.

### Shadows

**None.** No `box-shadow` anywhere. Elevation is communicated through borders and spacing only.

## Screens / views

The bundle has three reference screens. Each is rendered at 1280px wide × 1200px min-height.

---

### Screen 1 — Trips landing (`Cab2TripsLanding`)

**Purpose:** Main entry point for the user's planned and completed trips. Surfaces the cohesion between gear, itinerary, and meals via a "Next trip" hero card with three sibling tiles.

**Layout (top to bottom):**

1. **Header bar** (`.site-header`, full-width, hairline bottom)
   - Left: cairn SVG (22px) + `Gearnomic` wordmark (22px Fraunces, 600)
   - Center: main-nav — `Gear · Loadouts · Trips · Food · Stats` (active tab has 2px ink underline + bold)
   - Right (in flex row, 8px gap):
     - Unit toggle `g · lb` button — outlined, 30px tall, mono 11px text, inverts on hover
     - User-menu trigger `jordan@example.com ▾` — same outlined style
     - **The menu is shown OPEN on this screen** as a 200px-min, absolutely-positioned dropdown 8px below the trigger, anchored right. Items: `Profile`, `Settings`, `Export data`, `── divider ──`, `Sign out`. Each item is 10px×14px padded, divided by 1px `borderSoft`, hover state = ink fill / bg text.

2. **Page header** (after header bar, inside `main` container)
   - Left: `Trips` (h1) + sub `3 upcoming · 8 logged · 14 days in field this year`
   - Right: `Manage trip types` (ghost button) + `+ New Trip` (primary, ink fill)

3. **Hero row** — 2-col grid `1.6fr 1fr`, 18px gap
   - Left (1.6fr): "Next trip" card
     - Section header (`.card-header` — title + sub on left, `Open trip →` link right, 1.5px ink underline)
     - 22px-padded body: `Upcoming` smallcap, `Sawtooth` (36px display), date/distance summary, `Ready to pack` pill (solid ink fill, bg text) right-aligned
     - Three-tile row at bottom, divided by 1px `borderSoft` columns, separated from above by 1px `borderSoft` top:
       - Tile 1: **Pack** — lbl, `14.02 lb` (24px), `54 items · 26.04 lb skin-out`, `Open loadout →` link
       - Tile 2: **Itinerary** — lbl, `5 days` (24px), `56 mi · 6 800 ft · 4 camps`, `Open itinerary →` link
       - Tile 3: **Meals** — lbl, `12 meals` (24px), `14 800 kcal · 5.5 lb food`, `Open meal plan →` link
   - Right (1fr): "Upcoming trips" card — 3 row list, each with trip name (15px bold), pill (`Ready` solid, `Planning`/`Idea` outlined warn), location meta, dates + sub footer

4. **All trips table** — full-width card containing:
   - `.card-header` with title + search input (200px), trip-type select, sort select
   - 7-col `.data-table`: Trip · Location · Dates · Miles · Nights · Base wt · Status

**Content (verbatim):**
- Page title: `Trips`
- Page sub: `3 upcoming · 8 logged · 14 days in field this year`
- Hero trip name: `Sawtooth`
- Hero meta: `Thu 18 Jul → Mon 22 Jul · 4 nights · 56 mi · solo`
- Hero pill: `Ready to pack`
- Upcoming trips rows: `Sawtooth Loop / Sawtooth Wilderness, ID / 18 — 22 Jul / 4 nt · 56 mi / Ready`, `Beartooth East / Beartooth, MT / 12 — 18 Aug / 6 nt · 78 mi / Planning`, `Bob Marshall North / Bob Marshall, MT / 03 — 11 Sep / 8 nt · 92 mi / Idea`

---

### Screen 2 — Food → My plans → Sawtooth (`Cab2Meals`)

**Purpose:** Meal plan detail view for a specific trip. Demonstrates the sub-nav pattern and the depth of meal planning (day-by-day, pantry, shopping).

**Layout (top to bottom):**

1. **Header bar** — same as Screen 1, `Food` tab active. Dropdown closed.

2. **Page header**
   - Left: `Food Planning` (h1) + sub `Plan meals, calories and weight per trip`
   - Right: `+ New plan` (primary button)

3. **Sub-nav** (`.sub-nav` — 1.5px ink bottom rule)
   - Tabs: `My plans` (active — ink fill, bg text, 600), `My recipes`, `Recipe database`

4. **Breadcrumb + plan title row**
   - Left: breadcrumb `My plans › Sawtooth` (12.5px meta), then plan title `Sawtooth — five days, twelve meals` (26px, 600), then meta `Linked to trip [Sawtooth Loop] · 3 700 kcal/day target · solo · no resupply.`
   - Right: 4 outlined buttons — `+ Add meal`, `From recipe`, `Shopping list`, `Print` (primary)

5. **Stats row** — single card containing 5-col `.tile-row`. Each tile: lbl uppercase, value (24px), sub.
   - Calories: `14 420 kcal` / `3 700 kcal/day avg`
   - Food weight: `5.12 lb` / `2 320 g total`
   - Days planned: `5 / 5` / `all days have meals`
   - Kcal / gram: `6.22` / `target ≥ 4.5`
   - Sacks: `4` / `bear-safe · color-coded`

6. **Day-by-day** — single card. Each day is a section with:
   - Day banner (background `surface2`): `Day N` (14px bold) + date meta, partial-day pill on right if any, day totals (kcal · g) right-aligned
   - `.data-table` (no thead) with rows: meal-type meta (140px) · meal name link · kcal · grams · `⋯` overflow

7. **Pantry & shopping** — card with header `Pantry & shopping` + sub `17 unique foods · 4 sacks`, right link `View shopping list →`. Below: `.data-table` with cols Item · Used in · Per serving · Servings · Total wt · Sack (rendered as solid-ink pills).

---

### Screen 3 — Gear → My closet (`Cab2Gear`)

**Purpose:** Inventory view of every gear item. The product's foundation.

**Layout (top to bottom):**

1. **Header bar** — same. `Gear` tab active. Dropdown closed.

2. **Sub-nav** — tabs `My closet` (active), `Wishlist`, `Gear database`. (Sub-nav appears BEFORE page-header on this screen, since the sub-nav switches between distinct sub-pages and the page header changes with it.)

3. **Page header**
   - Left: `Gear Closet` + sub `114 items · 21.4 kg total · 12 retired · 54 currently in pack on Sawtooth` (with `Sawtooth` as inline link)
   - Right: `+ Add Item` (primary button — this button is **only** on the Gear page; no global "+ Add gear" in the header)

4. **Toolbar** (flex row, gap 10px, wrap):
   - Left group: search input (220px wide, placeholder `Search by name or brand…`), `All categories` select, `Any condition` select
   - Right: `Group by category` select (margin-left auto), `Columns ▾`, `Manage categories`, `Bulk update`

5. **Gear table** — 9-col `.data-table`:
   - `Cat. №` (mono 11.5px, ink3, 70px)
   - `Item` (link, weight 500)
   - `Category` (link)
   - `Brand / Model` (meta)
   - `Weight` (tabular num, right-aligned, 80px)
   - `Cost` (tabular num, right-aligned, 70px)
   - `Condition` (meta — `Excellent` / `Good` / `Fair`)
   - `Status` (pill: `In pack` solid ink fill; `On shelf` / `Retired` as plain meta text)
   - `In loadout` (link to loadout name or `—`)

6. **Footer row** below the table:
   - Left meta: `Showing 14 of 114 items. [Show all] · [Show retired only]`
   - Right meta: `Filtered total: 4 770 g · $1 803`

## Interactions & behavior

The mocks are static, but the intended behaviors:

- **Header user-menu**: click trigger → toggle dropdown. Close on outside-click. Items navigate to: Profile page / Settings page / triggers JSON export / signs out.
- **Unit toggle (`g · lb`)**: cycles between metric/imperial display. All weight values in the page re-render with the new unit. Tooltip on hover: "Toggle weight units".
- **Main-nav tabs** and **sub-nav tabs**: standard SPA tab switching. Active tab has 2px ink underline + 600 weight (main) or full ink-fill bg + bg text (sub).
- **Trip-card tiles** (`Open loadout / Open itinerary / Open meal plan` links): jump to the corresponding focused page for the active trip.
- **Day-banner overflow icon (`⋯`)**: opens a per-meal context menu (edit, duplicate, delete).
- **Hover states**:
  - Buttons (non-primary): invert — bg becomes ink, text becomes bg
  - Primary buttons: darken to `ink2`
  - Table rows: bg becomes `surface2`
  - Links: get a 1px ink underline (already underlined `.link` class shows hover ink-fill bg, bg text)
  - User-menu items: full ink fill, bg text

- **Form validation, loading, error states**: not specified in this redesign — keep the existing implementations from the current production app and re-style elements with the new tokens.

## State management

No new state shapes — this is a visual redesign of an existing app. Re-use the existing Supabase-backed state in `uploads/index.html` (gear items, loadouts, trips, food plans, recipes). The new screens consume the same data.

## Assets

- **Cairn logo SVG**: rendered inline as `Cab2Cairn` in `cabin-v2.jsx`. Four stacked rectangles at viewBox `0 0 24 24`. Single ink fill. Replace the existing `.logo-mark` "GN" element in `index.html` with this SVG.
- **Fonts**: Fraunces + DM Sans loaded from Google Fonts (see `Gearnomic - Cabin v2.html` head).
- **No bitmap images or icons** are used in this redesign. The SVG sprite system from `uploads/index.html` (the `<symbol>` icons for nav, account, etc.) can be kept for mobile/secondary nav.

## What to change in the existing codebase

Mapping the redesign back to `uploads/index.html`:

- **CSS file `css/style.css`** is where almost all the work happens. Update the CSS variables / token values to the table above. Drop `border-radius` from `.card`, `.btn`, `.input`, `.select`, `.pill`, etc. Replace the cream `--bg` with `#F4F4F1`. Remove `--accent: #2A4032` references from buttons / pills / active states — leave the variable defined but only reference it from the cairn SVG.
- **Replace `.logo-mark`** (the green square with "GN" text) with the cairn SVG.
- **Drop the global "+ Add gear" header button** (`#site-header .header-actions button[onclick="openQuickAdd()"]`). The page-level `+ Add Item` button inside the Gear panel stays.
- **Keep `unit-toggle-btn` and the user-menu dropdown** in the header — restyle them to match the outlined-button look.
- **Use `Fraunces` only on `.logo-name`**. Audit any other `var(--font-disp)` references in the CSS and switch them to `var(--font-body)` (DM Sans).
- **Trips landing**: build the "Next trip" hero card with the 3-tile row. The existing dashboard markup (`#dash-trips`, `#dash-next-trip`) needs the tile structure added.
- **Food / My plans**: the sub-nav already exists in markup (`#food-sub-nav`) — restyle, and add the breadcrumb + day-banner pattern inside the plan-detail view.

## Open questions for the developer

- The redesign assumes the **Trips tab is the implicit landing page** (no separate Dashboard). Confirm with the product owner whether the current `#tab-stats` (Stats / Analytics) should stay accessible — it is, via the main-nav, but it's not redesigned here.
- **Mobile**: the redesign is desktop-only at this stage. The mobile bottom-nav from `index.html` is unchanged. The new monochrome tokens should drop in cleanly; the layout patterns (single-column stacks for cards, etc.) need a pass.
- **Dark mode**: not designed. If supported, an inverted palette (`#0F0F10` bg, `#F4F4F1` ink) would be the obvious continuation, but the user has not signaled wanting one.
