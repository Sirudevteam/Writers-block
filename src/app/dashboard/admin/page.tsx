import { notFound } from "next/navigation"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import type { Database } from "@/infrastructure/db/types/database"
import { userHasAdminPrivileges } from "@/modules/master-admin/security/admin-privileges"
import { computeAdminStats, type AdminStats } from "@/modules/master-admin/application/admin-stats"
import { getServerAuthUser } from "@/infrastructure/db/supabase/server-auth"

export default async function AdminDashboard() {
  const auth = await getServerAuthUser()
  const user = auth?.user

  if (!user?.id || !(await userHasAdminPrivileges(user.id))) {
    notFound()
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return (
      <div className="p-8 text-center text-red-400">
        Missing SUPABASE_SERVICE_ROLE_KEY. Admin stats require the service role on the server.
      </div>
    )
  }

  const adminSupabase = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  let stats: AdminStats
  try {
    stats = await computeAdminStats(adminSupabase)
  } catch {
    return (
      <div className="p-8 text-center text-red-400">
        Failed to load admin stats. Check database access and server logs.
      </div>
    )
  }

  const { overview, plans, usage, recentPayments } = stats
  const activeTotal = Object.values(plans).reduce((a, b) => a + b, 0)

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-gray-400 mb-8">Platform overview — Writers Block</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Users" value={overview.totalUsers.toLocaleString()} />
          <StatCard label="Total Projects" value={overview.totalProjects.toLocaleString()} />
          <StatCard label="Active Subscribers" value={overview.activeSubscribers.toLocaleString()} />
          <StatCard
            label="Est. MRR (env pricing)"
            value={`₹${overview.mrr.toLocaleString("en-IN")}`}
            accent
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-[#111] border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-1">Active subscriptions by plan</h2>
            <p className="text-xs text-gray-500 mb-4">Only rows with status &quot;active&quot;</p>
            <div className="space-y-3">
              {Object.entries(plans).map(([plan, count]) => (
                <div key={plan} className="flex items-center justify-between">
                  <span className="capitalize text-gray-300">{plan}</span>
                  <div className="flex items-center gap-3">
                    <div
                      className="h-2 bg-orange-500 rounded"
                      style={{
                        width: `${Math.max(4, (count / Math.max(1, activeTotal)) * 120)}px`,
                      }}
                    />
                    <span className="font-mono text-sm w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#111] border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-1">AI generation usage</h2>
            <p className="text-xs text-gray-500 mb-4">
              Endpoint/plan breakdown from last {usage.breakdownSampleSize} events (approximate); totals
              are full counts.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-2xl font-bold">{usage.total.toLocaleString()}</div>
                <div className="text-xs text-gray-400">Total generations</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-2xl font-bold">{usage.last24h.toLocaleString()}</div>
                <div className="text-xs text-gray-400">Last 24 hours</div>
              </div>
            </div>
            <div className="space-y-2">
              {Object.entries(usage.byEndpoint).map(([endpoint, count]) => (
                <div key={endpoint} className="flex justify-between text-sm">
                  <span className="text-gray-400">{endpoint}</span>
                  <span className="font-mono">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-[#111] border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Payments</h2>
          {recentPayments.length === 0 ? (
            <p className="text-gray-500 text-sm">No payments yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-white/10">
                    <th className="text-left pb-2">Plan</th>
                    <th className="text-left pb-2">Cycle</th>
                    <th className="text-left pb-2">Payment ID</th>
                    <th className="text-left pb-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {recentPayments.map((p) => (
                    <tr key={p.razorpay_payment_id} className="hover:bg-white/5">
                      <td className="py-2 capitalize">{p.plan}</td>
                      <td className="py-2 capitalize">{p.billing_cycle}</td>
                      <td className="py-2 font-mono text-xs text-gray-400">
                        {p.razorpay_payment_id}
                      </td>
                      <td className="py-2 text-gray-400">
                        {new Date(p.updated_at).toLocaleDateString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="bg-[#111] border border-white/10 rounded-xl p-5">
      <div className={`text-2xl font-bold ${accent ? "text-orange-400" : "text-white"}`}>
        {value}
      </div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  )
}
