import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "@/infrastructure/db/types/database"

/**
 * Browser Supabase client: PKCE + cookie-backed session (via @supabase/ssr), not manual localStorage tokens.
 * Email/password sign-in and sign-up run through `/api/auth/*` so cookies + origin checks + rate limits apply server-side.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
