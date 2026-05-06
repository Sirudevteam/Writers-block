import type { Metadata } from "next"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import type { Database } from "@/infrastructure/db/types/database"
import { requireMasterAdminSession } from "@/modules/master-admin/security/auth"
import { resolveMasterAdminDateRange } from "@/modules/master-admin/domain/date-range"
import { fetchAiCostSummary } from "@/modules/master-admin/infrastructure/admin-queries"
import { MasterAdminDatePresets } from "@/modules/master-admin/presentation/components/date-presets"
import { PLAN_MONTHLY_TOKEN_BUDGETS, AI_PRICING_LAST_REVIEWED } from "@/modules/ai/domain/costing"
import { PRO_MONTHLY_INR } from "@/modules/billing/domain/pricing-inr"

export const metadata: Metadata = {
  title: "AI Cost",
}

type Search = Record<string, string | string[] | undefined>

function usd(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
}

function inr(n: number) {
  return `INR ${Math.round(n).toLocaleString("en-IN")}`
}

function compactTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 1 })}M`
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("en-US", { maximumFractionDigits: 1 })}K`
  return n.toLocaleString("en-US")
}

function pct(n: number | null) {
  return n === null ? "n/a" : `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`
}

function Tile({
  label,
  value,
  helper,
  tone = "orange",
}: {
  label: string
  value: string
  helper?: string
  tone?: "orange" | "green" | "blue"
}) {
  const toneClass = tone === "green" ? "text-emerald-400" : tone === "blue" ? "text-cinematic-blue" : "text-cinematic-orange"
  return (
    <div className="rounded-lg border border-white/10 bg-[#111]/80 p-5">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">{label}</div>
      <div className={`mt-4 text-4xl font-semibold ${toneClass}`}>{value}</div>
      {helper ? <div className="mt-3 text-sm text-white/45">{helper}</div> : null}
    </div>
  )
}

