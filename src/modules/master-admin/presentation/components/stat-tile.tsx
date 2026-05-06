"use client"

import { motion } from "framer-motion"

export function StatTile({
  label,
  value,
  helper,
  accent = false,
}: {
  label: string
  value: string
  helper?: string
  accent?: boolean
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#111]/80 p-5 backdrop-blur-sm">
      <div className={`text-2xl font-bold ${accent ? "text-cinematic-orange" : "text-white"}`}>{value}</div>
      <div className="mt-1 text-xs text-white/45">{label}</div>
      {helper ? <div className="mt-2 text-xs text-white/40">{helper}</div> : null}
    </div>
  )
}

export function MiniBars({
  buckets,
  accent = "orange",
  height = 40,
}: {
  buckets: Array<{ day: string; count: number }>
  accent?: "orange" | "blue"
  height?: number
}) {
  const max = Math.max(1, ...buckets.map((b) => b.count))
  const barClass = accent === "blue" ? "bg-cinematic-blue" : "bg-cinematic-orange"
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {buckets.map((b) => (
        <motion.div
          key={b.day}
          title={`${b.day}: ${b.count}`}
          initial={{ height: 2, opacity: 0.6 }}
          animate={{ height: Math.max(2, Math.round((b.count / max) * (height - 2))), opacity: 1 }}
          transition={{ duration: 0.35 }}
          className={`w-2 rounded-sm ${barClass}`}
          style={{ opacity: 0.8 }}
        />
      ))}
    </div>
  )
}

