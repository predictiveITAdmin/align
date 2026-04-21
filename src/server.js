require('dotenv').config({ override: true })
const express = require('express')
const { startScheduler } = require('./services/scheduler')
const { createServer } = require('http')
const cookieParser = require('cookie-parser')
const helmet = require('helmet')
const cors = require('cors')

const { tenantMiddleware } = require('./middleware/tenant')
const { optionalAuth } = require('./middleware/auth')

const healthRouter         = require('./routes/health')
const authRouter           = require('./routes/auth')
const clientsRouter        = require('./routes/clients')
const syncRouter           = require('./routes/sync')
const standardsRouter      = require('./routes/standards')
const assessmentsRouter    = require('./routes/assessments')
const recommendationsRouter = require('./routes/recommendations')
const assetsRouter         = require('./routes/assets')
const eosRouter            = require('./routes/eos')
const csatRouter           = require('./routes/csat')
const integrationsRouter   = require('./routes/integrations')
const feedbackRouter       = require('./routes/feedback')
const contactsRouter       = require('./routes/contacts')
const saasLicensesRouter   = require('./routes/saas-licenses')
const softwareRouter       = require('./routes/software')
const settingsRouter       = require('./routes/settings')
const warrantyLookupRouter = require('./routes/warrantyLookup')
const usersRouter          = require('./routes/users')
const templatesRouter      = require('./routes/templates')
const initiativesRouter    = require('./routes/initiatives')
const budgetRouter         = require('./routes/budget')
const goalsRouter          = require('./routes/goals')
const actionItemsRouter    = require('./routes/actionItems')
const clientStandardsRouter = require('./routes/clientStandards')

const app = express()
const server = createServer(app)

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors({
  origin: (origin, cb) => cb(null, true), // Allow any origin (tenant domains vary)
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))
app.use(cookieParser())

// ─── Request logging ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const ms = Date.now() - start
    if (!req.path.startsWith('/api/health')) {
      console.log(`[${req.method}] ${req.path} ${res.statusCode} ${ms}ms`)
    }
  })
  next()
})

