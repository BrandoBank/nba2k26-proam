import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Home from './pages/Home'
import Login from './pages/Login'

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
        {/* Phase 2+ routes — scaffolded here, pages coming next */}
        <Route path="/series/:id" element={<div style={{color:'#fff',padding:'2rem'}}>Series view — coming in Phase 2</div>} />
        <Route path="/series/new" element={
          <ProtectedRoute>
            <div style={{color:'#fff',padding:'2rem'}}>New series form — coming in Phase 2</div>
          </ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
