// Direction 8 — CABIN V2
// Updated to match the user's NEW layout (uploads/index.html):
// • Fraunces (display, serif) + DM Sans (body) via Google Fonts
// • Deep forest green #2A4032 primary, near-black #18181A text
// • Card-based with subtle rounded corners (~8px) — not pure flat
// • Main nav: Gear / Loadouts / Trips / Food / Stats (no Dashboard)
// • Sub-nav within Gear (closet/wishlist/db) and Food (plans/recipes/db)
// • Cairn logo replaces the "GN" text monogram
//
// Three artboards reflect the app's real IA:
//   1. Trips landing — upcoming trip hero + Pack/Itin/Meals tiles + grid
//   2. Food → My plans → Sawtooth detail (the meal plan)
//   3. Gear → My closet (inventory)

const cab2Tokens = {
  // Surfaces — cool neutral off-white. Not cream, not paper-aged.
  bg:        '#F4F4F1',
  surface2:  '#E8E7E2',    // hover/active tint
  // Ink
  ink:       '#0F0F10',
  ink2:      '#3A3A3D',
  ink3:      '#7E7E80',
  // Lines
  border:    '#0F0F10',
  borderSoft:'#CFCEC8',
  // Typography
  disp:      "'Fraunces', 'Source Serif 4', Georgia, serif",
  body:      "'DM Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono:      "ui-monospace, 'SF Mono', 'Menlo', Consolas, monospace",
  // Radii (squared off — no rounded corners)
  rSm: '0px', rMd: '0px', rLg: '0px',
};

