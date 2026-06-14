#!/usr/bin/env node
// Builds public/data.json for the leave-coverage dashboard by joining the raw
// SFDC/BigQuery extracts in build/raw/ with the curated strategic-states.json.
// Read-only against the filesystem; re-run any time the raw extracts are refreshed.
//
// Customer definition (union of three signals, so a blank SFDC Type never hides a customer):
//   Type='Customer'  OR  has an Anthropic org UUID  OR  has a closed-won opp.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW = join(__dirname, "raw");
const OUT = join(__dirname, "..", "public", "data.json");

// ---- config (edit before deploy) -------------------------------------------
const GENERATED_AT = "2026-06-14";
const LEAVE = { start: "2026-07-01", end: "2026-08-31", label: "July–August 2026" };
// Who to ping if something is urgent and the covering colleague is unsure.
const ESCALATION = { name: "", email: "" };
// ----------------------------------------------------------------------------

const read = (f) => JSON.parse(readFileSync(join(RAW, f), "utf8"));
const accounts = read("accounts.json");
const openOpps = read("open_opps.json");
const contacts = read("contacts.json");
const wonAccts = read("won_accounts.json");
const q3 = read("q3_opps.json");
const orgUuids = read("org_uuids.json");
const strategicStates = JSON.parse(
  readFileSync(join(__dirname, "strategic-states.json"), "utf8")
);

const wonSet = new Set(wonAccts.map((w) => w.AccountId));
const orgsByAcct = new Map();
for (const o of orgUuids) {
  if (!orgsByAcct.has(o.account_id)) orgsByAcct.set(o.account_id, []);
  orgsByAcct.get(o.account_id).push({ uuid: o.organization_uuid, name: o.organization_name });
}
const contactsByAcct = new Map();
for (const c of contacts) {
  if (!contactsByAcct.has(c.AccountId)) contactsByAcct.set(c.AccountId, []);
  contactsByAcct.get(c.AccountId).push({
    name: [c.FirstName, c.LastName].filter(Boolean).join(" ").trim(),
    title: c.Title || "",
    email: c.Email || "",
    phone: c.Phone || "",
  });
}
const oppsByAcct = new Map();
const closesDuringLeave = (d) => d && d >= LEAVE.start && d <= LEAVE.end;
const mapOpp = (o) => ({
  name: o.Name,
  amount: o.Amount,
  stage: o.StageName,
  closeDate: o.CloseDate,
  type: o.Type,
  nextStep: o.NextStep || "",
  forecast: o.ForecastCategoryName,
  closesDuringLeave: closesDuringLeave(o.CloseDate),
});
for (const o of openOpps) {
  if (!oppsByAcct.has(o.AccountId)) oppsByAcct.set(o.AccountId, []);
  oppsByAcct.get(o.AccountId).push(mapOpp(o));
}

// domain helpers
const cleanDomain = (s) => {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();
};
const emailIndex = {};
const domainIndex = {};
const addDomain = (domain, id) => {
  if (!domain) return;
  if (!domainIndex[domain]) domainIndex[domain] = [];
  if (!domainIndex[domain].includes(id)) domainIndex[domain].push(id);
};

const built = accounts.map((a) => {
  const orgs = orgsByAcct.get(a.Id) || [];
  const acctContacts = contactsByAcct.get(a.Id) || [];
  const acctOpps = (oppsByAcct.get(a.Id) || []).sort((x, y) =>
    (x.closeDate || "9999").localeCompare(y.closeDate || "9999")
  );
  const signals = [];
  if (a.Type === "Customer") signals.push("SFDC Type=Customer");
  if (orgs.length) signals.push("Has Anthropic org");
  if (wonSet.has(a.Id)) signals.push("Closed-won opp");
  const isCustomer = signals.length > 0;

  const domain = cleanDomain(a.Website);
  addDomain(domain, a.Id);
  for (const c of acctContacts) {
    if (c.email) {
      emailIndex[c.email.toLowerCase()] = a.Id;
      addDomain(cleanDomain(c.email.split("@")[1]), a.Id);
    }
  }

  return {
    id: a.Id,
    name: a.Name,
    status: isCustomer ? "Customer" : "Prospect",
    isCustomer,
    customerSignals: signals,
    sfdcType: a.Type,
    state: a.BillingState || "",
    sector: a.Sector__c || "",
    website: a.Website || "",
    domain,
    orgs,
    contacts: acctContacts,
    openOpps: acctOpps,
  };
});

const byName = (x, y) => x.name.localeCompare(y.name);
const customers = built.filter((a) => a.isCustomer).sort(byName);

const q3Opps = q3
  .map((o) => ({ ...mapOpp(o), account: o.AccountName, accountId: o.AccountId }))
  .sort((x, y) => (x.closeDate || "").localeCompare(y.closeDate || ""));

const data = {
  generatedAt: GENERATED_AT,
  leaveWindow: LEAVE,
  escalation: ESCALATION,
  counts: {
    accounts: built.length,
    customers: customers.length,
    openOpps: openOpps.length,
    q3Opps: q3Opps.length,
    leaveWindowOpps: q3Opps.filter((o) => o.closesDuringLeave).length,
  },
  accounts: built.sort(byName),
  customers: customers.map((c) => c.id),
  strategicStates,
  q3Opps,
  emailIndex,
  domainIndex,
};

writeFileSync(OUT, JSON.stringify(data, null, 2));
console.log(
  `Wrote ${OUT}\n` +
    `  accounts: ${data.counts.accounts}\n` +
    `  customers: ${data.counts.customers}\n` +
    `  open opps: ${data.counts.openOpps}  (Q3: ${data.counts.q3Opps}, during leave: ${data.counts.leaveWindowOpps})\n` +
    `  email index: ${Object.keys(emailIndex).length}  domains: ${Object.keys(domainIndex).length}`
);
