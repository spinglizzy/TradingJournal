import { useNavigate } from 'react-router-dom'
import { flushSync } from 'react-dom'

export function useFlushNavigate() {
  const navigate = useNavigate()
  return (...args) => flushSync(() => navigate(...args))
}
