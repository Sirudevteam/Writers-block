import { describe, expect, it } from "vitest"
import {
  isSupabaseAuthRateLimitError,
  isSupabaseAuthUnavailableError,
  mapSupabaseAuthError,
} from "@/modules/auth/domain/safe-errors"

describe("auth safe errors", () => {
  it("classifies Supabase network failures as unavailable", () => {
    const error = new TypeError("fetch failed", {
      cause: Object.assign(new Error("getaddrinfo ENOTFOUND example.supabase.co"), {
        code: "ENOTFOUND",
        hostname: "example.supabase.co",
      }),
    })

    expect(isSupabaseAuthUnavailableError(error)).toBe(true)
  })

  it("does not classify normal auth failures as unavailable", () => {
    expect(isSupabaseAuthUnavailableError(new Error("User already registered"))).toBe(false)
    expect(isSupabaseAuthRateLimitError("too many requests")).toBe(true)
    expect(mapSupabaseAuthError("User already registered")).toBe(
      "An account with this email already exists."
    )
  })
})
