-- ============================================================================
-- predictiveIT Align — Strategic IT Alignment Platform
-- PostgreSQL 15 Schema Migration
-- Generated: 2026-03-27
--
-- Database: align (on pitai-web01 PostgreSQL 15)
-- Purpose:  Unified MSP vCIO platform — assessments, lifecycle, roadmaps,
--           EOS, CSAT, reporting across 9 data sources
-- ============================================================================

BEGIN;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- trigram indexes for text search

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE user_role AS ENUM (
    'global_admin',    -- predictiveIT staff, cross-tenant
    'tenant_admin',    -- single-tenant owner/manager
    'vcio',            -- virtual CIO / vCISO
    'tam',             -- technical account manager
    'client_readonly'  -- client portal read-only access
);

CREATE TYPE sync_source_type AS ENUM (
    'autotask',
    'datto_rmm',
    'it_glue',
    'scalepad',
    'myitprocess',
    'saas_alerts',
    'auvik',
    'customer_thermometer'
);

CREATE TYPE sync_status AS ENUM (
    'pending',
    'running',
    'completed',
    'completed_with_errors',
    'failed'
);

CREATE TYPE alignment_severity AS ENUM (
    'aligned',
    'marginal',
    'vulnerable',
    'highly_vulnerable',
    'not_assessed'
);

CREATE TYPE recommendation_priority AS ENUM (
    'critical',
    'high',
    'medium',
    'low',
    'informational'
);

CREATE TYPE recommendation_type AS ENUM (
    'remediation',
    'improvement',
    'maintenance',
    'compliance',
    'strategic'
);

CREATE TYPE recommendation_status AS ENUM (
    'draft',
    'proposed',
    'approved',
    'in_progress',
    'completed',
    'deferred',
    'declined'
);

CREATE TYPE initiative_status AS ENUM (
    'planning',
    'approved',
    'in_progress',
    'on_hold',
    'completed',
    'cancelled'
);

CREATE TYPE budget_item_frequency AS ENUM (
    'one_time',
    'monthly',
    'quarterly',
    'annual'
);

CREATE TYPE budget_item_category AS ENUM (
    'hardware',
    'software',
    'licensing',
    'labor',
    'managed_services',
    'consulting',
    'infrastructure',
    'security',
    'other'
);

CREATE TYPE rock_status AS ENUM (
    'on_track',
    'off_track',
    'completed',
    'dropped'
);

CREATE TYPE measurable_frequency AS ENUM (
    'weekly',
    'monthly',
    'quarterly'
);

CREATE TYPE todo_status AS ENUM (
    'open',
    'completed',
    'dropped'
);

CREATE TYPE issue_priority AS ENUM (
    'critical',
    'high',
    'medium',
    'low'
);

CREATE TYPE issue_status AS ENUM (
    'open',
    'in_discussion',
    'resolved',
    'dropped'
);

CREATE TYPE csat_rating AS ENUM (
    'gold',
    'green',
    'yellow',
    'red'
);

CREATE TYPE report_widget_type AS ENUM (
    'bar_chart',
    'line_chart',
    'pie_chart',
    'donut_chart',
    'gauge',
    'number_card',
    'table',
    'text_block',
    'heat_map',
    'timeline',
    'checklist'
);

CREATE TYPE report_schedule_frequency AS ENUM (
    'weekly',
    'monthly',
    'quarterly',
    'annual',
    'on_demand'
);

CREATE TYPE contract_status AS ENUM (
    'active',
    'expired',
    'cancelled',
    'pending_renewal'
);

CREATE TYPE meeting_type AS ENUM (
    'qbr',
    'monthly_review',
    'annual_review',
    'strategic_planning',
    'incident_review',
    'onboarding',
    'other'
);

CREATE TYPE meeting_status AS ENUM (
    'scheduled',
    'in_progress',
    'completed',
    'cancelled'
);

CREATE TYPE roadmap_project_status AS ENUM (
    'proposed',
    'approved',
    'scheduled',
    'in_progress',
    'completed',
    'cancelled',
    'deferred'
);

-- ============================================================================
-- CORE / MULTI-TENANT TABLES
-- ============================================================================

-- Tenants: top-level MSP organizations (predictiveIT = tenant #1)
CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,           -- URL-safe identifier
    domain          TEXT,                            -- primary email domain
    is_active       BOOLEAN NOT NULL DEFAULT true,
    settings        JSONB NOT NULL DEFAULT '{}',     -- tenant-level config
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE tenants IS 'MSP organizations using the platform. predictiveIT is tenant #1; schema supports future multi-MSP.';

CREATE INDEX idx_tenants_slug ON tenants (slug);
CREATE INDEX idx_tenants_is_active ON tenants (is_active) WHERE is_active = true;

-- Users: platform users with role-based access
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    role            user_role NOT NULL DEFAULT 'tam',
    password_hash   TEXT,                            -- null if SSO-only
    auth_provider   TEXT DEFAULT 'local',            -- local, microsoft, google
    auth_provider_id TEXT,                           -- external SSO subject ID
    avatar_url      TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    settings        JSONB NOT NULL DEFAULT '{}',     -- user preferences
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, email)
);
COMMENT ON TABLE users IS 'Platform users (vCIO, TAM, admins). Scoped to a tenant with role-based access.';

CREATE INDEX idx_users_tenant_id ON users (tenant_id);
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_role ON users (tenant_id, role);
CREATE INDEX idx_users_is_active ON users (tenant_id, is_active) WHERE is_active = true;

-- Clients: canonical client table — Autotask Company is the master record
CREATE TABLE clients (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    autotask_company_id BIGINT,                      -- canonical external key from Autotask PSA
    name                TEXT NOT NULL,
    short_name          TEXT,                         -- abbreviated display name
    industry            TEXT,
    website             TEXT,
    phone               TEXT,
    address_line1       TEXT,
    address_line2       TEXT,
    city                TEXT,
    state               TEXT,
    postal_code         TEXT,
    country             TEXT DEFAULT 'US',
    employee_count      INTEGER,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    assigned_vcio_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_tam_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    health_score        NUMERIC(5,2),                -- computed client health (0-100)
    metadata            JSONB NOT NULL DEFAULT '{}', -- additional vendor fields
    last_synced_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, autotask_company_id)
);
COMMENT ON TABLE clients IS 'Canonical client table. Autotask Company ID is the master key; all other APIs map to this record.';

CREATE INDEX idx_clients_tenant_id ON clients (tenant_id);
CREATE INDEX idx_clients_autotask_company_id ON clients (tenant_id, autotask_company_id);
CREATE INDEX idx_clients_assigned_vcio ON clients (assigned_vcio_id) WHERE assigned_vcio_id IS NOT NULL;
CREATE INDEX idx_clients_assigned_tam ON clients (assigned_tam_id) WHERE assigned_tam_id IS NOT NULL;
CREATE INDEX idx_clients_is_active ON clients (tenant_id, is_active) WHERE is_active = true;
CREATE INDEX idx_clients_name_trgm ON clients USING gin (name gin_trgm_ops);

