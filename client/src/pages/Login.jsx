import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'

const errors = {
  auth_failed: 'Authentication failed. Please try again.',
  not_authorized: 'Your account is not authorized to access Align.',
  account_disabled: 'Your account has been disabled.',
  token_failed: 'Login failed. Please try again.',
  no_email: 'Could not retrieve your email address.',
  ms_not_configured: 'Microsoft 365 login is not configured.',
  google_not_configured: 'Google login is not configured.',
}

export default function Login() {
  const [params] = useSearchParams()
  const error = params.get('error')
  const [providers, setProviders] = useState({ microsoft: false, google: false, local: true })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showLocal, setShowLocal] = useState(false)

  useEffect(() => {
    api.get('/auth/providers').then(setProviders).catch(() => {})
  }, [])

  async function handleLocalLogin(e) {
    e.preventDefault()
    setLocalError('')
    setLoading(true)
    try {
      await api.post('/auth/login', { email, password })
      window.location.href = '/'
    } catch (err) {
      setLocalError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#042a4a] to-[#076aac] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-baseline gap-0.5 mb-2">
            <span className="font-semibold text-3xl tracking-tight text-white">predictive</span>
            <span className="font-bold text-3xl tracking-tight text-[#95ca5c]">IT</span>
          </div>
          <div className="text-primary-200 text-lg font-medium tracking-wider uppercase">
            Align
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
            Sign in to Align
          </h2>
          <p className="text-sm text-gray-500 text-center mb-6">
            Strategic IT Alignment Platform
          </p>

          {(error || localError) && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">
              <p className="text-sm text-red-700">
                {localError || errors[error] || 'An unknown error occurred.'}
              </p>
            </div>
          )}

          {/* SSO Buttons */}
          <div className="space-y-3">
            {providers.microsoft && (
              <a
                href="/api/auth/microsoft"
                className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-[#076aac] text-white rounded-lg font-medium hover:bg-[#065a93] transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                  <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                </svg>
                Sign in with Microsoft 365
              </a>
            )}

            {providers.google && (
              <a
                href="/api/auth/google"
                className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-white text-gray-700 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Sign in with Google
              </a>
            )}
          </div>

          {/* Divider */}
          {(providers.microsoft || providers.google) && providers.local && (
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <button
                  onClick={() => setShowLocal(!showLocal)}
                  className="bg-white px-3 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  {showLocal ? 'Hide' : 'or sign in with email'}
                </button>
              </div>
            </div>
          )}

          {/* Local Login Form */}
          {(showLocal || (!providers.microsoft && !providers.google)) && (
            <form onSubmit={handleLocalLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          )}

          <p className="text-xs text-gray-400 text-center mt-6">
            Access is limited to authorized users
          </p>
        </div>
      </div>
    </div>
  )
}
