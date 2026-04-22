/**
 * Dell Premier / Dell Business Direct Order API Adapter
 *
 * Dell Premier provides a REST API for enterprise/commercial accounts to query
 * order status and history. Access requires a Dell Premier account with API
 * credentials obtained through your Dell account team or Premier portal.
 *
 * Authentication: OAuth2 Client Credentials (Bearer token)
 *   - Token URL: https://apigtwb2c.us.dell.com/auth/oauth/v2/token
 *   - Scope: read (order inquiry)
 *
 * Key Endpoints (base: https://apigtwb2c.us.dell.com/PROD/v1):
 *   GET /orders                           → list orders (by date range or PO)
 *   GET /orders/{orderNumber}             → single order detail
 *   GET /orders?purchaseOrderNumber={po} → lookup by PO number
 *
 * Sync strategy: date-range query (fetchOrders gets all orders since `since`)
 * — no PO-driven strategy needed; Dell exposes a proper list endpoint.
 *
 * Status mapping (Dell → Align):
 *   Pending, Processing → submitted
 *   Acknowledged        → confirmed
 *   Shipped             → shipped
 *   Delivered           → delivered
 *   Cancelled           → cancelled
 *   On Hold             → exception
 *
 * NOTE: If your Dell account uses the older Digital Locker or a custom portal,
 * contact your Dell account representative to get API credentials via Premier.
 */

const axios        = require('axios')
const { ORDER_STATUS } = require('./constants')

const DISPLAY_NAME = 'Dell Premier'
const ADAPTER_KEY  = 'dell_premier'
const LOGO_SLUG    = 'dell'

// OAuth2 token endpoint and API base
const TOKEN_URL  = 'https://apigtwb2c.us.dell.com/auth/oauth/v2/token'
const DEFAULT_BASE_URL = 'https://apigtwb2c.us.dell.com/PROD/v1'

const REQUIRED_FIELDS = [
  {
    name: 'client_id',
    label: 'Client ID',
    type: 'text',
    secret: false,
    help: 'OAuth2 Client ID from Dell Premier API credentials',
  },
  {
    name: 'client_secret',
    label: 'Client Secret',
    type: 'text',
    secret: true,
    help: 'OAuth2 Client Secret from Dell Premier API credentials',
  },
  {
    name: 'account_number',
    label: 'Dell Account Number',
    type: 'text',
    secret: false,
    help: 'Your Dell Premier account / customer number (optional — used to filter orders)',
  },
]

// ─── OAuth token management ───────────────────────────────────────────────────
let _tokenCache = { token: null, expiresAt: 0 }

async function getAccessToken(creds) {
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt - 60_000) {
    return _tokenCache.token
  }
  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     creds.client_id,
    client_secret: creds.client_secret,
  })
  const res = await axios.post(TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15_000,
  })
  _tokenCache = {
    token:     res.data.access_token,
    expiresAt: Date.now() + (res.data.expires_in || 3600) * 1000,
  }
  return _tokenCache.token
}

function buildClient(creds, config) {
  const baseURL = config.base_url || DEFAULT_BASE_URL
  return {
    get: async (path, params = {}) => {
      const token = await getAccessToken(creds)
      const res = await axios.get(`${baseURL}${path}`, {
        params,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        timeout: 30_000,
      })
      return res.data
    },
  }
}

// ─── Status normalization ─────────────────────────────────────────────────────
function normalizeStatus(raw) {
  const s = String(raw || '').toLowerCase()
  if (s.includes('deliver'))              return ORDER_STATUS.DELIVERED
  if (s.includes('ship'))                 return ORDER_STATUS.SHIPPED
  if (s.includes('cancel'))              return ORDER_STATUS.CANCELLED
  if (s.includes('hold'))                return ORDER_STATUS.EXCEPTION
  if (s.includes('acknowledg'))          return ORDER_STATUS.CONFIRMED
  if (s.includes('process'))             return ORDER_STATUS.SUBMITTED
  if (s.includes('pending'))             return ORDER_STATUS.SUBMITTED
  return ORDER_STATUS.SUBMITTED
}

