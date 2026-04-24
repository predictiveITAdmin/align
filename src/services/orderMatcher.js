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

// ─── getMatchSuggestions — predictive groups + search for PO Mapper UI ───────
/**
 * Returns candidate opportunities for a given order, grouped by strategy.
 * Strategies (in priority order when no search query is supplied):
 *   1. po_exact       — order PO is in opp.po_numbers[]                (conf 100)
 *   2. po_fuzzy       — normalized PO equality                         (conf 80)
 *   3. part_overlap   — order's mfg_part_numbers overlap with an
 *                       opp's quote_items.mfg_part_number               (conf 50–90)
 *   4. date_proximity — opp.closed_date within ±30 days of order_date  (conf 30–70)
 *   5. client_name    — ship_to_name fuzzy-matches a client's name     (conf 30–60)
 *
 * When `searchQuery` is supplied, returns cross-field search results only
 * (title / client name / PO / quote number), so the user can map *any* opp.
 *
 * Each suggestion carries `match_method`, `match_reason` (human-readable),
 * and `confidence` for the UI to render grouped cards.
 */
const PROXIMITY_DAYS = 30
const PART_OVERLAP_LIMIT = 8
const DATE_PROXIMITY_LIMIT = 8
const CLIENT_NAME_LIMIT = 6
const SEARCH_LIMIT = 20

