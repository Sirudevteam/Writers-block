import type { Metadata } from "next"
import { AuthShell } from "@/modules/auth/presentation/components/auth-shell"
import { CodeVerificationForm } from "@/modules/auth/presentation/components/code-verification-form"
import { getSafeNextPath } from "@/modules/auth/domain/next-path"
import { validateEmail } from "@/modules/auth/domain/validation"

export const metadata: Metadata = {
  title: "Enter email code",
  description: "Enter the 6-digit email code to continue to Writers Block.",
}

type VerifyCodePageProps = {
  searchParams?: Promise<{
    email?: string
    mode?: string
    next?: string
  }>
}

export default async function VerifyCodePage({ searchParams }: VerifyCodePageProps) {
  const resolvedSearchParams = await searchParams
  const nextPath = getSafeNextPath(resolvedSearchParams?.next)
  const initialEmail = validateEmail(resolvedSearchParams?.email) ?? ""
  const mode =
    resolvedSearchParams?.mode === "signin"
      ? "signin"
      : resolvedSearchParams?.mode === "master-admin"
        ? "master-admin"
        : "signup"

  return (
    <AuthShell mode={mode === "signup" ? "signup" : "signin"}>
      <CodeVerificationForm initialEmail={initialEmail} mode={mode} nextPath={nextPath} />
    </AuthShell>
  )
}