// ─── Normalize a single Dell order to Align shape ────────────────────────────
function normalizeOrder(raw) {
  const items = (raw.lineItems || raw.lines || raw.orderLines || []).map((li, idx) => ({
    distributor_line_id:    String(li.lineNumber || li.id || idx),
    mfg_part_number:        li.partNumber || li.sku || li.itemId || null,
    manufacturer:           'Dell',
    description:            li.description || li.productDescription || null,
    quantity_ordered:       Number(li.quantityOrdered || li.quantity || 0),
    quantity_shipped:       Number(li.quantityShipped || 0),
    quantity_backordered:   Number(li.quantityBackordered || 0),
    quantity_cancelled:     Number(li.quantityCancelled || 0),
    unit_cost:              li.unitPrice != null ? Number(li.unitPrice) : null,
    line_total:             li.extendedPrice != null ? Number(li.extendedPrice) : null,
    tracking_number:        li.trackingNumber || li.carrierTrackingNumber || null,
    carrier:                li.carrier || li.shippingCarrier || null,
    ship_date:              li.shipDate || li.shippedDate || null,
    expected_delivery:      li.estimatedDeliveryDate || li.expectedDelivery || null,
    serial_numbers:         li.serialNumbers || [],
  }))

  const shipTo = raw.shippingAddress || raw.shipTo || {}

  return {
    distributor_order_id: String(raw.orderId || raw.orderNumber || raw.id),
    po_number:            raw.purchaseOrderNumber || raw.customerPONumber || null,
    order_date:           raw.orderDate || raw.createdDate || null,
    status:               normalizeStatus(raw.orderStatus || raw.status),
    status_raw:           String(raw.orderStatus || raw.status || ''),
    subtotal:             raw.subtotal != null ? Number(raw.subtotal) : null,
    tax:                  raw.taxAmount != null ? Number(raw.taxAmount) : null,
    shipping:             raw.shippingAmount != null ? Number(raw.shippingAmount) : null,
    total:                raw.totalAmount != null ? Number(raw.totalAmount) : null,
    ship_to_name:         shipTo.name || raw.shipToName || null,
    ship_to_address: {
      line1:   shipTo.addressLine1 || shipTo.address1 || null,
      city:    shipTo.city || null,
      state:   shipTo.state || shipTo.stateCode || null,
      postal:  shipTo.postalCode || shipTo.zip || null,
      country: shipTo.country || shipTo.countryCode || 'US',
    },
    items,
    metadata: raw,
  }
}

// ─── testConnection ───────────────────────────────────────────────────────────
async function testConnection(creds, config) {
  try {
    const token = await getAccessToken(creds)
    if (!token) throw new Error('No token returned')
    return { ok: true, message: 'Connected to Dell Premier API — authentication successful' }
  } catch (err) {
    const msg = err.response?.data?.error_description || err.message
    return { ok: false, message: `Dell Premier connection failed: ${msg}` }
  }
}

// ─── fetchOrders ─────────────────────────────────────────────────────────────
/**
 * Fetch all Dell orders since `since` date, yielding normalized orders.
 * Dell's list endpoint returns paginated results by date range.
 */
async function* fetchOrders(creds, config, since) {
  const api = buildClient(creds, config)
  const fromDate = since ? since.toISOString().split('T')[0] : '2021-01-01'

  let page = 0
  const pageSize = 50

  while (true) {
    let data
    try {
      data = await api.get('/orders', {
        fromOrderDate: fromDate,
        pageSize,
        pageNumber: page,
        ...(config.account_number ? { customerNumber: config.account_number } : {}),
      })
    } catch (err) {
      if (err.response?.status === 404 || err.response?.status === 204) break
      throw err
    }

    const orders = data.orders || data.content || data.data || data || []
    if (!Array.isArray(orders) || orders.length === 0) break

    for (const order of orders) {
      yield normalizeOrder(order)
    }

    // Pagination: stop when fewer results than page size
    const total     = data.totalCount || data.totalElements || data.total || null
    const fetched   = (page + 1) * pageSize
    if (total !== null && fetched >= total) break
    if (orders.length < pageSize) break
    page++
  }
}

// ─── fetchOrder (single PO lookup) ───────────────────────────────────────────
async function fetchOrder(creds, config, orderId) {
  const api = buildClient(creds, config)
  const data = await api.get(`/orders/${orderId}`)
  return normalizeOrder(data)
}

// ─── Adapter export ───────────────────────────────────────────────────────────
module.exports = {
  displayName:          DISPLAY_NAME,
  adapterKey:           ADAPTER_KEY,
  logoSlug:             LOGO_SLUG,
  requiredFields:       REQUIRED_FIELDS,
  supportedSyncModes:   ['api'],
  syncStrategy:         'date_range',    // uses fromDate filter, not PO-driven
  defaults: {
    environment: 'production',
    base_url:    DEFAULT_BASE_URL,
  },

  testConnection,
  fetchOrders,
  fetchOrder,
}
