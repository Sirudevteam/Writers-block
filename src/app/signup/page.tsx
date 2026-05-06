import type { Metadata } from "next"
import { AuthShell } from "@/modules/auth/presentation/components/auth-shell"
import { SignUpForm } from "@/modules/auth/presentation/components/sign-up-form"
import { getSafeNextPath } from "@/modules/auth/domain/next-path"

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a Writers Block account — email verification and secure sessions.",
}

type SignUpPageProps = {
  searchParams?: Promise<{
    next?: string
  }>
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const resolvedSearchParams = await searchParams
  const nextPath = getSafeNextPath(resolvedSearchParams?.next)

  return (
    <AuthShell mode="signup">
      <SignUpForm nextPath={nextPath} />
    </AuthShell>
  )
}
