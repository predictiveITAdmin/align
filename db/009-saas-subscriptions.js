require('dotenv').config()
const db = require('../src/db')

async function up() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS saas_subscriptions (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      platform          TEXT NOT NULL,
      license_sku       TEXT,
      license_name      TEXT NOT NULL,
      total_seats       INTEGER NOT NULL DEFAULT 0,
      cost_per_seat     NUMERIC(8,2),
      subscription_start DATE,
      subscription_end   DATE,
      notes             TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, client_id, platform, license_name)
    )
  `)

  await db.query(`
    ALTER TABLE saas_licenses
      ADD COLUMN IF NOT EXISTS last_login_at   TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS mfa_enabled     BOOLEAN,
      ADD COLUMN IF NOT EXISTS mfa_method      TEXT,
      ADD COLUMN IF NOT EXISTS account_status  TEXT DEFAULT 'active'
  `)

  console.log('[009] saas_subscriptions table created, saas_licenses columns added')
}

up().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
