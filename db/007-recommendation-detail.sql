-- ── Recommendation initiative-style enhancements ────────────────────────────

ALTER TABLE recommendations
  ADD COLUMN IF NOT EXISTS executive_summary TEXT,
  ADD COLUMN IF NOT EXISTS schedule_year     INTEGER,
  ADD COLUMN IF NOT EXISTS schedule_quarter  INTEGER,     -- 1-4
  ADD COLUMN IF NOT EXISTS at_ticket_id      BIGINT,
  ADD COLUMN IF NOT EXISTS at_ticket_number  INTEGER,
  ADD COLUMN IF NOT EXISTS at_ticket_title   TEXT,
  ADD COLUMN IF NOT EXISTS at_opportunity_id     BIGINT,
  ADD COLUMN IF NOT EXISTS at_opportunity_number INTEGER,
  ADD COLUMN IF NOT EXISTS at_opportunity_title  TEXT,
  ADD COLUMN IF NOT EXISTS contact_id        UUID REFERENCES contacts(id) ON DELETE SET NULL;

-- Detailed budget line items
CREATE TABLE IF NOT EXISTS recommendation_budget_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  description       TEXT NOT NULL DEFAULT '',
  amount            NUMERIC(12,2) DEFAULT 0,
  billing_type      TEXT DEFAULT 'fixed',    -- fixed | per_asset
  fee_type          TEXT DEFAULT 'one_time', -- one_time | recurring_monthly | recurring_annual
  sort_order        INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_budget_items_rec ON recommendation_budget_items(recommendation_id);
