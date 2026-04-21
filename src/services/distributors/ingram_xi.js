/**
 * Ingram Micro Xvantage XI adapter.
 *
 * Auth: OAuth2 client credentials → bearer token (24h TTL)
 * Base: https://api.ingrammicro.com:443
 * Sandbox: https://api.ingrammicro.com:443/sandbox/  (PATH-based)
 * Docs: https://developer.ingrammicro.com/
 */
const axios = require('axios')
const { ORDER_STATUS } = require('./constants')

const DISPLAY_NAME = 'Ingram Micro (Xvantage)'
const ADAPTER_KEY  = 'ingram_xi'

const PROD_BASE    = 'https://api.ingrammicro.com:443'
// Sandbox in Ingram XI is just a path prefix on the same host
const SANDBOX_BASE = 'https://api.ingrammicro.com:443/sandbox'
const TOKEN_PATH   = '/oauth/oauth20/token'

const REQUIRED_FIELDS = [
  { name: 'client_id',       label: 'Consumer Key',      type: 'text',     secret: false,
    help: 'From developer.ingrammicro.com → your app → Consumer Key' },
  { name: 'client_secret',   label: 'Consumer Secret',   type: 'text',     secret: true,
    help: 'From developer.ingrammicro.com → your app → Consumer Secret' },
  { name: 'customer_number', label: 'Customer Number',   type: 'text',     secret: false,
    help: 'Your Ingram Micro reseller account number (e.g. 70-797941)' },
  { name: 'country_code',    label: 'Country Code',      type: 'text',     secret: false,
    help: 'Default "US"', default: 'US' },
]

const DEFAULTS = {
  base_url: PROD_BASE,
  environment: 'sandbox',
}

// ─── Normalize Ingram status → our enum ──────────────────────────────────────
function normalizeStatus(raw) {
  if (!raw) return null
  const u = String(raw).toUpperCase()
  if (u.includes('PENDING'))       return ORDER_STATUS.SUBMITTED
  if (u.includes('SUBMITTED'))     return ORDER_STATUS.SUBMITTED
  if (u.includes('CONFIRMED'))     return ORDER_STATUS.CONFIRMED
  if (u.includes('PROCESSING'))    return ORDER_STATUS.CONFIRMED
  if (u === 'SHIPPED' || u.includes('SHIP'))         return ORDER_STATUS.SHIPPED
  if (u.includes('PARTIAL'))       return ORDER_STATUS.PARTIALLY_SHIPPED
  if (u.includes('DELIVER'))       return ORDER_STATUS.DELIVERED
  if (u.includes('BACKORDER') || u.includes('B/O')) return ORDER_STATUS.BACKORDERED
  if (u.includes('CANCEL'))        return ORDER_STATUS.CANCELLED
  if (u.includes('RETURN'))        return ORDER_STATUS.RETURNED
  return ORDER_STATUS.EXCEPTION
}

// ─── Token cache (in-memory, per credentials set) ────────────────────────────
const _tokenCache = new Map()

function cacheKey(creds) {
  return `${creds.client_id}:${creds.environment || 'production'}`
}

async function getToken(creds, config) {
  const key = cacheKey({ ...creds, environment: config.environment })
  const cached = _tokenCache.get(key)
  if (cached && cached.expires_at > Date.now() + 60_000) return cached.access_token

  // Per Ingram docs: OAuth token endpoint is the SAME for sandbox + production.
  // Only the API data calls go to different base paths.
  const res = await axios.post(
    `${PROD_BASE}${TOKEN_PATH}`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: creds.client_id,
      client_secret: creds.client_secret,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  )

  const { access_token, expires_in } = res.data
  _tokenCache.set(key, {
    access_token,
    expires_at: Date.now() + ((expires_in || 3600) * 1000),
  })
  return access_token
}

function buildClient(token, creds, config) {
  const base = config.environment === 'sandbox' ? SANDBOX_BASE : PROD_BASE
  return axios.create({
    baseURL: `${base}/resellers/v6`,
    headers: {
      'Authorization':    `Bearer ${token}`,
      'IM-CustomerNumber': creds.customer_number,
      'IM-CountryCode':    creds.country_code || 'US',
      'IM-CorrelationID':  `align-${Date.now()}`,
      'Accept':            'application/json',
    },
    timeout: 30000,
  })
}

// ─── testConnection — called by admin UI ─────────────────────────────────────
async function testConnection(creds, config = {}) {
  try {
    const token = await getToken(creds, config)
    if (!token) return { ok: false, message: 'No access token returned' }

    // Simple probe — hit the orders list with minimal filter
    const client = buildClient(token, creds, config)
    // Use a past date way back to limit results; we don't need real data, just 200 OK
    const r = await client.get('/orders', {
      params: { 'customer-number': creds.customer_number, 'page-size': 1 }
    })

    return {
      ok: true,
      message: 'Connected successfully',
      details: {
        recordsReachable: r.data?.recordsFound ?? r.data?.totalResults ?? 'unknown',
        environment: config.environment || 'production',
      }
    }
  } catch (err) {
    const data = err.response?.data
    return {
      ok: false,
      message: err.response?.status
        ? `HTTP ${err.response.status}: ${data?.fault?.faultstring || data?.message || err.message}`
        : err.message,
      details: { error_data: data }
    }
  }
}

