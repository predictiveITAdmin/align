/**
 * Asset Deduplication Service
 *
 * Merges duplicate asset records that represent the same physical device
 * but were created by different sync sources (Datto RMM, IT Glue, Autotask, Auvik).
 *
 * Matching strategy (within same client):
 *   1. Exact serial number match (excluding junk values)
 *   2. Case-insensitive name/hostname match
 *
 * Source priority for keeping primary record: Datto RMM > Autotask > IT Glue > Auvik
 */

const db = require('../db')

// Serial numbers that are placeholder/junk — not useful for matching
const JUNK_SERIALS = new Set([
  'n/a', 'na', 'none', 'null', 'unknown', '', 'not available',
  'system serial number', 'default string', 'to be filled by o.e.m.',
  'o.e.m.', 'oem', 'asset tag', 'chassis serial number',
])

function isJunkSerial(serial) {
  if (!serial) return true
  const s = serial.trim().toLowerCase()
  if (JUNK_SERIALS.has(s)) return true
  if (s.length < 3) return true
  // Scientific notation like "4.02E+13"
  if (/^\d+\.?\d*e[+-]\d+$/i.test(s)) return true
  return false
}

// Source priority (lower = higher priority)
const SOURCE_PRIORITY = {
  datto_rmm:  1,
  autotask:   2,
  it_glue:    3,
  auvik:      4,
}

function sourcePriority(asset) {
  if (asset.datto_rmm_device_id) return SOURCE_PRIORITY.datto_rmm
  if (asset.autotask_ci_id)      return SOURCE_PRIORITY.autotask
  if (asset.it_glue_config_id)   return SOURCE_PRIORITY.it_glue
  if (asset.auvik_device_id)     return SOURCE_PRIORITY.auvik
  return 99
}

/**
 * Merge a list of duplicate assets onto the primary record.
 * Returns the number of records deleted.
 */
async function mergeGroup(primary, duplicates) {
  // Build the merged field values — best wins
  const mergeFields = {
    // Source IDs — aggregate all
    datto_rmm_device_id: primary.datto_rmm_device_id,
    it_glue_config_id:   primary.it_glue_config_id,
    autotask_ci_id:      primary.autotask_ci_id,
    auvik_device_id:     primary.auvik_device_id,
    // Source JSONB data
    datto_rmm_data:  primary.datto_rmm_data  || {},
    it_glue_data:    primary.it_glue_data    || {},
    autotask_data:   primary.autotask_data   || {},
    auvik_data:      primary.auvik_data      || {},
    // Best scalar fields — prefer non-null, prefer higher-priority source
    serial_number:    primary.serial_number,
    manufacturer:     primary.manufacturer,
    model:            primary.model,
    operating_system: primary.operating_system,
    os_version:       primary.os_version,
    warranty_expiry:  primary.warranty_expiry,
    purchase_date:    primary.purchase_date,
    asset_type_id:    primary.asset_type_id,
  }

  for (const dup of duplicates) {
    // Aggregate source IDs
    if (!mergeFields.datto_rmm_device_id && dup.datto_rmm_device_id) mergeFields.datto_rmm_device_id = dup.datto_rmm_device_id
    if (!mergeFields.it_glue_config_id   && dup.it_glue_config_id)   mergeFields.it_glue_config_id   = dup.it_glue_config_id
    if (!mergeFields.autotask_ci_id      && dup.autotask_ci_id)       mergeFields.autotask_ci_id       = dup.autotask_ci_id
    if (!mergeFields.auvik_device_id     && dup.auvik_device_id)       mergeFields.auvik_device_id     = dup.auvik_device_id
    // Merge JSONB data if dup has non-empty
    if (Object.keys(dup.datto_rmm_data  || {}).length > 0 && Object.keys(mergeFields.datto_rmm_data).length  === 0) mergeFields.datto_rmm_data  = dup.datto_rmm_data
    if (Object.keys(dup.it_glue_data    || {}).length > 0 && Object.keys(mergeFields.it_glue_data).length    === 0) mergeFields.it_glue_data    = dup.it_glue_data
    if (Object.keys(dup.autotask_data   || {}).length > 0 && Object.keys(mergeFields.autotask_data).length   === 0) mergeFields.autotask_data   = dup.autotask_data
    if (Object.keys(dup.auvik_data      || {}).length > 0 && Object.keys(mergeFields.auvik_data).length      === 0) mergeFields.auvik_data      = dup.auvik_data
    // Fill in missing scalar fields
    if (!mergeFields.serial_number    && !isJunkSerial(dup.serial_number))  mergeFields.serial_number    = dup.serial_number
    if (!mergeFields.manufacturer     && dup.manufacturer)   mergeFields.manufacturer     = dup.manufacturer
    if (!mergeFields.model            && dup.model)          mergeFields.model            = dup.model
    if (!mergeFields.operating_system && dup.operating_system) mergeFields.operating_system = dup.operating_system
    if (!mergeFields.os_version       && dup.os_version)     mergeFields.os_version       = dup.os_version
    if (!mergeFields.warranty_expiry  && dup.warranty_expiry) mergeFields.warranty_expiry  = dup.warranty_expiry
    if (!mergeFields.purchase_date    && dup.purchase_date)  mergeFields.purchase_date    = dup.purchase_date
    if (!mergeFields.asset_type_id    && dup.asset_type_id)  mergeFields.asset_type_id    = dup.asset_type_id
  }

  // Determine primary source label
  let primarySource = 'autotask'
  if (mergeFields.datto_rmm_device_id) primarySource = 'datto_rmm'
  else if (mergeFields.autotask_ci_id) primarySource = 'autotask'
  else if (mergeFields.it_glue_config_id) primarySource = 'it_glue'
  else if (mergeFields.auvik_device_id) primarySource = 'auvik'

  const dupIds = duplicates.map(d => d.id)

  // DELETE duplicates FIRST to release unique constraints on source IDs,
  // then UPDATE the primary with the merged data.
  if (dupIds.length > 0) {
    await db.query(`DELETE FROM assets WHERE id = ANY($1)`, [dupIds])
  }

  await db.query(
    `UPDATE assets SET
      datto_rmm_device_id = $2,
      it_glue_config_id   = $3,
      autotask_ci_id      = $4,
      auvik_device_id     = $5,
      datto_rmm_data      = $6,
      it_glue_data        = $7,
      autotask_data       = $8,
      auvik_data          = $9,
      serial_number       = COALESCE($10, serial_number),
      manufacturer        = COALESCE($11, manufacturer),
      model               = COALESCE($12, model),
      operating_system    = COALESCE($13, operating_system),
      os_version          = COALESCE($14, os_version),
      warranty_expiry     = COALESCE($15, warranty_expiry),
      purchase_date       = COALESCE($16, purchase_date),
      asset_type_id       = COALESCE($17, asset_type_id),
      primary_source      = $18,
      updated_at          = NOW()
     WHERE id = $1`,
    [
      primary.id,
      mergeFields.datto_rmm_device_id,
      mergeFields.it_glue_config_id,
      mergeFields.autotask_ci_id,
      mergeFields.auvik_device_id,
      JSON.stringify(mergeFields.datto_rmm_data),
      JSON.stringify(mergeFields.it_glue_data),
      JSON.stringify(mergeFields.autotask_data),
      JSON.stringify(mergeFields.auvik_data),
      !isJunkSerial(mergeFields.serial_number) ? mergeFields.serial_number : null,
      mergeFields.manufacturer,
      mergeFields.model,
      mergeFields.operating_system,
      mergeFields.os_version,
      mergeFields.warranty_expiry,
      mergeFields.purchase_date,
      mergeFields.asset_type_id,
      primarySource,
    ]
  )

  return dupIds.length
}

