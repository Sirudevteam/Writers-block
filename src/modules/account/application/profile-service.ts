import type { PostgrestError, User } from "@supabase/supabase-js"
import { AppError } from "@/core/errors/app-error"
import type { ProfileUpdateInput } from "@/modules/account/domain/schemas"
import {
  bootstrapProfileForUser,
  getProfileById,
  type AccountDbClient,
  type ProfileRow,
  updateProfileById,
} from "@/modules/account/infrastructure/profile-repository"

function isMissingProfileError(error: PostgrestError): boolean {
  return (
    error.code === "PGRST116" ||
    /0 rows/i.test(error.details ?? "") ||
    /no rows/i.test(error.message ?? "")
  )
}

function throwProfileError(error: PostgrestError): never {
  throw new AppError(error.message, 500, {
    code: error.code,
    expose: true,
    cause: error,
  })
}

export async function getCurrentUserProfile(
  client: AccountDbClient,
  user: User
): Promise<ProfileRow> {
  const { data, error } = await getProfileById(client, user.id)

  if (!error && data) {
    return data
  }

  if (error && isMissingProfileError(error)) {
    const bootstrap = await bootstrapProfileForUser(client, user)
    if (!bootstrap.error && bootstrap.data) {
      return bootstrap.data
    }
  }

  if (error) {
    throwProfileError(error)
  }

  throw new AppError("Profile not found", 404)
}

export async function updateCurrentUserProfile(
  client: AccountDbClient,
  userId: string,
  input: ProfileUpdateInput
): Promise<ProfileRow> {
  const { data, error } = await updateProfileById(client, userId, input)

  if (error) {
    throwProfileError(error)
  }

  if (!data) {
    throw new AppError("Profile not found", 404)
  }

  return data
}
