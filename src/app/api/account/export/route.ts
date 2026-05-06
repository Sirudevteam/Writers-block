import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/infrastructure/db/supabase/server"
import { createAdminClient } from "@/infrastructure/db/supabase/admin"
import { IAM_JSON_HEADERS } from "@/modules/iam/application/api-guard"

export const dynamic = "force-dynamic"

export async function POST(_req: NextRequest) {
  const auth = await createClient()
  const {
    data: { user },
  } = await auth.auth.getUser()
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: IAM_JSON_HEADERS })
  }

  const admin = createAdminClient()
  const [profile, memberships, projects, subscriptions, invoices] = await Promise.all([
    admin.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    (admin.from("organization_members") as any).select("org_id, role, created_at, organization:organizations(id, name, slug, kind)").eq("user_id", user.id),
    admin.from("projects").select("id, org_id, title, description, genre, characters, location, mood, content, status, created_at, updated_at").eq("user_id", user.id).limit(500),
    admin.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
    (admin.from("billing_invoices") as any).select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
  ])

  const error = profile.error ?? memberships.error ?? projects.error ?? subscriptions.error ?? invoices.error
  if (error) {
    return NextResponse.json({ error: "Failed to prepare export" }, { status: 500, headers: IAM_JSON_HEADERS })
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    profile: profile.data ?? null,
    memberships: memberships.data ?? [],
    projects: projects.data ?? [],
    subscription: subscriptions.data ?? null,
    invoices: invoices.data ?? [],
  }

  const { data, error: insertError } = await (admin.from("account_export_requests") as any)
    .insert({
      user_id: user.id,
      status: "ready",
      payload,
      completed_at: new Date().toISOString(),
    })
    .select("id, status, payload, created_at, completed_at")
    .single()

  if (insertError || !data) {
    return NextResponse.json({ error: "Failed to save export request" }, { status: 500, headers: IAM_JSON_HEADERS })
  }

  return NextResponse.json({ ok: true, export: data }, { status: 202, headers: IAM_JSON_HEADERS })
}
