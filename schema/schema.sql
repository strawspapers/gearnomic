-- =============================================================================
-- Gearnomic Database Schema
-- PostgreSQL 15+
-- =============================================================================

-- Enable useful extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- fast ILIKE / fuzzy search on gear names

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE item_condition AS ENUM ('excellent', 'good', 'fair', 'poor');
CREATE TYPE carry_type     AS ENUM ('packed', 'worn', 'not_carried');
CREATE TYPE trip_status    AS ENUM ('planning', 'confirmed', 'completed', 'cancelled');
CREATE TYPE trip_type      AS ENUM ('backpacking', 'bikepacking', 'car_camping', 'day_hike', 'other');
CREATE TYPE meal_time      AS ENUM ('breakfast', 'lunch', 'dinner', 'snack');
CREATE TYPE share_role     AS ENUM ('viewer', 'commenter', 'editor');
CREATE TYPE rebate_type    AS ENUM ('member_10', 'visa_15', 'other');

-- =============================================================================
-- USERS
-- (Designed to integrate with Supabase Auth — auth.users is the source of
--  truth for credentials; this table holds app-specific profile data.)
-- =============================================================================

CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_id             UUID UNIQUE,          -- foreign key to auth.users.id (Supabase)
    username            TEXT UNIQUE NOT NULL,
    display_name        TEXT,
    email               TEXT UNIQUE NOT NULL,
    unit_preference     TEXT NOT NULL DEFAULT 'metric' CHECK (unit_preference IN ('metric', 'imperial')),
    base_weight_target_g INT,                 -- user's personal base weight goal in grams
    bio                 TEXT,
    avatar_url          TEXT,
    is_public           BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- GEAR CATEGORIES
-- Seeded with your spreadsheet's categories; users can add custom ones.
-- =============================================================================

CREATE TABLE gear_categories (
    id               SERIAL PRIMARY KEY,
    user_id          UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = system default
    name             TEXT NOT NULL,
    sort_order       INT NOT NULL DEFAULT 0,
    weight_target_g  INT,       -- per-category UL target weight (grams)
    color_hex        TEXT,      -- for UI display
    icon             TEXT,      -- icon slug
    is_system        BOOLEAN NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, name)
);

-- System-level default categories (seeded from your spreadsheet)
INSERT INTO gear_categories (user_id, name, sort_order, weight_target_g, is_system) VALUES
    (NULL, 'Pack',                  10, 900,  true),
    (NULL, 'Shelter',               20, 1200, true),
    (NULL, 'Sleep',                 30, 1800, true),
    (NULL, 'Worn Clothing',         40, 1600, true),
    (NULL, 'Packed Clothing',       50, 1200, true),
    (NULL, 'Cooking and Water',     60, 700,  true),
    (NULL, 'Health and Safety',     70, 300,  true),
    (NULL, 'Electronics and Misc',  80, 600,  true),
    (NULL, 'Camera Gear',           90, 500,  true),
    (NULL, 'Fishing',              100, 200,  true),
    (NULL, 'Navigation',           110, 150,  true),
    (NULL, 'Food and Water',       120, NULL, true);

-- =============================================================================
-- GEAR ITEMS  (your master "Gear list" sheet)
-- Central table — every field from your spreadsheet is represented.
-- =============================================================================

