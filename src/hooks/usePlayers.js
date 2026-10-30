import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// All players ordered by gamertag. Pass fields to narrow the select.
export function usePlayers(fields = 'id,gamertag,display_name') {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function fetch() {
      setLoading(true)
      setError(null)
      const { data: rows, error: err } = await supabase
        .from('players')
        .select(fields)
        .order('gamertag')
      if (!cancelled) {
        if (err) setError(err.message)
        else setData(rows || [])
        setLoading(false)
      }
    }
    fetch()
    return () => { cancelled = true }
  }, [fields])

  return { data, loading, error }
}
