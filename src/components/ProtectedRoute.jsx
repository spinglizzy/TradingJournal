import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { BouncingDots } from './ui/BouncingDots.jsx'
import { rememberPath } from '../lib/postLoginRedirect.js'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <BouncingDots />
      </div>
    )
  }

  if (!user) {
    // So logging back in returns them to the page they were kicked off.
    rememberPath()
    return <Navigate to="/login" replace />
  }
  return children
}
