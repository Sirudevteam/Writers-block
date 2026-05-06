import type { Metadata } from "next"
import Link from "next/link"
import { MasterAdminNav } from "@/modules/master-admin/presentation/components/nav"

export const metadata: Metadata = {
  title: {
    default: "Master Admin",
    template: "%s | Master Admin",
  },
  robots: { index: false, follow: false },
}

const nav = [
  { href: "/master-admin", label: "Overview" },
  { href: "/master-admin/users?preset=30d", label: "Users" },
  { href: "/master-admin/security?preset=30d&status=open", label: "Security" },
  { href: "/master-admin/business?preset=30d", label: "Business" },
  { href: "/master-admin/fraud?preset=30d&status=open", label: "Fraud" },
  { href: "/master-admin/subscriptions?preset=30d", label: "Subscriptions" },
  { href: "/master-admin/usage?preset=30d", label: "Usage" },
  { href: "/master-admin/ai-cost?preset=30d", label: "AI Cost" },
  { href: "/master-admin/payments?preset=30d", label: "Payments" },
  { href: "/master-admin/audit?preset=30d", label: "Audit" },
]

export default function MasterAdminLayout({ children }: { children: React.ReactNode }) {
  const envLabel =
    process.env.VERCEL_ENV === "production"
      ? "PROD"
      : process.env.VERCEL_ENV === "preview"
        ? "PREVIEW"
        : "DEV"
  const refreshedAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0c0c0b]/85 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-cinematic-orange/40 bg-cinematic-orange/10 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-cinematic-orange">
              Master Admin
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/70">
              {envLabel}
            </span>
            <span className="text-xs text-white/40">
              Refreshed <span className="font-mono text-white/60">{refreshedAt}</span> · Host-gated
            </span>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <MasterAdminNav items={nav} />
            <div className="flex flex-wrap items-center gap-3 text-xs text-white/50">
              <Link
                href="/master-admin/users?preset=30d"
                className="hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50 rounded"
              >
                Open Users
              </Link>
              <Link
                href="/master-admin/fraud?preset=30d&status=open"
                className="hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50 rounded"
              >
                Fraud
              </Link>
              <Link
                href="/master-admin/security?preset=30d&status=open"
                className="hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50 rounded"
              >
                Security
              </Link>
              <Link
                href="/master-admin/business?preset=30d"
                className="hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50 rounded"
              >
                Business
              </Link>
              <Link
                href="/master-admin/subscriptions?preset=30d"
                className="hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50 rounded"
              >
                Open Subscriptions
              </Link>
              <Link
                href="/master-admin/usage?preset=30d"
                className="hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50 rounded"
              >
                Open Usage
              </Link>
              <Link
                href="/master-admin/ai-cost?preset=30d"
                className="hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50 rounded"
              >
                AI Cost
              </Link>
              <Link
                href="/master-admin/payments?preset=30d"
                className="hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50 rounded"
              >
                Payments
              </Link>
              <Link
                href="/master-admin/audit?preset=30d"
                className="hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50 rounded"
              >
                Audit
              </Link>
              <span className="text-white/20" aria-hidden>
                ·
              </span>
              <Link
                href="/dashboard/admin"
                className="text-white/35 hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50 rounded"
              >
                Legacy admin
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 sm:py-10">{children}</div>
    </div>
  )
}
