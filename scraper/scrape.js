// ═══════════════════════════════════════════════════════════════════════════
// BCBS Prefix Scraper — Quarterly automated sync
// Runs via GitHub Actions, updates Cloudflare D1, sends email via Resend
// ═══════════════════════════════════════════════════════════════════════════

const puppeteer = require('puppeteer');
const fetch = require('node-fetch');

// ─── CONFIG ────────────────────────────────────────────────────────────────
const CONFIG = {
  // Scraper settings
  delayMs: 200,
  batchSize: 50,
  testMode: process.argv.includes('--test'),
  testPrefixes: ['WSJ', 'ABC', 'AAA', 'ZZZ', 'XQA', 'RAA', 'FEP', 'BCA', 'A2A', 'YEP',
                 'WSA', 'WSB', 'WSC', 'WSD', 'WSE', 'WSF', 'WSG', 'WSH', 'WSI', 'WSK'],

  // Cloudflare D1
  cfAccountId: '90652237702a9ed8d5bd48ad66b466a0',
  cfDatabaseId: '704682fb-fcfd-4c41-b5aa-4da131295a6b',
  cfApiToken: process.env.CF_API_TOKEN,

  // Resend email
  resendApiKey: process.env.RESEND_API_KEY,
  alertEmail: 'abhishek.chauhan.work97@gmail.com',
  fromEmail: 'onboarding@resend.dev',

  // BCBS API
  bcbsUrl: 'https://www.bcbs.com/planfinder/prefix'
};

// ─── UTILITIES ─────────────────────────────────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

// Generate all 3-letter alpha prefixes AAA–ZZZ
function generateAllPrefixes() {
  const prefixes = [];
  for (let i = 65; i <= 90; i++)
    for (let j = 65; j <= 90; j++)
      for (let k = 65; k <= 90; k++)
        prefixes.push(String.fromCharCode(i, j, k));
  return prefixes;
}

// ─── D1 HELPERS ────────────────────────────────────────────────────────────
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
  const result = await d1Query('SELECT alpha_prefix, plan_name FROM prefixes ORDER BY alpha_prefix ASC');
  const map = {};
  (result.results || []).forEach(row => { map[row.alpha_prefix] = row.plan_name; });
  return map;
}

