import express from 'express'
import cors from 'cors'

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

const app = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))

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

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

export default app
