const express = require('express')
const router = express.Router()
const msal = require('@azure/msal-node')
const jwt = require('jsonwebtoken')
const db = require('../db')

const JWT_SECRET = process.env.JWT_SECRET
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://align.predictiveit.ai'

// ─── MSAL Configuration ──────────────────────────────────────────────────────

const msalConfig = {
  auth: {
    clientId:     process.env.MS_CLIENT_ID,
    authority:    `https://login.microsoftonline.com/${process.env.MS_TENANT_ID || 'common'}`,
    clientSecret: process.env.MS_CLIENT_SECRET,
  },
}

const msalClient = new msal.ConfidentialClientApplication(msalConfig)

const REDIRECT_URI = `${process.env.BACKEND_URL || 'https://align.predictiveit.ai'}/api/auth/microsoft/callback`
const SCOPES = ['user.read', 'openid', 'profile', 'email']

// ─── GET /api/auth/microsoft — redirect to Microsoft login ───────────────────

router.get('/microsoft', async (req, res) => {
  try {
    const authUrl = await msalClient.getAuthCodeUrl({
      scopes: SCOPES,
      redirectUri: REDIRECT_URI,
      prompt: 'select_account',
    })
    res.redirect(authUrl)
  } catch (err) {
    console.error('[auth] Microsoft auth URL error:', err.message)
    res.redirect(`${FRONTEND_URL}/login?error=auth_failed`)
  }
})

// ─── GET /api/auth/microsoft/callback — handle OAuth callback ────────────────

router.get('/microsoft/callback', async (req, res) => {
  const { code, error } = req.query

  if (error || !code) {
    console.error('[auth] Microsoft callback error:', error)
    return res.redirect(`${FRONTEND_URL}/login?error=${error || 'no_code'}`)
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await msalClient.acquireTokenByCode({
      code,
      scopes: SCOPES,
      redirectUri: REDIRECT_URI,
    })

    const { account } = tokenResponse
    const email = account.username?.toLowerCase()
    const name = account.name || email

    if (!email) {
      return res.redirect(`${FRONTEND_URL}/login?error=no_email`)
    }

    // Find user by email (check all tenants)
    let user = await db.query(`SELECT * FROM users WHERE email = $1 AND is_active = true LIMIT 1`, [email])

    if (!user.rows.length) {
      // Auto-create user for predictiveIT domain
      const domain = email.split('@')[1]
      const isPIT = domain === 'predictiveit.com' || domain === 'predictiveit.ai'

      if (isPIT) {
        const tenant = await db.query(`SELECT id FROM tenants WHERE slug = 'predictiveit'`)
        if (tenant.rows.length) {
          await db.query(
            `INSERT INTO users (tenant_id, email, display_name, role, auth_provider, auth_provider_id, is_active)
             VALUES ($1, $2, $3, 'tam', 'microsoft', $4, true)
             ON CONFLICT (tenant_id, email) DO UPDATE SET
               display_name = EXCLUDED.display_name,
               auth_provider = 'microsoft',
               auth_provider_id = EXCLUDED.auth_provider_id,
               updated_at = NOW()`,
            [
              tenant.rows[0].id,
              email,
              name,
              account.homeAccountId,
            ]
          )
          user = await db.query(`SELECT * FROM users WHERE email = $1 AND is_active = true LIMIT 1`, [email])
        }
      }

      if (!user.rows.length) {
        return res.redirect(`${FRONTEND_URL}/login?error=not_authorized`)
      }
    }

    const dbUser = user.rows[0]

    if (!dbUser.is_active) {
      return res.redirect(`${FRONTEND_URL}/login?error=account_disabled`)
    }

    // Issue JWT
    const token = jwt.sign(
      {
        sub: dbUser.id,
        email: dbUser.email,
        name: dbUser.display_name,
        role: dbUser.role,
        tenant_id: dbUser.tenant_id,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    // Update last login
    await db.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [dbUser.id])

    // Set cookie and redirect to frontend
    res.cookie('align_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/',
    })

    res.redirect(FRONTEND_URL)
  } catch (err) {
    console.error('[auth] Microsoft callback error:', err.message)
    res.redirect(`${FRONTEND_URL}/login?error=token_failed`)
  }
})

// ─── GET /api/auth/me — get current user from JWT cookie ─────────────────────

router.get('/me', async (req, res) => {
  const token = req.cookies?.align_token
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    const user = await db.query(
      `SELECT id, email, first_name, last_name, display_name, role, tenant_id
       FROM users WHERE id = $1 AND is_active = true`,
      [decoded.sub]
    )

    if (!user.rows.length) return res.status(401).json({ error: 'User not found' })
    res.json({ data: user.rows[0] })
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' })
  }
})

// ─── POST /api/auth/logout ───────────────────────────────────────────────────

router.post('/logout', (req, res) => {
  res.clearCookie('align_token', { path: '/' })
  res.json({ status: 'ok' })
})

module.exports = router
