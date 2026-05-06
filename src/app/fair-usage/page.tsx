export default function FairUsagePage() {
  return (
    <main className="min-h-screen bg-[#0b0b0d] px-6 py-16 text-[#f5f5f2]">
      <article className="mx-auto max-w-3xl space-y-6">
        <p className="text-sm text-white/50">Version 2026.05.06</p>
        <h1 className="text-4xl font-semibold">Fair Usage Policy</h1>
        <p className="text-white/70">
          Writers Block enforces project, generation, export, and API limits to protect service reliability and keep team usage fair.
        </p>
        <h2 className="text-2xl font-semibold">AI and Automation</h2>
        <p className="text-white/70">
          Automated scraping, credential sharing, excessive batch generation, or attempts to bypass AI credit reservations may be
          rate limited, paused, or reviewed by support.
        </p>
        <h2 className="text-2xl font-semibold">Organization Controls</h2>
        <p className="text-white/70">
          Owners can require MFA, SSO, verified domains, shorter sessions, and SCIM provisioning to match enterprise policy.
        </p>
      </article>
    </main>
  )
}
