/**
 * Amazon Business CSV Import adapter.
 *
 * No live API (4-6 week onboarding). User downloads Shipments report from
 * business.amazon.com/reports and uploads the CSV here; this adapter parses
 * it into normalized orders.
 *
 * See: docs/amazon-business-csv-guide.md for generation instructions.
 */
const { ORDER_STATUS } = require('./constants')

const DISPLAY_NAME = 'Amazon Business (CSV Import)'
const ADAPTER_KEY  = 'amazon_business_csv'

const REQUIRED_FIELDS = [
  { name: 'account_id', label: 'Amazon Business Account ID', type: 'text', secret: false,
    help: 'Your Amazon Business account identifier — informational only' },
]

async function testConnection(creds, config = {}) {
  // CSV mode has no live connection; always "ready" to accept uploads
  return {
    ok: true,
    message: 'CSV import mode — ready to accept uploads. See Admin → Suppliers → Amazon Business → Import CSV.',
    details: { mode: 'csv_import' },
  }
}

async function* fetchOrders() {
  // CSV mode doesn't auto-pull; import is user-triggered via the upload endpoint
  return
  yield
}

async function fetchOrder(creds, config, orderId) {
  throw new Error('Amazon Business CSV adapter: use CSV upload instead of fetchOrder')
}

async function handleWebhook() { return [] }

/**
 * Parse an Amazon Business Shipments CSV into normalized orders.
 * Expected columns (as of 2025 export format):
 *   Order Date, Order ID, PO Number, ASIN, Product Title, Brand,
 *   Item Subtotal, Item Shipping & Handling, Item Total,
 *   Ordered Quantity, Shipped Quantity,
 *   Ship Date, Tracking Number, Carrier,
 *   Ship-To Name, Ship-To Address (Line 1), City, State, ZIP
 *
 * Multiple rows per order ID possible (one row per line item).
 * Function groups rows by order ID and returns normalized order list.
 */
function parseCsv(csvText) {
  const rows = csvToArray(csvText)
  if (!rows.length) return []

  const headers = rows[0].map(h => (h || '').trim())
  const colIndex = (name) => {
    const lower = name.toLowerCase()
    return headers.findIndex(h => h.toLowerCase().includes(lower))
  }

  const idx = {
    order_date:    colIndex('order date'),
    order_id:      colIndex('order id'),
    po_number:     colIndex('po number'),
    asin:          colIndex('asin'),
    title:         colIndex('product title') !== -1 ? colIndex('product title') : colIndex('title'),
    brand:         colIndex('brand'),
    item_total:    colIndex('item total'),
    item_subtotal: colIndex('item subtotal'),
    item_shipping: colIndex('shipping'),
    qty_ordered:   colIndex('ordered quantity'),
    qty_shipped:   colIndex('shipped quantity'),
    ship_date:     colIndex('ship date'),
    tracking:      colIndex('tracking number'),
    carrier:       colIndex('carrier'),
    ship_to_name:  colIndex('ship-to name'),
    ship_addr1:    colIndex('address line 1') !== -1 ? colIndex('address line 1') : colIndex('ship-to address'),
    ship_city:     colIndex('city'),
    ship_state:    colIndex('state'),
    ship_zip:      colIndex('zip'),
  }

  // Group by order ID
  const byOrder = new Map()
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.length < 2) continue
    const orderId = row[idx.order_id]
    if (!orderId) continue

    if (!byOrder.has(orderId)) {
      byOrder.set(orderId, {
        distributor_order_id: orderId,
        po_number:   row[idx.po_number] || null,
        order_date:  parseDate(row[idx.order_date]),
        status:      ORDER_STATUS.SHIPPED,  // Shipments report → everything has shipped
        status_raw:  'Shipped',
        subtotal: 0, tax: 0, shipping: 0, total: 0,
        currency: 'USD',
        ship_to_name:    row[idx.ship_to_name] || null,
        ship_to_address: {
          line1:  row[idx.ship_addr1]   || null,
          city:   row[idx.ship_city]    || null,
          state:  row[idx.ship_state]   || null,
          postal: row[idx.ship_zip]     || null,
          country: 'US',
        },
        items: [],
        metadata: { source: 'amazon_business_csv' },
      })
    }
    const order = byOrder.get(orderId)

    // Derive tracking-based shipped status
    const trackingNum = row[idx.tracking] || null
    const shipDate    = parseDate(row[idx.ship_date])

    // Append line
    order.items.push({
      distributor_line_id: `${orderId}-${order.items.length + 1}`,
      mfg_part_number: row[idx.asin] || null,
      manufacturer:    row[idx.brand] || null,
      description:     row[idx.title] || null,
      quantity_ordered:     numOrNull(row[idx.qty_ordered]),
      quantity_shipped:     numOrNull(row[idx.qty_shipped]),
      quantity_backordered: 0,
      quantity_cancelled:   0,
      unit_cost:            numOrNull(row[idx.item_subtotal]) && numOrNull(row[idx.qty_ordered])
                              ? numOrNull(row[idx.item_subtotal]) / numOrNull(row[idx.qty_ordered])
                              : null,
      line_total:           numOrNull(row[idx.item_total]),
      tracking_number:      trackingNum,
      carrier:              row[idx.carrier] || null,
      ship_date:            shipDate,
      expected_delivery:    null,
      serial_numbers:       [],
    })

    // Accumulate totals
    order.subtotal += numOrNull(row[idx.item_subtotal]) || 0
    order.shipping += numOrNull(row[idx.item_shipping]) || 0
    order.total    += numOrNull(row[idx.item_total])    || 0
  }

  return [...byOrder.values()]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function csvToArray(text) {
  // Simple CSV parser: quoted fields, commas inside quotes, BOM-safe
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
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

module.exports = {
  displayName:        DISPLAY_NAME,
  adapterKey:         ADAPTER_KEY,
  logoSlug:           'amazon-business',
  requiredFields:     REQUIRED_FIELDS,
  supportedSyncModes: ['csv_import'],
  defaults:           { environment: 'production' },
  testConnection,
  fetchOrders,
  fetchOrder,
  handleWebhook,
  parseCsv,
}
