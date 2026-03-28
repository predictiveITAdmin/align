require('dotenv').config({ override: true })
const express = require('express')
const { createServer } = require('http')
const cookieParser = require('cookie-parser')
const helmet = require('helmet')
const cors = require('cors')

const healthRouter = require('./routes/health')
const clientsRouter = require('./routes/clients')
const syncRouter = require('./routes/sync')

const app = express()
const server = createServer(app)

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://align.predictiveit.ai',
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

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/health', healthRouter)
app.use('/api/clients', clientsRouter)
app.use('/api/sync', syncRouter)

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
