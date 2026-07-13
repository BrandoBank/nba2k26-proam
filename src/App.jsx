import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
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

function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <div style={{ color: '#fff', padding: '2rem' }}>Loading...</div>
  if (!session) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/leagues" element={<Dashboard />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/history" element={<History />} />
        <Route path="/login" element={<Login />} />
        <Route path="/series/new" element={<ProtectedRoute><NewSeries /></ProtectedRoute>} />
        <Route path="/series/:id" element={<SeriesDetail />} />
        <Route path="/series/:id/add-game" element={<ProtectedRoute><GameEntry /></ProtectedRoute>} />
        <Route path="/series/:id/game/:gameId/matchup" element={<LogMatchup />} />
        <Route path="/series/:id/accolades" element={<Accolades />} />
        <Route path="/series/:id/chart" element={<SeriesChart />} />
        <Route path="/series/:id/rankings" element={<ProtectedRoute><RankingEditor /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
