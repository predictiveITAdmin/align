require('dotenv').config({ override: true })
const express = require('express')
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
app.use('/api/sync', syncRouter)
app.use('/api/standards', standardsRouter)
app.use('/api/assessments', assessmentsRouter)
app.use('/api/recommendations', recommendationsRouter)
app.use('/api/assets', assetsRouter)
app.use('/api/eos', eosRouter)
app.use('/api/csat', csatRouter)
app.use('/api/integrations', integrationsRouter)

// ─── 404 fallback ────────────────────────────────────────────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3002
server.listen(PORT, () => {
  console.log(`[align] Server running on port ${PORT}`)
  console.log(`[align] Environment: ${process.env.NODE_ENV || 'development'}`)
})
