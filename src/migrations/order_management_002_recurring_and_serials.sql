-- ───────────────────────────────────────────────────────────────────────────────
-- order_management_002 — Recurring SaaS/license flag + serial→asset linking
-- ───────────────────────────────────────────────────────────────────────────────
-- Adds:
--   1. distributor_orders.is_recurring (bool) — True for orders that are entirely
--      recurring/subscription items (Meraki licenses, SaaS renewals, VCSP rentals).
--      These should not appear in the "open orders" dashboard since they're invoices
--      for already-fulfilled subscriptions, not deliveries to track.
--
--   2. Index on serial_number in distributor_order_items for fast asset lookup.
--
-- Safe to run multiple times.
-- ───────────────────────────────────────────────────────────────────────────────

ALTER TABLE distributor_orders
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS distributor_orders_is_recurring_idx
  ON distributor_orders (tenant_id, is_recurring)
  WHERE is_recurring = true;

-- GIN index so we can search serial_numbers arrays fast when linking to assets
CREATE INDEX IF NOT EXISTS distributor_order_items_serials_gin
  ON distributor_order_items USING gin (serial_numbers);

-- Backfill is_recurring for existing orders using description/part-number patterns.
-- We mark an order as recurring if EVERY item looks like a license / subscription.
UPDATE distributor_orders o
   SET is_recurring = true
 WHERE is_recurring = false
   AND EXISTS (SELECT 1 FROM distributor_order_items i WHERE i.distributor_order_id = o.id)
   AND NOT EXISTS (
     SELECT 1 FROM distributor_order_items i
      WHERE i.distributor_order_id = o.id
        AND NOT (
              COALESCE(i.description, '')      ILIKE ANY (ARRAY[
                '%subscription%','%monthly%','%annual%','%license%','%rental%',
                '%-1Y%','%-3Y%','%-5Y%','% 1YR%','% 3YR%','% 5YR%',
                '%maintenance%','%renewal%','%saas%','%support %'
              ])
           OR COALESCE(i.mfg_part_number, '')  ILIKE ANY (ARRAY[
                'LIC-%','LIC %','%-1YR%','%-3YR%','%-5YR%','%-1Y','%-3Y','%-5Y',
                'SUB-%','SAAS-%','MNT-%','REN-%'
              ])
        )
   );
