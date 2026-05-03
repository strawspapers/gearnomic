// Gearnomic � Free tier limits and gate checking
// ── Free tier limits ─────────────────────────────────────────
// These are intentionally enforced client-side only — a soft nudge, not a hard gate.
// Pre-launch with no paying users; a Postgres trigger adds complexity we don't need yet.
// Revisit post-launch if abuse becomes real.
const FREE_LIMITS = {
  items:     30,
  trips:     3,
  templates: 2,
};

// Returns true if the user can add one more of `kind`; false + shows upgrade modal if not.
// Counts from state directly so callers can't pass a stale or off-by-one value.
const _limitStateKey = { items: 'items', trips: 'trips', templates: 'templates' };
function checkLimit(kind) {
  if (_isSupporter) return true;
  const limit = FREE_LIMITS[kind];
  if (limit == null) return true;
  const count = (state[_limitStateKey[kind]] || []).length;
  if (count < limit) return true;
  const labels = { items: 'gear items', trips: 'trips', templates: 'loadouts' };
  openUpgradeModal(`Free accounts include up to ${limit} ${labels[kind] || kind}. Upgrade to add unlimited ${labels[kind] || kind}.`);
  return false;
}

// Shows upgrade modal for features that are entirely Supporter-only.
// Returns true if supporter, false + modal if not.
function requireSupporter(featureName) {
  if (_isSupporter) return true;
  openUpgradeModal(`${featureName} is a Supporter feature. Upgrade to unlock it.`);
  return false;
}
