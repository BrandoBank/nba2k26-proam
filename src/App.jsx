import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Home from './pages/Home'
import Login from './pages/Login'
import NewSeries from './pages/NewSeries'
import SeriesDetail from './pages/SeriesDetail'
import GameEntry from './pages/GameEntry'

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
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/series/new" element={<ProtectedRoute><NewSeries /></ProtectedRoute>} />
        <Route path="/series/:id" element={<SeriesDetail />} />
        <Route path="/series/:id/add-game" element={<ProtectedRoute><GameEntry /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
