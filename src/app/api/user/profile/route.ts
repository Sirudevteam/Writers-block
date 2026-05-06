import { type NextRequest, NextResponse } from "next/server"
import { toHttpErrorShape } from "@/core/errors/app-error"
import { NO_STORE_HEADERS } from "@/core/http/cache"
import { parseJsonRequest } from "@/core/http/validation"
import { apiIpLimitOr429 } from "@/core/security/api-ip-limit"
import { createClient } from "@/infrastructure/db/supabase/server"
import {
  getCurrentUserProfile,
  updateCurrentUserProfile,
} from "@/modules/account/application/profile-service"
import { profileUpdateSchema } from "@/modules/account/domain/schemas"

function noStoreJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  headers.set("Cache-Control", NO_STORE_HEADERS["Cache-Control"])

  return NextResponse.json(body, {
    ...init,
    headers,
  })
}

function profileErrorJson(error: unknown) {
  const shape = toHttpErrorShape(error)
  return noStoreJson({ error: shape.message }, { status: shape.status })
}

export async function GET(request: NextRequest) {
  const tooMany = await apiIpLimitOr429(request)
  if (tooMany) return tooMany

  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return noStoreJson({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    return noStoreJson(await getCurrentUserProfile(supabase, user))
  } catch (error) {
    return profileErrorJson(error)
  }
}

export async function PUT(request: NextRequest) {
  const tooMany = await apiIpLimitOr429(request)
  if (tooMany) return tooMany

  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return noStoreJson({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = await parseJsonRequest(request, profileUpdateSchema)
  if (!parsed.ok) {
    const message =
      parsed.error === "Invalid JSON body" ? parsed.error : "Invalid input"
    return noStoreJson({ error: message }, { status: parsed.status })
  }

  try {
    return noStoreJson(
      await updateCurrentUserProfile(supabase, user.id, parsed.data)
    )
  } catch (error) {
    return profileErrorJson(error)
  }
}
