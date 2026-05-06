export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  user_auth: {
    Tables: {
      otp_challenges: {
        Row: {
          id: string
          email: string
          purpose: "signup" | "signin" | "password_reset"
          user_id: string
          code_hash: string
          encrypted_payload: string | null
          attempt_count: number
          max_attempts: number
          locked_at: string | null
          created_at: string
          expires_at: string
          consumed_at: string | null
        }
        Insert: {
          id?: string
          email: string
          purpose: "signup" | "signin" | "password_reset"
          user_id: string
          code_hash: string
          encrypted_payload?: string | null
          attempt_count?: number
          max_attempts?: number
          locked_at?: string | null
          created_at?: string
          expires_at: string
          consumed_at?: string | null
        }
        Update: {
          attempt_count?: number
          max_attempts?: number
          locked_at?: string | null
          consumed_at?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
  master_admin: {
    Tables: {
      users: {
        Row: {
          user_id: string
          created_at: string
          note: string | null
        }
        Insert: {
          user_id: string
          created_at?: string
          note?: string | null
        }
        Update: {
          note?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: number
          created_at: string
          user_id: string | null
          method: string
          route: string
          host: string | null
          ip_hash: string | null
        }
        Insert: {
          id?: number
          created_at?: string
          user_id?: string | null
          method: string
          route: string
          host?: string | null
          ip_hash?: string | null
        }
        Update: Record<string, never>
        Relationships: []
      }
      signup_risk_events: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          user_id: string
          email_domain: string
          ip_hash: string | null
          user_agent_hash: string | null
          country: string | null
          verified_at: string | null
          risk_score: number
          risk_level: "low" | "medium" | "high"
          risk_reasons: Json
          review_status: "not_required" | "open" | "reviewed_safe" | "confirmed_abuse"
          reviewed_by: string | null
          reviewed_at: string | null
          review_note: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          user_id: string
          email_domain: string
          ip_hash?: string | null
          user_agent_hash?: string | null
          country?: string | null
          verified_at?: string | null
          risk_score?: number
          risk_level?: "low" | "medium" | "high"
          risk_reasons?: Json
          review_status?: "not_required" | "open" | "reviewed_safe" | "confirmed_abuse"
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_note?: string | null
        }
        Update: {
          updated_at?: string
          verified_at?: string | null
          risk_score?: number
          risk_level?: "low" | "medium" | "high"
          risk_reasons?: Json
          review_status?: "not_required" | "open" | "reviewed_safe" | "confirmed_abuse"
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_note?: string | null
        }
        Relationships: []
      }
      security_events: {
        Row: {
          id: string
          created_at: string
          event_type: string
          severity: "low" | "medium" | "high" | "critical"
          outcome: "success" | "failure" | "blocked" | "info"
          review_status: "not_required" | "open" | "acknowledged" | "resolved" | "ignored"
          actor_user_id: string | null
          target_user_id: string | null
          method: string | null
          route: string | null
          status_code: number | null
          ip_hash: string | null
          user_agent_hash: string | null
          country: string | null
          metadata: Json
          reviewed_by: string | null
          reviewed_at: string | null
          review_note: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          event_type: string
          severity?: "low" | "medium" | "high" | "critical"
          outcome?: "success" | "failure" | "blocked" | "info"
          review_status?: "not_required" | "open" | "acknowledged" | "resolved" | "ignored"
          actor_user_id?: string | null
          target_user_id?: string | null
          method?: string | null
          route?: string | null
          status_code?: number | null
          ip_hash?: string | null
          user_agent_hash?: string | null
          country?: string | null
          metadata?: Json
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_note?: string | null
        }
        Update: {
          review_status?: "not_required" | "open" | "acknowledged" | "resolved" | "ignored"
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_note?: string | null
        }
        Relationships: []
      }
        business_events: {
          Row: {
            id: string
          created_at: string
          event_type: string
          user_id: string | null
          outcome: "success" | "failure" | "pending" | "info"
          plan: string | null
          billing_cycle: string | null
          amount_paise: number | null
          route: string | null
          metadata: Json
          ip_hash: string | null
          user_agent_hash: string | null
          country: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          event_type: string
          user_id?: string | null
          outcome?: "success" | "failure" | "pending" | "info"
          plan?: string | null
          billing_cycle?: string | null
          amount_paise?: number | null
          route?: string | null
          metadata?: Json
          ip_hash?: string | null
          user_agent_hash?: string | null
          country?: string | null
        }
          Update: Record<string, never>
          Relationships: []
        }
        payment_post_process_jobs: {
          Row: {
            razorpay_payment_id: string
            razorpay_order_id: string
            user_id: string
            plan: "pro" | "premium"
            billing_cycle: "monthly" | "annual"
            amount_paise: number
            current_period_end: string
            status: "pending" | "processing" | "completed" | "failed"
            attempts: number
            locked_at: string | null
            completed_at: string | null
            last_error: string | null
            subscription_event_inserted_at: string | null
            business_event_logged_at: string | null
            email_sent_at: string | null
            created_at: string
            updated_at: string
          }
          Insert: {
            razorpay_payment_id: string
            razorpay_order_id: string
            user_id: string
            plan: "pro" | "premium"
            billing_cycle: "monthly" | "annual"
            amount_paise: number
            current_period_end: string
            status?: "pending" | "processing" | "completed" | "failed"
            attempts?: number
            locked_at?: string | null
            completed_at?: string | null
            last_error?: string | null
            subscription_event_inserted_at?: string | null
            business_event_logged_at?: string | null
            email_sent_at?: string | null
            created_at?: string
            updated_at?: string
          }
          Update: {
            razorpay_order_id?: string
            user_id?: string
            plan?: "pro" | "premium"
            billing_cycle?: "monthly" | "annual"
            amount_paise?: number
            current_period_end?: string
            status?: "pending" | "processing" | "completed" | "failed"
            attempts?: number
            locked_at?: string | null
            completed_at?: string | null
            last_error?: string | null
            subscription_event_inserted_at?: string | null
            business_event_logged_at?: string | null
            email_sent_at?: string | null
            updated_at?: string
          }
          Relationships: []
        }
        user_account_controls: {
          Row: {
          user_id: string
          status: "active" | "suspended" | "review_required"
          reason: string | null
          note: string | null
          actor_user_id: string | null
          created_at: string
          updated_at: string
          suspended_at: string | null
          reinstated_at: string | null
          revoked_sessions_at: string | null
        }
        Insert: {
          user_id: string
          status?: "active" | "suspended" | "review_required"
          reason?: string | null
          note?: string | null
          actor_user_id?: string | null
          created_at?: string
          updated_at?: string
          suspended_at?: string | null
          reinstated_at?: string | null
          revoked_sessions_at?: string | null
        }
        Update: {
          status?: "active" | "suspended" | "review_required"
          reason?: string | null
          note?: string | null
          actor_user_id?: string | null
          updated_at?: string
          suspended_at?: string | null
          reinstated_at?: string | null
          revoked_sessions_at?: string | null
        }
        Relationships: []
      }
      user_notes: {
        Row: {
          id: string
          created_at: string
          target_user_id: string
          author_user_id: string | null
          note: string
        }
        Insert: {
          id?: string
          created_at?: string
          target_user_id: string
          author_user_id?: string | null
          note: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      otp_challenges: {
        Row: {
          id: string
          email: string
          user_id: string
          code_hash: string
          encrypted_payload: string
          attempt_count: number
          max_attempts: number
          locked_at: string | null
          created_at: string
          expires_at: string
          consumed_at: string | null
        }
        Insert: {
          id?: string
          email: string
          user_id: string
          code_hash: string
          encrypted_payload: string
          attempt_count?: number
          max_attempts?: number
          locked_at?: string | null
          created_at?: string
          expires_at: string
          consumed_at?: string | null
        }
        Update: {
          attempt_count?: number
          max_attempts?: number
          locked_at?: string | null
          consumed_at?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          full_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          id: string
          kind: "personal" | "team"
          name: string
          slug: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          kind: "personal" | "team"
          name: string
          slug: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          kind?: "personal" | "team"
          name?: string
          slug?: string
          created_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          org_id: string
          user_id: string
          role: "owner" | "admin" | "member" | "billing"
          created_at: string
        }
        Insert: {
          org_id: string
          user_id: string
          role: "owner" | "admin" | "member" | "billing"
          created_at?: string
        }
        Update: {
          role?: "owner" | "admin" | "member" | "billing"
        }
        Relationships: []
      }
      organization_invites: {
        Row: {
          id: string
          org_id: string
          email: string
          role: "admin" | "member" | "billing"
          token_hash: string
          invited_by: string | null
          created_at: string
          expires_at: string
          accepted_at: string | null
          accepted_by: string | null
          revoked_at: string | null
          revoked_by: string | null
          resend_count: number
          last_sent_at: string | null
        }
        Insert: {
          id?: string
          org_id: string
          email: string
          role: "admin" | "member" | "billing"
          token_hash: string
          invited_by?: string | null
          created_at?: string
          expires_at: string
          accepted_at?: string | null
          accepted_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          resend_count?: number
          last_sent_at?: string | null
        }
        Update: {
          token_hash?: string
          expires_at?: string
          accepted_at?: string | null
          accepted_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          resend_count?: number
          last_sent_at?: string | null
        }
        Relationships: []
      }
      iam_audit_log: {
        Row: {
          id: number
          created_at: string
          actor_user_id: string | null
          org_id: string | null
          action: string
          target_type: string
          target_id: string
          ip_hash: string | null
          metadata: Json
        }
        Insert: {
          id?: number
          created_at?: string
          actor_user_id?: string | null
          org_id?: string | null
          action: string
          target_type: string
          target_id: string
          ip_hash?: string | null
          metadata?: Json
        }
        Update: Record<string, never>
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          plan: "free" | "pro" | "premium"
          projects_limit: number
          status: "active" | "trialing" | "past_due" | "cancelled" | "expired"
          billing_cycle: "monthly" | "annual"
          current_period_start: string | null
          current_period_end: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_subscription_id: string | null
          razorpay_customer_id: string | null
          grace_period_end: string | null
          cancel_at_period_end: boolean
          cancelled_at: string | null
          last_webhook_event: string | null
          expiry_warning_sent_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          plan?: "free" | "pro" | "premium"
          projects_limit?: number
          status?: "active" | "trialing" | "past_due" | "cancelled" | "expired"
          billing_cycle?: "monthly" | "annual"
          current_period_start?: string | null
          current_period_end?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_subscription_id?: string | null
          razorpay_customer_id?: string | null
          grace_period_end?: string | null
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          last_webhook_event?: string | null
          expiry_warning_sent_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          plan?: "free" | "pro" | "premium"
          projects_limit?: number
          status?: "active" | "trialing" | "past_due" | "cancelled" | "expired"
          billing_cycle?: "monthly" | "annual"
          current_period_start?: string | null
          current_period_end?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_subscription_id?: string | null
          razorpay_customer_id?: string | null
          grace_period_end?: string | null
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          last_webhook_event?: string | null
          expiry_warning_sent_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      subscription_events: {
        Row: {
          id: string
          user_id: string
          event_type: "activated" | "authenticated" | "charged" | "upgraded" | "downgraded" | "past_due" | "expired" | "cancelled" | "reactivated" | "refunded" | "disputed"
          from_plan: string | null
          to_plan: string
          billing_cycle: string | null
          razorpay_payment_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          event_type: "activated" | "authenticated" | "charged" | "upgraded" | "downgraded" | "past_due" | "expired" | "cancelled" | "reactivated" | "refunded" | "disputed"
          from_plan?: string | null
          to_plan: string
          billing_cycle?: string | null
          razorpay_payment_id?: string | null
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      usage_logs: {
        Row: {
          id: string
          user_id: string | null
          endpoint: string
          plan: string
          provider: string | null
          model: string | null
          complexity: "simple" | "standard" | "complex"
          original_complexity: string | null
          input_tokens: number
          output_tokens: number
          cached_input_tokens: number
          cache_creation_input_tokens: number
          total_tokens: number
          cost_usd: number
          cost_inr: number
          latency_ms: number | null
          status: "success" | "failed"
          usage_source: "provider" | "estimated"
          error_message: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          endpoint: string
          plan?: string
          provider?: string | null
          model?: string | null
          complexity?: "simple" | "standard" | "complex"
          original_complexity?: string | null
          input_tokens?: number
          output_tokens?: number
          cached_input_tokens?: number
          cache_creation_input_tokens?: number
          total_tokens?: number
          cost_usd?: number
          cost_inr?: number
          latency_ms?: number | null
          status?: "success" | "failed"
          usage_source?: "provider" | "estimated"
          error_message?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      ai_usage_monthly: {
        Row: {
          user_id: string
          month_start: string
          plan: string
          input_tokens: number
          output_tokens: number
          cached_input_tokens: number
          cache_creation_input_tokens: number
          cost_usd: number
          cost_inr: number
          request_count: number
          updated_at: string
        }
        Insert: {
          user_id: string
          month_start: string
          plan?: string
          input_tokens?: number
          output_tokens?: number
          cached_input_tokens?: number
          cache_creation_input_tokens?: number
          cost_usd?: number
          cost_inr?: number
          request_count?: number
          updated_at?: string
        }
        Update: {
          plan?: string
          input_tokens?: number
          output_tokens?: number
          cached_input_tokens?: number
          cache_creation_input_tokens?: number
          cost_usd?: number
          cost_inr?: number
          request_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_credit_topup_purchases: {
        Row: {
          id: string
          user_id: string
          razorpay_payment_id: string
          razorpay_order_id: string
          amount_paise: number
          credits_granted: number
          credits_remaining: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          razorpay_payment_id: string
          razorpay_order_id: string
          amount_paise: number
          credits_granted: number
          credits_remaining: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          credits_remaining?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_credit_reservations: {
        Row: {
          id: string
          user_id: string
          request_id: string
          required_credits: number
          credits_reserved: number
          included_remaining_at_reservation: number
          actual_credits: number | null
          consumed_credits: number
          status: "pending" | "consumed" | "released"
          expires_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          request_id: string
          required_credits: number
          credits_reserved?: number
          included_remaining_at_reservation?: number
          actual_credits?: number | null
          consumed_credits?: number
          status?: "pending" | "consumed" | "released"
          expires_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          actual_credits?: number | null
          consumed_credits?: number
          status?: "pending" | "consumed" | "released"
          expires_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_credit_reservation_allocations: {
        Row: {
          id: string
          reservation_id: string
          purchase_id: string
          credits_reserved: number
          credits_consumed: number
          created_at: string
        }
        Insert: {
          id?: string
          reservation_id: string
          purchase_id: string
          credits_reserved: number
          credits_consumed?: number
          created_at?: string
        }
        Update: {
          credits_consumed?: number
        }
        Relationships: []
      }
      ai_prompt_cache_entries: {
        Row: {
          id: string
          user_id: string
          org_id: string | null
          project_id: string | null
          provider: string
          model: string
          strategy: "project_context"
          context_hash: string
          provider_cache_id: string | null
          token_count: number
          expires_at: string | null
          use_count: number
          last_used_at: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          org_id?: string | null
          project_id?: string | null
          provider: string
          model: string
          strategy: "project_context"
          context_hash: string
          provider_cache_id?: string | null
          token_count?: number
          expires_at?: string | null
          use_count?: number
          last_used_at?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          provider_cache_id?: string | null
          token_count?: number
          expires_at?: string | null
          use_count?: number
          last_used_at?: string | null
          metadata?: Json
          updated_at?: string
        }
        Relationships: []
      }
      ai_batch_jobs: {
        Row: {
          id: string
          user_id: string
          org_id: string | null
          project_id: string | null
          endpoint: string
          status: "queued" | "processing" | "completed" | "failed" | "cancelled"
          request_hash: string
          payload: Json
          result: Json | null
          error_message: string | null
          attempts: number
          locked_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          org_id?: string | null
          project_id?: string | null
          endpoint: string
          status?: "queued" | "processing" | "completed" | "failed" | "cancelled"
          request_hash: string
          payload?: Json
          result?: Json | null
          error_message?: string | null
          attempts?: number
          locked_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: "queued" | "processing" | "completed" | "failed" | "cancelled"
          result?: Json | null
          error_message?: string | null
          attempts?: number
          locked_at?: string | null
          completed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_generation_feedback: {
        Row: {
          id: string
          user_id: string
          usage_log_id: string | null
          request_id: string
          endpoint: string
          provider: string | null
          model: string | null
          complexity: string | null
          rating: -1 | 1
          reason: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          usage_log_id?: string | null
          request_id: string
          endpoint: string
          provider?: string | null
          model?: string | null
          complexity?: string | null
          rating: -1 | 1
          reason?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      project_memory_status: {
        Row: {
          project_id: string
          user_id: string
          org_id: string
          content_hash: string
          status: "pending" | "processing" | "ready" | "failed"
          attempts: number
          locked_at: string | null
          last_indexed_at: string | null
          error_message: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          project_id: string
          user_id: string
          org_id: string
          content_hash: string
          status?: "pending" | "processing" | "ready" | "failed"
          attempts?: number
          locked_at?: string | null
          last_indexed_at?: string | null
          error_message?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          content_hash?: string
          status?: "pending" | "processing" | "ready" | "failed"
          attempts?: number
          locked_at?: string | null
          last_indexed_at?: string | null
          error_message?: string | null
          metadata?: Json
          updated_at?: string
        }
        Relationships: []
      }
      project_story_memory: {
        Row: {
          id: string
          user_id: string
          org_id: string
          project_id: string
          kind: "project_summary" | "character" | "scene" | "arc" | "continuity_note"
          source_hash: string
          source_anchor: string | null
          content: string
          embedding: string
          embedding_model: string
          token_count: number
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          org_id: string
          project_id: string
          kind: "project_summary" | "character" | "scene" | "arc" | "continuity_note"
          source_hash: string
          source_anchor?: string | null
          content: string
          embedding: string
          embedding_model?: string
          token_count?: number
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          source_anchor?: string | null
          content?: string
          embedding?: string
          embedding_model?: string
          token_count?: number
          metadata?: Json
          updated_at?: string
        }
        Relationships: []
      }
      project_story_bible_entries: {
        Row: {
          id: string
          project_id: string
          org_id: string
          user_id: string
          kind: "character" | "scene" | "arc" | "continuity_note" | "style_rule"
          title: string
          content: string
          metadata: Json
          source: "manual" | "ai_suggested" | "imported" | "system"
          pinned: boolean
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          org_id: string
          user_id: string
          kind: "character" | "scene" | "arc" | "continuity_note" | "style_rule"
          title: string
          content: string
          metadata?: Json
          source?: "manual" | "ai_suggested" | "imported" | "system"
          pinned?: boolean
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          kind?: "character" | "scene" | "arc" | "continuity_note" | "style_rule"
          title?: string
          content?: string
          metadata?: Json
          source?: "manual" | "ai_suggested" | "imported" | "system"
          pinned?: boolean
          deleted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          id: string
          org_id: string
          user_id: string
          title: string
          description: string | null
          genre: string | null
          characters: string | null
          location: string | null
          mood: string | null
          content: string | null
          status: "draft" | "in_progress" | "completed"
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id: string
          title: string
          description?: string | null
          genre?: string | null
          characters?: string | null
          location?: string | null
          mood?: string | null
          content?: string | null
          status?: "draft" | "in_progress" | "completed"
          created_at?: string
          updated_at?: string
        }
        Update: {
          org_id?: string
          title?: string
          description?: string | null
          genre?: string | null
          characters?: string | null
          location?: string | null
          mood?: string | null
          content?: string | null
          status?: "draft" | "in_progress" | "completed"
          updated_at?: string
        }
        Relationships: []
      }
      project_creation_usage: {
        Row: {
          user_id: string
          free_lifetime_created: number
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          free_lifetime_created?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          free_lifetime_created?: number
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          id: string
          user_id: string
          project_id: string | null
          name: string
          type: string
          size: number | null
          storage_path: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          project_id?: string | null
          name: string
          type: string
          size?: number | null
          storage_path: string
          created_at?: string
        }
        Update: {
          name?: string
        }
        Relationships: []
      }
      razorpay_payments: {
        Row: {
          id: string
          user_id: string
          razorpay_payment_id: string
          razorpay_order_id: string
          amount: number | null
          plan: "pro" | "premium"
          billing_cycle: "monthly" | "annual"
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          razorpay_payment_id: string
          razorpay_order_id: string
          amount?: number | null
          plan: "pro" | "premium"
          billing_cycle: "monthly" | "annual"
          created_at?: string
        }
        Update: {
          amount?: number | null
        }
        Relationships: []
      }
      pdf_export_purchases: {
        Row: {
          id: string
          user_id: string
          org_id: string
          project_id: string
          razorpay_payment_id: string
          razorpay_order_id: string
          amount_paise: number
          consumed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          org_id: string
          project_id: string
          razorpay_payment_id: string
          razorpay_order_id: string
          amount_paise: number
          consumed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          consumed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
      Functions: {
        admin_subscription_group_counts: {
          Args: Record<string, never>
          Returns: Json
        }
        admin_usage_daily_buckets: {
          Args: { p_from: string; p_to: string }
          Returns: Json
        }
        admin_usage_endpoint_breakdown: {
          Args: { p_from: string; p_to: string; p_limit?: number }
          Returns: Json
        }
        admin_signup_daily_buckets: {
          Args: { p_from: string; p_to: string; p_excluded_user_ids?: string[] }
          Returns: Json
        }
        admin_top_users_by_usage: {
          Args: { p_from: string; p_to: string; p_limit?: number; p_excluded_user_ids?: string[] }
          Returns: Json
        }
        record_ai_usage: {
          Args: {
            p_user_id: string
            p_endpoint: string
            p_plan: string
            p_provider: string
            p_model: string
            p_complexity: string
            p_original_complexity: string
            p_input_tokens: number
            p_output_tokens: number
            p_cached_input_tokens: number
            p_cache_creation_input_tokens: number
            p_total_tokens: number
            p_cost_usd: number
            p_cost_inr: number
            p_latency_ms: number
            p_status: string
            p_usage_source: string
            p_error_message?: string | null
            p_metadata?: Json
          }
          Returns: string
        }
        claim_ai_batch_job: {
          Args: { p_job_id?: string | null }
          Returns: Json
        }
        complete_ai_batch_job: {
          Args: { p_job_id: string; p_result: Json }
          Returns: undefined
        }
        fail_ai_batch_job: {
          Args: { p_job_id: string; p_error: string }
          Returns: undefined
        }
        match_project_story_memory: {
          Args: {
            p_query_embedding: string
            p_user_id: string
            p_org_id: string
            p_project_id: string
            p_kinds?: string[] | null
            p_match_count?: number
            p_match_threshold?: number
          }
          Returns: {
            id: string
            kind: string
            source_anchor: string | null
            content: string
            token_count: number
            metadata: Json
            similarity: number
          }[]
        }
        claim_story_memory_job: {
          Args: { p_project_id?: string | null }
          Returns: Json
        }
        complete_story_memory_job: {
          Args: { p_project_id: string; p_content_hash: string; p_metadata?: Json }
          Returns: undefined
        }
        fail_story_memory_job: {
          Args: { p_project_id: string; p_error: string }
          Returns: undefined
        }
        create_project_with_quota: {
          Args: {
            p_user_id: string
            p_org_id: string
            p_title: string
            p_description?: string | null
            p_genre?: string | null
            p_characters?: string | null
            p_location?: string | null
            p_mood?: string | null
            p_content?: string | null
            p_status?: string
          }
          Returns: Json
        }
        admin_business_funnel_counts: {
          Args: { p_from: string; p_to: string; p_event_types: string[] }
          Returns: Json
        }
        admin_mrr_daily_groups: {
          Args: { p_from: string; p_to: string }
          Returns: Json
        }
        admin_payment_ops_order_counts: {
          Args: { p_from: string; p_to: string }
          Returns: Json
        }
        apply_subscription_payment: {
          Args: {
            p_user_id: string
          p_payment_id: string
          p_order_id: string
          p_plan: string
          p_billing_cycle: string
          p_amount: number
          }
          Returns: Json
        }
        consume_pdf_export_purchase: {
          Args: {
            p_payment_id: string
            p_user_id: string
            p_org_id: string
            p_project_id: string
          }
          Returns: Json
        }
        claim_payment_post_process_job: {
          Args: {
            p_payment_id: string
            p_order_id: string
            p_user_id: string
            p_plan: string
            p_billing_cycle: string
            p_amount_paise: number
            p_current_period_end: string
          }
          Returns: Json
        }
        complete_payment_post_process_job: {
          Args: { p_payment_id: string }
          Returns: undefined
        }
        fail_payment_post_process_job: {
          Args: { p_payment_id: string; p_error: string }
          Returns: undefined
        }
      }
    Enums: Record<string, never>
  }
}

// Convenience type aliases
export type Profile = Database["public"]["Tables"]["profiles"]["Row"]
export type SignupRiskEvent = Database["master_admin"]["Tables"]["signup_risk_events"]["Row"]
export type SecurityEvent = Database["master_admin"]["Tables"]["security_events"]["Row"]
export type UserAccountControl = Database["master_admin"]["Tables"]["user_account_controls"]["Row"]
export type OrganizationMember = Database["public"]["Tables"]["organization_members"]["Row"]
export type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"]
export type Project = Database["public"]["Tables"]["projects"]["Row"]
export type AiBatchJob = Database["public"]["Tables"]["ai_batch_jobs"]["Row"]
export type AiCreditTopupPurchase = Database["public"]["Tables"]["ai_credit_topup_purchases"]["Row"]
export type AiCreditReservationRow = Database["public"]["Tables"]["ai_credit_reservations"]["Row"]
export type ProjectMemoryStatus = Database["public"]["Tables"]["project_memory_status"]["Row"]
export type ProjectStoryMemory = Database["public"]["Tables"]["project_story_memory"]["Row"]
export type ProjectStoryBibleEntry = Database["public"]["Tables"]["project_story_bible_entries"]["Row"]
export type RazorpayPayment = Database["public"]["Tables"]["razorpay_payments"]["Row"]
export type PdfExportPurchase = Database["public"]["Tables"]["pdf_export_purchases"]["Row"]

/** Columns returned by project list endpoints (excludes heavy `content` / metadata blobs). */
export type ProjectListRow = Pick<
  Project,
  "id" | "org_id" | "user_id" | "title" | "description" | "genre" | "status" | "created_at" | "updated_at"
>
