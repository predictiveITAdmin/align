# Align Platform — API Integrations Reference

All API connections used by the alignment platform — base URLs, auth methods, key endpoints, record counts.

Some APIs (Autotask, Datto RMM) are shared with Resolve — creds live in `/opt/resolve/.env` and are consumed by both services.

---

## 1. ScalePad / Lifecycle Manager X
- **Base:** `https://api.scalepad.com`
- **Auth:** `x-api-key` header
- **Records:** 104 clients, 1,826 HW assets, 4,703 opportunities, 10 assessment templates, 7 initiatives
- **Key endpoints:** `/core/v1/clients`, `/core/v1/assets/hardware`, `/lifecycle-manager/v1/assessments`, `/lifecycle-manager/v1/initiatives`, `/lifecycle-manager/v1/goals`
- **Docs:** https://developer.scalepad.com/reference

## 2. MyITProcess
- **Base:** `https://reporting.live.myitprocess.com/public-api/v1`
- **Auth:** `mitp-api-key` header
- **Records:** 28 clients, 80 reviews, 285 findings, 78 recommendations, 43 initiatives, 7 users
- **Notes:** Read-only API, no server-side filtering
- **Key endpoints:** `/clients`, `/reviews`, `/findings`, `/recommendations`, `/initiatives`, `/meetings`, `/users`

## 3. Autotask PSA
- **Base:** `https://webservices1.autotask.net/ATServicesRest/V1.0`
- **Auth:** 3 headers (`ApiIntegrationCode`, `UserName`, `Secret`)
- **Creds:** `/opt/resolve/.env` (`AUTOTASK_*`)
- **Key entities:** `ConfigurationItems` (107 fields — THE asset lifecycle entity), `Companies`, `Contacts`, `Tickets`, `Contracts`, `Products`, `Opportunities`, `Quotes`, `QuoteItems`
- **ConfigurationItems has:** serial numbers, warranty dates, manufacturer, model, RMM audit data, costs, 58 config types
- **Opportunities pagination:** AT returns HTTP 405 on GET for continuation pages — retry as POST to `nextUrl` (not the base query endpoint). This affects all paginated AT entities.
- **Resources endpoint:** `GET /Resources` — returns all active resources with `id`, `firstName`, `lastName`. Used to build a lookup map for resolving `assignedResourceID` → full name on Opportunities.
- **Opportunities sync note:** AT `status` field can lag behind actual deal state. Stage number is the authoritative source: stages 7–14 = won/closed, stage 15 = lost, stage 66 = junk (excluded from sync).

## 4. Datto RMM
- **Base:** `https://concord-api.centrastage.net`
- **Auth:** OAuth2 password grant with `public-client:public` Basic auth
- **Creds:** `/opt/resolve/.env` (`DATTO_RMM_*`)
- **Records:** 52 sites, 500+ devices
- **Key data:** hostname, OS, warrantyDate, AV status, patch status, UDFs (BitLocker, TPM)

## 5. IT Glue
- **Base:** `https://api.itglue.com`
- **Auth:** `x-api-key` header
- **Records:** 92 orgs, 3,720 configurations, 28,432 contacts, 25 flexible asset types, 52 domains, 220 locations, 125 manufacturers, 260 models
- **Key endpoints:** `/organizations`, `/configurations`, `/contacts`, `/flexible_assets` (needs type filter), `/flexible_asset_types`, `/locations`, `/domains`

## 6. SaaS Alerts
- **Base:** `https://us-central1-the-byway-248217.cloudfunctions.net/reportApi/api/v1`
- **Auth:** `api_key` header (the long base64 key, NOT the Partner ID)
- **Partner ID:** `y2OcDVtZfNb5ieyPs0Cu`
- **Records:** 30 customer orgs, 2,511 total accounts, 982 billable
- **Key data:** M365 license assignments per user (SKU GUIDs + human names), Google Workspace `isBillable`, security events
- **Has `mappedToPSA` field** linking customers to Autotask company IDs

## 7. Auvik
- **Base:** `https://auvikapi.us6.my.auvik.com/v1` (region us6!)
- **Auth:** HTTP Basic (`jason@predictiveit.com` + API key)
- **Records:** 8 tenants, network devices (firewalls, APs, switches with make/model/vendor)
- **Key data:** `deviceType`, `makeModel`, `vendorName`, `serialNumber`, `firmwareVersion`, `onlineStatus`, connected networks/interfaces

## 8. Customer Thermometer
- **Base:** `https://app.customerthermometer.com/api.php`
- **Auth:** `apiKey` query parameter
- **Records:** 7 thermometers, NPS: 85, Happiness: 100%
- **Key data:** per-response CSAT with company name, ticket number (`custom_1`), tech name (`custom_3`), temperature rating (1=Gold / 2=Green / 3=Yellow / 4=Red)
- **Response format:** XML
- **Thermometers:** "Autotask Survey - New" (208572), "Reactive Support Survey" (46408), "Employee NPS" (186877)

## 10. Dell Premier (Order Management)
- **Base:** `https://apigtwb2c.us.dell.com/PROD/v1`
- **Auth:** OAuth2 Client Credentials
- **Token URL:** `https://apigtwb2c.us.dell.com/auth/oauth/v2/token`
- **Key endpoint:** `GET /orders?fromOrderDate={ISO}&toOrderDate={ISO}&page={n}`
- **Sync strategy:** `date_range` — paginated, incremental since `last_sync_at`
- **Required credentials:** `client_id`, `client_secret` (from Dell Premier portal)
- **Optional:** `account_number` (to filter orders by account)
- **Status:** adapter built (`src/services/distributors/dell_premier.js`), awaiting credentials
- **To activate:** Settings → Suppliers → Add Supplier → "Dell Premier"; obtain creds from Dell account team

---

## 9. Strety (EOS) — DECISION: Build Custom Instead
- Strety has a beta API but limited coverage (Scorecard metrics + People only)
- Building custom EOS module: Rocks, Scorecard, To-Dos, Issues
- This allows linking Rocks to tech initiatives and Scorecard metrics to live API data

---

## Cross-Referencing

Client matching across all APIs uses **Autotask Company ID** as the canonical key:

- SaaS Alerts `mappedToPSA[].mappedTo` → Autotask Company ID
- ScalePad `record_lineage[].source_record_id` → Autotask/DattoRMM/ITGlue record IDs
- IT Glue `adapters-resources` → links to RMM/PSA records
- Datto RMM sites have `autotaskCompanyId` field
- Customer Thermometer: `company` matches client names, `custom_1` = Autotask ticket number