// Scoped CSS — link hover, table hover, etc.
if (typeof document !== 'undefined' && !document.getElementById('cab2-styles')) {
  const s = document.createElement('style');
  s.id = 'cab2-styles';
  s.textContent = `
    .gn-cab2 { font-family: ${cab2Tokens.body}; color: ${cab2Tokens.ink}; font-size: 14px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
    .gn-cab2 a { color: inherit; text-decoration: none; }
    .gn-cab2 a:hover { color: ${cab2Tokens.ink}; }
    .gn-cab2 a.link { color: ${cab2Tokens.ink}; border-bottom: 1px solid ${cab2Tokens.ink}; padding-bottom: 1px; }
    .gn-cab2 a.link:hover { background: ${cab2Tokens.ink}; color: ${cab2Tokens.bg}; }
    .gn-cab2 h1.page-title { font-size: 30px; font-weight: 500; margin: 0; letter-spacing: -0.02em; line-height: 1.15; color: ${cab2Tokens.ink}; }
    .gn-cab2 .page-sub { font-size: 13px; color: ${cab2Tokens.ink3}; margin: 4px 0 0; }
    .gn-cab2 .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin: 18px 0 20px; }
    /* No floating cards — "card" is just a logical group with hairlines */
    .gn-cab2 .card { background: transparent; border: none; }
    .gn-cab2 .card-header { display: flex; align-items: baseline; justify-content: space-between; padding: 0 0 10px; border-bottom: 1.5px solid ${cab2Tokens.ink}; gap: 12px; margin-bottom: 0; }
    .gn-cab2 .card-title { font-size: 14px; font-weight: 600; color: ${cab2Tokens.ink}; letter-spacing: -0.005em; }
    .gn-cab2 .card-sub { font-size: 12px; color: ${cab2Tokens.ink3}; }
    .gn-cab2 .btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 14px; font-family: inherit; font-size: 13px; font-weight: 500; border: 1.5px solid ${cab2Tokens.ink}; background: transparent; color: ${cab2Tokens.ink}; cursor: pointer; }
    .gn-cab2 .btn:hover { background: ${cab2Tokens.ink}; color: ${cab2Tokens.bg}; }
    .gn-cab2 .btn-sm { height: 28px; font-size: 12.5px; padding: 0 11px; }
    .gn-cab2 .btn-primary { background: ${cab2Tokens.ink}; color: ${cab2Tokens.bg}; border-color: ${cab2Tokens.ink}; }
    .gn-cab2 .btn-primary:hover { background: ${cab2Tokens.ink2}; border-color: ${cab2Tokens.ink2}; color: ${cab2Tokens.bg}; }
    .gn-cab2 .btn-ghost { border-color: transparent; background: transparent; color: ${cab2Tokens.ink2}; }
    .gn-cab2 .btn-ghost:hover { background: ${cab2Tokens.surface2}; color: ${cab2Tokens.ink}; }
    .gn-cab2 .input, .gn-cab2 .select { height: 32px; padding: 0 10px; font-family: inherit; font-size: 13px; border: 1.5px solid ${cab2Tokens.ink}; background: ${cab2Tokens.bg}; color: ${cab2Tokens.ink}; outline: none; }
    .gn-cab2 .input::placeholder { color: ${cab2Tokens.ink3}; }
    .gn-cab2 .input:focus, .gn-cab2 .select:focus { background: ${cab2Tokens.surface2}; }
    .gn-cab2 .data-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    .gn-cab2 .data-table th { font-weight: 500; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: ${cab2Tokens.ink3}; padding: 10px 14px; text-align: left; border-bottom: 1.5px solid ${cab2Tokens.ink}; background: transparent; }
    .gn-cab2 .data-table td { padding: 11px 14px; border-bottom: 1px solid ${cab2Tokens.borderSoft}; vertical-align: middle; }
    .gn-cab2 .data-table tr:last-child td { border-bottom: 0; }
    .gn-cab2 .data-table tr:hover td { background: ${cab2Tokens.surface2}; }
    .gn-cab2 .data-table td.num { font-variant-numeric: tabular-nums; text-align: right; }
    .gn-cab2 .data-table tr.foot td { font-weight: 600; background: transparent; border-top: 1.5px solid ${cab2Tokens.ink}; border-bottom: 0; }
    .gn-cab2 .meta { font-size: 12.5px; color: ${cab2Tokens.ink3}; }
    .gn-cab2 .num { font-variant-numeric: tabular-nums; }
    .gn-cab2 .smallcap { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: ${cab2Tokens.ink3}; font-weight: 500; }
    .gn-cab2 .pill { display: inline-block; padding: 2px 8px; font-size: 11px; font-weight: 500; letter-spacing: 0.02em; background: ${cab2Tokens.ink}; color: ${cab2Tokens.bg}; }
    .gn-cab2 .pill.warn { background: ${cab2Tokens.bg}; color: ${cab2Tokens.ink}; border: 1.5px solid ${cab2Tokens.ink}; padding: 0 6.5px; }
    /* Toolbar */
    .gn-cab2 .toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
    .gn-cab2 .toolbar-left { display: flex; gap: 8px; flex-wrap: wrap; }
    /* Sub-nav (matches uploads/index.html .sub-nav) */
    .gn-cab2 .sub-nav { display: flex; gap: 0; border-bottom: 1.5px solid ${cab2Tokens.ink}; margin: 10px 0 20px; }
    .gn-cab2 .sub-tab { padding: 10px 16px; font-family: inherit; font-size: 13.5px; color: ${cab2Tokens.ink2}; background: transparent; border: 0; border-bottom: 2px solid transparent; cursor: pointer; }
    .gn-cab2 .sub-tab:hover { color: ${cab2Tokens.ink}; }
    .gn-cab2 .sub-tab.active { color: ${cab2Tokens.bg}; background: ${cab2Tokens.ink}; font-weight: 600; border-bottom-color: ${cab2Tokens.ink}; }
    /* Main nav */
    .gn-cab2 .main-nav { display: flex; gap: 4px; }
    .gn-cab2 .nav-tab { padding: 8px 14px; font-family: inherit; font-size: 13.5px; color: ${cab2Tokens.ink2}; background: transparent; border: 0; cursor: pointer; }
    .gn-cab2 .nav-tab:hover { color: ${cab2Tokens.ink}; }
    .gn-cab2 .nav-tab.active { color: ${cab2Tokens.ink}; font-weight: 600; border-bottom: 2px solid ${cab2Tokens.ink}; padding-bottom: 6px; }
    /* Header — sits on the page bg, no color block, hairline below. */
    .gn-cab2 .site-header { background: ${cab2Tokens.bg}; color: ${cab2Tokens.ink}; border-bottom: 1.5px solid ${cab2Tokens.ink}; }
    .gn-cab2 .header-inner { max-width: 1200px; margin: 0 auto; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
    .gn-cab2 .logo { display: flex; align-items: center; gap: 10px; }
    .gn-cab2 .logo-name { font-family: ${cab2Tokens.disp}; font-size: 22px; font-weight: 600; color: ${cab2Tokens.ink}; letter-spacing: -0.015em; }
    /* User menu */
    .gn-cab2 .user-trigger { display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 10px; border: 1.5px solid ${cab2Tokens.ink}; background: ${cab2Tokens.bg}; color: ${cab2Tokens.ink}; font-family: inherit; font-size: 13px; cursor: pointer; }
    .gn-cab2 .user-trigger:hover { background: ${cab2Tokens.ink}; color: ${cab2Tokens.bg}; }
    .gn-cab2 .user-caret { font-size: 9px; opacity: 0.7; margin-left: 2px; }
    .gn-cab2 .user-menu { position: absolute; top: calc(100% + 8px); right: 0; min-width: 200px; background: ${cab2Tokens.bg}; border: 1.5px solid ${cab2Tokens.ink}; z-index: 20; }
    .gn-cab2 .user-menu .item { display: block; width: 100%; padding: 10px 14px; text-align: left; background: transparent; border: 0; border-bottom: 1px solid ${cab2Tokens.borderSoft}; font-family: inherit; font-size: 13px; color: ${cab2Tokens.ink}; cursor: pointer; }
    .gn-cab2 .user-menu .item:last-child { border-bottom: 0; }
    .gn-cab2 .user-menu .item:hover { background: ${cab2Tokens.ink}; color: ${cab2Tokens.bg}; }
    .gn-cab2 .user-menu .divider { height: 1.5px; background: ${cab2Tokens.ink}; }
    .gn-cab2 .unit-toggle { font-family: ${cab2Tokens.mono}; font-size: 11px; letter-spacing: 0; }
    /* Tile group for upcoming trip hero */
    .gn-cab2 .tile-row { display: grid; grid-template-columns: repeat(3, 1fr); }
    .gn-cab2 .tile { padding: 20px 22px; }
    .gn-cab2 .tile + .tile { border-left: 1px solid ${cab2Tokens.borderSoft}; }
    .gn-cab2 .tile .lbl { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: ${cab2Tokens.ink3}; font-weight: 500; }
    .gn-cab2 .tile .v { font-size: 24px; font-weight: 600; color: ${cab2Tokens.ink}; margin-top: 6px; letter-spacing: -0.015em; font-variant-numeric: tabular-nums; }
    .gn-cab2 .tile .sub { font-size: 12.5px; color: ${cab2Tokens.ink3}; margin-top: 4px; }
    .gn-cab2 .tile .cta { margin-top: 14px; font-size: 13px; }
  `;
  document.head.appendChild(s);
}

