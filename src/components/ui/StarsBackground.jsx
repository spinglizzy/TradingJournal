import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '../../lib/utils.js'

export function StarsBackground({
  starDensity       = 0.00015,
  allStarsTwinkle   = true,
  twinkleProbability = 0.7,
  minTwinkleSpeed   = 0.5,
  maxTwinkleSpeed   = 1,
  starColor         = '255, 255, 255',
  className,
}) {
  const [stars, setStars] = useState([])
  const canvasRef = useRef(null)

  const generateStars = useCallback(
    (width, height) => {
      const numStars = Math.floor(width * height * starDensity)
      return Array.from({ length: numStars }, () => {
        const shouldTwinkle = allStarsTwinkle || Math.random() < twinkleProbability
        return {
          x:            Math.random() * width,
          y:            Math.random() * height,
          radius:       Math.random() * 0.05 + 0.5,
          opacity:      Math.random() * 0.5 + 0.5,
          twinkleSpeed: shouldTwinkle
            ? minTwinkleSpeed + Math.random() * (maxTwinkleSpeed - minTwinkleSpeed)
            : null,
        }
      })
    },
    [starDensity, allStarsTwinkle, twinkleProbability, minTwinkleSpeed, maxTwinkleSpeed],
  )

  // Generate stars on mount and on resize
  useEffect(() => {
    const updateStars = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const { width, height } = canvas.getBoundingClientRect()
      canvas.width  = width
      canvas.height = height
      setStars(generateStars(width, height))
    }

    updateStars()

    const observer = new ResizeObserver(updateStars)
    if (canvasRef.current) observer.observe(canvasRef.current)
    return () => {
      if (canvasRef.current) observer.unobserve(canvasRef.current)
    }
  }, [generateStars])

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let rafId

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      stars.forEach(star => {
        ctx.beginPath()
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${starColor}, ${star.opacity})`
        ctx.fill()

        if (star.twinkleSpeed !== null) {
          star.opacity =
            0.5 + Math.abs(Math.sin((Date.now() * 0.001) / star.twinkleSpeed) * 0.5)
        }
      })
      rafId = requestAnimationFrame(render)
    }

    render()
    return () => cancelAnimationFrame(rafId)
  }, [stars])

  return (
    <canvas
      ref={canvasRef}
      className={cn('h-full w-full absolute inset-0', className)}
    />
  )
}
