// ============================================================
// Gearnomic — Seed Data
// Imported from Camping_Gear_comparisons.xlsx
// ============================================================

const SEED_DATA = {
  items: [
    // ── Pack ──────────────────────────────────────────
    { id: 'i001', name: 'Kakwa 40', brand: 'Durston', model: 'Kakwa 40', category: 'Pack', weight_g: 850, cost_usd: 150, carry_type: 'packed', condition: 'good', volume_liters: 40, usage_days: 0, usage_nights: 0, notes: 'Current main pack.', product_url: null },
    { id: 'i002', name: 'Pack Liner', brand: 'Nylofume', model: '', category: 'Pack', weight_g: 25.5, cost_usd: 2.4, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: 'https://www.garagegrowngear.com/products/nylofume-pack-liner-bags' },
    { id: 'i003', name: 'Sit Pad', brand: 'Amazon', model: '', category: 'Pack', weight_g: 50, cost_usd: 10, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: 'https://www.rei.com/product/242039' },

    // ── Shelter ────────────────────────────────────────
    { id: 'i004', name: 'X-Dome 1+', brand: 'Durston', model: 'X-Dome 1+', category: 'Shelter', weight_g: 700, cost_usd: 407, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: 'Main shelter, pitches with trekking poles.', product_url: null },
    { id: 'i005', name: 'Tent Bag', brand: '', model: '', category: 'Shelter', weight_g: 18, cost_usd: 0, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i006', name: 'Stakes (x8)', brand: '', model: '', category: 'Shelter', weight_g: 93, cost_usd: 0, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i007', name: 'Stakes Bag', brand: '', model: '', category: 'Shelter', weight_g: 2, cost_usd: 0, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i008', name: 'Trekking Poles', brand: '', model: '', category: 'Shelter', weight_g: 283, cost_usd: 0, carry_type: 'worn', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: 'Used to pitch X-Dome. Also carried while hiking.', product_url: null },
    { id: 'i009', name: 'Polycryo Footprint', brand: 'Mountain Laurel', model: 'polycryo', category: 'Shelter', weight_g: 68, cost_usd: 10, carry_type: 'not_carried', condition: 'excellent', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: 'https://www.garagegrowngear.com' },

    // ── Sleep ──────────────────────────────────────────
    { id: 'i010', name: "Cat's Meow Sleeping Bag", brand: 'North Face', model: "Cat's Meow", category: 'Sleep', weight_g: 1071, cost_usd: 0, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i011', name: 'Ultra 6.5R Sleeping Pad', brand: 'Exped', model: 'Ultra 6.5R', category: 'Sleep', weight_g: 575, cost_usd: 150, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: 'R-value 6.5', product_url: 'https://www.rei.com' },
    { id: 'i012', name: 'Pad Inflator', brand: 'Exped', model: '', category: 'Sleep', weight_g: 82, cost_usd: 0, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i013', name: 'Pad Stuff Sack', brand: 'Exped', model: '', category: 'Sleep', weight_g: 17, cost_usd: 0, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i014', name: 'Pillow', brand: 'Breezcamp', model: '', category: 'Sleep', weight_g: 100, cost_usd: 10, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },

    // ── Worn Clothing ──────────────────────────────────
    { id: 'i015', name: 'Light Hiker Micro Socks', brand: 'Darn Tough', model: 'Light Hiker Micro', category: 'Worn Clothing', weight_g: 60, cost_usd: 0, carry_type: 'worn', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: 'https://www.rei.com' },
    { id: 'i016', name: 'Lone Peak Trail Runners', brand: 'Altra', model: 'Lone Peak', category: 'Worn Clothing', weight_g: 600, cost_usd: 0, carry_type: 'worn', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: 'https://www.rei.com' },
    { id: 'i017', name: 'Sun Shirt', brand: 'UA', model: '', category: 'Worn Clothing', weight_g: 234, cost_usd: 0, carry_type: 'worn', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i018', name: 'Running Shorts', brand: '', model: '', category: 'Worn Clothing', weight_g: 238, cost_usd: 0, carry_type: 'worn', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i019', name: 'Run Hat', brand: 'Ciele', model: '', category: 'Worn Clothing', weight_g: 64, cost_usd: 0, carry_type: 'worn', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i020', name: 'Frogskins Sunglasses', brand: 'Oakley', model: 'Frogskins', category: 'Worn Clothing', weight_g: 27, cost_usd: 0, carry_type: 'worn', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i021', name: 'Asta Gear Trekking Poles', brand: 'Asta Gear', model: 'Carbon/Alum', category: 'Worn Clothing', weight_g: 325, cost_usd: 65, carry_type: 'worn', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },

    // ── Packed Clothing ────────────────────────────────
    { id: 'i022', name: 'Cairn Evo Sandals', brand: 'Bedrock', model: 'Cairn Evo', category: 'Packed Clothing', weight_g: 543, cost_usd: 68, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: 'https://www.rei.com' },
    { id: 'i023', name: 'Phantom Mountain Rain Jacket', brand: 'Rab', model: 'Phantom Mountain', category: 'Packed Clothing', weight_g: 229, cost_usd: 61, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: 'https://www.rei.com' },
    { id: 'i024', name: 'R1 Techface Fleece', brand: 'Patagonia', model: 'Techface R1', category: 'Packed Clothing', weight_g: 409, cost_usd: 153, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i025', name: 'Nano Puff Jacket', brand: 'Patagonia', model: 'Nano Puff', category: 'Packed Clothing', weight_g: 380, cost_usd: 0, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },

    // ── Cooking and Water ──────────────────────────────
    { id: 'i026', name: 'Backpacking Stove', brand: 'CampingMoon', model: '', category: 'Cooking and Water', weight_g: 98, cost_usd: 35, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i027', name: '750ml Titanium Pot', brand: 'Toaks', model: '750ml', category: 'Cooking and Water', weight_g: 108, cost_usd: 26.95, carry_type: 'packed', condition: 'good', volume_liters: .75, usage_days: 0, usage_nights: 0, notes: '', product_url: 'https://www.rei.com' },
    { id: 'i028', name: 'Windscreen (DIY)', brand: 'DIY', model: '', category: 'Cooking and Water', weight_g: 4, cost_usd: 7, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i029', name: 'Long Spoon', brand: 'Aliexpress', model: '', category: 'Cooking and Water', weight_g: 17, cost_usd: 7.36, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i030', name: 'Bear Vault BV500', brand: 'Bear Vault', model: 'BV500', category: 'Cooking and Water', weight_g: 1133, cost_usd: 100, carry_type: 'not_carried', condition: 'good', volume_liters: 11.5, usage_days: 0, usage_nights: 0, notes: 'Required in some areas.', product_url: 'https://www.rei.com' },
    { id: 'i031', name: 'Sawyer Squeeze + Cnoc', brand: 'Sawyer', model: 'Squeeze', category: 'Cooking and Water', weight_g: 171, cost_usd: 65, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: 'https://www.rei.com' },
    { id: 'i032', name: '1L Smart Water Bottle', brand: 'Smart Water', model: '1L', category: 'Cooking and Water', weight_g: 41, cost_usd: 0, carry_type: 'packed', condition: 'good', volume_liters: 1, usage_days: 0, usage_nights: 0, notes: '', product_url: null },

    // ── Health and Safety ──────────────────────────────
    { id: 'i033', name: 'Ditty Bag (3L)', brand: 'Swan Song', model: '3L', category: 'Health and Safety', weight_g: 31, cost_usd: 0, carry_type: 'packed', condition: 'good', volume_liters: 3, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i034', name: 'Hand Sanitizer', brand: '', model: '', category: 'Health and Safety', weight_g: 37, cost_usd: 0, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i035', name: 'Soap', brand: '', model: '', category: 'Health and Safety', weight_g: 49, cost_usd: 0, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i036', name: 'Sunscreen', brand: '', model: '', category: 'Health and Safety', weight_g: 113, cost_usd: 0, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i037', name: 'Chapstick', brand: '', model: '', category: 'Health and Safety', weight_g: 10, cost_usd: 0, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i038', name: 'Bamboo Toothbrush', brand: 'Bamboo', model: '', category: 'Health and Safety', weight_g: 6, cost_usd: 0, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i039', name: 'Toothpaste', brand: '', model: '', category: 'Health and Safety', weight_g: 33, cost_usd: 3, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i040', name: 'First Aid / Repair Kit', brand: '', model: '', category: 'Health and Safety', weight_g: 50, cost_usd: 0, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i041', name: 'BIC Mini Lighter', brand: 'BIC', model: 'Mini', category: 'Health and Safety', weight_g: 11, cost_usd: 2, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i042', name: 'Bugout Knife', brand: 'Benchmade', model: 'Bugout', category: 'Health and Safety', weight_g: 41, cost_usd: 0, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i043', name: 'Trowel', brand: 'Aliexpress', model: '', category: 'Health and Safety', weight_g: 38, cost_usd: 8.37, carry_type: 'not_carried', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },

    // ── Electronics and Misc ───────────────────────────
    { id: 'i044', name: 'Ditty Bag', brand: '', model: '', category: 'Electronics and Misc', weight_g: 35, cost_usd: 0, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i045', name: 'NU25 Headlamp', brand: 'Nitecore', model: 'NU25', category: 'Electronics and Misc', weight_g: 45, cost_usd: 37, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: 'https://www.rei.com' },
    { id: 'i046', name: 'Pixel 10 Pro XL', brand: 'Google', model: 'Pixel 10 Pro XL', category: 'Electronics and Misc', weight_g: 242, cost_usd: 0, carry_type: 'worn', condition: 'excellent', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i047', name: 'Phone Case', brand: 'Spigen', model: '', category: 'Electronics and Misc', weight_g: 42, cost_usd: 0, carry_type: 'worn', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i048', name: 'Earbuds', brand: '', model: '', category: 'Electronics and Misc', weight_g: 60, cost_usd: 0, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i049', name: 'Cables', brand: '', model: '', category: 'Electronics and Misc', weight_g: 13, cost_usd: 0, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i050', name: 'Power Bank (Anker)', brand: 'Anker', model: 'Steam Deck charger', category: 'Electronics and Misc', weight_g: 463, cost_usd: 0, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: 'Heavy — see wishlist for alternatives.', product_url: null },

    // ── Camera Gear ────────────────────────────────────
    { id: 'i051', name: 'Ricoh R1', brand: 'Ricoh', model: 'R1', category: 'Camera Gear', weight_g: 182, cost_usd: 0, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
    { id: 'i052', name: 'Fujifilm X-E3', brand: 'Fujifilm', model: 'X-E3', category: 'Camera Gear', weight_g: 0, cost_usd: 0, carry_type: 'not_carried', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: 'Weight TBD', product_url: null },
    { id: 'i053', name: 'Spare Battery', brand: '', model: '', category: 'Camera Gear', weight_g: 46, cost_usd: 0, carry_type: 'packed', condition: 'good', volume_liters: null, usage_days: 0, usage_nights: 0, notes: '', product_url: null },
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
      gear_overrides: {}
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
      gear_overrides: {}
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
      gear_ids: [
        'i001','i002','i003',        // Pack
        'i004','i005','i006','i007','i008', // Shelter (no footprint)
        'i010','i011','i012','i013','i014', // Sleep
        'i015','i016','i017','i018','i019','i020','i021', // Worn clothing
        'i022','i023','i024','i025', // Packed clothing
        'i026','i027','i028','i029','i031','i032', // Cook/water (no bear can)
        'i033','i034','i035','i036','i037','i038','i039','i040','i041','i042', // Health
        'i044','i045','i046','i047','i049', // Electronics (no power bank)
      ]
    },
    {
      id: 'tmpl002',
      name: 'Full Kit — Camera + Power',
      description: 'Everything including camera gear and power bank. Good for longer trips or when shooting.',
      trip_type: 'backpacking',
      created_from: null,
      created_at: '2024-06-01',
      gear_ids: [
        'i001','i002','i003',
        'i004','i005','i006','i007','i008',
        'i010','i011','i012','i013','i014',
        'i015','i016','i017','i018','i019','i020','i021',
        'i022','i023','i024','i025',
        'i026','i027','i028','i029','i031','i032',
        'i033','i034','i035','i036','i037','i038','i039','i040','i041','i042',
        'i044','i045','i046','i047','i048','i049','i050',
        'i051','i053', // Camera gear
      ]
    },
    {
      id: 'tmpl003',
      name: 'Coastal / Beach Trip',
      description: 'Pt. Reyes style. Sandals, rain layer, no need for bear can on coast.',
      trip_type: 'backpacking',
      created_from: 't001',
      created_at: '2024-09-15',
      gear_ids: [
        'i001','i002','i003',
        'i004','i005','i006','i007','i008',
        'i010','i011','i012','i013','i014',
        'i015','i016','i017','i018','i019','i020','i021',
        'i022','i023','i024','i025', // Sandals are key for coast
        'i026','i027','i028','i029','i031','i032',
        'i033','i034','i035','i036','i037','i038','i039','i040','i041','i042',
        'i044','i045','i046','i047','i048','i049','i050',
      ]
    }
  ]
};
