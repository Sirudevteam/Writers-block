/** Fired after profile is updated via API so `useUser()` can refetch (same-tab SPA). */
export const PROFILE_UPDATED_EVENT = "writersblock:profile-updated"

export function dispatchProfileUpdated(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT))
}
