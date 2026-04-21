/**
 * Symmetric encryption for supplier credentials stored in the database.
 *
 * Uses AES-256-GCM with a master key from ALIGN_ENCRYPTION_KEY env var.
 * If ALIGN_ENCRYPTION_KEY is not set, falls back to a derived key from
 * JWT_SECRET for dev convenience — but production MUST set a dedicated
 * 32-byte (64 hex chars) key.
 *
 * Ciphertext format: base64(iv + authTag + encrypted)
 */
const crypto = require('crypto')

const ALGO = 'aes-256-gcm'

function getKey() {
  const raw = process.env.ALIGN_ENCRYPTION_KEY || process.env.JWT_SECRET
  if (!raw) throw new Error('ALIGN_ENCRYPTION_KEY or JWT_SECRET must be set for supplier credential encryption')
  // Derive a deterministic 32-byte key from whatever we have
  return crypto.createHash('sha256').update(String(raw)).digest()
}

function encrypt(plaintext) {
  if (plaintext == null) return null
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

function decrypt(ciphertext) {
  if (!ciphertext) return null
  try {
    const key = getKey()
    const buf = Buffer.from(ciphertext, 'base64')
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const enc = buf.subarray(28)
    const decipher = crypto.createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
  } catch (err) {
    console.error('[supplierCrypto] decrypt failed:', err.message)
    return null
  }
}

/**
 * Encrypt each string value in a credentials object; non-string values pass through.
 */
function encryptCredentials(credObj) {
  if (!credObj || typeof credObj !== 'object') return credObj
  const out = {}
  for (const [k, v] of Object.entries(credObj)) {
    out[k] = typeof v === 'string' ? encrypt(v) : v
  }
  return out
}

function decryptCredentials(credObj) {
  if (!credObj || typeof credObj !== 'object') return credObj
  const out = {}
  for (const [k, v] of Object.entries(credObj)) {
    out[k] = typeof v === 'string' ? decrypt(v) : v
  }
  return out
}

/**
 * Mask a secret for display: show only the last 4 chars.
 */
function maskSecret(s) {
  if (!s || typeof s !== 'string') return null
  if (s.length <= 4) return '••••'
  return '••••' + s.slice(-4)
}

function maskCredentials(credObj, fieldDefs) {
  // Given the decrypted credentials + the adapter's field defs, mask any
  // field marked { secret: true }.
  if (!credObj || !fieldDefs) return credObj
  const secretFields = new Set(fieldDefs.filter(f => f.secret).map(f => f.name))
  const out = {}
  for (const [k, v] of Object.entries(credObj)) {
    out[k] = secretFields.has(k) ? maskSecret(v) : v
  }
  return out
}

module.exports = { encrypt, decrypt, encryptCredentials, decryptCredentials, maskSecret, maskCredentials }
