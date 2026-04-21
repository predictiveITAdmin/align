/**
 * User management routes.
 *
 * Handles listing users, inviting new users, updating roles/status,
 * and managing pending invitations for a tenant.
 */

const express = require('express')
const router = express.Router()
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const db = require('../db')
const { requireAuth, requireRole } = require('../middleware/auth')
const { sendInvite } = require('../services/emailService')

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://align.predictiveit.ai'

// ─── GET /api/users/team ─────────────────────────────────────────────────────
// Basic user list for any authenticated user (for dropdowns, assign-to, etc.)
router.get('/team', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, display_name, email FROM users WHERE tenant_id=$1 AND is_active=true ORDER BY display_name`,
      [req.user.tenant_id]
    )
    res.json({ data: result.rows })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch team' })
  }
})

// ─── GET /api/users ───────────────────────────────────────────────────────────
// Returns all active users + pending invites for the tenant.

router.get('/', requireAuth, requireRole('tenant_admin', 'global_admin'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id

    const usersResult = await db.query(
      `SELECT id, email, display_name, role, is_active, last_login_at, auth_provider, created_at
       FROM users
       WHERE tenant_id = $1
       ORDER BY created_at ASC`,
      [tenantId]
    )

    const invitesResult = await db.query(
      `SELECT ui.id, ui.email, ui.role, ui.expires_at, ui.created_at, ui.accepted_at,
              u.display_name AS invited_by_name
       FROM user_invites ui
       LEFT JOIN users u ON u.id = ui.created_by
       WHERE ui.tenant_id = $1
         AND ui.accepted_at IS NULL
         AND ui.expires_at > NOW()
       ORDER BY ui.created_at DESC`,
      [tenantId]
    )

    res.json({
      users: usersResult.rows,
      pending_invites: invitesResult.rows,
    })
  } catch (err) {
    console.error('[users] list error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/users/invite ───────────────────────────────────────────────────
// Creates a new invite token for the given email + role.
// If an existing pending invite exists for this email, it is replaced.

router.post('/invite', requireAuth, requireRole('tenant_admin', 'global_admin'), async (req, res) => {
  try {
    const { email, role } = req.body
    const tenantId = req.user.tenant_id

    if (!email || !role) {
      return res.status(400).json({ error: 'email and role are required' })
    }

    const validRoles = ['tenant_admin', 'vcio', 'tam', 'client_readonly']
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` })
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Check if user already exists and is active
    const existing = await db.query(
      `SELECT id, is_active FROM users WHERE tenant_id = $1 AND email = $2 LIMIT 1`,
      [tenantId, normalizedEmail]
    )
    if (existing.rows.length && existing.rows[0].is_active) {
      return res.status(409).json({ error: 'A user with this email already exists' })
    }

    // Delete any existing (expired or pending) invite for this email
    await db.query(
      `DELETE FROM user_invites WHERE tenant_id = $1 AND email = $2`,
      [tenantId, normalizedEmail]
    )

    // Generate secure random token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    const invite = await db.query(
      `INSERT INTO user_invites (tenant_id, email, role, invite_token, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, role, invite_token, expires_at, created_at`,
      [tenantId, normalizedEmail, role, token, expiresAt, req.user.sub]
    )

    const inviteRow = invite.rows[0]
    const inviteUrl = `${FRONTEND_URL}/invite/${inviteRow.invite_token}`

    console.log(`[users] Invite created: ${normalizedEmail} (${role}) by ${req.user.email}`)

    // Send invite email — non-blocking so a mail failure doesn't block the response
    sendInvite({
      to:          normalizedEmail,
      inviterName: req.user.display_name || req.user.email,
      role,
      token:       inviteRow.invite_token,
    }).catch(err => console.error('[users] invite email failed:', err.message))

    res.json({
      invite: {
        id: inviteRow.id,
        email: inviteRow.email,
        role: inviteRow.role,
        expires_at: inviteRow.expires_at,
        created_at: inviteRow.created_at,
      },
      invite_url: inviteUrl,
    })
  } catch (err) {
    console.error('[users] invite error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── DELETE /api/users/invite/:id ────────────────────────────────────────────
// Cancels a pending invite.

router.delete('/invite/:id', requireAuth, requireRole('tenant_admin', 'global_admin'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id
    const result = await db.query(
      `DELETE FROM user_invites WHERE id = $1 AND tenant_id = $2 AND accepted_at IS NULL`,
      [req.params.id, tenantId]
    )
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Invite not found or already accepted' })
    }
    res.json({ status: 'ok' })
  } catch (err) {
    console.error('[users] cancel invite error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── PATCH /api/users/:id ─────────────────────────────────────────────────────
// Updates a user's role or active status.

router.patch('/:id', requireAuth, requireRole('tenant_admin', 'global_admin'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id
    const { role, is_active } = req.body

    // Prevent self-demotion/deactivation
    if (req.params.id === req.user.sub) {
      return res.status(400).json({ error: 'You cannot modify your own account' })
    }

    const updates = []
    const values = []
    let idx = 1

    if (role !== undefined) {
      const validRoles = ['tenant_admin', 'vcio', 'tam', 'client_readonly']
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' })
      }
      updates.push(`role = $${idx++}`)
      values.push(role)
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${idx++}`)
      values.push(is_active)
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' })
    }

    updates.push(`updated_at = NOW()`)
    values.push(req.params.id, tenantId)

    const result = await db.query(
      `UPDATE users SET ${updates.join(', ')}
       WHERE id = $${idx++} AND tenant_id = $${idx++}
       RETURNING id, email, display_name, role, is_active`,
      values
    )

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json({ user: result.rows[0] })
  } catch (err) {
    console.error('[users] patch error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/users/invite/:token ─────────────────────────────────────────────
// Public — validates an invite token and returns the invite details.

router.get('/invite/:token', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ui.id, ui.email, ui.role, ui.expires_at,
              t.name AS tenant_name
       FROM user_invites ui
       JOIN tenants t ON t.id = ui.tenant_id
       WHERE ui.invite_token = $1
         AND ui.accepted_at IS NULL
         AND ui.expires_at > NOW()
       LIMIT 1`,
      [req.params.token]
    )

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Invite not found or expired' })
    }

    res.json({ invite: result.rows[0] })
  } catch (err) {
    console.error('[users] validate invite error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/users/invite/:token/accept ─────────────────────────────────────
// Public — accepts an invite: creates user account with name + password.

router.post('/invite/:token/accept', async (req, res) => {
  try {
    const { display_name, password } = req.body

    if (!display_name || !password) {
      return res.status(400).json({ error: 'Name and password are required' })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    // Fetch and lock the invite
    const inviteResult = await db.query(
      `SELECT * FROM user_invites
       WHERE invite_token = $1 AND accepted_at IS NULL AND expires_at > NOW()
       LIMIT 1`,
      [req.params.token]
    )

    if (!inviteResult.rows.length) {
      return res.status(404).json({ error: 'Invite not found or expired' })
    }

    const invite = inviteResult.rows[0]
    const passwordHash = await bcrypt.hash(password, 12)

    // Create or reactivate user
    await db.query(
      `INSERT INTO users (tenant_id, email, display_name, role, password_hash, auth_provider, is_active)
       VALUES ($1, $2, $3, $4, $5, 'local', true)
       ON CONFLICT (tenant_id, email) DO UPDATE SET
         display_name  = EXCLUDED.display_name,
         role          = EXCLUDED.role,
         password_hash = EXCLUDED.password_hash,
         is_active     = true,
         updated_at    = NOW()`,
      [invite.tenant_id, invite.email, display_name.trim(), invite.role, passwordHash]
    )

    // Mark invite as accepted
    await db.query(
      `UPDATE user_invites SET accepted_at = NOW() WHERE id = $1`,
      [invite.id]
    )

    console.log(`[users] Invite accepted: ${invite.email} (${invite.role})`)
    res.json({ status: 'ok', email: invite.email })
  } catch (err) {
    console.error('[users] accept invite error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
