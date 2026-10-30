import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// series_rankings for a given series, or all finalized rankings across series
export function useSeriesRankings(seriesId = null, { finalized = false } = {}) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetch() {
      setLoading(true)
      const q = supabase
        .from('series_rankings')
        .select('*, players(gamertag,display_name)')
      if (seriesId) q.eq('series_id', seriesId)
      if (finalized) q.eq('finalized', true)
      const { data: rows } = await q
      if (!cancelled) {
        setData(rows || [])
        setLoading(false)
      }
    }
    fetch()
  }, [seriesId, finalized])

  return { data, loading }
}

// series_player_stats for a given series (or all rows when seriesId is null)
export function useSeriesPlayerStats(seriesId = null) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetch() {
      setLoading(true)
      const q = supabase.from('series_player_stats').select('*')
      if (seriesId) q.eq('series_id', seriesId)
      const { data: rows } = await q
      if (!cancelled) {
        setData(rows || [])
        setLoading(false)
      }
    }
    fetch()
    return () => { cancelled = true }
  }, [seriesId])

  return { data, loading }
}