-- Client contacts: synced from Autotask + IT Glue
CREATE TABLE client_contacts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    title           TEXT,
    email           TEXT,
    phone           TEXT,
    mobile_phone    TEXT,
    is_primary      BOOLEAN NOT NULL DEFAULT false,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    external_id     TEXT,
    external_source sync_source_type,
    metadata        JSONB NOT NULL DEFAULT '{}',
    last_synced_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE client_contacts IS 'Client contacts synced from Autotask and IT Glue. Used for QBR attendees and communication.';

CREATE INDEX idx_client_contacts_client_id ON client_contacts (client_id);
CREATE INDEX idx_client_contacts_tenant_id ON client_contacts (tenant_id);
CREATE INDEX idx_client_contacts_email ON client_contacts (email) WHERE email IS NOT NULL;
CREATE INDEX idx_client_contacts_external ON client_contacts (external_source, external_id) WHERE external_id IS NOT NULL;

-- Client locations: synced from IT Glue + Autotask
CREATE TABLE client_locations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    address_line1   TEXT,
    address_line2   TEXT,
    city            TEXT,
    state           TEXT,
    postal_code     TEXT,
    country         TEXT DEFAULT 'US',
    is_primary      BOOLEAN NOT NULL DEFAULT false,
    external_id     TEXT,
    external_source sync_source_type,
    metadata        JSONB NOT NULL DEFAULT '{}',
    last_synced_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE client_locations IS 'Client physical locations synced from IT Glue and Autotask. Linked to assets for site-level views.';

CREATE INDEX idx_client_locations_client_id ON client_locations (client_id);
CREATE INDEX idx_client_locations_tenant_id ON client_locations (tenant_id);
CREATE INDEX idx_client_locations_external ON client_locations (external_source, external_id) WHERE external_id IS NOT NULL;

-- ============================================================================
-- SYNC INFRASTRUCTURE
-- ============================================================================

-- Sync sources: registry of external API connections per tenant
CREATE TABLE sync_sources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source_type     sync_source_type NOT NULL,
    display_name    TEXT NOT NULL,
    is_enabled      BOOLEAN NOT NULL DEFAULT true,
    credentials     JSONB NOT NULL DEFAULT '{}',     -- encrypted API keys/tokens (encrypt at app layer)
    config          JSONB NOT NULL DEFAULT '{}',     -- source-specific sync settings (filters, intervals)
    last_sync_at    TIMESTAMPTZ,
    last_sync_status sync_status,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, source_type)
);
COMMENT ON TABLE sync_sources IS 'Registry of external API connections per tenant. Credentials stored as JSONB (encrypted at application layer).';

CREATE INDEX idx_sync_sources_tenant_id ON sync_sources (tenant_id);
CREATE INDEX idx_sync_sources_type ON sync_sources (source_type);

-- Sync logs: per-source sync execution history
CREATE TABLE sync_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_source_id  UUID NOT NULL REFERENCES sync_sources(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entity_type     TEXT NOT NULL,                    -- e.g. 'companies', 'devices', 'configurations'
    status          sync_status NOT NULL DEFAULT 'pending',
    records_fetched INTEGER DEFAULT 0,
    records_created INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_skipped INTEGER DEFAULT 0,
    error_message   TEXT,
    error_details   JSONB,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE sync_logs IS 'Audit trail for every sync execution. Tracks record counts and errors per entity type.';

CREATE INDEX idx_sync_logs_source_id ON sync_logs (sync_source_id);
CREATE INDEX idx_sync_logs_tenant_id ON sync_logs (tenant_id);
CREATE INDEX idx_sync_logs_status ON sync_logs (status);
CREATE INDEX idx_sync_logs_started_at ON sync_logs (started_at DESC);
CREATE INDEX idx_sync_logs_entity ON sync_logs (sync_source_id, entity_type);

-- Sync client mappings: maps external client IDs to canonical client record
CREATE TABLE sync_client_mappings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    source_type     sync_source_type NOT NULL,
    external_id     TEXT NOT NULL,                    -- the client/org/company ID in the external system
    external_name   TEXT,                             -- display name in external system for debugging
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_synced_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, source_type, external_id)
);
COMMENT ON TABLE sync_client_mappings IS 'Maps external client/org IDs from each API (Datto RMM site, IT Glue org, Auvik tenant, etc.) to the canonical client record.';

CREATE INDEX idx_sync_client_mappings_tenant_id ON sync_client_mappings (tenant_id);
CREATE INDEX idx_sync_client_mappings_client_id ON sync_client_mappings (client_id);
CREATE INDEX idx_sync_client_mappings_lookup ON sync_client_mappings (tenant_id, source_type, external_id);

-- ============================================================================
-- STANDARDS & ASSESSMENTS
-- ============================================================================

-- Standard categories: Security, Networking, Endpoint, Cloud, Backup, etc.
CREATE TABLE standard_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    icon            TEXT,                             -- icon identifier for UI
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);
COMMENT ON TABLE standard_categories IS 'Technology standard categories (Security, Networking, Endpoint, Cloud, Backup, etc.). Tenant-scoped for customization.';

CREATE INDEX idx_standard_categories_tenant_id ON standard_categories (tenant_id);

-- Standards: individual standards within categories
CREATE TABLE standards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id     UUID NOT NULL REFERENCES standard_categories(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    criteria        TEXT,                             -- what constitutes alignment
    remediation_guidance TEXT,                        -- default remediation steps
    severity_weight NUMERIC(3,1) NOT NULL DEFAULT 1.0, -- weight for scoring calculations
    is_active       BOOLEAN NOT NULL DEFAULT true,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    external_id     TEXT,                             -- from ScalePad/MyITProcess template
    external_source sync_source_type,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE standards IS 'Individual technology standards within categories. Defines what "good" looks like for each area.';

CREATE INDEX idx_standards_tenant_id ON standards (tenant_id);
CREATE INDEX idx_standards_category_id ON standards (category_id);
CREATE INDEX idx_standards_is_active ON standards (tenant_id, is_active) WHERE is_active = true;
CREATE INDEX idx_standards_external ON standards (external_source, external_id) WHERE external_id IS NOT NULL;

-- Assessments: an assessment run for a client
CREATE TABLE assessments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    conducted_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    overall_score   NUMERIC(5,2),                    -- computed alignment score (0-100)
    summary         TEXT,
    status          TEXT NOT NULL DEFAULT 'draft',    -- draft, in_progress, completed, archived
    external_id     TEXT,
    external_source sync_source_type,
    metadata        JSONB NOT NULL DEFAULT '{}',
    last_synced_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE assessments IS 'Assessment runs for a client. Each assessment scores the client against active standards.';

CREATE INDEX idx_assessments_tenant_id ON assessments (tenant_id);
CREATE INDEX idx_assessments_client_id ON assessments (client_id);
CREATE INDEX idx_assessments_conducted_by ON assessments (conducted_by) WHERE conducted_by IS NOT NULL;
CREATE INDEX idx_assessments_date ON assessments (assessment_date DESC);
CREATE INDEX idx_assessments_external ON assessments (external_source, external_id) WHERE external_id IS NOT NULL;

-- Assessment items: per-standard scoring within an assessment
CREATE TABLE assessment_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id   UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    standard_id     UUID NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
    severity        alignment_severity NOT NULL DEFAULT 'not_assessed',
    score           NUMERIC(5,2),                    -- numeric score (0-100) for weighted calculations
    notes           TEXT,
    evidence        TEXT,                             -- documentation of current state
    external_id     TEXT,
    external_source sync_source_type,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (assessment_id, standard_id)
);
COMMENT ON TABLE assessment_items IS 'Per-standard score within an assessment. Severity: aligned/marginal/vulnerable/highly_vulnerable.';

