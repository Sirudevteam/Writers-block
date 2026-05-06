"use client"

import { motion, useScroll, useTransform } from "framer-motion"
import { Settings2, Wand2, Film, Check } from "lucide-react"
import Link from "next/link"
import { useRef } from "react"

const steps = [
  {
    step: "01",
    icon: Settings2,
    title: "Configure Your Scene",
    description:
      "Choose your genre, set the location, define the mood, and introduce your characters. Pick Tamil or English screenplay format.",
    details: ["Select genre: Thriller, Comedy, Drama, Action, Romance", "Set INT/EXT location", "Define character relationships"],
    color: "from-cinematic-orange to-amber-500",
  },
  {
    step: "02",
    icon: Wand2,
    title: "AI Generates Your Script",
    description:
      "Our AI writes a complete, professionally formatted screenplay scene in seconds. Edit, regenerate, or continue the scene forward.",
    details: ["INT. / EXT. headings", "Action lines & descriptions", "Character dialogue"],
    color: "from-cinematic-blue to-cyan-400",
  },
  {
    step: "03",
    icon: Film,
    title: "Polish & Reference",
    description:
      "Use the Dialogue Improver to sharpen every line. Browse reference scenes from iconic Tamil and international films.",
    details: ["AI Dialogue Enhancement", "Movie scene references", "Export to PDF"],
    color: "from-purple-500 to-pink-400",
  },
]

function StepCard({ step, index }: { step: typeof steps[0]; index: number }) {
  const Icon = step.icon
  const isEven = index % 2 === 0

  return (
    <motion.div
      initial={{ opacity: 0, x: isEven ? -50 : 50 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6, delay: index * 0.2 }}
      className={`relative flex items-center gap-8 ${isEven ? "md:flex-row" : "md:flex-row-reverse"} flex-col`}
    >
      {/* Content Card */}
      <div className={`flex-1 ${isEven ? "md:text-right" : "md:text-left"} text-center`}>
        <motion.div
          whileHover={{ scale: 1.02 }}
          className="glass-panel rounded-2xl p-8 border border-white/10 hover:border-white/20 transition-all duration-300 group"
        >
          <span className={`inline-block text-5xl font-bold bg-gradient-to-r ${step.color} bg-clip-text text-transparent mb-4 opacity-50`}>
            {step.step}
          </span>
          <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-cinematic-orange transition-colors">
            {step.title}
          </h3>
          <p className="text-muted-foreground leading-relaxed mb-6">
            {step.description}
          </p>
          <ul className={`space-y-2 ${isEven ? "md:items-end" : "md:items-start"} flex flex-col items-center`}>
            {step.details.map((detail, i) => (
              <motion.li
                key={detail}
                initial={{ opacity: 0, x: isEven ? 20 : -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="flex items-center gap-2 text-sm text-white/70"
              >
                <Check className="w-4 h-4 text-cinematic-orange shrink-0" />
                <span>{detail}</span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </div>

      {/* Center Icon */}
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        whileInView={{ scale: 1, rotate: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: index * 0.2 + 0.3, type: "spring" }}
        className="relative z-10"
      >
        <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${step.color} p-[2px] shadow-lg shadow-black/50`}>
          <div className="w-full h-full rounded-2xl bg-[#0a0a0a] flex items-center justify-center">
            <Icon className="w-8 h-8 text-white" />
          </div>
        </div>
        {/* Glow effect */}
        <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${step.color} blur-xl opacity-30 -z-10`} />
      </motion.div>

      {/* Spacer for alternating layout */}
      <div className="flex-1 hidden md:block" />
    </motion.div>
  )
}

export function HomeStepsSection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start center", "end center"],
  })

  const lineHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"])

  return (
    <section
      ref={containerRef}
      id="how-it-works"
      aria-label="How it works"
      className="py-24 px-4 sm:px-6 lg:px-8 bg-white/[0.02] scroll-mt-16 relative overflow-hidden"
    >
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 -left-32 w-64 h-64 bg-cinematic-orange/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-64 h-64 bg-cinematic-blue/5 rounded-full blur-3xl" />
      </div>

      <div className="max-w-5xl mx-auto relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-20"
        >
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-block text-xs font-semibold tracking-widest uppercase text-cinematic-blue mb-3 px-4 py-1.5 rounded-full bg-cinematic-blue/10 border border-cinematic-blue/20"
          >
            How It Works
          </motion.span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-display text-white mb-4">
            From Idea to Script in{" "}
            <span className="bg-gradient-to-r from-cinematic-blue to-cyan-400 bg-clip-text text-transparent">
              Three Steps
            </span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-lg">
            No learning curve. No blank page paralysis.
            Just your idea and a professional screenplay.
          </p>
        </motion.div>

        {/* Timeline container */}
        <div className="relative">
          {/* Center line: Animated */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10 hidden md:block -translate-x-1/2">
            <motion.div
              className="absolute top-0 left-0 w-full bg-gradient-to-b from-cinematic-orange via-cinematic-blue to-purple-500"
              style={{ height: lineHeight }}
            />
          </div>

          {/* Steps */}
          <div className="space-y-16 md:space-y-24">
            {steps.map((step, index) => (
              <StepCard key={step.step} step={step} index={index} />
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mt-20"
        >
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="inline-flex"
          >
            <Link
              href="/signup?next=/editor"
              className="inline-flex min-h-[44px] items-center gap-3 rounded-full border border-cinematic-orange/30 bg-cinematic-orange/10 px-6 py-3 text-cinematic-orange transition-colors hover:bg-cinematic-orange/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-blue focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Wand2 className="w-5 h-5" aria-hidden />
              <span className="font-semibold">Try it free. No credit card required</span>
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
