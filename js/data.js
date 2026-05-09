// ============================================================
// Gearnomic — Seed Data
// Imported from Camping_Gear_comparisons.xlsx
// ============================================================

const SEED_DATA = {
  items: [
    // ── Pack ──────────────────────────────────────────
    { id: 'i001', name: 'Kakwa 40', brand: 'Durston', model: 'Kakwa 40', category: 'Pack', weight_g: 850, cost_usd: 150, condition: 'good', volume_liters: 40, usage_days: 0, usage_nights: 0, notes: 'Current main pack.', product_url: null },
    { id: 'i002', name: 'Pack Liner', brand: 'Nylofume', model: '', category: 'Pack', weight_g: 25.5, cost_usd: 2.4, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: 'https://www.garagegrowngear.com/products/nylofume-pack-liner-bags' },
    { id: 'i003', name: 'Sit Pad', brand: 'Amazon', model: '', category: 'Pack', weight_g: 50, cost_usd: 10, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: 'https://www.rei.com/product/242039' },

    // ── Shelter ────────────────────────────────────────
    { id: 'i004', name: 'X-Dome 1+', brand: 'Durston', model: 'X-Dome 1+', category: 'Shelter', weight_g: 700, cost_usd: 407, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: 'Main shelter, pitches with trekking poles.', product_url: null },
    { id: 'i005', name: 'Tent Bag', brand: '', model: '', category: 'Shelter', weight_g: 18, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i006', name: 'Stakes (x8)', brand: '', model: '', category: 'Shelter', weight_g: 93, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i007', name: 'Stakes Bag', brand: '', model: '', category: 'Shelter', weight_g: 2, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i008', name: 'Trekking Poles', brand: '', model: '', category: 'Shelter', weight_g: 283, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: 'Used to pitch X-Dome. Also carried while hiking.', product_url: null },
    { id: 'i009', name: 'Polycryo Footprint', brand: 'Mountain Laurel', model: 'polycryo', category: 'Shelter', weight_g: 68, cost_usd: 10, condition: 'excellent', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: 'https://www.garagegrowngear.com' },

    // ── Sleep ──────────────────────────────────────────
    { id: 'i010', name: "Cat's Meow Sleeping Bag", brand: 'North Face', model: "Cat's Meow", category: 'Sleep', weight_g: 1071, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i011', name: 'Ultra 6.5R Sleeping Pad', brand: 'Exped', model: 'Ultra 6.5R', category: 'Sleep', weight_g: 575, cost_usd: 150, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: 'R-value 6.5', product_url: 'https://www.rei.com' },
    { id: 'i012', name: 'Pad Inflator', brand: 'Exped', model: '', category: 'Sleep', weight_g: 82, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i013', name: 'Pad Stuff Sack', brand: 'Exped', model: '', category: 'Sleep', weight_g: 17, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i014', name: 'Pillow', brand: 'Breezcamp', model: '', category: 'Sleep', weight_g: 100, cost_usd: 10, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },

    // ── Worn Clothing ──────────────────────────────────
    { id: 'i015', name: 'Light Hiker Micro Socks', brand: 'Darn Tough', model: 'Light Hiker Micro', category: 'Worn Clothing', weight_g: 60, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: 'https://www.rei.com' },
    { id: 'i016', name: 'Lone Peak Trail Runners', brand: 'Altra', model: 'Lone Peak', category: 'Worn Clothing', weight_g: 600, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: 'https://www.rei.com' },
    { id: 'i017', name: 'Sun Shirt', brand: 'UA', model: '', category: 'Worn Clothing', weight_g: 234, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i018', name: 'Running Shorts', brand: '', model: '', category: 'Worn Clothing', weight_g: 238, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i019', name: 'Run Hat', brand: 'Ciele', model: '', category: 'Worn Clothing', weight_g: 64, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i020', name: 'Frogskins Sunglasses', brand: 'Oakley', model: 'Frogskins', category: 'Worn Clothing', weight_g: 27, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i021', name: 'Asta Gear Trekking Poles', brand: 'Asta Gear', model: 'Carbon/Alum', category: 'Worn Clothing', weight_g: 325, cost_usd: 65, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },

    // ── Packed Clothing ────────────────────────────────
    { id: 'i022', name: 'Cairn Evo Sandals', brand: 'Bedrock', model: 'Cairn Evo', category: 'Packed Clothing', weight_g: 543, cost_usd: 68, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: 'https://www.rei.com' },
    { id: 'i023', name: 'Phantom Mountain Rain Jacket', brand: 'Rab', model: 'Phantom Mountain', category: 'Packed Clothing', weight_g: 229, cost_usd: 61, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: 'https://www.rei.com' },
    { id: 'i024', name: 'R1 Techface Fleece', brand: 'Patagonia', model: 'Techface R1', category: 'Packed Clothing', weight_g: 409, cost_usd: 153, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i025', name: 'Nano Puff Jacket', brand: 'Patagonia', model: 'Nano Puff', category: 'Packed Clothing', weight_g: 380, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },

    // ── Cooking and Water ──────────────────────────────
    { id: 'i026', name: 'Backpacking Stove', brand: 'CampingMoon', model: '', category: 'Cooking and Water', weight_g: 98, cost_usd: 35, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i027', name: '750ml Titanium Pot', brand: 'Toaks', model: '750ml', category: 'Cooking and Water', weight_g: 108, cost_usd: 26.95, condition: 'good', volume_liters: .75, usage_days: 0, usage_nights: 0, notes: '', product_url: 'https://www.rei.com' },
    { id: 'i028', name: 'Windscreen (DIY)', brand: 'DIY', model: '', category: 'Cooking and Water', weight_g: 4, cost_usd: 7, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i029', name: 'Long Spoon', brand: 'Aliexpress', model: '', category: 'Cooking and Water', weight_g: 17, cost_usd: 7.36, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i030', name: 'Bear Vault BV500', brand: 'Bear Vault', model: 'BV500', category: 'Cooking and Water', weight_g: 1133, cost_usd: 100, condition: 'good', volume_liters: 11.5, usage_days: 0, usage_nights: 0, notes: 'Required in some areas.', product_url: 'https://www.rei.com' },
    { id: 'i031', name: 'Sawyer Squeeze + Cnoc', brand: 'Sawyer', model: 'Squeeze', category: 'Cooking and Water', weight_g: 171, cost_usd: 65, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: 'https://www.rei.com' },
    { id: 'i032', name: '1L Smart Water Bottle', brand: 'Smart Water', model: '1L', category: 'Cooking and Water', weight_g: 41, cost_usd: 0, condition: 'good', volume_liters: 1, usage_days: 0, usage_nights: 0, notes: '', product_url: null },

    // ── Health and Safety ──────────────────────────────
    { id: 'i033', name: 'Ditty Bag (3L)', brand: 'Swan Song', model: '3L', category: 'Health and Safety', weight_g: 31, cost_usd: 0, condition: 'good', volume_liters: 3, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i034', name: 'Hand Sanitizer', brand: '', model: '', category: 'Health and Safety', weight_g: 37, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i035', name: 'Soap', brand: '', model: '', category: 'Health and Safety', weight_g: 49, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i036', name: 'Sunscreen', brand: '', model: '', category: 'Health and Safety', weight_g: 113, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i037', name: 'Chapstick', brand: '', model: '', category: 'Health and Safety', weight_g: 10, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i038', name: 'Bamboo Toothbrush', brand: 'Bamboo', model: '', category: 'Health and Safety', weight_g: 6, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i039', name: 'Toothpaste', brand: '', model: '', category: 'Health and Safety', weight_g: 33, cost_usd: 3, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i040', name: 'First Aid / Repair Kit', brand: '', model: '', category: 'Health and Safety', weight_g: 50, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i041', name: 'BIC Mini Lighter', brand: 'BIC', model: 'Mini', category: 'Health and Safety', weight_g: 11, cost_usd: 2, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i042', name: 'Bugout Knife', brand: 'Benchmade', model: 'Bugout', category: 'Health and Safety', weight_g: 41, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i043', name: 'Trowel', brand: 'Aliexpress', model: '', category: 'Health and Safety', weight_g: 38, cost_usd: 8.37, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },

    // ── Electronics and Misc ───────────────────────────
    { id: 'i044', name: 'Ditty Bag', brand: '', model: '', category: 'Electronics and Misc', weight_g: 35, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i045', name: 'NU25 Headlamp', brand: 'Nitecore', model: 'NU25', category: 'Electronics and Misc', weight_g: 45, cost_usd: 37, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: 'https://www.rei.com' },
    { id: 'i046', name: 'Pixel 10 Pro XL', brand: 'Google', model: 'Pixel 10 Pro XL', category: 'Electronics and Misc', weight_g: 242, cost_usd: 0, condition: 'excellent', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i047', name: 'Phone Case', brand: 'Spigen', model: '', category: 'Electronics and Misc', weight_g: 42, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i048', name: 'Earbuds', brand: '', model: '', category: 'Electronics and Misc', weight_g: 60, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i049', name: 'Cables', brand: '', model: '', category: 'Electronics and Misc', weight_g: 13, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i050', name: 'Power Bank (Anker)', brand: 'Anker', model: 'Steam Deck charger', category: 'Electronics and Misc', weight_g: 463, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: 'Heavy — see wishlist for alternatives.', product_url: null },

    // ── Camera Gear ────────────────────────────────────
    { id: 'i051', name: 'Ricoh R1', brand: 'Ricoh', model: 'R1', category: 'Camera Gear', weight_g: 182, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i052', name: 'Fujifilm X-E3', brand: 'Fujifilm', model: 'X-E3', category: 'Camera Gear', weight_g: 0, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: 'Weight TBD', product_url: null },
    { id: 'i053', name: 'Spare Battery', brand: '', model: '', category: 'Camera Gear', weight_g: 46, cost_usd: 0, condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
  ],

  trips: [
    {
      id: 't001',
      name: 'Pt. Reyes',
      location: 'Point Reyes National Seashore, CA',
      start_date: '2024-03-15',
      end_date: '2024-03-17',
      status: 'completed',
      trip_type: 'backpacking',
      weight_target_g: 12000,
      notes: 'Coast camp to Sky camp. Your first sheet in the spreadsheet.',
      gear_ids: ['i001','i002','i003','i004','i005','i006','i007','i008','i010','i011','i012','i013','i014','i015','i016','i017','i018','i019','i020','i021','i022','i023','i024','i025','i026','i027','i028','i029','i031','i032','i033','i034','i035','i036','i037','i038','i039','i040','i041','i042','i044','i045','i046','i047','i048','i049','i050'],
      gear_overrides: {},
      carry_types: { 'i008':'worn','i015':'worn','i016':'worn','i017':'worn','i018':'worn','i019':'worn','i020':'worn','i021':'worn','i046':'worn','i047':'worn' }
    },
    {
      id: 't002',
      name: 'Lost Coast',
      location: 'Humboldt, CA',
      start_date: '2025-04-12',
      end_date: '2025-04-15',
      status: 'planning',
      trip_type: 'backpacking',
      weight_target_g: 11000,
      notes: 'S→N. Tidal window required. Lighter kit — leaving behind power bank and bear can.',
      gear_ids: ['i001','i003','i004','i005','i006','i007','i008','i010','i011','i012','i013','i014','i015','i016','i017','i018','i019','i020','i021','i022','i023','i024','i025','i026','i027','i028','i029','i031','i032','i033','i034','i035','i036','i037','i038','i039','i040','i041','i042','i044','i045','i046','i047','i049','i051'],
      gear_overrides: {},
      carry_types: { 'i008':'worn','i015':'worn','i016':'worn','i017':'worn','i018':'worn','i019':'worn','i020':'worn','i021':'worn','i046':'worn','i047':'worn' }
    }
  ],

  wishlist: [
    { id: 'w001', name: 'Pack', brand: 'Hyperlite', model: 'Southwest 40', weight_g: 385, cost_usd: 395, volume_liters: 40, frame_type: 'internal aluminum', notes: '465g lighter than Kakwa 40', product_url: 'https://www.rei.com' },
    { id: 'w002', name: 'Pack', brand: "Pa'lante", model: 'Desert Ultraweave 43', weight_g: 545, cost_usd: 300, volume_liters: 43, frame_type: null, notes: '', product_url: 'https://palantepacks.com/products/desert-pack' },
    { id: 'w003', name: 'Pack', brand: "Pa'lante", model: 'V2 37', weight_g: 530, cost_usd: 300, volume_liters: 40, frame_type: null, notes: '', product_url: 'https://palantepacks.com/products/v2' },
    { id: 'w004', name: 'Pack', brand: 'Gossamer', model: 'Skala 38', weight_g: 578, cost_usd: 225, volume_liters: 38, frame_type: null, notes: '', product_url: null },
    { id: 'w005', name: 'Pack', brand: 'Durston', model: 'Kakwa 55', weight_g: 850, cost_usd: 199, volume_liters: 55, frame_type: null, notes: 'Larger for longer trips', product_url: null },
    { id: 'w006', name: 'Pillow', brand: 'Therm-a-Rest', model: 'Air Head Lite', weight_g: 59, cost_usd: 44, volume_liters: null, frame_type: null, notes: '', product_url: null },
    { id: 'w007', name: 'Pillow', brand: 'Nemo', model: 'Fillo Elite', weight_g: 80, cost_usd: 60, volume_liters: null, frame_type: null, notes: '', product_url: null },
    { id: 'w008', name: 'Pillow', brand: 'Klymit', model: 'X Large', weight_g: 91, cost_usd: 20, volume_liters: null, frame_type: null, notes: '', product_url: null },
    { id: 'w009', name: 'Pillow', brand: 'Outdoor Vitals', model: 'Ultralight', weight_g: 74, cost_usd: 20, volume_liters: null, frame_type: null, notes: '', product_url: null },
    { id: 'w010', name: 'Power bank', brand: 'Nitecore', model: 'NB10000 Gen 4', weight_g: 143, cost_usd: 84, volume_liters: null, frame_type: null, notes: '320g lighter than current Anker', product_url: null },
    { id: 'w011', name: 'Power bank', brand: 'Flextail', model: '10k 22w', weight_g: 145, cost_usd: 49.5, volume_liters: null, frame_type: null, notes: '', product_url: null },
    { id: 'w012', name: 'Power bank', brand: 'Iniu', model: '10k Slim 45w', weight_g: 182, cost_usd: 21, volume_liters: null, frame_type: null, notes: '', product_url: null },
    { id: 'w013', name: 'Power bank', brand: 'Anker', model: 'Nano 10k', weight_g: 215, cost_usd: 50, volume_liters: null, frame_type: null, notes: '', product_url: null },
    { id: 'w014', name: 'Alpha hoodie', brand: 'BTT Gear Co', model: '', weight_g: 285, cost_usd: 109, volume_liters: null, frame_type: null, notes: '', product_url: null },
    { id: 'w015', name: 'Alpha hoodie', brand: 'Lightheart', model: '', weight_g: 143, cost_usd: 130, volume_liters: null, frame_type: null, notes: 'Very light option', product_url: null },
    { id: 'w016', name: 'Sun Shirt', brand: 'REI', model: 'Sahara', weight_g: 250, cost_usd: 60, volume_liters: null, frame_type: null, notes: '', product_url: 'https://www.rei.com' },
    { id: 'w017', name: 'Tent', brand: 'Durston', model: 'Xmid 2', weight_g: 880, cost_usd: 319, volume_liters: null, frame_type: null, notes: 'For 2-person trips', product_url: null },
  ],

  trip_types: [
    { value: 'backpacking', label: 'Backpacking',  system: true },
    { value: 'bikepacking', label: 'Bikepacking',  system: true },
    { value: 'car_camping', label: 'Car camping',  system: true },
    { value: 'day_hike',    label: 'Day hike',     system: true },
    { value: 'thru_hike',   label: 'Thru-hike',    system: true },
    { value: 'other',       label: 'Other',         system: true },
  ],

  food_plans: [],   // user creates these; start empty

  recipes: [
    {
      id: 'rec001',
      name: 'Skurka Beans & Rice',
      meal_time: 'dinner',
      servings: 1,
      cal_per_serving: 680,
      weight_g_per_serving: 145,
      source: 'Andrew Skurka',
      prep_notes: 'Add 10–12oz boiling water, stir well, cover 5 min. Crumble Fritos on top.',
      ingredients: [
        { name: 'Instant refried beans', qty: '2',    unit: 'oz',  weight_g: 57, cal: 200 },
        { name: 'Instant white rice',    qty: '1.5',  unit: 'oz',  weight_g: 43, cal: 160 },
        { name: 'Cheddar cheese',        qty: '1',    unit: 'oz',  weight_g: 28, cal: 110 },
        { name: 'Fritos corn chips',     qty: '0.5',  unit: 'oz',  weight_g: 14, cal: 80  },
        { name: 'Taco seasoning',        qty: '1',    unit: 'tsp', weight_g: 3,  cal: 10  },
      ]
    },
    {
      id: 'rec002',
      name: 'Instant Oats with Add-ins',
      meal_time: 'breakfast',
      servings: 1,
      cal_per_serving: 590,
      weight_g_per_serving: 125,
      source: '',
      prep_notes: 'Combine oats, protein powder and dried fruit in bag at home. Add 1.5C boiling water, stir, wait 3 min.',
      ingredients: [
        { name: 'Instant rolled oats',  qty: '¾', unit: 'cup',  weight_g: 60, cal: 230 },
        { name: 'Protein powder',       qty: '1',  unit: 'scoop', weight_g: 30, cal: 120 },
        { name: 'Dried fruit/raisins',  qty: '2',  unit: 'tbsp', weight_g: 20, cal: 60  },
        { name: 'Nut butter packet',    qty: '1',  unit: 'pkg',  weight_g: 32, cal: 190 },
      ]
    },
    {
      id: 'rec003',
      name: 'Ramen Bomb',
      meal_time: 'dinner',
      servings: 1,
      cal_per_serving: 780,
      weight_g_per_serving: 165,
      source: '',
      prep_notes: 'Boil 2C water, add ramen + packet. Stir in mashed potato powder. Top with olive oil and bacon bits.',
      ingredients: [
        { name: 'Ramen noodle pack',       qty: '1', unit: 'pkg',  weight_g: 85, cal: 380 },
        { name: 'Instant mashed potatoes', qty: '2', unit: 'tbsp', weight_g: 20, cal: 80  },
        { name: 'Olive oil',               qty: '1', unit: 'tbsp', weight_g: 14, cal: 120 },
        { name: 'Bacon bits',              qty: '2', unit: 'tbsp', weight_g: 14, cal: 70  },
        { name: 'Parmesan (packet)',        qty: '1', unit: 'tbsp', weight_g: 7,  cal: 30  },
      ]
    },
    {
      id: 'rec004',
      name: 'Trail Mix (custom)',
      meal_time: 'snack',
      servings: 1,
      cal_per_serving: 520,
      weight_g_per_serving: 115,
      source: '',
      prep_notes: 'Mix at home and split into daily bags. Hits 4.5 cal/gram.',
      ingredients: [
        { name: 'Mixed nuts',           qty: '1',   unit: 'oz',   weight_g: 28, cal: 180 },
        { name: 'Dark chocolate chips', qty: '1',   unit: 'oz',   weight_g: 28, cal: 170 },
        { name: 'Dried cranberries',    qty: '2',   unit: 'tbsp', weight_g: 20, cal: 60  },
        { name: 'Sunflower seeds',      qty: '1',   unit: 'tbsp', weight_g: 14, cal: 80  },
        { name: 'Pretzels',             qty: '0.5', unit: 'oz',   weight_g: 14, cal: 55  },
      ]
    },
    {
      id: 'rec005',
      name: 'Tortilla Wrap Lunch',
      meal_time: 'lunch',
      servings: 1,
      cal_per_serving: 650,
      weight_g_per_serving: 150,
      source: '',
      prep_notes: 'No cook. Spread tortilla with nut butter, layer toppings, roll and eat.',
      ingredients: [
        { name: 'Flour tortilla (10")', qty: '1',    unit: '',    weight_g: 50, cal: 190 },
        { name: 'Almond butter packet', qty: '1',    unit: 'pkg', weight_g: 32, cal: 190 },
        { name: 'Honey packet',         qty: '1',    unit: '',    weight_g: 21, cal: 60  },
        { name: 'Summer sausage',       qty: '1',    unit: 'oz',  weight_g: 28, cal: 110 },
        { name: 'Hard cheese',          qty: '0.75', unit: 'oz',  weight_g: 21, cal: 85  },
      ]
    },
  ],

  categories: [
    { name: 'Pack',                 target_g: 900,  color: '#2A7048' },
    { name: 'Shelter',              target_g: 1200, color: '#1A5C8A' },
    { name: 'Sleep',                target_g: 1800, color: '#6B4E9E' },
    { name: 'Worn Clothing',        target_g: 1600, color: '#B87B0A' },
    { name: 'Packed Clothing',      target_g: 1200, color: '#C47B2A' },
    { name: 'Cooking and Water',    target_g: 700,  color: '#5A8A2A' },
    { name: 'Health and Safety',    target_g: 350,  color: '#8A4A2A' },
    { name: 'Electronics and Misc', target_g: 600,  color: '#2A5A8A' },
    { name: 'Camera Gear',          target_g: 500,  color: '#8A2A6A' },
    { name: 'Fishing',              target_g: 200,  color: '#2A6A6A' },
    { name: 'Navigation',           target_g: 150,  color: '#4A6A2A' },
    { name: 'Food and Water',       target_g: null, color: '#6A4A2A' },
  ],

  templates: [
    {
      id: 'tmpl001',
      name: '3-Season Ultralight Base',
      description: 'Core kit for 2–4 night trips in good weather. No bear can, no camera. Lean and fast.',
      trip_type: 'backpacking',
      created_from: null,
      created_at: '2024-06-01',
      carry_types: { 'i008':'worn','i015':'worn','i016':'worn','i017':'worn','i018':'worn','i019':'worn','i020':'worn','i021':'worn','i046':'worn','i047':'worn' },
      gear_ids: [
        'i001','i002','i003',
        'i004','i005','i006','i007','i008',
        'i010','i011','i012','i013','i014',
        'i015','i016','i017','i018','i019','i020','i021',
        'i022','i023','i024','i025',
        'i026','i027','i028','i029','i031','i032',
        'i033','i034','i035','i036','i037','i038','i039','i040','i041','i042',
        'i044','i045','i046','i047','i049',
      ]
    },
    {
      id: 'tmpl002',
      name: 'Full Kit — Camera + Power',
      description: 'Everything including camera gear and power bank. Good for longer trips or when shooting.',
      trip_type: 'backpacking',
      created_from: null,
      created_at: '2024-06-01',
      carry_types: { 'i008':'worn','i015':'worn','i016':'worn','i017':'worn','i018':'worn','i019':'worn','i020':'worn','i021':'worn','i046':'worn','i047':'worn' },
      gear_ids: [
        'i001','i002','i003',
        'i004','i005','i006','i007','i008',
        'i010','i011','i012','i013','i014',
        'i015','i016','i017','i018','i019','i020','i021',
        'i022','i023','i024','i025',
        'i026','i027','i028','i029','i031','i032',
        'i033','i034','i035','i036','i037','i038','i039','i040','i041','i042',
        'i044','i045','i046','i047','i048','i049','i050',
        'i051','i053',
      ]
    },
    {
      id: 'tmpl003',
      name: 'Coastal / Beach Trip',
      description: 'Pt. Reyes style. Sandals, rain layer, no need for bear can on coast.',
      trip_type: 'backpacking',
      created_from: 't001',
      created_at: '2024-09-15',
      carry_types: { 'i008':'worn','i015':'worn','i016':'worn','i017':'worn','i018':'worn','i019':'worn','i020':'worn','i021':'worn','i046':'worn','i047':'worn' },
      gear_ids: [
        'i001','i002','i003',
        'i004','i005','i006','i007','i008',
        'i010','i011','i012','i013','i014',
        'i015','i016','i017','i018','i019','i020','i021',
        'i022','i023','i024','i025',
        'i026','i027','i028','i029','i031','i032',
        'i033','i034','i035','i036','i037','i038','i039','i040','i041','i042',
        'i044','i045','i046','i047','i048','i049','i050',
      ]
    }
  ]
};

// ============================================================
// Demo data shown to new users on first visit.
// Generic labels only — no personal brands or models.
// ============================================================
const DEMO_DATA = {
  items: [
    // Pack
    { id: 'd001', name: 'Ultralight Backpack', brand: '', category: 'Pack', weight_g: 680, cost_usd: 220, condition: 'good', notes: 'Your main carry — replace this with your actual pack.', usage_days:0, usage_nights:0 },
    { id: 'd002', name: 'Pack Rain Cover', brand: '', category: 'Pack', weight_g: 85, cost_usd: 15, condition: 'good', notes: '', usage_days:0, usage_nights:0 },
    { id: 'd003', name: 'Hip Belt Pockets (pair)', brand: '', category: 'Pack', weight_g: 60, cost_usd: 18, condition: 'good', notes: '', usage_days:0, usage_nights:0 },

    // Shelter
    { id: 'd004', name: 'Solo Backpacking Tent', brand: '', category: 'Shelter', weight_g: 900, cost_usd: 350, condition: 'good', notes: '1-person, 3-season.', usage_days:0, usage_nights:0 },
    { id: 'd005', name: 'Tent Stakes (x8)', brand: '', category: 'Shelter', weight_g: 72, cost_usd: 12, condition: 'good', notes: 'Titanium shepherd hook style.', usage_days:0, usage_nights:0 },
    { id: 'd006', name: 'Ground Cloth', brand: '', category: 'Shelter', weight_g: 60, cost_usd: 10, condition: 'good', notes: 'Cut to footprint size.', usage_days:0, usage_nights:0 },

    // Sleep
    { id: 'd007', name: 'Sleeping Bag (20°F)', brand: '', category: 'Sleep', weight_g: 900, cost_usd: 300, condition: 'good', notes: '20°F / -7°C synthetic fill.', usage_days:0, usage_nights:0 },
    { id: 'd008', name: 'Sleeping Pad (R-4)', brand: '', category: 'Sleep', weight_g: 430, cost_usd: 180, condition: 'good', notes: 'Insulated air pad, R-value 4.', usage_days:0, usage_nights:0 },
    { id: 'd009', name: 'Inflatable Pillow', brand: '', category: 'Sleep', weight_g: 75, cost_usd: 25, condition: 'good', notes: '', usage_days:0, usage_nights:0 },

    // Worn Clothing
    { id: 'd010', name: 'Trail Running Shoes', brand: '', category: 'Worn Clothing', weight_g: 580, cost_usd: 150, condition: 'good', notes: 'Waterproof or regular — your call.', usage_days:0, usage_nights:0 },
    { id: 'd011', name: 'Hiking Shirt (sun protection)', brand: '', category: 'Worn Clothing', weight_g: 180, cost_usd: 55, condition: 'good', notes: 'UPF 50+.', usage_days:0, usage_nights:0 },
    { id: 'd012', name: 'Hiking Shorts / Pants', brand: '', category: 'Worn Clothing', weight_g: 220, cost_usd: 70, condition: 'good', notes: '', usage_days:0, usage_nights:0 },

    // Packed Clothing
    { id: 'd013', name: 'Puffy Jacket (insulation layer)', brand: '', category: 'Packed Clothing', weight_g: 320, cost_usd: 180, condition: 'good', notes: 'Down or synthetic — for camp and cold snaps.', usage_days:0, usage_nights:0 },
    { id: 'd014', name: 'Rain Jacket', brand: '', category: 'Packed Clothing', weight_g: 280, cost_usd: 150, condition: 'good', notes: 'Hardshell or light softshell.', usage_days:0, usage_nights:0 },
    { id: 'd015', name: 'Camp Shoes / Sandals', brand: '', category: 'Packed Clothing', weight_g: 240, cost_usd: 60, condition: 'good', notes: 'For stream crossings and camp.', usage_days:0, usage_nights:0 },

    // Cooking and Water
    { id: 'd016', name: 'Canister Stove + Fuel', brand: '', category: 'Cooking and Water', weight_g: 220, cost_usd: 50, condition: 'good', notes: '100g fuel canister included.', usage_days:0, usage_nights:0 },
    { id: 'd017', name: 'Titanium Pot (700ml)', brand: '', category: 'Cooking and Water', weight_g: 110, cost_usd: 35, condition: 'good', notes: '', usage_days:0, usage_nights:0 },
    { id: 'd018', name: 'Water Filter', brand: '', category: 'Cooking and Water', weight_g: 90, cost_usd: 40, condition: 'good', notes: 'Squeeze-style or inline.', usage_days:0, usage_nights:0 },

    // Health and Safety
    { id: 'd019', name: 'First Aid Kit', brand: '', category: 'Health and Safety', weight_g: 80, cost_usd: 25, condition: 'good', notes: 'Customized — blister care, antiseptic, SAM splint.', usage_days:0, usage_nights:0 },
    { id: 'd020', name: 'Headlamp + spare batteries', brand: '', category: 'Health and Safety', weight_g: 90, cost_usd: 35, condition: 'good', notes: '300+ lumen.', usage_days:0, usage_nights:0 },
    { id: 'd021', name: 'Navigation (map + compass)', brand: '', category: 'Health and Safety', weight_g: 60, cost_usd: 20, condition: 'good', notes: 'Printed topo + baseplate compass. Never rely only on a phone.', usage_days:0, usage_nights:0 },

    // Electronics and Misc
    { id: 'd022', name: 'Smartphone', brand: '', category: 'Electronics and Misc', weight_g: 220, cost_usd: 0, condition: 'good', notes: 'GPS, camera, emergency contact. Download offline maps.', usage_days:0, usage_nights:0 },
    { id: 'd023', name: 'Portable Battery (10,000 mAh)', brand: '', category: 'Electronics and Misc', weight_g: 200, cost_usd: 45, condition: 'good', notes: '', usage_days:0, usage_nights:0 },
    { id: 'd024', name: 'Trowel + waste kit', brand: '', category: 'Electronics and Misc', weight_g: 45, cost_usd: 15, condition: 'good', notes: 'Leave No Trace essentials.', usage_days:0, usage_nights:0 },
  ],

  trip: {
    id: 'tdemo',
    name: 'My First Backpacking Trip',
    location: 'Local Trailhead',
    start_date: (() => {
      const d = new Date(); d.setDate(d.getDate() + 30);
      return d.toISOString().slice(0,10);
    })(),
    end_date: (() => {
      const d = new Date(); d.setDate(d.getDate() + 32);
      return d.toISOString().slice(0,10);
    })(),
    status: 'planning',
    trip_type: 'backpacking',
    weight_target_g: 10000,
    miles: 18,
    notes: 'This is a demo trip — edit it or delete it and create your own!',
    loadout_ids: ['tmpl_demo'],
    meal_plan_id: null,
  },

  template: {
    id: 'tmpl_demo',
    name: 'Weekend Backpacking Base Kit',
    description: 'A solid starting-point loadout for a 2–3 night 3-season trip. Edit item names and weights to match your own gear.',
    trip_type: 'backpacking',
    created_from: null,
    created_at: new Date().toISOString().slice(0,10),
    carry_types: { 'd010':'worn','d011':'worn','d012':'worn' },
    gear_ids: ['d001','d002','d004','d005','d007','d008','d009','d010','d011','d012','d013','d014','d016','d017','d018','d019','d020','d021','d022'],
  },
};

// Demo meal plan pre-populated with starter recipes so free users
// can see the full functionality without needing to build it themselves.
const DEMO_FOOD_PLAN = {
  id:                    'fp_demo',
  name:                  'Sample 3-Day Backpacking Plan',
  trip_id:               null,
  days:                  3,
  cal_target_per_day:    3000,
  weight_target_g_per_day: 800,
  meal_splits:           { breakfast: 22, snack: 17, lunch: 25, dinner: 36 },
  day_config:            {},
  meals: [
    // Day 1
    { id: 'dm001', day: 1, meal_time: 'breakfast', name: 'Instant Oats with Add-ins', cal: 590, weight_g: 125, notes: '', recipe_id: 'rec002' },
    { id: 'dm002', day: 1, meal_time: 'snack',     name: 'Trail Mix (custom)',        cal: 520, weight_g: 115, notes: '', recipe_id: 'rec004' },
    { id: 'dm003', day: 1, meal_time: 'lunch',     name: 'Tortilla Wrap Lunch',       cal: 650, weight_g: 150, notes: '', recipe_id: 'rec005' },
    { id: 'dm004', day: 1, meal_time: 'dinner',    name: 'Skurka Beans & Rice',       cal: 680, weight_g: 145, notes: '', recipe_id: 'rec001' },
    // Day 2
    { id: 'dm005', day: 2, meal_time: 'breakfast', name: 'Instant Oats with Add-ins', cal: 590, weight_g: 125, notes: '', recipe_id: 'rec002' },
    { id: 'dm006', day: 2, meal_time: 'snack',     name: 'Trail Mix (custom)',        cal: 520, weight_g: 115, notes: '', recipe_id: 'rec004' },
    { id: 'dm007', day: 2, meal_time: 'lunch',     name: 'Tortilla Wrap Lunch',       cal: 650, weight_g: 150, notes: '', recipe_id: 'rec005' },
    { id: 'dm008', day: 2, meal_time: 'dinner',    name: 'Ramen Bomb',                cal: 780, weight_g: 165, notes: '', recipe_id: 'rec003' },
    // Day 3 (last day — no dinner by default)
    { id: 'dm009', day: 3, meal_time: 'breakfast', name: 'Instant Oats with Add-ins', cal: 590, weight_g: 125, notes: '', recipe_id: 'rec002' },
    { id: 'dm010', day: 3, meal_time: 'snack',     name: 'Trail Mix (custom)',        cal: 520, weight_g: 115, notes: '', recipe_id: 'rec004' },
    { id: 'dm011', day: 3, meal_time: 'lunch',     name: 'Tortilla Wrap Lunch',       cal: 650, weight_g: 150, notes: '', recipe_id: 'rec005' },
    { id: 'dm012', day: 3, meal_time: 'dinner',    name: 'Skurka Beans & Rice',       cal: 680, weight_g: 145, notes: '', recipe_id: 'rec001' },
  ],
};
