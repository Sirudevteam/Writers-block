-- ============================================================
-- Writers Block - Complete Fresh Supabase Schema
--
-- Idempotent: safe to re-run in Supabase SQL Editor (adds missing
-- columns, IF NOT EXISTS indexes/constraints, replaces functions).
-- For a new Supabase project, run this single file once from top to bottom.
--
-- Objects: profiles, custom auth/admin schemas, organizations, subscriptions,
-- projects, documents, usage_logs, razorpay_payments, pdf_export_purchases, subscription_events,
-- storage bucket `documents`, helper functions
-- (apply_subscription_payment, admin_subscription_group_counts, IAM guards).
-- ============================================================

-- =========================
-- 1) EXTENSIONS
-- =========================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- Reserved for future fuzzy search / pg_trgm indexes on titles, etc.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- =========================
-- 1a) SCHEMAS
-- =========================
-- User authentication-control data is separated from app domain tables.
CREATE SCHEMA IF NOT EXISTS user_auth;

-- Master Admin control-plane data is isolated from normal customer tables.
CREATE SCHEMA IF NOT EXISTS master_admin;

-- =========================
-- 2) TABLES (dependency order)
-- =========================

-- profiles: extends auth.users with public display fields
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email       TEXT        NOT NULL,
  full_name   TEXT,
  avatar_url  TEXT,
  bio         TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Platform operators: /master-admin and /dashboard/admin (auth still uses auth.users; privileges are isolated here).
-- Grant/revoke workflow and env notes: docs/admin-operators.md (repo root).
-- Grant access: INSERT INTO master_admin.users (user_id) VALUES ('<auth.users.id>');
CREATE TABLE IF NOT EXISTS master_admin.users (
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  note        TEXT
);

-- Append-only style audit for successful Master Admin access (service role only; see docs/admin-operators.md)
CREATE TABLE IF NOT EXISTS master_admin.audit_log (
  id          BIGSERIAL   PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  method      TEXT        NOT NULL,
  route       TEXT        NOT NULL,
  host        TEXT,
  ip_hash     TEXT
);

CREATE INDEX IF NOT EXISTS master_admin_audit_log_created_idx
  ON master_admin.audit_log (created_at DESC);

-- Hash-only signup risk signals for Master Admin fraud review. Raw IPs and
-- user agents are intentionally never stored here.
CREATE TABLE IF NOT EXISTS master_admin.signup_risk_events (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  user_id           UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email_domain      TEXT        NOT NULL,
  ip_hash           TEXT,
  user_agent_hash   TEXT,
  country           TEXT,
  verified_at       TIMESTAMPTZ,
  risk_score        INTEGER     DEFAULT 0 NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level        TEXT        DEFAULT 'low' NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  risk_reasons      JSONB       DEFAULT '[]'::jsonb NOT NULL CHECK (jsonb_typeof(risk_reasons) = 'array'),
  review_status     TEXT        DEFAULT 'not_required' NOT NULL CHECK (
    review_status IN ('not_required', 'open', 'reviewed_safe', 'confirmed_abuse')
  ),
  reviewed_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,
  review_note       TEXT
);

CREATE INDEX IF NOT EXISTS signup_risk_events_created_idx
  ON master_admin.signup_risk_events(created_at DESC);
CREATE INDEX IF NOT EXISTS signup_risk_events_review_idx
  ON master_admin.signup_risk_events(review_status, risk_level, created_at DESC);
