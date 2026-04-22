/**
 * Autotask Opportunities + Quotes + QuoteItems Sync Service
 *
 * Pulls Opportunities (with parsed PO array), Quotes, and QuoteItems from
 * Autotask into Align's tables. Source for Order Management module's
 * PO-matching pipeline.
 *
 * PO field on Autotask Opportunity is a User Defined Field named "Purchase Order Number".
 * Autotask returns UDFs in opp.userDefinedFields = [{name, value}, ...].
 * The value may contain multiple POs separated by commas/semicolons/newlines.
 * We parse it into `opportunities.po_numbers text[]` per ADR-003.
 *
 * Incremental: uses lastActivityDate on each entity so re-runs only pull
 * records changed since the last successful sync.
 */

const axios = require('axios')
const db = require('../db')

// ─── Autotask REST client ────────────────────────────────────────────────────
function buildClient() {
  const zone = process.env.AUTOTASK_ZONE || 'webservices1'
  return axios.create({
    baseURL: `https://${zone}.autotask.net/ATServicesRest/V1.0`,
    headers: {
      ApiIntegrationCode: process.env.AUTOTASK_INTEGRATION_CODE,
      UserName:           process.env.AUTOTASK_API_USER,
      Secret:             process.env.AUTOTASK_API_SECRET,
      'Content-Type':     'application/json',
    },
    timeout: 30000,
  })
}

// ─── PO-field parsing (ADR-003: PO stored as array) ──────────────────────────
/**
 * Parse an Autotask Opportunity's PO text field into a deduped array.
 * Handles comma, semicolon, newline separators. Strips whitespace + dupes,
 * preserves original order.
 */
function parsePoField(raw) {
  if (!raw || typeof raw !== 'string') return []
  const tokens = raw
    .split(/[,;\n\r]+/)
    .map(s => s.trim())
    .filter(Boolean)
  // Preserve order while deduping (case-insensitive dedupe)
  const seen = new Set()
  const out = []
  for (const t of tokens) {
    const k = t.toLowerCase()
    if (!seen.has(k)) { seen.add(k); out.push(t) }
  }
  return out
}

/**
 * Serialize a PO array back for writing to Autotask.
 * Uses "PO1, PO2, PO3" format (comma-space).
 */
function serializePoField(arr) {
  return (arr || []).join(', ')
}

// ─── Picklist cache for Opportunities + Quotes ───────────────────────────────
const _picklistCache = {}

async function getPicklistLabels(client, entity, fieldName) {
  const cacheKey = `${entity}.${fieldName}`
  if (_picklistCache[cacheKey]) return _picklistCache[cacheKey]
  const res = await client.get(`/${entity}/entityInformation/fields`)
  const fields = res.data?.fields || []
  const field = fields.find(f => f.name === fieldName)
  const map = {}
  for (const v of (field?.picklistValues || [])) {
    if (v.isActive !== false) map[parseInt(v.value)] = v.label
  }
  _picklistCache[cacheKey] = map
  return map
}

// ─── Paged query helper ──────────────────────────────────────────────────────
/**
 * Autotask REST returns {items, pageDetails}. We iterate nextPageUrl until empty.
 * Autotask's query uses POST with a filter body.
 */
async function* queryAll(client, entity, filter, maxPages = 200) {
  const body = { filter, MaxRecords: 500 }
  let nextUrl = `/${entity}/query`
  let isFirst = true
  let pageCount = 0

  while (nextUrl && pageCount < maxPages) {
    let res
    try {
      res = isFirst
        ? await client.post(nextUrl, body)
        : await client.get(nextUrl)
    } catch (err) {
      // 405 / 400 on continuation pages: Autotask sometimes requires re-POST for large result sets
      if (!isFirst && (err.response?.status === 405 || err.response?.status === 400)) {
        console.warn(`[queryAll] ${entity} page ${pageCount}: GET returned ${err.response.status}, retrying as POST`)
        try {
          res = await client.post(`/${entity}/query`, { ...body, filter })
        } catch (retryErr) {
          console.error(`[queryAll] ${entity} POST retry failed:`, retryErr.message)
          break
        }
      } else {
        throw err
      }
    }
    isFirst = false
    pageCount++

    const items = res.data?.items || []
    for (const item of items) yield item

    nextUrl = res.data?.pageDetails?.nextPageUrl
    if (nextUrl && nextUrl.startsWith('http')) {
      // Autotask returns absolute URLs in nextPageUrl; strip to path+query
      const u = new URL(nextUrl)
      nextUrl = u.pathname.replace('/ATServicesRest/V1.0', '') + u.search
    }
  }
}

