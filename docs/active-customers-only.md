# Sync Rule — Active Customers Only

All API integrations must filter to **active + customer relationship type** only. No inactive orgs, no vendors/prospects/internal.

---

## Scope

Every sync job and API query must include active + customer filters. For APIs without server-side filtering (MyITProcess), filter client-side before storing. This is the default — may expand scope later.

## Why

Non-customer orgs (vendors, prospects, internal, partners) and inactive/deactivated orgs should never be synced or displayed in the alignment platform.

## Filter Mapping Per API

| API          | Filter |
|--------------|--------|
| ScalePad     | `filter[lifecycle]=eq:CUSTOMER` |
| MyITProcess  | Client-side `isActive === true` (no org type field available) |
| Autotask     | `isActive=true` + `companyType` picklist = Customer |
| Datto RMM    | Filter by `autotaskCompanyId` linkage to active Autotask customers |
| IT Glue      | `filter[organization-status-id]=57581` (Active) + `filter[organization-type-id]=228344` (Customer) |
