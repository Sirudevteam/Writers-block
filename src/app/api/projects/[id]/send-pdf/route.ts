import { NextRequest, NextResponse } from "next/server"
import { apiIpLimitOr429 } from "@/core/security/api-ip-limit"
import { guardOrgApi } from "@/modules/iam/application/api-guard"
import { sendScreenplayPdfEmail } from "@/infrastructure/email/email-service"
import { getEffectivePlan } from "@/modules/billing/domain/subscription"
import type { Subscription } from "@/infrastructure/db/types/database"
import { sendPdfSchema } from "@/modules/ai/domain/schemas"
import { zodErrorJsonResponse } from "@/core/http/json"
import { logBusinessEvent } from "@/modules/master-admin/application/events"

export const dynamic = "force-dynamic"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const tooMany = await apiIpLimitOr429(req)
  if (tooMany) return tooMany

  const gate = await guardOrgApi(req, "project:read")
  if (!gate.ok) return gate.response
  const { supabase, userId, userEmail, orgId } = gate

  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let bodyContent: string | undefined
  try {
    const body = await req.json()
    const parsed = sendPdfSchema.safeParse(body)
    if (!parsed.success) return zodErrorJsonResponse(parsed.error)
    bodyContent = parsed.data.content
  } catch {
    /* optional body */
  }

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, title, content")
    .eq("id", id)
    .eq("org_id", orgId)
    .single()

  if (error || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("plan, status")
    .eq("user_id", userId)
    .maybeSingle()
  const plan = getEffectivePlan(subRow as Pick<Subscription, "plan" | "status"> | null)
  const watermark = plan === "free"

  const content = (bodyContent ?? project.content ?? "").trim()
  if (!content) {
    return NextResponse.json(
      { error: "No screenplay content to send. Add text or save your draft first." },
      { status: 400 }
    )
  }

  const title = project.title?.trim() || "Untitled Screenplay"

  try {
    const { buildScreenplayPdfBuffer } = await import("@/modules/editor/infrastructure/screenplay-pdf")
    const pdfBuffer = await buildScreenplayPdfBuffer(title, content, undefined, watermark)
    const sent = await sendScreenplayPdfEmail(userEmail, title, pdfBuffer)

    if (!sent) {
      return NextResponse.json(
        {
          error:
            "Email could not be sent. Ensure RESEND_API_KEY and RESEND_FROM_EMAIL are configured.",
        },
        { status: 503 }
      )
    }

    void logBusinessEvent(req, {
      eventType: "document.pdf_sent",
      userId,
      plan,
      metadata: { projectId: id, orgId, watermarked: watermark },
    }).catch(() => {})

    return NextResponse.json(
      { success: true, message: `PDF sent to ${userEmail}` },
      {
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to build PDF"
    console.error("[send-pdf]", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
