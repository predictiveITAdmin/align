/**
 * Ingram Micro Xvantage XI — Shipments CSV Import adapter.
 *
 * The live Xvantage XI API has a ~30-day rolling window, so historical orders
 * aren't retrievable. Users can export a Shipments CSV from the Xvantage portal
 * and upload it here to backfill older orders.
 *
 * CSV format (as of 2026-04 export):
 *   Order date, Reseller PO, Order Type, Order number, Order amount,
 *   Status, Shipped date, ETA, End customer, Order placed by,
 *   Delivery exception
 *
 * Rows represent shipments, not orders — the same parent order may appear
 * multiple times with suffixes (e.g. 70-34882-11 and 70-34882-21 for split
 * shipments of order 70-34882). Parser groups by base order number.
 *
 * Uses distributor='ingram_xi' (same as live API) so CSV-imported rows dedupe
 * against existing API-synced rows via the (distributor, distributor_order_id)
 * unique key. Net effect: CSV uploads enrich/backfill what the API has.
 */
const { ORDER_STATUS } = require('./constants')

const DISPLAY_NAME = 'Ingram Micro (CSV Import)'
const ADAPTER_KEY  = 'ingram_xi_csv'

// Uses the same distributor value as the live API so orders merge cleanly.
const DISTRIBUTOR_KEY = 'ingram_xi'

const REQUIRED_FIELDS = [
  { name: 'customer_number', label: 'Ingram Customer Number', type: 'text', secret: false,
    help: 'Your Ingram customer account # — informational only, not used for CSV parsing' },
]

async function testConnection() {
  return {
    ok: true,
    message: 'CSV import mode — ready to accept uploads. Export Shipments from the Xvantage XI portal.',
    details: { mode: 'csv_import' },
  }
}

async function* fetchOrders() { return; yield }
async function fetchOrder() {
  throw new Error('Ingram CSV adapter: use CSV upload instead of fetchOrder')
}
async function handleWebhook() { return [] }

// ─── Status normalization ────────────────────────────────────────────────────
// Ingram portal statuses → our canonical ORDER_STATUS enum
function normalizeStatus(raw) {
  if (!raw) return 'submitted'
  const s = raw.toLowerCase().trim()
  // "Delivered on 04/21/2026" → delivered
  if (s.startsWith('delivered')) return 'delivered'
  if (s === 'partially delivered') return 'partially_shipped'
  if (s === 'shipped') return 'shipped'
  if (s === 'processing') return 'confirmed'
  if (s === 'completed') return 'delivered'
  if (s === 'cancelled' || s === 'canceled') return 'cancelled'
  return 'submitted'
}

// Extract delivery date from "Delivered on MM/DD/YYYY" status string
function extractDeliveryDate(statusRaw) {
  if (!statusRaw) return null
  const m = statusRaw.match(/on\s+(\d{1,2}\/\d{1,2}\/\d{4})/i)
  if (!m) return null
  return parseDate(m[1])
}

/**
 * Parse Ingram Shipments CSV → array of normalized orders.
 *
 * Grouping: rows sharing a base order number (after stripping -NN shipment
 * suffix) become one order. Later rows override earlier ones for status so
 * the "final" disposition wins (Delivered > Partially Delivered > Shipped).
 */