// ─── fetchOrders — async iterator of normalized orders since a given time ────
async function* fetchOrders(creds, config, since = null) {
  const token = await getToken(creds, config)
  const client = buildClient(token, creds, config)
  // Ingram /orders search endpoint
  const params = {
    'customer-number': creds.customer_number,
    'page-size': 100,
    'page-number': 1,
  }
  if (since) params['created-date-begin'] = new Date(since).toISOString().split('T')[0]

  let pageNumber = 1
  while (true) {
    params['page-number'] = pageNumber
    const res = await client.get('/orders', { params })
    const orders = res.data?.orders || []
    if (!orders.length) break

    for (const o of orders) {
      yield normalizeOrder(o, creds)
    }

    const total = res.data?.recordsFound || 0
    if (pageNumber * params['page-size'] >= total) break
    pageNumber++
    if (pageNumber > 100) break  // safety
  }
}

// ─── fetchOrder — single order by ID ─────────────────────────────────────────
async function fetchOrder(creds, config, orderId) {
  const token = await getToken(creds, config)
  const client = buildClient(token, creds, config)
  const res = await client.get(`/orders/${orderId}`)
  return normalizeOrder(res.data, creds)
}

// ─── normalizeOrder — raw Ingram response → our shape ────────────────────────
function normalizeOrder(raw, creds) {
  const shipTo = raw.shipToInfo || raw.shipTo || {}
  const lines = raw.lines || raw.orderLines || raw.items || []

  return {
    distributor_order_id: String(raw.ingramOrderNumber || raw.orderNumber || raw.id),
    po_number: raw.customerOrderNumber || raw.poNumber || null,
    order_date: raw.ingramOrderDate || raw.orderDate || raw.createdDate || null,
    status: normalizeStatus(raw.orderStatus || raw.status),
    status_raw: raw.orderStatus || raw.status || null,
    subtotal: raw.totals?.orderSubTotal ?? null,
    tax:      raw.totals?.orderTotalTax ?? null,
    shipping: raw.totals?.shippingCharges ?? null,
    total:    raw.totals?.orderTotal ?? null,
    currency: raw.currency || 'USD',
    ship_to_name: shipTo.name || shipTo.contact || null,
    ship_to_address: {
      line1:   shipTo.addressLine1,
      line2:   shipTo.addressLine2,
      city:    shipTo.city,
      state:   shipTo.state,
      postal:  shipTo.postalCode,
      country: shipTo.countryCode,
    },
    items: lines.map(l => ({
      distributor_line_id:  String(l.subOrderLineNumber || l.lineNumber || ''),
      mfg_part_number:      l.vendorPartNumber || l.manufacturerPartNumber || null,
      manufacturer:         l.vendorName || l.manufacturer || null,
      description:          l.description || null,
      quantity_ordered:     l.quantityOrdered || l.quantity || 0,
      quantity_shipped:     l.quantityShipped || 0,
      quantity_backordered: l.quantityBackordered || 0,
      quantity_cancelled:   l.quantityCancelled || 0,
      unit_cost:            l.unitPrice || l.netPrice || null,
      line_total:           l.extendedPrice || null,
      tracking_number:      (l.shipmentDetails?.[0]?.trackingNumber) || null,
      carrier:              (l.shipmentDetails?.[0]?.carrierName)   || null,
      ship_date:            (l.shipmentDetails?.[0]?.shippedDate)    || null,
      expected_delivery:    (l.shipmentDetails?.[0]?.estimatedDeliveryDate) || null,
      serial_numbers:       (l.serialNumberDetails || []).map(s => s.serialNumber).filter(Boolean),
    })),
    metadata: { raw_status: raw.orderStatus, source: 'ingram_xi' },
  }
}

// ─── Webhook handler (for im::order_shipped events) ──────────────────────────
async function handleWebhook(payload, signature, secret) {
  // TODO: verify signature once we know Ingram's signing scheme
  // Expected payload: { topic: 'im::order_shipped', resource: { ingramOrderNumber, ... } }
  if (payload?.resource) {
    return [normalizeOrder(payload.resource, {})]
  }
  return []
}

module.exports = {
  displayName:          DISPLAY_NAME,
  adapterKey:           ADAPTER_KEY,
  logoSlug:             'ingram-micro',
  requiredFields:       REQUIRED_FIELDS,
  supportedSyncModes:   ['api', 'webhook'],
  defaults:             DEFAULTS,

  testConnection,
  fetchOrders,
  fetchOrder,
  handleWebhook,
  normalizeStatus,
  normalizeOrder,
}
