require('dotenv').config({ override: true, path: '/opt/align/.env' })
const { Pool } = require('pg')
const p = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
})

async function run() {
  console.log('Adding hardware detail columns...')
  await p.query(`
    ALTER TABLE assets
      ADD COLUMN IF NOT EXISTS hostname           TEXT,
      ADD COLUMN IF NOT EXISTS last_user          TEXT,
      ADD COLUMN IF NOT EXISTS ram_bytes          BIGINT,
      ADD COLUMN IF NOT EXISTS storage_bytes      BIGINT,
      ADD COLUMN IF NOT EXISTS storage_free_bytes BIGINT,
      ADD COLUMN IF NOT EXISTS cpu_description    TEXT,
      ADD COLUMN IF NOT EXISTS cpu_cores          SMALLINT
  `)
  console.log('✓ Columns added')

  let r = await p.query(`
    UPDATE assets
    SET hostname = COALESCE(datto_rmm_data->>'hostname', autotask_data->>'rmmDeviceAuditHostname')
    WHERE hostname IS NULL
  `)
  console.log('✓ hostname backfill:', r.rowCount, 'rows')

  r = await p.query(`
    UPDATE assets
    SET last_user = CASE
      WHEN datto_rmm_data->>'lastLoggedInUser' LIKE '%\\%'
        THEN SPLIT_PART(datto_rmm_data->>'lastLoggedInUser', '\\', 2)
      ELSE datto_rmm_data->>'lastLoggedInUser'
    END
    WHERE last_user IS NULL
      AND datto_rmm_data->>'lastLoggedInUser' IS NOT NULL
      AND datto_rmm_data->>'lastLoggedInUser' != ''
  `)
  console.log('✓ last_user backfill:', r.rowCount, 'rows')

  r = await p.query(`
    UPDATE assets
    SET ram_bytes = NULLIF(autotask_data->>'rmmDeviceAuditMemoryBytes', '')::BIGINT
    WHERE ram_bytes IS NULL
      AND autotask_data->>'rmmDeviceAuditMemoryBytes' IS NOT NULL
      AND autotask_data->>'rmmDeviceAuditMemoryBytes' != '0'
      AND autotask_data->>'rmmDeviceAuditMemoryBytes' != ''
  `)
  console.log('✓ ram_bytes backfill:', r.rowCount, 'rows')

  r = await p.query(`
    UPDATE assets
    SET storage_bytes = NULLIF(autotask_data->>'rmmDeviceAuditStorageBytes', '')::BIGINT
    WHERE storage_bytes IS NULL
      AND autotask_data->>'rmmDeviceAuditStorageBytes' IS NOT NULL
      AND autotask_data->>'rmmDeviceAuditStorageBytes' != '0'
      AND autotask_data->>'rmmDeviceAuditStorageBytes' != ''
  `)
  console.log('✓ storage_bytes backfill:', r.rowCount, 'rows')

  // Mark stale RMM assets (not seen in 60 days, not online) as inactive
  r = await p.query(`
    UPDATE assets
    SET is_active = false
    WHERE datto_rmm_device_id IS NOT NULL
      AND last_seen_at IS NOT NULL
      AND last_seen_at < NOW() - INTERVAL '60 days'
      AND (is_online = false OR is_online IS NULL)
  `)
  console.log('✓ stale→inactive:', r.rowCount, 'assets marked inactive')

  console.log('Migration complete.')
}

run().then(() => p.end()).catch(e => { console.error('Error:', e.message); p.end(); process.exit(1) })
