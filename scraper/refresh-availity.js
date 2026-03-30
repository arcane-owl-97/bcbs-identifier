// ═══════════════════════════════════════════════════════════════════════════
// Availity Transaction Support Refresh — v1.1
// Queries public Availity payer list API for each payer in D1
// Updates has_270, has_pa_in, has_pa_out, has_ref based on live REST routes
// String/number comparison fix applied throughout
// ═══════════════════════════════════════════════════════════════════════════

const fetch = require('node-fetch');

const CONFIG = {
  cfAccountId: '90652237702a9ed8d5bd48ad66b466a0',
  cfDatabaseId: '704682fb-fcfd-4c41-b5aa-4da131295a6b',
  cfApiToken: process.env.CF_API_TOKEN,
  availityUrl: 'https://essentials.availity.com/cloud/public/onb/epdm/es/public/v1/payers-hipaa',
  REST_MODE: '10',  // string — API returns modeCode as string
  TX: {
    ELIG_270: [1],        // 270 Eligibility
    PA_OUT:   [6],        // 278 Outpatient PA / Service Review
    PA_IN:    [259, 436], // 278 Inpatient Auth (HCSC=259, Anthem=436)
    REF:      [138],      // 278 Referral (Note: Anthem does NOT use REST 138)
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

function parseRestRoutes(processingRoutes) {
  // modeCode and transactionTypeCode come as strings from the API
  const codes = (processingRoutes || [])
    .filter(r => String(r.modeCode) === CONFIG.REST_MODE)
    .map(r => Number(r.transactionTypeCode));

  return {
    has_270:    codes.some(c => CONFIG.TX.ELIG_270.includes(c)) ? 1 : 0,
    has_pa_out: codes.some(c => CONFIG.TX.PA_OUT.includes(c))  ? 1 : 0,
    has_pa_in:  codes.some(c => CONFIG.TX.PA_IN.includes(c))   ? 1 : 0,
    has_ref:    codes.some(c => CONFIG.TX.REF.includes(c))     ? 1 : 0,
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
  if (!data.success) throw new Error(`D1 error: ${JSON.stringify(data.errors)}`);
  return data.result[0];
}

async function getAllPrefixesFromD1() {
  const result = await d1Query(
    `SELECT DISTINCT availity_payer_ids, plan_name
     FROM prefixes
     WHERE availity_payer_ids IS NOT NULL AND availity_payer_ids != ''
     GROUP BY availity_payer_ids`
  );
  const idMap = {};
  (result.results || []).forEach(row => {
    row.availity_payer_ids.split(',').map(s => s.trim()).forEach(id => {
      idMap[id] = row.plan_name;
    });
  });
  return idMap;
}

async function queryAvailityPayer(ariesId) {
  const url = `${CONFIG.availityUrl}?limit=25&offset=0&platform=ARIES&q=${encodeURIComponent(ariesId)}&sortBy=name&sortDirection=asc`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) { log(`  HTTP ${res.status} for ${ariesId}`); return []; }
  const data = await res.json();
  return data.payers || [];
}

async function refreshAvailityData() {
  log('Starting Availity transaction support refresh...');
  if (!CONFIG.cfApiToken) throw new Error('CF_API_TOKEN not set');

  log('Loading Availity payer IDs from D1...');
  const idMap = await getAllPrefixesFromD1();
  const uniqueIds = Object.keys(idMap);
  log(`Found ${uniqueIds.length} unique Availity payer IDs`);

  // Group IDs back by their original comma-separated group
  const result = await d1Query(
    `SELECT DISTINCT availity_payer_ids, plan_name, has_270, has_pa_in, has_pa_out, has_ref
     FROM prefixes WHERE availity_payer_ids != '' GROUP BY availity_payer_ids`
  );
  const groups = result.results || [];

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
          const routes = parseRestRoutes(p.processingRoutes);
          api_270    = Math.max(api_270,    routes.has_270);
          api_pa_out = Math.max(api_pa_out, routes.has_pa_out);
          api_pa_in  = Math.max(api_pa_in,  routes.has_pa_in);
          api_ref    = Math.max(api_ref,    routes.has_ref);
        });
      } catch(e) {
        log(`  Error querying ${ariesId}: ${e.message}`);
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
      await d1Query(
        `UPDATE prefixes SET has_270=?, has_pa_in=?, has_pa_out=?, has_ref=?
         WHERE availity_payer_ids LIKE ?`,
        [api_270, api_pa_in, api_pa_out, api_ref, `%${ids[0]}%`]
      );
      log(`  ✅ ${group.plan_name}`);
      log(`     270: ${d1_270}→${api_270} | PA-IN: ${d1_pa_in}→${api_pa_in} | PA-OUT: ${d1_pa_out}→${api_pa_out} | REF: ${d1_ref}→${api_ref}`);
      updated.push({ plan: group.plan_name, ids: group.availity_payer_ids });
    } else {
      unchanged.push(group.plan_name);
    }
  }

  log(`\nAvaility refresh complete:`);
  log(`  Updated:   ${updated.length}`);
  log(`  Unchanged: ${unchanged.length}`);
  log(`  Errors:    ${errors.length}`);

  return { updated, unchanged, errors };
}

module.exports = { refreshAvailityData };

if (require.main === module) {
  refreshAvailityData()
    .then(() => process.exit(0))
    .catch(err => { console.error('Fatal:', err); process.exit(1); });
}
