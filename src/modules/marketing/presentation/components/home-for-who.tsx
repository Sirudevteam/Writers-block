"use client"

import { motion, AnimatePresence } from "framer-motion"
import { PenLine, Clapperboard, GraduationCap, Building2, ChevronDown, ArrowRight } from "lucide-react"
import { useState } from "react"
import Link from "next/link"

const personas = [
  {
    icon: PenLine,
    title: "Independent Screenwriters",
    description:
      "Stop staring at blank pages. Generate complete scenes in seconds, improve your dialogue, and hit your page count every single day.",
    points: ["AI scene drafting on every plan", "Genre aware AI formatting", "Dialogue polish in one click"],
    example: "Draft a rough scene, then refine the emotional beats without leaving the editor.",
    color: "from-cinematic-orange/30 to-cinematic-orange/5",
    border: "border-cinematic-orange/30",
    accent: "text-cinematic-orange",
  },
  {
    icon: Clapperboard,
    title: "Tamil Cinema Directors",
    description:
      "From narration to final script, collaborate with AI that actually understands Tamil cinema language, pace, and emotion.",
    points: ["Tamil native script formatting", "Reference scenes from iconic films", "Shot composition suggestions"],
    example: "Move from narration to scene draft, then turn the same beat into shot ideas.",
    color: "from-cinematic-blue/30 to-cinematic-blue/5",
    border: "border-cinematic-blue/30",
    accent: "text-cinematic-blue",
  },
  {
    icon: GraduationCap,
    title: "Film Students",
    description:
      "Learn industry standard screenplay formatting by doing. Study reference scenes, practice structure, and build your portfolio faster.",
    points: ["Industry standard formatting", "Movie scene study library", "Export ready scripts"],
    example: "Practice format, structure, and dialogue with examples you can compare and revise.",
    color: "from-purple-500/30 to-purple-500/5",
    border: "border-purple-500/30",
    accent: "text-purple-400",
  },
  {
    icon: Building2,
    title: "Production Houses",
    description:
      "Speed up your preproduction pipeline. Evaluate scripts faster, generate scene variations, and streamline your creative workflow.",
    points: ["Multi project management", "Higher limits on Premium", "Team & API workflows (roadmap)"],
    example: "Explore scene variations before investing production time in a single direction.",
    color: "from-green-500/30 to-green-500/5",
    border: "border-green-500/30",
    accent: "text-green-400",
  },
]

function PersonaCard({ persona, index }: { persona: typeof personas[0]; index: number }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const Icon = persona.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1 }}
      className={`relative rounded-2xl border ${persona.border} bg-gradient-to-br ${persona.color} overflow-hidden transition-all duration-500 group`}
      whileHover={{ y: -4 }}
    >
      {/* Animated gradient on hover */}
      <motion.div
        className="absolute inset-0 bg-white/5"
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      />

      <div className="relative p-6">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="block w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-blue focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-expanded={isExpanded}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <motion.div
              className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm"
              whileHover={{ rotate: 5, scale: 1.1 }}
            >
              <Icon className={`w-6 h-6 ${persona.accent}`} aria-hidden="true" />
            </motion.div>
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.3 }}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
            >
              <ChevronDown className="w-4 h-4 text-white/70" aria-hidden="true" />
            </motion.div>
          </div>

          {/* Title */}
          <h3 className="text-lg font-bold text-white mb-2 group-hover:text-cinematic-orange transition-colors">
            {persona.title}
          </h3>

          {/* Description */}
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            {persona.description}
          </p>

          {/* Quick points */}
          <ul className="space-y-1.5 mb-4">
            {persona.points.map((point, i) => (
              <motion.li
                key={point}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="flex items-center gap-2 text-xs text-white/70"
              >
                <span className={`${persona.accent}`} aria-hidden="true">✓</span>
                {point}
              </motion.li>
            ))}
          </ul>
        </button>

        {/* Expandable content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="pt-4 border-t border-white/10">
                {/* Use case */}
                <div className="mb-4 p-4 rounded-xl bg-white/5 backdrop-blur-sm">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-white/45">
                    Best use
                  </p>
                  <p className={`text-sm ${persona.accent} leading-relaxed`}>
                    {persona.example}
                  </p>
                </div>

                {/* CTA */}
                <Link
                  href="/signup"
                  onClick={(e) => e.stopPropagation()}
                  className={`inline-flex items-center gap-2 text-sm font-medium ${persona.accent} hover:underline`}
                >
                  Start as a {persona.title.split(" ")[0]}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expand hint */}
        <motion.div
          className="absolute bottom-2 left-1/2 -translate-x-1/2 w-12 h-1 rounded-full bg-white/10"
          animate={{ opacity: isExpanded ? 0 : 1 }}
        />
      </div>
    </motion.div>
  )
}

export function HomeForWhoSection() {
  return (
    <section aria-label="Who it's for" className="py-24 px-4 sm:px-6 lg:px-8 bg-white/[0.015]">
      <div className="max-w-6xl mx-auto">
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
            className="inline-block text-xs font-semibold tracking-widest uppercase text-cinematic-blue mb-3 px-4 py-1.5 rounded-full bg-cinematic-blue/10 border border-cinematic-blue/20"
          >
            Built For
          </motion.span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-display text-white mb-4">
            Made for Every{" "}
            <span className="bg-gradient-to-r from-cinematic-blue to-cyan-400 bg-clip-text text-transparent">
              Filmmaker
            </span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            Whether you&apos;re writing your first spec script or your tenth produced film,
            Writers Block adapts to how you work.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {personas.map((persona, index) => (
            <PersonaCard key={persona.title} persona={persona} index={index} />
          ))}
        </div>
      </div>
    </section>
  )
}
