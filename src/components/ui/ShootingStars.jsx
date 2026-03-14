import { useEffect, useState, useRef, useId } from 'react'
import { cn } from '../../lib/utils.js'

const getRandomStartPoint = () => {
  const side = Math.floor(Math.random() * 4)
  const offset = Math.random() * window.innerWidth

  switch (side) {
    case 0: return { x: offset, y: 0, angle: 45 }
    case 1: return { x: window.innerWidth, y: offset, angle: 135 }
    case 2: return { x: offset, y: window.innerHeight, angle: 225 }
    case 3: return { x: 0, y: offset, angle: 315 }
    default: return { x: 0, y: 0, angle: 45 }
  }
}

export function ShootingStars({
  minSpeed = 10,
  maxSpeed = 30,
  minDelay = 1200,
  maxDelay = 4200,
  starColor = '#9E00FF',
  trailColor = '#2EB9DF',
  starWidth = 10,
  starHeight = 1,
  className,
}) {
  const [star, setStar] = useState(null)
  const svgRef = useRef(null)
  const uid = useId().replace(/:/g, '')
  const gradientId = `sg-${uid}`

  useEffect(() => {
    let timeout
    const createStar = () => {
      const { x, y, angle } = getRandomStartPoint()
      setStar({
        id: Date.now(),
        x,
        y,
        angle,
        scale: 1,
        speed: Math.random() * (maxSpeed - minSpeed) + minSpeed,
        distance: 0,
      })
      const randomDelay = Math.random() * (maxDelay - minDelay) + minDelay
      timeout = setTimeout(createStar, randomDelay)
    }
    createStar()
    return () => clearTimeout(timeout)
  }, [minSpeed, maxSpeed, minDelay, maxDelay])

  useEffect(() => {
    const moveStar = () => {
      if (star) {
        setStar(prev => {
          if (!prev) return null
          const newX = prev.x + prev.speed * Math.cos((prev.angle * Math.PI) / 180)
          const newY = prev.y + prev.speed * Math.sin((prev.angle * Math.PI) / 180)
          const newDistance = prev.distance + prev.speed
          const newScale = 1 + newDistance / 100
          if (
            newX < -20 ||
            newX > window.innerWidth + 20 ||
            newY < -20 ||
            newY > window.innerHeight + 20
          ) return null
          return { ...prev, x: newX, y: newY, distance: newDistance, scale: newScale }
        })
      }
    }
    const frame = requestAnimationFrame(moveStar)
    return () => cancelAnimationFrame(frame)
  }, [star])

  return (
    <svg ref={svgRef} className={cn('w-full h-full absolute inset-0', className)}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: trailColor, stopOpacity: 0 }} />
          <stop offset="100%" style={{ stopColor: starColor, stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      {star && (
        <rect
          key={star.id}
          x={star.x}
          y={star.y}
          width={starWidth * star.scale}
          height={starHeight}
          fill={`url(#${gradientId})`}
          transform={`rotate(${star.angle}, ${star.x + (starWidth * star.scale) / 2}, ${star.y + starHeight / 2})`}
        />
      )}
    </svg>
  )
}
