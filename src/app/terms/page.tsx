export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#0b0b0d] px-6 py-16 text-[#f5f5f2]">
      <article className="mx-auto max-w-3xl space-y-6">
        <p className="text-sm text-white/50">Version 2026.05.06</p>
        <h1 className="text-4xl font-semibold">Terms of Service</h1>
        <p className="text-white/70">
          Writers Block provides screenplay planning, generation, editing, export, and team collaboration tools.
          You are responsible for the content you create, the collaborators you invite, and compliance with applicable law.
        </p>
        <h2 className="text-2xl font-semibold">Accounts and Organizations</h2>
        <p className="text-white/70">
          Organization owners control billing, security policy, SSO, SCIM, and destructive account actions.
          Administrators manage members and projects. Members may collaborate only inside authenticated organizations.
        </p>
        <h2 className="text-2xl font-semibold">AI Output</h2>
        <p className="text-white/70">
          AI output may be inaccurate or similar to other generated material. Review, edit, and clear rights before production use.
        </p>
        <h2 className="text-2xl font-semibold">Billing</h2>
        <p className="text-white/70">
          Paid plans renew through Razorpay Subscriptions in INR. Failed recurring payments receive a seven day grace period
          before paid entitlements return to the Free plan.
        </p>
      </article>
    </main>
  )
}
