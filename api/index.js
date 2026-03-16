// Vercel serverless entry point — Vercel calls this for every /api/* request
import 'dotenv/config'
import app from '../server/app.js'

export default app
