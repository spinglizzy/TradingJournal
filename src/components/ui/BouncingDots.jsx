import { motion } from 'framer-motion'
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils.js'

const bouncingDotsVariant = cva('flex gap-2 items-center justify-center', {
  variants: {
    messagePlacement: {
      bottom: 'flex-col',
      right:  'flex-row',
      left:   'flex-row-reverse',
    },
  },
  defaultVariants: {
    messagePlacement: 'bottom',
  },
})

export function BouncingDots({
  dots = 3,
  message,
  messagePlacement = 'bottom',
  className,
  ...props
}) {
  return (
    <div className={cn(bouncingDotsVariant({ messagePlacement }))}>
      <div className="flex gap-2 items-center justify-center">
        {Array(dots)
          .fill(undefined)
          .map((_, index) => (
            <motion.div
              key={index}
              className={cn('w-3 h-3 rounded-full bg-[#9aea62]', className)}
              animate={{ y: [0, -20, 0] }}
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
