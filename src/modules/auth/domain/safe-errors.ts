/**
 * Map Supabase auth errors to fixed, non-sensitive strings (no raw echo — reduces XSS/info leak).
 */
export function mapSupabaseAuthError(message: string): string {
  const m = message.toLowerCase()

  if (m.includes("invalid login credentials") || m.includes("invalid credentials")) {
    return "Invalid email or password."
  }
  if (m.includes("email not confirmed")) {
    return "Please confirm your email before signing in."
  }
  if (m.includes("user already registered") || m.includes("already been registered")) {
    return "An account with this email already exists."
  }
  if (m.includes("password") && m.includes("least")) {
    return "Password does not meet the requirements."
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Please wait and try again."
  }
  if (m.includes("signup_disabled") || m.includes("signups not allowed")) {
    return "New registrations are temporarily unavailable."
  }

  return "Something went wrong. Please try again."
}

export function isSupabaseAuthRateLimitError(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes("rate limit") || m.includes("too many")
}

function collectErrorText(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause
    return [error.name, error.message, cause ? collectErrorText(cause) : ""].join(" ")
  }

  if (typeof error === "object" && error !== null) {
    const details = error as {
      name?: unknown
      message?: unknown
      code?: unknown
      hostname?: unknown
      cause?: unknown
    }
    return [
      details.name,
      details.message,
      details.code,
      details.hostname,
      details.cause ? collectErrorText(details.cause) : "",
    ]
      .filter((part): part is string => typeof part === "string")
      .join(" ")
  }

  return typeof error === "string" ? error : ""
}

export function isSupabaseAuthUnavailableError(error: unknown): boolean {
  const text = collectErrorText(error).toLowerCase()

  return (
    text.includes("fetch failed") ||
    text.includes("failed to fetch") ||
    text.includes("networkerror") ||
    text.includes("authretryablefetcherror") ||
    text.includes("enotfound") ||
    text.includes("eai_again") ||
    text.includes("econnrefused") ||
    text.includes("econnreset") ||
    text.includes("etimedout")
  )
}
