const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')

const app = express()

// Ensure MongoDB is connected before each request (serverless-safe)
if ((process.env.DB_TYPE || 'sqlite') === 'mongodb') {
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

app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
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

app.use('/webhook', webhookLimiter, webhookRouter)
app.use('/chat-callback', chatCallbackRouter)
app.use('/auth', authRouter)
app.use('/api/departments', departmentsRouter)

app.get('/', (req, res) => res.json({ status: 'ok' }))

app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Internal server error' })
})

module.exports = app
