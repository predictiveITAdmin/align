import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { setAutotaskWebUrl } from './lib/autotask'
import { api } from './lib/api'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ClientList from './pages/ClientList'
import ClientDetail from './pages/ClientDetail'
import Standards from './pages/Standards'
import TemplateDetail from './pages/TemplateDetail'
import Assessments from './pages/Assessments'
import AssessmentDetail from './pages/AssessmentDetail'
import Assets from './pages/Assets'
import Recommendations from './pages/Recommendations'
import RecommendationDetail from './pages/RecommendationDetail'
import Placeholder from './pages/Placeholder'
import Settings from './pages/Settings'
import AcceptInvite from './pages/AcceptInvite'
import SaasLicenses from './pages/SaasLicenses'
import ClientMapping from './pages/ClientMapping'
import Budget from './pages/Budget'
import ClientBudget from './pages/ClientBudget'
import Roadmap from './pages/Roadmap'
import Software from './pages/Software'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return children
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="/clients" element={<ClientList />} />
        <Route path="/clients/:id" element={<ClientDetail />} />
        <Route path="/standards" element={<Standards />} />
        <Route path="/standards/:id" element={<TemplateDetail />} />
        <Route path="/assessments" element={<Assessments />} />
        <Route path="/assessments/:id" element={<AssessmentDetail />} />
        <Route path="/recommendations" element={<Recommendations />} />
        <Route path="/recommendations/:id" element={<RecommendationDetail />} />
        <Route path="/assets" element={<Assets />} />
        <Route path="/saas-licenses" element={<SaasLicenses />} />
        <Route path="/roadmap" element={<Roadmap />} />
        <Route path="/budget" element={<Budget />} />
        <Route path="/budget/:clientId" element={<ClientBudget />} />
        <Route path="/software" element={<Software />} />
        <Route path="/eos" element={<Placeholder />} />
        <Route path="/analytics" element={<Placeholder />} />
        <Route path="/reports" element={<Placeholder />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/client-mapping" element={<ClientMapping />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  useEffect(() => {
    api.get('/config').then(data => {
      if (data.autotask_web_url) setAutotaskWebUrl(data.autotask_web_url)
    }).catch(() => {}) // non-fatal
  }, [])

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
