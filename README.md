# 🏥 BCBS Home State Identifier

**Instantly identify the Home State BCBS plan for any Blue Cross Blue Shield member — and check Availity REST API transaction support before you submit.**

🔗 **[Open the tool →](https://arcane-owl-97.github.io/bcbs-identifier/)**

---

## What problem does this solve?

If you've ever submitted a Prior Authorization or referral for a BCBS member and had it bounce back because you sent it to the wrong plan — this tool is for you.

BCBS isn't one company. It's 33+ independent plans across all 50 states. When a member from Massachusetts walks into a provider in California, you need to submit PA to **their home plan** (BCBS of Massachusetts), not the local plan. The 3-character prefix at the start of every BCBS member ID tells you exactly which home plan that is.

This tool maps all **17,720 BCBS alpha prefixes** to their correct home state plans — and tells you which Availity REST API transactions (270 eligibility, 278 PA, 278 referral, 275 attachments) each plan supports.

---

## Who is this for?

- **Auth coordinators & PA staff** — quickly identify the right plan before submitting
- **RCM & billing teams** — reduce PA rejections from wrong-plan submissions
- **Health IT developers** — free API for integrating BCBS routing logic into your workflows
- **Anyone building on the BCBS ecosystem** — use it as a reference for payer configuration

---

## Features

| Feature | Details |
|---|---|
| **Subscriber Lookup** | Enter any BCBS member ID — get the home plan, state, and Availity transaction support instantly |
| **Plan Directory** | Browse all 68 BCBS plans, filter by state and transaction type (270, 278 IP/OP, Ref, 275) |
| **Prefix Search** | Look up all prefixes assigned to any plan — grouped alphabetically |
| **Flag incorrect data** | See something wrong? Submit feedback directly from the result |
| **Free API** | All lookups are powered by a public REST API — use it in your own tools |

---

## Free API

Every lookup on this tool is backed by a public API you can use directly:

```
GET https://project-1.arcaneowl.workers.dev/lookup?prefix=WSJ
```

**Example response:**
```json
{
  "prefix": "WSJ",
  "plan_name": "Anthem Blue Cross",
  "state": "CA",
  "prefix_count": 1127,
  "availity_payer_ids": "040",
  "transactions": {
    "eligibility_270": true,
    "pa_inpatient_278": true,
    "pa_outpatient_278": true,
    "referral_278": true,
    "attachments_275": true
  }
}
```

**Available endpoints:**

| Endpoint | Description |
|---|---|
| `GET /lookup?prefix=WSJ` | Look up a single prefix |
| `GET /plans?state=CA&search=anthem` | Browse plans with optional filters |
| `GET /prefix-search?q=WS` | Find all prefixes starting with a query |
| `GET /prefixes?plan=Anthem+Blue+Cross` | Get all prefixes for a specific plan |
| `POST /feedback` | Submit a data correction |
| `GET /health` | Health check |

> Rate limited to 300 requests/hour per IP to keep it free for everyone.

---

## Data & accuracy

- **17,720 prefixes** mapped to **68 BCBS plans** across all 50 states + Puerto Rico
- Source: BCBS Association planfinder (March 2026)
- Availity transaction support sourced from Availity payer configuration data
- Database is **automatically updated quarterly** via a scheduled scraper — any new or changed prefix assignments are detected and applied automatically
- Always verify PA submission requirements directly with the payer or via Availity before submitting transactions
- This tool does not process, store, or transmit any Protected Health Information (PHI)
- Not affiliated with the Blue Cross Blue Shield Association or Availity

---

## How BCBS prefix routing works

Every BCBS member ID starts with a 3-character alpha prefix (e.g., `WSJ`, `XQA`, `A2P`). This prefix identifies the member's **home plan** — the plan that holds their benefits and adjudicates their PA requests — regardless of where in the country the provider is located.

This matters because:
- PA must be submitted to the **home plan**, not the local/host plan
- Each BCBS plan has its own PA requirements, clinical criteria, and submission channels
- Getting the home plan wrong is one of the most common causes of PA rejection for BCBS members

The BlueCard program handles claims routing between plans, but PA routing is the provider's responsibility.

---

## Feedback & corrections

Found a prefix mapped to the wrong plan? Availity payer ID looks wrong? Click **⚑ Flag incorrect data** on any result to submit a correction. All feedback goes directly to the maintainer for review.

---

## Built with

- **Frontend:** HTML/CSS/JS hosted on GitHub Pages (free)
- **API:** Cloudflare Workers + D1 (free tier)
- **Data sync:** GitHub Actions quarterly scraper → Cloudflare D1
- **Email alerts:** Resend (free tier)
- Zero ongoing infrastructure cost

---

*Built by [@arcane-owl-97](https://github.com/arcane-owl-97) to help provider organizations route BCBS PA submissions correctly. Free forever.*
