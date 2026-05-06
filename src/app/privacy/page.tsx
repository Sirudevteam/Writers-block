export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#0b0b0d] px-6 py-16 text-[#f5f5f2]">
      <article className="mx-auto max-w-3xl space-y-6">
        <p className="text-sm text-white/50">Version 2026.05.06</p>
        <h1 className="text-4xl font-semibold">Privacy Policy</h1>
        <p className="text-white/70">
          We collect account, billing, organization, project, support, and security telemetry needed to operate Writers Block.
          Private organization content is restricted to authenticated members with project access.
        </p>
        <h2 className="text-2xl font-semibold">Identity and Billing</h2>
        <p className="text-white/70">
          Authentication is handled by Supabase. Payments, subscriptions, invoices, refunds, GST fields, and disputes are
          processed with Razorpay and stored in our billing ledger for auditability.
        </p>
        <h2 className="text-2xl font-semibold">Enterprise Provisioning</h2>
        <p className="text-white/70">
          SSO joins bind to Supabase user UUID and organization membership. SCIM bearer tokens are stored only as hashes.
        </p>
      </article>
    </main>
  )
}
