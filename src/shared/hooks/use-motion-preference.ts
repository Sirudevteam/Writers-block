"use client"

import { useEffect, useState } from "react"

interface MotionPreference {
  prefersReducedMotion: boolean
  isLowPowerDevice: boolean
  shouldReduceMotion: boolean
}

export function useMotionPreference(): MotionPreference {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [isLowPowerDevice, setIsLowPowerDevice] = useState(false)

  useEffect(() => {
    // Check for reduced motion preference
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    setPrefersReducedMotion(mediaQuery.matches)

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
    mediaQuery.addEventListener("change", handler)

    // Detect low-power devices
    // Check hardware concurrency
    const cpuCores = navigator.hardwareConcurrency || 4
    
    // Check for mobile devices with lower specs
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    )
    
    // Check for older devices
    const isOlderDevice = /Android [1-9]|iPhone OS [1-9]|Windows Phone/i.test(
      navigator.userAgent
    )
    
    // Check for low memory (if available)
    const deviceMemory = (navigator as any).deviceMemory || 4
    
    const lowPower = 
      cpuCores <= 4 || 
      (isMobile && (isOlderDevice || deviceMemory < 4))
    
    setIsLowPowerDevice(lowPower)

    return () => mediaQuery.removeEventListener("change", handler)
  }, [])

  return {
    prefersReducedMotion,
    isLowPowerDevice,
    shouldReduceMotion: prefersReducedMotion || isLowPowerDevice,
  }
}
