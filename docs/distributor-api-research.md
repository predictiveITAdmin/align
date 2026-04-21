# Distributor API Research — Order Management Module

**Status:** Research complete (2026-04-21), ready for action
**Context:** Supports [`order-management-spec.md`](./order-management-spec.md)

Per-distributor findings + recommended build order + action items Jason
needs to take to unlock API access.

---

## TL;DR — Start Ingram Micro TODAY

| Distributor | Ease | Lead Time | Cost | Webhooks | SDK | Verdict |
|---|---|---|---|---|---|---|
| **Ingram Micro Xvantage** | 🟢 Easy | ~2 business days | Free | ✅ Yes | Node.js, Python, C#, Java, Go | **START HERE** |
| **TD Synnex** | 🟡 Medium | Unknown (email-based) | Unclear | ❓ | Community only | **Second priority** |
| **Amazon Business** | 🔴 Hard | **4-6 weeks** | Free but complex | ✅ via SNS | None official | **Start now in parallel** — long lead |
| **Provantage** | 🔴 Hard | Unknown | Unknown | ❓ | None | **Needs direct sales contact** |
| **QuickBooks Online** | 🟢 Easy | Instant | Free dev, paid prod | ✅ CloudEvents | Node.js official | **Setup early — blocks QBO writeback** |

---

## 1. Ingram Micro Xvantage — 🥇 PRIMARY

### Overview
Ingram's modern "Xvantage" platform (launched 2024) exposes a full REST API
called XI (Xvantage Integration). This is the **cleanest, best-documented
distributor API of the four** and the right one to build first.

### Endpoints available (from GitHub OpenAPI spec)
- **Products** — price & availability, search, details
- **Orders** — create (v6/v7), modify, get detail, search, cancel
- **Quotes** — search, detail, quote-to-order validation
- **Invoicing** — search + detail
- **Renewals** — renewal opportunities (not critical for hardware)
- **Deals** — deal registration (not critical)
- **Returns** — create + track
- **Freight Estimates** — shipping cost preview
- **Webhooks** — **order status + stock availability** (✅ essential)

### Webhook events (critical for our use case)
- `im::order_shipped` — payload includes shipment date, warehouse ID, carrier
  code, **tracking numbers**, line details
- Order status change events
- Recommendation: one dedicated webhook endpoint per resource type

### Auth
OAuth 2.0 — client_id / client_secret exchanged for bearer token

