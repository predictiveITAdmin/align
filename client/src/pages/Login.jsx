import { useSearchParams } from 'react-router-dom'

const errors = {
  auth_failed: 'Authentication failed. Please try again.',
  not_authorized: 'Your account is not authorized to access Align.',
  account_disabled: 'Your account has been disabled.',
  token_failed: 'Login failed. Please try again.',
  no_email: 'Could not retrieve your email address.',
}

export default function Login() {
  const [params] = useSearchParams()
  const error = params.get('error')

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

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">
              <p className="text-sm text-red-700">
                {errors[error] || 'An unknown error occurred.'}
              </p>
            </div>
          )}

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

          <p className="text-xs text-gray-400 text-center mt-6">
            Access is limited to authorized predictiveIT staff
          </p>
        </div>
      </div>
    </div>
  )
}
