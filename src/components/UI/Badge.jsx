const COLORS = {
  green: 'bg-green-100 text-green-800 border-green-200',
  red: 'bg-red-100 text-red-800 border-red-200',
  yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  blue: 'bg-blue-100 text-blue-800 border-blue-200',
  gray: 'bg-gray-100 text-gray-700 border-gray-200',
  orange: 'bg-orange-100 text-orange-800 border-orange-200',
}

export default function Badge({ color = 'gray', children, className = '' }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${COLORS[color] || COLORS.gray} ${className}`}>
      {children}
    </span>
  )
}