CREATE INDEX IF NOT EXISTS signup_risk_events_ip_created_idx
  ON master_admin.signup_risk_events(ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS signup_risk_events_user_idx
  ON master_admin.signup_risk_events(user_id, created_at DESC);

-- Master Admin security telemetry. Hashes only; raw IPs/user agents are never
-- persisted. Service-role only.
CREATE TABLE IF NOT EXISTS master_admin.security_events (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  event_type        TEXT        NOT NULL,
  severity          TEXT        DEFAULT 'low' NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  outcome           TEXT        DEFAULT 'info' NOT NULL CHECK (outcome IN ('success', 'failure', 'blocked', 'info')),
  review_status     TEXT        DEFAULT 'not_required' NOT NULL CHECK (
    review_status IN ('not_required', 'open', 'acknowledged', 'resolved', 'ignored')
  ),
  actor_user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  method            TEXT,
  route             TEXT,
  status_code       INTEGER,
  ip_hash           TEXT,
  user_agent_hash   TEXT,
  country           TEXT,
  metadata          JSONB       DEFAULT '{}'::jsonb NOT NULL,
  reviewed_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,
  review_note       TEXT
);

CREATE INDEX IF NOT EXISTS security_events_created_idx
  ON master_admin.security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_type_created_idx
  ON master_admin.security_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_filter_idx
  ON master_admin.security_events(review_status, severity, outcome, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_actor_idx
  ON master_admin.security_events(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_target_idx
  ON master_admin.security_events(target_user_id, created_at DESC);

-- Business funnel and revenue telemetry. This is operational analytics only;
-- billing source of truth remains Razorpay/subscription tables.
CREATE TABLE IF NOT EXISTS master_admin.business_events (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  event_type        TEXT        NOT NULL,
  user_id           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  outcome           TEXT        DEFAULT 'success' NOT NULL CHECK (outcome IN ('success', 'failure', 'pending', 'info')),
  plan              TEXT,
  billing_cycle     TEXT,
  amount_paise      INTEGER,
  route             TEXT,
  metadata          JSONB       DEFAULT '{}'::jsonb NOT NULL,
  ip_hash           TEXT,
  user_agent_hash   TEXT,
  country           TEXT
);

CREATE INDEX IF NOT EXISTS business_events_created_idx
  ON master_admin.business_events(created_at DESC);
CREATE INDEX IF NOT EXISTS business_events_type_created_idx
  ON master_admin.business_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS business_events_user_type_idx
  ON master_admin.business_events(user_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS business_events_payment_order_idx
  ON master_admin.business_events(event_type, created_at DESC, ((metadata ->> 'orderId')))
  WHERE event_type IN ('payment.order_created', 'payment.webhook_applied');

CREATE UNIQUE INDEX IF NOT EXISTS business_events_webhook_applied_payment_unique_idx
  ON master_admin.business_events(((metadata ->> 'paymentId')), event_type)
  WHERE event_type = 'payment.webhook_applied' AND (metadata ->> 'paymentId') IS NOT NULL;

-- Idempotency ledger for async post-payment side effects. Billing state is
-- still applied only by public.apply_subscription_payment.
CREATE TABLE IF NOT EXISTS master_admin.payment_post_process_jobs (
  razorpay_payment_id          TEXT        PRIMARY KEY,
  razorpay_order_id            TEXT        NOT NULL,
  user_id                      UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plan                         TEXT        NOT NULL CHECK (plan IN ('pro', 'premium')),
  billing_cycle                TEXT        NOT NULL CHECK (billing_cycle IN ('monthly', 'annual')),
  amount_paise                 INTEGER     NOT NULL CHECK (amount_paise >= 0),
  current_period_end           TIMESTAMPTZ NOT NULL,
  status                       TEXT        DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts                     INTEGER     DEFAULT 0 NOT NULL CHECK (attempts >= 0),
  locked_at                    TIMESTAMPTZ,
  completed_at                 TIMESTAMPTZ,
  last_error                   TEXT,
  subscription_event_inserted_at TIMESTAMPTZ,
  business_event_logged_at     TIMESTAMPTZ,
  email_sent_at                TIMESTAMPTZ,
  created_at                   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at                   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS payment_post_process_jobs_status_idx
  ON master_admin.payment_post_process_jobs(status, updated_at DESC);

-- Manual account state controlled by Master Admin. Missing row means active.
CREATE TABLE IF NOT EXISTS master_admin.user_account_controls (
  user_id             UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  status              TEXT        DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'suspended', 'review_required')),
  reason              TEXT,
  note                TEXT,
  actor_user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  suspended_at        TIMESTAMPTZ,
  reinstated_at       TIMESTAMPTZ,
  revoked_sessions_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS user_account_controls_status_idx
  ON master_admin.user_account_controls(status, updated_at DESC);

-- Append-only internal notes for Master Admin user investigations.
CREATE TABLE IF NOT EXISTS master_admin.user_notes (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  target_user_id UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  author_user_id UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  note           TEXT        NOT NULL
);

CREATE INDEX IF NOT EXISTS user_notes_target_created_idx
  ON master_admin.user_notes(target_user_id, created_at DESC);

-- ============================================================
-- Enterprise IAM: organizations, membership, invites, tenant policy, SSO/SCIM, and audit
-- ============================================================

-- organizations: tenant boundary for enterprise accounts (personal orgs are created for each user)
CREATE TABLE IF NOT EXISTS public.organizations (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  kind        TEXT        NOT NULL CHECK (kind IN ('personal', 'team')),
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL,
  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT organizations_slug_key UNIQUE (slug)
);

-- organization membership: minimal RBAC primitive (expand later with fine-grained permissions)
CREATE TABLE IF NOT EXISTS public.organization_members (
  org_id      UUID        REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role        TEXT        NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'billing')),
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  PRIMARY KEY (org_id, user_id)
);

-- invitations: acceptance is handled by trusted server code and hashed tokens
CREATE TABLE IF NOT EXISTS public.organization_invites (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id       UUID        REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  email        TEXT        NOT NULL,
  role         TEXT        NOT NULL CHECK (role IN ('admin', 'member', 'billing')),
  token_hash   TEXT        NOT NULL,
  invited_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  accepted_at  TIMESTAMPTZ,
  accepted_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT organization_invites_token_hash_key UNIQUE (token_hash)
);

ALTER TABLE public.organization_invites
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE public.organization_invites
  ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.organization_invites
  ADD COLUMN IF NOT EXISTS resend_count INTEGER DEFAULT 0 NOT NULL CHECK (resend_count >= 0);
ALTER TABLE public.organization_invites
  ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.organization_security_policies (
  org_id                    UUID        REFERENCES public.organizations(id) ON DELETE CASCADE PRIMARY KEY,
  allowed_domains           TEXT[]      DEFAULT '{}'::text[] NOT NULL,
  verified_domains          TEXT[]      DEFAULT '{}'::text[] NOT NULL,
  require_mfa               BOOLEAN     DEFAULT false NOT NULL,
  require_sso               BOOLEAN     DEFAULT false NOT NULL,
  disable_password_login    BOOLEAN     DEFAULT false NOT NULL,
  session_duration_minutes  INTEGER     DEFAULT 43200 NOT NULL CHECK (session_duration_minutes BETWEEN 15 AND 43200),
  sso_provider_id           TEXT,
  sso_domains               TEXT[]      DEFAULT '{}'::text[] NOT NULL,
  sso_join_policy           TEXT        DEFAULT 'invite_or_domain' NOT NULL CHECK (sso_join_policy IN ('invite_or_domain', 'invite_only')),
  scim_enabled              BOOLEAN     DEFAULT false NOT NULL,
  scim_token_hash           TEXT,
  scim_token_last_rotated_at TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at                TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.scim_provisioned_users (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id       UUID        REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  external_id  TEXT        NOT NULL,
  user_name    TEXT        NOT NULL,
  display_name TEXT,
  role         TEXT        DEFAULT 'member' NOT NULL CHECK (role IN ('admin', 'member', 'billing')),
  active       BOOLEAN     DEFAULT true NOT NULL,
  user_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  raw_payload  JSONB       DEFAULT '{}'::jsonb NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT scim_provisioned_users_org_external_key UNIQUE (org_id, external_id),
  CONSTRAINT scim_provisioned_users_org_user_name_key UNIQUE (org_id, user_name)
);

-- IAM audit log: append-only security/compliance trail for org/admin actions
CREATE TABLE IF NOT EXISTS public.iam_audit_log (
  id            BIGSERIAL   PRIMARY KEY,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  actor_user_id UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id        UUID        REFERENCES public.organizations(id) ON DELETE SET NULL,
  action        TEXT        NOT NULL,
  target_type   TEXT        NOT NULL,
  target_id     TEXT        NOT NULL,
  ip_hash       TEXT,
  metadata      JSONB       DEFAULT '{}'::jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS organizations_created_by_idx
  ON public.organizations(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS organization_members_user_idx
  ON public.organization_members(user_id, org_id);
CREATE INDEX IF NOT EXISTS organization_invites_org_created_idx
  ON public.organization_invites(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS organization_invites_email_active_idx
  ON public.organization_invites(lower(email), org_id, expires_at DESC)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS scim_provisioned_users_org_updated_idx
  ON public.scim_provisioned_users(org_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS iam_audit_log_org_created_idx
  ON public.iam_audit_log(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS iam_audit_log_actor_created_idx
  ON public.iam_audit_log(actor_user_id, created_at DESC);

-- App-owned auth OTP challenges. Supabase Auth remains the user/session store,
-- but Writers Block sends and verifies these codes so business auth emails are
-- never dependent on Supabase's hosted Confirm signup / Magic link templates.
CREATE TABLE IF NOT EXISTS user_auth.otp_challenges (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  email             TEXT        NOT NULL,
  purpose           TEXT        NOT NULL CHECK (purpose IN ('signup', 'signin', 'password_reset')),
  user_id           UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  code_hash         TEXT        NOT NULL,
  encrypted_payload TEXT,
  attempt_count     INTEGER     DEFAULT 0 NOT NULL CHECK (attempt_count >= 0),
  max_attempts      INTEGER     DEFAULT 5 NOT NULL CHECK (max_attempts BETWEEN 1 AND 20),
  locked_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  consumed_at       TIMESTAMPTZ
);

ALTER TABLE user_auth.otp_challenges
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE user_auth.otp_challenges
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 5 NOT NULL;
ALTER TABLE user_auth.otp_challenges
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_auth.otp_challenges'::regclass
      AND conname = 'auth_otp_challenges_attempt_count_check'
  ) THEN
    ALTER TABLE user_auth.otp_challenges
      ADD CONSTRAINT auth_otp_challenges_attempt_count_check
      CHECK (attempt_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_auth.otp_challenges'::regclass
      AND conname = 'auth_otp_challenges_max_attempts_check'
  ) THEN
    ALTER TABLE user_auth.otp_challenges
      ADD CONSTRAINT auth_otp_challenges_max_attempts_check
      CHECK (max_attempts BETWEEN 1 AND 20);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'user_auth.otp_challenges'::regclass
      AND conname = 'auth_otp_challenges_purpose_check'
  ) THEN
    ALTER TABLE user_auth.otp_challenges
      DROP CONSTRAINT auth_otp_challenges_purpose_check;
  END IF;

  ALTER TABLE user_auth.otp_challenges
    ADD CONSTRAINT auth_otp_challenges_purpose_check
    CHECK (purpose IN ('signup', 'signin', 'password_reset'));
END $$;

CREATE INDEX IF NOT EXISTS auth_otp_challenges_lookup_idx
  ON user_auth.otp_challenges(email, purpose, created_at DESC)
  WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS auth_otp_challenges_expiry_idx
  ON user_auth.otp_challenges(expires_at);

CREATE OR REPLACE FUNCTION user_auth.consume_otp_challenge(
  p_email TEXT,
  p_purpose TEXT,
  p_code_hash TEXT
) RETURNS TABLE(user_id UUID, encrypted_payload TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = user_auth, public
AS $$
DECLARE
  v_challenge user_auth.otp_challenges%ROWTYPE;
  v_attempt_count INTEGER;
BEGIN
  SELECT *
    INTO v_challenge
  FROM user_auth.otp_challenges
  WHERE id = (
    SELECT id
    FROM user_auth.otp_challenges
    WHERE email = lower(p_email)
      AND purpose = p_purpose
      AND consumed_at IS NULL
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
  )
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_challenge.locked_at IS NOT NULL
     OR v_challenge.attempt_count >= v_challenge.max_attempts THEN
    RETURN;
  END IF;

  IF v_challenge.code_hash <> p_code_hash THEN
    v_attempt_count := v_challenge.attempt_count + 1;
    UPDATE user_auth.otp_challenges
       SET attempt_count = v_attempt_count,
           locked_at = CASE
             WHEN v_attempt_count >= v_challenge.max_attempts THEN NOW()
             ELSE locked_at
           END
     WHERE id = v_challenge.id;
    RETURN;
  END IF;

  UPDATE user_auth.otp_challenges
     SET consumed_at = NOW()
   WHERE id = v_challenge.id
     AND consumed_at IS NULL
     AND locked_at IS NULL;

  user_id := v_challenge.user_id;
  encrypted_payload := v_challenge.encrypted_payload;
  RETURN NEXT;
END;
$$;

-- Master Admin OTPs are isolated from normal user auth OTPs. This table has
-- no `purpose` discriminator by design: it is only for Master Admin sign-in.
CREATE TABLE IF NOT EXISTS master_admin.otp_challenges (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  email             TEXT        NOT NULL,
  user_id           UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  code_hash         TEXT        NOT NULL,
  encrypted_payload TEXT        NOT NULL,
  attempt_count     INTEGER     DEFAULT 0 NOT NULL CHECK (attempt_count >= 0),
  max_attempts      INTEGER     DEFAULT 5 NOT NULL CHECK (max_attempts BETWEEN 1 AND 20),
  locked_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  consumed_at       TIMESTAMPTZ
);

ALTER TABLE master_admin.otp_challenges
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE master_admin.otp_challenges
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 5 NOT NULL;
ALTER TABLE master_admin.otp_challenges
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'master_admin.otp_challenges'::regclass
      AND conname = 'master_admin_otp_challenges_attempt_count_check'
  ) THEN
    ALTER TABLE master_admin.otp_challenges
      ADD CONSTRAINT master_admin_otp_challenges_attempt_count_check
      CHECK (attempt_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'master_admin.otp_challenges'::regclass
      AND conname = 'master_admin_otp_challenges_max_attempts_check'
  ) THEN
    ALTER TABLE master_admin.otp_challenges
      ADD CONSTRAINT master_admin_otp_challenges_max_attempts_check
      CHECK (max_attempts BETWEEN 1 AND 20);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS master_admin_otp_challenges_lookup_idx
  ON master_admin.otp_challenges(email, created_at DESC)
  WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS master_admin_otp_challenges_expiry_idx
  ON master_admin.otp_challenges(expires_at);

CREATE OR REPLACE FUNCTION master_admin.consume_master_admin_otp_challenge(
  p_email TEXT,
  p_code_hash TEXT
) RETURNS TABLE(user_id UUID, encrypted_payload TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = master_admin, public
AS $$
DECLARE
  v_challenge master_admin.otp_challenges%ROWTYPE;
  v_attempt_count INTEGER;
BEGIN
  SELECT *
    INTO v_challenge
  FROM master_admin.otp_challenges
  WHERE id = (
    SELECT id
    FROM master_admin.otp_challenges
    WHERE email = lower(p_email)
      AND consumed_at IS NULL
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
  )
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_challenge.locked_at IS NOT NULL
     OR v_challenge.attempt_count >= v_challenge.max_attempts THEN
    RETURN;
  END IF;

  IF v_challenge.code_hash <> p_code_hash THEN
    v_attempt_count := v_challenge.attempt_count + 1;
    UPDATE master_admin.otp_challenges
       SET attempt_count = v_attempt_count,
           locked_at = CASE
             WHEN v_attempt_count >= v_challenge.max_attempts THEN NOW()
             ELSE locked_at
           END
     WHERE id = v_challenge.id;
    RETURN;
  END IF;

  UPDATE master_admin.otp_challenges
     SET consumed_at = NOW()
   WHERE id = v_challenge.id
     AND consumed_at IS NULL
     AND locked_at IS NULL;

  user_id := v_challenge.user_id;
  encrypted_payload := v_challenge.encrypted_payload;
  RETURN NEXT;
END;
$$;

-- Custom schemas are intentionally private to browser roles. Server-only code
-- reaches them with SUPABASE_SERVICE_ROLE_KEY, which still needs explicit
-- Postgres schema/table privileges even though it bypasses RLS policies.
GRANT USAGE ON SCHEMA user_auth TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA user_auth TO service_role;
GRANT EXECUTE ON FUNCTION user_auth.consume_otp_challenge(TEXT, TEXT, TEXT) TO service_role;
GRANT USAGE ON SCHEMA master_admin TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA master_admin TO service_role;
GRANT EXECUTE ON FUNCTION master_admin.consume_master_admin_otp_challenge(TEXT, TEXT) TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA master_admin TO service_role;

-- One-time compatibility copy from the previous public tables, if they exist.
-- The old public tables are intentionally not dropped here; remove them only
-- after production has been verified on the schema-qualified tables.
DO $$
BEGIN
  IF to_regclass('public.master_admin_users') IS NOT NULL THEN
    EXECUTE '
      INSERT INTO master_admin.users (user_id, created_at, note)
      SELECT user_id, created_at, note
      FROM public.master_admin_users
      ON CONFLICT (user_id) DO NOTHING
    ';
  END IF;

  IF to_regclass('public.master_admin_audit_log') IS NOT NULL THEN
    EXECUTE '
      INSERT INTO master_admin.audit_log (id, created_at, user_id, method, route, host, ip_hash)
      SELECT id, created_at, user_id, method, route, host, ip_hash
      FROM public.master_admin_audit_log
      ON CONFLICT (id) DO NOTHING
    ';
    PERFORM setval(
      pg_get_serial_sequence('master_admin.audit_log', 'id'),
      GREATEST(COALESCE((SELECT MAX(id) FROM master_admin.audit_log), 1), 1),
      true
    );
  END IF;

  IF to_regclass('public.auth_otp_challenges') IS NOT NULL THEN
    EXECUTE '
      INSERT INTO user_auth.otp_challenges (
        id, email, purpose, user_id, code_hash, encrypted_payload,
        created_at, expires_at, consumed_at
      )
      SELECT
        id, email, purpose, user_id, code_hash, encrypted_payload,
        created_at, expires_at, consumed_at
      FROM public.auth_otp_challenges
      WHERE consumed_at IS NULL AND expires_at > NOW()
      ON CONFLICT (id) DO NOTHING
    ';
  END IF;

  IF to_regclass('public.master_admin_otp_challenges') IS NOT NULL THEN
    EXECUTE '
      INSERT INTO master_admin.otp_challenges (
        id, email, user_id, code_hash, encrypted_payload,
        created_at, expires_at, consumed_at
      )
      SELECT
        id, email, user_id, code_hash, encrypted_payload,
        created_at, expires_at, consumed_at
      FROM public.master_admin_otp_challenges
      WHERE consumed_at IS NULL AND expires_at > NOW()
      ON CONFLICT (id) DO NOTHING
    ';
  END IF;
END $$;

-- subscriptions: one row per user, plan, Razorpay ids (billing_cycle + expiry added in §2a for legacy compatibility)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  plan                  TEXT        CHECK (plan IN ('free', 'pro', 'premium')) DEFAULT 'free' NOT NULL,
  projects_limit        INTEGER     DEFAULT 3 NOT NULL,
  status                TEXT        CHECK (status IN ('active', 'cancelled', 'expired')) DEFAULT 'active' NOT NULL,
  current_period_start  TIMESTAMPTZ DEFAULT NOW(),
  current_period_end    TIMESTAMPTZ,
  razorpay_order_id     TEXT,
  razorpay_payment_id   TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- projects: screenplays
CREATE TABLE IF NOT EXISTS public.projects (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id      UUID        REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title       TEXT        NOT NULL,
  description TEXT,
  genre       TEXT,
  characters  TEXT,
  location    TEXT,
  mood        TEXT,
  content     TEXT        DEFAULT '',
  status      TEXT        CHECK (status IN ('draft', 'in_progress', 'completed')) DEFAULT 'draft' NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.project_creation_usage (
  user_id                 UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  free_lifetime_created   INTEGER     DEFAULT 0 NOT NULL CHECK (free_lifetime_created >= 0),
  created_at              TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at              TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.projects'::regclass
      AND conname = 'projects_org_id_fkey'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_org_id_fkey
      FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Backfill legacy users into personal organizations before project org scoping.
INSERT INTO public.organizations (kind, name, slug, created_by)
SELECT
  'personal',
  COALESCE(NULLIF(p.full_name, ''), NULLIF(p.email, ''), 'Personal Workspace'),
  'user-' || REPLACE(u.id::text, '-', ''),
  u.id
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE NOT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.created_by = u.id AND o.kind = 'personal'
  )
ON CONFLICT (slug) DO NOTHING;

-- Best-effort historical seed for free lifetime creation credits. If
-- project.created history exists, use it as the source of truth for free-plan
-- creations. If no history exists for a user, fall back to their current row
-- count because deleted historical projects cannot be reconstructed.
WITH event_history AS (
  SELECT DISTINCT user_id
  FROM master_admin.business_events
  WHERE event_type = 'project.created'
    AND outcome = 'success'
    AND user_id IS NOT NULL
),
event_counts AS (
  SELECT user_id, COUNT(*)::int AS cnt
  FROM master_admin.business_events
  WHERE event_type = 'project.created'
    AND outcome = 'success'
    AND user_id IS NOT NULL
    AND COALESCE(plan, 'free') = 'free'
  GROUP BY user_id
),
current_counts AS (
  SELECT p.user_id, COUNT(*)::int AS cnt
  FROM public.projects p
  WHERE NOT EXISTS (
    SELECT 1
    FROM event_history h
    WHERE h.user_id = p.user_id
  )
  GROUP BY p.user_id
),
combined AS (
  SELECT user_id, cnt FROM event_counts
  UNION ALL
  SELECT user_id, cnt FROM current_counts
)
INSERT INTO public.project_creation_usage (user_id, free_lifetime_created)
SELECT user_id, cnt
FROM combined
WHERE user_id IS NOT NULL AND cnt > 0
ON CONFLICT (user_id) DO UPDATE SET
  free_lifetime_created = GREATEST(
    public.project_creation_usage.free_lifetime_created,
    EXCLUDED.free_lifetime_created
  ),
  updated_at = NOW();

-- Ensure every personal organization has its owner membership. This is required
-- for existing production users because org RLS and API guards resolve access
-- through public.organization_members.
INSERT INTO public.organization_members (org_id, user_id, role)
SELECT o.id, o.created_by, 'owner'
FROM public.organizations o
WHERE o.kind = 'personal'
  AND o.created_by IS NOT NULL
ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'owner';

UPDATE public.projects p
SET org_id = o.id
FROM public.organizations o
WHERE p.org_id IS NULL
  AND o.created_by = p.user_id
  AND o.kind = 'personal';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE org_id IS NULL) THEN
    ALTER TABLE public.projects ALTER COLUMN org_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'projects.org_id still has NULL rows; fix legacy rows before enforcing NOT NULL.';
  END IF;
END $$;

-- documents: file attachments in Supabase Storage
CREATE TABLE IF NOT EXISTS public.documents (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_id    UUID        REFERENCES public.projects(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  type          TEXT        NOT NULL,
  size          INTEGER,
  storage_path  TEXT        NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- usage_logs: AI endpoint audit (anon client inserts with JWT; RLS enforces own user_id)
CREATE TABLE IF NOT EXISTS public.usage_logs (
  id                          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  endpoint                    TEXT        NOT NULL,
  plan                        TEXT        DEFAULT 'free' NOT NULL,
  provider                    TEXT,
  model                       TEXT,
  complexity                  TEXT        DEFAULT 'standard' NOT NULL,
  original_complexity         TEXT,
  input_tokens                INTEGER     DEFAULT 0 NOT NULL,
  output_tokens               INTEGER     DEFAULT 0 NOT NULL,
  cached_input_tokens         INTEGER     DEFAULT 0 NOT NULL,
  cache_creation_input_tokens INTEGER     DEFAULT 0 NOT NULL,
  total_tokens                INTEGER     DEFAULT 0 NOT NULL,
  cost_usd                    NUMERIC(14,6) DEFAULT 0 NOT NULL,
  cost_inr                    NUMERIC(14,6) DEFAULT 0 NOT NULL,
  latency_ms                  INTEGER,
  status                      TEXT        DEFAULT 'success' NOT NULL,
  usage_source                TEXT        DEFAULT 'estimated' NOT NULL,
  error_message               TEXT,
  metadata                    JSONB       DEFAULT '{}'::jsonb NOT NULL,
  created_at                  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.usage_logs
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS complexity TEXT DEFAULT 'standard' NOT NULL,
  ADD COLUMN IF NOT EXISTS original_complexity TEXT,
  ADD COLUMN IF NOT EXISTS input_tokens INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS output_tokens INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS cached_input_tokens INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS cache_creation_input_tokens INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS total_tokens INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(14,6) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS cost_inr NUMERIC(14,6) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'success' NOT NULL,
  ADD COLUMN IF NOT EXISTS usage_source TEXT DEFAULT 'estimated' NOT NULL,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usage_logs_status_check') THEN
    ALTER TABLE public.usage_logs
      ADD CONSTRAINT usage_logs_status_check CHECK (status IN ('success', 'failed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usage_logs_usage_source_check') THEN
    ALTER TABLE public.usage_logs
      ADD CONSTRAINT usage_logs_usage_source_check CHECK (usage_source IN ('provider', 'estimated'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usage_logs_complexity_check') THEN
    ALTER TABLE public.usage_logs
      ADD CONSTRAINT usage_logs_complexity_check CHECK (complexity IN ('simple', 'standard', 'complex'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.ai_usage_monthly (
  user_id                     UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  month_start                 DATE        NOT NULL,
  plan                        TEXT        DEFAULT 'free' NOT NULL,
  input_tokens                INTEGER     DEFAULT 0 NOT NULL,
  output_tokens               INTEGER     DEFAULT 0 NOT NULL,
  cached_input_tokens         INTEGER     DEFAULT 0 NOT NULL,
  cache_creation_input_tokens INTEGER     DEFAULT 0 NOT NULL,
  cost_usd                    NUMERIC(14,6) DEFAULT 0 NOT NULL,
  cost_inr                    NUMERIC(14,6) DEFAULT 0 NOT NULL,
  request_count               INTEGER     DEFAULT 0 NOT NULL,
  updated_at                  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  PRIMARY KEY (user_id, month_start)
);

CREATE TABLE IF NOT EXISTS public.ai_credit_topup_purchases (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  razorpay_payment_id TEXT        NOT NULL,
  razorpay_order_id   TEXT        NOT NULL,
  amount_paise        INTEGER     NOT NULL CHECK (amount_paise >= 0),
  credits_granted     INTEGER     NOT NULL CHECK (credits_granted > 0),
  credits_remaining   INTEGER     NOT NULL CHECK (credits_remaining >= 0),
  created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT ai_credit_topup_purchases_payment_id_key UNIQUE (razorpay_payment_id),
  CONSTRAINT ai_credit_topup_purchases_remaining_check CHECK (credits_remaining <= credits_granted)
);

COMMENT ON TABLE public.ai_credit_topup_purchases IS
  'Non-expiring AI credit top-up ledger. Users can read their own rows; writes are service-role only.';

CREATE TABLE IF NOT EXISTS public.ai_credit_reservations (
  id                                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                             UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  request_id                          TEXT        NOT NULL,
  required_credits                    INTEGER     NOT NULL CHECK (required_credits >= 0),
  credits_reserved                    INTEGER     DEFAULT 0 NOT NULL CHECK (credits_reserved >= 0),
  included_remaining_at_reservation   INTEGER     DEFAULT 0 NOT NULL CHECK (included_remaining_at_reservation >= 0),
  actual_credits                      INTEGER,
  consumed_credits                    INTEGER     DEFAULT 0 NOT NULL CHECK (consumed_credits >= 0),
  status                              TEXT        DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'consumed', 'released')),
  expires_at                          TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 minutes') NOT NULL,
  created_at                          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at                          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT ai_credit_reservations_request_key UNIQUE (request_id)
);

COMMENT ON TABLE public.ai_credit_reservations IS
  'Short-lived AI credit reservations for projected overage during provider calls. Service-role only.';

CREATE TABLE IF NOT EXISTS public.ai_credit_reservation_allocations (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  reservation_id    UUID        REFERENCES public.ai_credit_reservations(id) ON DELETE CASCADE NOT NULL,
  purchase_id       UUID        REFERENCES public.ai_credit_topup_purchases(id) ON DELETE CASCADE NOT NULL,
  credits_reserved  INTEGER     NOT NULL CHECK (credits_reserved > 0),
  credits_consumed  INTEGER     DEFAULT 0 NOT NULL CHECK (credits_consumed >= 0),
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT ai_credit_reservation_allocations_consumed_check CHECK (credits_consumed <= credits_reserved)
);

CREATE TABLE IF NOT EXISTS public.ai_prompt_cache_entries (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id            UUID        REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id        UUID        REFERENCES public.projects(id) ON DELETE CASCADE,
  provider          TEXT        NOT NULL,
  model             TEXT        NOT NULL,
  strategy          TEXT        NOT NULL CHECK (strategy IN ('project_context')),
  context_hash      TEXT        NOT NULL,
  provider_cache_id TEXT,
  token_count       INTEGER     DEFAULT 0 NOT NULL CHECK (token_count >= 0),
  expires_at        TIMESTAMPTZ,
  use_count         INTEGER     DEFAULT 0 NOT NULL CHECK (use_count >= 0),
  last_used_at      TIMESTAMPTZ,
  metadata          JSONB       DEFAULT '{}'::jsonb NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT ai_prompt_cache_entries_context_key UNIQUE (user_id, project_id, provider, model, context_hash)
);

CREATE TABLE IF NOT EXISTS public.ai_batch_jobs (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id        UUID        REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id    UUID        REFERENCES public.projects(id) ON DELETE SET NULL,
  endpoint      TEXT        NOT NULL,
  status        TEXT        DEFAULT 'queued' NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  request_hash  TEXT        NOT NULL,
  payload       JSONB       DEFAULT '{}'::jsonb NOT NULL,
  result        JSONB,
  error_message TEXT,
  attempts      INTEGER     DEFAULT 0 NOT NULL CHECK (attempts >= 0),
  locked_at     TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT ai_batch_jobs_user_endpoint_hash_key UNIQUE (user_id, endpoint, request_hash)
);

CREATE TABLE IF NOT EXISTS public.ai_generation_feedback (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  usage_log_id  UUID        REFERENCES public.usage_logs(id) ON DELETE SET NULL,
  request_id    UUID        NOT NULL,
  endpoint      TEXT        NOT NULL,
  provider      TEXT,
  model         TEXT,
  complexity    TEXT,
  rating        SMALLINT    NOT NULL CHECK (rating IN (-1, 1)),
  reason        TEXT,
  metadata      JSONB       DEFAULT '{}'::jsonb NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT ai_generation_feedback_user_request_key UNIQUE (user_id, request_id)
);

CREATE TABLE IF NOT EXISTS public.project_memory_status (
  project_id       UUID        REFERENCES public.projects(id) ON DELETE CASCADE PRIMARY KEY,
  user_id          UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id           UUID        REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  content_hash     TEXT        NOT NULL,
  status           TEXT        DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  attempts         INTEGER     DEFAULT 0 NOT NULL CHECK (attempts >= 0),
  locked_at        TIMESTAMPTZ,
  last_indexed_at  TIMESTAMPTZ,
  error_message    TEXT,
  metadata         JSONB       DEFAULT '{}'::jsonb NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.project_story_memory (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id          UUID        REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  project_id      UUID        REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  kind            TEXT        NOT NULL CHECK (kind IN ('project_summary', 'character', 'scene', 'arc', 'continuity_note')),
  source_hash     TEXT        NOT NULL,
  source_anchor   TEXT,
  content         TEXT        NOT NULL CHECK (char_length(content) > 0),
  embedding       extensions.vector(1536) NOT NULL,
  embedding_model TEXT        DEFAULT 'text-embedding-3-small' NOT NULL,
  token_count     INTEGER     DEFAULT 0 NOT NULL CHECK (token_count >= 0),
  metadata        JSONB       DEFAULT '{}'::jsonb NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT project_story_memory_source_key UNIQUE (project_id, kind, source_hash)
);

CREATE TABLE IF NOT EXISTS public.project_story_bible_entries (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  UUID        REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  org_id      UUID        REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  kind        TEXT        NOT NULL CHECK (kind IN ('character', 'scene', 'arc', 'continuity_note', 'style_rule')),
  title       TEXT        NOT NULL CHECK (char_length(trim(title)) > 0 AND char_length(title) <= 160),
  content     TEXT        NOT NULL CHECK (char_length(trim(content)) > 0 AND char_length(content) <= 8000),
  metadata    JSONB       DEFAULT '{}'::jsonb NOT NULL,
  source      TEXT        DEFAULT 'manual' NOT NULL CHECK (source IN ('manual', 'ai_suggested', 'imported', 'system')),
  pinned      BOOLEAN     DEFAULT false NOT NULL,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.project_comments (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  UUID        REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  org_id      UUID        REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  body        TEXT        NOT NULL CHECK (char_length(trim(body)) > 0 AND char_length(body) <= 4000),
  status      TEXT        DEFAULT 'open' NOT NULL CHECK (status IN ('open', 'resolved')),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata    JSONB       DEFAULT '{}'::jsonb NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.project_activity_events (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  UUID        REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  org_id      UUID        REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  actor_user_id UUID     REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type  TEXT       NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  metadata    JSONB      DEFAULT '{}'::jsonb NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.account_export_requests (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status      TEXT        DEFAULT 'requested' NOT NULL CHECK (status IN ('requested', 'processing', 'ready', 'failed')),
  payload     JSONB       DEFAULT '{}'::jsonb NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status      TEXT        DEFAULT 'requested' NOT NULL CHECK (status IN ('requested', 'blocked', 'processing', 'completed', 'cancelled')),
  reason      TEXT,
  blocking_orgs JSONB     DEFAULT '[]'::jsonb NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  email       TEXT,
  category    TEXT        NOT NULL CHECK (category IN ('billing', 'ai_output', 'export_issue', 'account_recovery', 'other')),
  subject     TEXT        NOT NULL CHECK (char_length(trim(subject)) > 0 AND char_length(subject) <= 200),
  message     TEXT        NOT NULL CHECK (char_length(trim(message)) > 0 AND char_length(message) <= 5000),
  status      TEXT        DEFAULT 'open' NOT NULL CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
  metadata    JSONB       DEFAULT '{}'::jsonb NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_consents (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  document    TEXT        NOT NULL CHECK (document IN ('terms', 'privacy', 'refund_policy', 'fair_usage')),
  version     TEXT        NOT NULL CHECK (char_length(trim(version)) > 0 AND char_length(version) <= 40),
  accepted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  metadata    JSONB       DEFAULT '{}'::jsonb NOT NULL
);

-- razorpay_payments: payment ledger; apply_subscription_payment extends subscription
CREATE TABLE IF NOT EXISTS public.razorpay_payments (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  razorpay_payment_id TEXT        NOT NULL,
  razorpay_order_id   TEXT        NOT NULL,
  amount              INTEGER,
  plan                TEXT        NOT NULL CHECK (plan IN ('pro', 'premium')),
  billing_cycle       TEXT        NOT NULL CHECK (billing_cycle IN ('monthly', 'annual')),
  created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT razorpay_payments_payment_id_key UNIQUE (razorpay_payment_id)
);

CREATE TABLE IF NOT EXISTS public.pdf_export_purchases (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_id              UUID        REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  project_id          UUID        REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  razorpay_payment_id TEXT        NOT NULL,
  razorpay_order_id   TEXT        NOT NULL,
  amount_paise        INTEGER     NOT NULL CHECK (amount_paise >= 0),
  consumed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT pdf_export_purchases_payment_id_key UNIQUE (razorpay_payment_id)
);

-- 2a) Subscriptions: billing + expiry (idempotent; safe on existing DBs)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT
  DEFAULT 'monthly'
  CHECK (billing_cycle IN ('monthly', 'annual'));

-- Unique on razorpay_payment_id (fails if duplicate non-null values exist; NULLs are allowed, multiple NULLs in PG)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_razorpay_payment_id'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT unique_razorpay_payment_id UNIQUE (razorpay_payment_id);
  END IF;
END $$;

-- Pre-check: SELECT razorpay_payment_id, COUNT(*) FROM public.subscriptions GROUP BY 1 HAVING COUNT(*) > 1;

-- Cron email deduplication; cleared on renewal (verify / webhook)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS expiry_warning_sent_at TIMESTAMPTZ;
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT;
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS razorpay_customer_id TEXT;
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS grace_period_end TIMESTAMPTZ;
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS last_webhook_event TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscriptions'::regclass
      AND conname = 'subscriptions_status_check'
  ) THEN
    ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_status_check;
  END IF;

  ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('active', 'trialing', 'past_due', 'cancelled', 'expired'));
END $$;

CREATE TABLE IF NOT EXISTS public.billing_customers (
  org_id               UUID        REFERENCES public.organizations(id) ON DELETE CASCADE PRIMARY KEY,
  user_id              UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  billing_email        TEXT,
  legal_name           TEXT,
  gstin                TEXT,
  billing_address      JSONB       DEFAULT '{}'::jsonb NOT NULL,
  razorpay_customer_id TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at           TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.billing_subscription_ledger (
  id                       UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id                   UUID        REFERENCES public.organizations(id) ON DELETE SET NULL,
  event_type               TEXT        NOT NULL,
  plan                     TEXT        CHECK (plan IN ('pro', 'premium')),
  billing_cycle            TEXT        CHECK (billing_cycle IN ('monthly', 'annual')),
  razorpay_subscription_id TEXT,
  razorpay_payment_id      TEXT,
  razorpay_invoice_id      TEXT,
  amount_paise             INTEGER,
  status                   TEXT,
  payload                  JSONB       DEFAULT '{}'::jsonb NOT NULL,
  created_at               TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id                       UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id                   UUID        REFERENCES public.organizations(id) ON DELETE SET NULL,
  razorpay_invoice_id      TEXT        NOT NULL,
  razorpay_subscription_id TEXT,
  razorpay_payment_id      TEXT,
  amount_paise             INTEGER     DEFAULT 0 NOT NULL,
  currency                 TEXT        DEFAULT 'INR' NOT NULL,
  status                   TEXT,
  invoice_number           TEXT,
  invoice_url              TEXT,
  issued_at                TIMESTAMPTZ,
  payload                  JSONB       DEFAULT '{}'::jsonb NOT NULL,
  created_at               TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT billing_invoices_razorpay_invoice_key UNIQUE (razorpay_invoice_id)
);

CREATE TABLE IF NOT EXISTS public.billing_refunds (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id              UUID        REFERENCES public.organizations(id) ON DELETE SET NULL,
  razorpay_payment_id TEXT        NOT NULL,
  razorpay_refund_id  TEXT,
  amount_paise        INTEGER     NOT NULL CHECK (amount_paise >= 0),
  status              TEXT        DEFAULT 'requested' NOT NULL CHECK (status IN ('requested', 'processing', 'processed', 'failed', 'rejected', 'disputed')),
  reason              TEXT,
  actor_user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  payload             JSONB       DEFAULT '{}'::jsonb NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.subscriptions
  ALTER COLUMN projects_limit SET DEFAULT 3;

UPDATE public.subscriptions
SET projects_limit = 3,
    updated_at = NOW()
WHERE plan = 'free' AND projects_limit = 5;

-- =========================
-- 3) INDEXES
-- ============================
DROP INDEX IF EXISTS projects_user_id_idx;
DROP INDEX IF EXISTS projects_updated_at_idx;
DROP INDEX IF EXISTS documents_user_id_idx;
DROP INDEX IF EXISTS documents_project_id_idx;

CREATE INDEX IF NOT EXISTS projects_user_updated_idx
  ON public.projects(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS projects_org_updated_idx
  ON public.projects(org_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS projects_org_updated_id_idx
  ON public.projects(org_id, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS projects_user_status_idx
  ON public.projects(user_id, status);

CREATE INDEX IF NOT EXISTS projects_org_status_idx
  ON public.projects(org_id, status);

CREATE INDEX IF NOT EXISTS projects_active_idx
  ON public.projects(user_id, updated_at DESC)
  WHERE status IN ('draft', 'in_progress');

CREATE INDEX IF NOT EXISTS projects_org_active_idx
  ON public.projects(org_id, updated_at DESC)
  WHERE status IN ('draft', 'in_progress');

CREATE INDEX IF NOT EXISTS projects_search_idx
  ON public.projects
  USING gin(to_tsvector('english', title || ' ' || COALESCE(description, '')));

CREATE INDEX IF NOT EXISTS project_creation_usage_free_lifetime_idx
  ON public.project_creation_usage(free_lifetime_created DESC);

CREATE INDEX IF NOT EXISTS project_creation_usage_updated_idx
  ON public.project_creation_usage(updated_at DESC);

CREATE INDEX IF NOT EXISTS subscriptions_user_plan_idx
  ON public.subscriptions(user_id, plan);

CREATE INDEX IF NOT EXISTS documents_project_lookup_idx
  ON public.documents(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS profiles_email_idx
  ON public.profiles(email);

CREATE INDEX IF NOT EXISTS profiles_email_trgm_idx
  ON public.profiles
  USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS profiles_created_at_idx
  ON public.profiles(created_at DESC);

CREATE INDEX IF NOT EXISTS subscriptions_updated_at_idx
  ON public.subscriptions(updated_at DESC);

CREATE INDEX IF NOT EXISTS subscriptions_status_plan_updated_idx
  ON public.subscriptions(status, plan, billing_cycle, updated_at DESC);

CREATE INDEX IF NOT EXISTS usage_logs_user_date_idx
  ON public.usage_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS usage_logs_endpoint_date_idx
  ON public.usage_logs(endpoint, created_at DESC);

-- Time-range admin / analytics scans on large usage_logs
CREATE INDEX IF NOT EXISTS usage_logs_created_at_idx
  ON public.usage_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS usage_logs_created_endpoint_idx
  ON public.usage_logs(created_at DESC, endpoint);

CREATE INDEX IF NOT EXISTS usage_logs_created_user_idx
  ON public.usage_logs(created_at DESC, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS usage_logs_created_provider_model_idx
  ON public.usage_logs(created_at DESC, provider, model);

CREATE INDEX IF NOT EXISTS usage_logs_created_plan_complexity_idx
  ON public.usage_logs(created_at DESC, plan, complexity);

CREATE INDEX IF NOT EXISTS ai_usage_monthly_month_idx
  ON public.ai_usage_monthly(month_start DESC);

CREATE INDEX IF NOT EXISTS ai_usage_monthly_plan_month_idx
  ON public.ai_usage_monthly(plan, month_start DESC);

CREATE INDEX IF NOT EXISTS ai_credit_topup_purchases_user_created_idx
  ON public.ai_credit_topup_purchases(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_credit_topup_purchases_user_remaining_idx
  ON public.ai_credit_topup_purchases(user_id, created_at, id)
  WHERE credits_remaining > 0;

CREATE INDEX IF NOT EXISTS ai_credit_reservations_user_status_idx
  ON public.ai_credit_reservations(user_id, status, expires_at);

CREATE INDEX IF NOT EXISTS ai_credit_reservations_status_created_idx
  ON public.ai_credit_reservations(status, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_credit_reservation_allocations_reservation_idx
  ON public.ai_credit_reservation_allocations(reservation_id);

CREATE INDEX IF NOT EXISTS ai_prompt_cache_entries_user_project_idx
  ON public.ai_prompt_cache_entries(user_id, project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS ai_prompt_cache_entries_expires_idx
  ON public.ai_prompt_cache_entries(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_batch_jobs_status_created_idx
  ON public.ai_batch_jobs(status, created_at)
  WHERE status IN ('queued', 'processing', 'failed');

CREATE INDEX IF NOT EXISTS ai_batch_jobs_user_created_idx
  ON public.ai_batch_jobs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS project_memory_status_status_updated_idx
  ON public.project_memory_status(status, updated_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS project_memory_status_user_project_idx
  ON public.project_memory_status(user_id, project_id);

CREATE INDEX IF NOT EXISTS project_story_memory_project_kind_idx
  ON public.project_story_memory(project_id, kind, updated_at DESC);

CREATE INDEX IF NOT EXISTS project_story_memory_user_project_idx
  ON public.project_story_memory(user_id, project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS project_story_memory_embedding_idx
  ON public.project_story_memory
  USING hnsw (embedding extensions.vector_cosine_ops);

CREATE INDEX IF NOT EXISTS project_story_bible_entries_project_kind_idx
  ON public.project_story_bible_entries(project_id, kind, pinned DESC, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS project_story_bible_entries_org_project_idx
  ON public.project_story_bible_entries(org_id, project_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS project_story_bible_entries_user_project_idx
  ON public.project_story_bible_entries(user_id, project_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS project_comments_project_created_idx
  ON public.project_comments(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS project_comments_project_status_idx
  ON public.project_comments(project_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS project_activity_events_project_created_idx
  ON public.project_activity_events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS account_export_requests_user_created_idx
  ON public.account_export_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS account_deletion_requests_user_created_idx
  ON public.account_deletion_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_user_created_idx
  ON public.support_tickets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_created_idx
  ON public.support_tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS user_consents_user_document_idx
  ON public.user_consents(user_id, document, accepted_at DESC);
CREATE INDEX IF NOT EXISTS billing_subscription_ledger_user_created_idx
  ON public.billing_subscription_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS billing_subscription_ledger_subscription_idx
  ON public.billing_subscription_ledger(razorpay_subscription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS billing_invoices_user_created_idx
  ON public.billing_invoices(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS billing_refunds_user_created_idx
  ON public.billing_refunds(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_generation_feedback_request_idx
  ON public.ai_generation_feedback(request_id);

CREATE INDEX IF NOT EXISTS ai_generation_feedback_endpoint_created_idx
  ON public.ai_generation_feedback(endpoint, created_at DESC);

CREATE INDEX IF NOT EXISTS razorpay_payments_user_created_idx
  ON public.razorpay_payments(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS razorpay_payments_created_at_idx
  ON public.razorpay_payments(created_at DESC);

CREATE INDEX IF NOT EXISTS pdf_export_purchases_user_created_idx
  ON public.pdf_export_purchases(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pdf_export_purchases_project_created_idx
  ON public.pdf_export_purchases(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pdf_export_purchases_unconsumed_idx
  ON public.pdf_export_purchases(user_id, org_id, project_id, created_at DESC)
  WHERE consumed_at IS NULL;

-- =========================
-- 4) FUNCTIONS
-- =========================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.enforce_project_limit_before_insert()
RETURNS TRIGGER AS $$
DECLARE
  lim int;
  cnt int;
  sub_status text;
  sub_plan text;
  sub_limit int;
  free_used int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));

  SELECT status, plan, projects_limit INTO sub_status, sub_plan, sub_limit
  FROM public.subscriptions
  WHERE user_id = NEW.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    sub_plan := 'free';
    lim := 3;
  ELSIF sub_status IS DISTINCT FROM 'active' THEN
    sub_plan := 'free';
    lim := 3;
  ELSE
    sub_plan := COALESCE(sub_plan, 'free');
    lim := COALESCE(sub_limit, CASE WHEN sub_plan = 'pro' THEN 25 WHEN sub_plan = 'premium' THEN 999999 ELSE 3 END);
  END IF;

  IF NEW.org_id IS NOT NULL THEN
    SELECT COUNT(*)::int INTO cnt FROM public.projects WHERE org_id = NEW.org_id;
  ELSE
    SELECT COUNT(*)::int INTO cnt FROM public.projects WHERE user_id = NEW.user_id;
  END IF;
  IF cnt >= lim THEN
    RAISE EXCEPTION 'project_limit_reached';
  END IF;

  IF sub_plan = 'free' THEN
    INSERT INTO public.project_creation_usage (user_id, free_lifetime_created)
    VALUES (NEW.user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT free_lifetime_created INTO free_used
    FROM public.project_creation_usage
    WHERE user_id = NEW.user_id
    FOR UPDATE;

    IF COALESCE(free_used, 0) >= 3 THEN
      RAISE EXCEPTION 'free_project_lifetime_limit_reached';
    END IF;

    UPDATE public.project_creation_usage
    SET
      free_lifetime_created = free_lifetime_created + 1,
      updated_at = NOW()
    WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_name TEXT;
  v_slug TEXT;
  v_org_id UUID;
BEGIN
  v_name := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), 'Personal');
  -- Deterministic personal slug. Uses the full user id without leaking email.
  v_slug := 'user-' || replace(NEW.id::text, '-', '');

  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.subscriptions (user_id, plan, projects_limit)
  VALUES (NEW.id, 'free', 3)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create a personal org for the user (idempotent) and attach membership.
  INSERT INTO public.organizations (kind, name, slug, created_by)
  VALUES ('personal', v_name, v_slug, NEW.id)
  ON CONFLICT (slug) DO UPDATE SET updated_at = NOW()
  RETURNING id INTO v_org_id;

  IF v_org_id IS NOT NULL THEN
    INSERT INTO public.organization_members (org_id, user_id, role)
    VALUES (v_org_id, NEW.id, 'owner')
    ON CONFLICT (org_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.apply_subscription_payment(
  p_user_id UUID,
  p_payment_id TEXT,
  p_order_id TEXT,
  p_plan TEXT,
  p_billing_cycle TEXT,
  p_amount INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id UUID;
  v_days INTEGER;
  v_existing_end TIMESTAMPTZ;
  v_new_end TIMESTAMPTZ;
  v_base TIMESTAMPTZ;
  v_projects_limit INTEGER;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF p_plan IS NULL OR p_plan NOT IN ('pro', 'premium')
     OR p_billing_cycle IS NULL OR p_billing_cycle NOT IN ('monthly', 'annual') THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'invalid plan or billing_cycle');
  END IF;

  INSERT INTO public.razorpay_payments (
    user_id, razorpay_payment_id, razorpay_order_id, amount, plan, billing_cycle
  )
  VALUES (p_user_id, p_payment_id, p_order_id, p_amount, p_plan, p_billing_cycle)
  ON CONFLICT (razorpay_payment_id) DO NOTHING
  RETURNING id INTO v_new_id;

  IF v_new_id IS NULL THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  v_days := CASE WHEN p_billing_cycle = 'annual' THEN 365 ELSE 30 END;
  v_projects_limit := CASE p_plan WHEN 'pro' THEN 25 WHEN 'premium' THEN 999999 ELSE 3 END;

  SELECT current_period_end INTO v_existing_end
  FROM public.subscriptions
  WHERE user_id = p_user_id;

  v_base := GREATEST(COALESCE(v_existing_end, v_now), v_now);
  v_new_end := v_base + (v_days * INTERVAL '1 day');

  UPDATE public.subscriptions
  SET
    plan = p_plan,
    projects_limit = v_projects_limit,
    status = 'active',
    billing_cycle = p_billing_cycle,
    current_period_start = v_now,
    current_period_end = v_new_end,
    razorpay_order_id = p_order_id,
    razorpay_payment_id = p_payment_id,
    expiry_warning_sent_at = NULL,
    updated_at = v_now
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'subscription row missing for user %', p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'status', 'applied',
    'current_period_end', v_new_end,
    'plan', p_plan,
    'billing_cycle', p_billing_cycle
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_subscription_payment(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_subscription_payment(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.consume_pdf_export_purchase(
  p_payment_id TEXT,
  p_user_id UUID,
  p_org_id UUID,
  p_project_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase public.pdf_export_purchases%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT * INTO v_purchase
  FROM public.pdf_export_purchases
  WHERE razorpay_payment_id = p_payment_id
    AND user_id = p_user_id
    AND org_id = p_org_id
    AND project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_purchase.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_consumed',
      'purchase_id', v_purchase.id,
      'amount_paise', v_purchase.amount_paise,
      'consumed_at', v_purchase.consumed_at
    );
  END IF;

  UPDATE public.pdf_export_purchases
  SET consumed_at = v_now, updated_at = v_now
  WHERE id = v_purchase.id
  RETURNING * INTO v_purchase;

  RETURN jsonb_build_object(
    'status', 'consumed',
    'purchase_id', v_purchase.id,
    'amount_paise', v_purchase.amount_paise,
    'consumed_at', v_purchase.consumed_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_pdf_export_purchase(TEXT, UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_pdf_export_purchase(TEXT, UUID, UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_ai_credit_topup_payment(
  p_user_id UUID,
  p_payment_id TEXT,
  p_order_id TEXT,
  p_amount_paise INTEGER,
  p_credits_granted INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase public.ai_credit_topup_purchases%ROWTYPE;
BEGIN
  IF p_credits_granted <= 0 THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'credits must be positive');
  END IF;

  INSERT INTO public.ai_credit_topup_purchases (
    user_id,
    razorpay_payment_id,
    razorpay_order_id,
    amount_paise,
    credits_granted,
    credits_remaining
  ) VALUES (
    p_user_id,
    p_payment_id,
    p_order_id,
    GREATEST(COALESCE(p_amount_paise, 0), 0),
    p_credits_granted,
    p_credits_granted
  )
  ON CONFLICT (razorpay_payment_id) DO NOTHING
  RETURNING * INTO v_purchase;

  IF v_purchase.id IS NULL THEN
    SELECT * INTO v_purchase
    FROM public.ai_credit_topup_purchases
    WHERE razorpay_payment_id = p_payment_id;

    RETURN jsonb_build_object(
      'status', 'duplicate',
      'purchase_id', v_purchase.id,
      'credits_granted', v_purchase.credits_granted,
      'credits_remaining', v_purchase.credits_remaining
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'applied',
    'purchase_id', v_purchase.id,
    'credits_granted', v_purchase.credits_granted,
    'credits_remaining', v_purchase.credits_remaining
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_ai_credit_topup(
  p_user_id UUID,
  p_request_id TEXT,
  p_required_credits INTEGER,
  p_included_remaining INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available INTEGER := 0;
  v_remaining INTEGER := GREATEST(COALESCE(p_required_credits, 0), 0);
  v_take INTEGER;
  v_purchase RECORD;
  v_expired RECORD;
  v_allocation RECORD;
  v_reservation public.ai_credit_reservations%ROWTYPE;
BEGIN
  IF v_remaining <= 0 THEN
    RETURN jsonb_build_object('status', 'not_required');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 424242)::bigint);

  SELECT * INTO v_reservation
  FROM public.ai_credit_reservations
  WHERE request_id = p_request_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', CASE WHEN v_reservation.status = 'pending' THEN 'reserved' ELSE v_reservation.status END,
      'reservation_id', v_reservation.id,
      'required_credits', v_reservation.required_credits,
      'reserved_credits', v_reservation.credits_reserved,
      'included_remaining_at_reservation', v_reservation.included_remaining_at_reservation
    );
  END IF;

  FOR v_expired IN
    SELECT *
    FROM public.ai_credit_reservations
    WHERE user_id = p_user_id
      AND status = 'pending'
      AND expires_at < NOW()
    FOR UPDATE
  LOOP
    FOR v_allocation IN
      SELECT *
      FROM public.ai_credit_reservation_allocations
      WHERE reservation_id = v_expired.id
      FOR UPDATE
    LOOP
      UPDATE public.ai_credit_topup_purchases
      SET credits_remaining = credits_remaining + (v_allocation.credits_reserved - v_allocation.credits_consumed),
          updated_at = NOW()
      WHERE id = v_allocation.purchase_id;
    END LOOP;

    UPDATE public.ai_credit_reservations
    SET status = 'released', updated_at = NOW()
    WHERE id = v_expired.id;
  END LOOP;

  SELECT COALESCE(SUM(credits_remaining), 0)::INTEGER INTO v_available
  FROM public.ai_credit_topup_purchases
  WHERE user_id = p_user_id
    AND credits_remaining > 0;

  IF v_available < v_remaining THEN
    RETURN jsonb_build_object(
      'status', 'insufficient',
      'required_credits', v_remaining,
      'available_credits', v_available,
      'included_remaining_at_reservation', GREATEST(COALESCE(p_included_remaining, 0), 0),
      'reason', 'Monthly AI credits exhausted and no paid top-up credits are available.'
    );
  END IF;

  INSERT INTO public.ai_credit_reservations (
    user_id,
    request_id,
    required_credits,
    credits_reserved,
    included_remaining_at_reservation
  ) VALUES (
    p_user_id,
    p_request_id,
    v_remaining,
    v_remaining,
    GREATEST(COALESCE(p_included_remaining, 0), 0)
  )
  RETURNING * INTO v_reservation;

  FOR v_purchase IN
    SELECT *
    FROM public.ai_credit_topup_purchases
    WHERE user_id = p_user_id
      AND credits_remaining > 0
    ORDER BY created_at ASC, id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_remaining, v_purchase.credits_remaining);

    UPDATE public.ai_credit_topup_purchases
    SET credits_remaining = credits_remaining - v_take,
        updated_at = NOW()
    WHERE id = v_purchase.id;

    INSERT INTO public.ai_credit_reservation_allocations (
      reservation_id,
      purchase_id,
      credits_reserved
    ) VALUES (
      v_reservation.id,
      v_purchase.id,
      v_take
    );

    v_remaining := v_remaining - v_take;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'reserved',
    'reservation_id', v_reservation.id,
    'required_credits', v_reservation.required_credits,
    'reserved_credits', v_reservation.credits_reserved,
    'included_remaining_at_reservation', v_reservation.included_remaining_at_reservation,
    'available_credits', v_available - v_reservation.credits_reserved
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_ai_credit_reservation(
  p_reservation_id UUID,
  p_actual_credits INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation public.ai_credit_reservations%ROWTYPE;
  v_actual INTEGER := GREATEST(COALESCE(p_actual_credits, 0), 0);
  v_to_consume INTEGER;
  v_remaining_to_consume INTEGER;
  v_consume INTEGER;
  v_refund INTEGER;
  v_allocation RECORD;
BEGIN
  SELECT * INTO v_reservation
  FROM public.ai_credit_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_reservation.status <> 'pending' THEN
    RETURN jsonb_build_object('status', v_reservation.status);
  END IF;

  v_to_consume := LEAST(
    v_reservation.credits_reserved,
    GREATEST(0, v_actual - v_reservation.included_remaining_at_reservation)
  );
  v_remaining_to_consume := v_to_consume;

  FOR v_allocation IN
    SELECT *
    FROM public.ai_credit_reservation_allocations
    WHERE reservation_id = p_reservation_id
    ORDER BY created_at ASC, id ASC
    FOR UPDATE
  LOOP
    v_consume := LEAST(v_remaining_to_consume, v_allocation.credits_reserved);
    v_refund := v_allocation.credits_reserved - v_consume;

    UPDATE public.ai_credit_reservation_allocations
    SET credits_consumed = v_consume
    WHERE id = v_allocation.id;

    IF v_refund > 0 THEN
      UPDATE public.ai_credit_topup_purchases
      SET credits_remaining = credits_remaining + v_refund,
          updated_at = NOW()
      WHERE id = v_allocation.purchase_id;
    END IF;

    v_remaining_to_consume := v_remaining_to_consume - v_consume;
  END LOOP;

  UPDATE public.ai_credit_reservations
  SET status = 'consumed',
      actual_credits = v_actual,
      consumed_credits = v_to_consume,
      updated_at = NOW()
  WHERE id = p_reservation_id;

  RETURN jsonb_build_object(
    'status', 'consumed',
    'reservation_id', p_reservation_id,
    'actual_credits', v_actual,
    'consumed_credits', v_to_consume
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_ai_credit_reservation(
  p_reservation_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation public.ai_credit_reservations%ROWTYPE;
  v_allocation RECORD;
  v_released INTEGER := 0;
BEGIN
  SELECT * INTO v_reservation
  FROM public.ai_credit_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_reservation.status <> 'pending' THEN
    RETURN jsonb_build_object('status', v_reservation.status);
  END IF;

  FOR v_allocation IN
    SELECT *
    FROM public.ai_credit_reservation_allocations
    WHERE reservation_id = p_reservation_id
    FOR UPDATE
  LOOP
    UPDATE public.ai_credit_topup_purchases
    SET credits_remaining = credits_remaining + (v_allocation.credits_reserved - v_allocation.credits_consumed),
        updated_at = NOW()
    WHERE id = v_allocation.purchase_id;

    v_released := v_released + (v_allocation.credits_reserved - v_allocation.credits_consumed);
  END LOOP;

  UPDATE public.ai_credit_reservations
  SET status = 'released',
      updated_at = NOW()
  WHERE id = p_reservation_id;

  RETURN jsonb_build_object(
    'status', 'released',
    'reservation_id', p_reservation_id,
    'released_credits', v_released
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_ai_credit_topup_payment(UUID, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_ai_credit_topup(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_ai_credit_reservation(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_ai_credit_reservation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_ai_credit_topup_payment(UUID, TEXT, TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_ai_credit_topup(UUID, TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_ai_credit_reservation(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ai_credit_reservation(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.org_id = p_org_id
      AND m.user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(p_org_id UUID, p_user_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.org_id = p_org_id
      AND m.user_id = p_user_id
      AND m.role = ANY(p_roles)
  );
$$;

REVOKE ALL ON FUNCTION public.is_org_member(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_org_role(UUID, UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_member(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_org_role(UUID, UUID, TEXT[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_subscription_group_counts()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'plan', g.plan,
        'status', g.status,
        'billing_cycle', g.billing_cycle,
        'cnt', g.cnt
      )
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      plan::text,
      status::text,
      COALESCE(billing_cycle, 'monthly')::text AS billing_cycle,
      COUNT(*)::bigint AS cnt
    FROM public.subscriptions
    GROUP BY plan, status, COALESCE(billing_cycle, 'monthly')
  ) g;
$$;

REVOKE ALL ON FUNCTION public.admin_subscription_group_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_subscription_group_counts() TO service_role;

CREATE OR REPLACE FUNCTION public.admin_usage_daily_buckets(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
) RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bucketed AS (
    SELECT
      to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS cnt
    FROM public.usage_logs
    WHERE created_at >= p_from AND created_at <= p_to
    GROUP BY 1
    ORDER BY 1
  )
  SELECT jsonb_build_object(
    'buckets',
    COALESCE(
      jsonb_agg(jsonb_build_object('day', day, 'count', cnt) ORDER BY day),
      '[]'::jsonb
    ),
    'totalInRange',
    COALESCE(SUM(cnt), 0),
    'truncated',
    false
  )
  FROM bucketed;
$$;

CREATE OR REPLACE FUNCTION public.admin_usage_endpoint_breakdown(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 5000
) RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH grouped AS (
    SELECT endpoint, COUNT(*)::int AS cnt
    FROM public.usage_logs
    WHERE created_at >= p_from AND created_at <= p_to
    GROUP BY endpoint
    ORDER BY cnt DESC, endpoint ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5000), 10000))
  )
  SELECT jsonb_build_object(
    'byEndpoint',
    COALESCE(jsonb_object_agg(endpoint, cnt), '{}'::jsonb),
    'truncated',
    false
  )
  FROM grouped;
$$;

CREATE OR REPLACE FUNCTION public.admin_signup_daily_buckets(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_excluded_user_ids UUID[] DEFAULT '{}'::uuid[]
) RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT created_at
    FROM public.profiles
    WHERE created_at >= p_from
      AND created_at <= p_to
      AND NOT (id = ANY(COALESCE(p_excluded_user_ids, '{}'::uuid[])))
  ),
  bucketed AS (
    SELECT
      to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS cnt
    FROM filtered
    GROUP BY 1
    ORDER BY 1
  )
  SELECT jsonb_build_object(
    'buckets',
    COALESCE(
      jsonb_agg(jsonb_build_object('day', day, 'count', cnt) ORDER BY day),
      '[]'::jsonb
    ),
    'totalInRange',
    COALESCE((SELECT COUNT(*) FROM filtered), 0),
    'truncated',
    false
  )
  FROM bucketed;
$$;

CREATE OR REPLACE FUNCTION public.admin_top_users_by_usage(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 10,
  p_excluded_user_ids UUID[] DEFAULT '{}'::uuid[]
) RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT user_id, COUNT(*)::int AS cnt
    FROM public.usage_logs
    WHERE created_at >= p_from
      AND created_at <= p_to
      AND user_id IS NOT NULL
      AND NOT (user_id = ANY(COALESCE(p_excluded_user_ids, '{}'::uuid[])))
    GROUP BY user_id
    ORDER BY cnt DESC, user_id
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 50))
  )
  SELECT jsonb_build_object(
    'rows',
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'user_id', r.user_id,
          'count', r.cnt,
          'email', p.email,
          'full_name', p.full_name
        )
        ORDER BY r.cnt DESC, r.user_id
      ),
      '[]'::jsonb
    ),
    'truncated',
    false
  )
  FROM ranked r
  LEFT JOIN public.profiles p ON p.id = r.user_id;
$$;

CREATE OR REPLACE FUNCTION public.record_ai_usage(
  p_user_id UUID,
  p_endpoint TEXT,
  p_plan TEXT,
  p_provider TEXT,
  p_model TEXT,
  p_complexity TEXT,
  p_original_complexity TEXT,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER,
  p_cached_input_tokens INTEGER,
  p_cache_creation_input_tokens INTEGER,
  p_total_tokens INTEGER,
  p_cost_usd NUMERIC,
  p_cost_inr NUMERIC,
  p_latency_ms INTEGER,
  p_status TEXT,
  p_usage_source TEXT,
  p_error_message TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_created_at TIMESTAMPTZ := NOW();
  v_month_start DATE := date_trunc('month', v_created_at AT TIME ZONE 'UTC')::date;
BEGIN
  INSERT INTO public.usage_logs (
    user_id,
    endpoint,
    plan,
    provider,
    model,
    complexity,
    original_complexity,
    input_tokens,
    output_tokens,
    cached_input_tokens,
    cache_creation_input_tokens,
    total_tokens,
    cost_usd,
    cost_inr,
    latency_ms,
    status,
    usage_source,
    error_message,
    metadata,
    created_at
  ) VALUES (
    p_user_id,
    p_endpoint,
    COALESCE(NULLIF(p_plan, ''), 'free'),
    p_provider,
    p_model,
    COALESCE(NULLIF(p_complexity, ''), 'standard'),
    COALESCE(NULLIF(p_original_complexity, ''), p_complexity),
    GREATEST(COALESCE(p_input_tokens, 0), 0),
    GREATEST(COALESCE(p_output_tokens, 0), 0),
    GREATEST(COALESCE(p_cached_input_tokens, 0), 0),
    GREATEST(COALESCE(p_cache_creation_input_tokens, 0), 0),
    GREATEST(COALESCE(p_total_tokens, COALESCE(p_input_tokens, 0) + COALESCE(p_output_tokens, 0)), 0),
    GREATEST(COALESCE(p_cost_usd, 0), 0),
    GREATEST(COALESCE(p_cost_inr, 0), 0),
    GREATEST(COALESCE(p_latency_ms, 0), 0),
    COALESCE(NULLIF(p_status, ''), 'success'),
    COALESCE(NULLIF(p_usage_source, ''), 'estimated'),
    p_error_message,
    COALESCE(p_metadata, '{}'::jsonb),
    v_created_at
  )
  RETURNING id INTO v_id;

  IF COALESCE(p_status, 'success') = 'success' THEN
    INSERT INTO public.ai_usage_monthly (
      user_id,
      month_start,
      plan,
      input_tokens,
      output_tokens,
      cached_input_tokens,
      cache_creation_input_tokens,
      cost_usd,
      cost_inr,
      request_count,
      updated_at
    ) VALUES (
      p_user_id,
      v_month_start,
      COALESCE(NULLIF(p_plan, ''), 'free'),
      GREATEST(COALESCE(p_input_tokens, 0), 0),
      GREATEST(COALESCE(p_output_tokens, 0), 0),
      GREATEST(COALESCE(p_cached_input_tokens, 0), 0),
      GREATEST(COALESCE(p_cache_creation_input_tokens, 0), 0),
      GREATEST(COALESCE(p_cost_usd, 0), 0),
      GREATEST(COALESCE(p_cost_inr, 0), 0),
      1,
      v_created_at
    )
    ON CONFLICT (user_id, month_start) DO UPDATE SET
      plan = EXCLUDED.plan,
      input_tokens = public.ai_usage_monthly.input_tokens + EXCLUDED.input_tokens,
      output_tokens = public.ai_usage_monthly.output_tokens + EXCLUDED.output_tokens,
      cached_input_tokens = public.ai_usage_monthly.cached_input_tokens + EXCLUDED.cached_input_tokens,
      cache_creation_input_tokens = public.ai_usage_monthly.cache_creation_input_tokens + EXCLUDED.cache_creation_input_tokens,
      cost_usd = public.ai_usage_monthly.cost_usd + EXCLUDED.cost_usd,
      cost_inr = public.ai_usage_monthly.cost_inr + EXCLUDED.cost_inr,
      request_count = public.ai_usage_monthly.request_count + 1,
      updated_at = EXCLUDED.updated_at;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_ai_usage(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER,
  INTEGER, NUMERIC, NUMERIC, INTEGER, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_ai_usage(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER,
  INTEGER, NUMERIC, NUMERIC, INTEGER, TEXT, TEXT, TEXT, JSONB
) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_ai_batch_job(
  p_job_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.ai_batch_jobs%ROWTYPE;
BEGIN
  SELECT *
  INTO v_job
  FROM public.ai_batch_jobs
  WHERE (p_job_id IS NULL OR id = p_job_id)
    AND (
      status = 'queued'
      OR (status = 'failed' AND attempts < 5)
      OR (status = 'processing' AND locked_at < NOW() - INTERVAL '15 minutes' AND attempts < 5)
    )
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;

  UPDATE public.ai_batch_jobs
  SET status = 'processing',
      attempts = attempts + 1,
      locked_at = NOW(),
      error_message = NULL,
      updated_at = NOW()
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  RETURN jsonb_build_object('status', 'claimed', 'job', to_jsonb(v_job));
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_ai_batch_job(
  p_job_id UUID,
  p_result JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_batch_jobs
  SET status = 'completed',
      result = COALESCE(p_result, '{}'::jsonb),
      completed_at = NOW(),
      locked_at = NULL,
      error_message = NULL,
      updated_at = NOW()
  WHERE id = p_job_id
    AND status = 'processing';
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_ai_batch_job(
  p_job_id UUID,
  p_error TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_batch_jobs
  SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'queued' END,
      locked_at = NULL,
      error_message = LEFT(COALESCE(p_error, 'AI batch job failed'), 1000),
      updated_at = NOW()
  WHERE id = p_job_id
    AND status = 'processing';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ai_batch_job(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_ai_batch_job(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_ai_batch_job(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_ai_batch_job(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_ai_batch_job(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_ai_batch_job(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.match_project_story_memory(
  p_query_embedding extensions.vector(1536),
  p_user_id UUID,
  p_org_id UUID,
  p_project_id UUID,
  p_kinds TEXT[] DEFAULT NULL,
  p_match_count INTEGER DEFAULT 8,
  p_match_threshold DOUBLE PRECISION DEFAULT 0.15
) RETURNS TABLE (
  id UUID,
  kind TEXT,
  source_anchor TEXT,
  content TEXT,
  token_count INTEGER,
  metadata JSONB,
  similarity DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    m.id,
    m.kind,
    m.source_anchor,
    m.content,
    m.token_count,
    m.metadata,
    1 - (m.embedding <=> p_query_embedding) AS similarity
  FROM public.project_story_memory m
  WHERE m.user_id = p_user_id
    AND m.org_id = p_org_id
    AND m.project_id = p_project_id
    AND (p_kinds IS NULL OR m.kind = ANY(p_kinds))
    AND 1 - (m.embedding <=> p_query_embedding) >= p_match_threshold
  ORDER BY m.embedding <=> p_query_embedding
  LIMIT GREATEST(1, LEAST(COALESCE(p_match_count, 8), 20));
$$;

CREATE OR REPLACE FUNCTION public.claim_story_memory_job(
  p_project_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.project_memory_status%ROWTYPE;
  v_project public.projects%ROWTYPE;
BEGIN
  SELECT *
  INTO v_status
  FROM public.project_memory_status
  WHERE (p_project_id IS NULL OR project_id = p_project_id)
    AND (
      status = 'pending'
      OR (status = 'failed' AND attempts < 5)
      OR (status = 'processing' AND locked_at < NOW() - INTERVAL '15 minutes' AND attempts < 5)
    )
  ORDER BY updated_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;

  UPDATE public.project_memory_status
  SET status = 'processing',
      attempts = attempts + 1,
      locked_at = NOW(),
      error_message = NULL,
      updated_at = NOW()
  WHERE project_id = v_status.project_id
  RETURNING * INTO v_status;

  SELECT *
  INTO v_project
  FROM public.projects
  WHERE id = v_status.project_id;

  IF NOT FOUND THEN
    UPDATE public.project_memory_status
    SET status = 'failed',
        locked_at = NULL,
        error_message = 'Project not found',
        updated_at = NOW()
    WHERE project_id = v_status.project_id;
    RETURN jsonb_build_object('status', 'none');
  END IF;

  RETURN jsonb_build_object(
    'status', 'claimed',
    'memoryStatus', to_jsonb(v_status),
    'project', to_jsonb(v_project)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_story_memory_job(
  p_project_id UUID,
  p_content_hash TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.project_memory_status
  SET status = 'ready',
      content_hash = p_content_hash,
      locked_at = NULL,
      last_indexed_at = NOW(),
      error_message = NULL,
      metadata = COALESCE(p_metadata, '{}'::jsonb),
      updated_at = NOW()
  WHERE project_id = p_project_id
    AND status = 'processing';
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_story_memory_job(
  p_project_id UUID,
  p_error TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.project_memory_status
  SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
      locked_at = NULL,
      error_message = LEFT(COALESCE(p_error, 'Story memory indexing failed'), 1000),
      updated_at = NOW()
  WHERE project_id = p_project_id
    AND status = 'processing';
END;
$$;

REVOKE ALL ON FUNCTION public.match_project_story_memory(
  extensions.vector(1536), UUID, UUID, UUID, TEXT[], INTEGER, DOUBLE PRECISION
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_story_memory_job(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_story_memory_job(UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_story_memory_job(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_project_story_memory(
  extensions.vector(1536), UUID, UUID, UUID, TEXT[], INTEGER, DOUBLE PRECISION
) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_story_memory_job(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_story_memory_job(UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_story_memory_job(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.create_project_with_quota(
  p_user_id UUID,
  p_org_id UUID,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_genre TEXT DEFAULT NULL,
  p_characters TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_mood TEXT DEFAULT NULL,
  p_content TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'draft'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
BEGIN
  INSERT INTO public.projects (
    org_id,
    user_id,
    title,
    description,
    genre,
    characters,
    location,
    mood,
    content,
    status
  ) VALUES (
    p_org_id,
    p_user_id,
    p_title,
    p_description,
    COALESCE(NULLIF(p_genre, ''), 'drama'),
    p_characters,
    p_location,
    p_mood,
    COALESCE(p_content, ''),
    COALESCE(NULLIF(p_status, ''), 'draft')
  )
  RETURNING * INTO v_project;

  RETURN jsonb_build_object('project', to_jsonb(v_project));
END;
$$;

REVOKE ALL ON FUNCTION public.create_project_with_quota(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_project_with_quota(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_business_funnel_counts(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_event_types TEXT[]
) RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = master_admin, public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'event_type', event_type,
        'events', events,
        'users', users
      )
      ORDER BY event_type
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      event_type,
      COUNT(*)::int AS events,
      COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::int AS users
    FROM master_admin.business_events
    WHERE created_at >= p_from
      AND created_at <= p_to
      AND event_type = ANY(COALESCE(p_event_types, '{}'::text[]))
    GROUP BY event_type
  ) g;
$$;

CREATE OR REPLACE FUNCTION public.admin_mrr_daily_groups(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
) RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'day', day,
        'plan', plan,
        'status', status,
        'billing_cycle', billing_cycle,
        'cnt', cnt
      )
      ORDER BY day, plan, status, billing_cycle
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      to_char(date_trunc('day', updated_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      plan::text,
      status::text,
      COALESCE(billing_cycle, 'monthly')::text AS billing_cycle,
      COUNT(*)::int AS cnt
    FROM public.subscriptions
    WHERE updated_at >= p_from AND updated_at <= p_to
    GROUP BY 1, plan, status, COALESCE(billing_cycle, 'monthly')
  ) g;
$$;

CREATE OR REPLACE FUNCTION public.admin_payment_ops_order_counts(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
) RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = master_admin, public
AS $$
  WITH orders AS (
    SELECT
      metadata ->> 'orderId' AS order_id,
      MIN(created_at) AS created_at
    FROM master_admin.business_events
    WHERE event_type = 'payment.order_created'
      AND created_at >= p_from
      AND created_at <= p_to
      AND metadata ->> 'orderId' IS NOT NULL
    GROUP BY metadata ->> 'orderId'
  ),
  applied AS (
    SELECT DISTINCT metadata ->> 'orderId' AS order_id
    FROM master_admin.business_events
    WHERE event_type = 'payment.webhook_applied'
      AND created_at >= p_from
      AND created_at <= p_to
      AND metadata ->> 'orderId' IS NOT NULL
  )
  SELECT jsonb_build_object(
    'pending_orders',
    COUNT(*) FILTER (WHERE applied.order_id IS NULL),
    'delayed_webhook_orders',
    COUNT(*) FILTER (
      WHERE applied.order_id IS NULL
        AND orders.created_at < NOW() - INTERVAL '15 minutes'
    )
  )
  FROM orders
  LEFT JOIN applied ON applied.order_id = orders.order_id;
$$;

CREATE OR REPLACE FUNCTION public.claim_payment_post_process_job(
  p_payment_id TEXT,
  p_order_id TEXT,
  p_user_id UUID,
  p_plan TEXT,
  p_billing_cycle TEXT,
  p_amount_paise INTEGER,
  p_current_period_end TIMESTAMPTZ
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = master_admin, public
AS $$
DECLARE
  v_row master_admin.payment_post_process_jobs%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT * INTO v_row
  FROM master_admin.payment_post_process_jobs
  WHERE razorpay_payment_id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO master_admin.payment_post_process_jobs (
      razorpay_payment_id,
      razorpay_order_id,
      user_id,
      plan,
      billing_cycle,
      amount_paise,
      current_period_end,
      status,
      attempts,
      locked_at
    )
    VALUES (
      p_payment_id,
      p_order_id,
      p_user_id,
      p_plan,
      p_billing_cycle,
      p_amount_paise,
      p_current_period_end,
      'processing',
      1,
      v_now
    )
    RETURNING * INTO v_row;

    RETURN jsonb_build_object('status', 'claimed', 'job', to_jsonb(v_row));
  END IF;

  IF v_row.status = 'completed' THEN
    RETURN jsonb_build_object('status', 'completed', 'job', to_jsonb(v_row));
  END IF;

  IF v_row.status = 'processing' AND v_row.locked_at > v_now - INTERVAL '5 minutes' THEN
    RETURN jsonb_build_object('status', 'processing', 'job', to_jsonb(v_row));
  END IF;

  UPDATE master_admin.payment_post_process_jobs
  SET
    razorpay_order_id = p_order_id,
    user_id = p_user_id,
    plan = p_plan,
    billing_cycle = p_billing_cycle,
    amount_paise = p_amount_paise,
    current_period_end = p_current_period_end,
    status = 'processing',
    attempts = attempts + 1,
    locked_at = v_now,
    last_error = NULL,
    updated_at = v_now
  WHERE razorpay_payment_id = p_payment_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('status', 'claimed', 'job', to_jsonb(v_row));
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_payment_post_process_job(
  p_payment_id TEXT
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = master_admin, public
AS $$
  UPDATE master_admin.payment_post_process_jobs
  SET
    status = 'completed',
    completed_at = NOW(),
    locked_at = NULL,
    last_error = NULL,
    updated_at = NOW()
  WHERE razorpay_payment_id = p_payment_id;
$$;

CREATE OR REPLACE FUNCTION public.fail_payment_post_process_job(
  p_payment_id TEXT,
  p_error TEXT
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = master_admin, public
AS $$
  UPDATE master_admin.payment_post_process_jobs
  SET
    status = 'failed',
    locked_at = NULL,
    last_error = LEFT(COALESCE(p_error, 'unknown error'), 2000),
    updated_at = NOW()
  WHERE razorpay_payment_id = p_payment_id;
$$;

REVOKE ALL ON FUNCTION public.admin_usage_daily_buckets(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_usage_endpoint_breakdown(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_signup_daily_buckets(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_top_users_by_usage(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_business_funnel_counts(TIMESTAMPTZ, TIMESTAMPTZ, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_mrr_daily_groups(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_payment_ops_order_counts(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_payment_post_process_job(TEXT, TEXT, UUID, TEXT, TEXT, INTEGER, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_payment_post_process_job(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_payment_post_process_job(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_usage_daily_buckets(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_usage_endpoint_breakdown(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_signup_daily_buckets(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_top_users_by_usage(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_business_funnel_counts(TIMESTAMPTZ, TIMESTAMPTZ, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_mrr_daily_groups(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_payment_ops_order_counts(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_payment_post_process_job(TEXT, TEXT, UUID, TEXT, TEXT, INTEGER, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_payment_post_process_job(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_payment_post_process_job(TEXT, TEXT) TO service_role;

-- =========================
-- 5) TRIGGERS
-- =========================

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_organizations_updated_at ON public.organizations;
CREATE TRIGGER set_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER set_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_projects_updated_at ON public.projects;
CREATE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_project_creation_usage_updated_at ON public.project_creation_usage;
CREATE TRIGGER set_project_creation_usage_updated_at
  BEFORE UPDATE ON public.project_creation_usage
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_pdf_export_purchases_updated_at ON public.pdf_export_purchases;
CREATE TRIGGER set_pdf_export_purchases_updated_at
  BEFORE UPDATE ON public.pdf_export_purchases
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_ai_credit_topup_purchases_updated_at ON public.ai_credit_topup_purchases;
CREATE TRIGGER set_ai_credit_topup_purchases_updated_at
  BEFORE UPDATE ON public.ai_credit_topup_purchases
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_ai_credit_reservations_updated_at ON public.ai_credit_reservations;
CREATE TRIGGER set_ai_credit_reservations_updated_at
  BEFORE UPDATE ON public.ai_credit_reservations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_ai_prompt_cache_entries_updated_at ON public.ai_prompt_cache_entries;
CREATE TRIGGER set_ai_prompt_cache_entries_updated_at
  BEFORE UPDATE ON public.ai_prompt_cache_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_ai_batch_jobs_updated_at ON public.ai_batch_jobs;
CREATE TRIGGER set_ai_batch_jobs_updated_at
  BEFORE UPDATE ON public.ai_batch_jobs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_project_memory_status_updated_at ON public.project_memory_status;
CREATE TRIGGER set_project_memory_status_updated_at
  BEFORE UPDATE ON public.project_memory_status
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_project_story_memory_updated_at ON public.project_story_memory;
CREATE TRIGGER set_project_story_memory_updated_at
  BEFORE UPDATE ON public.project_story_memory
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_project_story_bible_entries_updated_at ON public.project_story_bible_entries;
CREATE TRIGGER set_project_story_bible_entries_updated_at
  BEFORE UPDATE ON public.project_story_bible_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_organization_security_policies_updated_at ON public.organization_security_policies;
CREATE TRIGGER set_organization_security_policies_updated_at
  BEFORE UPDATE ON public.organization_security_policies
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_scim_provisioned_users_updated_at ON public.scim_provisioned_users;
CREATE TRIGGER set_scim_provisioned_users_updated_at
  BEFORE UPDATE ON public.scim_provisioned_users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_billing_customers_updated_at ON public.billing_customers;
CREATE TRIGGER set_billing_customers_updated_at
  BEFORE UPDATE ON public.billing_customers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_billing_refunds_updated_at ON public.billing_refunds;
CREATE TRIGGER set_billing_refunds_updated_at
  BEFORE UPDATE ON public.billing_refunds
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_project_comments_updated_at ON public.project_comments;
CREATE TRIGGER set_project_comments_updated_at
  BEFORE UPDATE ON public.project_comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER set_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_signup_risk_events_updated_at ON master_admin.signup_risk_events;
CREATE TRIGGER set_signup_risk_events_updated_at
  BEFORE UPDATE ON master_admin.signup_risk_events
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_user_account_controls_updated_at ON master_admin.user_account_controls;
CREATE TRIGGER set_user_account_controls_updated_at
  BEFORE UPDATE ON master_admin.user_account_controls
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_payment_post_process_jobs_updated_at ON master_admin.payment_post_process_jobs;
CREATE TRIGGER set_payment_post_process_jobs_updated_at
  BEFORE UPDATE ON master_admin.payment_post_process_jobs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS enforce_project_limit_on_insert ON public.projects;
CREATE TRIGGER enforce_project_limit_on_insert
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.enforce_project_limit_before_insert();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- 6) ROW LEVEL SECURITY
-- =========================

ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_admin.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_admin.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_admin.signup_risk_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_admin.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_admin.business_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_admin.payment_post_process_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_admin.user_account_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_admin.user_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_security_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scim_provisioned_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iam_audit_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_auth.otp_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_admin.otp_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_creation_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_credit_topup_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_credit_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_credit_reservation_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_prompt_cache_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_batch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generation_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_memory_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_story_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_story_bible_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.razorpay_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdf_export_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscription_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_export_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

-- profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- master_admin.users: no client policies - only service_role (bypasses RLS) may read/write.

-- master_admin.audit_log: no client policies - only service_role may read/write.

-- master_admin.security_events/business_events/payment_post_process_jobs/user_account_controls/user_notes:
-- no client policies - only service_role may read/write.

-- organizations + membership (enterprise IAM)
DROP POLICY IF EXISTS "Org members can view their organizations" ON public.organizations;
DROP POLICY IF EXISTS "Users can create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Org admins can update organizations" ON public.organizations;
CREATE POLICY "Org members can view their organizations"
  ON public.organizations FOR SELECT
  USING (public.is_org_member(organizations.id, auth.uid()));
CREATE POLICY "Users can create organizations"
  ON public.organizations FOR INSERT
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "Org admins can update organizations"
  ON public.organizations FOR UPDATE
  USING (public.has_org_role(organizations.id, auth.uid(), ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS "Org members can view memberships" ON public.organization_members;
DROP POLICY IF EXISTS "Org admins can insert memberships" ON public.organization_members;
DROP POLICY IF EXISTS "Org admins can update memberships" ON public.organization_members;
DROP POLICY IF EXISTS "Org admins can delete memberships" ON public.organization_members;
CREATE POLICY "Org members can view memberships"
  ON public.organization_members FOR SELECT
  USING (public.is_org_member(organization_members.org_id, auth.uid()));
CREATE POLICY "Org admins can insert memberships"
  ON public.organization_members FOR INSERT
  WITH CHECK (public.has_org_role(organization_members.org_id, auth.uid(), ARRAY['owner', 'admin']));
CREATE POLICY "Org admins can update memberships"
  ON public.organization_members FOR UPDATE
  USING (public.has_org_role(organization_members.org_id, auth.uid(), ARRAY['owner', 'admin']));
CREATE POLICY "Org admins can delete memberships"
  ON public.organization_members FOR DELETE
  USING (public.has_org_role(organization_members.org_id, auth.uid(), ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS "Org members can view invites" ON public.organization_invites;
DROP POLICY IF EXISTS "Org admins can create invites" ON public.organization_invites;
DROP POLICY IF EXISTS "Org admins can update invites" ON public.organization_invites;
CREATE POLICY "Org members can view invites"
  ON public.organization_invites FOR SELECT
  USING (public.is_org_member(organization_invites.org_id, auth.uid()));
CREATE POLICY "Org admins can create invites"
  ON public.organization_invites FOR INSERT
  WITH CHECK (public.has_org_role(organization_invites.org_id, auth.uid(), ARRAY['owner', 'admin']));
CREATE POLICY "Org admins can update invites"
  ON public.organization_invites FOR UPDATE
  USING (public.has_org_role(organization_invites.org_id, auth.uid(), ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS "Org members can view security policy" ON public.organization_security_policies;
DROP POLICY IF EXISTS "Org owners can manage security policy" ON public.organization_security_policies;
CREATE POLICY "Org members can view security policy"
  ON public.organization_security_policies FOR SELECT
  USING (public.is_org_member(organization_security_policies.org_id, auth.uid()));
CREATE POLICY "Org owners can manage security policy"
  ON public.organization_security_policies FOR ALL
  USING (public.has_org_role(organization_security_policies.org_id, auth.uid(), ARRAY['owner']))
  WITH CHECK (public.has_org_role(organization_security_policies.org_id, auth.uid(), ARRAY['owner']));

DROP POLICY IF EXISTS "Org owners can view SCIM provisioned users" ON public.scim_provisioned_users;
CREATE POLICY "Org owners can view SCIM provisioned users"
  ON public.scim_provisioned_users FOR SELECT
  USING (public.has_org_role(scim_provisioned_users.org_id, auth.uid(), ARRAY['owner']));

-- iam_audit_log: org admins can read (writes should be service role / RPC only)
DROP POLICY IF EXISTS "Org admins can view IAM audit log" ON public.iam_audit_log;
CREATE POLICY "Org admins can view IAM audit log"
  ON public.iam_audit_log FOR SELECT
  USING (
    org_id IS NOT NULL
    AND public.has_org_role(iam_audit_log.org_id, auth.uid(), ARRAY['owner', 'admin'])
  );

-- subscriptions
DROP POLICY IF EXISTS "Users can view their own subscription" ON public.subscriptions;
CREATE POLICY "Users can view their own subscription"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- projects
DROP POLICY IF EXISTS "Users can view their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can create their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete their own projects" ON public.projects;
DROP POLICY IF EXISTS "Org project readers can view projects" ON public.projects;
DROP POLICY IF EXISTS "Org project writers can create projects" ON public.projects;
DROP POLICY IF EXISTS "Org project writers can update projects" ON public.projects;
DROP POLICY IF EXISTS "Org project writers can delete projects" ON public.projects;
CREATE POLICY "Org project readers can view projects"
  ON public.projects FOR SELECT
  USING (public.has_org_role(projects.org_id, auth.uid(), ARRAY['owner', 'admin', 'member']));
CREATE POLICY "Org project writers can create projects"
  ON public.projects FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND public.has_org_role(projects.org_id, auth.uid(), ARRAY['owner', 'admin', 'member'])
  );
CREATE POLICY "Org project writers can update projects"
  ON public.projects FOR UPDATE
  USING (public.has_org_role(projects.org_id, auth.uid(), ARRAY['owner', 'admin', 'member']))
  WITH CHECK (public.has_org_role(projects.org_id, auth.uid(), ARRAY['owner', 'admin', 'member']));
CREATE POLICY "Org project writers can delete projects"
  ON public.projects FOR DELETE
  USING (public.has_org_role(projects.org_id, auth.uid(), ARRAY['owner', 'admin', 'member']));

DROP POLICY IF EXISTS "Users can view own project creation usage" ON public.project_creation_usage;
CREATE POLICY "Users can view own project creation usage"
  ON public.project_creation_usage FOR SELECT
  USING (auth.uid() = user_id);

-- documents
DROP POLICY IF EXISTS "Users can view their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can upload their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can delete their own documents" ON public.documents;
CREATE POLICY "Users can view their own documents"
  ON public.documents FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can upload their own documents"
  ON public.documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own documents"
  ON public.documents FOR DELETE
  USING (auth.uid() = user_id);

-- usage_logs: users read own rows; inserts must be their own user_id (no spoofing)
DROP POLICY IF EXISTS "Users can view own usage" ON public.usage_logs;
DROP POLICY IF EXISTS "Service can insert usage" ON public.usage_logs;
DROP POLICY IF EXISTS "Users can insert own usage logs" ON public.usage_logs;
CREATE POLICY "Users can view own usage"
  ON public.usage_logs FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own usage logs"
  ON public.usage_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own monthly AI usage" ON public.ai_usage_monthly;
CREATE POLICY "Users can view own monthly AI usage"
  ON public.ai_usage_monthly FOR SELECT
  USING (auth.uid() = user_id);

-- ai_credit_topup_purchases: users may view own top-up ledger; writes stay service-role only.
DROP POLICY IF EXISTS "Users can view own AI credit topups" ON public.ai_credit_topup_purchases;
CREATE POLICY "Users can view own AI credit topups"
  ON public.ai_credit_topup_purchases FOR SELECT
  USING (auth.uid() = user_id);

-- ai_credit_reservations/allocation rows: no client policies - service-role only.

-- ai_prompt_cache_entries: users may inspect own cache records; writes stay service-role only.
DROP POLICY IF EXISTS "Users can view own AI prompt cache entries" ON public.ai_prompt_cache_entries;
CREATE POLICY "Users can view own AI prompt cache entries"
  ON public.ai_prompt_cache_entries FOR SELECT
  USING (auth.uid() = user_id);

-- ai_batch_jobs: users can view own jobs; creation and processing stay service-role only.
DROP POLICY IF EXISTS "Users can view own AI batch jobs" ON public.ai_batch_jobs;
DROP POLICY IF EXISTS "Users can create own AI batch jobs" ON public.ai_batch_jobs;
CREATE POLICY "Users can view own AI batch jobs"
  ON public.ai_batch_jobs FOR SELECT
  USING (auth.uid() = user_id);

-- ai_generation_feedback: users can view own feedback; inserts go through the verified API/service role.
DROP POLICY IF EXISTS "Users can view own AI generation feedback" ON public.ai_generation_feedback;
DROP POLICY IF EXISTS "Users can create own AI generation feedback" ON public.ai_generation_feedback;
CREATE POLICY "Users can view own AI generation feedback"
  ON public.ai_generation_feedback FOR SELECT
  USING (auth.uid() = user_id);

-- project_story_memory/project_memory_status: users can inspect own memory state; writes stay service-role only.
DROP POLICY IF EXISTS "Users can view own project memory status" ON public.project_memory_status;
CREATE POLICY "Users can view own project memory status"
  ON public.project_memory_status FOR SELECT
  USING (
    auth.uid() = user_id
    AND public.has_org_role(project_memory_status.org_id, auth.uid(), ARRAY['owner', 'admin', 'member'])
  );

DROP POLICY IF EXISTS "Users can view own project story memory" ON public.project_story_memory;
CREATE POLICY "Users can view own project story memory"
  ON public.project_story_memory FOR SELECT
  USING (
    auth.uid() = user_id
    AND public.has_org_role(project_story_memory.org_id, auth.uid(), ARRAY['owner', 'admin', 'member'])
  );

-- project_story_bible_entries: user-owned screenplay facts. Org writers can edit; billing role is read-only by omission.
DROP POLICY IF EXISTS "Org project readers can view story bible entries" ON public.project_story_bible_entries;
DROP POLICY IF EXISTS "Org project writers can create story bible entries" ON public.project_story_bible_entries;
DROP POLICY IF EXISTS "Org project writers can update story bible entries" ON public.project_story_bible_entries;
DROP POLICY IF EXISTS "Org project writers can delete story bible entries" ON public.project_story_bible_entries;
CREATE POLICY "Org project readers can view story bible entries"
  ON public.project_story_bible_entries FOR SELECT
  USING (
    deleted_at IS NULL
    AND public.has_org_role(project_story_bible_entries.org_id, auth.uid(), ARRAY['owner', 'admin', 'member'])
  );
CREATE POLICY "Org project writers can create story bible entries"
  ON public.project_story_bible_entries FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND public.has_org_role(project_story_bible_entries.org_id, auth.uid(), ARRAY['owner', 'admin', 'member'])
  );
CREATE POLICY "Org project writers can update story bible entries"
  ON public.project_story_bible_entries FOR UPDATE
  USING (public.has_org_role(project_story_bible_entries.org_id, auth.uid(), ARRAY['owner', 'admin', 'member']))
  WITH CHECK (public.has_org_role(project_story_bible_entries.org_id, auth.uid(), ARRAY['owner', 'admin', 'member']));
CREATE POLICY "Org project writers can delete story bible entries"
  ON public.project_story_bible_entries FOR DELETE
  USING (public.has_org_role(project_story_bible_entries.org_id, auth.uid(), ARRAY['owner', 'admin', 'member']));

DROP POLICY IF EXISTS "Org project readers can view comments" ON public.project_comments;
DROP POLICY IF EXISTS "Org project readers can create comments" ON public.project_comments;
DROP POLICY IF EXISTS "Org project writers can update comments" ON public.project_comments;
CREATE POLICY "Org project readers can view comments"
  ON public.project_comments FOR SELECT
  USING (public.has_org_role(project_comments.org_id, auth.uid(), ARRAY['owner', 'admin', 'member']));
CREATE POLICY "Org project readers can create comments"
  ON public.project_comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND public.has_org_role(project_comments.org_id, auth.uid(), ARRAY['owner', 'admin', 'member'])
  );
CREATE POLICY "Org project writers can update comments"
  ON public.project_comments FOR UPDATE
  USING (public.has_org_role(project_comments.org_id, auth.uid(), ARRAY['owner', 'admin', 'member']))
  WITH CHECK (public.has_org_role(project_comments.org_id, auth.uid(), ARRAY['owner', 'admin', 'member']));

DROP POLICY IF EXISTS "Org project readers can view activity" ON public.project_activity_events;
CREATE POLICY "Org project readers can view activity"
  ON public.project_activity_events FOR SELECT
  USING (public.has_org_role(project_activity_events.org_id, auth.uid(), ARRAY['owner', 'admin', 'member']));

-- razorpay_payments
DROP POLICY IF EXISTS "Users can view own razorpay payments" ON public.razorpay_payments;
CREATE POLICY "Users can view own razorpay payments"
  ON public.razorpay_payments FOR SELECT
  USING (auth.uid() = user_id);

-- pdf_export_purchases
DROP POLICY IF EXISTS "Users can view own PDF export purchases" ON public.pdf_export_purchases;
CREATE POLICY "Users can view own PDF export purchases"
  ON public.pdf_export_purchases FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Org billing readers can view billing customers" ON public.billing_customers;
CREATE POLICY "Org billing readers can view billing customers"
  ON public.billing_customers FOR SELECT
  USING (public.has_org_role(billing_customers.org_id, auth.uid(), ARRAY['owner', 'billing']));

DROP POLICY IF EXISTS "Users can view own billing ledger" ON public.billing_subscription_ledger;
CREATE POLICY "Users can view own billing ledger"
  ON public.billing_subscription_ledger FOR SELECT
  USING (auth.uid() = user_id OR (org_id IS NOT NULL AND public.has_org_role(org_id, auth.uid(), ARRAY['owner', 'billing'])));

DROP POLICY IF EXISTS "Users can view own billing invoices" ON public.billing_invoices;
CREATE POLICY "Users can view own billing invoices"
  ON public.billing_invoices FOR SELECT
  USING (auth.uid() = user_id OR (org_id IS NOT NULL AND public.has_org_role(org_id, auth.uid(), ARRAY['owner', 'billing'])));

DROP POLICY IF EXISTS "Users can view own billing refunds" ON public.billing_refunds;
CREATE POLICY "Users can view own billing refunds"
  ON public.billing_refunds FOR SELECT
  USING (auth.uid() = user_id OR (org_id IS NOT NULL AND public.has_org_role(org_id, auth.uid(), ARRAY['owner', 'billing'])));

DROP POLICY IF EXISTS "Users can view own account export requests" ON public.account_export_requests;
CREATE POLICY "Users can view own account export requests"
  ON public.account_export_requests FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own account deletion requests" ON public.account_deletion_requests;
CREATE POLICY "Users can view own account deletion requests"
  ON public.account_deletion_requests FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own support tickets" ON public.support_tickets;
CREATE POLICY "Users can view own support tickets"
  ON public.support_tickets FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own consents" ON public.user_consents;
CREATE POLICY "Users can view own consents"
  ON public.user_consents FOR SELECT
  USING (auth.uid() = user_id);

-- =========================
-- 7) STORAGE
-- =========================
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own documents" ON storage.objects;

CREATE POLICY "Users can upload their own documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read their own documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- =========================
-- 8) SUBSCRIPTION EVENTS
-- =========================
-- Append-only audit trail for subscription plan changes (activation, upgrade, downgrade, expiry).
-- Gives a full billing history per user without overwriting the subscriptions row.
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  event_type            TEXT        NOT NULL CHECK (event_type IN ('activated', 'authenticated', 'charged', 'upgraded', 'downgraded', 'past_due', 'expired', 'cancelled', 'reactivated', 'refunded', 'disputed')),
  from_plan             TEXT,
  to_plan               TEXT        NOT NULL,
  billing_cycle         TEXT,
  razorpay_payment_id   TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subscription_events'::regclass
      AND conname = 'subscription_events_event_type_check'
  ) THEN
    ALTER TABLE public.subscription_events DROP CONSTRAINT subscription_events_event_type_check;
  END IF;

  ALTER TABLE public.subscription_events
    ADD CONSTRAINT subscription_events_event_type_check
    CHECK (event_type IN ('activated', 'authenticated', 'charged', 'upgraded', 'downgraded', 'past_due', 'expired', 'cancelled', 'reactivated', 'refunded', 'disputed'));
END $$;

CREATE INDEX IF NOT EXISTS subscription_events_user_created_idx
  ON public.subscription_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subscription_events_type_created_idx
  ON public.subscription_events(event_type, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_events_payment_event_unique_idx
  ON public.subscription_events(razorpay_payment_id, event_type)
  WHERE razorpay_payment_id IS NOT NULL;

-- Speeds up the daily cron query: subscriptions expiring soon / already expired
CREATE INDEX IF NOT EXISTS subscriptions_period_end_active_idx
  ON public.subscriptions(current_period_end)
  WHERE status = 'active';

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own subscription events" ON public.subscription_events;
CREATE POLICY "Users can view their own subscription events"
  ON public.subscription_events FOR SELECT
  USING (auth.uid() = user_id);

-- =========================
-- 9) STATISTICS
-- =========================
ANALYZE public.profiles;
ANALYZE master_admin.users;
ANALYZE master_admin.audit_log;
ANALYZE master_admin.signup_risk_events;
ANALYZE master_admin.security_events;
ANALYZE master_admin.business_events;
ANALYZE master_admin.payment_post_process_jobs;
ANALYZE master_admin.user_account_controls;
ANALYZE master_admin.user_notes;
ANALYZE public.organizations;
ANALYZE public.organization_members;
ANALYZE public.organization_invites;
ANALYZE public.organization_security_policies;
ANALYZE public.scim_provisioned_users;
ANALYZE public.iam_audit_log;
ANALYZE public.subscriptions;
ANALYZE public.subscription_events;
ANALYZE public.projects;
ANALYZE public.project_creation_usage;
ANALYZE public.documents;
ANALYZE public.usage_logs;
ANALYZE public.ai_usage_monthly;
ANALYZE public.ai_credit_topup_purchases;
ANALYZE public.ai_credit_reservations;
ANALYZE public.ai_credit_reservation_allocations;
ANALYZE public.ai_prompt_cache_entries;
ANALYZE public.ai_batch_jobs;
ANALYZE public.ai_generation_feedback;
ANALYZE public.project_memory_status;
ANALYZE public.project_story_memory;
ANALYZE public.project_story_bible_entries;
ANALYZE public.project_comments;
ANALYZE public.project_activity_events;
ANALYZE public.razorpay_payments;
ANALYZE public.pdf_export_purchases;
ANALYZE public.billing_customers;
ANALYZE public.billing_subscription_ledger;
ANALYZE public.billing_invoices;
ANALYZE public.billing_refunds;
ANALYZE public.account_export_requests;
ANALYZE public.account_deletion_requests;
ANALYZE public.support_tickets;
ANALYZE public.user_consents;

SELECT 'Database schema created successfully!' AS status;
