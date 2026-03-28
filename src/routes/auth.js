const express = require('express')
const router = express.Router()
const msal = require('@azure/msal-node')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const axios = require('axios')
const db = require('../db')

const JWT_SECRET = process.env.JWT_SECRET
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://align.predictiveit.ai'

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function findOrCreateUser(email, displayName, authProvider, authProviderId) {
  // Find existing user
  let user = await db.query(
    `SELECT * FROM users WHERE email = $1 AND is_active = true LIMIT 1`,
    [email]
  )

  if (!user.rows.length) {
    // Auto-create for predictiveIT domains
    const domain = email.split('@')[1]
    const isPIT = domain === 'predictiveit.com' || domain === 'predictiveit.ai'

    if (isPIT) {
      const tenant = await db.query(`SELECT id FROM tenants WHERE slug = 'predictiveit'`)
      if (tenant.rows.length) {
        await db.query(
          `INSERT INTO users (tenant_id, email, display_name, role, auth_provider, auth_provider_id, is_active)
           VALUES ($1, $2, $3, 'tam', $4, $5, true)
           ON CONFLICT (tenant_id, email) DO UPDATE SET
             display_name = EXCLUDED.display_name,
             auth_provider = EXCLUDED.auth_provider,
             auth_provider_id = EXCLUDED.auth_provider_id,
             updated_at = NOW()`,
          [tenant.rows[0].id, email, displayName, authProvider, authProviderId || null]
        )
        user = await db.query(
          `SELECT * FROM users WHERE email = $1 AND is_active = true LIMIT 1`,
          [email]
        )
      }
    }
  }

  return user.rows[0] || null
}

function issueTokenAndRedirect(res, dbUser) {
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
  db.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [dbUser.id]).catch(() => {})

  res.cookie('align_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  })

  res.redirect(FRONTEND_URL)
}

// ═══════════════════════════════════════════════════════════════════════════════
// MICROSOFT 365 SSO
// ═══════════════════════════════════════════════════════════════════════════════

const msalConfig = {
  auth: {
    clientId:     process.env.MS_CLIENT_ID,
    authority:    `https://login.microsoftonline.com/${process.env.MS_TENANT_ID || 'common'}`,
    clientSecret: process.env.MS_CLIENT_SECRET,
  },
}

let msalClient = null
try {
  if (process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET) {
    msalClient = new msal.ConfidentialClientApplication(msalConfig)
  }
} catch (err) {
  console.warn('[auth] MSAL init failed:', err.message)
}

const MS_REDIRECT_URI = `${FRONTEND_URL}/api/auth/microsoft/callback`
const MS_SCOPES = ['user.read', 'openid', 'profile', 'email']

router.get('/microsoft', async (req, res) => {
  if (!msalClient) return res.redirect(`${FRONTEND_URL}/login?error=ms_not_configured`)
  try {
    const authUrl = await msalClient.getAuthCodeUrl({
      scopes: MS_SCOPES,
      redirectUri: MS_REDIRECT_URI,
      prompt: 'select_account',
    })
    res.redirect(authUrl)
  } catch (err) {
    console.error('[auth] Microsoft auth URL error:', err.message)
    res.redirect(`${FRONTEND_URL}/login?error=auth_failed`)
  }
})

router.get('/microsoft/callback', async (req, res) => {
  const { code, error, error_description } = req.query
  console.log('[auth] MS callback:', { code: code ? `${code.substring(0, 20)}...` : 'missing', error, error_description })

  if (error || !code) {
    console.error('[auth] MS callback rejected:', error, error_description)
    return res.redirect(`${FRONTEND_URL}/login?error=${error || 'no_code'}`)
  }

  try {
    const tokenResponse = await msalClient.acquireTokenByCode({
      code,
      scopes: MS_SCOPES,
      redirectUri: MS_REDIRECT_URI,
    })

    const { account } = tokenResponse
    const email = account.username?.toLowerCase()
    const name = account.name || email

    console.log('[auth] MS token acquired for:', email)

    if (!email) return res.redirect(`${FRONTEND_URL}/login?error=no_email`)

    const dbUser = await findOrCreateUser(email, name, 'microsoft', account.homeAccountId)
    if (!dbUser) return res.redirect(`${FRONTEND_URL}/login?error=not_authorized`)
    if (!dbUser.is_active) return res.redirect(`${FRONTEND_URL}/login?error=account_disabled`)

    issueTokenAndRedirect(res, dbUser)
  } catch (err) {
    console.error('[auth] MS token exchange error:', err.message, err.errorCode, err.subError)
    res.redirect(`${FRONTEND_URL}/login?error=token_failed`)
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE WORKSPACE SSO
// ═══════════════════════════════════════════════════════════════════════════════

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const GOOGLE_REDIRECT_URI = `${FRONTEND_URL}/api/auth/google/callback`

router.get('/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.redirect(`${FRONTEND_URL}/login?error=google_not_configured`)
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
  })

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
})

router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query

  if (error || !code) {
    console.error('[auth] Google callback error:', error)
    return res.redirect(`${FRONTEND_URL}/login?error=${error || 'no_code'}`)
  }

  try {
    // Exchange code for tokens
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    })

    // Get user info
    const userRes = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
    })

    const { email, name, id: googleId } = userRes.data
    console.log('[auth] Google login for:', email)

    if (!email) return res.redirect(`${FRONTEND_URL}/login?error=no_email`)

    const dbUser = await findOrCreateUser(email.toLowerCase(), name || email, 'google', googleId)
    if (!dbUser) return res.redirect(`${FRONTEND_URL}/login?error=not_authorized`)
    if (!dbUser.is_active) return res.redirect(`${FRONTEND_URL}/login?error=account_disabled`)

    issueTokenAndRedirect(res, dbUser)
  } catch (err) {
    console.error('[auth] Google token exchange error:', err.response?.data || err.message)
    res.redirect(`${FRONTEND_URL}/login?error=token_failed`)
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// LOCAL EMAIL/PASSWORD LOGIN
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/login', async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  try {
    const user = await db.query(
      `SELECT * FROM users WHERE email = $1 AND is_active = true LIMIT 1`,
      [email.toLowerCase()]
    )

    if (!user.rows.length) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const dbUser = user.rows[0]

    if (!dbUser.password_hash) {
      return res.status(401).json({ error: 'This account uses SSO login. Use Microsoft or Google to sign in.' })
    }

    const valid = await bcrypt.compare(password, dbUser.password_hash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

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

    db.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [dbUser.id]).catch(() => {})

    res.cookie('align_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    })

    res.json({ data: { id: dbUser.id, email: dbUser.email, display_name: dbUser.display_name, role: dbUser.role } })
  } catch (err) {
    console.error('[auth] local login error:', err.message)
    res.status(500).json({ error: 'Login failed' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/me', async (req, res) => {
  const token = req.cookies?.align_token
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    const user = await db.query(
      `SELECT id, email, display_name, role, tenant_id, avatar_url, last_login_at
       FROM users WHERE id = $1 AND is_active = true`,
      [decoded.sub]
    )

    if (!user.rows.length) return res.status(401).json({ error: 'User not found' })
    res.json({ data: user.rows[0] })
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' })
  }
})

router.post('/logout', (req, res) => {
  res.clearCookie('align_token', { path: '/' })
  res.json({ status: 'ok' })
})

// GET /api/auth/providers — which auth methods are configured
router.get('/providers', (req, res) => {
  res.json({
    microsoft: !!msalClient,
    google: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
    local: true,
  })
})

module.exports = router
