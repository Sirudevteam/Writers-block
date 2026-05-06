import type { Metadata } from "next"
import { AuthShell } from "@/modules/auth/presentation/components/auth-shell"
import { MasterAdminSignInForm } from "@/modules/auth/presentation/components/master-admin-sign-in-form"
import { getSafeNextPath } from "@/modules/auth/domain/next-path"

export const metadata: Metadata = {
  title: "Master Admin sign in",
  description: "Sign in to Master Admin with password and a secure email code.",
  robots: { index: false, follow: false },
}

type MasterAdminSignInPageProps = {
  searchParams?: Promise<{
    next?: string
  }>
}

export default async function MasterAdminSignInPage({ searchParams }: MasterAdminSignInPageProps) {
  const resolvedSearchParams = await searchParams
  const requestedNext = getSafeNextPath(resolvedSearchParams?.next)
  const nextPath = requestedNext.startsWith("/master-admin") ? requestedNext : "/master-admin"

  return (
    <AuthShell mode="signin">
      <MasterAdminSignInForm nextPath={nextPath} />
    </AuthShell>
  )
}
