-- ============================================================================
-- Migration 004: Assessment Templates
-- ============================================================================
BEGIN;

CREATE TYPE template_item_type AS ENUM ('yes_no', 'multi_response');
CREATE TYPE response_color AS ENUM ('at_risk', 'needs_attention', 'satisfactory', 'not_applicable', 'acceptable_risk');

CREATE TABLE assessment_templates (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    description  TEXT,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    is_default   BOOLEAN NOT NULL DEFAULT false,
    created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE template_sections (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id  UUID NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    description  TEXT,
    weight       NUMERIC(6,3) NOT NULL DEFAULT 0,
    sort_order   INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE template_items (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id           UUID NOT NULL REFERENCES template_sections(id) ON DELETE CASCADE,
    template_id          UUID NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
    title                TEXT NOT NULL,
    description          TEXT,
    item_type            template_item_type NOT NULL DEFAULT 'multi_response',
    weight               NUMERIC(6,3) NOT NULL DEFAULT 0,
    scoring_instructions TEXT,
    remediation_tips     TEXT,
    sort_order           INT NOT NULL DEFAULT 0,
    is_active            BOOLEAN NOT NULL DEFAULT true,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE template_item_responses (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id      UUID NOT NULL REFERENCES template_items(id) ON DELETE CASCADE,
    label        TEXT NOT NULL,
    color_code   response_color NOT NULL DEFAULT 'satisfactory',
    description  TEXT,
    sort_order   INT NOT NULL DEFAULT 0,
    is_aligned   BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE assessments ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES assessment_templates(id) ON DELETE SET NULL;

CREATE TABLE assessment_answers (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id  UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    item_id        UUID NOT NULL REFERENCES template_items(id) ON DELETE CASCADE,
    response_id    UUID REFERENCES template_item_responses(id) ON DELETE SET NULL,
    internal_notes TEXT,
    public_notes   TEXT,
    answered_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    answered_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (assessment_id, item_id)
);

CREATE INDEX idx_template_sections_template ON template_sections(template_id);
CREATE INDEX idx_template_items_section ON template_items(section_id);
CREATE INDEX idx_template_items_template ON template_items(template_id);
CREATE INDEX idx_template_responses_item ON template_item_responses(item_id);
CREATE INDEX idx_assessment_answers_assessment ON assessment_answers(assessment_id);

COMMIT;
