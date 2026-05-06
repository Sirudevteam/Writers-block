"use client"

import { motion } from "framer-motion"
import { useAccessibility } from "./accessibility-provider"
import { useMotionPreference } from "@/shared/hooks/use-motion-preference"

interface SkeletonProps {
  className?: string
  count?: number
}

function Skeleton({ className = "", count = 1 }: SkeletonProps) {
  const { prefersReducedMotion } = useAccessibility()
  const { shouldReduceMotion } = useMotionPreference()

  const disableAnimation = prefersReducedMotion || shouldReduceMotion

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          className={`bg-white/10 rounded-xl ${className}`}
          animate={disableAnimation ? {} : { opacity: [0.5, 0.8, 0.5] }}
          transition={{
            duration: disableAnimation ? 0 : 1.5,
            repeat: disableAnimation ? 0 : Infinity,
            delay: i * 0.1
          }}
        />
      ))}
    </>
  )
}

export function CardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  )
}