// ─── Get last sync timestamp for incremental pulls ──────────────────────────
async function getLastSync(tenantId, entity) {
  const r = await db.query(
    `SELECT MAX(last_synced_at) AS t FROM ${entity === 'opportunities' ? 'opportunities' : entity === 'quotes' ? 'quotes' : 'quote_items'} WHERE tenant_id = $1`.replace('WHERE tenant_id', entity === 'quote_items' ? 'WHERE 1=1' : 'WHERE tenant_id'),
    entity === 'quote_items' ? [] : [tenantId]
  )
  return r.rows[0]?.t || null
}

// All Autotask Opportunity status values (static — picklist rarely changes)
const AT_STATUS_LABELS = {
  0: 'Not Ready To Buy',
  1: 'Active',
  2: 'Lost',
  3: 'Closed',
  4: 'Implemented',
}
// Statuses excluded from sync by default.
// NOTE: 'Closed' (won) and 'Implemented' are intentionally NOT excluded — closed-won
// opportunities are the only ones that have PO numbers, which the distributor
// matching pipeline needs. Excluding them would break PO → order linking.
// Only 'Lost' and 'Not Ready To Buy' are skipped as they will never have POs.
const DEFAULT_EXCLUDE_STATUSES = ['Not Ready To Buy', 'Lost']

// ─── Load opportunity sync settings for tenant ───────────────────────────────
async function getSyncSettings(tenantId) {
  const r = await db.query(
    `SELECT settings->'opportunity_sync' AS cfg FROM tenant_settings WHERE tenant_id = $1`,
    [tenantId]
  )
  return r.rows[0]?.cfg || {
    active_clients_only:  true,
    min_create_date:      null,
    exclude_statuses:     DEFAULT_EXCLUDE_STATUSES,
  }
}

// ─── Sync Opportunities ──────────────────────────────────────────────────────
async function syncOpportunities(tenantId) {
  const client = buildClient()
  const stageLabels = await getPicklistLabels(client, 'Opportunities', 'stage')
  const cfg = await getSyncSettings(tenantId)

  // Incremental: only pull opportunities changed since last sync (or all if first run)
  const sinceRow = await db.query(
    `SELECT MAX(last_synced_at) AS t FROM opportunities WHERE tenant_id = $1`,
    [tenantId]
  )
  const since = sinceRow.rows[0]?.t

  // Build AT filter
  const filter = [{ field: 'id', op: 'gt', value: 0 }]
  if (since) {
    filter.push({ field: 'lastActivity', op: 'gte', value: since.toISOString() })
  }
  // Date range filter — only sync opportunities created after min_create_date
  if (cfg.min_create_date) {
    filter.push({ field: 'createDate', op: 'gte', value: new Date(cfg.min_create_date).toISOString() })
  }

  console.log('[opportunitiesSync] pulling Opportunities, since:', since || '(full)', '| settings:', cfg)
  let count = 0, skipped = 0, errors = 0

  for await (const opp of queryAll(client, 'Opportunities', filter)) {
    try {
      // Find local client by autotask_company_id
      // Autotask Opportunities API uses "companyID" (not "accountID")
      const cr = await db.query(
        `SELECT id FROM clients WHERE autotask_company_id = $1 AND tenant_id = $2`,
        [opp.companyID, tenantId]
      )
      const clientId = cr.rows[0]?.id || null

      // Skip inactive accounts (not in our active clients list) when setting is on
      if (cfg.active_clients_only && !clientId) {
        skipped++
        continue
      }

      // Resolve status label from picklist ID
      const statusLabel = AT_STATUS_LABELS[opp.status] || `Status ${opp.status}`
      const stageLabel  = stageLabels[opp.stage] || String(opp.stage ?? '')

      // Skip by status — don't add new opps with excluded statuses
      const excludeStatuses = cfg.exclude_statuses || DEFAULT_EXCLUDE_STATUSES
      if (excludeStatuses.includes(statusLabel)) {
        // If already in DB, update status but don't delete
        const existing = await db.query(
          `SELECT id FROM opportunities WHERE autotask_opportunity_id = $1`,
          [opp.id]
        )
        if (!existing.rows.length) { skipped++; continue }
      }

      // Parse PO field — stored as UDF "Purchase Order Number" on the Autotask Opportunity
      // opp.userDefinedFields = [{ name: "Purchase Order Number", value: "PO-123, PO-456" }, ...]
      const poUdf  = (opp.userDefinedFields || []).find(u => u.name === 'Purchase Order Number')
      const poRaw  = poUdf?.value || ''
      const poArray = parsePoField(poRaw)

      // Map source to one of our enums if detectable
      let source = 'manual'
      const descUpper = (opp.description || '').toUpperCase()
      if (descUpper.includes('QUOTEWERKS')) source = 'quotewerks'
      else if (descUpper.includes('KQM') || descUpper.includes('KASEYA QUOTE')) source = 'kqm'

      await db.query(`
        INSERT INTO opportunities (
          tenant_id, client_id, autotask_opportunity_id,
          title, stage, status, amount, po_numbers,
          assigned_resource_id, source,
          expected_close, created_date, closed_date,
          metadata, last_synced_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, NOW())
        ON CONFLICT (autotask_opportunity_id) DO UPDATE SET
          client_id              = EXCLUDED.client_id,
          title                  = EXCLUDED.title,
          stage                  = EXCLUDED.stage,
          status                 = EXCLUDED.status,
          amount                 = EXCLUDED.amount,
          po_numbers             = EXCLUDED.po_numbers,
          assigned_resource_id   = EXCLUDED.assigned_resource_id,
          source                 = COALESCE(opportunities.source, EXCLUDED.source),
          expected_close         = EXCLUDED.expected_close,
          closed_date            = EXCLUDED.closed_date,
          metadata               = EXCLUDED.metadata,
          last_synced_at         = NOW(),
          updated_at             = NOW()
      `, [
        tenantId,
        clientId,
        opp.id,
        opp.title || `Opportunity ${opp.id}`,
        stageLabel,
        statusLabel,
        opp.amount ?? opp.oneTimeRevenue ?? null,
        poArray,
        opp.ownerResourceID || null,
        source,
        opp.projectedCloseDate || null,
        opp.createDate || null,
        opp.closedDate || null,
        opp,
      ])
      count++
    } catch (err) {
      errors++
      console.error(`[opportunitiesSync] error on opp ${opp.id}:`, err.message)
    }
  }

  console.log(`[opportunitiesSync] synced ${count} opportunities (${skipped} skipped, ${errors} errors)`)
  return { count, skipped, errors }
}

