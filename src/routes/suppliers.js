/**
 * /api/suppliers — Admin UI for distributor API configuration.
 * Handles: list adapters, list configured suppliers, create/update, test, CSV import.
 */
const express = require('express')
const router = express.Router()
const db = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { getAdapter, listAdapters } = require('../services/distributors')
const crypto = require('crypto')
const {
  encryptCredentials, decryptCredentials, maskCredentials,
} = require('../services/supplierCrypto')

// ─── GET /api/suppliers/adapters — list available distributor adapters ───────
router.get('/adapters', requireAuth, (req, res) => {
  res.json({ data: listAdapters() })
})

// ─── GET /api/suppliers — list configured suppliers for this tenant ──────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT id, adapter_key, display_name, is_enabled, sync_mode,
              sync_frequency_minutes, customer_number, base_url, environment,
              webhook_url_suffix,
              last_test_at, last_test_status, last_test_error,
              last_sync_at, last_sync_status, last_sync_error,
              created_at, updated_at
       FROM suppliers WHERE tenant_id = $1 ORDER BY display_name`,
      [req.tenant.id]
    )
    res.json({ data: r.rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/suppliers/:id — detail with masked credentials ─────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT * FROM suppliers WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenant.id]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'Supplier not found' })

    const supplier = r.rows[0]
    const adapter = getAdapter(supplier.adapter_key)
    const decrypted = decryptCredentials(supplier.credentials)
    const masked = maskCredentials(decrypted, adapter?.requiredFields || [])

    res.json({ data: { ...supplier, credentials: masked } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/suppliers — create / configure a supplier ────────────────────
router.post('/', requireAuth, requireRole('tenant_admin', 'global_admin'), async (req, res) => {
  const { adapter_key, display_name, is_enabled, sync_mode, sync_frequency_minutes,
          customer_number, credentials, base_url, environment } = req.body

  if (!adapter_key) return res.status(400).json({ error: 'adapter_key required' })
  const adapter = getAdapter(adapter_key)
  if (!adapter) return res.status(400).json({ error: 'unknown adapter_key' })

  try {
    const webhookSecret = crypto.randomBytes(32).toString('hex')
    const webhookSuffix = crypto.randomBytes(8).toString('hex')

    const encryptedCreds = encryptCredentials(credentials || {})

    const r = await db.query(
      `INSERT INTO suppliers (
         tenant_id, adapter_key, display_name, is_enabled, sync_mode,
         sync_frequency_minutes, customer_number, credentials, base_url,
         environment, webhook_url_suffix, webhook_secret
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (tenant_id, adapter_key) DO UPDATE SET
         display_name           = EXCLUDED.display_name,
         is_enabled             = EXCLUDED.is_enabled,
         sync_mode              = EXCLUDED.sync_mode,
         sync_frequency_minutes = EXCLUDED.sync_frequency_minutes,
         customer_number        = EXCLUDED.customer_number,
         credentials            = EXCLUDED.credentials,
         base_url               = EXCLUDED.base_url,
         environment            = EXCLUDED.environment,
         updated_at             = NOW()
       RETURNING *`,
      [
        req.tenant.id, adapter_key, display_name || adapter.displayName,
        is_enabled ?? false, sync_mode || adapter.supportedSyncModes[0],
        sync_frequency_minutes || 60,
        customer_number || null, encryptedCreds, base_url || adapter.defaults?.base_url || null,
        environment || adapter.defaults?.environment || 'production',
        webhookSuffix, webhookSecret,
      ]
    )
    res.status(201).json({ data: r.rows[0] })
  } catch (err) {
    console.error('[suppliers] create error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/suppliers/:id/test — run testConnection on the adapter ────────
router.post('/:id/test', requireAuth, requireRole('tenant_admin', 'global_admin'), async (req, res) => {
  try {
    const r = await db.query(
      `SELECT * FROM suppliers WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenant.id]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'Supplier not found' })
    const supplier = r.rows[0]

    const adapter = getAdapter(supplier.adapter_key)
    if (!adapter) return res.status(400).json({ error: 'No adapter for this supplier' })

    // Merge any just-submitted creds with stored (for pre-save test)
    let creds = decryptCredentials(supplier.credentials || {})
    if (req.body?.credentials) {
      // If values are not the masked placeholder (••••...), use incoming
      for (const [k, v] of Object.entries(req.body.credentials)) {
        if (v && typeof v === 'string' && !v.startsWith('••••')) creds[k] = v
      }
    }

    // Inject customer_number from supplier row if the adapter expects it
    if (supplier.customer_number && !creds.customer_number) {
      creds.customer_number = supplier.customer_number
    }

    const config = {
      environment: req.body?.environment || supplier.environment || adapter.defaults?.environment,
      base_url:    req.body?.base_url || supplier.base_url || adapter.defaults?.base_url,
    }

    const result = await adapter.testConnection(creds, config)

    await db.query(
      `UPDATE suppliers SET
         last_test_at     = NOW(),
         last_test_status = $2,
         last_test_error  = $3
       WHERE id = $1`,
      [req.params.id, result.ok ? 'ok' : 'failed', result.ok ? null : result.message]
    )

    res.json({ data: result })
  } catch (err) {
    console.error('[suppliers] test error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── DELETE /api/suppliers/:id ───────────────────────────────────────────────
router.delete('/:id', requireAuth, requireRole('tenant_admin', 'global_admin'), async (req, res) => {
  try {
    await db.query(`DELETE FROM suppliers WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.tenant.id])
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