CREATE INDEX idx_assessment_items_assessment_id ON assessment_items (assessment_id);
CREATE INDEX idx_assessment_items_standard_id ON assessment_items (standard_id);
CREATE INDEX idx_assessment_items_severity ON assessment_items (severity);

-- ============================================================================
-- RECOMMENDATIONS & INITIATIVES
-- ============================================================================

-- Recommendations: remediation actions from misalignments
CREATE TABLE recommendations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    assessment_item_id  UUID REFERENCES assessment_items(id) ON DELETE SET NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    priority            recommendation_priority NOT NULL DEFAULT 'medium',
    type                recommendation_type NOT NULL DEFAULT 'remediation',
    status              recommendation_status NOT NULL DEFAULT 'draft',
    estimated_budget    NUMERIC(12,2),               -- estimated cost in dollars
    estimated_hours     NUMERIC(8,2),                -- estimated labor hours
    responsible_party   TEXT,                         -- who should execute (MSP, client, vendor)
    assigned_to         UUID REFERENCES users(id) ON DELETE SET NULL,
    target_date         DATE,
    completed_date      DATE,
    external_id         TEXT,
    external_source     sync_source_type,
    metadata            JSONB NOT NULL DEFAULT '{}',
    last_synced_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE recommendations IS 'Remediation recommendations from assessment misalignments. Includes budget, hours, priority, responsible party.';

