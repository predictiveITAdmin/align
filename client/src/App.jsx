import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ClientList from './pages/ClientList'
import ClientDetail from './pages/ClientDetail'
import Placeholder from './pages/Placeholder'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="/clients" element={<ClientList />} />
          <Route path="/clients/:id" element={<ClientDetail />} />
          <Route path="/assessments" element={<Placeholder />} />
          <Route path="/recommendations" element={<Placeholder />} />
          <Route path="/assets" element={<Placeholder />} />
          <Route path="/roadmap" element={<Placeholder />} />
          <Route path="/budget" element={<Placeholder />} />
          <Route path="/eos" element={<Placeholder />} />
          <Route path="/analytics" element={<Placeholder />} />
          <Route path="/reports" element={<Placeholder />} />
          <Route path="/settings" element={<Placeholder />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
