"use client"

import { useCallback, useEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/infrastructure/db/supabase/client"
import { PROFILE_UPDATED_EVENT } from "@/modules/account/presentation/profile-events"
import type { Profile, Subscription } from "@/infrastructure/db/types/database"

interface UserState {
  user: User | null
  profile: Profile | null
  subscription: Subscription | null
  loading: boolean
  /** Refetch profile + subscription for the signed-in user (e.g. after settings save). */
  refetch: () => Promise<void>
}

type BrowserSupabaseClient = ReturnType<typeof createClient>

async function loadAccountData(
  supabase: BrowserSupabaseClient,
  userId: string
): Promise<{
  profile: Profile | null
  subscription: Subscription | null
}> {
  const [profileResult, subscriptionResult] = await Promise.allSettled([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase.from("subscriptions").select("*").eq("user_id", userId).maybeSingle(),
  ])

  if (profileResult.status === "rejected") {
    console.error("[useUser] Failed to load profile", profileResult.reason)
  } else if (profileResult.value.error) {
    console.error("[useUser] Failed to load profile", profileResult.value.error)
  }

  if (subscriptionResult.status === "rejected") {
    console.error("[useUser] Failed to load subscription", subscriptionResult.reason)
  } else if (subscriptionResult.value.error) {
    console.error("[useUser] Failed to load subscription", subscriptionResult.value.error)
  }

  return {
    profile:
      profileResult.status === "fulfilled" && !profileResult.value.error
        ? profileResult.value.data
        : null,
    subscription:
      subscriptionResult.status === "fulfilled" && !subscriptionResult.value.error
        ? subscriptionResult.value.data
        : null,
  }
}

export function useUser(): UserState {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    const supabase = createClient()
    try {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()
      setUser(currentUser)
      if (!currentUser) {
        setProfile(null)
        setSubscription(null)
        return
      }
      const accountData = await loadAccountData(supabase, currentUser.id)
      setProfile(accountData.profile)
      setSubscription(accountData.subscription)
    } catch (error) {
      console.error("[useUser] Failed to refetch account data", error)
      setProfile(null)
      setSubscription(null)
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()

    let active = true

    async function loadUser(userId: string) {
      const accountData = await loadAccountData(supabase, userId)
      if (!active) return
      setProfile(accountData.profile)
      setSubscription(accountData.subscription)
    }

    async function init() {
      try {
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser()

        if (!active) return
        setUser(currentUser)
        if (currentUser) {
          await loadUser(currentUser.id)
        } else {
          setProfile(null)
          setSubscription(null)
        }
      } catch (error) {
        console.error("[useUser] Failed to initialize account data", error)
        if (!active) return
        setUser(null)
        setProfile(null)
        setSubscription(null)
      } finally {
        if (active) setLoading(false)
      }
    }

    void init()

    const onProfileUpdated = () => {
      void (async () => {
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser()
        try {
          if (currentUser) await loadUser(currentUser.id)
        } catch (error) {
          console.error("[useUser] Failed to refresh profile update", error)
        }
      })()
    }
    window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated)

    const {
      data: { subscription: authListener },
    } = supabase.auth.onAuthStateChange(async (_, session) => {
      const sessionUser = session?.user ?? null
      setUser(sessionUser)
      if (!sessionUser) {
        setProfile(null)
        setSubscription(null)
        return
      }
      try {
        await loadUser(sessionUser.id)
      } catch (error) {
        console.error("[useUser] Failed to refresh auth state", error)
        setProfile(null)
        setSubscription(null)
      }
    })

    return () => {
      active = false
      authListener.unsubscribe()
      window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated)
    }
  }, [])

  return { user, profile, subscription, loading, refetch }
}
