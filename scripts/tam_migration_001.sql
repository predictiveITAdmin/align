-- ============================================================
-- TAM Standards Library Migration v1.0
-- Run with: node scripts/run-migration.js
-- ============================================================

-- ─── 2A. New ENUM Types ──────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE standard_priority AS ENUM ('high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE standard_tier AS ENUM ('level_1', 'level_2', 'level_3');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE delivery_method AS ENUM ('automated', 'remote_human', 'onsite_required', 'hybrid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_impact AS ENUM ('no_user_impact', 'minimum_user_impact', 'significant_user_impact');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE infra_model AS ENUM ('cloud_only', 'on_prem', 'hybrid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE identity_platform_type AS ENUM ('entra_id', 'google_workspace', 'hybrid_ad', 'local_only', 'none');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE applicability_source AS ENUM ('universal', 'vertical', 'framework', 'tech', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE vendor_assessment_status AS ENUM ('draft', 'in_progress', 'completed', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE standard_response_level AS ENUM (
    'satisfactory', 'acceptable_risk', 'needs_attention', 'at_risk',
    'not_applicable', 'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2B. ALTER Existing Tables ───────────────────────────────

-- standard_sections (the "domains" layer)
ALTER TABLE standard_sections
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- standard_categories
ALTER TABLE standard_categories
  ADD COLUMN IF NOT EXISTS review_frequency_months integer DEFAULT 12,
  ADD COLUMN IF NOT EXISTS slug text;

-- standards (add new columns)
ALTER TABLE standards
  ADD COLUMN IF NOT EXISTS question_text text,
  ADD COLUMN IF NOT EXISTS priority standard_priority DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS is_universal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS level_tier standard_tier DEFAULT 'level_1',
  ADD COLUMN IF NOT EXISTS delivery_method delivery_method DEFAULT 'remote_human',
  ADD COLUMN IF NOT EXISTS user_impact_tag user_impact DEFAULT 'no_user_impact',
  ADD COLUMN IF NOT EXISTS scoring_instructions text,
  ADD COLUMN IF NOT EXISTS business_impact text,
  ADD COLUMN IF NOT EXISTS technical_rationale text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS source_reference text,
  ADD COLUMN IF NOT EXISTS legacy_template_item_ids uuid[] DEFAULT '{}';

-- clients (add profile columns for applicability engine)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS vertical text,
  ADD COLUMN IF NOT EXISTS frameworks_enabled text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS identity_platform identity_platform_type DEFAULT 'entra_id',
  ADD COLUMN IF NOT EXISTS infra_model infra_model DEFAULT 'hybrid',
  ADD COLUMN IF NOT EXISTS lob_apps text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS platform_stack text DEFAULT 'microsoft365',
  ADD COLUMN IF NOT EXISTS standards_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_assessment_date date,
  ADD COLUMN IF NOT EXISTS alignment_score_by_domain jsonb DEFAULT '{}';

-- assessment_items (extend for 5-level rubric + notes)
ALTER TABLE assessment_items
  ADD COLUMN IF NOT EXISTS response_level standard_response_level,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS public_notes text,
  ADD COLUMN IF NOT EXISTS vcio_findings text,
  ADD COLUMN IF NOT EXISTS vcio_business_impact text,
  ADD COLUMN IF NOT EXISTS vcio_internal_notes text,
  ADD COLUMN IF NOT EXISTS answered_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS answered_at timestamptz,
  ADD COLUMN IF NOT EXISTS response_id uuid;

-- ─── 2C. New Tables ─────────────────────────────────────────

-- STANDARD RESPONSES (5-level rubric per standard)
CREATE TABLE IF NOT EXISTS standard_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  standard_id uuid NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
  level standard_response_level NOT NULL,
  label text NOT NULL,
  description text,
  is_aligned boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(standard_id, level)
);
CREATE INDEX IF NOT EXISTS idx_sr_standard ON standard_responses(standard_id);

-- FRAMEWORK TAGS
CREATE TABLE IF NOT EXISTS standard_framework_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id uuid NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
  framework text NOT NULL,
  framework_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(standard_id, framework)
);
CREATE INDEX IF NOT EXISTS idx_sft_framework ON standard_framework_tags(framework);
CREATE INDEX IF NOT EXISTS idx_sft_standard ON standard_framework_tags(standard_id);

