import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { guardOrgApi, IAM_JSON_HEADERS } from "@/modules/iam/application/api-guard"

export const dynamic = "force-dynamic"

const paramsSchema = z.object({ id: z.string().uuid() })

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await guardOrgApi(req, "billing:read")
  if (!gate.ok) return gate.response

  const parsedParams = paramsSchema.safeParse(await params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid invoice id" }, { status: 400, headers: IAM_JSON_HEADERS })
  }

  const { data, error } = await (gate.supabase.from("billing_invoices") as any)
    .select("*")
    .eq("id", parsedParams.data.id)
    .or(`user_id.eq.${gate.userId},org_id.eq.${gate.orgId}`)
    .maybeSingle()

  if (error) return NextResponse.json({ error: "Failed to load invoice" }, { status: 500, headers: IAM_JSON_HEADERS })
  if (!data) return NextResponse.json({ error: "Invoice not found" }, { status: 404, headers: IAM_JSON_HEADERS })

  return NextResponse.json({ ok: true, invoice: data }, { headers: IAM_JSON_HEADERS })
}