// Cairn logo — slightly larger and crisper than the pixel version. Single ink.
// Sized to sit next to a 21px wordmark.
const Cab2Cairn = ({size=22, ink=cab2Tokens.ink}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="1"  y="18" width="22" height="4" fill={ink}/>
    <rect x="4"  y="12" width="16" height="4" fill={ink}/>
    <rect x="7"  y="6"  width="10" height="4" fill={ink}/>
    <rect x="9"  y="1"  width="6"  height="3" fill={ink}/>
  </svg>
);

// Header — logo · main-nav · (unit toggle + user menu)
const Cab2Header = ({tab='trips', userMenuOpen=false}) => {
  const tabs = [
    ['Gear',     'gear'],
    ['Loadouts', 'load'],
    ['Trips',    'trips'],
    ['Food',     'food'],
    ['Stats',    'stats'],
  ];
  return (
    <header className="site-header">
      <div className="header-inner">
        <div className="logo">
          <Cab2Cairn size={22}/>
          <span className="logo-name">Gearnomic</span>
        </div>
        <nav className="main-nav">
          {tabs.map(([t, k]) => (
            <button key={k} className={'nav-tab' + (tab===k ? ' active' : '')}>{t}</button>
          ))}
        </nav>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <button className="user-trigger unit-toggle" title="Toggle units">g · lb</button>
          <div style={{position:'relative'}}>
            <button className="user-trigger">
              <span>jordan@example.com</span>
              <span className="user-caret">▾</span>
            </button>
            {userMenuOpen && (
              <div className="user-menu">
                <button className="item">Profile</button>
                <button className="item">Settings</button>
                <button className="item">Export data</button>
                <div className="divider"/>
                <button className="item">Sign out</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

// ────────────────── TRIPS LANDING ──────────────────
// This is the closest thing to a "dashboard" in the user's IA — Trips is where
// the upcoming-trip hero lives. Pack / Itinerary / Meals tiles surface the
// trip+meals+gear cohesion.
const Cab2TripsLanding = () => {
  return (
    <div style={{width:1280, minHeight:1200, background:cab2Tokens.bg}}>
      <div className="gn-cab2">
        <Cab2Header tab="trips" userMenuOpen={true}/>

        <main style={{maxWidth:1200, margin:'0 auto', padding:'24px 24px 60px'}}>
          <div className="page-header">
            <div>
              <h1 className="page-title">Trips</h1>
              <p className="page-sub">3 upcoming · 8 logged · 14 days in field this year</p>
            </div>
            <div style={{display:'flex', gap:8}}>
              <button className="btn btn-sm btn-ghost">Manage trip types</button>
              <button className="btn btn-sm btn-primary">+ New Trip</button>
            </div>
          </div>

          {/* Two-up: Next trip detail + Upcoming list */}
          <div style={{display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:18, marginBottom:18}}>
            {/* Next trip — hero card with tiles */}
            <div className="card">
              <div className="card-header">
                <div>
                  <span className="card-title">Next trip</span>
                  <span className="card-sub" style={{marginLeft:8}}>departs in 4 days</span>
                </div>
                <a href="#" className="link" style={{fontSize:13}}>Open trip →</a>
              </div>
              <div style={{padding:'22px 22px 6px'}}>
                <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:18}}>
                  <div>
                    <div className="smallcap" style={{color:cab2Tokens.ink3}}>Upcoming</div>
                    <div style={{fontSize:36, fontWeight:600, letterSpacing:'-0.025em', lineHeight:1.05, marginTop:6}}>Sawtooth</div>
                    <div style={{fontSize:14, color:cab2Tokens.ink2, marginTop:6}}>Thu 18 Jul → Mon 22 Jul · 4 nights · 56 mi · solo</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <span className="pill">Ready to pack</span>
                  </div>
                </div>
              </div>
              <div className="tile-row" style={{borderTop:`1px solid ${cab2Tokens.borderSoft}`, marginTop:18}}>
                <div className="tile">
                  <div className="lbl">Pack</div>
                  <div className="v">14.02 lb</div>
                  <div className="sub">54 items · 26.04 lb skin-out</div>
                  <div className="cta"><a href="#" className="link">Open loadout →</a></div>
                </div>
                <div className="tile">
                  <div className="lbl">Itinerary</div>
                  <div className="v">5 days</div>
                  <div className="sub">56 mi · 6 800 ft · 4 camps</div>
                  <div className="cta"><a href="#" className="link">Open itinerary →</a></div>
                </div>
                <div className="tile">
                  <div className="lbl">Meals</div>
                  <div className="v">12 meals</div>
                  <div className="sub">14 800 kcal · 5.5 lb food</div>
                  <div className="cta"><a href="#" className="link">Open meal plan →</a></div>
                </div>
              </div>
            </div>

            {/* Upcoming trips list */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Upcoming trips</span>
                <span className="card-sub">3 planned</span>
              </div>
              <div>
                {[
                  ['Sawtooth Loop',      'Sawtooth Wilderness, ID',  '18 — 22 Jul', '4 nt · 56 mi', 'Ready',     true],
                  ['Beartooth East',     'Beartooth, MT',            '12 — 18 Aug', '6 nt · 78 mi', 'Planning',  false],
                  ['Bob Marshall North', 'Bob Marshall, MT',         '03 — 11 Sep', '8 nt · 92 mi', 'Idea',      false],
                ].map(([name, loc, dates, sub, status, ready], i, a) => (
                  <div key={i} style={{padding:'14px 18px', borderBottom: i<a.length-1 ? `1px solid ${cab2Tokens.borderSoft}` : 'none'}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8}}>
                      <a href="#" style={{fontSize:15, fontWeight:600, letterSpacing:'-0.005em'}}>{name}</a>
                      <span className={'pill' + (!ready ? ' warn' : '')}>{status}</span>
                    </div>
                    <div className="meta" style={{marginTop:2}}>{loc}</div>
                    <div style={{display:'flex', justifyContent:'space-between', marginTop:6, fontSize:12.5}}>
                      <span className="num" style={{color:cab2Tokens.ink2}}>{dates}</span>
                      <span className="meta">{sub}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* All trips table */}
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <div className="card-header">
              <span className="card-title">All trips</span>
              <div style={{display:'flex', gap:8, alignItems:'center'}}>
                <input className="input" placeholder="Search trips…" style={{width:200}}/>
                <select className="select"><option>All trip types</option></select>
                <select className="select"><option>Sort: most recent</option></select>
              </div>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Trip</th>
                  <th>Location</th>
                  <th>Dates</th>
                  <th style={{textAlign:'right'}}>Miles</th>
                  <th style={{textAlign:'right'}}>Nights</th>
                  <th style={{textAlign:'right'}}>Base wt</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Sawtooth Loop',       'Sawtooth, ID',    '18 — 22 Jul 2025', '56',  '4',  '14.02 lb', 'Upcoming', 'pill'],
                  ['Beartooth East',      'Beartooth, MT',   '12 — 18 Aug 2025', '78',  '6',  '— set —',  'Planning', 'warn'],
                  ['Bob Marshall North',  'Bob Marshall, MT','03 — 11 Sep 2025', '92',  '8',  '— set —',  'Idea',     'warn'],
                  ['Powderhouse',         'Sawtooth, ID',    '14 — 15 Jun 2025', '6',   '1',  '13.40 lb', 'Logged',   'logged'],
                  ['JMT / Selway',        'ID-MT',           '02 — 14 Sep 2024', '142', '12', '15.10 lb', 'Logged',   'logged'],
                  ['Beartooth Traverse',  'Beartooth, MT',   '14 — 20 Aug 2024', '78',  '6',  '14.66 lb', 'Logged',   'logged'],
                ].map((r, i) => (
                  <tr key={i}>
                    <td><a href="#" style={{fontWeight:500}}>{r[0]}</a></td>
                    <td className="meta">{r[1]}</td>
                    <td className="num" style={{textAlign:'left', color:cab2Tokens.ink2}}>{r[2]}</td>
                    <td className="num">{r[3]}</td>
                    <td className="num">{r[4]}</td>
                    <td className="num">{r[5]}</td>
                    <td>
                      {r[7]==='logged'
                        ? <span className="meta">Logged</span>
                        : <span className={'pill' + (r[7]==='warn' ? ' warn' : '')}>{r[6]}</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
};

// ────────────────── FOOD → MY PLANS → SAWTOOTH ──────────────────
const Cab2Meals = () => {
  const days = [
    { date:'Thu 18 Jul', dayno:'Day 1', partial:'half day', meals:[
      ['Lunch · trail',  'Clif bar + jerky + apple',         680, 220],
      ['Dinner · camp',  'Backcountry Pad Thai',             750, 170],
      ['Snacks',         'Mixed nuts (60 g)',                360,  60],
    ], totals:[1790, 450]},
    { date:'Fri 19 Jul', dayno:'Day 2', meals:[
      ['Breakfast',      'Oatmeal + coffee',                 480, 110],
      ['Lunch · trail',  'Tortilla + tuna + cheese',         720, 180],
      ['Dinner · camp',  'Backcountry beef chili',           820, 175],
      ['Snacks',         '2× Pro-bar, almonds',              580, 110],
    ], totals:[2600, 575]},
    { date:'Sat 20 Jul', dayno:'Day 3', meals:[
      ['Breakfast',      'Oatmeal + coffee',                 480, 110],
      ['Lunch · trail',  'Tortilla + peanut butter + honey', 780, 165],
      ['Dinner · camp',  'Backcountry pasta primavera',      780, 180],
      ['Snacks',         '2× Snickers, gummies',             620,  95],
    ], totals:[2660, 550]},
    { date:'Sun 21 Jul', dayno:'Day 4', meals:[
      ['Breakfast',      'Oatmeal + coffee',                 480, 110],
      ['Lunch · trail',  'Pop-tarts (2) + jerky',            720, 180],
      ['Dinner · camp',  'Backcountry chicken & rice',       820, 195],
      ['Snacks',         'Trail mix, dried mango',           540,  90],
    ], totals:[2560, 575]},
    { date:'Mon 22 Jul', dayno:'Day 5', partial:'exit', meals:[
      ['Breakfast',      'Oatmeal + coffee',                 480, 110],
      ['Lunch · car',    'Saved for trailhead burger',         0,   0],
      ['Snacks',         'Last of trail mix',                330,  60],
    ], totals:[ 810, 170]},
  ];

  const totalKcal = days.reduce((s, d) => s + d.totals[0], 0);
  const totalGram = days.reduce((s, d) => s + d.totals[1], 0);

  return (
    <div style={{width:1280, minHeight:1200, background:cab2Tokens.bg}}>
      <div className="gn-cab2">
        <Cab2Header tab="food"/>

        <main style={{maxWidth:1200, margin:'0 auto', padding:'24px 24px 60px'}}>
          {/* Page header */}
          <div className="page-header">
            <div>
              <h1 className="page-title">Food Planning</h1>
              <p className="page-sub">Plan meals, calories and weight per trip</p>
            </div>
            <button className="btn btn-sm btn-primary">+ New plan</button>
          </div>

          {/* Sub-nav (matches sub-nav pattern in uploads/index.html) */}
          <nav className="sub-nav">
            <button className="sub-tab active">My plans</button>
            <button className="sub-tab">My recipes</button>
            <button className="sub-tab">Recipe database</button>
          </nav>

          {/* Breadcrumb + plan title */}
          <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:16, marginBottom:16}}>
            <div>
              <div className="meta" style={{marginBottom:6}}>
                <a href="#" className="link">My plans</a>
                <span style={{margin:'0 8px', color:cab2Tokens.ink3}}>›</span>
                <span style={{color:cab2Tokens.ink2}}>Sawtooth</span>
              </div>
              <div style={{fontSize:26, fontWeight:600, letterSpacing:'-0.02em', lineHeight:1.15}}>Sawtooth — five days, twelve meals</div>
              <div className="meta" style={{marginTop:6}}>Linked to trip <a href="#" className="link">Sawtooth Loop</a> · 3 700 kcal/day target · solo · no resupply.</div>
            </div>
            <div style={{display:'flex', gap:8}}>
              <button className="btn btn-sm">+ Add meal</button>
              <button className="btn btn-sm">From recipe</button>
              <button className="btn btn-sm">Shopping list</button>
              <button className="btn btn-sm btn-primary">Print</button>
            </div>
          </div>

          {/* Top stats row */}
          <div className="card" style={{marginBottom:18}}>
            <div className="tile-row" style={{gridTemplateColumns:'repeat(5, 1fr)'}}>
              {[
                ['Calories',     totalKcal.toLocaleString() + ' kcal',       '3 700 kcal/day avg'],
                ['Food weight',  `${(totalGram/453.6).toFixed(2)} lb`,        `${totalGram.toLocaleString()} g total`],
                ['Days planned', '5 / 5',                                     'all days have meals'],
                ['Kcal / gram',  (totalKcal/totalGram).toFixed(2),            'target ≥ 4.5'],
                ['Sacks',        '4',                                          'bear-safe · color-coded'],
              ].map(([l, v, sub], i) => (
                <div className="tile" key={l}>
                  <div className="lbl">{l}</div>
                  <div className="v">{v}</div>
                  <div className="sub">{sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Day-by-day plan */}
          <div className="card" style={{padding:0, overflow:'hidden', marginBottom:18}}>
            <div className="card-header">
              <span className="card-title">Day by day</span>
              <span className="card-sub">drag to reorder · click a meal to edit</span>
            </div>
            <div>
              {days.map((d, di) => (
                <div key={di} style={{borderTop: di>0 ? `1px solid ${cab2Tokens.borderSoft}` : 'none'}}>
                  <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', padding:'14px 18px', background:cab2Tokens.surface2}}>
                    <div style={{display:'flex', alignItems:'baseline', gap:12}}>
                      <span style={{fontSize:14, fontWeight:600}}>{d.dayno}</span>
                      <span className="meta">{d.date}</span>
                      {d.partial && <span className="pill warn">{d.partial}</span>}
                    </div>
                    <div className="meta num">{d.totals[0].toLocaleString()} kcal &nbsp;·&nbsp; {d.totals[1]} g</div>
                  </div>
                  <table className="data-table" style={{borderTop:'none'}}>
                    <tbody>
                      {d.meals.map((m, mi) => (
                        <tr key={mi}>
                          <td className="meta" style={{width:140}}>{m[0]}</td>
                          <td><a href="#">{m[1]}</a></td>
                          <td className="num" style={{width:120, color:cab2Tokens.ink2}}>{m[2].toLocaleString()} kcal</td>
                          <td className="num" style={{width:90, color:cab2Tokens.ink2}}>{m[3]} g</td>
                          <td style={{width:30, textAlign:'right'}}>
                            <span className="meta" style={{cursor:'pointer'}}>⋯</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>

          {/* Pantry footer */}
          <div className="card">
            <div className="card-header">
              <div>
                <span className="card-title">Pantry & shopping</span>
                <span className="card-sub" style={{marginLeft:8}}>17 unique foods · 4 sacks</span>
              </div>
              <a href="#" className="link" style={{fontSize:13}}>View shopping list →</a>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Used in</th>
                  <th style={{textAlign:'right'}}>Per serving</th>
                  <th style={{textAlign:'right'}}>Servings</th>
                  <th style={{textAlign:'right'}}>Total wt</th>
                  <th>Sack</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Quaker oats (mini)',          '4 breakfasts',        ' 80 g',  4, ' 320 g', 'Breakfast'],
                  ['Instant coffee (Trader Joe)', '4 breakfasts',        '  6 g',  4, '  24 g', 'Breakfast'],
                  ['Mountain House Pad Thai',     'Day 1 dinner',        '170 g',  1, ' 170 g', 'Dinners'],
                  ['Mountain House beef chili',   'Day 2 dinner',        '175 g',  1, ' 175 g', 'Dinners'],
                  ['Mountain House pasta',        'Day 3 dinner',        '180 g',  1, ' 180 g', 'Dinners'],
                  ['Mountain House chicken rice', 'Day 4 dinner',        '195 g',  1, ' 195 g', 'Dinners'],
                  ['Trader Joe trail mix',        'Day 3, 4, 5 snacks',  ' 90 g',  3, ' 270 g', 'Snacks'],
                  ['Pro-bar (mixed)',             'Day 2 snack',         ' 55 g',  2, ' 110 g', 'Snacks'],
                ].map((r, i) => (
                  <tr key={i}>
                    <td><a href="#" style={{fontWeight:500}}>{r[0]}</a></td>
                    <td className="meta">{r[1]}</td>
                    <td className="num">{r[2]}</td>
                    <td className="num">{r[3]}</td>
                    <td className="num">{r[4]}</td>
                    <td><span className="pill">{r[5]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
};

// ────────────────── GEAR → MY CLOSET ──────────────────
const Cab2Gear = () => {
  const items = [
    ['20.04', 'MSR Hubba NX 2P',           'Shelter',  'MSR · NX 2P',     '1640 g', '$449',  'Excellent', 'In pack',  'Sawtooth'],
    ['20.05', 'Tyvek footprint, cut',      'Shelter',  'DIY · cut to fit',' 118 g',   '$8',  'Good',      'In pack',  'Sawtooth'],
    ['20.06', 'MSR Groundhog ×8',          'Shelter',  'MSR · 8-pack',    ' 112 g',  '$22',  'Excellent', 'In pack',  'Sawtooth'],
    ['21.01', 'WM UltraLite 20°',          'Sleep',    'Western Mtn',     ' 850 g', '$590',  'Excellent', 'In pack',  'Sawtooth'],
    ['21.02', 'Therm-a-Rest NeoAir XL',    'Sleep',    'Therm-a-Rest',    ' 430 g', '$210',  'Good',      'In pack',  'Sawtooth'],
    ['21.03', 'Sea-to-Summit Reactor',     'Sleep',    'STS',             ' 248 g',  '$65',  'Excellent', 'On shelf', '—'],
    ['30.01', 'Hyperlite Junction 55',     'Pack',     'HMG · 55 L',      ' 840 g', '$385',  'Good',      'In pack',  'Sawtooth'],
    ['30.02', 'Dyneema dry sacks ×3',      'Pack',     'STS · S/M/L',     '  62 g',  '$48',  'Excellent', 'In pack',  'Sawtooth'],
    ['30.04', 'Ursack Major 10 L',         'Pack',     'Ursack',          ' 214 g',  '$98',  'Excellent', 'In pack',  'Sawtooth'],
    ['40.01', 'MSR PocketRocket 2',        'Kitchen',  'MSR',             '  73 g',  '$55',  'Excellent', 'In pack',  'Sawtooth'],
    ['40.02', 'Toaks 750 ml Ti pot',       'Kitchen',  'Toaks · titanium',' 103 g',  '$32',  'Good',      'In pack',  'Sawtooth'],
    ['40.07', 'GSI Halulite cup',          'Kitchen',  'GSI',             '  62 g',  '$10',  'Fair',      'Retired',  '—'],
    ['50.02', 'Sawyer Squeeze + CNOC',     'Water',    'Sawyer · CNOC 2L',' 138 g',  '$58',  'Excellent', 'In pack',  'Sawtooth'],
    ['50.04', 'Smartwater 1 L ×2',         'Water',    'Smartwater',      '  58 g',   '$3',  'Excellent', 'In pack',  'Sawtooth'],
  ];

  return (
    <div style={{width:1280, minHeight:1200, background:cab2Tokens.bg}}>
      <div className="gn-cab2">
        <Cab2Header tab="gear"/>

        <main style={{maxWidth:1200, margin:'0 auto', padding:'24px 24px 60px'}}>
          {/* Sub-nav comes first under tab in your structure */}
          <nav className="sub-nav" style={{marginTop:0}}>
            <button className="sub-tab active">My closet</button>
            <button className="sub-tab">Wishlist</button>
            <button className="sub-tab">Gear database</button>
          </nav>

          <div className="page-header" style={{marginTop:0}}>
            <div>
              <h1 className="page-title">Gear Closet</h1>
              <p className="page-sub">114 items · 21.4 kg total · 12 retired · 54 currently in pack on <a href="#" className="link">Sawtooth</a></p>
            </div>
            <button className="btn btn-sm btn-primary">+ Add Item</button>
          </div>

          {/* Toolbar */}
          <div className="toolbar">
            <div className="toolbar-left">
              <input className="input" placeholder="Search by name or brand…" style={{width:220}}/>
              <select className="select"><option>All categories</option></select>
              <select className="select"><option>Any condition</option></select>
            </div>
            <select className="select" style={{marginLeft:'auto'}}><option>Group by category</option></select>
            <button className="btn btn-sm">Columns ▾</button>
            <button className="btn btn-sm">Manage categories</button>
            <button className="btn btn-sm">Bulk update</button>
          </div>

          {/* Gear table inside a card */}
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{width:70}}>Cat. №</th>
                  <th>Item</th>
                  <th style={{width:120}}>Category</th>
                  <th style={{width:140}}>Brand / Model</th>
                  <th style={{width:80, textAlign:'right'}}>Weight</th>
                  <th style={{width:70, textAlign:'right'}}>Cost</th>
                  <th style={{width:100}}>Condition</th>
                  <th style={{width:100}}>Status</th>
                  <th style={{width:120}}>In loadout</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r, i) => (
                  <tr key={i}>
                    <td className="num" style={{textAlign:'left', color:cab2Tokens.ink3, fontFamily:cab2Tokens.mono, fontSize:11.5}}>{r[0]}</td>
                    <td><a href="#" style={{fontWeight:500}}>{r[1]}</a></td>
                    <td><a href="#">{r[2]}</a></td>
                    <td className="meta">{r[3]}</td>
                    <td className="num">{r[4]}</td>
                    <td className="num">{r[5]}</td>
                    <td className="meta">{r[6]}</td>
                    <td>
                      {r[7]==='Retired'
                        ? <span className="meta">Retired</span>
                        : r[7]==='On shelf'
                          ? <span className="meta">On shelf</span>
                          : <span className="pill">In pack</span>
                      }
                    </td>
                    <td className="meta">{r[8]==='—' ? '—' : <a href="#" className="link">{r[8]}</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginTop:14}}>
            <div className="meta">Showing 14 of 114 items. <a href="#" className="link">Show all</a> · <a href="#" className="link">Show retired only</a></div>
            <div className="meta">Filtered total: 4 770 g · $1 803</div>
          </div>
        </main>
      </div>
    </div>
  );
};

Object.assign(window, { Cab2TripsLanding, Cab2Meals, Cab2Gear });
