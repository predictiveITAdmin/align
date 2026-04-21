/**
 * Email service — sends transactional emails via SMTP (nodemailer).
 *
 * Configure via .env:
 *   SMTP_HOST    smtp.resend.com
 *   SMTP_PORT    465
 *   SMTP_SECURE  true
 *   SMTP_USER    resend
 *   SMTP_PASS    re_...
 *   EMAIL_FROM   predictiveIT Align <noreply@noreply.predictiveit.ai>
 */
const nodemailer = require('nodemailer')

let _transporter = null

const BASE = (process.env.FRONTEND_URL || 'https://align.predictiveit.ai').replace(/\/$/, '')

function getTransporter() {
  if (_transporter) return _transporter

  const host   = process.env.SMTP_HOST
  const port   = parseInt(process.env.SMTP_PORT || '465')
  const secure = process.env.SMTP_SECURE === 'true'
  const user   = process.env.SMTP_USER
  const pass   = process.env.SMTP_PASS

  if (!host || !pass) {
    console.warn('[email] SMTP not configured — emails will be logged to console only')
    return null
  }

  _transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } })
  return _transporter
}

function getFrom() {
  return process.env.EMAIL_FROM || 'predictiveIT Align <noreply@noreply.predictiveit.ai>'
}

async function send({ to, subject, html, text }) {
  const transporter = getTransporter()
  if (!transporter) {
    console.log(`[email] WOULD SEND to=${to} subject="${subject}"`)
    console.log(`[email] text: ${text}`)
    return
  }
  const info = await transporter.sendMail({ from: getFrom(), to, subject, html, text })
  console.log(`[email] sent to=${to} subject="${subject}" messageId=${info.messageId}`)
}

const ROLE_LABELS = {
  tenant_admin:    'Administrator',
  vcio:            'Virtual CIO',
  tam:             'TAM',
  client_readonly: 'Client (View Only)',
}

async function sendInvite({ to, inviterName, role, token }) {
  const link      = `${BASE}/invite/${token}`
  const roleLabel = ROLE_LABELS[role] || role

  await send({
    to,
    subject: `You've been invited to predictiveIT Align`,
    text: `Hi there,\n\n${inviterName} has invited you to predictiveIT Align as ${roleLabel}.\n\nClick the link below to set your password and get started:\n${link}\n\nThis link expires in 7 days.\n\nIf you didn't expect this, you can ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="color:#1a1a2e;margin-bottom:8px">You're invited to predictiveIT Align</h2>
        <p style="color:#444;margin-top:0">${inviterName} has invited you to join as <strong>${roleLabel}</strong>.</p>
        <p style="margin:24px 0">
          <a href="${link}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
            Accept Invitation
          </a>
        </p>
        <p style="color:#888;font-size:13px">Or copy this link: <a href="${link}" style="color:#2563eb">${link}</a></p>
        <p style="color:#aaa;font-size:12px;margin-top:32px">This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.</p>
      </div>
    `,
  })
}

module.exports = { send, sendInvite }
