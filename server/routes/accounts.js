import { Router } from 'express'
import db from '../db.js'

const router = Router()

// ── List accounts ─────────────────────────────────────────────────────────────
router.get('/', (_req, res) => {
  const accounts = db.prepare(`
    SELECT a.*,
      COALESCE(SUM(CASE WHEN at.type = 'deposit'    THEN at.amount ELSE 0 END), 0) AS total_deposits,
      COALESCE(SUM(CASE WHEN at.type = 'withdrawal' THEN at.amount ELSE 0 END), 0) AS total_withdrawals,
      (SELECT COALESCE(SUM(pnl), 0) FROM trades WHERE account_id = a.id AND status = 'closed') AS realized_pnl,
      (SELECT COUNT(*) FROM trades WHERE account_id = a.id) AS trade_count
    FROM accounts a
    LEFT JOIN account_transactions at ON at.account_id = a.id
    GROUP BY a.id
    ORDER BY a.is_default DESC, a.created_at ASC
  `).all()

  res.json(accounts.map(a => ({
    ...a,
    current_balance: a.starting_balance + a.total_deposits - a.total_withdrawals + a.realized_pnl,
  })))
})

// ── Get single account ────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const account = db.prepare(`
    SELECT a.*,
      COALESCE(SUM(CASE WHEN at.type = 'deposit'    THEN at.amount ELSE 0 END), 0) AS total_deposits,
      COALESCE(SUM(CASE WHEN at.type = 'withdrawal' THEN at.amount ELSE 0 END), 0) AS total_withdrawals,
      (SELECT COALESCE(SUM(pnl), 0) FROM trades WHERE account_id = a.id AND status = 'closed') AS realized_pnl,
      (SELECT COUNT(*) FROM trades WHERE account_id = a.id) AS trade_count
    FROM accounts a
    LEFT JOIN account_transactions at ON at.account_id = a.id
    WHERE a.id = ?
    GROUP BY a.id
  `).get(req.params.id)

  if (!account) return res.status(404).json({ error: 'Account not found' })
  res.json({
    ...account,
    current_balance: account.starting_balance + account.total_deposits - account.total_withdrawals + account.realized_pnl,
  })
})

// ── Create account ────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { name, broker_name = '', currency = 'USD', starting_balance = 0,
          commission_type = 'fixed', commission_value = 0, pnl_method = 'basic', is_default = 0 } = req.body

  if (!name?.trim()) return res.status(400).json({ error: 'Account name is required' })

  // If setting as default, unset others
  if (is_default) db.prepare('UPDATE accounts SET is_default = 0').run()

  const result = db.prepare(`
    INSERT INTO accounts (name, broker_name, currency, starting_balance, commission_type, commission_value, pnl_method, is_default)
    VALUES (@name, @broker_name, @currency, @starting_balance, @commission_type, @commission_value, @pnl_method, @is_default)
  `).run({ name: name.trim(), broker_name, currency, starting_balance: Number(starting_balance),
           commission_type, commission_value: Number(commission_value), pnl_method, is_default: is_default ? 1 : 0 })

  res.status(201).json(getAccount(result.lastInsertRowid))
})

// ── Update account ────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Account not found' })

  const { name, broker_name, currency, starting_balance, commission_type, commission_value, pnl_method, is_default } = req.body
  const merged = { ...existing, ...{ name, broker_name, currency, starting_balance, commission_type, commission_value, pnl_method, is_default } }

  if (merged.is_default) db.prepare('UPDATE accounts SET is_default = 0 WHERE id != ?').run(req.params.id)

  db.prepare(`
    UPDATE accounts SET
      name = @name, broker_name = @broker_name, currency = @currency,
      starting_balance = @starting_balance, commission_type = @commission_type,
      commission_value = @commission_value, pnl_method = @pnl_method, is_default = @is_default
    WHERE id = @id
  `).run({ ...merged, id: req.params.id, is_default: merged.is_default ? 1 : 0,
           starting_balance: Number(merged.starting_balance), commission_value: Number(merged.commission_value) })

  res.json(getAccount(req.params.id))
})

// ── Delete account ────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(req.params.id)
  if (!account) return res.status(404).json({ error: 'Account not found' })
  db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

// ── Transactions ──────────────────────────────────────────────────────────────
router.get('/:id/transactions', (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM account_transactions
    WHERE account_id = ?
    ORDER BY date DESC, created_at DESC
  `).all(req.params.id)
  res.json(rows)
})

router.post('/:id/transactions', (req, res) => {
  const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(req.params.id)
  if (!account) return res.status(404).json({ error: 'Account not found' })

  const { type, amount, date, notes = '' } = req.body
  if (!type || !amount || !date) return res.status(400).json({ error: 'type, amount, and date are required' })

  const result = db.prepare(`
    INSERT INTO account_transactions (account_id, type, amount, date, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.params.id, type, Number(amount), date, notes)

  res.status(201).json(db.prepare('SELECT * FROM account_transactions WHERE id = ?').get(result.lastInsertRowid))
})

router.delete('/:id/transactions/:txId', (req, res) => {
  db.prepare('DELETE FROM account_transactions WHERE id = ? AND account_id = ?').run(req.params.txId, req.params.id)
  res.json({ success: true })
})

// ── Equity curve per account ──────────────────────────────────────────────────
router.get('/:id/equity', (req, res) => {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id)
  if (!account) return res.status(404).json({ error: 'Account not found' })

  // Get all transactions as events
  const txEvents = db.prepare(`
    SELECT date, type, amount FROM account_transactions WHERE account_id = ? ORDER BY date ASC
  `).all(req.params.id)

  // Get daily PnL from trades
  const tradeEvents = db.prepare(`
    SELECT date, SUM(pnl) as day_pnl FROM trades
    WHERE account_id = ? AND status = 'closed' AND pnl IS NOT NULL
    GROUP BY date ORDER BY date ASC
  `).all(req.params.id)

  // Merge and compute running balance
  const allDates = new Set([...txEvents.map(e => e.date), ...tradeEvents.map(e => e.date)])
  const sorted = [...allDates].sort()

  let balance = account.starting_balance
  const result = sorted.map(date => {
    for (const tx of txEvents.filter(e => e.date === date)) {
      balance += tx.type === 'deposit' ? tx.amount : -tx.amount
    }
    const tradePnl = tradeEvents.find(e => e.date === date)?.day_pnl ?? 0
    balance += tradePnl
    return { date, balance, trade_pnl: tradePnl }
  })

  res.json(result)
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function getAccount(id) {
  const a = db.prepare(`
    SELECT a.*,
      COALESCE(SUM(CASE WHEN at.type = 'deposit'    THEN at.amount ELSE 0 END), 0) AS total_deposits,
      COALESCE(SUM(CASE WHEN at.type = 'withdrawal' THEN at.amount ELSE 0 END), 0) AS total_withdrawals,
      (SELECT COALESCE(SUM(pnl), 0) FROM trades WHERE account_id = a.id AND status = 'closed') AS realized_pnl,
      (SELECT COUNT(*) FROM trades WHERE account_id = a.id) AS trade_count
    FROM accounts a
    LEFT JOIN account_transactions at ON at.account_id = a.id
    WHERE a.id = ?
    GROUP BY a.id
  `).get(id)
  if (!a) return null
  return { ...a, current_balance: a.starting_balance + a.total_deposits - a.total_withdrawals + a.realized_pnl }
}

export default router