async function upsertPrefix(prefix, planName, state, count, url, pids, h270, hPaIn, hPaOut, hRef, h275) {
  await d1Query(
    `INSERT OR REPLACE INTO prefixes 
     (alpha_prefix, plan_name, state, prefix_count, website_url, availity_payer_ids, 
      has_270, has_pa_in, has_pa_out, has_ref, has_275)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [prefix, planName, state, count, url, pids, h270, hPaIn, hPaOut, hRef, h275]
  );
}

async function deletePrefix(prefix) {
  await d1Query('DELETE FROM prefixes WHERE alpha_prefix = ?', [prefix]);
}

// ─── BCBS SCRAPER (runs inside Puppeteer page context) ────────────────────
async function scrapePrefixes(page, prefixes) {
  const results = {};
  let done = 0;

  for (const prefix of prefixes) {
    try {
      const data = await page.evaluate(async (pfx, url) => {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ prefix: pfx })
        });
        if (!r.ok) return null;
        return await r.json();
      }, prefix, CONFIG.bcbsUrl);

      if (data && Array.isArray(data) && data.length > 0) {
        results[prefix] = data[0]; // take first plan
        log(`  ✅ ${prefix} → ${data[0].name}`);
      } else {
        results[prefix] = null; // unassigned
      }
    } catch (e) {
      log(`  ❌ ${prefix} → Error: ${e.message}`);
      results[prefix] = null;
    }

    done++;
    if (done % CONFIG.batchSize === 0) {
      log(`  Progress: ${done}/${prefixes.length} (${Math.round(done/prefixes.length*100)}%)`);
    }
    await delay(CONFIG.delayMs);
  }

  return results;
}

// ─── EMAIL ─────────────────────────────────────────────────────────────────
async function sendEmail(subject, htmlBody) {
  if (!CONFIG.resendApiKey) { log('No RESEND_API_KEY — skipping email'); return; }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CONFIG.resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: CONFIG.fromEmail,
      to: CONFIG.alertEmail,
      subject,
      html: htmlBody
    })
  });

  const data = await res.json();
  if (res.ok) {
    log(`Email sent: ${data.id}`);
  } else {
    log(`Email failed: ${JSON.stringify(data)}`);
  }
}

function buildEmailHtml(added, changed, removed, totalPrefixes, runDate) {
  const hasChanges = added.length > 0 || changed.length > 0 || removed.length > 0;

  let html = `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111">
    <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:24px;border-radius:8px 8px 0 0">
      <h1 style="color:#fff;margin:0;font-size:20px">BCBS Prefix Database Update</h1>
      <p style="color:rgba(255,255,255,.8);margin:6px 0 0;font-size:13px">
        Quarterly scrape completed — ${runDate}
      </p>
    </div>
    <div style="background:#f8fafc;padding:20px;border:1px solid #e5e7eb;border-top:none">
      <p style="margin:0 0 16px;font-size:14px;color:#374151">
        Total prefixes in database: <strong>${totalPrefixes.toLocaleString()}</strong>
      </p>`;

  if (!hasChanges) {
    html += `<div style="background:#dcfce7;border:1px solid #bbf7d0;border-radius:6px;padding:14px;font-size:14px;color:#15803d">
      ✅ No changes detected. Database is up to date.
    </div>`;
  } else {
    html += `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:14px;font-size:14px;color:#92400e;margin-bottom:16px">
      ⚠️ ${added.length + changed.length + removed.length} change(s) detected and applied automatically.
    </div>`;
  }

  if (added.length > 0) {
    html += `<h3 style="color:#15803d;font-size:14px;margin:16px 0 8px">✅ ${added.length} New Prefix${added.length > 1 ? 'es' : ''} Added</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="background:#f1f5f9"><th style="padding:6px 10px;text-align:left">Prefix</th><th style="padding:6px 10px;text-align:left">Plan</th></tr>`;
    added.forEach(({prefix, plan}) => {
      html += `<tr><td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-weight:700">${prefix}</td><td style="padding:6px 10px;border-bottom:1px solid #f1f5f9">${plan}</td></tr>`;
    });
    html += `</table>`;
  }

  if (changed.length > 0) {
    html += `<h3 style="color:#d97706;font-size:14px;margin:16px 0 8px">⚠️ ${changed.length} Prefix Mapping${changed.length > 1 ? 's' : ''} Changed</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="background:#f1f5f9"><th style="padding:6px 10px;text-align:left">Prefix</th><th style="padding:6px 10px;text-align:left">Was</th><th style="padding:6px 10px;text-align:left">Now</th></tr>`;
    changed.forEach(({prefix, oldPlan, newPlan}) => {
      html += `<tr><td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-weight:700">${prefix}</td><td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;color:#dc2626">${oldPlan}</td><td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;color:#15803d">${newPlan}</td></tr>`;
    });
    html += `</table>`;
  }

  if (removed.length > 0) {
    html += `<h3 style="color:#dc2626;font-size:14px;margin:16px 0 8px">❌ ${removed.length} Prefix${removed.length > 1 ? 'es' : ''} Removed</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="background:#f1f5f9"><th style="padding:6px 10px;text-align:left">Prefix</th><th style="padding:6px 10px;text-align:left">Was Mapped To</th></tr>`;
    removed.forEach(({prefix, oldPlan}) => {
      html += `<tr><td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-weight:700">${prefix}</td><td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;color:#dc2626">${oldPlan}</td></tr>`;
    });
    html += `</table>`;
  }

  html += `
    </div>
    <div style="padding:14px 20px;background:#f1f5f9;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;font-size:12px;color:#6b7280">
      This is an automated alert from the BCBS Home State Identifier scraper.<br>
      Database changes have been applied automatically to Cloudflare D1.<br>
      View the tool: <a href="https://arcane-owl-97.github.io/bcbs-identifier/" style="color:#2563eb">arcane-owl-97.github.io/bcbs-identifier</a>
    </div>
  </div>`;

  return html;
}

