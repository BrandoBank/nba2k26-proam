import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useAuth() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [gamertag, setGamertag] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
      if (session) fetchGamertag(session.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchGamertag(session.user.id)
      else setGamertag(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchGamertag(userId) {
    const { data } = await supabase
      .from('players')
      .select('gamertag')
      .eq('user_id', userId)
      .maybeSingle()
    setGamertag(data?.gamertag || null)
  }

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password })

  const signOut = () => supabase.auth.signOut()

  return { session, loading, signIn, signOut, isEditor: !!session, gamertag }
}