### Access process (TAKE THIS ACTION NOW)
1. Sign up at https://developer.ingrammicro.com/
2. Link your existing Ingram Micro reseller account (Jason's partner account)
3. Ingram approves the dev account for API access — **~2 business days**
4. Sandbox is pre-loaded with test SKUs, orders, invoices
5. Production API keys issued after sandbox testing

### Pricing
**Free** for all Ingram Micro partners.

### SDKs available
- Node.js (NPM) ← this is what we'd use
- Python (PyPI)
- C# (NuGet)
- Java (Maven)
- Go (Go modules)

Node SDK: `ingrammicro-xvantage/xi-sdk-resellers-node`

### Base URLs
- Production: `https://api.ingrammicro.com:443/`
- Sandbox: separate URL provided during onboarding

### Recommended build approach
Use the official Node.js SDK. Subscribe to the `im::order_shipped` webhook
for push-based updates. Poll `/orders` on our hourly schedule as fallback
for anything missed.

**Action for Jason:** Sign up on developer.ingrammicro.com today. I'll start
building the adapter skeleton against the OpenAPI spec in parallel so we
can drop in real credentials when approved.

---

## 2. TD Synnex — 🥈 SECONDARY

### Overview
TD Synnex has **TWO distinct API platforms** — critically, only one is
relevant for hardware:

| Platform | Scope | Relevant? |
|---|---|---|
| **StreamOne ION** | Cloud/SaaS/subscription | ❌ No — software only |
| **ECExpress Web Services + Digital Bridge REST** | Hardware product orders | ✅ Yes — this one |

This is the confusing bit the spec warned about — "most marketed APIs are
for software" applies here. **Use ECExpress/Digital Bridge, NOT StreamOne
ION, for hardware.**

### Endpoints available (ECExpress/Digital Bridge)
- **Product Price & Availability (P&A)** — live pricing + stock
- **Purchase Order submission** — place orders
- **Order Status query** — PO status lookup
- **Order tracking** — shipment / delivery info
- Invoicing (separate negotiation likely)

### Auth
Not fully documented publicly — likely API key or basic auth depending
on platform variant. Need the developer onboarding to confirm.

### Access process (TAKE THIS ACTION)
1. Email **helpdeskus@tdsynnex.com** with subject
   **"Register for Price & Availability (PA) API access"**
2. TD Synnex responds with onboarding instructions
3. Register / activate on Digital Bridge portal
4. Sandbox API keys provided, Swagger for testing

Timeline unclear — depends on response time from helpdesk.

### SDKs
No official SDK. Community repo `cloudmindsab/td-synnex` has scripts and
integrations for StreamOne ION — not ECExpress. **We'll write our own
adapter from OpenAPI/Swagger docs.**

### Pricing
Not publicly stated — likely included with reseller partner agreement.

### Notes
- SparkShipping, D-Tools, and other tools have Synnex integrations — we
  can validate our adapter against their behavior if needed.
- Rewst documentation has a Synnex Stellr integration guide (Stellr =
  a specific Synnex API subset, may or may not overlap with what we need).

**Action for Jason:** Send the helpdeskus@tdsynnex.com email today.

---

## 3. Amazon Business — 🥉 LONG LEAD, START EARLY

### Overview
**Critical distinction:** Amazon has two API families people confuse:
- **SP-API (Selling Partner API)** — for SELLERS on Amazon Marketplace.
  **Not our use case** despite many docs using this term.
- **Amazon Business APIs** — for corporate BUYERS and their purchasing
  systems. **This IS our use case.**

### Endpoints available (Amazon Business)
- **Ordering API** — place orders programmatically from purchasing system
- **Orders retrieval** — get order information, expected delivery, tracking
  ID, carrier name
- **Reports API** — bulk export for reconciliation
- **User Management API** — manage groups and users on AB account
- **buyer.buyerPurchaseOrderNumber** field — the PO we put at checkout is
  exposed via API, critical for matching back to our Autotask Opp

### Auth
Complex — LWA (Login with Amazon) + OAuth 2.0 + AWS IAM role assumed
via STS. Full SP-API-style auth model.

### Access process (START NOW — 4-6 weeks)
1. Must have an **active Amazon Business account** (pitadmin likely does)
2. Register for **Solution Provider Portal (SPP)**
3. Submit developer profile request
4. Create app client in SPP
5. Authorize the app for your Amazon Business account
6. Request role `AmazonBusinessOrderPlacement` (for placing orders) and
   order-read roles for reading
7. Configure AWS SNS for push notifications
8. Test + certify (Amazon reviews each integration)

**Total timeline: 4-6 weeks** per Amazon's own docs.

### SDKs
No official SDK. SP-API samples on amzn/selling-partner-api-samples GitHub
are a starting reference.

### Critical note
Amazon Business API integration **requires users + groups** to be configured
in the purchasing system before the Ordering API will route orders. This
means part of the prep work before the first order.

**Action for Jason:** Decide if we go this deep on Amazon Business. If yes,
start the SPP registration THIS WEEK — the calendar lead time is the
limiting factor. If volume is low, an alternative is **manual CSV export**
from Amazon Business (users can export order history) and a small importer
tool in Align. Let me know which path.

---

## 4. Provantage — 🚫 NO PUBLIC API

### Overview
Provantage is a smaller distributor with **no publicly documented API**
for resellers. Research surfaces:
- Customer order status page (for end-customer tracking only)
- AfterShip integration for tracking alerts (third-party, not API)
- No developer portal, no Swagger, no public documentation

### Options

**Option A — Direct contact**
Ask the Provantage account rep if they offer EDI or API access for
resellers. Many mid-tier distributors have partner integrations on request
that aren't publicly marketed.

**Option B — AfterShip webhook**
Provantage customers can register orders with AfterShip and get tracking
updates. Align could subscribe to AfterShip's webhook → pull tracking events
back. Limited data (just tracking, no order details / line items).

**Option C — Email parsing**
Provantage sends PO confirmation + shipment emails. A forwarding address
with AI-based email-to-structured-data parsing could extract PO #, order
ID, tracking. Higher maintenance, brittle.

**Option D — Scrape order status page**
Login + scrape the order status portal. Brittle, breaks when they change UI.

**Option E — Skip in v1**
Handle Provantage orders manually, don't automate them. Add a "manual
order entry" UI in Align for distributors without APIs.

**Recommendation:** Start with **Option A** (ask them). If no API available,
**Option E** (manual entry) is cleanest for v1. Revisit if volume justifies
engineering effort for parsing/scraping.

**Action for Jason:** Call / email your Provantage account rep and ask:
"Do you have API or EDI integration for resellers to pull order status,
tracking, and serial numbers?" Paste their response back here and we'll
pick a path.

---

## 5. QuickBooks Online — 🟢 READY NOW

### Overview
Intuit has mature REST APIs with OAuth 2.0 and native Node.js SDK.
The QBO integration is not for reading distributor data — it's for
**writing received-quantity updates to QBO POs** so accounting can
reconcile vendor bills.

### Endpoints relevant to Order Management

**PurchaseOrder entity:**
- Read: `GET /v3/company/<realmId>/purchaseorder/<po_id>`
- Update: `POST /v3/company/<realmId>/purchaseorder` (with SyncToken)
- Query: `GET /v3/company/<realmId>/query?query=...`

**Bill entity (QBO's receiving model):**
- In QBO, you don't have a separate "receive" step like Desktop. You
  convert a PO to a Bill (or Expense/Check) directly. Partial billing
  supported — QBO auto-closes PO when all lines consumed.
- Our flow on delivery confirmation: create a Bill against the PO with
  received quantities. Or just update the PO status if accounting prefers
  to do bill entry themselves.

**ItemReceipt:** QBO Desktop has this as a separate entity. QBO online
does NOT — just uses Bills with link to PO.

### Auth
OAuth 2.0 Authorization Code Flow. Refresh token valid 100 days;
rolling refresh extends indefinitely if used.

### Access process
1. Create an app in Intuit Developer portal (free developer account)
2. Get client_id + client_secret for sandbox
3. Build OAuth connect flow → user authorizes your app to their QBO
4. Get `realmId` (QBO company ID) + access + refresh tokens
5. Production app requires production keys (separate request, typically
   same day)

### SDK
Official Node.js SDK: `node-quickbooks` or `intuit-oauth` from Intuit.

### Important 2026 change
Webhook format migrating to **CloudEvents after May 15, 2026**. New
integrations should build against CloudEvents format directly.

### Concurrency
QBO uses **SyncToken** for optimistic locking. When updating an entity,
include the current SyncToken. If stale (someone else changed it in QBO),
the update is rejected and you must re-fetch + retry.

### Notes
- Rate limits: 500 requests/minute per realm. Reasonable.
- PO → Bill matching works on `LinkedTxn` field.

**Action for Jason:** Create a free Intuit Developer account (if not
already). Register an app. I'll use sandbox creds for Phase E build;
you swap in production creds when the module goes live.

---

## Action Plan — What Jason Does This Week

| # | Action | Est Time | Blocks | Owner |
|---|---|---|---|---|
| 1 | Sign up at developer.ingrammicro.com and authorize reseller account | 10 min | Ingram adapter build | Jason |
| 2 | Email helpdeskus@tdsynnex.com re: PA API access | 5 min | Synnex adapter build | Jason |
| 3 | Decide Amazon Business path: full API (start SPP registration) OR manual CSV import | — | Amazon adapter | Jason |
| 4 | Call/email Provantage account rep re: API/EDI availability | 15 min | Provantage decision | Jason |
| 5 | Create Intuit Developer account + sandbox app | 15 min | QBO writeback build | Jason |

Total Jason-effort: ~30-45 min (plus 4-6 weeks of Amazon waiting if chosen).

## Build Sequence (once access is granted)

1. **Phase A** — Autotask Opp/Quote sync foundation (no distributor access
   needed; can start today)
2. **Phase B1** — Ingram Micro adapter + matcher (starts as soon as Ingram
   approves — ~2 days)
3. **Phase B2** — Manual PO Mapper UI (parallel with Phase B1)
4. **Phase C** — TD Synnex adapter (when access granted)
5. **Phase D** — QBO writeback (can start as soon as Intuit sandbox ready)
6. **Phase E** — Amazon Business (when onboarding completes, ~5 weeks out)
7. **Phase F** — Provantage (manual entry UI OR whatever path we pick)
8. **Phase G** — Customer portal + assets
9. **Phase H** — Reports

## What I can start TODAY without any distributor access

- Phase A: Autotask Opportunities + Quotes + QuoteItems sync. Pulls from
  existing Autotask service. Creates the data layer the distributor
  matcher will hook into.
- Build the skeleton distributor adapter interface in
  `src/services/distributors/index.js` so individual distributor adapters
  just implement the common shape.
- Build the Orders list page UI stub using mock data, then swap in real
  data as distributor adapters come online.
- Build the PO Mapper UI against the Autotask Opp PO array (ADR-003).
- Build the QBO OAuth + PO read stubs against Intuit sandbox (doesn't
  require production credentials to start).

This sequence lets us make 1-2 weeks of progress while waiting for
distributor access, then drop adapters in as each one comes online.

## Sources

- [Ingram Micro Developer Portal](https://developer.ingrammicro.com/)
- [Ingram Micro Xvantage OpenAPI spec (GitHub)](https://github.com/ingrammicro-xvantage/xi-sdk-openapispec)
- [Ingram Reseller API Overview](https://developer.ingrammicro.com/reseller/getting-started/api-overview)
- [Ingram Order Status Notification Event](https://developer.ingrammicro.com/reseller/api-documentationss/order-status-notification-events)
- [TD Synnex ECExpress](https://ec.synnex.com/ecx/)
- [TD Synnex Digital Bridge](https://www.tdsynnex.com/na/us/digital-bridge/)
- [TD Synnex ECExpress for MSPs](https://www.tdsynnex.com/na/us/smbconnect/resources/ecexpress/)
- [Community TD Synnex scripts](https://github.com/cloudmindsab/td-synnex)
- [Amazon Business Ordering API](https://developer-docs.amazon.com/amazon-business/docs/ordering-api)
- [Amazon Business Onboarding](https://developer-docs.amazon.com/amazon-business/docs/onboarding-overview)
- [Amazon Business API Roles](https://developer-docs.amazon.com/amazon-business/docs/amazon-business-roles)
- [Amazon Business Orders Use Case Guide](https://developer-docs.amazon.com/sp-api/docs/amazon-business-orders-use-case-guide)
- [QuickBooks Online PurchaseOrder API](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/purchaseorder)
- [QuickBooks API Developer Overview](https://developer.intuit.com/app/developer/qbo/docs/develop)
- [Working with Partial Purchase Orders in QBO](https://www.dummies.com/article/technology/software/money-management-software/quickbooks/working-partial-purchase-orders-quickbooks-online-252429/)
