import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { rateLimit } from './ratelimit.js'

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
})
