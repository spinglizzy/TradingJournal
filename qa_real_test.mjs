import 'dotenv/config'
import app from './server/app.js'

const TOKEN = process.env.QA_TOKEN
const h = { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }

const results = { pass: [], fail: [] }

async function t(label, fn, expectStatus = 200) {
  const r = await fn()
  const status = r.status
  let body
  try { body = await r.json() } catch { body = null }
  const ok = status === expectStatus
  if (ok) {
    results.pass.push(label)
    console.log('PASS [' + status + '] ' + label)
  } else {
    results.fail.push({ label, expected: expectStatus, got: status, body: JSON.stringify(body).substring(0, 300) })
    console.log('FAIL [' + status + '] ' + label)
    console.log('  Body:', JSON.stringify(body).substring(0, 250))
  }
  return { ok, status, body }
}

const server = app.listen(13002, async () => {
  const BASE = 'http://localhost:13002/api'

  console.log('\n=== PHASE 1: AUTH (on correct fresh server) ===')
  await t('No auth header -> 401', () => fetch(BASE + '/trades'), 401)
  await t('Bad token -> 401', () => fetch(BASE + '/trades', { headers: { 'Authorization': 'Bearer bad', 'Content-Type': 'application/json' } }), 401)
  await t('Valid token -> 200', () => fetch(BASE + '/trades', { headers: h }), 200)

  console.log('\n=== PHASE 2: TRADE direct_pnl mode ===')
  const d1 = await t('POST direct_pnl -> 201', () => fetch(BASE + '/trades', {
    method: 'POST', headers: h,
    body: JSON.stringify({
      date: '2026-03-15', ticker: 'AAPL', direction: 'long',
      entry_price: 250, position_size: 5, fees: 0,
      entry_mode: 'direct_pnl', direct_pnl: 150, tags: []
    })
  }), 201)
  console.log('  direct_pnl status:', d1.body?.status, '| pnl:', d1.body?.pnl, '| Expected: status=closed pnl=150')
  if (d1.body?.status !== 'closed' || d1.body?.pnl !== 150) {
    console.log('  BUG: direct_pnl mode not working correctly!')
  }

  console.log('\n=== PHASE 3: ACCOUNTS PUT bug ===')
  const acct = await t('POST account -> 201', () => fetch(BASE + '/accounts', {
    method: 'POST', headers: h,
    body: JSON.stringify({ name: 'Bug Test Account', broker_name: 'Test', currency: 'USD', starting_balance: 5000 })
  }), 201)
  const acctId = acct.body?.id

  if (acctId) {
    const upd = await t('PUT account (partial fields) -> should work', () => fetch(BASE + '/accounts/' + acctId, {
      method: 'PUT', headers: h,
      body: JSON.stringify({ name: 'Bug Test Updated', broker_name: 'Updated Broker' })
    }))
    if (!upd.ok) console.log('  BUG: Account update fails with partial body:', upd.body)
    else console.log('  Account update success, name:', upd.body?.name)
  }

  console.log('\n=== PHASE 4: account_transactions user_id missing ===')
  if (acctId) {
    const tx = await t('POST transaction -> 201', () => fetch(BASE + '/accounts/' + acctId + '/transactions', {
      method: 'POST', headers: h,
      body: JSON.stringify({ type: 'deposit', amount: 1000, date: '2026-03-01', notes: 'test' })
    }), 201)
    console.log('  Transaction user_id:', tx.body?.user_id, '| Expected: null (missing in INSERT) - this is a bug but non-breaking for pg')
  }

  console.log('\n=== PHASE 5: PnL calculation accuracy ===')
  const longTrade = await t('Long trade PnL', () => fetch(BASE + '/trades', {
    method: 'POST', headers: h,
    body: JSON.stringify({
      date: '2026-03-15', ticker: 'CALC1', direction: 'long',
      entry_price: 100, exit_price: 110, stop_loss: 95, position_size: 10, fees: 5, tags: []
    })
  }), 201)
  const expectedLongPnl = (110 - 100) * 10 - 5  // 95
  const expectedLongR = 95 / (5 * 10)  // 1.9
  console.log('  Long PnL:', longTrade.body?.pnl, '| Expected:', expectedLongPnl, '| Match:', longTrade.body?.pnl === expectedLongPnl)
  console.log('  Long R:', longTrade.body?.r_multiple, '| Expected:', expectedLongR, '| Match:', Math.abs(longTrade.body?.r_multiple - expectedLongR) < 0.001)

  const shortTrade = await t('Short trade PnL', () => fetch(BASE + '/trades', {
    method: 'POST', headers: h,
    body: JSON.stringify({
      date: '2026-03-15', ticker: 'CALC2', direction: 'short',
      entry_price: 100, exit_price: 90, stop_loss: 105, position_size: 10, fees: 5, tags: []
    })
  }), 201)
  const expectedShortPnl = (100 - 90) * 10 - 5  // 95
  const expectedShortR = 95 / (5 * 10)  // 1.9
  console.log('  Short PnL:', shortTrade.body?.pnl, '| Expected:', expectedShortPnl, '| Match:', shortTrade.body?.pnl === expectedShortPnl)

  console.log('\n=== PHASE 6: Import/Export user_id ===')
  const exportResult = await t('GET /export/json', () => fetch(BASE + '/export/json', { headers: h }))
  if (exportResult.ok) {
    const data = exportResult.body
    console.log('  Export has', data.trades?.length, 'trades,', data.accounts?.length, 'accounts')
    console.log('  First trade user_id present:', !!data.trades?.[0]?.user_id)

    // Test restore with this data - check if user_id is set on inserted records
    // We won't actually restore here to avoid data issues
    console.log('  NOTE: JSON restore does NOT set user_id on accounts/strategies/tags/trades - bug identified')
  }

  console.log('\n=== SUMMARY ===')
  console.log('PASSED:', results.pass.length)
  console.log('FAILED:', results.fail.length)
  results.fail.forEach(f => console.log('  FAIL:', f.label, '| expected:', f.expected, 'got:', f.got))

  server.close()
  process.exit(0)
})
