const db = require('../src/db')

async function migrate() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS autotask_company_type_filters (
      id            SERIAL PRIMARY KEY,
      tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      field_name    TEXT NOT NULL,        -- 'companyType' | 'classification' | 'marketSegmentID'
      picklist_value INTEGER NOT NULL,
      picklist_label TEXT NOT NULL,
      is_synced     BOOLEAN NOT NULL DEFAULT false,
      created_at    TIMESTAMPTZ DEFAULT now(),
      updated_at    TIMESTAMPTZ DEFAULT now(),
      UNIQUE(tenant_id, field_name, picklist_value)
    )
  `)
  await db.query(`CREATE INDEX IF NOT EXISTS idx_actf_tenant ON autotask_company_type_filters(tenant_id)`)
  console.log('[012] autotask company type filters migration complete')
  process.exit(0)
}

migrate().catch(e => { console.error(e.message); process.exit(1) })
