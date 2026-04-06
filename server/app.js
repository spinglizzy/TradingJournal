import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'

import { requireAuth }    from './middleware/auth.js'
import tradesRouter       from './routes/trades.js'
import statsRouter        from './routes/stats.js'
import analyticsRouter    from './routes/analytics.js'
import journalRouter      from './routes/journal.js'
import strategiesRouter   from './routes/strategies.js'
import tagsRouter         from './routes/tags.js'
import uploadRouter       from './routes/upload.js'
import psychologyRouter   from './routes/psychology.js'
import playbookRouter     from './routes/playbook.js'
import goalsRouter        from './routes/goals.js'
import accountsRouter     from './routes/accounts.js'
import importExportRouter from './routes/importexport.js'
import alpacaRouter       from './routes/alpaca.js'

const app = express()

// Restrict CORS to the app's own origin; falls back to localhost for dev
const allowedOrigins = (process.env.ALLOWED_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server requests (no origin) and same-origin requests
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    callback(new Error('Not allowed by CORS'))
  },
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))

// Rate limiting — applied before auth so unauthenticated abuse is still capped
app.use('/api/import', rateLimit({ windowMs: 60_000, max: 10 }))
app.use('/api/upload', rateLimit({ windowMs: 60_000, max: 20 }))
app.use('/api',        rateLimit({ windowMs: 60_000, max: 300 }))

app.use(requireAuth)

app.use('/api/trades',     tradesRouter)
app.use('/api/stats',      statsRouter)
app.use('/api/analytics',  analyticsRouter)
app.use('/api/journal',    journalRouter)
app.use('/api/strategies', strategiesRouter)
app.use('/api/tags',       tagsRouter)
app.use('/api/upload',     uploadRouter)
app.use('/api/psychology', psychologyRouter)
app.use('/api/playbook',   playbookRouter)
app.use('/api/goals',      goalsRouter)
app.use('/api/accounts',   accountsRouter)
app.use('/api/import',     importExportRouter)
app.use('/api/export',     importExportRouter)
app.use('/api/alpaca',     alpacaRouter)

app.use((err, _req, res, _next) => {
  console.error(err)
  // Never leak internal error details to clients in production
  const isDev = process.env.NODE_ENV !== 'production'
  res.status(500).json({ error: isDev ? (err.message || 'Internal server error') : 'Internal server error' })
})

export default app
