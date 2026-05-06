import { redirect } from "next/navigation"
import { Navbar } from "@/shared/components/navbar"
import { getServerAuthUser } from "@/infrastructure/db/supabase/server-auth"

export default async function EditorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const auth = await getServerAuthUser()
  if (!auth) {
    redirect("/signin?next=/editor")
  }

  return (
    <>
      <Navbar initialIsAuthenticated />
      {children}
    </>
  )
}
