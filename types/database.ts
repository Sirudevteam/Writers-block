export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      master_admin_users: {
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
      subscriptions: {
        Row: {
          id: string
          user_id: string
          plan: "free" | "pro" | "premium"
          projects_limit: number
          status: "active" | "cancelled" | "expired"
          billing_cycle: "monthly" | "annual"
          current_period_start: string | null
          current_period_end: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          expiry_warning_sent_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          plan?: "free" | "pro" | "premium"
          projects_limit?: number
          status?: "active" | "cancelled" | "expired"
          billing_cycle?: "monthly" | "annual"
          current_period_start?: string | null
          current_period_end?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          expiry_warning_sent_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          plan?: "free" | "pro" | "premium"
          projects_limit?: number
          status?: "active" | "cancelled" | "expired"
          billing_cycle?: "monthly" | "annual"
          current_period_start?: string | null
          current_period_end?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          expiry_warning_sent_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      usage_logs: {
        Row: {
          id: string
          user_id: string | null
          endpoint: string
          plan: string
          ai_credit_reservation_id: string | null
          credits_charged: number
          outcome: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          endpoint: string
          plan?: string
          ai_credit_reservation_id?: string | null
          credits_charged?: number
          outcome?: string
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      ai_credit_topups: {
        Row: {
          id: string
          user_id: string
          credits_granted: number
          source: string
          payment_id: string | null
          expires_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          credits_granted: number
          source?: string
          payment_id?: string | null
          expires_at?: string | null
          created_at?: string
        }
        Update: {
          source?: string
          payment_id?: string | null
          expires_at?: string | null
        }
        Relationships: []
      }
      ai_credit_reservations: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          plan: "free" | "pro" | "premium"
          status: "reserved" | "committed" | "failed_charged" | "released"
          estimated_credits: number
          reserved_included_credits: number
          reserved_topup_credits: number
          charged_included_credits: number
          charged_topup_credits: number
          period_start: string
          period_end: string
          provider_started_at: string | null
          failure_code: string | null
          expires_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          plan: "free" | "pro" | "premium"
          status?: "reserved" | "committed" | "failed_charged" | "released"
          estimated_credits: number
          reserved_included_credits?: number
          reserved_topup_credits?: number
          charged_included_credits?: number
          charged_topup_credits?: number
          period_start: string
          period_end: string
          provider_started_at?: string | null
          failure_code?: string | null
          expires_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: "reserved" | "committed" | "failed_charged" | "released"
          charged_included_credits?: number
          charged_topup_credits?: number
          provider_started_at?: string | null
          failure_code?: string | null
          expires_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          id: string
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
    }
    Views: Record<string, never>
    Functions: {
      admin_subscription_group_counts: {
        Args: Record<string, never>
        Returns: Json
      }
      reserve_ai_credit: {
        Args: {
          p_user_id: string
          p_endpoint: string
          p_plan: string
          p_estimated_credits: number
        }
        Returns: Json
      }
      mark_ai_credit_provider_started: {
        Args: {
          p_reservation_id: string
        }
        Returns: Json
      }
      settle_ai_credit_reservation: {
        Args: {
          p_reservation_id: string
          p_outcome: string
          p_actual_credits?: number | null
          p_failure_code?: string | null
        }
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
    }
    Enums: Record<string, never>
  }
}

// Convenience type aliases
export type Profile = Database["public"]["Tables"]["profiles"]["Row"]
export type MasterAdminUser = Database["public"]["Tables"]["master_admin_users"]["Row"]
export type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"]
export type Project = Database["public"]["Tables"]["projects"]["Row"]
export type Document = Database["public"]["Tables"]["documents"]["Row"]
export type UsageLog = Database["public"]["Tables"]["usage_logs"]["Row"]
export type AiCreditTopup = Database["public"]["Tables"]["ai_credit_topups"]["Row"]
export type AiCreditReservation = Database["public"]["Tables"]["ai_credit_reservations"]["Row"]
export type RazorpayPayment = Database["public"]["Tables"]["razorpay_payments"]["Row"]

/** Columns returned by project list endpoints (excludes heavy `content` / metadata blobs). */
export type ProjectListRow = Pick<
  Project,
  "id" | "user_id" | "title" | "description" | "genre" | "status" | "created_at" | "updated_at"
>
