import { cn } from '../lib/cn'

const severityConfig = {
  aligned:          { label: 'Aligned',          bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500' },
  marginal:         { label: 'Marginal',         bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  vulnerable:       { label: 'Vulnerable',       bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  highly_vulnerable:{ label: 'Highly Vulnerable', bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500' },
}

export default function AlignmentBadge({ severity, size = 'sm' }) {
  const config = severityConfig[severity] || severityConfig.marginal
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        config.bg,
        config.text,
        size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', config.dot)} />
      {config.label}
    </span>
  )
}

export function AlignmentScore({ score, size = 'md' }) {
  const getColor = (s) => {
    if (s == null) return 'text-gray-400'
    if (s >= 80) return 'text-green-600'
    if (s >= 60) return 'text-yellow-600'
    if (s >= 40) return 'text-orange-600'
    return 'text-red-600'
  }

  return (
    <span
      className={cn(
        'font-bold',
        getColor(score),
        size === 'lg' ? 'text-4xl' : size === 'md' ? 'text-2xl' : 'text-lg'
      )}
    >
      {score != null ? `${score}%` : '—'}
    </span>
  )
}
