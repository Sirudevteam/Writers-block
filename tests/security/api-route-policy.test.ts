import { describe, expect, it } from "vitest"
import {
  classifyApiRoute,
  isActiveAuthPage,
  isProtectedApiRoute,
} from "@/core/security/api-route-policy"

describe("API route policy", () => {
  it("classifies auth APIs as public", () => {
    expect(classifyApiRoute("/api/auth/sign-in")).toBe("public")
    expect(classifyApiRoute("/api/auth/verify-code")).toBe("public")
  })

  it("classifies machine-auth APIs separately from user-protected APIs", () => {
    expect(classifyApiRoute("/api/razorpay/webhook")).toBe("machine")
    expect(classifyApiRoute("/api/scim/v2/00000000-0000-0000-0000-000000000000/Users")).toBe("machine")
    expect(classifyApiRoute("/api/cron/check-subscriptions")).toBe("machine")
    expect(classifyApiRoute("/api/jobs/ai-batch")).toBe("machine")
    expect(classifyApiRoute("/api/test/e2e/provider")).toBe("machine")
  })

  it("allows public support ticket creation without downgrading SCIM protection", () => {
    expect(classifyApiRoute("/api/support/tickets")).toBe("public")
    expect(isProtectedApiRoute("/api/support/tickets")).toBe(false)
  })

  it("classifies app APIs as protected by default", () => {
    expect(classifyApiRoute("/api/projects")).toBe("protected")
    expect(classifyApiRoute("/api/projects/123/export-pdf")).toBe("protected")
    expect(classifyApiRoute("/api/ai/feedback")).toBe("protected")
    expect(classifyApiRoute("/api/razorpay/create-order")).toBe("protected")
    expect(classifyApiRoute("/api/razorpay/verify")).toBe("protected")
    expect(classifyApiRoute("/api/user/profile")).toBe("protected")
    expect(classifyApiRoute("/api/subscription")).toBe("protected")
    expect(classifyApiRoute("/api/documents")).toBe("protected")
    expect(isProtectedApiRoute("/api/documents")).toBe(true)
  })

  it("excludes Master Admin APIs from general API handling", () => {
    expect(classifyApiRoute("/api/master-admin/overview")).toBe("master-admin")
    expect(isProtectedApiRoute("/api/master-admin/overview")).toBe(false)
  })

  it("tracks active auth pages and excludes the legacy verify-email page", () => {
    expect(isActiveAuthPage("/signin")).toBe(true)
    expect(isActiveAuthPage("/signup")).toBe(true)
    expect(isActiveAuthPage("/forgot-password")).toBe(true)
    expect(isActiveAuthPage("/reset-password")).toBe(true)
    expect(isActiveAuthPage("/verify-code")).toBe(true)
    expect(isActiveAuthPage("/verify-email")).toBe(false)
  })
})
