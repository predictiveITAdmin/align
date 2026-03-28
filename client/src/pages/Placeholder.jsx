import { useLocation } from 'react-router-dom'
import { Construction } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Card from '../components/Card'

const titles = {
  '/assessments': 'Standards & Assessments',
  '/recommendations': 'Recommendations',
  '/assets': 'Assets',
  '/roadmap': 'Technology Roadmap',
  '/budget': 'Budget & Forecasting',
  '/eos': 'EOS Planning',
  '/analytics': 'Analytics',
  '/reports': 'Report Builder',
  '/settings': 'Settings',
}

export default function Placeholder() {
  const { pathname } = useLocation()
  const title = titles[pathname] || 'Page'

  return (
    <div>
      <PageHeader title={title} />
      <Card className="py-20 text-center">
        <Construction size={48} className="mx-auto mb-4 text-gray-300" />
        <p className="text-lg font-medium text-gray-500">
          {title} — Coming Soon
        </p>
        <p className="text-sm text-gray-400 mt-1">
          This module is under development
        </p>
      </Card>
    </div>
  )
}
