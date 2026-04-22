/**
 * Order Matcher Service
 *
 * Attempts to auto-link distributor orders to Autotask Opportunities using a
 * cascade of match strategies (highest confidence first):
 *
 *   1. PO exact match     — order.po_number is in opportunity.po_numbers[]
 *                          confidence: 100, status: 'matched'
 *   2. PO fuzzy match     — case-insensitive, strip common prefixes (PO-, #, spaces)
 *                          confidence: 80, status: 'needs_review'
 *   3. Client name match  — ship_to_name closely matches a client's name
 *                          confidence: 60, status: 'needs_review'
 *
 * Orders already at 'matched' status (via auto or manual) are skipped unless
 * force=true is passed.
 *
 * Returns: { matched, needs_review, unchanged, errors }
 */

const db = require('../db')

// ─── PO normalization ─────────────────────────────────────────────────────────
function normalizePo(raw) {
  if (!raw || typeof raw !== 'string') return ''
  return raw
    .toUpperCase()
    .replace(/^(PO[-\s#]*)/i, '')   // strip leading "PO-", "PO#", "PO "
    .replace(/[^A-Z0-9]/g, '')      // keep only alphanumeric
    .trim()
}

// Simple name similarity: how many words from `a` appear in `b`
function nameSimilarity(a, b) {
  if (!a || !b) return 0
  const aWords = a.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  const bLower = b.toLowerCase()
  if (!aWords.length) return 0
  const matches = aWords.filter(w => bLower.includes(w)).length
  return matches / aWords.length
}

// ─── matchOrder — attempt to match a single order to an opportunity ───────────
/**
 * @param {string} tenantId
 * @param {string} orderId — distributor_orders.id
 * @param {object} [options]
 * @param {boolean} [options.force=false] — re-run even if already matched
 * @param {boolean} [options.dryRun=false] — compute match but don't write to DB
 * @returns {Promise<{matched: boolean, confidence: number, method: string, opportunity_id: string|null}>}
 */
async function matchOrder(tenantId, orderId, { force = false, dryRun = false } = {}) {
  const orderRes = await db.query(
    `SELECT id, po_number, ship_to_name, ship_to_address, match_status
     FROM distributor_orders
     WHERE id = $1 AND tenant_id = $2`,
    [orderId, tenantId]
  )
  if (!orderRes.rows.length) return { matched: false, confidence: 0, method: null, opportunity_id: null }

  const order = orderRes.rows[0]

  // Skip already-matched orders unless forced
  if (order.match_status === 'matched' && !force) {
    return { matched: true, confidence: 100, method: 'skipped', opportunity_id: null }
  }

  const po = order.po_number
  const normPo = normalizePo(po)

  // ── Strategy 1: PO exact match ─────────────────────────────────────────────
  if (po) {
    const exactRes = await db.query(
      `SELECT id, client_id, title
       FROM opportunities
       WHERE tenant_id = $1 AND $2 = ANY(po_numbers)
       LIMIT 1`,
      [tenantId, po]
    )
    if (exactRes.rows.length) {
      const opp = exactRes.rows[0]
      if (!dryRun) await applyMatch(orderId, opp.id, opp.client_id, 'matched', 'po_exact', 100)
      return { matched: true, confidence: 100, method: 'po_exact', opportunity_id: opp.id, opportunity_title: opp.title, client_id: opp.client_id }
    }
  }

  // ── Strategy 2: PO fuzzy match ─────────────────────────────────────────────
  if (normPo.length >= 3) {
    // Load all opportunities with PO numbers for this tenant and compare in JS
    const oppsRes = await db.query(
      `SELECT id, client_id, title, po_numbers
       FROM opportunities
       WHERE tenant_id = $1 AND cardinality(po_numbers) > 0
       LIMIT 2000`,
      [tenantId]
    )

    for (const opp of oppsRes.rows) {
      const match = (opp.po_numbers || []).some(existingPo => normalizePo(existingPo) === normPo)
      if (match) {
        if (!dryRun) await applyMatch(orderId, opp.id, opp.client_id, 'needs_review', 'po_fuzzy', 80)
        return { matched: false, confidence: 80, method: 'po_fuzzy', opportunity_id: opp.id, opportunity_title: opp.title, client_id: opp.client_id }
      }
    }
  }

  // ── Strategy 3: Client name match ──────────────────────────────────────────
  const shipName = order.ship_to_name
  if (shipName && shipName.trim().length > 2) {
    // Pull clients for this tenant and find the best name match
    const clientsRes = await db.query(
      `SELECT c.id, c.name, opp.id AS opp_id, opp.title AS opp_title
       FROM clients c
       JOIN opportunities opp ON opp.client_id = c.id AND opp.tenant_id = $1
       WHERE c.tenant_id = $1
       ORDER BY opp.created_date DESC
       LIMIT 500`,
      [tenantId]
    )

    let bestScore = 0
    let bestMatch = null
    for (const row of clientsRes.rows) {
      const score = nameSimilarity(shipName, row.name)
      if (score > bestScore) {
        bestScore = score
        bestMatch = row
      }
    }

    // Threshold: at least 70% of meaningful words must match
    if (bestScore >= 0.7 && bestMatch) {
      const clientId = bestMatch.id
      if (!dryRun) await applyMatch(orderId, bestMatch.opp_id, clientId, 'needs_review', 'client_name', 60)
      return {
        matched: false,
        confidence: Math.round(60 * bestScore),
        method: 'client_name',
        opportunity_id: bestMatch.opp_id,
        opportunity_title: bestMatch.opp_title,
        client_id: clientId,
        client_name: bestMatch.name,
      }
    }
  }

  // ── No match found ─────────────────────────────────────────────────────────
  if (!dryRun && order.match_status !== 'unmapped') {
    await db.query(
      `UPDATE distributor_orders SET match_status = 'unmapped' WHERE id = $1`,
      [orderId]
    )
  }
  return { matched: false, confidence: 0, method: null, opportunity_id: null }
}

// ─── applyMatch — write match result to DB ────────────────────────────────────
async function applyMatch(orderId, opportunityId, clientId, matchStatus, matchMethod, confidence) {
  await db.query(
    `UPDATE distributor_orders
     SET opportunity_id   = $2,
         client_id        = $3,
         match_status     = $4,
         match_method     = $5,
         match_confidence = $6,
         matched_at       = NOW()
     WHERE id = $1`,
    [orderId, opportunityId, clientId, matchStatus, matchMethod, confidence]
  )

  await db.query(
    `INSERT INTO order_events (distributor_order_id, event_type, description, actor, metadata)
     VALUES ($1, 'auto_matched', $2, 'system', $3)`,
    [
      orderId,
      `Auto-matched via ${matchMethod} (confidence: ${confidence}%)`,
      JSON.stringify({ method: matchMethod, confidence, opportunity_id: opportunityId }),
    ]
  )
}

// ─── getMatchSuggestions — dry-run matcher + search for PO mapper UI ─────────
/**
 * Returns top candidate opportunities for a given order without writing to DB.
 * Used by the PO Mapper UI to show suggestions before the user confirms.
 */
async function getMatchSuggestions(tenantId, orderId, searchQuery = null) {
  const orderRes = await db.query(
    `SELECT id, po_number, ship_to_name, ship_to_address
     FROM distributor_orders WHERE id = $1 AND tenant_id = $2`,
    [orderId, tenantId]
  )
  if (!orderRes.rows.length) return []

  const order = orderRes.rows[0]
  const suggestions = []
  const seenIds = new Set()

  // If explicit search query, look for matching opportunities first
  if (searchQuery) {
    const searchRes = await db.query(
      `SELECT o.id, o.title, o.po_numbers, o.client_id, o.amount, o.stage,
              c.name AS client_name
       FROM opportunities o
       LEFT JOIN clients c ON c.id = o.client_id
       WHERE o.tenant_id = $1
         AND (o.title ILIKE $2 OR c.name ILIKE $2
              OR EXISTS (SELECT 1 FROM unnest(o.po_numbers) p WHERE p ILIKE $2))
       ORDER BY o.created_date DESC
       LIMIT 10`,
      [tenantId, `%${searchQuery}%`]
    )
    for (const row of searchRes.rows) {
      if (!seenIds.has(row.id)) {
        seenIds.add(row.id)
        suggestions.push({ ...row, match_method: 'search', confidence: null })
      }
    }
  }

  // Add auto-match result if any
  const autoMatch = await matchOrder(tenantId, orderId, { force: true, dryRun: true })
  if (autoMatch.opportunity_id && !seenIds.has(autoMatch.opportunity_id)) {
    seenIds.add(autoMatch.opportunity_id)
    const oppRes = await db.query(
      `SELECT o.id, o.title, o.po_numbers, o.client_id, o.amount, o.stage,
              c.name AS client_name
       FROM opportunities o LEFT JOIN clients c ON c.id = o.client_id
       WHERE o.id = $1`,
      [autoMatch.opportunity_id]
    )
    if (oppRes.rows.length) {
      suggestions.unshift({
        ...oppRes.rows[0],
        match_method: autoMatch.method,
        confidence: autoMatch.confidence,
      })
    }
  }

  return suggestions
}

// ─── matchAllUnmatched — batch run matcher across all unmapped/needs_review ───
/**
 * @param {string} tenantId
 * @returns {Promise<{matched, needs_review, unchanged, errors}>}
 */
async function matchAllUnmatched(tenantId) {
  const ordersRes = await db.query(
    `SELECT id FROM distributor_orders
     WHERE tenant_id = $1 AND match_status IN ('unmapped', 'needs_review')
     ORDER BY order_date DESC
     LIMIT 1000`,
    [tenantId]
  )

  let matched = 0, needs_review = 0, unchanged = 0, errors = 0

  for (const row of ordersRes.rows) {
    try {
      const result = await matchOrder(tenantId, row.id)
      if (result.method === 'skipped') { unchanged++; continue }
      if (result.confidence === 100) matched++
      else if (result.confidence > 0)  needs_review++
      else                             unchanged++
    } catch (err) {
      errors++
      console.error(`[orderMatcher] error on order ${row.id}:`, err.message)
    }
  }

  console.log(`[orderMatcher] matchAllUnmatched(${tenantId}): matched=${matched} needs_review=${needs_review} unchanged=${unchanged} errors=${errors}`)
  return { matched, needs_review, unchanged, errors }
}

module.exports = {
  matchOrder,
  matchAllUnmatched,
  getMatchSuggestions,
  normalizePo,
}