// ─── Sync Quotes for opportunities we have locally ───────────────────────────
async function syncQuotes(tenantId) {
  const client = buildClient()
  const statusLabels = await getPicklistLabels(client, 'Quotes', 'status')

  // For each opportunity we have, pull its quotes
  const opps = await db.query(
    `SELECT id, autotask_opportunity_id FROM opportunities
     WHERE tenant_id = $1 AND autotask_opportunity_id IS NOT NULL`,
    [tenantId]
  )

  let count = 0, errors = 0
  for (const opp of opps.rows) {
    try {
      const filter = [{ field: 'opportunityID', op: 'eq', value: opp.autotask_opportunity_id }]
      for await (const q of queryAll(client, 'Quotes', filter)) {
        // Detect source — QuoteWerks vs KQM — via external ID pattern if available
        let source = null
        let externalRef = null
        if (q.externalQuoteNumber) {
          externalRef = q.externalQuoteNumber
          // QuoteWerks typically has numeric doc IDs; KQM has its own format
          if (/^QW/i.test(externalRef) || /^\d{5,}$/.test(externalRef)) source = 'quotewerks'
          else if (/^KQM/i.test(externalRef)) source = 'kqm'
        }

        await db.query(`
          INSERT INTO quotes (
            opportunity_id, autotask_quote_id, quote_number,
            title, status, amount, valid_until,
            source, quote_external_ref, metadata, last_synced_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW())
          ON CONFLICT (autotask_quote_id) DO UPDATE SET
            quote_number        = EXCLUDED.quote_number,
            title               = EXCLUDED.title,
            status              = EXCLUDED.status,
            amount              = EXCLUDED.amount,
            valid_until         = EXCLUDED.valid_until,
            source              = COALESCE(quotes.source, EXCLUDED.source),
            quote_external_ref  = COALESCE(quotes.quote_external_ref, EXCLUDED.quote_external_ref),
            metadata            = EXCLUDED.metadata,
            last_synced_at      = NOW(),
            updated_at          = NOW()
        `, [
          opp.id,
          q.id,
          q.quoteNumber || String(q.id),
          q.name || q.description || null,
          statusLabels[q.status] || String(q.status ?? ''),
          q.totalAmount ?? null,
          q.expirationDate || null,
          source,
          externalRef,
          q,
        ])
        count++
      }
    } catch (err) {
      errors++
      console.error(`[opportunitiesSync] quotes error opp ${opp.autotask_opportunity_id}:`, err.message)
    }
  }

  console.log(`[opportunitiesSync] synced ${count} quotes (${errors} errors)`)
  return { count, errors }
}

