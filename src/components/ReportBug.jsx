import { useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { bugReportContext } from '../lib/bugReport'
import './ReportBug.css'

export default function ReportBug({ seriesId, submissionId }) {
  const { session, gamertag, loading, gamertagLoading } = useAuth()
  const dialog = useRef(null)
  const context = useRef(null)
  const sending = useRef(false)
  const headingId = useId()
  const [happened, setHappened] = useState('')
  const [expected, setExpected] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [issue, setIssue] = useState(null)

  function open() {
    context.current = bugReportContext({
      href: window.location.href,
      width: window.innerWidth,
      height: window.innerHeight,
      version: __APP_VERSION__,
      seriesId,
      submissionId,
    })
    setError('')
    setIssue(null)
    dialog.current.showModal()
  }

  async function submit(event) {
    event.preventDefault()
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setError('')
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      if (!currentSession) throw new Error('Please sign in again before sending your report.')
      const response = await fetch('/.netlify/functions/report-bug', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: ['Bearer', currentSession.access_token].join(' '),
        },
        body: JSON.stringify({ ...context.current, happened, expected }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not send your bug report. Please try again later.')
      setIssue(data)
      setHappened('')
      setExpected('')
    } catch (err) {
      setError(err.message === 'Failed to fetch' ? 'Could not send your bug report. Check your connection and try again.' : err.message)
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="report-bug-trigger" onClick={open}>Report a bug</button>
      <dialog ref={dialog} className="report-bug-dialog" aria-labelledby={headingId}
        onCancel={event => { if (sending.current) event.preventDefault() }}>
        <h2 id={headingId}>Report a bug</h2>
        <p>Reports create <strong>public GitHub issues</strong>. Anyone can see your gamertag, report text,
          page URL/route, browser/device, viewport, app version, and any series/submission IDs.
          Don’t include passwords, personal information, or other sensitive details.
          Screenshots are not attached.</p>
        {loading || gamertagLoading ? <p>Loading your player profile…</p> : !session ? (
          <p><Link to="/login" onClick={() => dialog.current.close()}>Sign in</Link> to report a bug.</p>
        ) : !gamertag ? (
          <p><Link to="/claim" onClick={() => dialog.current.close()}>Claim your player profile</Link> before reporting a bug.</p>
        ) : issue ? (
          <p role="status">Thanks! Your bug report was sent.{' '}
            <a href={issue.issue_url} target="_blank" rel="noreferrer">View issue #{issue.issue_number}</a>
          </p>
        ) : (
          <form onSubmit={submit}>
            <p>Reporting as <strong>{gamertag}</strong>.</p>
            <label>What happened? (required)
              <textarea required maxLength={4000} value={happened} disabled={busy}
                onChange={event => setHappened(event.target.value)} />
            </label>
            <label>What did you expect? (optional)
              <textarea maxLength={4000} value={expected} disabled={busy}
                onChange={event => setExpected(event.target.value)} />
            </label>
            {error && <p role="alert">{error}</p>}
            <button type="submit" disabled={busy || !happened.trim()}>{busy ? 'Sending…' : 'Send public bug report'}</button>
          </form>
        )}
        <button type="button" disabled={busy} onClick={() => dialog.current.close()}>Close</button>
      </dialog>
    </>
  )
}
