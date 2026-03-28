/**
 * Shared asset upsert helper used by all sync services.
 *
 * Implements a "find-or-merge" pattern: before inserting a new asset,
 * look for an existing record from another source that represents the same
 * physical device (matched by serial number or hostname within same client).
 * If found, merge the new source data onto the existing record.
 */

const db = require('../db')

// Serial numbers that are placeholder/junk — not useful for matching
const JUNK_SERIALS = new Set([
  'n/a', 'na', 'none', 'null', 'unknown', '', 'not available',
  'system serial number', 'default string', 'to be filled by o.e.m.',
  'o.e.m.', 'oem', 'asset tag', 'chassis serial number', 'no serial',
])

function isJunkSerial(serial) {
  if (!serial) return true
  const s = serial.trim().toLowerCase()
  if (JUNK_SERIALS.has(s)) return true
  if (s.length < 4) return true
  if (/^\d+\.?\d*e[+-]\d+$/i.test(s)) return true // scientific notation
  return false
}

/**
 * Find an existing asset for the same client with a matching serial or name,
 * from a DIFFERENT source (so we don't match the asset with itself).
 *
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} opts.clientId
 * @param {string} opts.source  - 'datto_rmm' | 'it_glue' | 'autotask' | 'auvik'
 * @param {string} opts.name    - hostname / display name
 * @param {string} opts.serial  - serial number
 * @returns {object|null} existing asset row or null
 */
async function findExistingAsset({ tenantId, clientId, source, name, serial }) {
  const validSerial = !isJunkSerial(serial) ? serial : null
  const validName   = name && name.trim().length >= 2 ? name.trim() : null

  if (!validSerial && !validName) return null

  // Exclude the source column that the caller will set — we only want cross-source matches
  const excludeCol = {
    datto_rmm: 'datto_rmm_device_id',
    it_glue:   'it_glue_config_id',
    autotask:  'autotask_ci_id',
    auvik:     'auvik_device_id',
  }[source]

  let row = null

  // 1. Try serial number first (more reliable)
  if (validSerial) {
    const r = await db.query(
      `SELECT * FROM assets
       WHERE tenant_id = $1 AND client_id = $2
         AND LOWER(TRIM(serial_number)) = LOWER(TRIM($3))
         AND ${excludeCol} IS NULL
       LIMIT 1`,
      [tenantId, clientId, validSerial]
    )
    row = r.rows[0] || null
  }

  // 2. Fall back to name match (case-insensitive)
  if (!row && validName) {
    const r = await db.query(
      `SELECT * FROM assets
       WHERE tenant_id = $1 AND client_id = $2
         AND LOWER(TRIM(name)) = LOWER(TRIM($3))
         AND ${excludeCol} IS NULL
       LIMIT 1`,
      [tenantId, clientId, validName]
    )
    row = r.rows[0] || null
  }

  return row
}

/**
 * Upsert a Datto RMM device.
 * Tries to merge onto an existing asset first; otherwise insert/update by datto_rmm_device_id.
 */
async function upsertDattoAsset({
  tenantId, clientId, assetTypeId, deviceId,
  name, serial, os, ipAddress, warrantyDate, isOnline, deviceData,
}) {
  // First try to find a cross-source match
  const existing = await findExistingAsset({
    tenantId, clientId, source: 'datto_rmm', name, serial,
  })

  if (existing) {
    // Merge datto data onto the existing record
    await db.query(
      `UPDATE assets SET
         datto_rmm_device_id = $2,
         datto_rmm_data      = $3,
         asset_type_id       = COALESCE(asset_type_id, $4),
         name                = $5,
         serial_number       = CASE WHEN serial_number IS NULL OR LENGTH(serial_number) < 4 THEN $6 ELSE serial_number END,
         operating_system    = COALESCE($7, operating_system),
         ip_address          = COALESCE($8::inet, ip_address),
         warranty_expiry     = COALESCE(warranty_expiry, $9),
         is_online           = $10,
         last_seen_at        = NOW(),
         updated_at          = NOW()
       WHERE id = $1`,
      [existing.id, deviceId, JSON.stringify(deviceData),
       assetTypeId, name, serial || null, os, ipAddress, warrantyDate, isOnline]
    )
    return { isNew: false, merged: true }
  }

  // No cross-source match — standard upsert by datto_rmm_device_id
  const result = await db.query(
    `INSERT INTO assets (
       tenant_id, client_id, asset_type_id, name,
       serial_number, operating_system, ip_address,
       warranty_expiry, is_online, is_active,
       primary_source, datto_rmm_device_id, datto_rmm_data, last_seen_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::inet,$8,$9,true,'datto_rmm',$10,$11,NOW())
     ON CONFLICT (tenant_id, datto_rmm_device_id) WHERE datto_rmm_device_id IS NOT NULL
     DO UPDATE SET
       client_id        = EXCLUDED.client_id,
       asset_type_id    = EXCLUDED.asset_type_id,
       name             = EXCLUDED.name,
       serial_number    = EXCLUDED.serial_number,
       operating_system = EXCLUDED.operating_system,
       ip_address       = EXCLUDED.ip_address,
       warranty_expiry  = EXCLUDED.warranty_expiry,
       is_online        = EXCLUDED.is_online,
       datto_rmm_data   = EXCLUDED.datto_rmm_data,
       last_seen_at     = NOW(),
       updated_at       = NOW()
     RETURNING (xmax = 0) AS is_insert`,
    [tenantId, clientId, assetTypeId, name, serial || null, os, ipAddress,
     warrantyDate, isOnline, deviceId, JSON.stringify(deviceData)]
  )
  return { isNew: result.rows[0]?.is_insert === true, merged: false }
}

