const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const path = require('path')

const app = express()

function parseEnvList(value) {
  if (!value) return []
  return String(value)
    .split(/[,\s]+/g)
    .map(s => s.trim())
    .filter(Boolean)
}

// Vercel / reverse proxy 環境需要信任 X-Forwarded-For（rate-limit 才能正確識別 IP）
app.set('trust proxy', 1)

// Ensure MongoDB is connected before each request (serverless-safe)
if ((process.env.DB_TYPE || 'sqlite').trim() === 'mongodb') {
  const { connectMongo } = require('../db/mongo')
  app.use(async (req, res, next) => {
    try {
      await connectMongo()
      next()
    } catch (err) {
      console.error('MongoDB connection failed:', err.message)
      res.status(503).json({ error: 'Database unavailable' })
    }
  })
}

const authRouter = require('./routes/auth')
const departmentsRouter = require('./routes/departments')
const webhookRouter = require('./routes/webhook')
const chatCallbackRouter = require('./routes/chatCallback')

// Helmet CSP defaults are strict and will block cross-origin API calls (connect-src)
// when serving the built frontend from this server (e.g. local dev).
const isProd = (process.env.NODE_ENV || 'development').trim() === 'production'
const defaultCspDirectives = helmet.contentSecurityPolicy.getDefaultDirectives()
const connectSrc = new Set(defaultCspDirectives['connect-src'] || ["'self'"])
connectSrc.add("'self'")
for (const item of parseEnvList(process.env.CSP_CONNECT_SRC)) connectSrc.add(item)
if (!isProd) {
  // Dev convenience: allow calling other local/prod APIs + websocket connections (Vite, etc.)
  for (const item of ['http:', 'https:', 'ws:', 'wss:']) connectSrc.add(item)
}

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      ...defaultCspDirectives,
      'connect-src': Array.from(connectSrc)
    }
  }
}))
app.use(cors({
  origin: (process.env.FRONTEND_URL || 'http://localhost:5173').trim(),
  credentials: true
}))
// GitHub webhooks can be configured to send `application/x-www-form-urlencoded`.
// Capture raw bytes for signature verification, and parse urlencoded bodies.
app.use(express.urlencoded({
  extended: false,
  verify: (req, res, buf) => {
    req.rawBody = buf
  }
}))
app.use(express.json({
  verify: (req, res, buf) => {
    // Required for verifying GitHub webhook signatures (HMAC is over raw bytes)
    req.rawBody = buf
  }
}))

// Webhook 端點獨立 rate limit（每 IP 每分鐘最多 60 次）
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' }
})

// Chat callback 端點 rate limit（每 IP 每分鐘最多 100 次）
const chatCallbackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' }
})

app.use('/webhook', webhookLimiter, webhookRouter)
app.use('/chat-callback', chatCallbackLimiter, chatCallbackRouter)
app.use('/auth', authRouter)
app.use('/api/departments', departmentsRouter)

// Serve React frontend (built by Vite)
const distDir = path.join(__dirname, '../frontend/dist')
app.use(express.static(distDir))
// SPA fallback — return index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Internal server error' })
})

module.exports = app
