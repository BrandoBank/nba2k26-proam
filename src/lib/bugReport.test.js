import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bugReportContext } from './bugReport.js'

const SERIES = '11111111-1111-4111-8111-111111111111'
const SUBMISSION = '22222222-2222-4222-8222-222222222222'

test('captures upload/review context without publishing query strings or auth fragments', () => {
  const context = bugReportContext({
    href: `https://app.example/series/${SERIES}/add-game?submission=${SUBMISSION}&token=secret#access_token=secret`,
    width: 390, height: 844, version: 'deploy-sha',
  })
  assert.deepEqual(context, {
    page_url: `https://app.example/series/${SERIES}/add-game`,
    route: `/series/${SERIES}/add-game`,
    series_id: SERIES,
    submission_id: SUBMISSION,
    viewport: { width: 390, height: 844 },
    app_version: 'deploy-sha',
  })
})

test('review card context overrides the queue route; ordinary pages have no ids', () => {
  const input = { href: 'https://app.example/review', width: 1280, height: 800, version: 'local' }
  assert.equal(bugReportContext(input).series_id, undefined)
  assert.equal(bugReportContext(input).submission_id, undefined)
  assert.deepEqual(bugReportContext({ ...input, seriesId: SERIES, submissionId: SUBMISSION }), {
    page_url: 'https://app.example/review',
    route: '/review',
    series_id: SERIES,
    submission_id: SUBMISSION,
    viewport: { width: 1280, height: 800 },
    app_version: 'local',
  })
})