CREATE INDEX idx_recommendations_tenant_id ON recommendations (tenant_id);
CREATE INDEX idx_recommendations_client_id ON recommendations (client_id);
CREATE INDEX idx_recommendations_assessment_item ON recommendations (assessment_item_id) WHERE assessment_item_id IS NOT NULL;
CREATE INDEX idx_recommendations_status ON recommendations (status);
CREATE INDEX idx_recommendations_priority ON recommendations (priority);
CREATE INDEX idx_recommendations_assigned_to ON recommendations (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_recommendations_external ON recommendations (external_source, external_id) WHERE external_id IS NOT NULL;

-- Initiatives: groups of recommendations for a client
CREATE TABLE initiatives (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    status          initiative_status NOT NULL DEFAULT 'planning',
    owner_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    start_date      DATE,
    target_end_date DATE,
    actual_end_date DATE,
    total_budget    NUMERIC(12,2),
    total_hours     NUMERIC(8,2),
    external_id     TEXT,
    external_source sync_source_type,
    metadata        JSONB NOT NULL DEFAULT '{}',
    last_synced_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE initiatives IS 'Grouped recommendations for a client with timeline and budget. Synced from ScalePad/MyITProcess or created manually.';

CREATE INDEX idx_initiatives_tenant_id ON initiatives (tenant_id);
CREATE INDEX idx_initiatives_client_id ON initiatives (client_id);
CREATE INDEX idx_initiatives_status ON initiatives (status);
CREATE INDEX idx_initiatives_owner_id ON initiatives (owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX idx_initiatives_external ON initiatives (external_source, external_id) WHERE external_id IS NOT NULL;

-- Initiative-Recommendation junction
CREATE TABLE initiative_recommendations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    initiative_id     UUID NOT NULL REFERENCES initiatives(id) ON DELETE CASCADE,
    recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
    sort_order        INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (initiative_id, recommendation_id)
);
COMMENT ON TABLE initiative_recommendations IS 'Junction table linking recommendations to initiatives.';

CREATE INDEX idx_initiative_recs_initiative ON initiative_recommendations (initiative_id);
CREATE INDEX idx_initiative_recs_recommendation ON initiative_recommendations (recommendation_id);

-- ============================================================================
-- ASSET LIFECYCLE
-- ============================================================================

-- Asset types: workstation, server, firewall, switch, AP, printer, etc.
CREATE TABLE asset_types (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    category        TEXT,                             -- hardware, software, network, peripheral
    icon            TEXT,
    default_lifecycle_years INTEGER,                  -- default replacement cycle
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);
COMMENT ON TABLE asset_types IS 'Asset type definitions (workstation, server, firewall, switch, AP, printer). Includes default lifecycle duration.';

CREATE INDEX idx_asset_types_tenant_id ON asset_types (tenant_id);

-- Assets: unified asset table — merged from Autotask, Datto RMM, IT Glue, Auvik
CREATE TABLE assets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    asset_type_id       UUID REFERENCES asset_types(id) ON DELETE SET NULL,
    location_id         UUID REFERENCES client_locations(id) ON DELETE SET NULL,

    -- Core identification
    name                TEXT NOT NULL,                -- hostname or display name
    serial_number       TEXT,
    asset_tag           TEXT,

    -- Hardware details
    manufacturer        TEXT,
    model               TEXT,
    operating_system    TEXT,
    os_version          TEXT,

    -- Lifecycle tracking
    purchase_date       DATE,
    warranty_expiry     DATE,
    eol_date            DATE,                         -- vendor end-of-life date
    eos_date            DATE,                         -- vendor end-of-support date
    planned_replacement_date DATE,
    lifecycle_status    TEXT,                          -- in_warranty, expiring_soon, out_of_warranty, eol, eos

    -- Network / RMM fields
    ip_address          INET,
    mac_address         MACADDR,
    last_seen_at        TIMESTAMPTZ,
    is_online           BOOLEAN,
    antivirus_status    TEXT,
    patch_status        TEXT,
    last_patch_date     DATE,

    -- Status
    is_active           BOOLEAN NOT NULL DEFAULT true,
    is_managed          BOOLEAN NOT NULL DEFAULT true,
    notes               TEXT,

    -- Sync tracking — an asset may come from multiple sources
    primary_source      sync_source_type,             -- the "winning" source for merge
    autotask_ci_id      BIGINT,                       -- Autotask ConfigurationItem ID
    datto_rmm_device_id TEXT,
    it_glue_config_id   BIGINT,
    auvik_device_id     TEXT,

    -- Flexible vendor-specific data
    autotask_data       JSONB DEFAULT '{}',           -- full 107-field ConfigItem payload
    datto_rmm_data      JSONB DEFAULT '{}',           -- hostname, OS, AV, patches, UDFs
    it_glue_data        JSONB DEFAULT '{}',           -- flexible asset fields
    auvik_data          JSONB DEFAULT '{}',           -- make/model/vendor, interfaces
    metadata            JSONB NOT NULL DEFAULT '{}',

    last_synced_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE assets IS 'Unified asset table merging data from Autotask ConfigItems, Datto RMM devices, IT Glue configs, and Auvik devices. JSONB columns hold vendor-specific fields.';

CREATE INDEX idx_assets_tenant_id ON assets (tenant_id);
CREATE INDEX idx_assets_client_id ON assets (client_id);
CREATE INDEX idx_assets_type_id ON assets (asset_type_id) WHERE asset_type_id IS NOT NULL;
CREATE INDEX idx_assets_location_id ON assets (location_id) WHERE location_id IS NOT NULL;
CREATE INDEX idx_assets_serial ON assets (serial_number) WHERE serial_number IS NOT NULL;
CREATE INDEX idx_assets_warranty_expiry ON assets (warranty_expiry) WHERE warranty_expiry IS NOT NULL;
CREATE INDEX idx_assets_eol_date ON assets (eol_date) WHERE eol_date IS NOT NULL;
CREATE INDEX idx_assets_is_active ON assets (tenant_id, is_active) WHERE is_active = true;
CREATE INDEX idx_assets_autotask_ci ON assets (autotask_ci_id) WHERE autotask_ci_id IS NOT NULL;
CREATE INDEX idx_assets_datto_rmm ON assets (datto_rmm_device_id) WHERE datto_rmm_device_id IS NOT NULL;
CREATE INDEX idx_assets_it_glue ON assets (it_glue_config_id) WHERE it_glue_config_id IS NOT NULL;
CREATE INDEX idx_assets_auvik ON assets (auvik_device_id) WHERE auvik_device_id IS NOT NULL;
CREATE INDEX idx_assets_name_trgm ON assets USING gin (name gin_trgm_ops);
CREATE INDEX idx_assets_lifecycle ON assets (tenant_id, client_id, lifecycle_status);

-- Asset warranty lookups: cached warranty API results
CREATE TABLE asset_warranty_lookups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id        UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    serial_number   TEXT NOT NULL,
    manufacturer    TEXT,
    warranty_start  DATE,
    warranty_end    DATE,
    warranty_type   TEXT,                             -- standard, extended, NBD, 4-hour, etc.
    service_level   TEXT,
    lookup_source   TEXT NOT NULL,                    -- 'manufacturer_api', 'scalepad', 'manual'
    raw_response    JSONB,
    looked_up_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE asset_warranty_lookups IS 'Cached warranty lookup results from manufacturer APIs or ScalePad. Avoids redundant API calls.';

CREATE INDEX idx_warranty_lookups_asset_id ON asset_warranty_lookups (asset_id);
CREATE INDEX idx_warranty_lookups_serial ON asset_warranty_lookups (serial_number);

-- SaaS licenses: per-user M365/Google license assignments from SaaS Alerts
CREATE TABLE saas_licenses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    user_email      TEXT NOT NULL,
    user_display_name TEXT,
    platform        TEXT NOT NULL,                    -- 'microsoft_365', 'google_workspace'
    license_name    TEXT NOT NULL,                    -- e.g. 'Microsoft 365 Business Premium'
    license_sku     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    assigned_date   DATE,
    monthly_cost    NUMERIC(8,2),
    security_events JSONB DEFAULT '[]',              -- recent security events for this user
    external_id     TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}',
    last_synced_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE saas_licenses IS 'Per-user SaaS license assignments synced from SaaS Alerts. Tracks M365/Google licensing and cost per seat.';

CREATE INDEX idx_saas_licenses_tenant_id ON saas_licenses (tenant_id);
CREATE INDEX idx_saas_licenses_client_id ON saas_licenses (client_id);
CREATE INDEX idx_saas_licenses_email ON saas_licenses (user_email);
CREATE INDEX idx_saas_licenses_platform ON saas_licenses (platform);
CREATE INDEX idx_saas_licenses_is_active ON saas_licenses (tenant_id, is_active) WHERE is_active = true;
CREATE INDEX idx_saas_licenses_external ON saas_licenses (external_id) WHERE external_id IS NOT NULL;

-- ============================================================================
-- CONTRACTS & SUBSCRIPTIONS
-- ============================================================================

-- Contracts: synced from Autotask — service contracts, renewal tracking
CREATE TABLE contracts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    contract_number     TEXT,
    contract_type       TEXT,                         -- managed_services, block_hours, T&M, project, etc.
    status              contract_status NOT NULL DEFAULT 'active',
    start_date          DATE,
    end_date            DATE,
    monthly_value       NUMERIC(12,2),
    total_value         NUMERIC(12,2),
    billing_code        TEXT,
    auto_renew          BOOLEAN DEFAULT false,
    renewal_period_months INTEGER,
    notes               TEXT,
    autotask_contract_id BIGINT,
    metadata            JSONB NOT NULL DEFAULT '{}',
    last_synced_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE contracts IS 'Service contracts synced from Autotask. Tracks contract value, renewal dates, and status.';

CREATE INDEX idx_contracts_tenant_id ON contracts (tenant_id);
CREATE INDEX idx_contracts_client_id ON contracts (client_id);
CREATE INDEX idx_contracts_status ON contracts (status);
CREATE INDEX idx_contracts_end_date ON contracts (end_date) WHERE end_date IS NOT NULL;
CREATE INDEX idx_contracts_autotask ON contracts (autotask_contract_id) WHERE autotask_contract_id IS NOT NULL;

-- Contract services: line items within a contract
CREATE TABLE contract_services (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id     UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    service_name    TEXT NOT NULL,
    description     TEXT,
    unit_price      NUMERIC(10,2),
    quantity        NUMERIC(10,2) DEFAULT 1,
    billing_frequency TEXT,                           -- monthly, quarterly, annual, one_time
    autotask_service_id BIGINT,
    metadata        JSONB NOT NULL DEFAULT '{}',
    last_synced_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE contract_services IS 'Line items within an Autotask contract. Used for revenue and cost analysis.';

CREATE INDEX idx_contract_services_contract_id ON contract_services (contract_id);
CREATE INDEX idx_contract_services_autotask ON contract_services (autotask_service_id) WHERE autotask_service_id IS NOT NULL;

-- ============================================================================
-- TECHNOLOGY ROADMAPS
-- ============================================================================

-- Roadmap projects: forecasted projects with timeline
CREATE TABLE roadmap_projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    initiative_id   UUID REFERENCES initiatives(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    status          roadmap_project_status NOT NULL DEFAULT 'proposed',
    priority        recommendation_priority NOT NULL DEFAULT 'medium',
    assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,
    fiscal_year     INTEGER,
    fiscal_quarter  INTEGER CHECK (fiscal_quarter BETWEEN 1 AND 4),
    planned_start   DATE,
    planned_end     DATE,
    actual_start    DATE,
    actual_end      DATE,
    estimated_budget NUMERIC(12,2),
    actual_cost     NUMERIC(12,2),
    estimated_hours NUMERIC(8,2),
    actual_hours    NUMERIC(8,2),
    notes           TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE roadmap_projects IS 'Forecasted technology projects for a client roadmap. Linked to initiatives and budget items.';

CREATE INDEX idx_roadmap_projects_tenant_id ON roadmap_projects (tenant_id);
CREATE INDEX idx_roadmap_projects_client_id ON roadmap_projects (client_id);
CREATE INDEX idx_roadmap_projects_initiative ON roadmap_projects (initiative_id) WHERE initiative_id IS NOT NULL;
CREATE INDEX idx_roadmap_projects_status ON roadmap_projects (status);
CREATE INDEX idx_roadmap_projects_fiscal ON roadmap_projects (fiscal_year, fiscal_quarter);
CREATE INDEX idx_roadmap_projects_timeline ON roadmap_projects (planned_start, planned_end);

-- Roadmap project dependencies: project A depends on project B
CREATE TABLE roadmap_project_dependencies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES roadmap_projects(id) ON DELETE CASCADE,
    depends_on_id   UUID NOT NULL REFERENCES roadmap_projects(id) ON DELETE CASCADE,
    dependency_type TEXT NOT NULL DEFAULT 'finish_to_start', -- finish_to_start, start_to_start, etc.
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, depends_on_id),
    CHECK (project_id != depends_on_id)
);
COMMENT ON TABLE roadmap_project_dependencies IS 'Dependencies between roadmap projects. Prevents scheduling conflicts in timeline views.';

CREATE INDEX idx_roadmap_deps_project ON roadmap_project_dependencies (project_id);
CREATE INDEX idx_roadmap_deps_depends_on ON roadmap_project_dependencies (depends_on_id);

-- ============================================================================
-- BUDGET
-- ============================================================================

-- Budget items: line items for cost forecasting
CREATE TABLE budget_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    roadmap_project_id  UUID REFERENCES roadmap_projects(id) ON DELETE SET NULL,
    asset_id            UUID REFERENCES assets(id) ON DELETE SET NULL,
    name                TEXT NOT NULL,
    description         TEXT,
    category            budget_item_category NOT NULL DEFAULT 'other',
    frequency           budget_item_frequency NOT NULL DEFAULT 'one_time',
    amount              NUMERIC(12,2) NOT NULL DEFAULT 0,
    quantity            NUMERIC(10,2) NOT NULL DEFAULT 1,
    fiscal_year         INTEGER NOT NULL,
    fiscal_quarter      INTEGER CHECK (fiscal_quarter BETWEEN 1 AND 4),
    start_date          DATE,
    end_date            DATE,
    is_approved         BOOLEAN NOT NULL DEFAULT false,
    approved_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at         TIMESTAMPTZ,
    notes               TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE budget_items IS 'Budget line items: one-time, monthly, quarterly, or annual costs. Linked to roadmap projects or asset replacements.';

CREATE INDEX idx_budget_items_tenant_id ON budget_items (tenant_id);
CREATE INDEX idx_budget_items_client_id ON budget_items (client_id);
CREATE INDEX idx_budget_items_project ON budget_items (roadmap_project_id) WHERE roadmap_project_id IS NOT NULL;
CREATE INDEX idx_budget_items_asset ON budget_items (asset_id) WHERE asset_id IS NOT NULL;
CREATE INDEX idx_budget_items_fiscal ON budget_items (fiscal_year, fiscal_quarter);
CREATE INDEX idx_budget_items_category ON budget_items (category);
CREATE INDEX idx_budget_items_approved ON budget_items (is_approved);

-- Budget forecasts: aggregated budget view per client per period
CREATE TABLE budget_forecasts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    fiscal_year     INTEGER NOT NULL,
    fiscal_quarter  INTEGER CHECK (fiscal_quarter BETWEEN 1 AND 4),
    period_label    TEXT,                             -- e.g. 'Q1 2027', 'FY 2027'

    -- Aggregated amounts
    total_one_time  NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_monthly   NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_quarterly NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_annual    NUMERIC(12,2) NOT NULL DEFAULT 0,
    grand_total     NUMERIC(12,2) NOT NULL DEFAULT 0,

    -- Breakdowns by category (JSONB for flexibility)
    category_breakdown JSONB NOT NULL DEFAULT '{}',  -- { "hardware": 5000, "licensing": 1200, ... }

    is_approved     BOOLEAN NOT NULL DEFAULT false,
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, client_id, fiscal_year, fiscal_quarter)
);
COMMENT ON TABLE budget_forecasts IS 'Aggregated budget view per client per fiscal period. Precomputed for dashboard performance.';

