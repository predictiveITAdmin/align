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
// "Order Management v6" product → base path /resellers/v6
// "Async Order Management v7" is for order CREATE + single-order lookup only.
// Order SEARCH/LIST uses v6 on the same base URL.
const API_VERSION  = 'v6'

const REQUIRED_FIELDS = [
  { name: 'client_id',       label: 'Client ID',         type: 'text',     secret: false,
    help: 'From developer.ingrammicro.com → Apps → your app → "Client ID"' },
  { name: 'client_secret',   label: 'Client Secret',     type: 'text',     secret: true,
    help: 'From developer.ingrammicro.com → Apps → your app → "Client Secret"' },
  { name: 'webhook_secret',  label: 'Secret Key',        type: 'text',     secret: true,
    help: 'From developer.ingrammicro.com → Apps → your app → "Secret Key" (used for webhook signature verification)' },
  { name: 'customer_number', label: 'Customer Number',   type: 'text',     secret: false,
    help: 'Your Ingram Micro reseller account number — visible as the numeric prefix in your app name (e.g. 70-797941)' },
  { name: 'country_code',    label: 'Country Code',      type: 'text',     secret: false,
    help: 'Default "US"', default: 'US' },
  { name: 'environment',     label: 'Environment',       type: 'select',   secret: false,
    options: ['production', 'sandbox'], default: 'production',
    help: 'Use "production" for live orders. "sandbox" uses the /sandbox path prefix on the same Ingram host.' },
]

const DEFAULTS = {
  base_url: PROD_BASE,
  environment: 'production',
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
  const base    = config.environment === 'sandbox' ? SANDBOX_BASE : PROD_BASE
  const version = config._versionOverride || API_VERSION
  const headers = {
    'Authorization':    `Bearer ${token}`,
    'IM-CountryCode':    creds.country_code || 'US',
    'IM-CorrelationID':  `align-${Date.now()}`,
    'Accept':            'application/json',
  }
  // IM-CustomerNumber is required by most endpoints — only add if provided
  if (creds.customer_number) headers['IM-CustomerNumber'] = creds.customer_number
  return axios.create({
    baseURL: `${base}/resellers/${version}`,
    headers,
    timeout: 30000,
  })
}

// ─── testConnection — called by admin UI ─────────────────────────────────────
async function testConnection(creds, config = {}) {
  try {
    // Step 1: get OAuth token
    const token = await getToken(creds, config)
    if (!token) return { ok: false, message: 'No access token returned from Ingram OAuth' }

    // Step 2: probe the orders search endpoint
    // Ingram v6 ordersearch requires a date window — probe last 90 days
    const client = buildClient(token, creds, config)
    let r
    let workingVersion = API_VERSION
    const today = new Date().toISOString().split('T')[0]
    const past90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const probeParams = { pageSize: 1, pageNumber: 1, orderDateBT: past90, orderDateET: today }

    // Try v6 first, fall back to v6.1 on 401 (product not yet active), then v7 token-only
    try {
      r = await client.get('/orders/ordersearch', { params: probeParams })
    } catch (probeErr) {
      const status = probeErr.response?.status
      if (status === 401 || status === 403) {
        // v6 product not yet approved — try v6.1
        try {
          const client61 = buildClient(token, creds, { ...config, _versionOverride: 'v6.1' })
          r = await client61.get('/orders/ordersearch', { params: probeParams })
          workingVersion = 'v6.1'
        } catch {
          // Neither v6 nor v6.1 is approved yet — but token is valid (we got this far)
          return {
            ok: true,
            message: 'OAuth credentials valid — awaiting "Order Management v6" product approval in Ingram portal',
            details: { environment: config.environment || 'production', apiVersion: 'token-only', tokenValid: true }
          }
        }
      } else if (status === 400) {
        // 400 often means v6 product is not enabled for this customer yet
        const errMsg = probeErr.response?.data?.errors?.[0]?.message
          || probeErr.response?.data?.message
          || 'Validation failed'
        return {
          ok: true,
          message: `OAuth credentials valid — API returned: ${errMsg}. If "Order Management v6" is approved in the portal, try syncing orders directly.`,
          details: { environment: config.environment || 'production', apiVersion: workingVersion, tokenValid: true }
        }
      } else {
        throw probeErr
      }
    }

    return {
      ok: true,
      message: 'Connected successfully',
      details: {
        recordsFound: r.data?.recordsFound ?? r.data?.totalRecords ?? r.data?.orders?.length ?? 0,
        environment: config.environment || 'production',
        apiVersion: workingVersion,
      }
    }
  } catch (err) {
    const status  = err.response?.status
    const data    = err.response?.data
    // Pull the most useful message out of Ingram's error shapes
    const errMsg  = data?.fault?.faultstring
      || data?.errors?.[0]?.message
      || data?.message
      || data?.error_description
      || JSON.stringify(data)
      || err.message
    console.error('[ingram_xi] testConnection error:', status, errMsg, JSON.stringify(data))
    return {
      ok: false,
      message: status ? `HTTP ${status}: ${errMsg}` : err.message,
      details: { status, error_data: data }
    }
  }
}

// ─── fetchOrders — async iterator of normalized orders since a given time ────
async function* fetchOrders(creds, config, since = null) {
  const token = await getToken(creds, config)
  const client = buildClient(token, creds, config)

  // Ingram Xvantage XI — order search endpoint: GET /resellers/v6.1/orders/ordersearch
  // Date format: YYYY-MM-DD for orderDateBT (begin) / orderDateET (end)
  const params = {
    pageSize:   100,
    pageNumber: 1,
  }
  if (since) params.orderDateBT = new Date(since).toISOString().split('T')[0]

  let pageNumber = 1
  while (true) {
    params.pageNumber = pageNumber
    const res = await client.get('/orders/ordersearch', { params })
    const orders = res.data?.orders || []
    if (!orders.length) break

    for (const o of orders) {
      // Fetch full order detail to get line items (summary search doesn't include them)
      try {
        const detail = await client.get(`/orders/${o.ingramOrderNumber}`)
        yield normalizeOrder(detail.data, creds)
      } catch {
        // Fall back to summary data if detail fetch fails
        yield normalizeOrder(o, creds)
      }
    }

    const total = res.data?.recordsFound || 0
    if (pageNumber * 100 >= total) break
    pageNumber++
    if (pageNumber > 100) break  // safety cap
  }
}

// ─── fetchOrder — single order by Ingram order number ────────────────────────
async function fetchOrder(creds, config, orderId) {
  const token = await getToken(creds, config)
  const client = buildClient(token, creds, config)
  // GET /resellers/v6.1/orders/{ingramOrderNumber}
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
