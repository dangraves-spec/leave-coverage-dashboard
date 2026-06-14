# Dan's Survival Guide — a leave-coverage account dashboard

A single-page internal dashboard that lets colleagues cover a sales rep's accounts
while they're on leave. Someone gets an email from one of the rep's agencies, pastes
the sender's address into the dashboard, and immediately sees who they are, whether
they're a customer, the account's org ID, key contacts, and any open deals — so they
can help without digging through Salesforce.

Built in an afternoon with [Claude Code](https://claude.com/claude-code) and deployed
to an internal, SSO-gated app platform. This public repo is a sanitized showcase: all
real account data is excluded and replaced with synthetic sample data (see
[Data & privacy](#data--privacy)).

> _Tip: drop a screenshot at `docs/screenshot.png` and reference it here for a stronger portfolio page._

## The problem

Going on family leave means handing ~150 accounts to colleagues who already have full
books of their own. The goal wasn't a CRM replacement — it was the opposite: the fastest
possible "who is this and what do I need to know" lookup, with zero training, so helping
out costs a teammate seconds rather than minutes.

## What it does

- **Email/domain lookup (the hero):** paste a sender's email or domain, or type an agency
  or person's name → instant account card with customer/prospect status, **org UUID
  (one-click copy)**, key contacts, and open opportunities.
- **Customers tab:** every current customer at a glance.
- **Strategic states tab:** priority states with a short posture summary, key accounts, and contacts.
- **Q3 opportunities tab:** open deals closing during the leave window, flagged so coverage
  knows what can't wait.

## How it works

```
public/
  index.html          # the whole app — hand-written HTML + CSS + JS, no framework
  data.json           # generated snapshot (gitignored — real data)
  data.sample.json    # synthetic sample the app falls back to (committed)
build/
  raw/*.json          # raw Salesforce/BigQuery extracts (gitignored)
  strategic-states.json        # curated state notes (gitignored — real)
  strategic-states.sample.json # sample (committed)
  generate-data.mjs   # joins the raw extracts into public/data.json + builds the search index
```

**Static snapshot, not live queries.** The page reads a pre-generated `data.json` baked
at build time. That was a deliberate design choice for a leave-coverage tool: it works
identically for every viewer regardless of their individual data-system access, and it
can't silently break while the owner is unreachable. The build script (`generate-data.mjs`)
is the only thing that touches source systems, and it runs read-only.

**Resilient customer detection.** A naive `Type = 'Customer'` filter is unreliable — in
this dataset the field was blank for nearly every real customer. So an account is treated
as a customer if **any** of three signals holds: marked Customer in the CRM, has a
provisioned product org, *or* has a closed-won deal. The union is what makes the customer
list trustworthy.

**Zero-dependency search index.** At build time the script maps every contact email and
account domain to an account, so the browser-side lookup is an O(1) index hit (with a
fuzzy name fallback) — no search service, no backend.

## Run it locally

No build step, no dependencies. The committed sample data makes it work out of the box:

```bash
cd public
python3 -m http.server 8000
# open http://localhost:8000  → runs on data.sample.json
```

To generate a real snapshot from your own data, produce the `build/raw/*.json` extracts
in the documented shapes and run:

```bash
node build/generate-data.mjs   # writes public/data.json
```

## Tech

- Plain HTML/CSS/JS single file — intentionally no framework or build tooling
- Node (ESM) data-generation script
- Data sourced from Salesforce + a product org-UUID mapping
- Deployed to an internal SSO/IAP-gated static host (Antspace Orbit)

## Data & privacy

This repository contains **no real account data**. The real `data.json`, the raw CRM
extracts in `build/raw/`, and the curated state notes are all gitignored. Everything
visible here — agencies, people, UUIDs, deals — is **synthetic and fictional**, created
only to demonstrate the app. The live dashboard is internal-only and gated behind
employee SSO.

## License

MIT — see [LICENSE](LICENSE).
