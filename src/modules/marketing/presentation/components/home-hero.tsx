"use client"

import { motion, useMotionValue, useTransform } from "framer-motion"
import { Sparkles, ArrowRight, CheckCircle2, ListOrdered, Film } from "lucide-react"
import Link from "next/link"
import { Button } from "@/ui/components/button"
import { useAccessibility } from "@/shared/components/accessibility-provider"
import { useEffect, useState, useRef } from "react"

const trustBadges = [
  "No credit card required",
  "Tamil & English support",
  "Formatted screenplay drafts",
]

function HeroBrandMark() {
  return (
    <span className="relative flex h-14 w-14 items-center justify-center sm:h-16 sm:w-16">
      <span className="absolute inset-0 scale-150 rounded-full bg-cinematic-orange/30 blur-xl" />
      <span className="absolute inset-0 rounded-full border border-cinematic-orange/30 bg-cinematic-orange/10" />
      <span className="absolute inset-2 rounded-full bg-gradient-to-br from-cinematic-orange to-cinematic-blue opacity-90" />
      <Film className="relative z-10 h-7 w-7 text-black sm:h-8 sm:w-8" aria-hidden />
    </span>
  )
}

// Bilingual headline: full words only (no typewriter / fake cursor).
function BilingualHeadline({ reducedMotion }: { reducedMotion: boolean }) {
  const terms = [
    { tamil: "கதை", english: "Story" },
    { tamil: "திரைக்கதை", english: "Screenplay" },
    { tamil: "வசனம்", english: "Dialogue" },
  ]

  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (reducedMotion) return
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % terms.length)
    }, 3500)
    return () => window.clearInterval(id)
  }, [reducedMotion, terms.length])

  const t = terms[reducedMotion ? 0 : index]

  return (
    <div className="flex flex-wrap items-end justify-center gap-x-3 gap-y-6 sm:items-center sm:gap-6">
      <div className="relative pb-5 sm:pb-0" lang="ta">
        <motion.span
          key={t.tamil}
          initial={reducedMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="block text-xl font-bold bg-gradient-to-r from-cinematic-orange via-amber-400 to-cinematic-orange bg-[length:200%_auto] bg-clip-text text-transparent animate-gradient-x xs:text-2xl sm:text-3xl lg:text-4xl"
        >
          {t.tamil}
        </motion.span>
        <span className="absolute -bottom-4 left-0 text-[10px] text-cinematic-orange/60 uppercase tracking-wider">
          தமிழ்
        </span>
      </div>

      <div
        className="hidden h-8 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent sm:block sm:h-10"
        aria-hidden
      />

      <div className="relative pb-5 sm:pb-0" lang="en">
        <motion.span
          key={t.english}
          initial={reducedMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="block text-xl font-bold bg-gradient-to-r from-cinematic-blue via-cyan-400 to-cinematic-blue bg-[length:200%_auto] bg-clip-text text-transparent animate-gradient-x xs:text-2xl sm:text-3xl lg:text-4xl"
        >
          {t.english}
        </motion.span>
        <span className="absolute -bottom-4 left-0 text-[10px] text-cinematic-blue/60 uppercase tracking-wider">
          English
        </span>
      </div>
    </div>
  )
}

// Screenplay preview sample, static with no sequential typing or caret.
function ScreenplayMockup({ reducedMotion }: { reducedMotion: boolean }) {
  const lines = [
    { text: "INT. CAFE - EVENING", type: "heading", lang: "en" },
    { text: "மழை பெய்துகொண்டிருக்கிறது. அருண் ஜன்னல் அருகே நிற்கிறான்.", type: "action", lang: "ta" },
    { text: "Rain falls gently. Arun stands by the window, lost in thought.", type: "action", lang: "en" },
    { text: "ARUN", type: "character", lang: "en" },
    { text: "(வருத்தத்துடன்)", type: "paren", lang: "ta" },
    { text: "எனக்கு இன்னும் நேரம் வேண்டும்...", type: "dialogue", lang: "ta" },
  ]

  return (
    <motion.div
      {...(reducedMotion
        ? { initial: false }
        : {
            initial: { opacity: 0, y: 20, rotateX: 10 },
            animate: { opacity: 1, y: 0, rotateX: 0 },
            transition: { duration: 0.8, delay: 0.4 },
          })}
      className="relative w-full max-w-md mx-auto perspective-1000"
    >
      {/* Glow effect */}
      <div className="absolute -inset-1 bg-gradient-to-r from-cinematic-orange/20 to-cinematic-blue/20 rounded-xl blur-xl opacity-50" />
      
      {/* Card */}
      <div className="relative bg-[#0d0d0d] rounded-xl border border-white/10 overflow-hidden shadow-2xl">
        {/* Header bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
          </div>
          <span className="ml-3 text-xs text-muted-foreground font-mono">screenplay.scene</span>
        </div>

        {/* Content */}
        <div className="min-h-[160px] space-y-2 p-5 font-mono text-sm">
          {lines.map((line, index) => {
            const lineClass = `${
              line.type === "heading"
                ? "font-bold uppercase text-cinematic-orange"
                : line.type === "character"
                  ? "mt-3 text-center text-cinematic-blue"
                  : line.type === "paren"
                    ? "text-center text-xs italic text-white/50"
                    : line.type === "dialogue"
                      ? "ml-8 border-l-2 border-cinematic-orange/30 pl-3 text-white"
                      : "text-white/70"
            }`
            return (
              <div key={index} className={lineClass} lang={line.lang === "ta" ? "ta" : "en"}>
                {line.text}
              </div>
            )
          })}
        </div>

        {/* Bottom gradient fade */}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#0d0d0d] to-transparent" />
      </div>

      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-cinematic-orange px-3 py-1 text-xs font-bold text-black">
        AI Generated
      </div>
    </motion.div>
  )
}

// Film strip decoration
function FilmStrip({ position }: { position: "top" | "bottom" }) {
  return (
    <div className={`absolute left-0 right-0 h-3 flex ${position === "top" ? "top-0" : "bottom-0"}`}>
      {Array.from({ length: 40 }).map((_, i) => (
        <div key={i} className="flex-1 flex justify-center">
          <div className="w-1.5 h-full bg-white/10 rounded-sm" />
        </div>
      ))}
    </div>
  )
}

export function HomeHero() {
  const { prefersReducedMotion } = useAccessibility()
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseMove = (e: React.MouseEvent) => {
    if (prefersReducedMotion || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    mouseX.set((e.clientX - centerX) / 50)
    mouseY.set((e.clientY - centerY) / 50)
  }

  const rotateX = useTransform(mouseY, [-10, 10], [3, -3])
  const rotateY = useTransform(mouseX, [-10, 10], [-3, 3])

  return (
    <section
      ref={containerRef}
      aria-label="Hero"
      className="relative pt-16 pb-12 px-4 sm:px-6 lg:px-8 overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      {/* Film strips */}
      <FilmStrip position="top" />
      <FilmStrip position="bottom" />

      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        {prefersReducedMotion ? (
          <>
            <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-cinematic-orange/10 rounded-full blur-3xl opacity-[0.08]" />
            <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-cinematic-blue/10 rounded-full blur-3xl opacity-[0.08]" />
          </>
        ) : (
          <>
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.05, 0.1, 0.05] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-cinematic-orange/10 rounded-full blur-3xl"
            />
            <motion.div
              animate={{ scale: [1, 1.1, 1], opacity: [0.05, 0.12, 0.05] }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-cinematic-blue/10 rounded-full blur-3xl"
            />
          </>
        )}
      </div>

      <div className="relative max-w-4xl mx-auto">
        <div className="flex justify-center">
          <div className="w-full text-center">
            {/* Badges inline */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex flex-wrap items-center justify-center gap-3 mb-5"
            >
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cinematic-orange/10 border border-cinematic-orange/20 text-cinematic-orange text-xs font-semibold">
                <Sparkles className="w-3 h-3" />
                India&apos;s AI Screenplay Platform
              </span>
              <span className="text-xs text-muted-foreground">
                Built for Tamil &amp; English cinema
              </span>
            </motion.div>

            {/* H1 Brand */}
            <motion.h1
              initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
              animate={prefersReducedMotion ? false : { opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mb-4 font-display text-3xl font-bold leading-[1.08] tracking-tight xs:text-4xl sm:text-5xl sm:leading-[1.05] lg:text-6xl"
              style={
                prefersReducedMotion
                  ? undefined
                  : { rotateX, rotateY, transformStyle: "preserve-3d" }
              }
            >
              <span className="inline-flex items-center gap-3">
                {prefersReducedMotion ? (
                  <HeroBrandMark />
                ) : (
                  <motion.span
                    className="relative"
                    animate={{ y: [0, -8, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <HeroBrandMark />
                  </motion.span>
                )}
                <span className="bg-gradient-to-r from-white via-white to-white/80 bg-clip-text text-transparent">
                  Writers
                </span>
                <span className="bg-gradient-to-r from-cinematic-orange to-cinematic-orange/70 bg-clip-text text-transparent">
                  Block
                </span>
              </span>
            </motion.h1>

            {/* Bilingual Typewriter: tighter spacing */}
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={prefersReducedMotion ? false : { opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mb-6 flex min-h-[5.5rem] items-center justify-center sm:min-h-16"
            >
              <BilingualHeadline reducedMotion={prefersReducedMotion} />
            </motion.div>

            {/* Short punchy description */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="mx-auto mb-6 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-[17px] sm:leading-[1.65]"
            >
              Turn a scene idea into a formatted{" "}
              <span className="text-cinematic-orange">Tamil</span> or{" "}
              <span className="text-cinematic-blue">English</span> screenplay draft in minutes.
              Polish dialogue, continue scenes, and export when you are ready.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="flex flex-col sm:flex-row gap-3 justify-center mb-6"
            >
              <Button
                asChild
                  size="lg"
                  className="bg-cinematic-orange text-black font-bold hover:bg-cinematic-orange/90 transition-all duration-300 h-12 px-8 text-base group w-full sm:w-auto shadow-lg shadow-cinematic-orange/25 relative overflow-hidden"
                >
                <Link href="/signup?next=/editor">
                  {!prefersReducedMotion && (
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -skew-x-12"
                      animate={{ x: ["-200%", "200%"] }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center">
                    Start Writing Free
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </span>
                </Link>
              </Button>
              <Button
                asChild
                  size="lg"
                  variant="outline"
                  className="border-white/20 hover:bg-white/5 hover:border-white/40 h-12 px-8 text-base text-white w-full sm:w-auto group"
                >
                <Link href="#how-it-works">
                  <ListOrdered className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" aria-hidden />
                  See how it works
                </Link>
              </Button>
            </motion.div>

            {/* Trust badges */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
              className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
            >
              {trustBadges.map((badge) => (
                <span key={badge} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cinematic-orange/70" />
                  {badge}
                </span>
              ))}
            </motion.div>
          </div>
        </div>
      </div>

      {/* CSS for gradient animation */}
      <style jsx>{`
        @keyframes gradient-x {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient-x {
          animation: gradient-x 3s ease infinite;
          background-size: 200% auto;
        }
      `}</style>
    </section>
  )
}
