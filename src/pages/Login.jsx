import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TrendingUp, ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { Particles } from '../components/ui/Particles.jsx'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen w-full bg-gray-950 overflow-hidden">
      {/* Particles background */}
      <Particles
        color="#9aea62"
        quantity={120}
        ease={20}
        staticity={40}
        size={0.5}
        className="absolute inset-0"
      />

      {/* Radial glow accents */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(154,234,98,0.06) 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(154,234,98,0.04) 0%, transparent 70%)' }}
        />
      </div>

      {/* Back to home */}
      <Link
        to="/"
        className="absolute top-6 left-6 flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors z-10"
      >
        <ArrowLeft className="w-4 h-4" />
        Home
      </Link>

      {/* Centered form */}
      <div className="relative flex min-h-screen items-center justify-center px-4 z-10">
        <div className="w-full max-w-sm space-y-8">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shadow-lg flex-shrink-0"
              style={{ backgroundColor: '#9aea62', boxShadow: '0 4px 16px rgba(154,234,98,0.3)' }}
            >
              <TrendingUp className="w-4 h-4" style={{ color: '#0a1a0a' }} />
            </div>
            <span className="font-bold text-white text-lg tracking-tight">TradeJournal</span>
          </div>

          {/* Heading */}
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-white tracking-tight">Welcome back</h1>
            <p className="text-gray-400 text-sm">Sign in to your trading journal</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                className="w-full rounded-lg border border-gray-800 bg-gray-900/80 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-[#9aea62] focus:outline-none focus:ring-1 focus:ring-[#9aea62] transition-colors backdrop-blur-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full rounded-lg border border-gray-800 bg-gray-900/80 px-4 py-2.5 pr-10 text-sm text-white placeholder-gray-500 focus:border-[#9aea62] focus:outline-none focus:ring-1 focus:ring-[#9aea62] transition-colors backdrop-blur-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-gray-950 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#9aea62' }}
              onMouseEnter={e => { if (!loading) e.target.style.backgroundColor = '#7fd64a' }}
              onMouseLeave={e => { e.target.style.backgroundColor = '#9aea62' }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          {/* Sign up link */}
          <p className="text-center text-sm text-gray-500">
            Don't have an account?{' '}
            <Link to="/signup" className="text-[#9aea62] hover:text-[#b5f08a] transition-colors font-medium">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
