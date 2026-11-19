export function bugReportContext({ href, width, height, version, seriesId, submissionId }) {
  const url = new URL(href)
  return {
    page_url: `${url.origin}${url.pathname}`,
    route: url.pathname,
    series_id: seriesId || url.pathname.match(/^\/series\/([^/]+)(?:\/|$)/)?.[1],
    submission_id: submissionId || url.searchParams.get('submission') || undefined,
    viewport: { width, height },
    app_version: version,
  }
}
