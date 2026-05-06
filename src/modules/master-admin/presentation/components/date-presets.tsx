import Link from "next/link"
import type { MasterAdminDateRange } from "@/modules/master-admin/domain/date-range"

const PRESETS = [
  { id: "24h" as const, label: "Last 24h" },
  { id: "7d" as const, label: "Last 7d" },
  { id: "30d" as const, label: "Last 30d" },
]

function presetHref(basePath: string, preset: string, extra?: Record<string, string>) {
  const p = new URLSearchParams()
  p.set("preset", preset)
  p.set("page", "1")
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v)
    }
  }
  return `${basePath}?${p.toString()}`
}

export function MasterAdminDatePresets({
  basePath,
  range,
  extra,
}: {
  basePath: string
  range: MasterAdminDateRange
  extra?: Record<string, string>
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-white/40">Range</span>
      {PRESETS.map((p) => {
        const active = range.preset === p.id
        const href = presetHref(basePath, p.id, extra)
        return (
          <Link
            key={p.id}
            href={href}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50 ${
              active
                ? "border-cinematic-orange/60 bg-cinematic-orange/15 text-cinematic-orange"
                : "border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:text-white"
            }`}
          >
            {p.label}
          </Link>
        )
      })}
    </div>
  )
}
