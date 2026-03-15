/**
 * Seed mock trading data into production for screenshot purposes.
 * Usage:
 *   node seed-mock-data.mjs          → add mock data
 *   node seed-mock-data.mjs --clean  → remove all seeded data
 */

import fs from 'fs'

const API = 'https://tradingjournal-production-cda5.up.railway.app/api'
const SEED_FILE = 'seed-ids.json'
const EMAIL = 'samspinelli18@gmail.com'
const PASSWORD = 'Richtoffen18'

const TICKERS = ['NQ', 'ES', 'CL', 'GC', 'TSLA', 'AAPL', 'NVDA', 'SPY', 'QQQ', 'MSFT']
const DIRECTIONS = ['long', 'short']
const SETUPS = ['Breakout', 'Pullback', 'Reversal', 'Momentum', 'VWAP Reclaim', 'Opening Range']
const SESSIONS = ['New York', 'London', 'Pre-Market']
const EMOTIONS = ['Calm', 'Confident', 'Focused', 'Anxious', 'Neutral']

function rand(min, max) { return Math.random() * (max - min) + min }
function randInt(min, max) { return Math.floor(rand(min, max + 1)) }
function pick(arr) { return arr[randInt(0, arr.length - 1)] }

function randomDate(daysBack) {
  const d = new Date()
  d.setDate(d.getDate() - randInt(0, daysBack))
  d.setHours(randInt(9, 16), randInt(0, 59))
  return d.toISOString().slice(0, 16)
}

function generateTrades(count = 60) {
  const trades = []
  for (let i = 0; i < count; i++) {
    const ticker = pick(TICKERS)
    const direction = pick(DIRECTIONS)
    const isWin = Math.random() < 0.62

    // Realistic price ranges per ticker
    const basePrice = {
      NQ: 19800, ES: 5200, CL: 78, GC: 2350,
      TSLA: 175, AAPL: 195, NVDA: 480, SPY: 520, QQQ: 430, MSFT: 415
    }[ticker]

    const entry = parseFloat((basePrice * (1 + rand(-0.005, 0.005))).toFixed(2))
    const rMultiple = isWin ? rand(0.5, 3.5) : rand(-2, -0.3)
    const stopDist = basePrice * rand(0.003, 0.008)
    const pnl = parseFloat((rMultiple * stopDist * randInt(1, 5)).toFixed(2))
    const exit = parseFloat((direction === 'LONG' ? entry + pnl / randInt(1, 5) : entry - pnl / randInt(1, 5)).toFixed(2))

    const entryDate = randomDate(90)
    const exitDate = new Date(new Date(entryDate).getTime() + randInt(5, 180) * 60000).toISOString().slice(0, 16)

    trades.push({
      ticker,
      direction,
      status: 'closed',
      entry_price: entry,
      exit_price: exit,
      position_size: randInt(1, 5),
      date: entryDate,
      pnl,
      setup: pick(SETUPS),
      emotions: pick(EMOTIONS),
      notes: isWin
        ? pick(['Clean entry, held for full target', 'Textbook setup, followed the plan', 'Patient entry, great R:R'])
        : pick(['Stopped out, spread too wide', 'Entered too early, shook out', 'Poor risk management on this one']),
      mistakes: isWin ? '' : pick(['Early entry', 'Too large size', 'Ignored stop loss', 'Chased price']),
      r_multiple: parseFloat(rMultiple.toFixed(2)),
    })
  }
  return trades
}

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const data = await res.json()
  if (!data.token) throw new Error(`Login failed: ${JSON.stringify(data)}`)
  console.log(`✓ Logged in as ${EMAIL}`)
  return data.token
}

async function seedData(token) {
  const trades = generateTrades(65)
  const ids = []

  for (const trade of trades) {
    const res = await fetch(`${API}/trades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(trade),
    })
    const data = await res.json()
    if (data.id) {
      ids.push(data.id)
      process.stdout.write('.')
    } else {
      console.warn('\nFailed to insert trade:', data)
    }
  }

  fs.writeFileSync(SEED_FILE, JSON.stringify(ids))
  console.log(`\n✓ Seeded ${ids.length} trades. IDs saved to ${SEED_FILE}`)
}

async function cleanData(token) {
  if (!fs.existsSync(SEED_FILE)) {
    console.log('No seed file found — nothing to clean.')
    return
  }
  const ids = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'))
  let removed = 0
  for (const id of ids) {
    const res = await fetch(`${API}/trades/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) { removed++; process.stdout.write('.') }
  }
  fs.unlinkSync(SEED_FILE)
  console.log(`\n✓ Removed ${removed} trades. Seed file deleted.`)
}

const clean = process.argv.includes('--clean')
const token = await login()
if (clean) {
  await cleanData(token)
} else {
  await seedData(token)
}