CREATE TABLE gear_items (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id         INT NOT NULL REFERENCES gear_categories(id),

    -- Core identity (your cols D, E, F)
    name                TEXT NOT NULL,
    brand               TEXT,
    model               TEXT,

    -- Weight (your cols J, K, L — store canonical grams, derive oz/lb in app)
    weight_g            NUMERIC(8, 2),

    -- Cost and purchasing (your cols H, S)
    cost_usd            NUMERIC(10, 2),
    purchase_date       DATE,
    purchase_retailer   TEXT,               -- 'REI', 'Amazon', 'manufacturer', etc.
    product_url         TEXT,               -- your col R (link)

    -- Carry flags (your cols A "Pack", B "packed?")
    carry_type          carry_type NOT NULL DEFAULT 'packed',
    is_included         BOOLEAN NOT NULL DEFAULT true,   -- your col G "include" toggle

    -- Pack-specific metadata (your col O "frame", col Q "liters")
    frame_type          TEXT,               -- 'internal aluminum', 'frameless', etc.
    volume_liters       NUMERIC(6, 2),      -- packs, bottles, pots, bear cans
    torso_size_cm       TEXT,               -- pack fit sizing

    -- Item specs / misc stat (your col P "misc stat")
    misc_stat           TEXT,               -- free-form spec field: watts, R-value, etc.

    -- Condition and maintenance
    condition           item_condition NOT NULL DEFAULT 'good',
    condition_notes     TEXT,               -- what's worn, damaged, needs fixing

    -- Usage tracking (nights for sleep system, days for everything)
    usage_days          INT NOT NULL DEFAULT 0,
    usage_nights        INT NOT NULL DEFAULT 0,   -- for tent, sleeping bag, pad

    -- Notes
    notes               TEXT,

    -- Derived / cached (recomputed on write via trigger)
    cost_per_gram       NUMERIC(10, 6) GENERATED ALWAYS AS (
                            CASE WHEN weight_g > 0 AND cost_usd > 0
                                 THEN cost_usd / weight_g
                                 ELSE NULL
                            END
                        ) STORED,

    -- Soft delete
    archived            BOOLEAN NOT NULL DEFAULT false,
    archived_at         TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast text search on name + brand + model
CREATE INDEX idx_gear_items_user        ON gear_items(user_id);
CREATE INDEX idx_gear_items_category    ON gear_items(category_id);
CREATE INDEX idx_gear_items_search      ON gear_items USING gin(
    (name || ' ' || COALESCE(brand,'') || ' ' || COALESCE(model,'')) gin_trgm_ops
);

-- =============================================================================
-- GEAR USAGE LOG  (maintenance history — who used it, when, notes)
-- =============================================================================

CREATE TABLE gear_usage_log (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gear_item_id UUID NOT NULL REFERENCES gear_items(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    log_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    days_added  INT NOT NULL DEFAULT 1,
    nights_added INT NOT NULL DEFAULT 0,
    trip_id     UUID,                  -- FK added after trips table defined below
    event_type  TEXT NOT NULL DEFAULT 'use'
                    CHECK (event_type IN ('use', 'maintenance', 'repair', 'wash', 'inspection')),
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_log_item ON gear_usage_log(gear_item_id);
CREATE INDEX idx_usage_log_trip ON gear_usage_log(trip_id);

-- =============================================================================
-- GEAR ITEM PHOTOS
-- =============================================================================

CREATE TABLE gear_item_photos (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gear_item_id UUID NOT NULL REFERENCES gear_items(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,          -- Supabase Storage bucket path
    caption      TEXT,
    is_primary   BOOLEAN NOT NULL DEFAULT false,
    sort_order   INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- REI PURCHASES & REBATES  (your cols S "rei purchase", T/U rebate calculations)
-- =============================================================================

CREATE TABLE rei_purchases (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gear_item_id    UUID REFERENCES gear_items(id) ON DELETE SET NULL,
    purchase_date   DATE,
    amount_usd      NUMERIC(10, 2) NOT NULL,

    -- REI membership tier flags
    is_rei_member   BOOLEAN NOT NULL DEFAULT true,
    has_rei_visa    BOOLEAN NOT NULL DEFAULT false,

    -- Rebate amounts (your col T = amount*0.10, col U = amount*0.15)
    member_rebate_usd   NUMERIC(10, 2) GENERATED ALWAYS AS (
                            CASE WHEN is_rei_member THEN ROUND(amount_usd * 0.10, 2) ELSE 0 END
                        ) STORED,
    visa_rebate_usd     NUMERIC(10, 2) GENERATED ALWAYS AS (
                            CASE WHEN has_rei_visa THEN ROUND(amount_usd * 0.15, 2) ELSE 0 END
                        ) STORED,

    -- Which dividend year this rolls into (REI pays March following year)
    dividend_year   INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM purchase_date)::INT) STORED,

    order_number    TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rei_purchases_user    ON rei_purchases(user_id);
CREATE INDEX idx_rei_purchases_year    ON rei_purchases(dividend_year);

-- Convenience view: annual rebate totals per user
CREATE VIEW rei_rebate_summary AS
SELECT
    user_id,
    dividend_year,
    COUNT(*)                        AS purchase_count,
    SUM(amount_usd)                 AS total_spend_usd,
    SUM(member_rebate_usd)          AS member_rebate_usd,
    SUM(visa_rebate_usd)            AS visa_rebate_usd,
    SUM(member_rebate_usd + visa_rebate_usd) AS total_rebate_usd
FROM rei_purchases
GROUP BY user_id, dividend_year;

-- =============================================================================
-- TRIPS  (each trip is a named event with a gear list)
-- =============================================================================

CREATE TABLE trips (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    name                TEXT NOT NULL,
    location            TEXT,
    start_date          DATE,
    end_date            DATE,
    nights              INT GENERATED ALWAYS AS (
                            CASE WHEN start_date IS NOT NULL AND end_date IS NOT NULL
                                 THEN (end_date - start_date)
                                 ELSE NULL
                            END
                        ) STORED,

    status              trip_status NOT NULL DEFAULT 'planning',
    trip_type           trip_type NOT NULL DEFAULT 'backpacking',

    -- Weight targets
    base_weight_target_g    INT,     -- packed gear only (no worn, no food/water)
    total_weight_target_g   INT,     -- base + worn + food + water
    food_weight_target_g    INT,     -- food carry target

    -- Trip narrative
    notes               TEXT,
    route_description   TEXT,
    gpx_file_url        TEXT,        -- optional GPX track file in storage

    -- Sharing
    is_public           BOOLEAN NOT NULL DEFAULT false,
    share_slug          TEXT UNIQUE, -- /trips/<slug> for public URLs

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT valid_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX idx_trips_user   ON trips(user_id);
CREATE INDEX idx_trips_slug   ON trips(share_slug) WHERE share_slug IS NOT NULL;
CREATE INDEX idx_trips_public ON trips(is_public)  WHERE is_public = true;

-- Add the FK from gear_usage_log that references trips
ALTER TABLE gear_usage_log
    ADD CONSTRAINT fk_usage_log_trip
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL;

-- =============================================================================
-- TRIP GEAR  (junction: which items go on which trip, with per-trip overrides)
-- =============================================================================

CREATE TABLE trip_gear (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id         UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    gear_item_id    UUID NOT NULL REFERENCES gear_items(id) ON DELETE CASCADE,

    carry_type      carry_type NOT NULL DEFAULT 'packed',   -- can override item default
    is_included     BOOLEAN NOT NULL DEFAULT true,          -- toggle without removing
    quantity        INT NOT NULL DEFAULT 1,

    -- Per-trip weight override (if you repack, DIY, etc.)
    weight_override_g NUMERIC(8, 2),

    notes           TEXT,       -- trip-specific notes ("bring extra stakes for sand")
    sort_order      INT NOT NULL DEFAULT 0,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (trip_id, gear_item_id)
);

CREATE INDEX idx_trip_gear_trip ON trip_gear(trip_id);
CREATE INDEX idx_trip_gear_item ON trip_gear(gear_item_id);

-- View: effective weight per item per trip (respects overrides)
CREATE VIEW trip_gear_weights AS
SELECT
    tg.trip_id,
    tg.gear_item_id,
    gi.name,
    gi.brand,
    gc.name                                             AS category,
    tg.carry_type,
    tg.is_included,
    tg.quantity,
    COALESCE(tg.weight_override_g, gi.weight_g) * tg.quantity AS effective_weight_g,
    gi.cost_usd * tg.quantity                           AS effective_cost_usd
FROM trip_gear tg
JOIN gear_items gi ON gi.id = tg.gear_item_id
JOIN gear_categories gc ON gc.id = gi.category_id
WHERE tg.is_included = true;

-- =============================================================================
-- TRIP COMPARISON  (compare your kit across multiple trips)
-- =============================================================================

CREATE TABLE trip_comparisons (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,           -- e.g. "Sierra vs. Coast trips"
    trip_ids    UUID[] NOT NULL,         -- ordered list of trip UUIDs to compare
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- WISHLIST ITEMS  (your "potential gear" sheet)
-- Items you're researching — not yet owned.
-- =============================================================================

CREATE TABLE wishlist_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id     INT REFERENCES gear_categories(id),

    name            TEXT NOT NULL,
    brand           TEXT,
    model           TEXT,
    weight_g        NUMERIC(8, 2),
    cost_usd        NUMERIC(10, 2),
    product_url     TEXT,
    volume_liters   NUMERIC(6, 2),
    frame_type      TEXT,
    torso_size_cm   TEXT,
    watts           NUMERIC(6, 2),       -- useful for electronics (power banks, lights)

    -- Your col E "Included" — shortlist vs. full research list
    is_shortlisted  BOOLEAN NOT NULL DEFAULT false,

    -- Computed
    cost_per_gram   NUMERIC(10, 6) GENERATED ALWAYS AS (
                        CASE WHEN weight_g > 0 AND cost_usd > 0
                             THEN cost_usd / weight_g ELSE NULL END
                    ) STORED,

    notes           TEXT,

    -- When purchased, link to the gear item it became
    converted_to_gear_id UUID REFERENCES gear_items(id) ON DELETE SET NULL,
    converted_at    TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wishlist_user     ON wishlist_items(user_id);
CREATE INDEX idx_wishlist_category ON wishlist_items(category_id);

-- =============================================================================
-- CATEGORY COMPARISONS  (your "sit pads" sheet — compare items in a category)
-- A flexible tool for side-by-side comparison of any gear type.
-- =============================================================================

CREATE TABLE category_comparisons (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,                   -- e.g. "Sit Pads", "Shelters under 800g"
    category_id INT REFERENCES gear_categories(id),
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE category_comparison_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comparison_id   UUID NOT NULL REFERENCES category_comparisons(id) ON DELETE CASCADE,

    -- Can reference an owned item, a wishlist item, or be standalone
    gear_item_id    UUID REFERENCES gear_items(id) ON DELETE SET NULL,
    wishlist_item_id UUID REFERENCES wishlist_items(id) ON DELETE SET NULL,

    -- Standalone entry (your sit pads sheet: material, length, width as key cols)
    name            TEXT NOT NULL,
    brand           TEXT,
    model           TEXT,
    weight_g        NUMERIC(8, 2),
    cost_usd        NUMERIC(10, 2),
    product_url     TEXT,

    -- Dimensional metrics (from your sit pads sheet: length, width → sq/in)
    length_cm       NUMERIC(7, 2),
    width_cm        NUMERIC(7, 2),
    depth_cm        NUMERIC(7, 2),
    volume_liters   NUMERIC(6, 2),

    -- Computed (replicate your spreadsheet formulas)
    area_sq_in      NUMERIC(10, 4) GENERATED ALWAYS AS (
                        CASE WHEN length_cm IS NOT NULL AND width_cm IS NOT NULL
                             THEN (length_cm / 2.54) * (width_cm / 2.54) ELSE NULL END
                    ) STORED,
    g_per_sq_in     NUMERIC(10, 6) GENERATED ALWAYS AS (
                        CASE WHEN weight_g > 0 AND length_cm IS NOT NULL AND width_cm IS NOT NULL
                             AND (length_cm / 2.54) * (width_cm / 2.54) > 0
                             THEN weight_g / ((length_cm / 2.54) * (width_cm / 2.54)) ELSE NULL END
                    ) STORED,
    cost_per_sq_in  NUMERIC(10, 6) GENERATED ALWAYS AS (
                        CASE WHEN cost_usd > 0 AND length_cm IS NOT NULL AND width_cm IS NOT NULL
                             AND (length_cm / 2.54) * (width_cm / 2.54) > 0
                             THEN cost_usd / ((length_cm / 2.54) * (width_cm / 2.54)) ELSE NULL END
                    ) STORED,
    cost_per_gram   NUMERIC(10, 6) GENERATED ALWAYS AS (
                        CASE WHEN weight_g > 0 AND cost_usd > 0
                             THEN cost_usd / weight_g ELSE NULL END
                    ) STORED,

    -- Spec fields relevant to the comparison type
    r_value         NUMERIC(5, 2),     -- sleeping pads
    fill_power      INT,               -- down bags/quilts
    waterproof_mm   INT,               -- rain gear
    torso_size_cm   TEXT,
    frame_type      TEXT,
    material        TEXT,

    is_owned        BOOLEAN NOT NULL DEFAULT false,   -- marks "this is what I own"
    notes           TEXT,
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comparison_items ON category_comparison_items(comparison_id);

-- =============================================================================
-- FOOD PLANNING  (your "notes on food" sheet)
-- Per-trip food plan with daily targets and meal entries.
-- =============================================================================

CREATE TABLE trip_food_plans (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id                 UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Your rule: "Plan for 2lb food per day, 2500-3000 cal per day"
    target_calories_per_day INT NOT NULL DEFAULT 2750,
    target_weight_g_per_day INT NOT NULL DEFAULT 907,    -- 2lb = 907g

    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (trip_id)
);

CREATE TABLE food_plan_days (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    food_plan_id    UUID NOT NULL REFERENCES trip_food_plans(id) ON DELETE CASCADE,
    day_number      INT NOT NULL,               -- day 1, 2, 3…
    day_date        DATE,
    label           TEXT,                       -- e.g. "Trailhead to Lake", "Summit day"
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (food_plan_id, day_number)
);

CREATE TABLE food_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    food_plan_day_id UUID NOT NULL REFERENCES food_plan_days(id) ON DELETE CASCADE,
    meal_time       meal_time NOT NULL DEFAULT 'snack',

    name            TEXT NOT NULL,          -- "instant oats", "protein bar", "bagel"
    brand           TEXT,
    quantity        NUMERIC(8, 2) NOT NULL DEFAULT 1,
    unit            TEXT,                   -- "cup", "packet", "oz", "serving"
    weight_g        NUMERIC(8, 2),          -- weight per unit × quantity
    calories        INT,                    -- total calories for this item
    cost_usd        NUMERIC(8, 2),

    is_from_recipe  BOOLEAN NOT NULL DEFAULT false,
    recipe_id       UUID,                   -- FK added after recipes table below

    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_food_items_day ON food_items(food_plan_day_id);

-- View: daily nutrition/weight summary
CREATE VIEW food_plan_day_summary AS
SELECT
    fd.food_plan_id,
    fd.id           AS day_id,
    fd.day_number,
    fd.label,
    SUM(fi.weight_g)    AS total_weight_g,
    SUM(fi.calories)    AS total_calories,
    SUM(fi.cost_usd)    AS total_cost_usd,
    COUNT(fi.id)        AS item_count
FROM food_plan_days fd
LEFT JOIN food_items fi ON fi.food_plan_day_id = fd.id
GROUP BY fd.food_plan_id, fd.id, fd.day_number, fd.label;

-- =============================================================================
-- TRAIL RECIPES  (your "recipes" sheet — starting with Skurka Beans & Rice)
-- Reusable recipes that can be linked into food plans.
-- =============================================================================

CREATE TABLE recipes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = community recipe
    name            TEXT NOT NULL,
    description     TEXT,
    source          TEXT,                   -- "Andrew Skurka", "personal", etc.
    meal_time       meal_time,
    servings        INT NOT NULL DEFAULT 1,

    -- Per-serving targets (computed from ingredients below)
    prep_notes      TEXT,                   -- "Add 10-12oz boiling water", etc.
    cook_time_min   INT,
    is_no_cook      BOOLEAN NOT NULL DEFAULT false,

    is_public       BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE recipe_ingredients (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id   UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    quantity    NUMERIC(8, 2) NOT NULL,
    unit        TEXT,                   -- "oz", "cup", "tbsp", "packet"
    weight_g    NUMERIC(8, 2),         -- weight per unit
    calories    INT,
    notes       TEXT,                   -- "dried", "instant", "to taste"
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Back-fill FK from food_items → recipes
ALTER TABLE food_items
    ADD CONSTRAINT fk_food_item_recipe
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL;

CREATE INDEX idx_recipe_ingredients ON recipe_ingredients(recipe_id);

-- View: recipe totals per serving
CREATE VIEW recipe_nutrition AS
SELECT
    r.id            AS recipe_id,
    r.name,
    r.servings,
    SUM(ri.weight_g)                        AS total_weight_g,
    SUM(ri.weight_g) / NULLIF(r.servings,0) AS weight_per_serving_g,
    SUM(ri.calories)                        AS total_calories,
    SUM(ri.calories) / NULLIF(r.servings,0) AS calories_per_serving
FROM recipes r
JOIN recipe_ingredients ri ON ri.recipe_id = r.id
GROUP BY r.id, r.name, r.servings;

-- =============================================================================
-- SHARING & COMMUNITY
-- =============================================================================

-- Shared trip lists — other users can view/comment/edit depending on role
CREATE TABLE trip_shares (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id     UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    shared_by   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shared_with UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = public link
    role        share_role NOT NULL DEFAULT 'viewer',
    token       TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (trip_id, shared_with)
);

-- Community trip/list saves (like "fork" in lighterpack)
CREATE TABLE saved_trips (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_trip_id  UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    saved_trip_id   UUID REFERENCES trips(id) ON DELETE SET NULL,  -- their copy
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (user_id, source_trip_id)
);

-- Trip comments
CREATE TABLE trip_comments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id     UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trip_comments ON trip_comments(trip_id);

-- =============================================================================
-- TAGS  (flexible tagging system — trips and gear items)
-- =============================================================================

CREATE TABLE tags (
    id      SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name    TEXT NOT NULL,
    color_hex TEXT,
    UNIQUE (user_id, name)
);

CREATE TABLE gear_item_tags (
    gear_item_id UUID NOT NULL REFERENCES gear_items(id) ON DELETE CASCADE,
    tag_id       INT  NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (gear_item_id, tag_id)
);

CREATE TABLE trip_tags (
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    tag_id  INT  NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (trip_id, tag_id)
);

-- =============================================================================
-- TRIGGERS  — keep updated_at current
-- =============================================================================

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_users_updated         BEFORE UPDATE ON users          FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_gear_items_updated    BEFORE UPDATE ON gear_items     FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_trips_updated         BEFORE UPDATE ON trips          FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_wishlist_updated      BEFORE UPDATE ON wishlist_items FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_recipes_updated       BEFORE UPDATE ON recipes        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_food_plans_updated    BEFORE UPDATE ON trip_food_plans FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Sync usage_days/usage_nights on gear_items when a log entry is added
CREATE OR REPLACE FUNCTION sync_gear_usage()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE gear_items SET
        usage_days   = usage_days   + NEW.days_added,
        usage_nights = usage_nights + NEW.nights_added,
        updated_at   = now()
    WHERE id = NEW.gear_item_id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_gear_usage
AFTER INSERT ON gear_usage_log
FOR EACH ROW EXECUTE FUNCTION sync_gear_usage();

-- Archive gear item when soft-deleted
CREATE OR REPLACE FUNCTION set_archived_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.archived = true AND OLD.archived = false THEN
        NEW.archived_at = now();
    ELSIF NEW.archived = false THEN
        NEW.archived_at = NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gear_archived
BEFORE UPDATE ON gear_items
FOR EACH ROW WHEN (NEW.archived IS DISTINCT FROM OLD.archived)
EXECUTE FUNCTION set_archived_at();

-- =============================================================================
-- ROW-LEVEL SECURITY  (Supabase / PostgREST pattern)
-- Each user can only see their own data; public trips are readable by all.
-- =============================================================================

ALTER TABLE users                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE gear_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE gear_usage_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE gear_categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_gear                ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_comparisons     ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_comparison_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_food_plans          ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_plan_days           ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients       ENABLE ROW LEVEL SECURITY;
ALTER TABLE rei_purchases            ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_shares              ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_comments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags                     ENABLE ROW LEVEL SECURITY;

-- Users see their own rows; authenticated users see public trips/recipes
CREATE POLICY users_self           ON users             FOR ALL USING (id = auth.uid());
CREATE POLICY gear_owner           ON gear_items        FOR ALL USING (user_id = auth.uid());
CREATE POLICY usage_log_owner      ON gear_usage_log    FOR ALL USING (user_id = auth.uid());
CREATE POLICY categories_owner     ON gear_categories   FOR ALL USING (user_id = auth.uid() OR is_system = true);
CREATE POLICY trips_owner          ON trips             FOR ALL USING (user_id = auth.uid());
CREATE POLICY trips_public_read    ON trips             FOR SELECT USING (is_public = true);
CREATE POLICY trip_gear_owner      ON trip_gear         USING (trip_id IN (SELECT id FROM trips WHERE user_id = auth.uid()));
CREATE POLICY wishlist_owner       ON wishlist_items    FOR ALL USING (user_id = auth.uid());
CREATE POLICY comparisons_owner    ON category_comparisons FOR ALL USING (user_id = auth.uid());
CREATE POLICY food_plans_owner     ON trip_food_plans   FOR ALL USING (user_id = auth.uid());
CREATE POLICY recipes_owner        ON recipes           FOR ALL USING (user_id = auth.uid() OR is_public = true);
CREATE POLICY rei_owner            ON rei_purchases     FOR ALL USING (user_id = auth.uid());
CREATE POLICY tags_owner           ON tags              FOR ALL USING (user_id = auth.uid());

-- =============================================================================
-- SEED DATA — your Skurka Beans & Rice recipe
-- =============================================================================

-- Note: use a real user UUID in production; NULL user_id = community recipe
INSERT INTO recipes (user_id, name, source, meal_time, servings, prep_notes, cook_time_min, is_no_cook)
VALUES (NULL, 'Skurka Beans and Rice', 'Andrew Skurka', 'dinner', 1,
        'Combine all dry ingredients. Add 10–12oz boiling water, stir, cover and wait 5 min.', 5, false)
RETURNING id;

-- Ingredients (weights approximate per your spreadsheet oz values)
-- In a real seed you would capture the recipe id from the INSERT above
-- INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, weight_g, sort_order) VALUES
--   (<id>, 'Instant refried beans', 2.0,  'oz', 57,  1),
--   (<id>, 'Instant rice',          1.5,  'oz', 43,  2),
--   (<id>, 'Cheddar cheese',        1.0,  'oz', 28,  3),
--   (<id>, 'Fritos',                NULL, NULL, NULL,4),
--   (<id>, 'Taco seasoning',        0.2,  'oz', 6,   5),
--   (<id>, 'Salt',                  NULL, 'to taste', NULL, 6),
--   (<id>, 'Black pepper',          NULL, 'to taste', NULL, 7),
--   (<id>, 'Red pepper flakes',     NULL, 'to taste', NULL, 8),
--   (<id>, 'Water',                 NULL, '10-12oz boiling', NULL, 9);
