import { motion } from 'framer-motion'
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils.js'

const wrapperVariants = cva('flex items-center justify-center', {
  variants: {
    messagePlacement: {
      bottom: 'flex-col gap-2',
      right:  'flex-row gap-2',
      left:   'flex-row-reverse gap-2',
    },
  },
  defaultVariants: { messagePlacement: 'bottom' },
})

// Per-size config: dot dimensions, bounce distance, gap between dots
const SIZE = {
  sm: { dot: 'w-1.5 h-1.5', bounce: -6,  gap: 'gap-1'   },
  md: { dot: 'w-3 h-3',     bounce: -20, gap: 'gap-2'   },
  lg: { dot: 'w-4 h-4',     bounce: -24, gap: 'gap-2.5' },
}

export function BouncingDots({
  dots             = 3,
  size             = 'md',
  message,
  messagePlacement = 'bottom',
  className,
  ...props
}) {
  const s = SIZE[size] ?? SIZE.md

  return (
    <div className={cn(wrapperVariants({ messagePlacement }))}>
      <div className={cn('flex items-center justify-center', s.gap)}>
        {Array(dots)
          .fill(undefined)
          .map((_, index) => (
            <motion.div
              key={index}
              className={cn(s.dot, 'rounded-full bg-[#9aea62]', className)}
              animate={{ y: [0, s.bounce, 0] }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                delay: index * 0.2,
                ease: 'easeInOut',
              }}
              {...props}
            />
          ))}
      </div>
      {message && <div className="text-sm text-gray-400">{message}</div>}
    </div>
  )
}
