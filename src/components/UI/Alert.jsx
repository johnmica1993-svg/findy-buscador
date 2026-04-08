import { AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react'

const STYLES = {
  success: { bg: 'bg-green-50 border-green-200', text: 'text-green-800', Icon: CheckCircle },
  error: { bg: 'bg-red-50 border-red-200', text: 'text-red-800', Icon: XCircle },
  warning: { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-800', Icon: AlertTriangle },
  info: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-800', Icon: Info },
}

export default function Alert({ type = 'info', children, className = '' }) {
  const { bg, text, Icon } = STYLES[type]
  return (
    <div className={`flex items-start gap-3 p-4 rounded-lg border ${bg} ${className}`}>
      <Icon className={`${text} shrink-0 mt-0.5`} size={20} />
      <div className={`text-sm ${text}`}>{children}</div>
    </div>
  )
}
