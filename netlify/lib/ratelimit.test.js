import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { rateLimit, getClientIp, rateLimitResponse } from './ratelimit.js'

// The limiter keeps its counts in module memory, so each test uses its own key.
let n = 0
const freshKey = () => `test-key-${++n}`

describe('rateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('allows requests up to the limit and counts down what is left', () => {
    const key = freshKey()
    const results = [1, 2, 3].map(() => rateLimit(key, { windowMs: 60_000, max: 3 }))
    expect(results.map(r => r.allowed)).toEqual([true, true, true])
    expect(results.map(r => r.remaining)).toEqual([2, 1, 0])
  })

  it('blocks the request after the limit', () => {
    const key = freshKey()
    for (let i = 0; i < 3; i++) rateLimit(key, { windowMs: 60_000, max: 3 })
    const blocked = rateLimit(key, { windowMs: 60_000, max: 3 })
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
  })

  it('reports when the window ends, measured from the first request', () => {
    const key = freshKey()
    const start = Date.now()
    rateLimit(key, { windowMs: 60_000, max: 1 })
    vi.advanceTimersByTime(20_000)
    expect(rateLimit(key, { windowMs: 60_000, max: 1 }).resetMs).toBe(start + 60_000)
  })

  it('stays blocked until the window has fully passed, then starts over', () => {
    const key = freshKey()
    const opts = { windowMs: 60_000, max: 1 }
    rateLimit(key, opts)

    vi.advanceTimersByTime(60_000)
    expect(rateLimit(key, opts).allowed).toBe(false)

    vi.advanceTimersByTime(1)
    const afterReset = rateLimit(key, opts)
    expect(afterReset.allowed).toBe(true)
    expect(afterReset.remaining).toBe(0)
  })

  it('counts each key separately', () => {
    const a = freshKey(), b = freshKey()
    rateLimit(a, { max: 1 })
    expect(rateLimit(a, { max: 1 }).allowed).toBe(false)
    expect(rateLimit(b, { max: 1 }).allowed).toBe(true)
  })

  it('defaults to 20 requests a minute', () => {
    const key = freshKey()
    const results = Array.from({ length: 21 }, () => rateLimit(key))
    expect(results.filter(r => r.allowed)).toHaveLength(20)
    expect(results[0].resetMs).toBe(Date.now() + 60_000)
  })

  it('puts every caller with no identifier in one shared bucket', () => {
    // Uses the real "unknown" bucket, so allow for other tests having touched it.
    const before = rateLimit(undefined, { max: 1000 }).remaining
    expect(rateLimit('', { max: 1000 }).remaining).toBe(before - 1)
    expect(rateLimit(null, { max: 1000 }).remaining).toBe(before - 2)
  })
})

describe('getClientIp', () => {
  it('prefers the address Netlify reports', () => {
    const headers = new Headers({
      'x-nf-client-connection-ip': '203.0.113.7',
      'x-forwarded-for': '198.51.100.1, 10.0.0.1',
    })
    expect(getClientIp(headers)).toBe('203.0.113.7')
  })

  it('falls back to the first forwarded address', () => {
    expect(getClientIp(new Headers({ 'x-forwarded-for': ' 198.51.100.1 , 10.0.0.1' }))).toBe('198.51.100.1')
  })

  it('returns "unknown" when no address is present', () => {
    expect(getClientIp(new Headers())).toBe('unknown')
  })
})

describe('rateLimitResponse', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('answers 429 and says how many seconds to wait, rounded up', async () => {
    const res = rateLimitResponse(Date.now() + 12_300)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('13')
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(await res.json()).toEqual({ error: 'Too many requests. Slow down.' })
  })
})
