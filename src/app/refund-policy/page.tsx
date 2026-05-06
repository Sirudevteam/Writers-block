export default function RefundPolicyPage() {
  return (
    <main className="min-h-screen bg-[#0b0b0d] px-6 py-16 text-[#f5f5f2]">
      <article className="mx-auto max-w-3xl space-y-6">
        <p className="text-sm text-white/50">Version 2026.05.06</p>
        <h1 className="text-4xl font-semibold">Refund Policy</h1>
        <p className="text-white/70">
          Subscription charges are billed in INR through Razorpay. Refund requests are reviewed for duplicate charges,
          billing errors, failed service delivery, and statutory requirements.
        </p>
        <h2 className="text-2xl font-semibold">Recurring Plans</h2>
        <p className="text-white/70">
          Cancellation stops renewal at the end of the paid period unless an immediate cancellation is required by support.
          Failed payment recovery follows a seven day grace period before downgrade.
        </p>
        <h2 className="text-2xl font-semibold">One-Time Purchases</h2>
        <p className="text-white/70">
          Clean PDF exports and AI credit top-ups are one-time Razorpay orders and are eligible for review when the purchased
          service was not delivered or a duplicate charge occurred.
        </p>
      </article>
    </main>
  )
}