CREATE INDEX idx_budget_forecasts_tenant_id ON budget_forecasts (tenant_id);
CREATE INDEX idx_budget_forecasts_client_id ON budget_forecasts (client_id);
CREATE INDEX idx_budget_forecasts_fiscal ON budget_forecasts (fiscal_year, fiscal_quarter);

-- ============================================================================
-- EOS (ENTREPRENEURIAL OPERATING SYSTEM)
-- ============================================================================

-- EOS Rocks: quarterly objectives (top 3 per client per quarter)
CREATE TABLE eos_rocks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    initiative_id   UUID REFERENCES initiatives(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    owner_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    client_owner    TEXT,                             -- client-side owner name (not a platform user)
    fiscal_year     INTEGER NOT NULL,
    fiscal_quarter  INTEGER NOT NULL CHECK (fiscal_quarter BETWEEN 1 AND 4),
    status          rock_status NOT NULL DEFAULT 'on_track',
    completion_pct  NUMERIC(5,2) DEFAULT 0 CHECK (completion_pct BETWEEN 0 AND 100),
    due_date        DATE,
    completed_date  DATE,
    notes           TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE eos_rocks IS 'EOS Rocks: top quarterly objectives per client. Typically 3 rocks per quarter, linked to initiatives.';

CREATE INDEX idx_eos_rocks_tenant_id ON eos_rocks (tenant_id);
CREATE INDEX idx_eos_rocks_client_id ON eos_rocks (client_id);
CREATE INDEX idx_eos_rocks_initiative ON eos_rocks (initiative_id) WHERE initiative_id IS NOT NULL;
CREATE INDEX idx_eos_rocks_owner ON eos_rocks (owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX idx_eos_rocks_quarter ON eos_rocks (fiscal_year, fiscal_quarter);
CREATE INDEX idx_eos_rocks_status ON eos_rocks (status);

-- EOS Scorecard measurables: KPI definitions
CREATE TABLE eos_scorecard_measurables (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    owner_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    client_owner    TEXT,                             -- client-side owner name
    frequency       measurable_frequency NOT NULL DEFAULT 'weekly',
    goal_value      NUMERIC(12,2),                   -- target value
    goal_direction  TEXT DEFAULT 'gte',              -- gte, lte, eq, range
    goal_min        NUMERIC(12,2),                   -- for range-type goals
    goal_max        NUMERIC(12,2),                   -- for range-type goals
    unit            TEXT,                             -- %, $, count, hours, etc.
    is_active       BOOLEAN NOT NULL DEFAULT true,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE eos_scorecard_measurables IS 'EOS Scorecard KPI definitions. Each measurable has a target goal and tracking frequency.';

CREATE INDEX idx_eos_measurables_tenant_id ON eos_scorecard_measurables (tenant_id);
CREATE INDEX idx_eos_measurables_client_id ON eos_scorecard_measurables (client_id);
CREATE INDEX idx_eos_measurables_owner ON eos_scorecard_measurables (owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX idx_eos_measurables_active ON eos_scorecard_measurables (tenant_id, is_active) WHERE is_active = true;

-- EOS Scorecard entries: weekly/monthly actual values
CREATE TABLE eos_scorecard_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    measurable_id   UUID NOT NULL REFERENCES eos_scorecard_measurables(id) ON DELETE CASCADE,
    period_date     DATE NOT NULL,                   -- the week-start or month-start date
    actual_value    NUMERIC(12,2),
    is_on_track     BOOLEAN,                         -- computed: does actual meet goal?
    notes           TEXT,
    entered_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (measurable_id, period_date)
);
COMMENT ON TABLE eos_scorecard_entries IS 'Actual values for scorecard measurables. One entry per period (week or month).';

CREATE INDEX idx_eos_entries_measurable ON eos_scorecard_entries (measurable_id);
CREATE INDEX idx_eos_entries_period ON eos_scorecard_entries (period_date DESC);
CREATE INDEX idx_eos_entries_on_track ON eos_scorecard_entries (is_on_track) WHERE is_on_track = false;

-- EOS To-Dos: monthly tasks linked to rocks
CREATE TABLE eos_todos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    rock_id         UUID REFERENCES eos_rocks(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    owner_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    client_owner    TEXT,
    status          todo_status NOT NULL DEFAULT 'open',
    due_date        DATE,
    completed_date  DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE eos_todos IS 'EOS To-Dos: short-term tasks, optionally linked to a Rock. Tracked monthly.';

CREATE INDEX idx_eos_todos_tenant_id ON eos_todos (tenant_id);
CREATE INDEX idx_eos_todos_client_id ON eos_todos (client_id);
CREATE INDEX idx_eos_todos_rock ON eos_todos (rock_id) WHERE rock_id IS NOT NULL;
CREATE INDEX idx_eos_todos_owner ON eos_todos (owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX idx_eos_todos_status ON eos_todos (status);
CREATE INDEX idx_eos_todos_due_date ON eos_todos (due_date) WHERE status = 'open';

-- EOS Issues: blockers with priority and resolution tracking
CREATE TABLE eos_issues (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    rock_id         UUID REFERENCES eos_rocks(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    priority        issue_priority NOT NULL DEFAULT 'medium',
    status          issue_status NOT NULL DEFAULT 'open',
    raised_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution      TEXT,
    resolved_date   DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE eos_issues IS 'EOS Issues List: blockers and problems raised during meetings. Tracked with IDS (Identify, Discuss, Solve).';

CREATE INDEX idx_eos_issues_tenant_id ON eos_issues (tenant_id);
CREATE INDEX idx_eos_issues_client_id ON eos_issues (client_id);
CREATE INDEX idx_eos_issues_rock ON eos_issues (rock_id) WHERE rock_id IS NOT NULL;
CREATE INDEX idx_eos_issues_priority ON eos_issues (priority);
CREATE INDEX idx_eos_issues_status ON eos_issues (status);
CREATE INDEX idx_eos_issues_assigned ON eos_issues (assigned_to) WHERE assigned_to IS NOT NULL;

-- ============================================================================
-- CSAT & CLIENT HEALTH
-- ============================================================================

-- CSAT responses: synced from Customer Thermometer
CREATE TABLE csat_responses (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id           UUID REFERENCES clients(id) ON DELETE SET NULL,
    rating              csat_rating NOT NULL,
    comment             TEXT,
    respondent_email    TEXT,
    respondent_name     TEXT,
    ticket_number       TEXT,                         -- Autotask ticket number
    technician_name     TEXT,
    technician_email    TEXT,
    survey_sent_at      TIMESTAMPTZ,
    responded_at        TIMESTAMPTZ,
    external_id         TEXT,
    external_source     sync_source_type DEFAULT 'customer_thermometer',
    metadata            JSONB NOT NULL DEFAULT '{}',
    last_synced_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE csat_responses IS 'Customer satisfaction responses synced from Customer Thermometer. Rating: gold/green/yellow/red mapped from temperature.';

CREATE INDEX idx_csat_responses_tenant_id ON csat_responses (tenant_id);
CREATE INDEX idx_csat_responses_client_id ON csat_responses (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_csat_responses_rating ON csat_responses (rating);
CREATE INDEX idx_csat_responses_ticket ON csat_responses (ticket_number) WHERE ticket_number IS NOT NULL;
CREATE INDEX idx_csat_responses_technician ON csat_responses (technician_email) WHERE technician_email IS NOT NULL;
CREATE INDEX idx_csat_responses_responded_at ON csat_responses (responded_at DESC);
CREATE INDEX idx_csat_responses_external ON csat_responses (external_id) WHERE external_id IS NOT NULL;

-- ============================================================================
-- REPORT BUILDER
-- ============================================================================

-- Report templates: layout definitions for QBR/monthly/annual reports
CREATE TABLE report_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    report_type     TEXT NOT NULL DEFAULT 'qbr',     -- qbr, monthly, annual, custom, dashboard
    layout_config   JSONB NOT NULL DEFAULT '{}',     -- page layout, margins, orientation, branding
    is_default      BOOLEAN NOT NULL DEFAULT false,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE report_templates IS 'Report template definitions for QBR, monthly, annual deliverables. Layout stored as JSONB for flexible page design.';

CREATE INDEX idx_report_templates_tenant_id ON report_templates (tenant_id);
CREATE INDEX idx_report_templates_type ON report_templates (report_type);
CREATE INDEX idx_report_templates_active ON report_templates (tenant_id, is_active) WHERE is_active = true;

-- Report widgets: reusable widget definitions
CREATE TABLE report_widgets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    widget_type     report_widget_type NOT NULL,
    data_source     TEXT NOT NULL,                    -- table/view/function name that feeds this widget
    query_config    JSONB NOT NULL DEFAULT '{}',     -- filters, aggregations, group-by, date ranges
    display_config  JSONB NOT NULL DEFAULT '{}',     -- colors, labels, thresholds, formatting
    default_size    JSONB DEFAULT '{"w": 6, "h": 4}', -- grid units for layout
    is_global       BOOLEAN NOT NULL DEFAULT false,  -- available to all tenants
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE report_widgets IS 'Reusable widget definitions: chart types, data source bindings, display configuration. Building blocks for reports.';

CREATE INDEX idx_report_widgets_tenant_id ON report_widgets (tenant_id);
CREATE INDEX idx_report_widgets_type ON report_widgets (widget_type);
CREATE INDEX idx_report_widgets_global ON report_widgets (is_global) WHERE is_global = true;

-- Report template widgets: junction with position/size
CREATE TABLE report_template_widgets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id     UUID NOT NULL REFERENCES report_templates(id) ON DELETE CASCADE,
    widget_id       UUID NOT NULL REFERENCES report_widgets(id) ON DELETE CASCADE,
    page_number     INTEGER NOT NULL DEFAULT 1,
    position_x      INTEGER NOT NULL DEFAULT 0,      -- grid column
    position_y      INTEGER NOT NULL DEFAULT 0,      -- grid row
    width           INTEGER NOT NULL DEFAULT 6,      -- grid columns spanned
    height          INTEGER NOT NULL DEFAULT 4,      -- grid rows spanned
    config_overrides JSONB DEFAULT '{}',             -- per-placement overrides of widget config
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (template_id, page_number, position_x, position_y)
);
COMMENT ON TABLE report_template_widgets IS 'Widget placement within a report template. Defines position, size, and per-placement config overrides.';

CREATE INDEX idx_report_template_widgets_template ON report_template_widgets (template_id);
CREATE INDEX idx_report_template_widgets_widget ON report_template_widgets (widget_id);

-- Report instances: generated reports with snapshot data
CREATE TABLE report_instances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    template_id     UUID REFERENCES report_templates(id) ON DELETE SET NULL,
    generated_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    schedule_id     UUID,                            -- FK added after report_schedules is created
    name            TEXT NOT NULL,
    report_type     TEXT NOT NULL,
    period_start    DATE,
    period_end      DATE,
    snapshot_data   JSONB NOT NULL DEFAULT '{}',     -- frozen data at time of generation
    pdf_storage_key TEXT,                             -- S3/storage key for generated PDF
    html_content    TEXT,                             -- rendered HTML for preview
    status          TEXT NOT NULL DEFAULT 'generating', -- generating, ready, failed, archived
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE report_instances IS 'Generated report instances with frozen snapshot data. Stores both renderable HTML and PDF storage reference.';

CREATE INDEX idx_report_instances_tenant_id ON report_instances (tenant_id);
CREATE INDEX idx_report_instances_client_id ON report_instances (client_id);
CREATE INDEX idx_report_instances_template ON report_instances (template_id) WHERE template_id IS NOT NULL;
CREATE INDEX idx_report_instances_generated_by ON report_instances (generated_by) WHERE generated_by IS NOT NULL;
CREATE INDEX idx_report_instances_status ON report_instances (status);
CREATE INDEX idx_report_instances_generated_at ON report_instances (generated_at DESC);

-- Report schedules: automated generation configuration
CREATE TABLE report_schedules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       UUID REFERENCES clients(id) ON DELETE CASCADE,  -- NULL = all clients
    template_id     UUID NOT NULL REFERENCES report_templates(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    frequency       report_schedule_frequency NOT NULL DEFAULT 'monthly',
    day_of_week     INTEGER CHECK (day_of_week BETWEEN 0 AND 6),    -- 0=Sunday, for weekly
    day_of_month    INTEGER CHECK (day_of_month BETWEEN 1 AND 28),  -- for monthly+
    month_of_year   INTEGER CHECK (month_of_year BETWEEN 1 AND 12), -- for quarterly/annual
    time_of_day     TIME DEFAULT '06:00:00',
    timezone        TEXT DEFAULT 'America/New_York',
    is_enabled      BOOLEAN NOT NULL DEFAULT true,
    auto_email      BOOLEAN NOT NULL DEFAULT false,
    email_recipients JSONB DEFAULT '[]',              -- list of email addresses
    last_run_at     TIMESTAMPTZ,
    next_run_at     TIMESTAMPTZ,
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE report_schedules IS 'Automated report generation schedules. Supports weekly/monthly/quarterly/annual cadence with optional email delivery.';

CREATE INDEX idx_report_schedules_tenant_id ON report_schedules (tenant_id);
CREATE INDEX idx_report_schedules_client_id ON report_schedules (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_report_schedules_template ON report_schedules (template_id);
CREATE INDEX idx_report_schedules_enabled ON report_schedules (is_enabled, next_run_at) WHERE is_enabled = true;

-- Add deferred FK from report_instances to report_schedules
ALTER TABLE report_instances
    ADD CONSTRAINT fk_report_instances_schedule
    FOREIGN KEY (schedule_id) REFERENCES report_schedules(id) ON DELETE SET NULL;

CREATE INDEX idx_report_instances_schedule ON report_instances (schedule_id) WHERE schedule_id IS NOT NULL;

-- ============================================================================
-- MEETINGS / QBRs
-- ============================================================================

-- Meetings: QBR/monthly/annual meetings with clients
CREATE TABLE meetings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    meeting_type    meeting_type NOT NULL DEFAULT 'qbr',
    status          meeting_status NOT NULL DEFAULT 'scheduled',
    title           TEXT NOT NULL,
    description     TEXT,
    scheduled_at    TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER DEFAULT 60,
    location        TEXT,                             -- physical location or video link
    conducted_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    report_instance_id UUID REFERENCES report_instances(id) ON DELETE SET NULL,
    notes           TEXT,                             -- meeting notes / minutes
    external_id     TEXT,                             -- from ScalePad meetings
    external_source sync_source_type,
    metadata        JSONB NOT NULL DEFAULT '{}',
    last_synced_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE meetings IS 'Client meetings (QBR, monthly, annual reviews). Synced from ScalePad or created manually. Links to generated reports.';

CREATE INDEX idx_meetings_tenant_id ON meetings (tenant_id);
CREATE INDEX idx_meetings_client_id ON meetings (client_id);
CREATE INDEX idx_meetings_type ON meetings (meeting_type);
CREATE INDEX idx_meetings_status ON meetings (status);
CREATE INDEX idx_meetings_scheduled_at ON meetings (scheduled_at DESC);
CREATE INDEX idx_meetings_conducted_by ON meetings (conducted_by) WHERE conducted_by IS NOT NULL;
CREATE INDEX idx_meetings_external ON meetings (external_source, external_id) WHERE external_id IS NOT NULL;

-- Meeting attendees
CREATE TABLE meeting_attendees (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id      UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    contact_id      UUID REFERENCES client_contacts(id) ON DELETE SET NULL,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    email           TEXT,
    role            TEXT,                             -- facilitator, attendee, presenter
    attended        BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (contact_id IS NOT NULL OR user_id IS NOT NULL OR email IS NOT NULL)
);
COMMENT ON TABLE meeting_attendees IS 'Meeting attendees — both platform users (vCIO/TAM) and client contacts.';

CREATE INDEX idx_meeting_attendees_meeting ON meeting_attendees (meeting_id);
CREATE INDEX idx_meeting_attendees_contact ON meeting_attendees (contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX idx_meeting_attendees_user ON meeting_attendees (user_id) WHERE user_id IS NOT NULL;

-- Meeting agenda items: linked to various entities
CREATE TABLE meeting_agenda_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id          UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    title               TEXT NOT NULL,
    description         TEXT,
    item_type           TEXT NOT NULL DEFAULT 'discussion', -- discussion, review, decision, presentation
    sort_order          INTEGER NOT NULL DEFAULT 0,
    duration_minutes    INTEGER,
    -- Optional links to platform entities
    recommendation_id   UUID REFERENCES recommendations(id) ON DELETE SET NULL,
    rock_id             UUID REFERENCES eos_rocks(id) ON DELETE SET NULL,
    measurable_id       UUID REFERENCES eos_scorecard_measurables(id) ON DELETE SET NULL,
    initiative_id       UUID REFERENCES initiatives(id) ON DELETE SET NULL,
    issue_id            UUID REFERENCES eos_issues(id) ON DELETE SET NULL,
    notes               TEXT,
    status              TEXT DEFAULT 'pending',       -- pending, discussed, deferred, completed
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE meeting_agenda_items IS 'Agenda items for meetings. Can link to recommendations, rocks, scorecard measurables, initiatives, or issues for structured QBR flow.';

CREATE INDEX idx_agenda_items_meeting ON meeting_agenda_items (meeting_id);
CREATE INDEX idx_agenda_items_recommendation ON meeting_agenda_items (recommendation_id) WHERE recommendation_id IS NOT NULL;
CREATE INDEX idx_agenda_items_rock ON meeting_agenda_items (rock_id) WHERE rock_id IS NOT NULL;
CREATE INDEX idx_agenda_items_initiative ON meeting_agenda_items (initiative_id) WHERE initiative_id IS NOT NULL;

-- Meeting action items: tasks arising from meetings
CREATE TABLE meeting_action_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id      UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_to_name TEXT,                            -- for client-side assignees
    due_date        DATE,
    status          todo_status NOT NULL DEFAULT 'open',
    completed_date  DATE,
    external_id     TEXT,                             -- from ScalePad action items
    external_source sync_source_type,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE meeting_action_items IS 'Action items arising from meetings. Tracked to completion between meeting cadences.';

CREATE INDEX idx_meeting_actions_meeting ON meeting_action_items (meeting_id);
CREATE INDEX idx_meeting_actions_assigned ON meeting_action_items (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_meeting_actions_status ON meeting_action_items (status);
CREATE INDEX idx_meeting_actions_due ON meeting_action_items (due_date) WHERE status = 'open';

-- ============================================================================
-- AUDIT LOG
-- ============================================================================

-- Audit log: tracks significant user actions for compliance
CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
    action          TEXT NOT NULL,                    -- e.g. 'assessment.created', 'recommendation.approved'
    entity_type     TEXT NOT NULL,                    -- table name
    entity_id       UUID,
    old_values      JSONB,
    new_values      JSONB,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE audit_log IS 'Audit trail for significant user actions. Supports compliance and change tracking.';

CREATE INDEX idx_audit_log_tenant_id ON audit_log (tenant_id);
CREATE INDEX idx_audit_log_user_id ON audit_log (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_audit_log_client_id ON audit_log (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_audit_log_action ON audit_log (action);
CREATE INDEX idx_audit_log_entity ON audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_log_created_at ON audit_log (created_at DESC);

-- ============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================================

-- Automatically update updated_at on row modification
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables that have the column
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT table_name
        FROM information_schema.columns
        WHERE column_name = 'updated_at'
          AND table_schema = 'public'
          AND table_name != 'audit_log'
    LOOP
        EXECUTE format(
            'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()',
            t
        );
    END LOOP;
END;
$$;

-- ============================================================================
-- SEED DATA: Default tenant and asset types
-- ============================================================================

-- Create predictiveIT as tenant #1
INSERT INTO tenants (name, slug, domain, settings) VALUES
    ('predictiveIT', 'predictiveit', 'predictiveit.com', '{"is_primary": true}');

-- Seed default asset types for the primary tenant
INSERT INTO asset_types (tenant_id, name, category, default_lifecycle_years, sort_order)
SELECT t.id, v.name, v.category, v.lifecycle, v.sort_order
FROM tenants t
CROSS JOIN (VALUES
    ('Workstation',     'hardware',    4, 1),
    ('Laptop',          'hardware',    4, 2),
    ('Server',          'hardware',    5, 3),
    ('Virtual Machine', 'hardware',    5, 4),
    ('Firewall',        'network',     5, 5),
    ('Switch',          'network',     7, 6),
    ('Access Point',    'network',     5, 7),
    ('Router',          'network',     7, 8),
    ('UPS',             'hardware',    5, 9),
    ('NAS/SAN',         'hardware',    5, 10),
    ('Printer',         'peripheral',  5, 11),
    ('Monitor',         'peripheral',  7, 12),
    ('Mobile Device',   'hardware',    3, 13),
    ('Docking Station', 'peripheral',  5, 14),
    ('Other',           'hardware',    5, 99)
) AS v(name, category, lifecycle, sort_order)
WHERE t.slug = 'predictiveit';

-- Seed default standard categories
INSERT INTO standard_categories (tenant_id, name, description, sort_order)
SELECT t.id, v.name, v.description, v.sort_order
FROM tenants t
CROSS JOIN (VALUES
    ('Security',             'Security policies, MFA, endpoint protection, email security',        1),
    ('Networking',           'Firewalls, switches, wireless, VPN, segmentation',                   2),
    ('Endpoint Management',  'Workstation/laptop standards, patching, RMM, encryption',            3),
    ('Server & Infrastructure', 'Server hardware, virtualization, storage, high availability',     4),
    ('Cloud & SaaS',         'M365/Google Workspace configuration, cloud services, identity',      5),
    ('Backup & DR',          'Backup policies, retention, disaster recovery, business continuity', 6),
    ('Email & Communication','Email filtering, archiving, Teams/Slack standards',                  7),
    ('Documentation',        'IT Glue completeness, password management, runbooks',                8),
    ('Compliance',           'Industry-specific compliance (HIPAA, PCI, SOC2, CMMC)',              9),
    ('End User Experience',  'Hardware age, performance, satisfaction, training',                   10)
) AS v(name, description, sort_order)
WHERE t.slug = 'predictiveit';

COMMIT;
