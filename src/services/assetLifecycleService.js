/**
 * Asset Lifecycle Check Service
 *
 * Handles the configurable logic for marking assets inactive when:
 * - They belong to RMM-managed device types (Workstation, Laptop, Server, etc.)
 * - They are absent from RMM for more than a configurable threshold
 * - They may still appear in other sources (AT, ITG, Auvik)
 *
 * Config (stored in tenant_settings.asset_lifecycle_config JSONB):
 * {
 *   enabled: boolean,
 *   rmm_managed_categories: string[],   // asset type categories: 'workstation','laptop','server'
 *   absent_threshold_days: number,      // days absent from RMM before action
 *   absent_action: 'mark_inactive' | 'flag_only',
 *   rmm_is_last_seen_source: boolean    // if true, last_seen only comes from RMM
 * }
 */

const db = require('../db')

const DEFAULT_CONFIG = {
  enabled: false,
  rmm_managed_categories: ['workstation', 'laptop', 'server'],
  absent_threshold_days: 30,
  absent_action: 'mark_inactive',
  rmm_is_last_seen_source: true,
}

/**
 * Get lifecycle config for a tenant, merged with defaults.
 */
async function getLifecycleConfig(tenantId) {
  const row = await db.query(
    `SELECT asset_lifecycle_config FROM tenant_settings WHERE tenant_id = $1`,
    [tenantId]
  )
  const stored = row.rows[0]?.asset_lifecycle_config || {}
  return { ...DEFAULT_CONFIG, ...stored }
}

/**
 * Save lifecycle config for a tenant.
 */
async function saveLifecycleConfig(tenantId, config) {
  await db.query(
    `INSERT INTO tenant_settings (tenant_id, asset_lifecycle_config, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET
       asset_lifecycle_config = $2,
       updated_at             = NOW()`,
    [tenantId, JSON.stringify(config)]
  )
  return config
}

/**
 * Run the lifecycle check for a tenant.
 * Returns stats: { checked, marked_inactive, flagged, skipped }
 */
async function runLifecycleCheck(tenantId) {
  const config = await getLifecycleConfig(tenantId)

  if (!config.enabled) {
    return { skipped: 0, checked: 0, marked_inactive: 0, flagged: 0, message: 'Lifecycle check is disabled' }
  }

  const thresholdDays = config.absent_threshold_days || 30
  const action = config.absent_action || 'mark_inactive'
  const managedCategories = (config.rmm_managed_categories || []).map(c => c.toLowerCase())

  if (!managedCategories.length) {
    return { skipped: 0, checked: 0, marked_inactive: 0, flagged: 0, message: 'No RMM-managed categories configured' }
  }

  // Find active assets of RMM-managed categories that are either:
  // 1. Never seen in RMM (no datto_rmm_device_id) but found in other sources
  // 2. Previously in RMM but last_seen_at is stale
  const result = await db.query(
    `SELECT a.id, a.name, a.datto_rmm_device_id, a.last_seen_at, a.last_seen_source,
            a.autotask_ci_id, a.it_glue_config_id, a.auvik_device_id,
            at.name as type_name, at.category
     FROM assets a
     LEFT JOIN asset_types at ON at.id = a.asset_type_id
     WHERE a.tenant_id = $1
       AND a.is_active = true
       AND LOWER(at.category) = ANY($2::text[])
     ORDER BY a.name`,
    [tenantId, managedCategories]
  )

  const assets = result.rows
  const stats = { checked: assets.length, marked_inactive: 0, flagged: 0, skipped: 0 }
  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000

  for (const asset of assets) {
    let shouldAct = false
    let reason = null

    const hasRmm = !!asset.datto_rmm_device_id
    const lastSeen = asset.last_seen_at ? new Date(asset.last_seen_at) : null
    const daysSinceLastSeen = lastSeen ? (Date.now() - lastSeen.getTime()) / 86400000 : null

    if (!hasRmm) {
      // Device is of a managed type but has never been seen in RMM
      // Only act if it has other source data (not a manually entered asset with no sources)
      const hasOtherSource = asset.autotask_ci_id || asset.it_glue_config_id || asset.auvik_device_id
      if (hasOtherSource) {
        shouldAct = true
        const sources = [
          asset.autotask_ci_id ? 'Autotask' : null,
          asset.it_glue_config_id ? 'IT Glue' : null,
          asset.auvik_device_id ? 'Auvik' : null,
        ].filter(Boolean)
        reason = `Not in RMM — last seen via ${sources.join(', ')}`
      }
    } else if (daysSinceLastSeen !== null && daysSinceLastSeen > thresholdDays) {
      shouldAct = true
      reason = `Absent from RMM for ${Math.round(daysSinceLastSeen)} days (threshold: ${thresholdDays})`
    }

    if (!shouldAct) {
      stats.skipped++
      continue
    }

    if (action === 'mark_inactive') {
      await db.query(
        `UPDATE assets SET is_active = false, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
        [asset.id, tenantId]
      )
      stats.marked_inactive++
      console.log(`[lifecycle] Marked inactive: ${asset.name} (${reason})`)
    } else if (action === 'flag_only') {
      // flag_only: update last_seen_source to note the absence without deactivating
      await db.query(
        `UPDATE assets SET last_seen_source = $3, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
        [asset.id, tenantId, reason]
      )
      stats.flagged++
      console.log(`[lifecycle] Flagged: ${asset.name} (${reason})`)
    }
  }

  // Log the run
  await db.query(
    `INSERT INTO warranty_lookup_log (tenant_id, manufacturer, total, updated, skipped, errors, status)
     VALUES ($1, 'lifecycle_check', $2, $3, $4, 0, 'completed')`,
    [tenantId, stats.checked, stats.marked_inactive + stats.flagged, stats.skipped]
  ).catch(() => {}) // non-fatal if log fails

  console.log(`[lifecycle] Done: ${stats.checked} checked, ${stats.marked_inactive} deactivated, ${stats.flagged} flagged, ${stats.skipped} ok`)
  return stats
}

module.exports = { getLifecycleConfig, saveLifecycleConfig, runLifecycleCheck, DEFAULT_CONFIG }
