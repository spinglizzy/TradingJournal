/**
 * The one string that tells the browser a 401 was about ITS OWN Supabase token,
 * as opposed to an endpoint returning 401 for a reason of its own -- see
 * server/routes/alpaca.js, which 401s when the user's ALPACA keys are wrong.
 *
 * Imported by server/middleware/auth.js AND src/api/authRetry.js on purpose: a
 * client checking for a different string than the server sends would silently
 * disable the refresh and go straight back to logging people out mid-session.
 */
export const TOKEN_INVALID = 'token_invalid'