function parseCsv(csvText) {
  const rows = csvToArray(csvText)
  if (!rows.length) return []

  const headers = rows[0].map(h => (h || '').trim())
  const colIndex = (needle) => {
    const lower = needle.toLowerCase()
    return headers.findIndex(h => h.toLowerCase().includes(lower))
  }

  const idx = {
    order_date:     colIndex('order date'),
    po:             colIndex('reseller po'),
    order_type:     colIndex('order type'),
    order_number:   colIndex('order number'),
    amount:         colIndex('order amount'),
    status:         colIndex('status'),
    shipped_date:   colIndex('shipped date'),
    eta:            colIndex('eta'),
    end_customer:   colIndex('end customer'),
    placed_by:      colIndex('order placed by'),
    exception:      colIndex('delivery exception'),
  }

  // Sanity check — warn but don't fail on missing non-critical columns
  if (idx.order_number === -1 || idx.po === -1) {
    throw new Error('CSV missing required columns (Order number, Reseller PO)')
  }

  const byOrder = new Map()
  // Rank used for picking "best" status per order when merging shipment rows
  const statusRank = {
    delivered: 5, completed: 5,
    partially_shipped: 4, 'partially delivered': 4,
    shipped: 3,
    confirmed: 2, processing: 2,
    submitted: 1,
    cancelled: 0, canceled: 0,
  }

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.every(c => !c || !c.trim())) continue

    const rawOrderNum = (row[idx.order_number] || '').trim()
    if (!rawOrderNum) continue
    // Strip -NN shipment suffix: "70-34882-11" → "70-34882"
    // But keep "70-34882" as-is (no suffix)
    // And keep "SO000046" or other alpha codes intact
    const baseOrderNum = rawOrderNum.replace(/-(\d{1,3})$/, (m, suffix) => {
      // Only strip suffix if there's already a dash in the number (e.g., 70-34882-11)
      // Not for things like "SO-12345" where the -12345 is the main ID
      const parts = rawOrderNum.split('-')
      return parts.length >= 3 ? '' : m
    })

    const orderDate = parseDate((row[idx.order_date] || '').trim())
    const poRaw     = (row[idx.po] || '').trim()
    const poNumber  = poRaw && poRaw !== '-' ? poRaw : null
    const amount    = numOrNull(row[idx.amount])
    const statusRaw = (row[idx.status] || '').trim()
    const status    = normalizeStatus(statusRaw)
    const deliveredAt = extractDeliveryDate(statusRaw)
    const shipDate  = parseDate((row[idx.shipped_date] || '').trim())
    const endCustomer = (row[idx.end_customer] || '').trim() || null
    const placedBy  = (row[idx.placed_by] || '').trim() || null
    const orderType = (row[idx.order_type] || '').trim() || null

    const existing = byOrder.get(baseOrderNum)
    if (!existing) {
      byOrder.set(baseOrderNum, {
        distributor_order_id: baseOrderNum,
        po_number: poNumber,
        order_date: orderDate,
        status,
        status_raw: statusRaw,
        subtotal: amount,
        tax: null,
        shipping: null,
        total: amount,
        currency: 'USD',
        ship_to_name: endCustomer,
        ship_to_address: null,
        items: [],  // CSV has no line items — headers-only import
        metadata: {
          source: 'ingram_xi_csv',
          order_type: orderType,
          order_placed_by: placedBy,
          delivered_at: deliveredAt,
          first_ship_date: shipDate,
          shipment_count: 1,
        },
      })
    } else {
      // Merge: prefer "later" status per rank
      if ((statusRank[status] || 0) > (statusRank[existing.status] || 0)) {
        existing.status = status
        existing.status_raw = statusRaw
        if (deliveredAt) existing.metadata.delivered_at = deliveredAt
      }
      // Track shipment count
      existing.metadata.shipment_count = (existing.metadata.shipment_count || 1) + 1
      // Prefer earliest ship date
      if (shipDate && (!existing.metadata.first_ship_date || shipDate < existing.metadata.first_ship_date)) {
        existing.metadata.first_ship_date = shipDate
      }
      // If existing row had no PO but this one does, fill it in
      if (!existing.po_number && poNumber) existing.po_number = poNumber
      // If existing had no client name but this one does, fill it in
      if (!existing.ship_to_name && endCustomer) existing.ship_to_name = endCustomer
    }
  }

  return [...byOrder.values()]
}

// ─── CSV parser (quoted fields, commas in quotes, BOM-safe) ──────────────────
function csvToArray(text) {
  const clean = text.replace(/^\uFEFF/, '')
  const out = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (inQuotes) {
      if (ch === '"' && clean[i+1] === '"') { field += '"'; i++ }
      else if (ch === '"') inQuotes = false
      else field += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { row.push(field); field = '' }
      else if (ch === '\n') { row.push(field); out.push(row); row = []; field = '' }
      else if (ch === '\r') { /* skip */ }
      else field += ch
    }
  }
  if (field.length || row.length) { row.push(field); out.push(row) }
  return out
}

function numOrNull(s) {
  if (!s || typeof s !== 'string') return null
  const cleaned = s.replace(/[$,]/g, '').trim()
  if (!cleaned || cleaned === '-') return null
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

function parseDate(s) {
  if (!s) return null
  const trimmed = s.trim()
  if (!trimmed || trimmed === '-') return null
  // Ingram uses MM/DD/YYYY with optional leading space
  const d = new Date(trimmed)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

module.exports = {
  displayName:        DISPLAY_NAME,
  adapterKey:         ADAPTER_KEY,
  distributorKey:     DISTRIBUTOR_KEY,  // consumed by suppliers.js — tells upsert which distributor to write
  logoSlug:           'ingram-micro',
  requiredFields:     REQUIRED_FIELDS,
  supportedSyncModes: ['csv_import'],
  defaults:           { environment: 'production' },
  testConnection,
  fetchOrders,
  fetchOrder,
  handleWebhook,
  parseCsv,
}