// ─── Tenant + Auth (runs on all /api routes except health) ───────────────────
app.use('/api', tenantMiddleware)
app.use('/api', optionalAuth)

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/health', healthRouter)
app.use('/api/auth', authRouter)
app.use('/api/clients', clientsRouter)
app.use('/api/clients/:clientId/standards', clientStandardsRouter)
app.use('/api/sync', syncRouter)
app.use('/api/standards', standardsRouter)
app.use('/api/assessments', assessmentsRouter)
app.use('/api/recommendations', recommendationsRouter)
app.use('/api/assets', assetsRouter)
app.use('/api/eos', eosRouter)
app.use('/api/csat', csatRouter)
app.use('/api/integrations', integrationsRouter)
app.use('/api/feedback', feedbackRouter)
app.use('/api/contacts', contactsRouter)
app.use('/api/saas-licenses', saasLicensesRouter)
app.use('/api/software', softwareRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/warranty-lookup', warrantyLookupRouter)
app.use('/api/users', usersRouter)
app.use('/api/templates', templatesRouter)
app.use('/api/initiatives', initiativesRouter)
app.use('/api/budget',     budgetRouter)
app.use('/api/goals',        goalsRouter)
app.use('/api/action-items', actionItemsRouter)

// ─── Public config (non-secret integration URLs for frontend deep links) ─────
app.get('/api/config', (req, res) => {
  res.json({
    autotask_web_url: process.env.AUTOTASK_WEB_URL || 'https://ww1.autotask.net',
  })
})

// ─── 404 fallback ────────────────────────────────────────────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// ─── Startup migration ────────────────────────────────────────────────────────
const db = require('./db')
async function runStartupMigrations() {
  try {
    await db.query(`
      ALTER TABLE assets
        ADD COLUMN IF NOT EXISTS hostname           TEXT,
        ADD COLUMN IF NOT EXISTS last_user          TEXT,
        ADD COLUMN IF NOT EXISTS ram_bytes          BIGINT,
        ADD COLUMN IF NOT EXISTS storage_bytes      BIGINT,
        ADD COLUMN IF NOT EXISTS storage_free_bytes BIGINT,
        ADD COLUMN IF NOT EXISTS cpu_description    TEXT,
        ADD COLUMN IF NOT EXISTS cpu_cores          SMALLINT,
        ADD COLUMN IF NOT EXISTS motherboard        TEXT,
        ADD COLUMN IF NOT EXISTS display_adapters   TEXT,
        ADD COLUMN IF NOT EXISTS mac_address        TEXT,
        ADD COLUMN IF NOT EXISTS warranty_source    TEXT,
        ADD COLUMN IF NOT EXISTS last_seen_source   TEXT
    `)

    await db.query(`
      CREATE TABLE IF NOT EXISTS tenant_settings (
        tenant_id                   UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        rmm_inactive_threshold_days INTEGER NOT NULL DEFAULT 60,
        rmm_inactive_action         TEXT    NOT NULL DEFAULT 'mark_inactive',
        updated_at                  TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await db.query(`ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS warranty_lookup_config JSONB DEFAULT '{}'`)
    await db.query(`ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS asset_lifecycle_config JSONB DEFAULT '{}'`)
    await db.query(`
      CREATE TABLE IF NOT EXISTS warranty_lookup_log (
        id           BIGSERIAL PRIMARY KEY,
        tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        ran_at       TIMESTAMPTZ DEFAULT NOW(),
        manufacturer TEXT,
        total        INTEGER DEFAULT 0,
        updated      INTEGER DEFAULT 0,
        skipped      INTEGER DEFAULT 0,
        errors       INTEGER DEFAULT 0,
        status       TEXT DEFAULT 'completed'
      )
    `)
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_invites (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        email        TEXT NOT NULL,
        role         TEXT NOT NULL DEFAULT 'tam',
        invite_token TEXT UNIQUE NOT NULL,
        expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
        accepted_at  TIMESTAMPTZ,
        created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await db.query(`ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'recommendation'`)
    await db.query(`ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS at_ticket_number TEXT`)
    console.log('[startup] recommendations.kind column ok')

    // Goals
    await db.query(`
      CREATE TABLE IF NOT EXISTS goals (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        title         TEXT NOT NULL,
        description   TEXT,
        status        TEXT NOT NULL DEFAULT 'on_track',
        target_year   INTEGER,
        target_period TEXT,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await db.query(`
      CREATE TABLE IF NOT EXISTS goal_initiatives (
        goal_id           UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
        recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
        PRIMARY KEY (goal_id, recommendation_id)
      )
    `)
    await db.query(`ALTER TABLE recommendation_action_items ADD COLUMN IF NOT EXISTS due_date DATE`)
    await db.query(`ALTER TABLE recommendation_action_items ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL`)
    await db.query(`ALTER TABLE goals ADD COLUMN IF NOT EXISTS target_quarter INTEGER`)
    await db.query(`ALTER TABLE recommendation_action_items ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open'`)
    await db.query(`ALTER TABLE recommendation_action_items ADD COLUMN IF NOT EXISTS notes TEXT`)
    await db.query(`ALTER TABLE recommendation_action_items ADD COLUMN IF NOT EXISTS at_ticket_number TEXT`)
    await db.query(`ALTER TABLE client_action_items ADD COLUMN IF NOT EXISTS at_ticket_number TEXT`)
    await db.query(`ALTER TABLE goal_action_items ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL`)
    await db.query(`
      CREATE TABLE IF NOT EXISTS client_action_items (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        text              TEXT NOT NULL,
        status            TEXT NOT NULL DEFAULT 'open',
        completed         BOOLEAN NOT NULL DEFAULT FALSE,
        due_date          DATE,
        assigned_to       UUID REFERENCES users(id) ON DELETE SET NULL,
        notes             TEXT,
        recommendation_id UUID REFERENCES recommendations(id) ON DELETE SET NULL,
        goal_id           UUID REFERENCES goals(id) ON DELETE SET NULL,
        created_at        TIMESTAMPTZ DEFAULT NOW(),
        updated_at        TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await db.query(`
      CREATE TABLE IF NOT EXISTS goal_action_items (
        id          SERIAL PRIMARY KEY,
        goal_id     UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
        text        TEXT NOT NULL,
        completed   BOOLEAN NOT NULL DEFAULT FALSE,
        due_date    DATE,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    console.log('[startup] goals tables ok')

    // Convert recommendations.type from enum to TEXT so we can store any category value
    await db.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='recommendations' AND column_name='type'
            AND data_type='USER-DEFINED'
        ) THEN
          ALTER TABLE recommendations ALTER COLUMN type DROP DEFAULT;
          ALTER TABLE recommendations ALTER COLUMN type TYPE TEXT USING type::text;
          ALTER TABLE recommendations ALTER COLUMN type SET DEFAULT 'improvement';
        END IF;
      END $$
    `)
    console.log('[startup] recommendations.type column ok (TEXT)')

    await db.query(`
      CREATE TABLE IF NOT EXISTS recommendation_action_items (
        id                SERIAL PRIMARY KEY,
        recommendation_id UUID NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
        text              TEXT NOT NULL,
        completed         BOOLEAN NOT NULL DEFAULT FALSE,
        sort_order        INTEGER DEFAULT 0,
        created_at        TIMESTAMPTZ DEFAULT NOW(),
        updated_at        TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    console.log('[startup] recommendation_action_items table ok')

    const h = await db.query(`UPDATE assets SET hostname = COALESCE(datto_rmm_data->>'hostname', autotask_data->>'rmmDeviceAuditHostname') WHERE hostname IS NULL`)
    const u = await db.query(`UPDATE assets SET last_user = CASE WHEN datto_rmm_data->>'lastLoggedInUser' LIKE '%\\%' THEN SPLIT_PART(datto_rmm_data->>'lastLoggedInUser', '\\', 2) ELSE datto_rmm_data->>'lastLoggedInUser' END WHERE last_user IS NULL AND datto_rmm_data->>'lastLoggedInUser' IS NOT NULL AND datto_rmm_data->>'lastLoggedInUser' != ''`)
    const r = await db.query(`UPDATE assets SET ram_bytes = NULLIF(autotask_data->>'rmmDeviceAuditMemoryBytes','')::BIGINT WHERE ram_bytes IS NULL AND autotask_data->>'rmmDeviceAuditMemoryBytes' NOT IN ('0','') AND autotask_data->>'rmmDeviceAuditMemoryBytes' IS NOT NULL`)
    const s = await db.query(`UPDATE assets SET storage_bytes = NULLIF(autotask_data->>'rmmDeviceAuditStorageBytes','')::BIGINT WHERE storage_bytes IS NULL AND autotask_data->>'rmmDeviceAuditStorageBytes' NOT IN ('0','') AND autotask_data->>'rmmDeviceAuditStorageBytes' IS NOT NULL`)
    const i = await db.query(`UPDATE assets SET is_active = false WHERE datto_rmm_device_id IS NOT NULL AND last_seen_at IS NOT NULL AND last_seen_at < NOW() - INTERVAL '60 days' AND (is_online = false OR is_online IS NULL)`)
    console.log(`[startup] columns ok | hostname:${h.rowCount} last_user:${u.rowCount} ram:${r.rowCount} storage:${s.rowCount} inactive:${i.rowCount}`)
  } catch (err) {
    console.error('[startup] migration error:', err.message)
  }
}

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3002
server.listen(PORT, async () => {
  console.log(`[align] Server running on port ${PORT}`)
  console.log(`[align] Environment: ${process.env.NODE_ENV || 'development'}`)
  await runStartupMigrations()
  startScheduler()
})
