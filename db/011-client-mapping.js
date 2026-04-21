const db = require('../src/db')

async function migrate() {
  // Add account_type and parent_client_id to clients
  await db.query(`
    ALTER TABLE clients
      ADD COLUMN IF NOT EXISTS account_type TEXT,
      ADD COLUMN IF NOT EXISTS parent_client_id UUID REFERENCES clients(id) ON DELETE SET NULL
  `)

  // External system mappings table
  await db.query(`
    CREATE TABLE IF NOT EXISTS client_external_mappings (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      source_type     TEXT NOT NULL,
      external_id     TEXT,
      external_name   TEXT NOT NULL,
      is_confirmed    BOOLEAN DEFAULT false,
      confidence      NUMERIC(4,2) DEFAULT 0,
      created_at      TIMESTAMPTZ DEFAULT now(),
      updated_at      TIMESTAMPTZ DEFAULT now(),
      UNIQUE(tenant_id, source_type, external_name)
    )
  `)

  await db.query(`CREATE INDEX IF NOT EXISTS idx_cem_tenant_source ON client_external_mappings(tenant_id, source_type)`)
  await db.query(`CREATE INDEX IF NOT EXISTS idx_cem_client ON client_external_mappings(client_id)`)

  console.log('[011] client mapping migration complete')
  process.exit(0)
}

migrate().catch(e => { console.error(e.message); process.exit(1) })
