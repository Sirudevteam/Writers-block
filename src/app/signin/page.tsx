import type { Metadata } from "next"
import { AuthShell } from "@/modules/auth/presentation/components/auth-shell"
import { SignInForm } from "@/modules/auth/presentation/components/sign-in-form"
import { getSafeNextPath } from "@/modules/auth/domain/next-path"

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Writers Block with your password and a secure email code.",
}

type SignInPageProps = {
  searchParams?: Promise<{
    next?: string
    error?: string
    verified?: string
  }>
}

function getInitialSignInError(rawError: string | undefined): string | null {
  if (rawError === "mfa_required") {
    return "Master Admin requires multi-factor authentication. Sign in again and complete your MFA step (authenticator app)."
  }

  return null
}

function getInitialSignInNotice(rawVerified: string | undefined): string | null {
  if (rawVerified === "signup") {
    return "Your email is verified. Sign in with your password to start your session."
  }

  return null
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const resolvedSearchParams = await searchParams
  const nextPath = getSafeNextPath(resolvedSearchParams?.next)
  const initialError = getInitialSignInError(resolvedSearchParams?.error)
  const initialNotice = getInitialSignInNotice(resolvedSearchParams?.verified)

  return (
    <AuthShell mode="signin">
      <SignInForm
        nextPath={nextPath}
        initialError={initialError}
        initialNotice={initialNotice}
      />
    </AuthShell>
  )
}
