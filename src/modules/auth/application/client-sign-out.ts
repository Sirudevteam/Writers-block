import { createClient } from "@/infrastructure/db/supabase/client"

const SIGN_OUT_TIMEOUT_MS = 4_000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("Sign-out timed out"))
    }, timeoutMs)

    promise.then(
      (value) => {
        window.clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timeout)
        reject(error)
      }
    )
  })
}

function clearSupabaseBrowserCookies() {
  document.cookie.split(";").forEach((cookie) => {
    const name = cookie.split("=")[0]?.trim()
    if (!name || !name.startsWith("sb-")) return
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`
  })
}

/** Clears Supabase cookie session locally and navigates (avoids Server Action / RSC action-id churn in dev). */
export async function signOutClientSession(redirectTo: string): Promise<{ error: string } | void> {
  const supabase = createClient()
  try {
    await withTimeout(
      fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      }),
      SIGN_OUT_TIMEOUT_MS
    )
  } catch {
    // Continue with browser cleanup so a slow API cannot trap the user.
  }

  try {
    await withTimeout(supabase.auth.signOut({ scope: "local" }), SIGN_OUT_TIMEOUT_MS)
  } catch {
    clearSupabaseBrowserCookies()
  }

  window.location.replace(redirectTo)
}
