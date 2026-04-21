-- TAM Migration 002: Tenant-managed verticals and LOB apps lists
-- Run via: node scripts/run-migration.js scripts/tam_migration_002.sql

-- Tenant verticals (managed list — admin can add/remove)
CREATE TABLE IF NOT EXISTS tenant_verticals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  autotask_classification TEXT,  -- maps Autotask classification label → this vertical
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, slug)
);

-- Tenant LOB apps (managed list — seeded from software inventory + manual adds)
CREATE TABLE IF NOT EXISTS tenant_lob_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  vendor TEXT,
  category TEXT DEFAULT 'general',  -- e.g. accounting, ehr, crm, erp, cad, legal, dental
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenant_verticals_tenant ON tenant_verticals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_lob_apps_tenant ON tenant_lob_apps(tenant_id);

-- Seed default verticals
INSERT INTO tenant_verticals (tenant_id, name, slug, sort_order)
SELECT t.id, v.name, v.slug, v.sort_order
FROM (SELECT id FROM tenants LIMIT 1) t
CROSS JOIN (VALUES
  ('Accounting / CPA',        'accounting',          1),
  ('Construction',             'construction',        2),
  ('Dental',                   'dental',              3),
  ('Education',                'education',           4),
  ('Engineering',              'engineering',          5),
  ('Financial Services',       'financial_services',   6),
  ('Healthcare',               'healthcare',           7),
  ('Insurance',                'insurance',            8),
  ('Legal',                    'legal',                9),
  ('Manufacturing',            'manufacturing',       10),
  ('Nonprofit',                'nonprofit',           11),
  ('Real Estate',              'real_estate',         12),
  ('Restaurant / Hospitality', 'restaurant',          13),
  ('Retail',                   'retail',              14),
  ('Technology',               'technology',          15),
  ('Professional Services',    'professional_services',16),
  ('Other',                    'other',               99)
) AS v(name, slug, sort_order)
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- Seed common LOB apps
INSERT INTO tenant_lob_apps (tenant_id, name, vendor, category)
SELECT t.id, a.name, a.vendor, a.category
FROM (SELECT id FROM tenants LIMIT 1) t
CROSS JOIN (VALUES
  ('QuickBooks Desktop',  'Intuit',         'accounting'),
  ('QuickBooks Online',   'Intuit',         'accounting'),
  ('Sage 50',             'Sage',           'accounting'),
  ('Sage 100',            'Sage',           'accounting'),
  ('Xero',                'Xero',           'accounting'),
  ('Dentrix',             'Henry Schein',   'dental'),
  ('Eaglesoft',           'Patterson',      'dental'),
  ('Open Dental',         'Open Dental',    'dental'),
  ('Epic',                'Epic Systems',   'ehr'),
  ('eClinicalWorks',      'eClinicalWorks', 'ehr'),
  ('Athenahealth',        'Athenahealth',   'ehr'),
  ('Clio',                'Clio',           'legal'),
  ('PracticePanther',     'PracticePanther','legal'),
  ('Salesforce',          'Salesforce',     'crm'),
  ('HubSpot',             'HubSpot',        'crm'),
  ('AutoCAD',             'Autodesk',       'cad'),
  ('Revit',               'Autodesk',       'cad'),
  ('SolidWorks',          'Dassault',       'cad'),
  ('SAP Business One',    'SAP',            'erp'),
  ('NetSuite',            'Oracle',         'erp'),
  ('Procore',             'Procore',        'construction'),
  ('Buildertrend',        'Buildertrend',   'construction'),
  ('Toast POS',           'Toast',          'pos'),
  ('Square POS',          'Square',         'pos'),
  ('Blackbaud',           'Blackbaud',      'nonprofit'),
  ('Adobe Creative Suite','Adobe',          'design'),
  ('Microsoft Dynamics',  'Microsoft',      'erp'),
  ('Fishbowl',            'Fishbowl',       'inventory'),
  ('Shopify',             'Shopify',        'ecommerce'),
  ('WooCommerce',         'Automattic',     'ecommerce')
) AS a(name, vendor, category)
ON CONFLICT (tenant_id, name) DO NOTHING;
