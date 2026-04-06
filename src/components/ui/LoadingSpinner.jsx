import { BouncingDots } from './BouncingDots.jsx'

export default function LoadingSpinner({ size = 'md', className = '' }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <BouncingDots size={size} />
    </div>
  )
}
