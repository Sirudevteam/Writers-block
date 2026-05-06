import { createClient } from "@/infrastructure/db/supabase/server"
import type { User } from "@supabase/supabase-js"

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

/**
 * Revalidates the JWT with Supabase Auth (`getUser()`). Use for protected shells
 * (e.g. dashboard layout) where policy requires a fresh server-side auth check.
 */
export async function getServerAuthUser(): Promise<{
  user: User
  supabase: ServerSupabase
} | null> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    return null
  }
  return { user, supabase }
}