/**
 * Upsert an IT Glue configuration.
 */
async function upsertItGlueAsset({
  tenantId, clientId, assetTypeId, configId,
  name, serial, warrantyDate, ipAddress, purchaseDate, configData,
}) {
  const existing = await findExistingAsset({
    tenantId, clientId, source: 'it_glue', name, serial,
  })

  if (existing) {
    await db.query(
      `UPDATE assets SET
         it_glue_config_id = $2,
         it_glue_data      = $3,
         asset_type_id     = COALESCE(asset_type_id, $4),
         serial_number     = CASE WHEN serial_number IS NULL OR LENGTH(serial_number) < 4 THEN $5 ELSE serial_number END,
         warranty_expiry   = COALESCE(warranty_expiry, $6),
         purchase_date     = COALESCE(purchase_date, $7),
         ip_address        = COALESCE(ip_address, $8::inet),
         last_seen_at      = NOW(),
         updated_at        = NOW()
       WHERE id = $1`,
      [existing.id, configId, JSON.stringify(configData),
       assetTypeId, serial || null, warrantyDate, purchaseDate, ipAddress]
    )
    return { isNew: false, merged: true }
  }

  const result = await db.query(
    `INSERT INTO assets (
       tenant_id, client_id, asset_type_id, name,
       serial_number, warranty_expiry, purchase_date, ip_address,
       is_active, primary_source, it_glue_config_id, it_glue_data, last_seen_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::inet,true,'it_glue',$9,$10,NOW())
     ON CONFLICT (tenant_id, it_glue_config_id) WHERE it_glue_config_id IS NOT NULL
     DO UPDATE SET
       client_id       = EXCLUDED.client_id,
       asset_type_id   = EXCLUDED.asset_type_id,
       name            = EXCLUDED.name,
       serial_number   = EXCLUDED.serial_number,
       warranty_expiry = EXCLUDED.warranty_expiry,
       purchase_date   = EXCLUDED.purchase_date,
       ip_address      = EXCLUDED.ip_address,
       it_glue_data    = EXCLUDED.it_glue_data,
       last_seen_at    = NOW(),
       updated_at      = NOW()
     RETURNING (xmax = 0) AS is_insert`,
    [tenantId, clientId, assetTypeId, name, serial || null, warrantyDate, purchaseDate, ipAddress,
     configId, JSON.stringify(configData)]
  )
  return { isNew: result.rows[0]?.is_insert === true, merged: false }
}

/**
 * Upsert an Autotask ConfigurationItem.
 */
async function upsertAutotaskAsset({
  tenantId, clientId, assetTypeId, ciId,
  name, serial, os, purchaseDate, warrantyDate, ciData,
}) {
  const existing = await findExistingAsset({
    tenantId, clientId, source: 'autotask', name, serial,
  })

  if (existing) {
    await db.query(
      `UPDATE assets SET
         autotask_ci_id    = $2,
         autotask_data     = $3,
         asset_type_id     = COALESCE(asset_type_id, $4),
         serial_number     = CASE WHEN serial_number IS NULL OR LENGTH(serial_number) < 4 THEN $5 ELSE serial_number END,
         operating_system  = COALESCE(operating_system, $6),
         purchase_date     = COALESCE(purchase_date, $7),
         warranty_expiry   = COALESCE(warranty_expiry, $8),
         last_seen_at      = NOW(),
         updated_at        = NOW()
       WHERE id = $1`,
      [existing.id, ciId, JSON.stringify(ciData),
       assetTypeId, serial || null, os, purchaseDate, warrantyDate]
    )
    return { isNew: false, merged: true }
  }

  const result = await db.query(
    `INSERT INTO assets (
       tenant_id, client_id, asset_type_id, name,
       serial_number, operating_system, purchase_date, warranty_expiry,
       is_active, primary_source, autotask_ci_id, autotask_data, last_seen_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,'autotask',$9,$10,NOW())
     ON CONFLICT (tenant_id, autotask_ci_id) WHERE autotask_ci_id IS NOT NULL
     DO UPDATE SET
       client_id        = EXCLUDED.client_id,
       asset_type_id    = EXCLUDED.asset_type_id,
       name             = EXCLUDED.name,
       serial_number    = EXCLUDED.serial_number,
       operating_system = EXCLUDED.operating_system,
       purchase_date    = EXCLUDED.purchase_date,
       warranty_expiry  = EXCLUDED.warranty_expiry,
       autotask_data    = EXCLUDED.autotask_data,
       last_seen_at     = NOW(),
       updated_at       = NOW()
     RETURNING (xmax = 0) AS is_insert`,
    [tenantId, clientId, assetTypeId, name, serial || null, os, purchaseDate, warrantyDate,
     ciId, JSON.stringify(ciData)]
  )
  return { isNew: result.rows[0]?.is_insert === true, merged: false }
}

module.exports = { upsertDattoAsset, upsertItGlueAsset, upsertAutotaskAsset, isJunkSerial }
