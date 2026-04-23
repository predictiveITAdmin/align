/**
 * TD Synnex eSolutions XML (SOAP) Adapter
 *
 * Uses the eSolutions PA/PO/POS APIs enabled for accounts 693316 + 791829.
 *
 * Auth: WS-Security UsernameToken in SOAP header.
 *   Username format:  "pitapi;693316"  (username;customerNumber)
 *   Password:         plaintext in wsse:Password PasswordText type
 *   NOTE: HTTP Basic auth is NOT used — the service requires WS-Security.
 *
 * Transport: HTTPS only — http://ws.synnex.com redirects 301 → https://ws.synnex.com
 *
 * Key limitation: getPOStatus is a single-PO lookup — there is no
 * "list all recent orders" endpoint. fetchOrders() therefore iterates
 * over PO numbers pulled from our local opportunities table.
 *
 * WSDL: http://ws.synnex.com/webservice/posserviceV02?wsdl
 *   targetNamespace: http://posV02.model.ws.synnex.com/
 *   SOAPAction: "" (empty — per WSDL binding)
 *   Operations: getPOStatus(customerNumber, poNo)
 *
 * Status values (per WSDL poHeaderStatus enum):
 *   SHIPPED   → shipped
 *   ACCEPTED  → confirmed
 *   INVOICED  → delivered
 *   HOLD      → exception
 *   REJECTED  → cancelled
 *   DELETED   → cancelled
 *   NOTFOUND  → (skipped)
 */

const axios    = require('axios')
const { XMLParser } = require('fast-xml-parser')
const { ORDER_STATUS } = require('./constants')

const DISPLAY_NAME = 'TD Synnex (eSolutions XML)'
const ADAPTER_KEY  = 'tdsynnex_esolutions'

// POS service endpoint (SOAP) — HTTPS required; HTTP 301-redirects to HTTPS
const DEFAULT_POS_URL = 'https://ws.synnex.com/webservice/posserviceV02'

const REQUIRED_FIELDS = [
  {
    name: 'username', label: 'API Username', type: 'text', secret: false,
    help: 'eSolutions API username (e.g. 6-insidesales@yourcompany.com)',
  },
  {
    name: 'password', label: 'API Password', type: 'text', secret: true,
    help: 'eSolutions API password',
  },
  {
    name: 'customer_number', label: 'Customer Account Number', type: 'text', secret: false,
    help: 'Your TD Synnex account number (e.g. 693316)',
    default: '693316',
  },
]

const XML_PARSER = new XMLParser({ ignoreAttributes: false, parseTagValue: true })

