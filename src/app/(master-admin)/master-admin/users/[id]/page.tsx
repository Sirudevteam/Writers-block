import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/infrastructure/db/types/database"
import { requireMasterAdminSession } from "@/modules/master-admin/security/auth"
import { fetchUser360 } from "@/modules/master-admin/infrastructure/admin-queries"
import { UserAccountControls } from "@/modules/master-admin/presentation/components/user-account-controls"
import { UserNoteForm } from "@/modules/master-admin/presentation/components/user-note-form"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  return { title: `User ${id.slice(0, 8)}…` }
}

function formatInrPaise(paise: number | null): string {
  if (paise == null) return "—"
  return (paise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" })
}

function reasonMessages(reasons: Json): string[] {
  if (!Array.isArray(reasons)) return []
  return reasons
    .map((reason) => {
      if (reason && typeof reason === "object" && !Array.isArray(reason) && "message" in reason) {
        return String(reason.message ?? "")
      }
      return ""
    })
    .filter(Boolean)
}

function riskBadgeClass(level: string) {
  if (level === "high") return "border-red-500/40 bg-red-500/10 text-red-300"
  if (level === "medium") return "border-amber-500/40 bg-amber-500/10 text-amber-300"
  return "border-white/15 bg-white/5 text-white/55"
}

function accountStatusBadgeClass(status: string) {
  if (status === "suspended") return "border-red-500/40 bg-red-500/10 text-red-300"
  if (status === "review_required") return "border-amber-500/40 bg-amber-500/10 text-amber-300"
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
}

function securitySeverityClass(severity: string) {
  if (severity === "critical") return "border-red-500/60 bg-red-500/15 text-red-200"
  if (severity === "high") return "border-red-500/40 bg-red-500/10 text-red-300"
  if (severity === "medium") return "border-amber-500/40 bg-amber-500/10 text-amber-300"
  return "border-white/15 bg-white/5 text-white/55"
}

function outcomeBadgeClass(outcome: string) {
  if (outcome === "blocked" || outcome === "failure") return "border-red-500/40 bg-red-500/10 text-red-300"
  if (outcome === "pending") return "border-amber-500/40 bg-amber-500/10 text-amber-300"
  if (outcome === "success") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
  return "border-white/15 bg-white/5 text-white/55"
}

export default async function MasterAdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireMasterAdminSession()
  const { id } = await params

  if (!UUID_RE.test(id)) {
    notFound()
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-300">
        Missing <code className="font-mono text-sm">SUPABASE_SERVICE_ROLE_KEY</code>.
      </div>
    )
  }

  const adminSupabase = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const bundle = await fetchUser360(adminSupabase, id)
  if (!bundle) {
    notFound()
  }

  const {
    profile,
    isPlatformOperator,
    subscription,
    projectCount,
    recentPayments,
    recentUsage,
    signupRiskEvents,
    signupRiskCluster,
    accountControl,
    userNotes,
    recentSecurityEvents,
    recentBusinessEvents,
  } = bundle
  const accountStatus = accountControl?.status ?? "active"

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/master-admin/users?preset=30d"
          className="text-sm text-white/50 hover:text-cinematic-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinematic-orange/50 rounded"
        >
          ← Users
        </Link>
        {isPlatformOperator ? (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-400">
            Platform operator
          </span>
        ) : null}
      </div>

      <h1 className="mt-4 text-3xl font-bold tracking-tight">User 360</h1>
      <p className="mt-2 font-mono text-sm text-white/55">{id}</p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-[#111] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/45">Profile</h2>
          {profile ? (
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-white/45">Email</dt>
                <dd className="font-mono text-xs text-white/85">{profile.email}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/45">Name</dt>
                <dd className="text-white/85">{profile.full_name ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/45">Joined</dt>
                <dd className="text-white/70">{new Date(profile.created_at).toLocaleString("en-IN")}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-white/45">No profile row (auth-only or pre-migration).</p>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-[#111] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/45">Subscription</h2>
          {subscription ? (
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-white/45">Plan</dt>
                <dd className="capitalize text-white/85">{subscription.plan}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/45">Status</dt>
                <dd className="capitalize text-white/70">{subscription.status}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/45">Billing</dt>
                <dd className="capitalize text-white/70">{subscription.billing_cycle}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/45">Period end</dt>
                <dd className="text-white/70">
                  {subscription.current_period_end
                    ? new Date(subscription.current_period_end).toLocaleString("en-IN")
                    : "—"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-white/45">No subscription row.</p>
          )}
          <p className="mt-4 text-xs text-white/35">
            Projects: <span className="font-mono text-white/60">{projectCount.toLocaleString()}</span>
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-white/10 bg-[#111] p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/45">Account control</h2>
              <p className="mt-1 text-xs text-white/35">Manual status and session revocation controls.</p>
            </div>
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${accountStatusBadgeClass(accountStatus)}`}>
              {accountStatus.replace(/_/g, " ")}
            </span>
          </div>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-white/40">Reason</dt>
              <dd className="mt-1 text-white/75">{accountControl?.reason ?? "None"}</dd>
            </div>
            <div>
              <dt className="text-white/40">Sessions revoked</dt>
              <dd className="mt-1 text-white/75">
                {accountControl?.revoked_sessions_at
                  ? new Date(accountControl.revoked_sessions_at).toLocaleString("en-IN")
                  : "No"}
              </dd>
            </div>
            <div>
              <dt className="text-white/40">Suspended</dt>
              <dd className="mt-1 text-white/75">
                {accountControl?.suspended_at ? new Date(accountControl.suspended_at).toLocaleString("en-IN") : "No"}
              </dd>
            </div>
            <div>
              <dt className="text-white/40">Updated</dt>
              <dd className="mt-1 text-white/75">
                {accountControl?.updated_at ? new Date(accountControl.updated_at).toLocaleString("en-IN") : "Never"}
              </dd>
            </div>
          </dl>
          <div className="mt-5">
            <UserAccountControls
              userId={id}
              initialStatus={accountStatus}
              initialReason={accountControl?.reason ?? null}
              initialNote={accountControl?.note ?? null}
            />
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-[#111] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/45">Internal notes</h2>
          <p className="mt-1 text-xs text-white/35">Append-only Master Admin notes. These are never shown to users.</p>
          <div className="mt-4">
            <UserNoteForm userId={id} />
          </div>
          <div className="mt-5 max-h-72 space-y-3 overflow-y-auto">
            {userNotes.length === 0 ? (
              <p className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-white/45">No internal notes.</p>
            ) : (
              userNotes.map((note) => (
                <article key={note.id} className="rounded-lg border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/40">
                    <span>{note.author_email ?? note.author_user_id ?? "System"}</span>
                    <time>{new Date(note.created_at).toLocaleString("en-IN")}</time>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-white/75">{note.note}</p>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-white/10 bg-[#111] p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/45">Signup risk</h2>
            <p className="mt-1 text-xs text-white/35">Hash-only fraud signals and same-IP cluster context.</p>
          </div>
          <Link
            href="/master-admin/fraud?preset=30d&status=open"
            className="text-sm text-cinematic-orange hover:underline"
          >
            Open fraud review
          </Link>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/45">
                <th className="py-2 pr-4 font-medium">Risk</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">IP hash</th>
                <th className="py-2 pr-4 font-medium">Device hash</th>
                <th className="py-2 pr-4 font-medium">Created</th>
                <th className="py-2 font-medium">Reasons</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {signupRiskEvents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-white/45">
                    No signup risk event recorded for this user.
                  </td>
                </tr>
              ) : (
                signupRiskEvents.map((r) => {
                  const messages = reasonMessages(r.risk_reasons)
                  return (
                    <tr key={r.id}>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${riskBadgeClass(r.risk_level)}`}>
                          {r.risk_level} {r.risk_score}
                        </span>
                      </td>
                      <td className="py-2 pr-4 capitalize text-white/65">{r.review_status.replace(/_/g, " ")}</td>
                      <td className="py-2 pr-4">
                        {r.ip_hash ? (
                          <Link
                            href={`/master-admin/fraud?preset=30d&ip_hash=${r.ip_hash}`}
                            className="font-mono text-xs text-cinematic-blue hover:underline"
                            title={r.ip_hash}
                          >
                            {r.ip_hash.slice(0, 16)}
                          </Link>
                        ) : (
                          <span className="text-white/35">None</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-white/45">
                        {r.user_agent_hash ? r.user_agent_hash.slice(0, 16) : "None"}
                      </td>
                      <td className="py-2 pr-4 text-white/50">{new Date(r.created_at).toLocaleString("en-IN")}</td>
                      <td className="py-2 text-xs text-white/60">
                        {messages.length > 0 ? messages.join("; ") : "No risk threshold crossed"}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {signupRiskCluster.length > 1 ? (
          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-white/40">Related hashed-IP cluster</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-white/45">
                    <th className="py-2 pr-4 font-medium">User</th>
                    <th className="py-2 pr-4 font-medium">Domain</th>
                    <th className="py-2 pr-4 font-medium">Risk</th>
                    <th className="py-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {signupRiskCluster.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-4">
                        <Link
                          href={`/master-admin/users/${r.user_id}`}
                          className="font-mono text-xs text-cinematic-orange hover:underline"
                        >
                          {r.user_email ?? r.user_id}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-white/65">{r.email_domain}</td>
                      <td className="py-2 pr-4 capitalize text-white/65">
                        {r.risk_level} {r.risk_score}
                      </td>
                      <td className="py-2 text-white/45">{new Date(r.created_at).toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-white/10 bg-[#111] p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/45">Recent security events</h2>
              <p className="mt-1 text-xs text-white/35">Actor or target matches this user.</p>
            </div>
            <Link
              href={`/master-admin/security?preset=30d&target_user_id=${id}`}
              className="text-sm text-cinematic-orange hover:underline"
            >
              Open security
            </Link>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/45">
                  <th className="py-2 pr-3 font-medium">Time</th>
                  <th className="py-2 pr-3 font-medium">Event</th>
                  <th className="py-2 pr-3 font-medium">Severity</th>
                  <th className="py-2 pr-3 font-medium">Outcome</th>
                  <th className="py-2 font-medium">Route</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentSecurityEvents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-white/45">
                      No security events for this user.
                    </td>
                  </tr>
                ) : (
                  recentSecurityEvents.map((event) => (
                    <tr key={event.id}>
                      <td className="py-2 pr-3 text-xs text-white/50">{new Date(event.created_at).toLocaleString("en-IN")}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-white/80">{event.event_type}</td>
                      <td className="py-2 pr-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${securitySeverityClass(event.severity)}`}>
                          {event.severity}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${outcomeBadgeClass(event.outcome)}`}>
                          {event.outcome}
                        </span>
                      </td>
                      <td className="py-2">
                        <div className="max-w-[240px] truncate font-mono text-xs text-white/45" title={event.route ?? ""}>
                          {event.route ?? "None"}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-[#111] p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/45">Recent business events</h2>
              <p className="mt-1 text-xs text-white/35">Signup, product usage, funnel, and billing telemetry.</p>
            </div>
            <Link
              href="/master-admin/business?preset=30d"
              className="text-sm text-cinematic-orange hover:underline"
            >
              Open business
            </Link>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/45">
                  <th className="py-2 pr-3 font-medium">Time</th>
                  <th className="py-2 pr-3 font-medium">Event</th>
                  <th className="py-2 pr-3 font-medium">Outcome</th>
                  <th className="py-2 pr-3 font-medium">Plan</th>
                  <th className="py-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentBusinessEvents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-white/45">
                      No business events for this user.
                    </td>
                  </tr>
                ) : (
                  recentBusinessEvents.map((event) => (
                    <tr key={event.id}>
                      <td className="py-2 pr-3 text-xs text-white/50">{new Date(event.created_at).toLocaleString("en-IN")}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-white/80">{event.event_type}</td>
                      <td className="py-2 pr-3">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${outcomeBadgeClass(event.outcome)}`}>
                          {event.outcome}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-white/55">
                        {event.plan ?? "None"}
                        {event.billing_cycle ? <span className="text-white/35"> / {event.billing_cycle}</span> : null}
                      </td>
                      <td className="py-2 font-mono text-xs text-white/70">{formatInrPaise(event.amount_paise)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-[#111] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/45">Recent AI usage</h2>
          <p className="mt-1 text-xs text-white/35">Last 25 events from usage_logs</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[400px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/45">
                  <th className="py-2 pr-3 font-medium">Time</th>
                  <th className="py-2 pr-3 font-medium">Endpoint</th>
                  <th className="py-2 font-medium">Plan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentUsage.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-white/45">
                      No usage logged for this user.
                    </td>
                  </tr>
                ) : (
                  recentUsage.map((u) => (
                    <tr key={u.id}>
                      <td className="py-2 pr-3 text-white/50">{new Date(u.created_at).toLocaleString("en-IN")}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-white/75">{u.endpoint}</td>
                      <td className="py-2 text-white/55">{u.plan}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#111] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/45">Recent payments</h2>
          <p className="mt-1 text-xs text-white/35">Last 25 rows from razorpay_payments</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[400px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/45">
                  <th className="py-2 pr-3 font-medium">Time</th>
                  <th className="py-2 pr-3 font-medium">Amount</th>
                  <th className="py-2 pr-3 font-medium">Plan</th>
                  <th className="py-2 font-medium">Payment ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentPayments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-white/45">
                      No payments recorded.
                    </td>
                  </tr>
                ) : (
                  recentPayments.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2 pr-3 text-white/50">{new Date(p.created_at).toLocaleString("en-IN")}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-white/80">{formatInrPaise(p.amount)}</td>
                      <td className="py-2 pr-3 capitalize text-white/75">{p.plan}</td>
                      <td className="py-2 font-mono text-[10px] text-white/45">{p.razorpay_payment_id}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
