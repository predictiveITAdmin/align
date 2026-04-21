// Shared constants for distributor adapters — extracted to break circular
// dependency between ./index and individual adapters.

const ORDER_STATUS = {
  PENDING_SUBMISSION: 'pending_submission',
  SUBMITTED:          'submitted',
  CONFIRMED:          'confirmed',
  PARTIALLY_SHIPPED:  'partially_shipped',
  SHIPPED:            'shipped',
  OUT_FOR_DELIVERY:   'out_for_delivery',
  DELIVERED:          'delivered',
  RECEIPT_CONFIRMED:  'receipt_confirmed',
  BACKORDERED:        'backordered',
  CANCELLED:          'cancelled',
  RETURNED:           'returned',
  EXCEPTION:          'exception',
}

module.exports = { ORDER_STATUS }
