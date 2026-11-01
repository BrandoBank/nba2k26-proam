import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Gamertags with commissioner-level access (can add games, create series, edit)
const COMMISSIONERS = ['BrandoBank']

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [gamertag, setGamertag] = useState(null)
  const [gamertagLoading, setGamertagLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
      if (session) {
        fetchGamertag(session.user.id)
      } else {
        setGamertagLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        fetchGamertag(session.user.id)
      } else {
        setGamertag(null)
        setGamertagLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchGamertag(userId) {
    setGamertagLoading(true)
    const { data } = await supabase
      .from('players')
      .select('gamertag')
      .eq('user_id', userId)
      .maybeSingle()
    setGamertag(data?.gamertag || null)
    setGamertagLoading(false)
  }

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password })

  const signOut = () => supabase.auth.signOut()

  // isEditor is false during loading so we never flash editor UI prematurely.
  // Once gamertag resolves, it's true only for commissioners.
  const isEditor = !loading && !gamertagLoading && !!gamertag && COMMISSIONERS.includes(gamertag)

  return (
    <AuthContext.Provider value={{
      session,
      loading,
      signIn,
      signOut,
      gamertag,
      gamertagLoading,
      isEditor,
      isPlayer: !!session,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
