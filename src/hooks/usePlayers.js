import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// All players ordered by gamertag. Pass fields to narrow the select.
export function usePlayers(fields = 'id,gamertag,display_name') {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetch() {
      setLoading(true)
      const { data: rows } = await supabase
        .from('players')
        .select(fields)
        .order('gamertag')
      if (!cancelled) {
        setData(rows || [])
        setLoading(false)
      }
    }
    fetch()
    return () => { cancelled = true }
  }, [fields])

  return { data, loading }
}
