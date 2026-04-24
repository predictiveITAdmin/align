/**
 * Distributor Adapter Registry
 *
 * Each adapter implements:
 *   - static displayName: string        → shown in admin UI
 *   - static adapterKey:  string        → unique key in DB (e.g. 'ingram_xi')
 *   - static logoSlug:    string        → svg file slug in client/public/logos/
 *   - static requiredFields: []         → { name, label, type, secret, help }
 *   - static supportedSyncModes: []     → ['api','webhook','csv_import','manual']
 *   - static defaults: {}               → default values for base_url, environment, etc.
 *
 *   - async testConnection(creds, config)  → { ok, message, details }
 *   - async fetchOrders(creds, config, since)  → async iterator of normalized orders
 *   - async fetchOrder(creds, config, id)  → single normalized order
 *   - async handleWebhook(payload, signature, secret)  → array of normalized orders
 *
 * Normalized order shape:
 * {
 *   distributor_order_id: string,
 *   po_number: string | null,
 *   order_date: ISO string,
 *   status: string (normalized enum),
 *   status_raw: string (distributor's exact),
 *   subtotal, tax, shipping, total: number,
 *   ship_to_name: string,
 *   ship_to_address: { line1, city, state, postal, country },
 *   items: [ {
 *     distributor_line_id, mfg_part_number, manufacturer, description,
 *     quantity_ordered, quantity_shipped, quantity_backordered, quantity_cancelled,
 *     unit_cost, line_total,
 *     tracking_number, carrier, ship_date, expected_delivery, serial_numbers[]
 *   }, ... ],
 *   metadata: {}
 * }
 */

const { ORDER_STATUS } = require('./constants')
const ingramXi           = require('./ingram_xi')
const ingramXiCsv        = require('./ingram_xi_csv')
const tdsynnexEcx        = require('./tdsynnex_ecx')
const tdsynnexEsolutions = require('./tdsynnex_esolutions')
const amazonBusinessCsv  = require('./amazon_business_csv')
const provantageManual   = require('./provantage_manual')
const dellPremier        = require('./dell_premier')

const adapters = {
  ingram_xi:            ingramXi,
  ingram_xi_csv:        ingramXiCsv,        // CSV import — fills gaps the ~30-day API window misses
  tdsynnex_ecx:         tdsynnexEcx,        // legacy stub — superseded by esolutions
  tdsynnex_esolutions:  tdsynnexEsolutions, // active — eSolutions XML/SOAP API
  amazon_business_csv:  amazonBusinessCsv,
  provantage_manual:    provantageManual,
  dell_premier:         dellPremier,        // Dell Premier / Business Direct order API
}

function getAdapter(key) {
  return adapters[key] || null
}

function listAdapters() {
  return Object.values(adapters).map(a => ({
    adapter_key: a.adapterKey,
    display_name: a.displayName,
    logo_slug: a.logoSlug,
    supported_sync_modes: a.supportedSyncModes,
    required_fields: a.requiredFields,
    defaults: a.defaults || {},
  }))
}

module.exports = { getAdapter, listAdapters, ORDER_STATUS }
