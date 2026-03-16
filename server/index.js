// Local development server — not used by Vercel (Vercel uses api/index.js instead)
import 'dotenv/config'
import { initDb } from './db.js'
import app from './app.js'

const PORT = process.env.PORT || 3001

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Trading Journal API running on http://localhost:${PORT}`)
    })
  })
  .catch(err => {
    console.error('Failed to initialize database:', err)
    process.exit(1)
  })
