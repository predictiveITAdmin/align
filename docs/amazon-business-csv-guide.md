# Amazon Business Order Import — CSV Guide

**Status:** Active — this is the v1 path for Amazon Business orders
(API integration deferred due to 4-6 week onboarding lead time).

Amazon Business provides downloadable Order Reports that include
PO numbers, order IDs, SKUs, quantities, shipping info, and tracking.
Align imports these CSVs through the Supplier API admin module.

## How to Generate the Report

1. Log into https://business.amazon.com/
2. Top-right dropdown → **Business Analytics** (or Reports, depending
   on account tier)
3. Choose **Order History Reports**
4. Report type: **Shipments** (includes tracking) — recommended
   - Alternative: **Orders** (order-level only, no tracking)
5. Date range: **Custom** → last 24 hours (or whatever fits your
   import cadence; daily is typical)
6. Columns — ensure these are selected:
   - Order Date, Order ID, **PO Number**
   - ASIN, Product Title, Brand
   - Ordered Quantity, Shipped Quantity
   - Item Subtotal, Item Shipping & Handling, Item Total
   - Ship Date, Tracking Number, Carrier
   - Ship-To Name, Ship-To Address (Line 1, City, State, ZIP)
   - Account User, Account Group
7. Generate / Download as CSV

## Upload to Align

1. Align → Admin → Suppliers → **Amazon Business**
2. Click **Import CSV**
3. Drag the downloaded CSV into the drop zone
4. Align auto-detects the columns (Amazon's export format is consistent)
5. Review the mapping preview:
   - Order ID → `distributor_order_id`
   - PO Number → `po_number`
   - Tracking Number → `distributor_order_items.tracking_number`
   - Carrier → `distributor_order_items.carrier`
   - etc.
6. Click **Import N rows**
7. Matcher runs automatically:
   - Orders with matching PO in Autotask → linked to Opportunity
   - Orders without a matching PO → unmapped queue (manual mapping UI)

## Schedule / Cadence

Amazon Business supports **scheduled reports** (Daily / Weekly) that
email or download automatically. Align doesn't yet pull from Amazon
automatically — users upload CSVs manually on whatever cadence they
run the report.

If you want automation later:
- Option 1: Amazon SES → forward scheduled report email → parse
  attachment → auto-import (brittle but works without API access)
- Option 2: Build Phase E API integration after the 4-6 week onboarding

## Common Issues

- **No PO number on line:** Orders placed without entering PO at
  checkout won't have one — these will land in the unmapped queue
  and need manual matching
- **Dupe imports:** Align de-dupes on `distributor_order_id`, so
  re-importing the same CSV is safe (nothing duplicated)
- **Large files:** > 10,000 rows — split into chunks by date range
- **Encoding:** Amazon exports as UTF-8 with BOM; Align handles both
  BOM and no-BOM CSVs

## Registration (for when you want full API later)

When you're ready to graduate from CSV to API:

1. Go to https://developer-docs.amazon.com/amazon-business/docs/onboarding-overview
2. Register for Solution Provider Portal (SPP) at the link above
3. Submit developer profile request (Step 1)
4. Create app client in SPP (Step 2)
5. Authorize app for your Amazon Business account (Step 3)
6. Request role `AmazonBusinessOrderPlacement` + order-read roles (Step 4)
7. Configure AWS SNS for push notifications (Step 5)
8. Activate SNS feature (Step 6)
9. Test configuration with Amazon's review team (Step 7)

Plan **4-6 weeks** end-to-end. Users and groups must be configured in
the purchasing system before orders route correctly.

After API is live:
- Flip the Amazon Business supplier config from `csv_import` mode to
  `api` mode
- CSV import path remains available as fallback
