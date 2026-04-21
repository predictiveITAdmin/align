/**
 * Provantage — Manual Entry adapter.
 *
 * Provantage does not offer a public API. Orders are entered manually
 * through the Orders UI ("Add Manual Order" button). This adapter is
 * effectively a no-op for sync but still registers with the suppliers
 * table so Provantage orders are grouped consistently.
 */
const { ORDER_STATUS } = require('./constants')

module.exports = {
  displayName:        'Provantage (Manual)',
  adapterKey:         'provantage_manual',
  logoSlug:           'provantage',
  requiredFields:     [
    { name: 'account_number', label: 'Provantage Account #', type: 'text', secret: false,
      help: 'Informational only — orders are entered manually' },
  ],
  supportedSyncModes: ['manual'],
  defaults:           { environment: 'production' },

  async testConnection() {
    return { ok: true, message: 'Manual entry mode — no API connection needed.', details: {} }
  },

  async* fetchOrders() { return; yield },

  async fetchOrder() {
    throw new Error('Provantage adapter: manual entry only, no API')
  },

  async handleWebhook() { return [] },
}
