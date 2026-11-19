import { test, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'

process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
const { supabaseAdmin } = await import('../lib/shared.js')
const { default: handler } = await import('../functions/report-bug.js')
const SERIES = '11111111-1111-4111-8111-111111111111'
const SUBMISSION = '22222222-2222-4222-8222-222222222222'
let userId = 0
let github
let getUser
let player

beforeEach(() => {
  userId++
  process.env.GITHUB_ISSUES_TOKEN = 'test-issues-token'
  player = { id: 'player', gamertag: 'Real@Player' }
  getUser = mock.method(supabaseAdmin.auth, 'getUser', async () => ({ data: { user: { id: `user-${userId}` } } }))
  mock.method(supabaseAdmin, 'from', table => {
    assert.equal(table, 'players')
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: player }) }) }) }
  })
  github = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ number: 42 }), { status: 201 }))
})

afterEach(() => {
  mock.restoreAll()
  delete process.env.GITHUB_ISSUES_TOKEN
})

function request(body = { happened: 'Upload failed' }, options = {}) {
  return new Request('https://app.example/.netlify/functions/report-bug', {
    method: 'POST',
    headers: { authorization: '******', 'user-agent': 'Test Browser', ...options.headers },
    body: JSON.stringify(body),
    ...options,
  })
}

test('only POST is accepted', async () => {
  assert.equal((await handler(new Request('https://app.example'))).status, 405)
  assert.equal(getUser.mock.callCount(), 0)
})

test('authentication and a claimed player are required', async () => {
  assert.equal((await handler(request({}, { headers: {} }))).status, 401)
  getUser.mock.mockImplementation(async () => ({ error: { message: 'expired' } }))
  assert.equal((await handler(request())).status, 401)
  getUser.mock.mockImplementation(async () => ({ data: { user: { id: 'unclaimed' } } }))
  player = null
  assert.equal((await handler(request())).status, 403)
  assert.equal(github.mock.callCount(), 0)
})

test('five reports per user per ten minutes, independent of IP', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await handler(request())).status, 201)
  const response = await handler(request(undefined, { headers: { authorization: '******', 'x-forwarded-for': '192.0.2.2' } }))
  assert.equal(response.status, 429)
  assert.ok(Number(response.headers.get('Retry-After')) > 0)
  assert.equal(github.mock.callCount(), 5)
  userId++
  assert.equal((await handler(request())).status, 201)
})

test('rejects invalid JSON, shapes, missing text and oversized payloads', async () => {
  for (const body of [null, [], { happened: 3 }, { happened: ' \r\n ' }]) {
    assert.equal((await handler(request(body))).status, 400)
  }
  userId++
  assert.equal((await handler(request({}, { body: '{' }))).status, 400)
  assert.equal((await handler(request({ happened: 'x'.repeat(24_000) }))).status, 413)
  assert.equal(github.mock.callCount(), 0)
})

test('creates a fixed-repository labeled issue with literal, bounded text and automatic context', async () => {
  const response = await handler(request({
    happened: '  @someone\r\n```\n# injected <img src=x>\n- [ ] task  ',
    expected: 'x'.repeat(5000),
    page_url: 'https://app.example/series/test?access_token=secret#token',
    route: '/series/test?access_token=secret#token',
    app_version: 'abc123',
    series_id: SERIES,
    submission_id: SUBMISSION,
    viewport: { width: 390, height: 844 },
    gamertag: 'Forged', labels: ['admin'], repo: 'other/repo',
  }))
  assert.equal(response.status, 201)
  assert.deepEqual(await response.json(), {
    issue_number: 42, issue_url: 'https://github.com/BrandoBank/nba2k26-proam/issues/42',
  })
  const [url, options] = github.mock.calls[0].arguments
  assert.equal(url, 'https://api.github.com/repos/BrandoBank/nba2k26-proam/issues')
  assert.equal(options.headers.Authorization, ['Bearer', process.env.GITHUB_ISSUES_TOKEN].join(' '))
  const payload = JSON.parse(options.body)
  assert.deepEqual(payload.labels, ['bug-report'])
  assert.equal(payload.title, 'Bug report: ＠someone')
  assert.ok(payload.body.includes('    ＠someone\n    ```\n    # injected <img src=x>\n    - [ ] task'))
  for (const value of ['Real＠Player', 'https://app.example/series/test', 'Test Browser', '390 × 844', 'abc123', SERIES, SUBMISSION]) {
    assert.ok(payload.body.includes(`    ${value}`), value)
  }
  for (const value of ['@', 'access_token', 'password', 'Forged', 'test-issues-token', 'x'.repeat(4001)]) {
    assert.ok(!payload.body.includes(value), value)
  }
})

test('caps the required text and ignores invalid optional context', async () => {
  assert.equal((await handler(request({
    happened: 'x'.repeat(5000), expected: {}, page_url: 'javascript:alert(1)',
    viewport: { width: -1, height: '800' }, series_id: 'bad', submission_id: '@team',
  }))).status, 201)
  const payload = JSON.parse(github.mock.calls[0].arguments[1].body)
  assert.ok(payload.body.includes('x'.repeat(4000)))
  assert.ok(!payload.body.includes('x'.repeat(4001)))
  assert.ok(!payload.body.includes('javascript:'))
  assert.ok(!payload.body.includes('@team'))
  assert.equal(payload.title.length, 112)
})

test('strips control characters while keeping text literal across blank lines', async () => {
  const response = await handler(request({
    happened: 'First\u0000\u001b line\r\n\r\n@team\n```html\n</details>\n```',
    page_url: 'https://app.example/path?secret=hidden#hidden',
  }))
  assert.equal(response.status, 201)
  const payload = JSON.parse(github.mock.calls[0].arguments[1].body)
  assert.ok(payload.body.includes('    First line\n    \n    ＠team\n    ```html\n    </details>\n    ```'))
  assert.ok(!payload.body.includes('\u0000'))
  assert.ok(!payload.body.includes('\u001b'))
})

test('malformed context IDs cannot crash reporting or be coerced into valid IDs', async () => {
  const response = await handler(request({
    happened: 'Upload failed', series_id: [SERIES], submission_id: { id: SUBMISSION },
  }))
  assert.equal(response.status, 201)
  const payload = JSON.parse(github.mock.calls[0].arguments[1].body)
  assert.ok(!payload.body.includes(SERIES))
  assert.ok(!payload.body.includes(SUBMISSION))
})

test('missing configuration and GitHub errors are friendly and never leak provider details', async () => {
  delete process.env.GITHUB_ISSUES_TOKEN
  assert.equal((await handler(request())).status, 503)
  assert.equal(github.mock.callCount(), 0)
  process.env.GITHUB_ISSUES_TOKEN = 'test-issues-token'
  for (const implementation of [
    async () => new Response('private provider details', { status: 403 }),
    async () => { throw new Error('test-issues-token') },
    async () => new Response('{}', { status: 201 }),
    async () => new Response('not json', { status: 201 }),
  ]) {
    github.mock.mockImplementation(implementation)
    const response = await handler(request())
    assert.equal(response.status, 502)
    assert.deepEqual(await response.json(), { error: 'Could not send your bug report. Please try again later.' })
  }
})
