import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { BouncingDots } from './ui/BouncingDots.jsx'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <BouncingDots />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return children
}
