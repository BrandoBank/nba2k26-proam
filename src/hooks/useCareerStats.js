import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// All career_player_totals rows, optionally filtered to one gamertag
export function useCareerStats(gamertag = null) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function fetch() {
      setLoading(true)
      setError(null)
      const q = supabase.from('career_player_totals').select('*')
      if (gamertag) q.eq('gamertag', gamertag)
      const { data: rows, error: err } = await q
      if (!cancelled) {
        if (err) setError(err.message)
        else setData(rows || [])
        setLoading(false)
      }
    }
    fetch()
    return () => { cancelled = true }
  }, [gamertag])

  // Convenience: single row when gamertag is provided
  const row = gamertag ? (data[0] ?? null) : null

  return { data, row, loading, error }
}
