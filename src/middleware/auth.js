/**
 * JWT authentication middleware.
 *
 * Verifies the align_token cookie and sets req.user.
 * Use requireAuth() for routes that need authentication.
 * Use requireRole('vcio', 'tenant_admin') for role-restricted routes.
 */

const jwt = require('jsonwebtoken')
const db = require('../db')

const JWT_SECRET = process.env.JWT_SECRET

/**
 * Populates req.user if a valid token exists. Does NOT block the request.
 */
function optionalAuth(req, res, next) {
  const token = req.cookies?.align_token
  if (!token) return next()

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
  } catch {
    // Invalid token — ignore
  }
  next()
}

/**
 * Requires a valid authenticated user. Returns 401 if not.
 */
function requireAuth(req, res, next) {
  const token = req.cookies?.align_token
  if (!token) return res.status(401).json({ error: 'Authentication required' })

  try {
    const decoded = jwt.verify(token, JWT_SECRET)

    // Verify user's tenant matches the request tenant (unless global_admin)
    if (req.tenant && decoded.role !== 'global_admin' && decoded.tenant_id !== req.tenant.id) {
      return res.status(403).json({ error: 'Access denied for this tenant' })
    }

    req.user = decoded
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

/**
 * Requires one of the specified roles.
 * Usage: requireRole('global_admin', 'tenant_admin')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' })

    // global_admin can always access
    if (req.user.role === 'global_admin') return next()

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    next()
  }
}

module.exports = { optionalAuth, requireAuth, requireRole }
