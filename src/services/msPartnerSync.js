/**
 * Microsoft Partner Center Sync Service
 *
 * Uses ROPC (Resource Owner Password Credentials) flow to authenticate as
 * the alignapi service account, then pulls CSP customer subscriptions from
 * Partner Center API and upserts into saas_subscriptions table.
 *
 * Also pulls per-user license assignments from Microsoft Graph for each
 * customer tenant using app-only (client_credentials) auth.
 *
 * Env vars required:
 *   MS_ALIGN_TENANT_ID, MS_ALIGN_CLIENT_ID, MS_ALIGN_CLIENT_SECRET
 *   MS_ALIGN_SYNC_USERNAME, MS_ALIGN_SYNC_PASSWORD
 */

const axios = require('axios')
const qs = require('querystring')
const db = require('../db')

const PARTNER_CENTER_BASE = 'https://api.partnercenter.microsoft.com'
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const TOKEN_BASE = `https://login.microsoftonline.com/${process.env.MS_ALIGN_TENANT_ID}/oauth2`

// ─── Token helpers ────────────────────────────────────────────────────────────

async function getPartnerCenterToken() {
  // Use refresh token (Secure Application Model) — obtained once via interactive browser login
  const res = await axios.post(
    `https://login.microsoftonline.com/${process.env.MS_ALIGN_TENANT_ID}/oauth2/v2.0/token`,
    qs.stringify({
      grant_type:    'refresh_token',
      client_id:     process.env.MS_ALIGN_CLIENT_ID,
      client_secret: process.env.MS_ALIGN_CLIENT_SECRET,
      refresh_token: process.env.MS_ALIGN_PC_REFRESH_TOKEN,
      scope:         'https://api.partnercenter.microsoft.com/user_impersonation offline_access',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )
  return res.data.access_token
}

async function getGraphToken(customerTenantId) {
  // App-only token scoped to a specific customer tenant via CSP
  const res = await axios.post(
    `https://login.microsoftonline.com/${customerTenantId}/oauth2/v2.0/token`,
    qs.stringify({
      grant_type:    'client_credentials',
      client_id:     process.env.MS_ALIGN_CLIENT_ID,
      client_secret: process.env.MS_ALIGN_CLIENT_SECRET,
      scope:         'https://graph.microsoft.com/.default',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )
  return res.data.access_token
}

// ─── Partner Center API helpers ───────────────────────────────────────────────

async function getCustomers(pcToken) {
  const customers = []
  let url = `${PARTNER_CENTER_BASE}/v1/customers?size=500`
  while (url) {
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${pcToken}`, Accept: 'application/json' },
    })
    const data = res.data
    if (data.items) customers.push(...data.items)
    url = data.links?.next?.uri ? `${PARTNER_CENTER_BASE}${data.links.next.uri}` : null
  }
  return customers
}

async function getCustomerSubscriptions(pcToken, customerId) {
  const res = await axios.get(
    `${PARTNER_CENTER_BASE}/v1/customers/${customerId}/subscriptions`,
    { headers: { Authorization: `Bearer ${pcToken}`, Accept: 'application/json' } }
  )
  return res.data.items || []
}

// ─── Graph API helpers ────────────────────────────────────────────────────────

async function getSubscribedSkus(graphToken) {
  const res = await axios.get(`${GRAPH_BASE}/subscribedSkus`, {
    headers: { Authorization: `Bearer ${graphToken}` },
  })
  return res.data.value || []
}

async function getUserLicenses(graphToken) {
  const users = []
  let url = `${GRAPH_BASE}/users?$select=id,displayName,userPrincipalName,assignedLicenses,accountEnabled,createdDateTime&$top=999`
  while (url) {
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${graphToken}` },
    })
    const data = res.data
    if (data.value) users.push(...data.value)
    url = data['@odata.nextLink'] || null
  }
  return users
}

// ─── Client matching ──────────────────────────────────────────────────────────

function normalise(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function matchClient(pcCompanyName, pcDomain, alignClients) {
  const normName = normalise(pcCompanyName)
  // 1. Exact normalised name match
  let match = alignClients.find(c => normalise(c.name) === normName)
  if (match) return match
  // 2. Domain match
  if (pcDomain) {
    const normDomain = normalise(pcDomain.split('.')[0])
    match = alignClients.find(c => normalise(c.name) === normDomain)
    if (match) return match
  }
  // 3. Contains match (one side contains the other)
  match = alignClients.find(c => {
    const cn = normalise(c.name)
    return cn.includes(normName) || normName.includes(cn)
  })
  return match || null
}

// ─── Main sync ────────────────────────────────────────────────────────────────

async function syncMsPartner(tenantId) {
  const required = ['MS_ALIGN_TENANT_ID','MS_ALIGN_CLIENT_ID','MS_ALIGN_CLIENT_SECRET','MS_ALIGN_PC_REFRESH_TOKEN']
  const missing = required.filter(k => !process.env[k])
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`)

  await db.query(
    `INSERT INTO sync_sources (tenant_id, source_type, display_name, is_enabled)
     VALUES ($1, 'ms_partner', 'Microsoft 365 (Partner Center)', true)
     ON CONFLICT (tenant_id, source_type) DO NOTHING`,
    [tenantId]
  )

  // Load all active clients for this tenant
  const clientsResult = await db.query(
    `SELECT id, name FROM clients WHERE tenant_id = $1 AND is_active = true`,
    [tenantId]
  )
  const alignClients = clientsResult.rows

  let pcToken
  try {
    pcToken = await getPartnerCenterToken()
  } catch (err) {
    throw new Error(`Partner Center auth failed: ${err.response?.data?.error_description || err.message}`)
  }

  const customers = await getCustomers(pcToken)
  console.log(`[msPartnerSync] Found ${customers.length} Partner Center customers`)

  const stats = { customers: customers.length, matched: 0, subscriptions_upserted: 0, users_upserted: 0, skipped: 0, errors: 0 }

  for (const customer of customers) {
    const companyName = customer.companyProfile?.companyName || customer.name || ''
    const domain = customer.companyProfile?.domain || ''
    const customerTenantId = customer.id  // Partner Center customer ID = their tenant ID

    const alignClient = matchClient(companyName, domain, alignClients)
    if (!alignClient) {
      console.log(`[msPartnerSync] No match for: ${companyName} (${domain})`)
      stats.skipped++
      continue
    }

    stats.matched++

    // ── Pull subscriptions from Partner Center ──
    let subscriptions = []
    try {
      subscriptions = await getCustomerSubscriptions(pcToken, customerTenantId)
    } catch (err) {
      console.error(`[msPartnerSync] Subscriptions fetch failed for ${companyName}: ${err.message}`)
      stats.errors++
      continue
    }

    for (const sub of subscriptions) {
      if (sub.status !== 'active') continue
      const licName = sub.offerName || sub.id
      const seats = sub.quantity || 0
      const costPerSeat = null  // Partner Center doesn't return price; user sets manually

      try {
        await db.query(
          `INSERT INTO saas_subscriptions
             (tenant_id, client_id, platform, license_name, license_sku, total_seats, subscription_end, notes)
           VALUES ($1,$2,'microsoft365',$3,$4,$5,$6,$7)
           ON CONFLICT (tenant_id, client_id, platform, license_name)
           DO UPDATE SET
             total_seats = EXCLUDED.total_seats,
             license_sku = COALESCE(EXCLUDED.license_sku, saas_subscriptions.license_sku),
             subscription_end = EXCLUDED.subscription_end,
             updated_at = now()`,
          [
            tenantId,
            alignClient.id,
            licName,
            sub.offerUri || null,
            seats,
            sub.commitmentEndDate ? sub.commitmentEndDate.split('T')[0] : null,
            `Synced from Partner Center — ${companyName}`,
          ]
        )
        stats.subscriptions_upserted++
      } catch (err) {
        console.error(`[msPartnerSync] Subscription upsert failed: ${err.message}`)
        stats.errors++
      }
    }

    // ── Pull per-user licenses from Graph (app-only, customer tenant) ──
    let graphToken
    try {
      graphToken = await getGraphToken(customerTenantId)
    } catch (err) {
      // App may not have been pre-consented in this tenant — skip user sync
      console.log(`[msPartnerSync] Graph token failed for ${companyName} (no pre-consent?): ${err.response?.data?.error_description || err.message}`)
      continue
    }

    let skus = []
    try {
      skus = await getSubscribedSkus(graphToken)
    } catch (err) {
      console.log(`[msPartnerSync] subscribedSkus failed for ${companyName}: ${err.message}`)
    }

    // Build SKU id → name map for this tenant
    const skuMap = {}
    for (const sku of skus) skuMap[sku.skuId] = sku.skuPartNumber

    let users = []
    try {
      users = await getUserLicenses(graphToken)
    } catch (err) {
      console.log(`[msPartnerSync] User fetch failed for ${companyName}: ${err.message}`)
      continue
    }

    // Mark existing rows inactive before upsert (soft refresh)
    await db.query(
      `UPDATE saas_licenses SET is_active = false
       WHERE tenant_id = $1 AND client_id = $2 AND platform = 'microsoft365'`,
      [tenantId, alignClient.id]
    )

    for (const user of users) {
      for (const lic of (user.assignedLicenses || [])) {
        const licName = skuMap[lic.skuId] || lic.skuId
        try {
          await db.query(
            `INSERT INTO saas_licenses
               (tenant_id, client_id, platform, user_email, user_display_name, license_name, is_active, account_status)
             VALUES ($1,$2,'microsoft365',$3,$4,$5,true,$6)
             ON CONFLICT (tenant_id, client_id, platform, user_email, license_name)
             DO UPDATE SET
               user_display_name = EXCLUDED.user_display_name,
               license_name = EXCLUDED.license_name,
               is_active = true,
               account_status = EXCLUDED.account_status,
               updated_at = now()`,
            [
              tenantId,
              alignClient.id,
              user.userPrincipalName,
              user.displayName || user.userPrincipalName,
              licName,
              user.accountEnabled ? 'active' : 'suspended',
            ]
          )
          stats.users_upserted++
        } catch (err) {
          stats.errors++
        }
      }
    }

    console.log(`[msPartnerSync] ✓ ${companyName} → ${subscriptions.length} subs, ${users.length} users`)
  }

  await db.query(
    `UPDATE sync_sources SET last_sync_at = now() WHERE tenant_id = $1 AND source_type = 'ms_partner'`,
    [tenantId]
  )

  return stats
}

module.exports = { syncMsPartner }
