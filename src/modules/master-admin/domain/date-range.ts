type MasterAdminPreset = "24h" | "7d" | "30d"

export type MasterAdminDateRange = {
  fromIso: string
  toIso: string
  preset: MasterAdminPreset
}

function clampPage(raw: string | string[] | undefined): number {
  const v = typeof raw === "string" ? parseInt(raw, 10) : NaN
  if (!Number.isFinite(v) || v < 1) return 1
  return Math.min(v, 10_000)
}

export function parseMasterAdminPage(searchParams: {
  page?: string | string[]
}): number {
  return clampPage(searchParams.page)
}

/** Default page size for master admin tables (bounded). */
export const MASTER_ADMIN_PAGE_SIZE = 25

/** Max rows returned by CSV export endpoints (single query). */
export const MASTER_ADMIN_EXPORT_MAX_ROWS = 2000

function normalizePreset(raw: string | undefined): MasterAdminPreset {
  if (raw === "24h" || raw === "7d" || raw === "30d") return raw
  return "30d"
}

export function resolveMasterAdminDateRange(searchParams: {
  preset?: string | string[]
  from?: string | string[]
  to?: string | string[]
}): MasterAdminDateRange {
  const preset = normalizePreset(
    typeof searchParams.preset === "string" ? searchParams.preset : undefined
  )
  const toParam = typeof searchParams.to === "string" ? searchParams.to : undefined
  const fromParam = typeof searchParams.from === "string" ? searchParams.from : undefined

  let toDate = toParam ? new Date(toParam) : new Date()
  if (Number.isNaN(toDate.getTime())) {
    toDate = new Date()
  }

  let fromDate: Date
  if (fromParam) {
    fromDate = new Date(fromParam)
    if (Number.isNaN(fromDate.getTime())) {
      fromDate = new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000)
    }
  } else if (preset === "24h") {
    fromDate = new Date(toDate.getTime() - 24 * 60 * 60 * 1000)
  } else if (preset === "7d") {
    fromDate = new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000)
  } else {
    fromDate = new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000)
  }

  if (fromDate.getTime() > toDate.getTime()) {
    fromDate = new Date(toDate.getTime() - 24 * 60 * 60 * 1000)
  }

  return {
    fromIso: fromDate.toISOString(),
    toIso: toDate.toISOString(),
    preset,
  }
}

export function masterAdminRangeQuery(
  range: MasterAdminDateRange,
  extra?: Record<string, string>
): string {
  const p = new URLSearchParams()
  p.set("preset", range.preset)
  p.set("from", range.fromIso)
  p.set("to", range.toIso)
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v)
    }
  }
  return p.toString()
}
