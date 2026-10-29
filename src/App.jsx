import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Import from './pages/Import'
import { useAuth } from './hooks/useAuth'
import MobileNav from './components/MobileNav'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import NewSeries from './pages/NewSeries'
import SeriesDetail from './pages/SeriesDetail'
import GameEntry from './pages/GameEntry'
import LogMatchup from './pages/LogMatchup'
import Accolades from './pages/Accolades'
import SeriesChart from './pages/SeriesChart'
import RankingEditor from './pages/RankingEditor'
import History from './pages/History'
import Feed from './pages/Feed'

function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <div style={{ color: '#fff', padding: '2rem' }}>Loading...</div>
  if (!session) return <Navigate to="/login" replace />
  return children
}

import { useEffect } from 'react'
import { supabase } from './lib/supabase'

function RecoveryRedirect() {
  useEffect(() => {
    // When Supabase drops a recovery token in the hash, redirect to /login to handle it
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        window.location.replace('/login' + window.location.hash)
      }
    })
  }, [])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <RecoveryRedirect />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/leagues" element={<Dashboard />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/history" element={<History />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/login" element={<Login />} />
        <Route path="/series/new" element={<ProtectedRoute><NewSeries /></ProtectedRoute>} />
        <Route path="/series/:id" element={<SeriesDetail />} />
        <Route path="/series/:id/add-game" element={<GameEntry />} />
        <Route path="/series/:id/game/:gameId/matchup" element={<LogMatchup />} />
        <Route path="/series/:id/accolades" element={<Accolades />} />
        <Route path="/series/:id/chart" element={<SeriesChart />} />
        <Route path="/series/:id/rankings" element={<ProtectedRoute><RankingEditor /></ProtectedRoute>} />
        <Route path="/series/:id/game/:gameId/edit" element={<ProtectedRoute><GameEntry /></ProtectedRoute>} />
        <Route path="/import" element={<ProtectedRoute><Import /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <MobileNav />
    </BrowserRouter>
  )
}