/**
 * Run the full deduplication process.
 * Returns stats on merges performed.
 */
async function deduplicateAssets(tenantId) {
  console.log('[asset-dedup] Starting deduplication...')

  let mergedCount = 0
  let deletedCount = 0
  let processedGroups = 0

  // Fetch all assets for this tenant
  const { rows: assets } = await db.query(
    `SELECT id, client_id, name, serial_number, asset_type_id,
            datto_rmm_device_id, it_glue_config_id, autotask_ci_id, auvik_device_id,
            datto_rmm_data, it_glue_data, autotask_data, auvik_data,
            manufacturer, model, operating_system, os_version,
            warranty_expiry, purchase_date, primary_source
     FROM assets WHERE tenant_id = $1`,
    [tenantId]
  )

  console.log(`[asset-dedup] Loaded ${assets.length} assets`)

  // Group by client_id → then find duplicates by name or serial
  const byClient = {}
  for (const a of assets) {
    if (!byClient[a.client_id]) byClient[a.client_id] = []
    byClient[a.client_id].push(a)
  }

  for (const [clientId, clientAssets] of Object.entries(byClient)) {
    // Pass 1: Match by serial number
    const bySerial = {}
    for (const a of clientAssets) {
      if (!a.serial_number || isJunkSerial(a.serial_number)) continue
      const key = a.serial_number.trim().toLowerCase()
      if (!bySerial[key]) bySerial[key] = []
      bySerial[key].push(a)
    }

    const mergedIds = new Set() // track IDs already merged away

    for (const [, group] of Object.entries(bySerial)) {
      if (group.length < 2) continue
      const eligible = group.filter(a => !mergedIds.has(a.id))
      if (eligible.length < 2) continue

      // Sort by source priority
      eligible.sort((a, b) => sourcePriority(a) - sourcePriority(b))
      const [primary, ...dups] = eligible

      const deleted = await mergeGroup(primary, dups)
      dups.forEach(d => mergedIds.add(d.id))
      mergedCount++
      deletedCount += deleted
      processedGroups++
    }

    // Pass 2: Match by normalized name (skip already-merged)
    const byName = {}
    for (const a of clientAssets) {
      if (mergedIds.has(a.id)) continue
      if (!a.name || a.name.trim().length < 2) continue
      const key = a.name.trim().toLowerCase()
      if (!byName[key]) byName[key] = []
      byName[key].push(a)
    }

    for (const [, group] of Object.entries(byName)) {
      const eligible = group.filter(a => !mergedIds.has(a.id))
      if (eligible.length < 2) continue

      // Only merge if they come from different sources
      const sources = new Set()
      for (const a of eligible) {
        if (a.datto_rmm_device_id) sources.add('datto')
        else if (a.autotask_ci_id) sources.add('autotask')
        else if (a.it_glue_config_id) sources.add('itg')
        else if (a.auvik_device_id) sources.add('auvik')
        else sources.add('unknown')
      }

      if (sources.size < 2) continue // all from same source, skip

      eligible.sort((a, b) => sourcePriority(a) - sourcePriority(b))
      const [primary, ...dups] = eligible

      const deleted = await mergeGroup(primary, dups)
      dups.forEach(d => mergedIds.add(d.id))
      mergedCount++
      deletedCount += deleted
      processedGroups++
    }
  }

  console.log(`[asset-dedup] Done: ${processedGroups} groups merged, ${deletedCount} duplicate records removed`)
  return { mergedGroups: processedGroups, deletedRecords: deletedCount }
}

module.exports = { deduplicateAssets, isJunkSerial }
