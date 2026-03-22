import 'dotenv/config'

const TOKEN = process.env.QA_TOKEN
const BASE = 'http://localhost:3001/api'

const results = { pass: [], fail: [], error: [] }

async function t(label, fn, expectStatus = 200) {
  try {
    const r = await fn()
    const status = r.status
    let body
    try { body = await r.json() } catch { body = null }
    const ok = expectStatus ? status === expectStatus : (status >= 200 && status < 300)
    if (ok) {
      results.pass.push(label)
      process.stdout.write('PASS [' + status + '] ' + label + '\n')
    } else {
      results.fail.push({ label, expected: expectStatus, got: status, body: JSON.stringify(body).substring(0, 300) })
      process.stdout.write('FAIL [' + status + '] ' + label + '\n  Body: ' + JSON.stringify(body).substring(0, 200) + '\n')
    }
    return { ok, status, body }
  } catch (e) {
    results.error.push({ label, message: e.message })
    process.stdout.write('ERROR ' + label + ': ' + e.message + '\n')
    return { ok: false, error: e.message }
  }
}

const h = { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }

async function run() {
  console.log('\n=== PHASE 1: AUTH ===')
  await t('No auth -> 401', () => fetch(BASE + '/trades'), 401)
  await t('Bad token -> 401', () => fetch(BASE + '/trades', { headers: { 'Authorization': 'Bearer bad', 'Content-Type': 'application/json' } }), 401)
  await t('Valid token -> 200', () => fetch(BASE + '/trades', { headers: h }), 200)

  console.log('\n=== PHASE 2: STATS (empty user) ===')
  const sum = await t('GET /stats/summary', () => fetch(BASE + '/stats/summary', { headers: h }))
  if (sum.body) {
    const b = sum.body
    const correctEmpty = Number(b.total_trades) === 0 && Number(b.total_pnl) === 0
    console.log('  Empty state correct:', correctEmpty, '| total_trades:', b.total_trades, 'total_pnl:', b.total_pnl)
  }
  await t('GET /stats/equity-curve', () => fetch(BASE + '/stats/equity-curve', { headers: h }))
  await t('GET /stats/calendar', () => fetch(BASE + '/stats/calendar', { headers: h }))
  await t('GET /stats/monthly', () => fetch(BASE + '/stats/monthly', { headers: h }))
  await t('GET /stats/streaks', () => fetch(BASE + '/stats/streaks', { headers: h }))

  console.log('\n=== PHASE 3: TRADE CRUD ===')
  const newTrade = await t('POST /trades (entry/exit full)', () => fetch(BASE + '/trades', {
    method: 'POST', headers: h,
    body: JSON.stringify({
      date: '2026-03-15', ticker: 'TSLA', direction: 'long',
      entry_price: 350, exit_price: 360, stop_loss: 345, position_size: 10, fees: 5,
      notes: 'QA test trade', confidence: 8, emotions: JSON.stringify(['confident']),
      entry_mode: 'entry_exit', tags: []
    })
  }), 201)

  const tradeId = newTrade.body?.id
  console.log('  Created trade ID:', tradeId, '| PnL:', newTrade.body?.pnl, '| Expected: 95 (10*10-5)')

  const directTrade = await t('POST /trades (direct_pnl mode)', () => fetch(BASE + '/trades', {
    method: 'POST', headers: h,
    body: JSON.stringify({
      date: '2026-03-15', ticker: 'AAPL', direction: 'long',
      entry_price: 250, position_size: 5, fees: 0,
      entry_mode: 'direct_pnl', direct_pnl: 150, tags: []
    })
  }), 201)
  console.log('  Direct PnL trade: status=' + directTrade.body?.status + ' pnl=' + directTrade.body?.pnl + ' | Expected: status=closed pnl=150')

  const minTrade = await t('POST /trades (minimal - open)', () => fetch(BASE + '/trades', {
    method: 'POST', headers: h,
    body: JSON.stringify({
      date: '2026-03-16', ticker: 'SPY', direction: 'short',
      entry_price: 600, position_size: 1, fees: 0, tags: []
    })
  }), 201)
  console.log('  Minimal trade status:', minTrade.body?.status, '| Expected: open')

  if (tradeId) {
    await t('GET /trades/:id', () => fetch(BASE + '/trades/' + tradeId, { headers: h }))
    await t('GET /trades/:id/journal', () => fetch(BASE + '/trades/' + tradeId + '/journal', { headers: h }))
    await t('GET /trades/:id/neighbors', () => fetch(BASE + '/trades/' + tradeId + '/neighbors', { headers: h }))
    await t('GET /trades/:id/executions', () => fetch(BASE + '/trades/' + tradeId + '/executions', { headers: h }))

    const updResult = await t('PUT /trades/:id (update price/notes)', () => fetch(BASE + '/trades/' + tradeId, {
      method: 'PUT', headers: h,
      body: JSON.stringify({ exit_price: 365, notes: 'Updated by QA', tags: [] })
    }))
    console.log('  Updated pnl:', updResult.body?.pnl, '| Expected: 145 (10*15-5)')

    // Test wrong user can't access (test with invalid ID)
    await t('GET /trades/99999999 (not found) -> 404', () => fetch(BASE + '/trades/99999999', { headers: h }), 404)
  }

  const listResult = await t('GET /trades (list)', () => fetch(BASE + '/trades', { headers: h }))
  console.log('  List count:', listResult.body?.data?.length, 'total:', listResult.body?.total)

  await t('GET /trades?sort_by=pnl&sort_dir=desc', () => fetch(BASE + '/trades?sort_by=pnl&sort_dir=desc', { headers: h }))
  await t('GET /trades?ticker=TSLA', () => fetch(BASE + '/trades?ticker=TSLA', { headers: h }))
  await t('GET /trades?status=open', () => fetch(BASE + '/trades?status=open', { headers: h }))
  await t('GET /trades?direction=long', () => fetch(BASE + '/trades?direction=long', { headers: h }))
  await t('GET /trades?search=QA', () => fetch(BASE + '/trades?search=QA', { headers: h }))

  console.log('\n=== PHASE 4: EXECUTION TRACKING ===')
  if (tradeId) {
    const execResult = await t('POST /trades/:id/executions', () => fetch(BASE + '/trades/' + tradeId + '/executions', {
      method: 'POST', headers: h,
      body: JSON.stringify({ type: 'entry', price: 350, quantity: 5, fees: 2.5, executed_at: '2026-03-15 09:30:00', notes: 'QA exec' })
    }), 201)
    const execId = execResult.body?.id
    if (execId) {
      await t('DELETE /trades/:id/executions/:execId', () => fetch(BASE + '/trades/' + tradeId + '/executions/' + execId, {
        method: 'DELETE', headers: h
      }))
    }
  }

  console.log('\n=== PHASE 5: TAGS ===')
  await t('GET /tags', () => fetch(BASE + '/tags', { headers: h }))
  const tagResult = await t('POST /tags (create)', () => fetch(BASE + '/tags', {
    method: 'POST', headers: h,
    body: JSON.stringify({ name: 'QATag', color: '#ff0000' })
  }), 201)
  const tagId = tagResult.body?.id
  if (tagId) {
    await t('DELETE /tags/:id', () => fetch(BASE + '/tags/' + tagId, { method: 'DELETE', headers: h }))
  }

  console.log('\n=== PHASE 6: STRATEGIES ===')
  await t('GET /strategies', () => fetch(BASE + '/strategies', { headers: h }))
  const stratResult = await t('POST /strategies (create)', () => fetch(BASE + '/strategies', {
    method: 'POST', headers: h,
    body: JSON.stringify({ name: 'QA Strategy', description: 'QA test strategy', timeframe: '1H' })
  }), 201)
  const stratId = stratResult.body?.id
  if (stratId) {
    await t('PUT /strategies/:id', () => fetch(BASE + '/strategies/' + stratId, {
      method: 'PUT', headers: h,
      body: JSON.stringify({ name: 'QA Strategy Updated', description: 'Updated', timeframe: '4H' })
    }))
    await t('DELETE /strategies/:id', () => fetch(BASE + '/strategies/' + stratId, { method: 'DELETE', headers: h }))
  }

  console.log('\n=== PHASE 7: ACCOUNTS ===')
  await t('GET /accounts (empty)', () => fetch(BASE + '/accounts', { headers: h }))
  const acctResult = await t('POST /accounts (create)', () => fetch(BASE + '/accounts', {
    method: 'POST', headers: h,
    body: JSON.stringify({ name: 'QA Account', broker_name: 'Test Broker', currency: 'USD', starting_balance: 10000, is_default: 1 })
  }), 201)
  const acctId = acctResult.body?.id
  console.log('  Account balance:', acctResult.body?.current_balance, '| Expected: 10000')

  if (acctId) {
    await t('GET /accounts/:id', () => fetch(BASE + '/accounts/' + acctId, { headers: h }))
    await t('GET /accounts/:id/transactions', () => fetch(BASE + '/accounts/' + acctId + '/transactions', { headers: h }))
    await t('GET /accounts/:id/equity', () => fetch(BASE + '/accounts/' + acctId + '/equity', { headers: h }))
    const txResult = await t('POST /accounts/:id/transactions (deposit)', () => fetch(BASE + '/accounts/' + acctId + '/transactions', {
      method: 'POST', headers: h,
      body: JSON.stringify({ type: 'deposit', amount: 5000, date: '2026-03-01', notes: 'QA deposit' })
    }), 201)
    if (txResult.body?.id) {
      await t('DELETE /accounts/:id/transactions/:txId', () => fetch(BASE + '/accounts/' + acctId + '/transactions/' + txResult.body.id, {
        method: 'DELETE', headers: h
      }))
    }
    await t('PUT /accounts/:id (update)', () => fetch(BASE + '/accounts/' + acctId, {
      method: 'PUT', headers: h,
      body: JSON.stringify({ name: 'QA Account Updated', broker_name: 'Updated Broker' })
    }))
  }

  await t('POST /accounts (missing name) -> 400', () => fetch(BASE + '/accounts', {
    method: 'POST', headers: h,
    body: JSON.stringify({ broker_name: 'Test' })
  }), 400)

  console.log('\n=== PHASE 8: ANALYTICS ===')
  await t('GET /analytics/by-weekday', () => fetch(BASE + '/analytics/by-weekday', { headers: h }))
  await t('GET /analytics/by-hour', () => fetch(BASE + '/analytics/by-hour', { headers: h }))
  await t('GET /analytics/by-strategy', () => fetch(BASE + '/analytics/by-strategy', { headers: h }))
  await t('GET /analytics/by-setup', () => fetch(BASE + '/analytics/by-setup', { headers: h }))
  await t('GET /analytics/by-ticker', () => fetch(BASE + '/analytics/by-ticker', { headers: h }))
  await t('GET /analytics/by-tag', () => fetch(BASE + '/analytics/by-tag', { headers: h }))
  await t('GET /analytics/rr-dist', () => fetch(BASE + '/analytics/rr-dist', { headers: h }))
  await t('GET /analytics/pnl-dist', () => fetch(BASE + '/analytics/pnl-dist', { headers: h }))
  await t('GET /analytics/drawdown', () => fetch(BASE + '/analytics/drawdown', { headers: h }))
  await t('GET /analytics/hold-time', () => fetch(BASE + '/analytics/hold-time', { headers: h }))
  await t('GET /analytics/custom?x_field=ticker&y_metric=pnl', () => fetch(BASE + '/analytics/custom?x_field=ticker&y_metric=pnl', { headers: h }))
  await t('GET /analytics/custom?x_field=strategy&y_metric=win_rate', () => fetch(BASE + '/analytics/custom?x_field=strategy&y_metric=win_rate', { headers: h }))
  await t('GET /analytics/custom?x_field=invalid -> 400', () => fetch(BASE + '/analytics/custom?x_field=invalid&y_metric=pnl', { headers: h }), 400)

  console.log('\n=== PHASE 9: JOURNAL ===')
  const journalResult = await t('POST /journal (daily)', () => fetch(BASE + '/journal', {
    method: 'POST', headers: h,
    body: JSON.stringify({
      date: '2026-03-15', entry_type: 'daily', title: 'QA Journal Entry',
      content: '<p>Test journal content</p>', mood: 'good', tags: ['test'], trade_ids: []
    })
  }), 201)
  const journalId = journalResult.body?.id
  console.log('  Journal entry ID:', journalId, '| mood:', journalResult.body?.mood)

  if (journalId) {
    await t('GET /journal/:id', () => fetch(BASE + '/journal/' + journalId, { headers: h }))
    await t('PUT /journal/:id (update)', () => fetch(BASE + '/journal/' + journalId, {
      method: 'PUT', headers: h,
      body: JSON.stringify({ date: '2026-03-15', title: 'Updated QA Entry', content: '<p>Updated</p>', mood: 'great', tags: [], trade_ids: [] })
    }))
  }

  await t('GET /journal (list)', () => fetch(BASE + '/journal', { headers: h }))
  await t('GET /journal/calendar', () => fetch(BASE + '/journal/calendar', { headers: h }))
  await t('GET /journal/tags', () => fetch(BASE + '/journal/tags', { headers: h }))
  await t('GET /journal/weekly-stats?from=2026-03-10&to=2026-03-16', () => fetch(BASE + '/journal/weekly-stats?from=2026-03-10&to=2026-03-16', { headers: h }))
  await t('GET /journal/weekly-stats (missing params) -> 400', () => fetch(BASE + '/journal/weekly-stats', { headers: h }), 400)

  if (journalId) {
    await t('DELETE /journal/:id', () => fetch(BASE + '/journal/' + journalId, { method: 'DELETE', headers: h }))
  }

  console.log('\n=== PHASE 10: PSYCHOLOGY ===')
  await t('GET /psychology/tilt-history', () => fetch(BASE + '/psychology/tilt-history', { headers: h }))
  await t('GET /psychology/summary', () => fetch(BASE + '/psychology/summary', { headers: h }))
  await t('GET /psychology/emotion-performance', () => fetch(BASE + '/psychology/emotion-performance', { headers: h }))
  await t('GET /psychology/emotion-frequency', () => fetch(BASE + '/psychology/emotion-frequency', { headers: h }))
  await t('GET /psychology/rule-compliance', () => fetch(BASE + '/psychology/rule-compliance', { headers: h }))
  await t('GET /psychology/mistake-stats', () => fetch(BASE + '/psychology/mistake-stats', { headers: h }))
  await t('GET /psychology/session-quality', () => fetch(BASE + '/psychology/session-quality', { headers: h }))

  console.log('\n=== PHASE 11: PLAYBOOK ===')
  await t('GET /playbook/setups', () => fetch(BASE + '/playbook/setups', { headers: h }))
  await t('GET /playbook/planned', () => fetch(BASE + '/playbook/planned', { headers: h }))
  await t('GET /playbook/missed', () => fetch(BASE + '/playbook/missed', { headers: h }))
  await t('GET /playbook/missed/summary', () => fetch(BASE + '/playbook/missed/summary', { headers: h }))

  const plannedResult = await t('POST /playbook/planned', () => fetch(BASE + '/playbook/planned', {
    method: 'POST', headers: h,
    body: JSON.stringify({ ticker: 'NVDA', direction: 'long', planned_entry: 180, stop_loss: 175, target_price: 195, notes: 'QA planned', confidence: 8 })
  }), 201)
  const plannedId = plannedResult.body?.id

  if (plannedId) {
    await t('PUT /playbook/planned/:id (update)', () => fetch(BASE + '/playbook/planned/' + plannedId, {
      method: 'PUT', headers: h,
      body: JSON.stringify({ ticker: 'NVDA', direction: 'long', planned_entry: 182, notes: 'Updated QA planned', status: 'active' })
    }))
    await t('POST /playbook/planned/:id/execute', () => fetch(BASE + '/playbook/planned/' + plannedId + '/execute', {
      method: 'POST', headers: h,
      body: JSON.stringify({ date: '2026-03-16', entry_price: 181, position_size: 5, fees: 2 })
    }))
  }

  const missedResult = await t('POST /playbook/missed', () => fetch(BASE + '/playbook/missed', {
    method: 'POST', headers: h,
    body: JSON.stringify({ date: '2026-03-14', ticker: 'AMD', direction: 'long', entry_would_have_been: 130, exit_would_have_been: 140, position_size: 20, simulated_pnl: 200, reason_missed: 'Was away from screens', notes: 'QA missed trade' })
  }), 201)
  const missedId = missedResult.body?.id

  if (missedId) {
    await t('PUT /playbook/missed/:id', () => fetch(BASE + '/playbook/missed/' + missedId, {
      method: 'PUT', headers: h,
      body: JSON.stringify({ date: '2026-03-14', ticker: 'AMD', direction: 'long', notes: 'Updated QA missed' })
    }))
    await t('DELETE /playbook/missed/:id', () => fetch(BASE + '/playbook/missed/' + missedId, { method: 'DELETE', headers: h }))
  }

  console.log('\n=== PHASE 12: GOALS & ACHIEVEMENTS ===')
  await t('GET /goals', () => fetch(BASE + '/goals', { headers: h }))
  const goalResult = await t('POST /goals (monthly pnl)', () => fetch(BASE + '/goals', {
    method: 'POST', headers: h,
    body: JSON.stringify({ name: 'QA Goal', metric: 'pnl', target_value: 1000, timeframe: 'monthly', direction: 'above', active: 1 })
  }))
  const goalId = goalResult.body?.id
  console.log('  Goal progress:', goalResult.body?.progress, '| is_met:', goalResult.body?.is_met)

  if (goalId) {
    await t('PUT /goals/:id (update)', () => fetch(BASE + '/goals/' + goalId, {
      method: 'PUT', headers: h,
      body: JSON.stringify({ name: 'QA Goal Updated', metric: 'win_rate', target_value: 60, timeframe: 'monthly', direction: 'above', active: 1 })
    }))
    await t('DELETE /goals/:id', () => fetch(BASE + '/goals/' + goalId, { method: 'DELETE', headers: h }))
  }

  await t('GET /goals/streaks', () => fetch(BASE + '/goals/streaks', { headers: h }))
  await t('GET /goals/progress', () => fetch(BASE + '/goals/progress', { headers: h }))
  const achvResult = await t('GET /goals/achievements', () => fetch(BASE + '/goals/achievements', { headers: h }))
  console.log('  Achievement count:', achvResult.body?.length)

  const customAchv = await t('POST /goals/achievements (custom)', () => fetch(BASE + '/goals/achievements', {
    method: 'POST', headers: h,
    body: JSON.stringify({ name: 'QA Achievement', description: 'Test', icon: '🧪', category: 'custom' })
  }))
  const achvId = customAchv.body?.id
  if (achvId) {
    await t('PUT /goals/achievements/:id', () => fetch(BASE + '/goals/achievements/' + achvId, {
      method: 'PUT', headers: h,
      body: JSON.stringify({ name: 'QA Achievement Updated', earned_at: new Date().toISOString() })
    }))
    await t('DELETE /goals/achievements/:id', () => fetch(BASE + '/goals/achievements/' + achvId, { method: 'DELETE', headers: h }))
  }

  console.log('\n=== PHASE 13: IMPORT/EXPORT ===')
  const csvData = 'date,ticker,direction,entry_price,exit_price,position_size,fees\n2026-03-01,GOOG,long,190,200,10,5'
  const previewResult = await t('POST /import/preview', () => fetch(BASE + '/import/preview', {
    method: 'POST', headers: h,
    body: JSON.stringify({ csv: csvData })
  }))
  console.log('  Preview headers:', previewResult.body?.headers, '| rows:', previewResult.body?.total_rows)

  await t('POST /import/run', () => fetch(BASE + '/import/run', {
    method: 'POST', headers: h,
    body: JSON.stringify({
      csv: csvData,
      mappings: { date: 'date', ticker: 'ticker', direction: 'direction', entry_price: 'entry_price', exit_price: 'exit_price', position_size: 'position_size', fees: 'fees' }
    })
  }))

  await t('GET /export/csv', () => fetch(BASE + '/export/csv', { headers: h }))
  await t('GET /export/json', () => fetch(BASE + '/export/json', { headers: h }))

  console.log('\n=== PHASE 14: EDGE CASES ===')
  // Verify PnL calculation is correct
  const calcTest = await t('POST /trades (PnL calc verification - short)', () => fetch(BASE + '/trades', {
    method: 'POST', headers: h,
    body: JSON.stringify({
      date: '2026-03-15', ticker: 'CALC', direction: 'short',
      entry_price: 100, exit_price: 90, stop_loss: 105, position_size: 10, fees: 5, tags: []
    })
  }), 201)
  const expectedPnl = (100 - 90) * 10 - 5  // = 95
  const expectedR = 95 / (5 * 10)  // risk = 5 per unit * 10 = 50, r = 95/50 = 1.9
  console.log('  Short trade PnL:', calcTest.body?.pnl, '| Expected:', expectedPnl)
  console.log('  Short trade R:', calcTest.body?.r_multiple, '| Expected:', expectedR)

  // Delete test trade
  if (minTrade.body?.id) {
    await t('DELETE /trades/:id', () => fetch(BASE + '/trades/' + minTrade.body.id, { method: 'DELETE', headers: h }))
    await t('GET /trades/:id (deleted) -> 404', () => fetch(BASE + '/trades/' + minTrade.body.id, { headers: h }), 404)
  }

  // Delete account
  if (acctId) {
    await t('DELETE /accounts/:id', () => fetch(BASE + '/accounts/' + acctId, { method: 'DELETE', headers: h }))
  }

  console.log('\n=== SUMMARY ===')
  console.log('PASSED:', results.pass.length)
  console.log('FAILED:', results.fail.length)
  console.log('ERRORS:', results.error.length)

  if (results.fail.length > 0) {
    console.log('\n--- FAILURES ---')
    results.fail.forEach(f => console.log('  FAIL:', f.label, '| expected:', f.expected, 'got:', f.got, '\n    Body:', f.body))
  }
  if (results.error.length > 0) {
    console.log('\n--- ERRORS ---')
    results.error.forEach(e => console.log('  ERROR:', e.label, '|', e.message))
  }
}

run().catch(console.error)
