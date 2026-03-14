import { cn } from '../../lib/utils.js'
import { useEffect, useRef } from 'react'
import { createNoise3D } from 'simplex-noise'
import { motion } from 'framer-motion'

export function Vortex({
  children,
  className,
  containerClassName,
  particleCount = 700,
  rangeY = 100,
  baseHue = 96,
  baseSpeed = 0.0,
  rangeSpeed = 1.5,
  baseRadius = 1,
  rangeRadius = 2,
  backgroundColor = '#000000',
}) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const particlePropCount = 9
    const particlePropsLength = particleCount * particlePropCount
    const baseTTL = 50
    const rangeTTL = 150
    const rangeHue = 60
    const noiseSteps = 3
    const xOff = 0.00125
    const yOff = 0.00125
    const zOff = 0.0005
    const noise3D = createNoise3D()
    let particleProps = new Float32Array(particlePropsLength)
    let center = [0, 0]
    let tick = 0

    const TAU = 2 * Math.PI
    const rand = n => n * Math.random()
    const randRange = n => n - rand(2 * n)
    const fadeInOut = (t, m) => {
      const hm = 0.5 * m
      return Math.abs(((t + hm) % m) - hm) / hm
    }
    const lerp = (n1, n2, speed) => (1 - speed) * n1 + speed * n2

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      center[0] = 0.5 * canvas.width
      center[1] = 0.5 * canvas.height
    }

    const initParticle = i => {
      const x = rand(canvas.width)
      const y = center[1] + randRange(rangeY)
      const vx = 0
      const vy = 0
      const life = 0
      const ttl = baseTTL + rand(rangeTTL)
      const speed = baseSpeed + rand(rangeSpeed)
      const radius = baseRadius + rand(rangeRadius)
      const hue = baseHue + rand(rangeHue)
      particleProps.set([x, y, vx, vy, life, ttl, speed, radius, hue], i)
    }

    const initParticles = () => {
      tick = 0
      particleProps = new Float32Array(particlePropsLength)
      for (let i = 0; i < particlePropsLength; i += particlePropCount) {
        initParticle(i)
      }
    }

    const checkBounds = (x, y) =>
      x > canvas.width || x < 0 || y > canvas.height || y < 0

    const drawParticle = (x, y, x2, y2, life, ttl, radius, hue) => {
      ctx.save()
      ctx.lineCap = 'round'
      ctx.lineWidth = radius
      ctx.strokeStyle = `hsla(${hue},100%,60%,${fadeInOut(life, ttl)})`
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      ctx.closePath()
      ctx.restore()
    }

    const updateParticle = i => {
      const i2 = 1 + i, i3 = 2 + i, i4 = 3 + i, i5 = 4 + i
      const i6 = 5 + i, i7 = 6 + i, i8 = 7 + i, i9 = 8 + i

      const x = particleProps[i]
      const y = particleProps[i2]
      const n = noise3D(x * xOff, y * yOff, tick * zOff) * noiseSteps * TAU
      const vx = lerp(particleProps[i3], Math.cos(n), 0.5)
      const vy = lerp(particleProps[i4], Math.sin(n), 0.5)
      const life = particleProps[i5]
      const ttl = particleProps[i6]
      const speed = particleProps[i7]
      const x2 = x + vx * speed
      const y2 = y + vy * speed
      const radius = particleProps[i8]
      const hue = particleProps[i9]

      drawParticle(x, y, x2, y2, life, ttl, radius, hue)

      particleProps[i] = x2
      particleProps[i2] = y2
      particleProps[i3] = vx
      particleProps[i4] = vy
      particleProps[i5] = life + 1

      if (checkBounds(x, y) || life > ttl) initParticle(i)
    }

    const renderGlow = () => {
      ctx.save()
      ctx.filter = 'blur(8px) brightness(200%)'
      ctx.globalCompositeOperation = 'lighter'
      ctx.drawImage(canvas, 0, 0)
      ctx.restore()

      ctx.save()
      ctx.filter = 'blur(4px) brightness(200%)'
      ctx.globalCompositeOperation = 'lighter'
      ctx.drawImage(canvas, 0, 0)
      ctx.restore()
    }

    const renderToScreen = () => {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.drawImage(canvas, 0, 0)
      ctx.restore()
    }

    const draw = () => {
      tick++
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = backgroundColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < particlePropsLength; i += particlePropCount) {
        updateParticle(i)
      }
      renderGlow()
      renderToScreen()
      rafRef.current = requestAnimationFrame(draw)
    }

    const onResize = () => resize()

    resize()
    initParticles()
    draw()
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', onResize)
    }
  }, [particleCount, rangeY, baseHue, baseSpeed, rangeSpeed, baseRadius, rangeRadius, backgroundColor])

  return (
    <div className={cn('relative h-full w-full', containerClassName)}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        ref={containerRef}
        className="absolute h-full w-full inset-0 z-0 bg-transparent flex items-center justify-center"
      >
        <canvas ref={canvasRef} />
      </motion.div>
      <div className={cn('relative z-10', className)}>
        {children}
      </div>
    </div>
  )
}
