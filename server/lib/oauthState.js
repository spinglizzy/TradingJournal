import { randomUUID } from 'crypto'
import pool from '../db.js'

const STATE_TTL_MINUTES = 10

/**
 * Creates a state token in the DB that ties an OAuth flow to a specific user.
 * @param {string} userId
 * @param {string} broker
 * @param {object} [meta] - extra data to store (e.g. E*TRADE oauth_token_secret)
 * @returns {string} the state token
 */
export async function createOAuthState(userId, broker, meta = null) {
  const state = randomUUID()
  await pool.query(
    `INSERT INTO oauth_state (state, user_id, broker, meta) VALUES ($1, $2, $3, $4)`,
    [state, userId, broker, meta ? JSON.stringify(meta) : null]
  )
  return state
}

/**
 * Atomically reads and deletes a state token.
 * Throws if the token doesn't exist or has expired.
 * @param {string} state
 * @returns {{ userId: string, broker: string, meta: object|null }}
 */
export async function consumeOAuthState(state) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `DELETE FROM oauth_state WHERE state = $1 RETURNING user_id, broker, meta, created_at`,
      [state]
    )
    await client.query('COMMIT')

    if (!rows.length) throw new Error('Invalid or already-used OAuth state.')

    const { user_id, broker, meta, created_at } = rows[0]
    const ageMs = Date.now() - new Date(created_at).getTime()
    if (ageMs > STATE_TTL_MINUTES * 60 * 1000) {
      throw new Error('OAuth state has expired. Please try connecting again.')
    }

    return { userId: user_id, broker, meta }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
