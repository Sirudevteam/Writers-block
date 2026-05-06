"use client"

import { motion, PanInfo } from "framer-motion"
import { Quote, ChevronLeft, ChevronRight } from "lucide-react"
import { useState, useEffect, useCallback } from "react"

const workflows = [
  {
    quote:
      "Start with a short scene idea and get a formatted Tamil or English screenplay draft you can revise immediately.",
    title: "Scene drafting",
    role: "First draft workflow",
    detail: "Tamil & English",
    avatar: "S",
    color: "from-cinematic-orange to-amber-500",
  },
  {
    quote:
      "Generate alternate versions of a scene before committing to one emotional tone, beat order, or dialogue style.",
    title: "Scene variations",
    role: "Preproduction workflow",
    detail: "Draft exploration",
    avatar: "V",
    color: "from-cinematic-blue to-cyan-400",
  },
  {
    quote:
      "Study structure and formatting by comparing your own scenes with references and export ready screenplay output.",
    title: "Learning craft",
    role: "Student workflow",
    detail: "Format practice",
    avatar: "L",
    color: "from-purple-500 to-pink-400",
  },
  {
    quote:
      "Paste rough dialogue and try sharper, more emotional, or more grounded rewrites while keeping the scene moving.",
    title: "Dialogue polish",
    role: "Rewrite workflow",
    detail: "Character voice",
    avatar: "D",
    color: "from-green-500 to-emerald-400",
  },
  {
    quote:
      "Use Tamil and English support across drafting, references, and exports without switching between separate tools.",
    title: "Bilingual writing",
    role: "Language workflow",
    detail: "Tamil & English",
    avatar: "T",
    color: "from-pink-500 to-rose-400",
  },
]

export function HomeTestimonialsSection() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % workflows.length)
  }, [])

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + workflows.length) % workflows.length)
  }, [])

  useEffect(() => {
    if (isPaused) return
    const interval = setInterval(nextSlide, 6000)
    return () => clearInterval(interval)
  }, [isPaused, nextSlide])

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 50
    if (info.offset.x > threshold) {
      prevSlide()
    } else if (info.offset.x < -threshold) {
      nextSlide()
    }
  }

  const getVisibleWorkflows = () => {
    const visible = []
    for (let i = 0; i < 3; i++) {
      const index = (currentIndex + i) % workflows.length
      visible.push({ ...workflows[index], position: i })
    }
    return visible
  }

  return (
    <section
      aria-label="Workflow benefits"
      className="py-24 px-4 sm:px-6 lg:px-8 bg-white/[0.015] overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-block text-xs font-semibold tracking-widest uppercase text-cinematic-orange mb-3 px-4 py-1.5 rounded-full bg-cinematic-orange/10 border border-cinematic-orange/20"
          >
            Workflows
          </motion.span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-display text-white mb-4">
            Built around real{" "}
            <span className="bg-gradient-to-r from-cinematic-orange to-amber-500 bg-clip-text text-transparent">
              writing moments
            </span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-lg">
            Practical ways Writers Block helps you move from idea to draft, then from rough scene to polished pages.
          </p>
        </motion.div>

        <div className="relative">
          <button
            onClick={prevSlide}
            className="absolute left-0 top-1/2 z-10 hidden h-12 w-12 -translate-x-4 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-all duration-300 hover:bg-white/20 md:flex"
            aria-label="Previous workflow"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={nextSlide}
            className="absolute right-0 top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 translate-x-4 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-all duration-300 hover:bg-white/20 md:flex"
            aria-label="Next workflow"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <motion.div
            className="flex cursor-grab gap-6 active:cursor-grabbing"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={handleDragEnd}
          >
            {getVisibleWorkflows().map((workflow, index) => (
              <motion.div
                key={`${workflow.title}-${index}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className="flex-shrink-0 w-full md:w-[calc(33.333%-1rem)]"
              >
                <div className="glass-panel rounded-2xl p-8 border border-white/10 hover:border-white/20 transition-all duration-300 h-full group relative overflow-hidden">
                  <Quote
                    className="absolute top-6 right-6 w-10 h-10 text-cinematic-orange/10 group-hover:text-cinematic-orange/20 transition-colors"
                    aria-hidden="true"
                  />

                  <p className="text-white/90 leading-relaxed mb-6 pr-8 text-[15px] relative z-10">
                    {workflow.quote}
                  </p>

                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${workflow.color} flex items-center justify-center text-white font-bold text-lg`}>
                      {workflow.avatar}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-white">{workflow.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {workflow.role} · {workflow.detail}
                      </p>
                    </div>
                  </div>

                  <div className="absolute inset-0 bg-gradient-to-br from-cinematic-orange/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                </div>
              </motion.div>
            ))}
          </motion.div>

          <div className="flex justify-center gap-2 mt-8">
            {workflows.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  index === currentIndex
                    ? "w-8 bg-cinematic-orange"
                    : "bg-white/20 hover:bg-white/40"
                }`}
                aria-label={`Go to workflow ${index + 1}`}
              />
            ))}
          </div>

          <p className="text-center text-sm text-muted-foreground mt-4 md:hidden">
            Swipe to see more
          </p>
        </div>
      </div>
    </section>
  )
}