// ─── Sync QuoteItems for quotes we have locally ──────────────────────────────
async function syncQuoteItems(tenantId) {
  const client = buildClient()

  const quotes = await db.query(
    `SELECT q.id, q.autotask_quote_id
     FROM quotes q
     JOIN opportunities o ON o.id = q.opportunity_id
     WHERE o.tenant_id = $1 AND q.autotask_quote_id IS NOT NULL`,
    [tenantId]
  )

  let count = 0, errors = 0
  for (const quote of quotes.rows) {
    try {
      const filter = [{ field: 'quoteID', op: 'eq', value: quote.autotask_quote_id }]
      for await (const qi of queryAll(client, 'QuoteItems', filter)) {
        await db.query(`
          INSERT INTO quote_items (
            quote_id, autotask_quote_item_id,
            mfg_part_number, manufacturer, description,
            quantity, unit_cost, unit_price, line_total,
            metadata
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          ON CONFLICT (autotask_quote_item_id) DO UPDATE SET
            mfg_part_number = EXCLUDED.mfg_part_number,
            manufacturer    = EXCLUDED.manufacturer,
            description     = EXCLUDED.description,
            quantity        = EXCLUDED.quantity,
            unit_cost       = EXCLUDED.unit_cost,
            unit_price      = EXCLUDED.unit_price,
            line_total      = EXCLUDED.line_total,
            metadata        = EXCLUDED.metadata
        `, [
          quote.id,
          qi.id,
          qi.manufacturerProductNumber || qi.productID || null,  // Autotask field varies
          qi.manufacturer || null,
          qi.name || qi.description || null,
          qi.quantity ?? null,
          qi.unitCost ?? null,
          qi.unitPrice ?? null,
          qi.totalEffectivePrice ?? (qi.unitPrice && qi.quantity ? qi.unitPrice * qi.quantity : null),
          qi,
        ])
        count++
      }
    } catch (err) {
      errors++
      console.error(`[opportunitiesSync] quote items error quote ${quote.autotask_quote_id}:`, err.message)
    }
  }

  console.log(`[opportunitiesSync] synced ${count} quote items (${errors} errors)`)
  return { count, errors }
}

// ─── Write PO back to Autotask Opportunity (used by PO Mapper UI) ────────────
/**
 * Appends a new PO to the opportunity's PO field (Autotask side) + updates
 * local cache. Called when the PO Mapper links an unmapped distributor order
 * to an Opportunity.
 */
async function appendPoToAutotask(opportunityLocalId, newPo) {
  const r = await db.query(
    `SELECT autotask_opportunity_id, po_numbers FROM opportunities WHERE id = $1`,
    [opportunityLocalId]
  )
  if (!r.rows.length) throw new Error(`Opportunity ${opportunityLocalId} not found`)
  const { autotask_opportunity_id: atId, po_numbers: current } = r.rows[0]

  // Dedupe the new PO against current list
  const currentLower = new Set((current || []).map(s => s.toLowerCase()))
  if (currentLower.has(newPo.toLowerCase())) {
    return { changed: false, po_numbers: current }
  }
  const updated = [...(current || []), newPo]

  // Update Autotask first (so local stays consistent if AT write fails)
  // PO is a UDF on Opportunity — patch via userDefinedFields array
  const client = buildClient()
  try {
    await client.patch(`/Opportunities/${atId}`, {
      id: atId,
      userDefinedFields: [
        { name: 'Purchase Order Number', value: serializePoField(updated) },
      ],
    })
  } catch (err) {
    console.error(`[opportunitiesSync] AT PO writeback failed for opp ${atId}:`, err.response?.data || err.message)
    throw err
  }

  // Update local
  await db.query(
    `UPDATE opportunities SET po_numbers = $2, updated_at = NOW() WHERE id = $1`,
    [opportunityLocalId, updated]
  )

  return { changed: true, po_numbers: updated }
}

// ─── Run all three in sequence for a tenant ──────────────────────────────────
async function syncAll(tenantId) {
  const started = Date.now()
  console.log(`[opportunitiesSync] starting full sync for tenant ${tenantId}`)
  const opps = await syncOpportunities(tenantId)
  const quotes = await syncQuotes(tenantId)
  const items = await syncQuoteItems(tenantId)
  const elapsed = Math.round((Date.now() - started) / 1000)
  console.log(`[opportunitiesSync] completed in ${elapsed}s`, { opps, quotes, items })
  return { elapsed_seconds: elapsed, ...({ opps, quotes, items }) }
}

module.exports = {
  syncAll,
  syncOpportunities,
  syncQuotes,
  syncQuoteItems,
  appendPoToAutotask,
  parsePoField,
  serializePoField,
}
