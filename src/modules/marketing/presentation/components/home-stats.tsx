"use client"

import { motion } from "framer-motion"
import { PLAN_LIMITS } from "@/shared/types/project"

const stats = [
  { value: "2", label: "Languages: Tamil & English" },
  { value: String(PLAN_LIMITS.free), label: "Free lifetime project creations" },
  { value: "PDF", label: "Export for finished drafts" },
  { value: "AI", label: "Dialogue, scenes, and shots" },
]

export function HomeStats() {
  return (
    <section aria-label="Platform statistics" className="py-12 px-4 sm:px-6 lg:px-8 border-y border-white/8">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16, scale: 0.9 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.12, duration: 0.5 }}
              className="text-center cursor-default"
            >
              <p className="text-3xl sm:text-4xl font-bold font-display bg-gradient-to-r from-cinematic-orange to-cinematic-orange/70 bg-clip-text text-transparent mb-1">
                {stat.value}
              </p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