async function getMatchSuggestions(tenantId, orderId, searchQuery = null) {
  const orderRes = await db.query(
    `SELECT id, po_number, ship_to_name, ship_to_address, order_date, client_id
     FROM distributor_orders WHERE id = $1 AND tenant_id = $2`,
    [orderId, tenantId]
  )
  if (!orderRes.rows.length) return []
  const order = orderRes.rows[0]

  // ── Search mode ────────────────────────────────────────────────────────────
  if (searchQuery && searchQuery.trim().length > 0) {
    const q = `%${searchQuery.trim()}%`
    const searchRes = await db.query(
      `SELECT o.id, o.title, o.po_numbers, o.client_id, o.amount, o.stage,
              o.created_date, o.closed_date, o.expected_close,
              c.name AS client_name,
              (SELECT string_agg(DISTINCT qt.quote_number, ', ')
                 FROM quotes qt WHERE qt.opportunity_id = o.id) AS quote_numbers
       FROM opportunities o
       LEFT JOIN clients c ON c.id = o.client_id
       WHERE o.tenant_id = $1
         AND (o.title ILIKE $2
              OR c.name ILIKE $2
              OR EXISTS (SELECT 1 FROM unnest(o.po_numbers) p WHERE p ILIKE $2)
              OR EXISTS (SELECT 1 FROM quotes qt
                          WHERE qt.opportunity_id = o.id
                            AND (qt.title ILIKE $2 OR qt.quote_number::text ILIKE $2)))
       ORDER BY COALESCE(o.created_date, o.closed_date) DESC NULLS LAST
       LIMIT $3`,
      [tenantId, q, SEARCH_LIMIT]
    )
    return searchRes.rows.map(row => ({
      ...row,
      match_method: 'search',
      match_reason: `Search match`,
      confidence: null,
    }))
  }

  // ── Predictive mode ────────────────────────────────────────────────────────
  const itemsRes = await db.query(
    `SELECT mfg_part_number FROM distributor_order_items
     WHERE distributor_order_id = $1
       AND mfg_part_number IS NOT NULL AND mfg_part_number <> ''`,
    [orderId]
  )
  const orderParts = [...new Set(itemsRes.rows.map(r => r.mfg_part_number.trim()).filter(Boolean))]
  const totalParts = orderParts.length

  const suggestions = []
  const seenIds = new Set()

  const pushIfNew = (row, extras) => {
    if (seenIds.has(row.id)) return
    seenIds.add(row.id)
    suggestions.push({ ...row, ...extras })
  }

  // ── Strategy 1: PO exact ───────────────────────────────────────────────────
  if (order.po_number) {
    const exactRes = await db.query(
      `SELECT o.id, o.title, o.po_numbers, o.client_id, o.amount, o.stage,
              o.created_date, o.closed_date, o.expected_close,
              c.name AS client_name
         FROM opportunities o
         LEFT JOIN clients c ON c.id = o.client_id
        WHERE o.tenant_id = $1 AND $2 = ANY(o.po_numbers)
        LIMIT 3`,
      [tenantId, order.po_number]
    )
    for (const row of exactRes.rows) {
      pushIfNew(row, {
        match_method: 'po_exact',
        match_reason: `PO ${order.po_number} exact match`,
        confidence: 100,
      })
    }
  }

  // ── Strategy 2: PO fuzzy ───────────────────────────────────────────────────
  const normPo = normalizePo(order.po_number)
  if (normPo.length >= 3) {
    const oppsRes = await db.query(
      `SELECT o.id, o.title, o.po_numbers, o.client_id, o.amount, o.stage,
              o.created_date, o.closed_date, o.expected_close,
              c.name AS client_name
         FROM opportunities o
         LEFT JOIN clients c ON c.id = o.client_id
        WHERE o.tenant_id = $1 AND cardinality(o.po_numbers) > 0
        LIMIT 2000`,
      [tenantId]
    )
    for (const row of oppsRes.rows) {
      const matchedPo = (row.po_numbers || []).find(p => normalizePo(p) === normPo)
      if (matchedPo && matchedPo !== order.po_number) {
        pushIfNew(row, {
          match_method: 'po_fuzzy',
          match_reason: `Similar PO (${matchedPo})`,
          confidence: 80,
        })
      }
    }
  }

  // ── Strategy 3: Part-number overlap ────────────────────────────────────────
  if (orderParts.length) {
    const partsRes = await db.query(
      `SELECT o.id, o.title, o.po_numbers, o.client_id, o.amount, o.stage,
              o.created_date, o.closed_date, o.expected_close,
              c.name AS client_name,
              COUNT(DISTINCT qi.mfg_part_number)                      AS matched_count,
              ARRAY_AGG(DISTINCT qi.mfg_part_number)                  AS matched_parts
         FROM opportunities o
         JOIN quotes q       ON q.opportunity_id = o.id
         JOIN quote_items qi ON qi.quote_id = q.id
         LEFT JOIN clients c ON c.id = o.client_id
        WHERE o.tenant_id = $1
          AND qi.mfg_part_number = ANY($2::text[])
        GROUP BY o.id, c.name
        ORDER BY matched_count DESC, o.created_date DESC NULLS LAST
        LIMIT $3`,
      [tenantId, orderParts, PART_OVERLAP_LIMIT]
    )
    for (const row of partsRes.rows) {
      const matchedCount = Number(row.matched_count) || 0
      if (matchedCount === 0) continue
      const ratio = matchedCount / Math.max(totalParts, 1)
      const confidence = Math.min(90, Math.round(50 + 40 * ratio))
      pushIfNew(row, {
        match_method: 'part_overlap',
        match_reason: `${matchedCount} of ${totalParts} part${totalParts === 1 ? '' : 's'} match`,
        confidence,
        matched_parts: row.matched_parts,
        match_count: matchedCount,
        total_parts: totalParts,
      })
    }
  }

  // ── Strategy 4: Closed near order date ─────────────────────────────────────
  if (order.order_date) {
    const proxRes = await db.query(
      `SELECT o.id, o.title, o.po_numbers, o.client_id, o.amount, o.stage,
              o.created_date, o.closed_date, o.expected_close,
              c.name AS client_name,
              ABS(EXTRACT(EPOCH FROM (o.closed_date - $2::timestamptz)) / 86400)::int AS day_distance
         FROM opportunities o
         LEFT JOIN clients c ON c.id = o.client_id
        WHERE o.tenant_id = $1
          AND o.closed_date IS NOT NULL
          AND o.closed_date BETWEEN $2::timestamptz - ($3 || ' days')::interval
                                AND $2::timestamptz + ($3 || ' days')::interval
        ORDER BY ABS(EXTRACT(EPOCH FROM (o.closed_date - $2::timestamptz))) ASC
        LIMIT $4`,
      [tenantId, order.order_date, PROXIMITY_DAYS, DATE_PROXIMITY_LIMIT]
    )
    for (const row of proxRes.rows) {
      const days = Number(row.day_distance) || 0
      const dir = new Date(row.closed_date) < new Date(order.order_date) ? 'before' : 'after'
      const confidence = Math.max(30, 70 - days)
      pushIfNew(row, {
        match_method: 'date_proximity',
        match_reason: `Closed ${days} day${days === 1 ? '' : 's'} ${dir} order date`,
        confidence,
      })
    }
  }

  // ── Strategy 5: Same client (ship_to_name fuzzy) ───────────────────────────
  const shipName = order.ship_to_name
  if (shipName && shipName.trim().length > 2) {
    const clientsRes = await db.query(
      `SELECT id, name FROM clients WHERE tenant_id = $1 LIMIT 2000`,
      [tenantId]
    )
    let bestScore = 0
    let bestClient = null
    for (const c of clientsRes.rows) {
      const score = nameSimilarity(shipName, c.name)
      if (score > bestScore) { bestScore = score; bestClient = c }
    }
    if (bestClient && bestScore >= 0.5) {
      const clientOppsRes = await db.query(
        `SELECT o.id, o.title, o.po_numbers, o.client_id, o.amount, o.stage,
                o.created_date, o.closed_date, o.expected_close,
                c.name AS client_name
           FROM opportunities o
           LEFT JOIN clients c ON c.id = o.client_id
          WHERE o.tenant_id = $1 AND o.client_id = $2
          ORDER BY o.created_date DESC NULLS LAST
          LIMIT $3`,
        [tenantId, bestClient.id, CLIENT_NAME_LIMIT]
      )
      const confidence = Math.round(30 + 30 * bestScore)
      for (const row of clientOppsRes.rows) {
        pushIfNew(row, {
          match_method: 'client_name',
          match_reason: `Same client: ${bestClient.name}`,
          confidence,
        })
      }
    }
  }

  // ── Strategy 6: Recent closed — always show something as a fallback ──────────
  // Only runs when no other strategies found enough matches.
  const RECENT_CLOSED_LIMIT = 8
  if (suggestions.length < 4) {
    const recentRes = await db.query(
      `SELECT o.id, o.title, o.po_numbers, o.client_id, o.amount, o.stage,
              o.created_date, o.closed_date, o.expected_close,
              c.name AS client_name
         FROM opportunities o
         LEFT JOIN clients c ON c.id = o.client_id
        WHERE o.tenant_id = $1
          AND o.closed_date IS NOT NULL
        ORDER BY o.closed_date DESC
        LIMIT $2`,
      [tenantId, RECENT_CLOSED_LIMIT]
    )
    for (const row of recentRes.rows) {
      pushIfNew(row, {
        match_method: 'recent_closed',
        match_reason: `Recently closed`,
        confidence: 20,
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
