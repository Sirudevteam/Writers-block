import type { SupabaseClient, User } from "@supabase/supabase-js"
import type { ProfileUpdateInput } from "@/modules/account/domain/schemas"
import type { Database } from "@/infrastructure/db/types/database"

export type AccountDbClient = SupabaseClient<Database>
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"]

function metadataString(
  metadata: Record<string, unknown>,
  key: string
): string | null {
  const value = metadata[key]
  return typeof value === "string" ? value : null
}

export function getProfileById(client: AccountDbClient, userId: string) {
  return client.from("profiles").select("*").eq("id", userId).single()
}

export function bootstrapProfileForUser(client: AccountDbClient, user: User) {
  const metadata = user.user_metadata as Record<string, unknown>

  return client
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email ?? "",
        full_name:
          metadataString(metadata, "full_name") ?? metadataString(metadata, "name"),
        avatar_url: metadataString(metadata, "avatar_url"),
        bio: null,
      },
      { onConflict: "id" }
    )
    .select("*")
    .single()
}

export function updateProfileById(
  client: AccountDbClient,
  userId: string,
  input: ProfileUpdateInput
) {
  const updateData: Database["public"]["Tables"]["profiles"]["Update"] = {}

  if (input.full_name !== undefined) updateData.full_name = input.full_name
  if (input.bio !== undefined) updateData.bio = input.bio
  if (input.avatar_url !== undefined) updateData.avatar_url = input.avatar_url

  return client
    .from("profiles")
    .update(updateData)
    .eq("id", userId)
    .select("*")
    .single()
}
