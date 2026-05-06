import { NextRequest, NextResponse } from "next/server"
import { apiIpLimitOr429, pdfExportLimitOr429 } from "@/core/security/api-ip-limit"
import { zodErrorJsonResponse } from "@/core/http/json"
import { guardOrgApi } from "@/modules/iam/application/api-guard"
import { logBusinessEvent, logSecurityEvent } from "@/modules/master-admin/application/events"
import { createServiceRoleSupabase } from "@/modules/master-admin/security/admin-privileges"
import { getEffectivePlan } from "@/modules/billing/domain/subscription"
import type { Subscription } from "@/infrastructure/db/types/database"
import { z } from "zod"

export const dynamic = "force-dynamic"

const PDF_HEADERS = { "Cache-Control": "no-store, max-age=0" } as const

const exportPdfSchema = z
  .object({
    mode: z.enum(["watermarked", "clean"]),
    content: z.string().max(600_000).optional(),
    paymentId: z.string().min(1).max(120).optional(),
  })
  .strict()

type ConsumePdfPurchaseResult = {
  status?: "consumed" | "already_consumed" | "not_found"
  amount_paise?: number
  purchase_id?: string
  consumed_at?: string
}

function safePdfFilename(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80)

  return `${cleaned || "screenplay"}.pdf`
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const tooMany = await apiIpLimitOr429(req)
  if (tooMany) return tooMany

  const gate = await guardOrgApi(req, "project:read")
  if (!gate.ok) return gate.response
  const { supabase, userId, orgId } = gate

  const exportLimited = await pdfExportLimitOr429(req, userId)
  if (exportLimited) return exportLimited

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: PDF_HEADERS })
  }

  const parsed = exportPdfSchema.safeParse(raw)
  if (!parsed.success) return zodErrorJsonResponse(parsed.error)

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, title, content")
    .eq("id", id)
    .eq("org_id", orgId)
    .single()

  if (error || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404, headers: PDF_HEADERS })
  }

  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("plan, status")
    .eq("user_id", userId)
    .maybeSingle()

  const plan = getEffectivePlan(subRow as Pick<Subscription, "plan" | "status"> | null)
  const mode = parsed.data.mode
  const content = (parsed.data.content ?? project.content ?? "").trim()

  if (!content) {
    return NextResponse.json(
      { error: "No screenplay content to export. Add text or save your draft first." },
      { status: 400, headers: PDF_HEADERS }
    )
  }

  let watermark = mode === "watermarked"
  let amountPaise: number | null = null

  if (mode === "clean" && plan === "free") {
    if (!parsed.data.paymentId) {
      void logSecurityEvent(req, {
        eventType: "payment.pdf_export_consume_failure",
        severity: "low",
        outcome: "failure",
        actorUserId: userId,
        targetUserId: userId,
        statusCode: 402,
        metadata: { reason: "missing_payment_id", projectId: id, orgId },
      }).catch(() => {})
      return NextResponse.json(
        { error: "Clean PDF payment required" },
        { status: 402, headers: PDF_HEADERS }
      )
    }

    const admin = createServiceRoleSupabase()
    if (!admin) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500, headers: PDF_HEADERS }
      )
    }

    const { data: consumedRaw, error: consumeError } = await admin.rpc("consume_pdf_export_purchase", {
      p_payment_id: parsed.data.paymentId,
      p_user_id: userId,
      p_org_id: orgId,
      p_project_id: id,
    })

    if (consumeError) {
      return NextResponse.json({ error: consumeError.message }, { status: 500, headers: PDF_HEADERS })
    }

    const consumed = consumedRaw as ConsumePdfPurchaseResult | null

    if (!consumed || consumed.status === "not_found") {
      void logBusinessEvent(req, {
        eventType: "pdf_export.consume_pending",
        userId,
        outcome: "pending",
        metadata: { reason: "purchase_not_found", projectId: id, orgId, paymentId: parsed.data.paymentId },
      }).catch(() => {})
      return NextResponse.json(
        { error: "Clean PDF payment is not available yet. Try again after payment confirmation." },
        { status: 402, headers: PDF_HEADERS }
      )
    }

    if (consumed.status === "already_consumed") {
      void logSecurityEvent(req, {
        eventType: "payment.pdf_export_consume_failure",
        severity: "medium",
        outcome: "blocked",
        actorUserId: userId,
        targetUserId: userId,
        statusCode: 409,
        metadata: {
          reason: "purchase_already_consumed",
          projectId: id,
          orgId,
          paymentId: parsed.data.paymentId,
          purchaseId: consumed.purchase_id ?? null,
          consumedAt: consumed.consumed_at ?? null,
        },
      }).catch(() => {})
      return NextResponse.json(
        { error: "Clean PDF purchase already used" },
        { status: 409, headers: PDF_HEADERS }
      )
    }

    if (consumed.status !== "consumed" || typeof consumed.amount_paise !== "number") {
      void logSecurityEvent(req, {
        eventType: "payment.pdf_export_consume_failure",
        severity: "high",
        outcome: "failure",
        actorUserId: userId,
        targetUserId: userId,
        statusCode: 500,
        metadata: { reason: "invalid_consume_rpc_response", projectId: id, orgId, paymentId: parsed.data.paymentId },
      }).catch(() => {})
      return NextResponse.json({ error: "Clean PDF purchase could not be consumed" }, { status: 500, headers: PDF_HEADERS })
    }

    watermark = false
    amountPaise = consumed.amount_paise
  } else if (mode === "clean") {
    watermark = false
  }

  try {
    const { buildScreenplayPdfBuffer } = await import("@/modules/editor/infrastructure/screenplay-pdf")
    const title = project.title?.trim() || "Untitled Screenplay"
    const pdfBuffer = await buildScreenplayPdfBuffer(title, content, undefined, watermark)

    void logBusinessEvent(req, {
      eventType: "pdf_export.downloaded",
      userId,
      plan,
      amountPaise,
      metadata: {
        projectId: id,
        orgId,
        mode,
        watermarked: watermark,
        paymentId: parsed.data.paymentId ?? null,
      },
    }).catch(() => {})

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        ...PDF_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safePdfFilename(title)}"`,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to build PDF"
    console.error("[export-pdf]", e)
    return NextResponse.json({ error: message }, { status: 500, headers: PDF_HEADERS })
  }
}
