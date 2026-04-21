/**
 * One-time Partner Center Secure Application Model setup.
 * Run this script once to get a refresh token, then store it in .env
 *
 * Usage: node scripts/pc-auth-setup.js
 *
 * It will print a URL — open it in a browser, sign in as an admin,
 * then paste the redirect URL back into this terminal.
 */

require('dotenv').config()
const axios = require('axios')
const qs = require('querystring')
const readline = require('readline')

const CLIENT_ID     = process.env.MS_ALIGN_CLIENT_ID
const CLIENT_SECRET = process.env.MS_ALIGN_CLIENT_SECRET
const TENANT_ID     = process.env.MS_ALIGN_TENANT_ID
const REDIRECT_URI  = 'https://localhost'

const PC_SCOPE = [
  'https://api.partnercenter.microsoft.com/user_impersonation',
  'offline_access',
  'openid',
].join(' ')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
function ask(q) { return new Promise(r => rl.question(q, r)) }

async function main() {
  // Step 1: Build the auth URL
  const authUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?` + qs.stringify({
    client_id:     CLIENT_ID,
    response_type: 'code',
    redirect_uri:  REDIRECT_URI,
    scope:         PC_SCOPE,
    prompt:        'consent',
  })

  console.log('\n=== Partner Center Secure App Model Setup ===\n')
  console.log('1. Open this URL in a browser and sign in as your Partner Center admin:')
  console.log('\n' + authUrl + '\n')
  console.log('2. After signing in, the browser will redirect to https://localhost?code=...')
  console.log('   (The page will show an error — that\'s OK, just copy the full URL from the address bar)\n')

  const redirected = await ask('3. Paste the full redirect URL here: ')
  rl.close()

  // Extract code from URL
  const codeMatch = redirected.match(/[?&]code=([^&]+)/)
  if (!codeMatch) {
    console.error('Could not find "code" in the URL. Make sure you pasted the full redirect URL.')
    process.exit(1)
  }
  const code = decodeURIComponent(codeMatch[1])

  // Step 2: Exchange code for tokens
  const tokenRes = await axios.post(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    qs.stringify({
      grant_type:    'authorization_code',
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri:  REDIRECT_URI,
      scope:         PC_SCOPE,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )

  const { access_token, refresh_token } = tokenRes.data
  console.log('\n✓ Tokens obtained successfully!\n')

  // Step 3: Test the access token against Partner Center
  const { v4: uuidv4 } = require('uuid')
  const testRes = await axios.get('https://api.partnercenter.microsoft.com/v1/customers?size=1', {
    headers: {
      Authorization: `Bearer ${access_token}`,
      Accept: 'application/json',
      'MS-RequestId': uuidv4(),
      'MS-CorrelationId': uuidv4(),
    },
    validateStatus: null,
  })

  if (testRes.status === 200) {
    const count = testRes.data.totalCount || testRes.data.items?.length || 0
    console.log(`✓ Partner Center API works! Found ${count} customer(s).\n`)
  } else {
    console.log(`⚠ Partner Center test returned ${testRes.status}:`, JSON.stringify(testRes.data))
    console.log('Save the refresh token anyway and investigate further.\n')
  }

  console.log('=== Add this to your /opt/align/.env file ===\n')
  console.log(`MS_ALIGN_PC_REFRESH_TOKEN=${refresh_token}\n`)
}

main().catch(e => {
  console.error('Error:', e.message, e.response?.data || '')
  process.exit(1)
})
