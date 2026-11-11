/**
 * In-memory rate limiter for Netlify functions.
 *
 * Netlify spins up function instances per request so true cross-request
 * in-memory state isn't guaranteed — but within a warm instance this
 * catches rapid bursts from the same IP effectively.
 *
 * Limits are intentionally generous for real users and tight enough
 * to block automated abuse of expensive AI endpoints.
 */

const _store = new Map()

/**
 * Check and record a request from an IP.
 * @param {string} ip
 * @param {object} opts
 * @param {number} opts.windowMs   - Rolling window in milliseconds
 * @param {number} opts.max        - Max requests per window
 * @returns {{ allowed: boolean, remaining: number, resetMs: number }}
 */
export function rateLimit(ip, { windowMs = 60_000, max = 20 } = {}) {
  const now = Date.now()
  const key = ip || 'unknown'

  if (!_store.has(key)) {
    _store.set(key, { count: 1, start: now })
    return { allowed: true, remaining: max - 1, resetMs: now + windowMs }
  }

  const entry = _store.get(key)

  if (now - entry.start > windowMs) {
    // Window expired — reset
    _store.set(key, { count: 1, start: now })
    return { allowed: true, remaining: max - 1, resetMs: now + windowMs }
  }

  entry.count++
  const remaining = Math.max(0, max - entry.count)
  const resetMs = entry.start + windowMs

  if (entry.count > max) {
    return { allowed: false, remaining: 0, resetMs }
  }

  return { allowed: true, remaining, resetMs }
}

/** Extract best-effort client IP from Netlify request headers */
export function getClientIp(headers) {
  return (
    headers.get('x-nf-client-connection-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

/** Standard rate-limit exceeded response */
export function rateLimitResponse(resetMs) {
  return new Response(
    JSON.stringify({ error: 'Too many requests. Slow down.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil((resetMs - Date.now()) / 1000)),
      },
    }
  )
}
