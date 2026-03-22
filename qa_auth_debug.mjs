import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { requireAuth } from './server/middleware/auth.js'

const app = express()
app.use(cors())
app.use(express.json())
app.use(requireAuth)

app.get('/api/test', (req, res) => {
  res.json({ userId: req.userId, msg: 'reached route' })
})

const server = app.listen(13001, async () => {
  console.log('Auth debug server on :13001')

  // Test 1: No auth header
  const r1 = await fetch('http://localhost:13001/api/test')
  const b1 = await r1.json()
  console.log('TEST 1 (no auth):', r1.status, JSON.stringify(b1))

  // Test 2: Bad token
  const r2 = await fetch('http://localhost:13001/api/test', {
    headers: { 'Authorization': 'Bearer badtoken' }
  })
  const b2 = await r2.json()
  console.log('TEST 2 (bad token):', r2.status, JSON.stringify(b2))

  server.close()
})