// ─── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  const runDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  log(`BCBS Prefix Scraper starting — ${runDate}`);
  log(`Mode: ${CONFIG.testMode ? 'TEST' : 'FULL'}`);

  // Validate env vars
  if (!CONFIG.cfApiToken) throw new Error('CF_API_TOKEN not set');
  if (!CONFIG.resendApiKey) log('Warning: RESEND_API_KEY not set — email will be skipped');

  // Step 1 — Get current D1 state
  log('Loading current prefixes from D1...');
  const currentD1 = await getAllPrefixesFromD1();
  log(`D1 has ${Object.keys(currentD1).length} prefixes`);

  // Step 2 — Launch browser and scrape BCBS
  log('Launching browser...');
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  log('Navigating to BCBS planfinder...');
  await page.goto('https://www.bcbs.com/planfinder/prefix', { waitUntil: 'networkidle2', timeout: 30000 });

  const prefixesToScrape = CONFIG.testMode ? CONFIG.testPrefixes : generateAllPrefixes();
  log(`Scraping ${prefixesToScrape.length} prefixes...`);

  const scraped = await scrapePrefixes(page, prefixesToScrape);
  await browser.close();
  log('Browser closed');

  // Step 3 — Diff: find added, changed, removed
  const added   = [];
  const changed = [];
  const removed = [];

  // Check scraped results against D1
  for (const [prefix, planData] of Object.entries(scraped)) {
    if (!planData) continue; // unassigned prefix — skip

    const newPlanName = planData.name;
    const existingPlan = currentD1[prefix];

    if (!existingPlan) {
      // New prefix not in D1
      added.push({ prefix, plan: newPlanName });
      const url = planData.urls?.general || planData.urls?.individualsFamilies || '';
      await upsertPrefix(prefix, newPlanName, '', 0, url, '', 0, 0, 0, 0, 0);
      log(`  Added: ${prefix} → ${newPlanName}`);
    } else if (existingPlan !== newPlanName) {
      // Plan mapping changed
      changed.push({ prefix, oldPlan: existingPlan, newPlan: newPlanName });
      await d1Query('UPDATE prefixes SET plan_name = ? WHERE alpha_prefix = ?', [newPlanName, prefix]);
      log(`  Changed: ${prefix} — ${existingPlan} → ${newPlanName}`);
    }
    // else: unchanged — no action needed
  }

  // Check for removed prefixes (only relevant in full mode)
  if (!CONFIG.testMode) {
    for (const [prefix, existingPlan] of Object.entries(currentD1)) {
      const stillExists = scraped[prefix] !== undefined && scraped[prefix] !== null;
      if (!stillExists && scraped[prefix] === null) {
        // Was in D1 but BCBS returns empty — prefix removed
        removed.push({ prefix, oldPlan: existingPlan });
        await deletePrefix(prefix);
        log(`  Removed: ${prefix} (was ${existingPlan})`);
      }
    }
  }

  // Step 4 — Summary
  const totalPrefixes = Object.keys(currentD1).length + added.length - removed.length;
  log(`\nScrape complete:`);
  log(`  Added:   ${added.length}`);
  log(`  Changed: ${changed.length}`);
  log(`  Removed: ${removed.length}`);
  log(`  Total prefixes: ${totalPrefixes}`);

  // Step 5 — Send email
  const hasChanges = added.length > 0 || changed.length > 0 || removed.length > 0;
  const subject = hasChanges
    ? `⚠️ BCBS Prefix Update — ${added.length} added, ${changed.length} changed, ${removed.length} removed`
    : `✅ BCBS Prefix Check — No changes (${runDate})`;

  const html = buildEmailHtml(added, changed, removed, totalPrefixes, runDate);
  await sendEmail(subject, html);

  log('Done.');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
