// ═══════════════════════════════════════════════════════════════════════════
// Availity Transaction Support Refresh — v1.2
// Key logic: has_ref = 1 if tx:138 exists in ANY mode (not just REST)
// because Referral REST may be "Contact Sales" (premium) and not visible
// as a standard REST route in the ARIES payer list API.
// has_270, has_pa_in, has_pa_out = REST (modeCode:10) only.
// ═══════════════════════════════════════════════════════════════════════════

const fetch = require('node-fetch');

const CONFIG = {
  cfAccountId: '90652237702a9ed8d5bd48ad66b466a0',
  cfDatabaseId: '704682fb-fcfd-4c41-b5aa-4da131295a6b',
  cfApiToken: process.env.CF_API_TOKEN,
  availityUrl: 'https://essentials.availity.com/cloud/public/onb/epdm/es/public/v1/payers-hipaa',
  REST_MODE: '10',
  TX: {
    ELIG_270: [1],
    PA_OUT:   [6],
    PA_IN:    [259, 436],
    // REF uses ANY mode — if 138 exists in any channel, referral is supported
    REF_ANY:  [138],
  },
  LOB_SKIP:     ['DENTAL', 'RECLAMATION', 'ENCOUNTER', 'WGS'],
  LOB_MEDICAID: ['MEDICAID', 'MYCARE', 'COMMUNITY HEALTH'],
  LOB_MEDICARE: ['MEDICARE']
};

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function detectLob(name) {
  const u = name.toUpperCase();
  for (const s of CONFIG.LOB_SKIP)     if (u.includes(s)) return null;
  for (const s of CONFIG.LOB_MEDICARE) if (u.includes(s)) return 'Medicare';
  for (const s of CONFIG.LOB_MEDICAID) if (u.includes(s)) return 'Medicaid';
  return 'Commercial';
}

function parseRoutes(processingRoutes) {
  const all = (processingRoutes || []);
  // REST-only codes (modeCode === '10')
  const restCodes = all
    .filter(r => String(r.modeCode) === CONFIG.REST_MODE)
    .map(r => Number(r.transactionTypeCode));
  // All-mode codes (for referral detection)
  const allCodes = all.map(r => Number(r.transactionTypeCode));

  return {
    has_270:    restCodes.some(c => CONFIG.TX.ELIG_270.includes(c)) ? 1 : 0,
    has_pa_out: restCodes.some(c => CONFIG.TX.PA_OUT.includes(c))  ? 1 : 0,
    has_pa_in:  restCodes.some(c => CONFIG.TX.PA_IN.includes(c))   ? 1 : 0,
    // Referral: exists in ANY mode = available (may require contract for REST)
    has_ref:    allCodes.some(c => CONFIG.TX.REF_ANY.includes(c))  ? 1 : 0,
  };
}

async function d1Query(sql, params = []) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CONFIG.cfAccountId}/d1/database/${CONFIG.cfDatabaseId}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CONFIG.cfApiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql, params })
  });
  const data = await res.json();
  if (!data.success) throw new Error(`D1: ${JSON.stringify(data.errors)}`);
  return data.result[0];
}

async function queryAvailityPayer(ariesId) {
  const url = `${CONFIG.availityUrl}?limit=25&offset=0&platform=ARIES&q=${encodeURIComponent(ariesId)}&sortBy=name&sortDirection=asc`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) { log(`  HTTP ${res.status} for ${ariesId}`); return []; }
  const data = await res.json();
  return data.payers || [];
}

async function refreshAvailityData() {
  log('Starting Availity transaction support refresh v1.2...');
  if (!CONFIG.cfApiToken) throw new Error('CF_API_TOKEN not set');

  const result = await d1Query(
    `SELECT DISTINCT availity_payer_ids, plan_name, has_270, has_pa_in, has_pa_out, has_ref
     FROM prefixes WHERE availity_payer_ids != '' GROUP BY availity_payer_ids`
  );
  const groups = result.results || [];
  log(`Processing ${groups.length} payer groups...`);

  const updated = [], unchanged = [], errors = [];

  for (const group of groups) {
    const ids = group.availity_payer_ids.split(',').map(s => s.trim());
    let api_270 = 0, api_pa_out = 0, api_pa_in = 0, api_ref = 0;
    const lobsFound = [];

    for (const ariesId of ids) {
      try {
        const payers = await queryAvailityPayer(ariesId);
        const matching = payers.filter(p => p.ariesId === ariesId && detectLob(p.name) !== null);

        matching.forEach(p => {
          const lob = detectLob(p.name);
          if (lob && !lobsFound.includes(lob)) lobsFound.push(lob);
          const routes = parseRoutes(p.processingRoutes);
          api_270    = Math.max(api_270,    routes.has_270);
          api_pa_out = Math.max(api_pa_out, routes.has_pa_out);
          api_pa_in  = Math.max(api_pa_in,  routes.has_pa_in);
          api_ref    = Math.max(api_ref,    routes.has_ref);
        });
      } catch(e) {
        log(`  Error querying ${ariesId}: ${e.message}`);
        errors.push({ ariesId, error: e.message });
      }
      await delay(120);
    }

    const d1_270    = group.has_270    || 0;
    const d1_pa_in  = group.has_pa_in  || 0;
    const d1_pa_out = group.has_pa_out || 0;
    const d1_ref    = group.has_ref    || 0;

    const changed = d1_270 !== api_270 || d1_pa_in !== api_pa_in ||
                    d1_pa_out !== api_pa_out || d1_ref !== api_ref;

    if (changed) {
      // Use the first ID for the LIKE match (most specific)
      await d1Query(
        `UPDATE prefixes SET has_270=?, has_pa_in=?, has_pa_out=?, has_ref=?
         WHERE availity_payer_ids LIKE ?`,
        [api_270, api_pa_in, api_pa_out, api_ref, `%${ids[0]}%`]
      );
      log(`  ✅ ${group.plan_name}`);
      log(`     270: ${d1_270}→${api_270} | PA-IN: ${d1_pa_in}→${api_pa_in} | PA-OUT: ${d1_pa_out}→${api_pa_out} | REF: ${d1_ref}→${api_ref}`);
      updated.push({ plan: group.plan_name, ids: group.availity_payer_ids, lobs: lobsFound.sort().join(',') });
    } else {
      log(`  ✓ ${group.plan_name} — no changes`);
      unchanged.push(group.plan_name);
    }
  }

  log(`\nRefresh complete — Updated: ${updated.length} | Unchanged: ${unchanged.length} | Errors: ${errors.length}`);
  return { updated, unchanged, errors };
}

module.exports = { refreshAvailityData };

if (require.main === module) {
  refreshAvailityData()
    .then(() => process.exit(0))
    .catch(err => { console.error('Fatal:', err); process.exit(1); });
}