export default async function MasterAdminAiCostPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireMasterAdminSession()
  const resolvedSearchParams = await searchParams

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-red-300">
        Missing <code className="font-mono text-sm">SUPABASE_SERVICE_ROLE_KEY</code>.
      </div>
    )
  }

  const range = resolveMasterAdminDateRange(resolvedSearchParams)
  const adminSupabase = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  const summary = await fetchAiCostSummary(adminSupabase, range.fromIso, range.toIso)
  const baselineRevenueInr = PRO_MONTHLY_INR * 100
  const targetCostInr = 220 * 95
  const baselineMargin = Math.round(((baselineRevenueInr - targetCostInr) / baselineRevenueInr) * 1000) / 10
  const alerting = summary.projectedMonthlyCostUsd >= summary.hardAlertUsd

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/50">Writers Block</div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">
            Smart Routing {usd(summary.projectedMonthlyCostUsd)}/mo for Quality/Cost Balance
          </h1>
          <p className="mt-3 text-sm text-white/55">
            Route tasks by complexity: 50% simple {"->"} budget models | 35% standard {"->"} balanced models | 15% complex {"->"} quality models.
          </p>
        </div>
        <div className="text-xs text-white/45">
          Pricing reviewed {AI_PRICING_LAST_REVIEWED}; range{" "}
          <span className="font-mono text-white/70">{new Date(range.fromIso).toLocaleDateString("en-IN")}</span> to{" "}
          <span className="font-mono text-white/70">{new Date(range.toIso).toLocaleDateString("en-IN")}</span>
        </div>
      </div>

      <MasterAdminDatePresets basePath="/master-admin/ai-cost" range={range} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Tile label="Input tokens" value={compactTokens(summary.totals.inputTokens)} helper="Tracked provider input tokens" />
        <Tile label="Output tokens" value={compactTokens(summary.totals.outputTokens)} helper="Tracked provider output tokens" />
        <Tile label="Total tokens" value={compactTokens(summary.totals.totalTokens)} helper={`${summary.totals.requests.toLocaleString()} AI requests`} />
        <Tile label="Projected COGS" value={usd(summary.projectedMonthlyCostUsd)} helper={inr(summary.projectedMonthlyCostInr)} tone={alerting ? "orange" : "green"} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {[
          { key: "simple", title: "Simple tasks - 50% traffic", tone: "green", models: "Gemini Flash-Lite, GPT-4o mini" },
          { key: "standard", title: "Standard tasks - 35% traffic", tone: "blue", models: "Gemini Flash, GPT-5.4 mini" },
          { key: "complex", title: "Complex tasks - 15% traffic", tone: "orange", models: "GPT-5.4, Claude Sonnet 4.6" },
        ].map((bucket) => {
          const row = summary.byComplexity.find((item) => item.key === bucket.key)
          const tone = bucket.tone === "green" ? "text-emerald-400 bg-emerald-500/10" : bucket.tone === "blue" ? "text-cinematic-blue bg-cinematic-blue/10" : "text-cinematic-orange bg-cinematic-orange/10"
          return (
            <section key={bucket.key} className="overflow-hidden rounded-lg border border-white/10 bg-[#111]/80">
              <div className={`px-5 py-3 text-center text-sm font-semibold uppercase ${tone}`}>{bucket.title}</div>
              <div className="space-y-4 p-5">
                <div className="text-sm text-white/70">{bucket.models}</div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-white/40">Subtotal</div>
                  <div className="mt-2 text-3xl font-semibold text-white">{usd(row?.costUsd ?? 0)}</div>
                </div>
                <div className="text-sm text-white/50">
                  {compactTokens(row?.inputTokens ?? 0)} input + {compactTokens(row?.outputTokens ?? 0)} output tokens
                </div>
              </div>
            </section>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-lg border border-white/10 bg-[#111]/80 p-6 lg:col-span-7">
          <h2 className="text-xl font-semibold">Endpoint / model cost</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/45">
                <tr>
                  <th className="py-3 pr-4 font-medium">Model</th>
                  <th className="py-3 pr-4 font-medium">Provider</th>
                  <th className="py-3 pr-4 font-medium">Requests</th>
                  <th className="py-3 pr-4 font-medium">Tokens</th>
                  <th className="py-3 pr-4 font-medium">Cost</th>
                  <th className="py-3 font-medium">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {summary.byModel.slice(0, 12).map((row) => (
                  <tr key={row.key} className="hover:bg-white/5">
                    <td className="py-3 pr-4 font-mono text-xs text-white/80">{row.model ?? "unknown"}</td>
                    <td className="py-3 pr-4 text-white/60">{row.provider ?? "unknown"}</td>
                    <td className="py-3 pr-4 text-white/70">{row.requests.toLocaleString()}</td>
                    <td className="py-3 pr-4 text-white/70">{compactTokens(row.totalTokens)}</td>
                    <td className="py-3 pr-4 text-white/90">{usd(row.costUsd)}</td>
                    <td className="py-3 text-white/60">{row.avgLatencyMs ? `${row.avgLatencyMs} ms` : "n/a"}</td>
                  </tr>
                ))}
                {summary.byModel.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-white/45">
                      No AI cost data in this range.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-[#111]/80 p-6 lg:col-span-5">
          <h2 className="text-xl font-semibold">Margin projection</h2>
          <div className="mt-5 space-y-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-white/55">Actual active MRR</span>
              <span className="font-semibold text-white">{inr(summary.actualMrrInr)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-white/55">Projected AI COGS</span>
              <span className={alerting ? "font-semibold text-cinematic-orange" : "font-semibold text-emerald-300"}>
                {inr(summary.projectedMonthlyCostInr)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-white/55">Actual AI gross margin</span>
              <span className="font-semibold text-white">{pct(summary.grossMarginPct)}</span>
            </div>
            <div className="border-t border-white/10 pt-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-white/55">100 Pro users baseline</span>
                <span className="font-semibold text-white">{inr(baselineRevenueInr)}</span>
              </div>
              <div className="mt-2 text-xs text-white/45">
                At $220 AI cost and INR 95/USD, baseline AI gross margin is {baselineMargin}%.
              </div>
            </div>
            <div className={`rounded-lg px-4 py-3 text-sm ${alerting ? "bg-cinematic-orange/10 text-cinematic-orange" : "bg-emerald-500/10 text-emerald-300"}`}>
              {alerting ? "Projected AI COGS is above the $300 hard alert." : "Projected AI COGS is below the $300 hard alert."}
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-white/10 bg-[#111]/80 p-6">
        <h2 className="text-xl font-semibold">Per-plan AI credit controls</h2>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          {Object.entries(PLAN_MONTHLY_TOKEN_BUDGETS).map(([plan, budget]) => {
            const row = summary.byPlan.find((item) => item.key === plan)
            const used = row?.totalTokens ?? 0
            const percent = Math.min(100, Math.round((used / budget.totalTokens) * 100))
            return (
              <div key={plan} className="rounded-lg border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold capitalize text-white">{plan}</div>
                  <div className="font-mono text-xs text-white/45">{percent}% used</div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded bg-white/10">
                  <div className="h-full bg-cinematic-orange" style={{ width: `${percent}%` }} />
                </div>
                <div className="mt-3 text-xs text-white/45">
                  {compactTokens(used)} / {compactTokens(budget.totalTokens)} monthly AI credits
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-[#111]/80 p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Feedback-based model upgrades</h2>
            <p className="mt-2 text-sm text-white/50">
              Quality signal from users helps keep cheap models where they are good enough and reserve premium models for weak spots.
            </p>
          </div>
          <div className="text-sm text-white/55">
            {summary.feedback.positive} positive / {summary.feedback.negative} negative
          </div>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/45">
              <tr>
                <th className="py-3 pr-4 font-medium">Endpoint</th>
                <th className="py-3 pr-4 font-medium">Model</th>
                <th className="py-3 pr-4 font-medium">Provider</th>
                <th className="py-3 pr-4 font-medium">Positive</th>
                <th className="py-3 pr-4 font-medium">Negative</th>
                <th className="py-3 font-medium">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {summary.feedback.byModel.slice(0, 8).map((row) => (
                <tr key={row.key} className="hover:bg-white/5">
                  <td className="py-3 pr-4 text-white/70">{row.endpoint}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-white/80">{row.model ?? "unknown"}</td>
                  <td className="py-3 pr-4 text-white/60">{row.provider ?? "unknown"}</td>
                  <td className="py-3 pr-4 text-emerald-300">{row.positive}</td>
                  <td className="py-3 pr-4 text-cinematic-orange">{row.negative}</td>
                  <td className="py-3 text-white/70">{pct(row.scorePct)}</td>
                </tr>
              ))}
              {summary.feedback.byModel.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-white/45">
                    No AI response feedback in this range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-[#111]/80 p-6">
        <h2 className="text-xl font-semibold">
          Key recommendations - reduce API costs 30-50%
        </h2>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          {[
            "Keep simple requests on Gemini Flash-Lite or GPT-4o mini unless quality scores fall.",
            "Downgrade users at 85% monthly budget and hard-cap at 100% to protect margins.",
            "Cache repeated screenplay context, character bios, and scene history.",
            "Move exports and bulk formatting to batch/flex processing when they do not need realtime streaming.",
          ].map((item, index) => (
            <div key={item} className="flex gap-4 rounded-lg border border-white/10 bg-black/20 p-5">
              <div className="font-mono text-2xl text-cinematic-orange">{String(index + 1).padStart(2, "0")}</div>
              <p className="text-sm leading-6 text-white/70">{item}</p>
            </div>
          ))}
        </div>
      </section>

      {summary.truncated ? (
        <p className="text-xs text-amber-300/90">
          Cost rows are sample-capped at 10,000 records for this view. Narrow the date range for exact drill-down.
        </p>
      ) : null}
    </div>
  )
}