// ─── XML escape helper ────────────────────────────────────────────────────────
function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ─── SOAP envelope builder ────────────────────────────────────────────────────
// Auth: WS-Security UsernameToken (PasswordText) in SOAP header.
// Username format expected by TD Synnex: "pitapi;693316" (username;customerNumber)
function buildGetPOStatusEnvelope(creds, customerNumber, poNo) {
  const wsseNs = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd'
  const pwType = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText'
  // TD Synnex requires "username;customerNumber" as the SOAP security username
  const wsUsername = `${creds.username};${customerNumber}`
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:tns="http://posV02.model.ws.synnex.com/"
  xmlns:wsse="${wsseNs}">
  <soapenv:Header>
    <wsse:Security soapenv:mustUnderstand="1">
      <wsse:UsernameToken>
        <wsse:Username>${xmlEscape(wsUsername)}</wsse:Username>
        <wsse:Password Type="${pwType}">${xmlEscape(creds.password)}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <tns:getPOStatus>
      <arg0>
        <customerNumber>${customerNumber}</customerNumber>
        <poNo>${xmlEscape(String(poNo))}</poNo>
      </arg0>
    </tns:getPOStatus>
  </soapenv:Body>
</soapenv:Envelope>`
}

// ─── HTTP client ──────────────────────────────────────────────────────────────
// No HTTP-level auth — credentials are in the WS-Security SOAP header
function buildClient(creds, config) {
  const posUrl = config?.base_url || creds?.pos_url || DEFAULT_POS_URL
  return axios.create({
    baseURL: posUrl,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction':   '',   // WSDL specifies empty SOAPAction
    },
    timeout: 20000,
  })
}

// ─── Status mapping ───────────────────────────────────────────────────────────
// Based on WSDL poHeaderStatus enum: NOTFOUND, SHIPPED, ACCEPTED, HOLD, REJECTED, DELETED, INVOICED, UNKNOWN
function mapStatus(tdStatus) {
  const s = (tdStatus || '').toUpperCase()
  if (s === 'SHIPPED')                return ORDER_STATUS.SHIPPED
  if (s === 'INVOICED')               return ORDER_STATUS.DELIVERED
  if (s === 'ACCEPTED')               return ORDER_STATUS.CONFIRMED
  if (s === 'HOLD')                   return ORDER_STATUS.EXCEPTION
  if (s === 'REJECTED' || s === 'DELETED') return ORDER_STATUS.CANCELLED
  if (s === 'NOTFOUND')               return null  // caller should skip
  // Legacy values from older eSolutions docs — keep as fallback
  if (s.includes('SHIP_COMPLETE'))    return ORDER_STATUS.SHIPPED
  if (s.includes('PARTIAL'))          return ORDER_STATUS.PARTIALLY_SHIPPED
  if (s.includes('IN_PROGRESS'))      return ORDER_STATUS.CONFIRMED
  if (s.includes('BACKORDER'))        return ORDER_STATUS.BACKORDERED
  if (s.includes('CANCEL'))           return ORDER_STATUS.CANCELLED
  return ORDER_STATUS.CONFIRMED
}

// ─── Parse SOAP response ──────────────────────────────────────────────────────
function parsePOStatusResponse(xmlText) {
  const parsed = XML_PARSER.parse(xmlText)
  // Navigate SOAP envelope — handle various namespace prefixes
  const envelope = parsed['soapenv:Envelope'] || parsed['S:Envelope'] || parsed['soap:Envelope'] || parsed
  const body     = envelope['soapenv:Body']   || envelope['S:Body']   || envelope['soap:Body']   || envelope

  // Check for SOAP fault first
  const fault = body['soap:Fault'] || body['soapenv:Fault'] || body['Fault']
  if (fault) {
    throw new Error(fault.faultstring || fault['soap:faultstring'] || 'SOAP Fault')
  }

  const resp = body['ns2:getPOStatusResponse'] || body['getPOStatusResponse'] || Object.values(body)[0] || {}
  const ret  = resp['return'] || resp

  if (ret?.errorMessage && ret.errorMessage !== '') {
    throw new Error(ret.errorMessage)
  }

  return ret
}

// ─── Normalize one getPOStatus result to Align order schema ──────────────────
// WSDL field names: orderItem has lineNumber attr, status, orderNumber, orderType,
// orderQuantity, unitPrice, synnexSku, mfgPartNumber, productShortDescription,
// shipQuantity, shipMethod, shipDatetime, packages[].package[].trackingNumber
function normalizeOrder(poNo, customerNumber, raw) {
  // itemsV2 has <item> elements (OrderItemV2), legacy items also has <item> elements
  const rawItemsV2  = raw?.itemsV2?.item  || []
  const rawItemsOld = raw?.items?.item    || []
  const itemList = [
    ...(Array.isArray(rawItemsV2)  ? rawItemsV2  : rawItemsV2  ? [rawItemsV2]  : []),
    ...(Array.isArray(rawItemsOld) ? rawItemsOld : rawItemsOld ? [rawItemsOld] : []),
  ]

  const items = itemList.map(item => {
    // Collect tracking numbers from packages
    const packages = item.packages?.package || []
    const pkgList = Array.isArray(packages) ? packages : (packages ? [packages] : [])
    const trackingNumbers = pkgList.map(p => p.trackingNumber).filter(Boolean)

    return {
      distributor_line_id:  String(item['@_lineNumber'] ?? item.lineNumber ?? ''),
      mfg_part_number:      String(item.mfgPartNumber || ''),
      manufacturer:         null,  // not in WSDL response
      description:          String(item.productShortDescription || ''),
      quantity_ordered:     Number(item.orderQuantity) || 0,
      quantity_shipped:     Number(item.shipQuantity) || 0,
      quantity_backordered: 0,
      quantity_cancelled:   0,
      unit_cost:            Number(item.unitPrice) || null,
      line_total:           null,  // not in WSDL response
      tracking_number:      trackingNumbers[0] || null,
      carrier:              item.shipMethod || null,
      ship_date:            item.shipDatetime ? new Date(item.shipDatetime).toISOString() : null,
      expected_delivery:    item.eta ? new Date(item.eta).toISOString() : null,
      serial_numbers:       [],
      metadata:             {
        synnex_sku:        item.synnexSku,
        order_type:        item.orderType,
        status:            item.status,
        tracking_numbers:  trackingNumbers,            // all packages, UI renders each
      },
    }
  })

  // Collect all tracking numbers across items
  const allTracking = items.map(i => i.tracking_number).filter(Boolean)

  // Build ship_to from WSDL location/contact types
  const location = raw?.shipToLocation || {}
  const contact  = raw?.shipToContact  || {}
  const shipToAddr = {
    line1:   location.address1   || null,
    line2:   location.address2   || null,
    city:    location.city       || null,
    state:   location.state      || null,
    postal:  location.zipCode    || null,
    country: location.country    || null,
  }

  const status = mapStatus(raw.status)

  return {
    supplier_order_number: String(raw.orderNumber || poNo),
    po_number:             String(poNo),
    status:                status || ORDER_STATUS.CONFIRMED,
    status_raw:            String(raw.status || ''),
    order_date:            raw.submitDateTime   ? new Date(raw.submitDateTime).toISOString()   : null,
    estimated_delivery:    raw.eta              ? new Date(raw.eta).toISOString()              : null,
    total_amount:          null,  // not in POS WSDL response
    tracking_numbers:      allTracking,
    ship_to: {
      name:    contact.name  || '',
      email:   contact.email || '',
      phone:   contact.phone || '',
      ...shipToAddr,
    },
    ship_to_name:    contact.name || null,
    ship_to_address: shipToAddr,
    items,
    raw,
  }
}

// ─── testConnection ───────────────────────────────────────────────────────────
async function testConnection(creds, config = {}) {
  const accountNum = creds.customer_number || '693316'
  const client = buildClient(creds, config)
  try {
    const body = buildGetPOStatusEnvelope(creds, accountNum, 'TEST-CONN-0000')
    const res  = await client.post('', body)
    const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
    // Any XML response (even "PO not found") means auth worked
    if (text.includes('getPOStatusResponse') || text.includes('Envelope') || text.includes('errorMessage')) {
      return { ok: true, message: 'Connected to TD Synnex eSolutions POS service', details: { http_status: res.status } }
    }
    return { ok: false, message: 'Unexpected response format', details: { preview: text.slice(0, 200) } }
  } catch (err) {
    const soapFault = err.message || ''
    // A SOAP fault (not a network/HTTP error) means we connected and got a real service response
    if (soapFault.includes('not found') || soapFault.includes('NOTFOUND') || soapFault.includes('errorMessage')) {
      return { ok: true, message: 'Connected — test PO not found (expected)', details: {} }
    }
    if (soapFault.includes('login failed') || soapFault.includes('Security') || soapFault.includes('401')) {
      return { ok: false, message: 'Authentication failed — check username, password, and customer number', details: { fault: soapFault } }
    }
    if (err.response?.status) {
      const body = err.response?.data || ''
      const text = typeof body === 'string' ? body : ''
      if (text.includes('Envelope') || text.includes('Fault')) {
        // SOAP fault means we reached the service
        return { ok: false, message: `SOAP fault: ${text.slice(0, 300)}`, details: { status: err.response.status } }
      }
      return { ok: false, message: `HTTP ${err.response.status}: ${err.message}`, details: { status: err.response.status } }
    }
    return { ok: false, message: `Network error: ${err.message}` }
  }
}

// ─── fetchOrders — iterates over PO numbers from caller ──────────────────────
/**
 * Since TD Synnex POS has no "list recent orders" endpoint, the distributorSync
 * driver passes poNumbers explicitly. If none provided, yields nothing.
 *
 * Usage: for await (const order of fetchOrders(creds, config, since, { poNumbers })) { ... }
 */
async function* fetchOrders(creds, config, since = null, options = {}) {
  const { poNumbers = [] } = options
  if (!poNumbers.length) {
    console.log('[tdsynnex_esolutions] No PO numbers to query — pass poNumbers option')
    return
  }

  const client     = buildClient(creds)
  const accountNum = creds.customer_number || '693316'

  for (const poNo of poNumbers) {
    try {
      const body = buildGetPOStatusEnvelope(creds, accountNum, poNo)
      const res  = await client.post('', body)
      const text = typeof res.data === 'string' ? res.data : String(res.data)
      const raw  = parsePOStatusResponse(text)

      // Skip NOTFOUND or empty responses
      if (!raw || !raw.status || raw.status === 'NOTFOUND') {
        console.log(`[tdsynnex_esolutions] PO not found at TD Synnex: ${poNo}`)
        continue
      }

      yield normalizeOrder(poNo, accountNum, raw)
    } catch (err) {
      // "PO not found" SOAP faults are normal
      const msg = err.message || ''
      if (msg.includes('not found') || msg.includes('NOTFOUND') || msg.includes('No order')) {
        console.log(`[tdsynnex_esolutions] PO not found: ${poNo}`)
      } else {
        console.error(`[tdsynnex_esolutions] Error fetching PO ${poNo}:`, msg)
      }
    }
  }
}

// ─── fetchOrder — single PO lookup ───────────────────────────────────────────
async function fetchOrder(creds, config, poNo) {
  const client     = buildClient(creds)
  const accountNum = creds.customer_number || '693316'
  const body       = buildGetPOStatusEnvelope(creds, accountNum, poNo)
  const res        = await client.post('', body)
  const text       = typeof res.data === 'string' ? res.data : String(res.data)
  const raw        = parsePOStatusResponse(text)
  return normalizeOrder(poNo, accountNum, raw)
}

async function handleWebhook() { return [] }

module.exports = {
  displayName:        DISPLAY_NAME,
  adapterKey:         ADAPTER_KEY,
  logoSlug:           'td-synnex',
  requiredFields:     REQUIRED_FIELDS,
  supportedSyncModes: ['api'],
  syncStrategy:       'po_driven',   // signals that fetchOrders needs poNumbers passed in
  defaults:           { base_url: DEFAULT_POS_URL, customer_number: '693316' },
  testConnection,
  fetchOrders,
  fetchOrder,
  handleWebhook,
}
