-- ═══════════════════════════════════════════════════════════════════════════
-- Order Management — Phase A schema
-- Autotask Opportunities + Quotes + Quote Items
-- Distributor Orders + Items + Events
-- Supplier API admin module
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Enable pgcrypto for credential encryption ──────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Opportunities (from Autotask) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS opportunities (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id                  uuid REFERENCES clients(id) ON DELETE SET NULL,
  autotask_opportunity_id    bigint UNIQUE,
  title                      text NOT NULL,
  stage                      text,
  amount                     numeric(14,2),
  po_numbers                 text[] DEFAULT '{}',
  assigned_resource_id       bigint,
  assigned_resource_name     text,
  source                     text,  -- 'quotewerks' | 'kqm' | 'manual'
  expected_close             date,
  created_date               timestamptz,
  closed_date                timestamptz,
  metadata                   jsonb,
  last_synced_at             timestamptz DEFAULT NOW(),
  created_at                 timestamptz DEFAULT NOW(),
  updated_at                 timestamptz DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS opportunities_tenant_client_idx ON opportunities (tenant_id, client_id);
CREATE INDEX IF NOT EXISTS opportunities_po_numbers_gin ON opportunities USING GIN (po_numbers);
CREATE INDEX IF NOT EXISTS opportunities_stage_idx ON opportunities (stage);

-- ── Quotes (from Autotask) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id        uuid REFERENCES opportunities(id) ON DELETE CASCADE,
  autotask_quote_id     bigint UNIQUE,
  quote_number          text,
  title                 text,
  status                text,
  amount                numeric(14,2),
  valid_until           date,
  source                text,  -- 'quotewerks' | 'kqm'
  quote_external_ref    text,  -- QuoteWerks doc ID or KQM ref
  metadata              jsonb,
  last_synced_at        timestamptz DEFAULT NOW(),
  created_at            timestamptz DEFAULT NOW(),
  updated_at            timestamptz DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS quotes_opportunity_idx ON quotes (opportunity_id);
CREATE INDEX IF NOT EXISTS quotes_quote_number_idx ON quotes (quote_number);

-- ── Quote Items (from Autotask) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quote_items (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id                    uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  autotask_quote_item_id      bigint UNIQUE,
  mfg_part_number             text,
  manufacturer                text,
  description                 text,
  quantity                    numeric(12,2),
  unit_cost                   numeric(14,4),
  unit_price                  numeric(14,4),
  line_total                  numeric(14,2),
  metadata                    jsonb,
  created_at                  timestamptz DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS quote_items_quote_idx ON quote_items (quote_id);
CREATE INDEX IF NOT EXISTS quote_items_mfg_part_idx ON quote_items (mfg_part_number);

-- ── Suppliers (admin config per distributor) ────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  adapter_key              text NOT NULL,   -- 'ingram_xi' | 'tdsynnex_ecx' | 'amazon_business_csv' | 'provantage_manual'
  display_name             text NOT NULL,
  is_enabled               boolean DEFAULT false,
  sync_mode                text DEFAULT 'api',  -- 'api' | 'webhook' | 'csv_import' | 'manual'
  sync_frequency_minutes   int DEFAULT 60,
  customer_number          text,
  credentials              jsonb,     -- encrypted at app layer; see services/supplierCrypto.js
  base_url                 text,
  environment              text DEFAULT 'production',  -- 'sandbox' | 'production'
  webhook_url_suffix       text UNIQUE,  -- suffix used in /api/webhooks/<adapter_key>/<suffix>
  webhook_secret           text,
  last_test_at             timestamptz,
  last_test_status         text,      -- 'ok' | 'failed'
  last_test_error          text,
  last_sync_at             timestamptz,
  last_sync_status         text,
  last_sync_error          text,
  metadata                 jsonb,
  created_at               timestamptz DEFAULT NOW(),
  updated_at               timestamptz DEFAULT NOW(),
  UNIQUE (tenant_id, adapter_key)
);
CREATE INDEX IF NOT EXISTS suppliers_tenant_enabled_idx ON suppliers (tenant_id, is_enabled);

-- ── Distributor Orders (pulled from each distributor API / CSV) ─────────────
CREATE TABLE IF NOT EXISTS distributor_orders (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id                 uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  distributor                 text NOT NULL,          -- denormalized adapter_key for easy filtering
  distributor_order_id        text NOT NULL,
  po_number                   text,                    -- JOIN KEY to Autotask opp po_numbers
  order_date                  timestamptz,
  submitted_by                text,
  status                      text,                    -- normalized status
  status_raw                  text,                    -- distributor's exact status
  subtotal                    numeric(14,2),
  tax                         numeric(14,2),
  shipping                    numeric(14,2),
  total                       numeric(14,2),
  currency                    text DEFAULT 'USD',
  ship_to_name                text,
  ship_to_address             jsonb,

  -- Match / linkage
  opportunity_id              uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  quote_id                    uuid REFERENCES quotes(id) ON DELETE SET NULL,
  client_id                   uuid REFERENCES clients(id) ON DELETE SET NULL,
  match_confidence            int,       -- 0-100
  match_method                text,      -- 'po_exact'|'po_fuzzy'|'client_name'|'address'|'manual'
  match_status                text DEFAULT 'unmapped', -- 'matched'|'needs_review'|'unmapped'
  matched_at                  timestamptz,
  matched_by                  uuid REFERENCES users(id) ON DELETE SET NULL,

  metadata                    jsonb,
  last_synced_at              timestamptz DEFAULT NOW(),
  created_at                  timestamptz DEFAULT NOW(),
  updated_at                  timestamptz DEFAULT NOW(),
  UNIQUE (distributor, distributor_order_id)
);
CREATE INDEX IF NOT EXISTS do_tenant_match_idx      ON distributor_orders (tenant_id, match_status);
CREATE INDEX IF NOT EXISTS do_po_idx                ON distributor_orders (po_number);
CREATE INDEX IF NOT EXISTS do_client_idx            ON distributor_orders (client_id);
CREATE INDEX IF NOT EXISTS do_opportunity_idx       ON distributor_orders (opportunity_id);
CREATE INDEX IF NOT EXISTS do_status_idx            ON distributor_orders (status);

-- ── Distributor Order Items ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS distributor_order_items (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_order_id        uuid NOT NULL REFERENCES distributor_orders(id) ON DELETE CASCADE,
  distributor_line_id         text,
  mfg_part_number             text,
  manufacturer                text,
  description                 text,
  quantity_ordered            numeric(12,2),
  quantity_shipped            numeric(12,2) DEFAULT 0,
  quantity_backordered        numeric(12,2) DEFAULT 0,
  quantity_cancelled          numeric(12,2) DEFAULT 0,
  quantity_received           numeric(12,2) DEFAULT 0,
  unit_cost                   numeric(14,4),
  line_total                  numeric(14,2),

  -- Shipping
  tracking_number             text,
  carrier                     text,
  ship_date                   date,
  expected_delivery           date,
  serial_numbers              text[] DEFAULT '{}',
  serials_confirmed_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  serials_confirmed_at        timestamptz,

  -- Links
  quote_item_id               uuid REFERENCES quote_items(id) ON DELETE SET NULL,
  asset_id                    uuid,  -- FK once assets table is confirmed

  metadata                    jsonb,
  created_at                  timestamptz DEFAULT NOW(),
  updated_at                  timestamptz DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS doi_order_idx    ON distributor_order_items (distributor_order_id);
CREATE INDEX IF NOT EXISTS doi_mfg_part_idx ON distributor_order_items (mfg_part_number);
CREATE INDEX IF NOT EXISTS doi_tracking_idx ON distributor_order_items (tracking_number);

-- ── Order Events (audit / timeline) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_events (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_order_id        uuid NOT NULL REFERENCES distributor_orders(id) ON DELETE CASCADE,
  event_type                  text NOT NULL,  -- order_created | status_change | shipment | backorder | delivered | receipt_confirmed | serial_entered | asset_created | qbo_synced | po_mapped | client_notified
  event_date                  timestamptz NOT NULL DEFAULT NOW(),
  description                 text,
  actor                       text,             -- 'system' | user id | 'client'
  metadata                    jsonb,
  created_at                  timestamptz DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS oe_order_idx ON order_events (distributor_order_id, event_date DESC);
CREATE INDEX IF NOT EXISTS oe_type_idx  ON order_events (event_type);

-- ── Order Receipts (human confirmation step after delivery) ─────────────────
CREATE TABLE IF NOT EXISTS order_receipts (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_order_id        uuid NOT NULL REFERENCES distributor_orders(id) ON DELETE CASCADE,
  received_at                 timestamptz NOT NULL,
  received_by                 uuid,               -- user_id or client_contact_id
  received_by_type            text,               -- 'msp_staff' | 'client_contact'
  notes                       text,
  all_items_confirmed         boolean DEFAULT false,
  created_at                  timestamptz DEFAULT NOW()
);

-- ── Per-item assignment decisions (new/additional/replacement + assign-to) ──
CREATE TABLE IF NOT EXISTS order_item_assignments (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_order_item_id       uuid NOT NULL REFERENCES distributor_order_items(id) ON DELETE CASCADE,
  receipt_id                      uuid REFERENCES order_receipts(id) ON DELETE SET NULL,
  assignment_type                 text,              -- 'new' | 'additional' | 'replacement'
  replacing_asset_id              uuid,              -- points to assets table
  assigned_user_name              text,              -- client user receiving the item
  assigned_user_email             text,
  assigned_location               text,
  serial_number                   text,
  asset_id                        uuid,              -- asset row created from this assignment
  created_at                      timestamptz DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS oia_item_idx ON order_item_assignments (distributor_order_item_id);

-- ── Updated_at triggers (keep consistent with rest of app) ──────────────────
CREATE OR REPLACE FUNCTION order_mgmt_touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS opportunities_touch ON opportunities;
CREATE TRIGGER opportunities_touch BEFORE UPDATE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION order_mgmt_touch_updated_at();

DROP TRIGGER IF EXISTS quotes_touch ON quotes;
CREATE TRIGGER quotes_touch BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION order_mgmt_touch_updated_at();

DROP TRIGGER IF EXISTS suppliers_touch ON suppliers;
CREATE TRIGGER suppliers_touch BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION order_mgmt_touch_updated_at();

DROP TRIGGER IF EXISTS distributor_orders_touch ON distributor_orders;
CREATE TRIGGER distributor_orders_touch BEFORE UPDATE ON distributor_orders
  FOR EACH ROW EXECUTE FUNCTION order_mgmt_touch_updated_at();

DROP TRIGGER IF EXISTS distributor_order_items_touch ON distributor_order_items;
CREATE TRIGGER distributor_order_items_touch BEFORE UPDATE ON distributor_order_items
  FOR EACH ROW EXECUTE FUNCTION order_mgmt_touch_updated_at();