-- VERTICAL TAGS
CREATE TABLE IF NOT EXISTS standard_vertical_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id uuid NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
  vertical text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(standard_id, vertical)
);
CREATE INDEX IF NOT EXISTS idx_svt_vertical ON standard_vertical_tags(vertical);

-- TECH / LOB TAGS
CREATE TABLE IF NOT EXISTS standard_tech_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id uuid NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
  tech_tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(standard_id, tech_tag)
);
CREATE INDEX IF NOT EXISTS idx_stt_tech ON standard_tech_tags(tech_tag);

-- CLIENT STANDARDS (applicability mapping)
CREATE TABLE IF NOT EXISTS client_standards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  standard_id uuid NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
  is_applicable boolean NOT NULL DEFAULT true,
  applicability_source applicability_source NOT NULL DEFAULT 'manual',
  override_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, standard_id)
);
CREATE INDEX IF NOT EXISTS idx_cs_client ON client_standards(client_id) WHERE is_applicable = true;

-- AUTOMATION SOURCES (metadata only)
CREATE TABLE IF NOT EXISTS standard_automation_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id uuid NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
  source_platform text NOT NULL,
  data_field text NOT NULL,
  pass_condition jsonb NOT NULL DEFAULT '{}',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- CLIENT REVIEW SCHEDULE
CREATE TABLE IF NOT EXISTS client_review_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES standard_categories(id),
  last_reviewed_at timestamptz,
  next_review_due date,
  review_frequency_months integer NOT NULL DEFAULT 12,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_crs_due ON client_review_schedule(next_review_due);

-- VENDORS (future TPRA)
CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  vendor_type text,
  website text,
  autotask_account_id bigint,
  criticality text DEFAULT 'medium',
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- CLIENT-VENDOR LINK (future TPRA)
CREATE TABLE IF NOT EXISTS client_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  relationship_type text DEFAULT 'service_provider',
  contract_end_date date,
  baa_on_file boolean DEFAULT false,
  dpa_on_file boolean DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, vendor_id)
);

-- VENDOR ASSESSMENTS (future TPRA)
CREATE TABLE IF NOT EXISTS vendor_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  vendor_id uuid NOT NULL REFERENCES vendors(id),
  client_id uuid REFERENCES clients(id),
  name text NOT NULL,
  status vendor_assessment_status NOT NULL DEFAULT 'draft',
  assessment_date date NOT NULL DEFAULT CURRENT_DATE,
  conducted_by uuid REFERENCES users(id),
  overall_score numeric,
  summary text,
  is_shared boolean NOT NULL DEFAULT false,
  shared_at timestamptz,
  expires_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- VENDOR ASSESSMENT ANSWERS (future TPRA)
CREATE TABLE IF NOT EXISTS vendor_assessment_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES vendor_assessments(id) ON DELETE CASCADE,
  standard_id uuid NOT NULL REFERENCES standards(id),
  response_level standard_response_level,
  response_id uuid REFERENCES standard_responses(id),
  internal_notes text,
  evidence text,
  answered_by uuid REFERENCES users(id),
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- TEMPLATE ↔ STANDARD CROSSWALK (for historical reporting)
CREATE TABLE IF NOT EXISTS template_standard_crosswalk (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_item_id uuid NOT NULL REFERENCES template_items(id),
  standard_id uuid NOT NULL REFERENCES standards(id),
  confidence text DEFAULT 'manual',
  mapped_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_item_id, standard_id)
);
