/**
 * TD Synnex ECExpress / Digital Bridge adapter — STUB
 *
 * STATUS: awaiting API credentials. Registration pending via
 * helpdeskus@tdsynnex.com (subject: "Register for Price & Availability
 * (PA) API access").
 *
 * Once credentials arrive, fill in:
 *  - Auth method (likely API key or basic auth)
 *  - Base URL (provided on onboarding)
 *  - Order list / detail / tracking endpoints
 *  - Status value mapping
 */
const { ORDER_STATUS } = require('./constants')

const DISPLAY_NAME = 'TD Synnex (ECExpress)'
const ADAPTER_KEY  = 'tdsynnex_ecx'

const REQUIRED_FIELDS = [
  { name: 'api_key',         label: 'API Key',        type: 'text', secret: true,
    help: 'Provided by TD Synnex after helpdeskus@tdsynnex.com registration' },
  { name: 'customer_number', label: 'Customer Number',type: 'text', secret: false,
    help: 'Your TD Synnex / TechData account number (e.g. 693316)' },
  { name: 'base_url',        label: 'Base URL',        type: 'text', secret: false,
    help: 'Provided during onboarding', default: 'https://digitalbridge.tdsynnex.com' },
]

async function testConnection(creds, config = {}) {
  return {
    ok: false,
    message: 'TD Synnex API adapter is stubbed — API access pending. Email helpdeskus@tdsynnex.com to register.',
    details: { status: 'pending_registration' },
  }
}

async function* fetchOrders(creds, config, since = null) {
  // Empty — no implementation yet
  return
  yield // satisfies the async generator signature
}

async function fetchOrder(creds, config, orderId) {
  throw new Error('TD Synnex adapter not yet implemented')
}

async function handleWebhook() { return [] }

module.exports = {
  displayName:        DISPLAY_NAME,
  adapterKey:         ADAPTER_KEY,
  logoSlug:           'td-synnex',
  requiredFields:     REQUIRED_FIELDS,
  supportedSyncModes: ['api'],
  defaults:           { environment: 'production' },
  testConnection,
  fetchOrders,
  fetchOrder,
  handleWebhook,
}
