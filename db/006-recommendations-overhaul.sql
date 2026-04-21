BEGIN;

-- Add vcio_notes to assessment_answers (vCIO Business Analysis)
ALTER TABLE assessment_answers ADD COLUMN IF NOT EXISTS vcio_notes TEXT;

-- Link assessment answers to recommendations
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS assessment_answer_id UUID REFERENCES assessment_answers(id) ON DELETE SET NULL;

-- Link assets to recommendations (like LMX initiatives showing assets)
CREATE TABLE IF NOT EXISTS recommendation_assets (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
    asset_id          UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (recommendation_id, asset_id)
);
CREATE INDEX IF NOT EXISTS idx_rec_assets_rec ON recommendation_assets(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_rec_assets_asset ON recommendation_assets(asset_id);

-- Tenant settings (naming preference: "recommendation" vs "initiative", etc.)
-- Table already exists with different schema; add a JSONB settings column if missing
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';

COMMIT;
