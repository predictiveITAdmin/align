import Card from './Card'
import { cn } from '../lib/cn'

export default function StatCard({ label, value, icon: Icon, trend, color = 'primary' }) {
  const colorMap = {
    primary: 'bg-primary-50 text-primary-600',
    green:   'bg-green-50 text-green-600',
    yellow:  'bg-yellow-50 text-yellow-600',
    orange:  'bg-orange-50 text-orange-600',
    red:     'bg-red-50 text-red-600',
    gray:    'bg-gray-50 text-gray-600',
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {trend && (
            <p className={cn('text-xs mt-1', trend > 0 ? 'text-green-600' : 'text-red-600')}>
              {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}% from last period
            </p>
          )}
        </div>
        {Icon && (
          <div className={cn('p-2.5 rounded-lg', colorMap[color])}>
            <Icon size={22} />
          </div>
        )}
      </div>
    </Card>
  )
}
