/**
 * Domain-based tenant resolution middleware.
 *
 * Resolves the tenant from the request's Host header by looking up
 * the tenants.domains JSONB array. Falls back to the default tenant
 * for the primary domain (align.predictiveit.ai).
 *
 * Sets req.tenant = { id, slug, name, settings } on every request.
 */

const db = require('../db')

// In-memory cache: domain → tenant (TTL 5 min)
const cache = new Map()
const CACHE_TTL = 5 * 60 * 1000

async function resolveTenant(hostname) {
  // Strip port if present
  const domain = hostname.split(':')[0].toLowerCase()

  // Check cache
  const cached = cache.get(domain)
  if (cached && Date.now() < cached.expires) return cached.tenant

  // Look up tenant by domain in the domains JSONB column
  let result = await db.query(
    `SELECT id, slug, name, settings FROM tenants
     WHERE domains @> $1::jsonb AND is_active = true
     LIMIT 1`,
    [JSON.stringify([domain])]
  )

  // Fallback: check if this is the primary platform domain
  if (!result.rows.length) {
    const primaryDomains = ['align.predictiveit.ai', 'localhost']
    if (primaryDomains.some(d => domain.includes(d))) {
      result = await db.query(
        `SELECT id, slug, name, settings FROM tenants
         WHERE slug = 'predictiveit' AND is_active = true
         LIMIT 1`
      )
    }
  }

  const tenant = result.rows[0] || null

  // Cache result
  cache.set(domain, { tenant, expires: Date.now() + CACHE_TTL })

  return tenant
}

function tenantMiddleware(req, res, next) {
  // Skip tenant resolution for health checks
  if (req.path === '/api/health') return next()

  const host = req.get('host') || req.hostname || 'localhost'

  resolveTenant(host)
    .then(tenant => {
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found for this domain' })
      }
      req.tenant = tenant
      next()
    })
    .catch(err => {
      console.error('[tenant] Resolution error:', err.message)
      next() // Don't block on tenant errors during development
    })
}

// Clear cache (useful after tenant updates)
function clearTenantCache() {
  cache.clear()
}

module.exports = { tenantMiddleware, clearTenantCache }
