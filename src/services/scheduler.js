/**
 * scheduler.js — Automatic sync runner
 *
 * Runs every SYNC_INTERVAL_MS (default 2 hours) for all tenants.
 * Only syncs integrations that are actually configured (present in sync_sources table).
 *
 * Syncs covered:
 *   autotask      → clients, assets, contacts
 *   datto_rmm     → assets
 *   it_glue       → documentation / asset enrichment
 *   saas_alerts   → saas licenses
 *   auvik         → network devices
 *   customer_thermometer → CSAT responses
 */

const db = require('../db')
const { syncClients }   = require('./autotaskSync')
const { syncAssets }    = require('./autotaskAssetSync')
const { syncContacts }  = require('./autotaskContactsSync')
const { syncDattoRmm }  = require('./dattoRmmSync')
const { syncItGlue }    = require('./itGlueSync')
const { syncSaasAlerts }= require('./saasAlertsSync')
const { syncAuvik }     = require('./auvikSync')
const { syncCSAT }      = require('./csatSync')
const { syncMsPartner } = require('./msPartnerSync')
const { syncPax8 }      = require('./pax8Sync')
const { syncAll: syncOpportunities } = require('./opportunitiesSync')
const { syncAllSuppliers }           = require('./distributorSync')

const SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000  // 2 hours
const INITIAL_DELAY_MS = 60 * 1000            // wait 1 min after startup before first run

// Map sync_sources.source_type → array of { label, fn } to run in order
const SYNC_MAP = {
  autotask:             [
    { label: 'clients',       fn: syncClients       },
    { label: 'assets',        fn: syncAssets        },
    { label: 'contacts',      fn: syncContacts      },
    { label: 'opportunities', fn: syncOpportunities },  // order management
  ],
  datto_rmm:            [{ label: 'assets',        fn: syncDattoRmm     }],
  it_glue:              [{ label: 'it_glue',        fn: syncItGlue       }],
  saas_alerts:          [{ label: 'licenses',       fn: syncSaasAlerts   }],
  auvik:                [{ label: 'network',         fn: syncAuvik        }],
  customer_thermometer: [{ label: 'csat',            fn: syncCSAT         }],
  ms_partner:           [{ label: 'licenses',        fn: syncMsPartner   }],
  pax8:                 [{ label: 'subscriptions',   fn: syncPax8         }],
}

/**
 * Get all active tenants and their configured source_types.
 * Returns: [{ tenantId, slug, sources: Set<string> }]
 */
async function getTenantsWithSources() {
  const [tenants, sources] = await Promise.all([
    db.query(`SELECT id, slug FROM tenants WHERE is_active = true ORDER BY slug`),
    db.query(`SELECT tenant_id, source_type FROM sync_sources`),
  ])

  const sourcesByTenant = {}
  for (const row of sources.rows) {
    if (!sourcesByTenant[row.tenant_id]) sourcesByTenant[row.tenant_id] = new Set()
    sourcesByTenant[row.tenant_id].add(row.source_type)
  }

  return tenants.rows.map(t => ({
    tenantId: t.id,
    slug: t.slug,
    sources: sourcesByTenant[t.id] || new Set(),
  }))
}

/**
 * Run a single sync function and log the result.
 */
async function runSync(tenantSlug, sourceType, label, fn, tenantId) {
  const start = Date.now()
  try {
    const result = await fn(tenantId)
    const ms = Date.now() - start
    const summary = result
      ? Object.entries(result)
          .filter(([k]) => ['upserted','created','updated','skipped','errors','total','fetched'].includes(k))
          .map(([k, v]) => `${k}:${v}`)
          .join(' ') || 'ok'
      : 'ok'
    console.log(`[scheduler] ✓ ${tenantSlug}/${sourceType}/${label} — ${summary} (${ms}ms)`)
  } catch (err) {
    const ms = Date.now() - start
    console.error(`[scheduler] ✗ ${tenantSlug}/${sourceType}/${label} — ${err.message} (${ms}ms)`)
  }
}

/**
 * Run one full sync cycle across all tenants.
 */
async function runAllSyncs() {
  console.log(`[scheduler] ── Starting sync cycle at ${new Date().toISOString()} ──`)
  let tenants
  try {
    tenants = await getTenantsWithSources()
  } catch (err) {
    console.error('[scheduler] Failed to load tenants:', err.message)
    return
  }

  for (const { tenantId, slug, sources } of tenants) {
    for (const [sourceType, jobs] of Object.entries(SYNC_MAP)) {
      if (!sources.has(sourceType)) continue  // skip if not configured for this tenant
      for (const { label, fn } of jobs) {
        await runSync(slug, sourceType, label, fn, tenantId)
      }
    }

    // Distributor syncs run for every tenant that has enabled suppliers
    // (not gated by sync_sources — suppliers table is self-sufficient)
    await runSync(slug, 'distributors', 'orders', syncAllSuppliers, tenantId)
  }

  console.log(`[scheduler] ── Sync cycle complete at ${new Date().toISOString()} ──`)
}

/**
 * Start the scheduler. Call once from server.js after the server is listening.
 */
function startScheduler() {
  console.log(`[scheduler] Starting — interval: 2h, first run in 60s`)

  // First run after initial delay (let server fully warm up)
  setTimeout(async () => {
    await runAllSyncs()
    // Then repeat every 2 hours
    setInterval(runAllSyncs, SYNC_INTERVAL_MS)
  }, INITIAL_DELAY_MS)
}

module.exports = { startScheduler, runAllSyncs }
