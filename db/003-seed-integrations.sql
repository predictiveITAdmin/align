-- ============================================================================
-- Seed integration sources for predictiveIT tenant
-- Credentials are stored per-tenant in the database for multi-tenant support
-- ============================================================================

DO $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'predictiveit';

  -- Note: Actual API keys should be entered via the Integration Center UI.
  -- This seed just creates the source records so they show as "configured".
  -- The sync services will fall back to .env vars if DB credentials are empty.

  INSERT INTO sync_sources (tenant_id, source_type, display_name, is_enabled, credentials, config)
  VALUES
    (v_tenant_id, 'autotask', 'Autotask PSA', true, '{"note":"Using .env credentials"}', '{}'),
    (v_tenant_id, 'datto_rmm', 'Datto RMM', true, '{"note":"Using .env credentials"}', '{}'),
    (v_tenant_id, 'it_glue', 'IT Glue', true, '{"note":"Using .env credentials"}', '{}'),
    (v_tenant_id, 'scalepad', 'ScalePad / Lifecycle Manager X', true, '{"note":"Using .env credentials"}', '{}'),
    (v_tenant_id, 'myitprocess', 'MyITProcess', true, '{"note":"Using .env credentials"}', '{}'),
    (v_tenant_id, 'saas_alerts', 'SaaS Alerts', true, '{"note":"Using .env credentials"}', '{}'),
    (v_tenant_id, 'auvik', 'Auvik', true, '{"note":"Using .env credentials"}', '{}'),
    (v_tenant_id, 'customer_thermometer', 'Customer Thermometer', true, '{"note":"Using .env credentials"}', '{}')
  ON CONFLICT (tenant_id, source_type) DO UPDATE SET
    is_enabled = true,
    updated_at = NOW();

  RAISE NOTICE 'Seeded 8 integration sources for predictiveIT';
END $$;
