const VARIANTS = {
  primary: 'bg-blue-800 hover:bg-blue-900 text-white shadow-sm',
  success: 'bg-green-600 hover:bg-green-700 text-white shadow-sm',
  danger: 'bg-red-600 hover:bg-red-700 text-white shadow-sm',
  secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300',
  ghost: 'hover:bg-gray-100 text-gray-600',
}

export default function Button({ variant = 'primary', children, className = '', disabled, ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
