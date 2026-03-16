import { Router } from 'express'
import pool from '../db.js'

const router = Router()

const ACCT_SELECT = `
  SELECT a.*,
    COALESCE(SUM(CASE WHEN at.type='deposit'    THEN at.amount ELSE 0 END),0) AS total_deposits,
    COALESCE(SUM(CASE WHEN at.type='withdrawal' THEN at.amount ELSE 0 END),0) AS total_withdrawals,
    (SELECT COALESCE(SUM(pnl),0) FROM trades WHERE account_id=a.id AND status='closed') AS realized_pnl,
    (SELECT COUNT(*)             FROM trades WHERE account_id=a.id) AS trade_count
  FROM accounts a
  LEFT JOIN account_transactions at ON at.account_id=a.id`

// ── List accounts ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `${ACCT_SELECT} WHERE a.user_id=$1 GROUP BY a.id ORDER BY a.is_default DESC, a.created_at ASC`,
      [req.userId]
    )
    res.json(result.rows.map(addBalance))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Get single account ────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `${ACCT_SELECT} WHERE a.id=$1 AND a.user_id=$2 GROUP BY a.id`,
      [req.params.id, req.userId]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Account not found' })
    res.json(addBalance(result.rows[0]))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Create account ────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { name, broker_name='', currency='USD', starting_balance=0,
            commission_type='fixed', commission_value=0, pnl_method='basic', is_default=0 } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Account name is required' })

    if (is_default) await pool.query('UPDATE accounts SET is_default=0 WHERE user_id=$1', [req.userId])

    const result = await pool.query(`
      INSERT INTO accounts (name,broker_name,currency,starting_balance,commission_type,commission_value,pnl_method,is_default,user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id
    `, [name.trim(), broker_name, currency, Number(starting_balance),
        commission_type, Number(commission_value), pnl_method, is_default ? 1 : 0, req.userId])

    res.status(201).json(await getAccount(result.rows[0].id, req.userId))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Update account ────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const existR = await pool.query('SELECT * FROM accounts WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    if (!existR.rows[0]) return res.status(404).json({ error: 'Account not found' })

    const existing = existR.rows[0]
    const { name, broker_name, currency, starting_balance, commission_type, commission_value, pnl_method, is_default } = req.body
    const m = {
      name:             name             ?? existing.name,
      broker_name:      broker_name      ?? existing.broker_name,
      currency:         currency         ?? existing.currency,
      starting_balance: starting_balance ?? existing.starting_balance,
      commission_type:  commission_type  ?? existing.commission_type,
      commission_value: commission_value ?? existing.commission_value,
      pnl_method:       pnl_method       ?? existing.pnl_method,
      is_default:       is_default       ?? existing.is_default,
    }

    if (m.is_default) await pool.query('UPDATE accounts SET is_default=0 WHERE id!=$1 AND user_id=$2', [req.params.id, req.userId])

    await pool.query(`
      UPDATE accounts SET name=$1,broker_name=$2,currency=$3,starting_balance=$4,
        commission_type=$5,commission_value=$6,pnl_method=$7,is_default=$8
      WHERE id=$9 AND user_id=$10
    `, [m.name, m.broker_name, m.currency, Number(m.starting_balance),
        m.commission_type, Number(m.commission_value), m.pnl_method, m.is_default ? 1 : 0,
        req.params.id, req.userId])

    res.json(await getAccount(req.params.id, req.userId))
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Delete account ────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT id FROM accounts WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    if (!r.rows[0]) return res.status(404).json({ error: 'Account not found' })
    await pool.query('DELETE FROM accounts WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    res.json({ success: true })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Transactions ──────────────────────────────────────────────────────────────
router.get('/:id/transactions', async (req, res) => {
  try {
    // Verify account belongs to user before returning transactions
    const acct = await pool.query('SELECT id FROM accounts WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    if (!acct.rows[0]) return res.status(404).json({ error: 'Account not found' })

    const result = await pool.query(
      'SELECT * FROM account_transactions WHERE account_id=$1 ORDER BY date DESC, created_at DESC',
      [req.params.id]
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.post('/:id/transactions', async (req, res) => {
  try {
    const acct = await pool.query('SELECT id FROM accounts WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    if (!acct.rows[0]) return res.status(404).json({ error: 'Account not found' })

    const { type, amount, date, notes='' } = req.body
    if (!type || !amount || !date) return res.status(400).json({ error: 'type, amount, and date are required' })

    const result = await pool.query(`
      INSERT INTO account_transactions (account_id,type,amount,date,notes,user_id)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
    `, [req.params.id, type, Number(amount), date, notes, req.userId])

    const row = await pool.query('SELECT * FROM account_transactions WHERE id=$1', [result.rows[0].id])
    res.status(201).json(row.rows[0])
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

router.delete('/:id/transactions/:txId', async (req, res) => {
  try {
    // Verify account belongs to user before deleting transaction
    const acct = await pool.query('SELECT id FROM accounts WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    if (!acct.rows[0]) return res.status(404).json({ error: 'Account not found' })

    await pool.query('DELETE FROM account_transactions WHERE id=$1 AND account_id=$2', [req.params.txId, req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Equity curve per account ──────────────────────────────────────────────────
router.get('/:id/equity', async (req, res) => {
  try {
    const acctR = await pool.query('SELECT * FROM accounts WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])
    if (!acctR.rows[0]) return res.status(404).json({ error: 'Account not found' })
    const account = acctR.rows[0]

    const [txR, tradeR] = await Promise.all([
      pool.query('SELECT date,type,amount FROM account_transactions WHERE account_id=$1 ORDER BY date ASC', [req.params.id]),
      pool.query(`SELECT date,SUM(pnl) as day_pnl FROM trades WHERE account_id=$1 AND status='closed' AND pnl IS NOT NULL GROUP BY date ORDER BY date ASC`, [req.params.id]),
    ])

    const txEvents    = txR.rows
    const tradeEvents = tradeR.rows
    const allDates = new Set([...txEvents.map(e => e.date), ...tradeEvents.map(e => e.date)])
    const sorted = [...allDates].sort()

    let balance = Number(account.starting_balance)
    const result = sorted.map(date => {
      for (const tx of txEvents.filter(e => e.date === date)) {
        balance += tx.type === 'deposit' ? Number(tx.amount) : -Number(tx.amount)
      }
      const tradePnl = Number(tradeEvents.find(e => e.date === date)?.day_pnl ?? 0)
      balance += tradePnl
      return { date, balance, trade_pnl: tradePnl }
    })
    res.json(result)
  } catch (err) {
    console.error(err); res.status(500).json({ error: err.message })
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getAccount(id, userId) {
  const r = await pool.query(`${ACCT_SELECT} WHERE a.id=$1 AND a.user_id=$2 GROUP BY a.id`, [id, userId])
  return r.rows[0] ? addBalance(r.rows[0]) : null
}

function addBalance(a) {
  return {
    ...a,
    current_balance: Number(a.starting_balance) + Number(a.total_deposits) - Number(a.total_withdrawals) + Number(a.realized_pnl),
  }
}

export default router
