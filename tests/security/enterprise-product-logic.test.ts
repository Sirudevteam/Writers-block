import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { roleHasPermission } from "@/modules/iam/domain/permissions"
import { classifyApiRoute } from "@/core/security/api-route-policy"
import { generateInviteToken, hashInviteToken } from "@/modules/iam/application/invites"
import { bearerTokenFromHeader, hashScimToken } from "@/modules/iam/application/scim"
import { getRazorpaySubscriptionPlanId } from "@/modules/billing/application/razorpay-subscriptions"

const root = process.cwd()

function readRepoFile(path: string): string {
  return readFileSync(join(root, path), "utf8")
}

describe("enterprise product logic", () => {
  it("stores invite and SCIM secrets only as hashes", () => {
    const token = generateInviteToken()
    expect(token).not.toBe(hashInviteToken(token))
    expect(hashInviteToken(token)).toHaveLength(64)
    expect(hashScimToken("wb_scim_test")).toHaveLength(64)
    expect(bearerTokenFromHeader("Bearer wb_scim_test")).toBe("wb_scim_test")
  })

  it("splits enterprise permissions between owners and admins", () => {
    expect(roleHasPermission("owner", "billing:manage")).toBe(true)
    expect(roleHasPermission("owner", "org:security:manage")).toBe(true)
    expect(roleHasPermission("admin", "org:member:manage")).toBe(true)
    expect(roleHasPermission("admin", "billing:manage")).toBe(false)
    expect(roleHasPermission("admin", "org:security:manage")).toBe(false)
  })

  it("keeps SCIM machine-authenticated and support intake public", () => {
    expect(classifyApiRoute("/api/scim/v2/00000000-0000-0000-0000-000000000000/Users")).toBe("machine")
    expect(classifyApiRoute("/api/support/tickets")).toBe("public")
  })

  it("uses Razorpay Subscription plan ids from environment, not one-time order prices", () => {
    process.env.RAZORPAY_PLAN_PRO_MONTHLY = "plan_pro_monthly_test"
    expect(getRazorpaySubscriptionPlanId("pro", "monthly")).toBe("plan_pro_monthly_test")
    const route = readRepoFile("src/app/api/billing/subscriptions/route.ts")
    expect(route).toContain("subscriptions.create")
    expect(route).toContain("purpose: \"subscription\"")
  })

  it("keeps the enterprise schema in the consolidated migration source", () => {
    const schema = readRepoFile("supabase/database.sql")
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS public.organization_security_policies")
    expect(schema).toContain("scim_token_hash")
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS public.scim_provisioned_users")
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS public.billing_customers")
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS public.billing_subscription_ledger")
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS public.billing_invoices")
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS public.project_comments")
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS public.project_activity_events")
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS public.support_tickets")
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS public.user_consents")
    expect(schema).toContain("'past_due'")
  })

  it("enforces tenant policy at the org API boundary", () => {
    const guard = readRepoFile("src/modules/iam/application/api-guard.ts")
    expect(guard).toContain("policy?.require_mfa")
    expect(guard).toContain("policy?.require_sso")
    expect(guard).toContain("policy?.disable_password_login")
    expect(guard).toContain("session_duration_minutes")
  })

  it("implements private org collaboration routes only", () => {
    const comments = readRepoFile("src/app/api/projects/[id]/comments/route.ts")
    const activity = readRepoFile("src/app/api/projects/[id]/activity/route.ts")
    expect(comments).toContain("guardOrgApi(req, \"project:read\")")
    expect(comments).toContain("project_activity_events")
    expect(activity).toContain("guardOrgApi(req, \"project:read\")")
    expect(readRepoFile("src/core/security/api-route-policy.ts")).not.toContain("/api/share")
  })
})
