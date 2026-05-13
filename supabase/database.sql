-- ============================================================
-- Writers Block - Complete Database Schema
--
-- Idempotent: safe to re-run in Supabase SQL Editor (adds missing
-- columns, IF NOT EXISTS indexes/constraints, replaces functions).
--
-- Objects: profiles, master_admin_users, subscriptions, projects, documents, usage_logs,
-- ai_credit_topups, ai_credit_reservations, razorpay_payments, storage bucket `documents`,
-- helper functions (AI credit reservation, apply_subscription_payment,
-- admin_subscription_group_counts).
-- ============================================================

-- =========================
-- 1) EXTENSIONS
-- =========================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- Reserved for future fuzzy search / pg_trgm indexes on titles, etc.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

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
-- Grant access: INSERT INTO public.master_admin_users (user_id) VALUES ('<auth.users.id>');
CREATE TABLE IF NOT EXISTS public.master_admin_users (
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  note        TEXT
);

-- subscriptions: one row per user, plan, Razorpay ids (billing_cycle + expiry added in §2a for legacy compatibility)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  plan                  TEXT        CHECK (plan IN ('free', 'pro', 'premium')) DEFAULT 'free' NOT NULL,
  projects_limit        INTEGER     DEFAULT 5 NOT NULL,
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
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  endpoint    TEXT        NOT NULL,
  plan        TEXT        DEFAULT 'free' NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ai_credit_topups: optional paid/granted credits outside monthly included credits.
CREATE TABLE IF NOT EXISTS public.ai_credit_topups (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  credits_granted  INTEGER     NOT NULL CHECK (credits_granted > 0),
  source           TEXT        DEFAULT 'manual' NOT NULL,
  payment_id       TEXT,
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ai_credit_reservations: source of truth for pre-provider reservations and settlement.
CREATE TABLE IF NOT EXISTS public.ai_credit_reservations (
  id                         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                    UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint                   TEXT        NOT NULL,
  plan                       TEXT        CHECK (plan IN ('free', 'pro', 'premium')) NOT NULL,
  status                     TEXT        CHECK (status IN ('reserved', 'committed', 'failed_charged', 'released')) DEFAULT 'reserved' NOT NULL,
  estimated_credits          INTEGER     NOT NULL CHECK (estimated_credits > 0),
  reserved_included_credits  INTEGER     DEFAULT 0 NOT NULL CHECK (reserved_included_credits >= 0),
  reserved_topup_credits     INTEGER     DEFAULT 0 NOT NULL CHECK (reserved_topup_credits >= 0),
  charged_included_credits   INTEGER     DEFAULT 0 NOT NULL CHECK (charged_included_credits >= 0),
  charged_topup_credits      INTEGER     DEFAULT 0 NOT NULL CHECK (charged_topup_credits >= 0),
  period_start               TIMESTAMPTZ NOT NULL,
  period_end                 TIMESTAMPTZ NOT NULL,
  provider_started_at        TIMESTAMPTZ,
  failure_code               TEXT,
  expires_at                 TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '2 hours') NOT NULL,
  created_at                 TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at                 TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.usage_logs
  ADD COLUMN IF NOT EXISTS ai_credit_reservation_id UUID REFERENCES public.ai_credit_reservations(id);
ALTER TABLE public.usage_logs
  ADD COLUMN IF NOT EXISTS credits_charged INTEGER DEFAULT 1 NOT NULL;
ALTER TABLE public.usage_logs
  ADD COLUMN IF NOT EXISTS outcome TEXT DEFAULT 'completed' NOT NULL;

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

-- =========================
-- 3) INDEXES
-- ============================
DROP INDEX IF EXISTS projects_user_id_idx;
DROP INDEX IF EXISTS projects_updated_at_idx;
DROP INDEX IF EXISTS documents_user_id_idx;
DROP INDEX IF EXISTS documents_project_id_idx;

CREATE INDEX IF NOT EXISTS projects_user_updated_idx
  ON public.projects(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS projects_user_status_idx
  ON public.projects(user_id, status);

CREATE INDEX IF NOT EXISTS projects_active_idx
  ON public.projects(user_id, updated_at DESC)
  WHERE status IN ('draft', 'in_progress');

CREATE INDEX IF NOT EXISTS projects_search_idx
  ON public.projects
  USING gin(to_tsvector('english', title || ' ' || COALESCE(description, '')));

CREATE INDEX IF NOT EXISTS subscriptions_user_plan_idx
  ON public.subscriptions(user_id, plan);

CREATE INDEX IF NOT EXISTS documents_project_lookup_idx
  ON public.documents(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS profiles_email_idx
  ON public.profiles(email);

CREATE INDEX IF NOT EXISTS usage_logs_user_date_idx
  ON public.usage_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS usage_logs_endpoint_date_idx
  ON public.usage_logs(endpoint, created_at DESC);

-- Time-range admin / analytics scans on large usage_logs
CREATE INDEX IF NOT EXISTS usage_logs_created_at_idx
  ON public.usage_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS ai_credit_topups_user_idx
  ON public.ai_credit_topups(user_id, expires_at);

CREATE INDEX IF NOT EXISTS ai_credit_reservations_user_period_idx
  ON public.ai_credit_reservations(user_id, period_start, status);

CREATE INDEX IF NOT EXISTS ai_credit_reservations_expiry_idx
  ON public.ai_credit_reservations(status, expires_at)
  WHERE status = 'reserved';

CREATE INDEX IF NOT EXISTS razorpay_payments_user_created_idx
  ON public.razorpay_payments(user_id, created_at DESC);

-- =========================
-- 4) FUNCTIONS
-- =========================

CREATE OR REPLACE FUNCTION public.ai_monthly_credit_limit(p_plan TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_plan
    WHEN 'premium' THEN 6000
    WHEN 'pro' THEN 1500
    ELSE 150
  END;
$$;

CREATE OR REPLACE FUNCTION public.ai_minimum_credit_estimate(p_endpoint TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_endpoint
    WHEN 'rewrite-style' THEN 2
    WHEN 'batch-rewrite' THEN 5
    WHEN 'batch-rewrite-style' THEN 5
    WHEN 'rewrite-batch' THEN 5
    ELSE 1
  END;
$$;

CREATE OR REPLACE FUNCTION public.expire_stale_ai_credit_reservations(p_user_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_rec IN
    SELECT *
    FROM public.ai_credit_reservations
    WHERE status = 'reserved'
      AND expires_at < NOW()
      AND (p_user_id IS NULL OR user_id = p_user_id)
    FOR UPDATE
  LOOP
    IF v_rec.provider_started_at IS NULL THEN
      UPDATE public.ai_credit_reservations
      SET
        status = 'released',
        failure_code = COALESCE(failure_code, 'reservation_expired_before_provider'),
        updated_at = NOW()
      WHERE id = v_rec.id;
    ELSE
      UPDATE public.ai_credit_reservations
      SET
        status = 'failed_charged',
        charged_included_credits = reserved_included_credits,
        charged_topup_credits = reserved_topup_credits,
        failure_code = COALESCE(failure_code, 'reservation_expired_after_provider'),
        updated_at = NOW()
      WHERE id = v_rec.id;

      INSERT INTO public.usage_logs (
        user_id, endpoint, plan, ai_credit_reservation_id, credits_charged, outcome
      )
      VALUES (
        v_rec.user_id,
        v_rec.endpoint,
        v_rec.plan,
        v_rec.id,
        v_rec.reserved_included_credits + v_rec.reserved_topup_credits,
        'failed_charged'
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_ai_credit(
  p_user_id UUID,
  p_endpoint TEXT,
  p_plan TEXT,
  p_estimated_credits INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start TIMESTAMPTZ := date_trunc('month', NOW());
  v_period_end TIMESTAMPTZ := date_trunc('month', NOW()) + INTERVAL '1 month';
  v_sub_plan TEXT;
  v_sub_status TEXT;
  v_effective_plan TEXT;
  v_estimated INTEGER;
  v_monthly_limit INTEGER;
  v_included_held INTEGER;
  v_topup_granted INTEGER;
  v_topup_held INTEGER;
  v_included_available INTEGER;
  v_topup_available INTEGER;
  v_included_reserve INTEGER;
  v_topup_reserve INTEGER;
  v_reservation_id UUID;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_estimated := GREATEST(
    COALESCE(p_estimated_credits, 1),
    public.ai_minimum_credit_estimate(COALESCE(p_endpoint, ''))
  );

  IF v_estimated < 1 OR v_estimated > 10000 THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'invalid estimated credits');
  END IF;

  PERFORM public.expire_stale_ai_credit_reservations(p_user_id);

  INSERT INTO public.subscriptions (user_id, plan, projects_limit)
  VALUES (p_user_id, 'free', 5)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT plan, status INTO v_sub_plan, v_sub_status
  FROM public.subscriptions
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_effective_plan := CASE
    WHEN v_sub_status = 'active' AND v_sub_plan IN ('free', 'pro', 'premium') THEN v_sub_plan
    ELSE 'free'
  END;

  IF v_effective_plan = 'free'
     AND p_endpoint IN ('rewrite-style', 'batch-rewrite', 'batch-rewrite-style', 'rewrite-batch') THEN
    RETURN jsonb_build_object('status', 'paid_plan_required', 'plan', v_effective_plan);
  END IF;

  v_monthly_limit := public.ai_monthly_credit_limit(v_effective_plan);

  SELECT COALESCE(SUM(
    CASE
      WHEN status = 'reserved' THEN reserved_included_credits
      ELSE charged_included_credits
    END
  ), 0)::INTEGER
  INTO v_included_held
  FROM public.ai_credit_reservations
  WHERE user_id = p_user_id
    AND period_start = v_period_start
    AND status IN ('reserved', 'committed', 'failed_charged');

  SELECT COALESCE(SUM(credits_granted), 0)::INTEGER
  INTO v_topup_granted
  FROM public.ai_credit_topups
  WHERE user_id = p_user_id;

  SELECT COALESCE(SUM(
    CASE
      WHEN status = 'reserved' THEN reserved_topup_credits
      ELSE charged_topup_credits
    END
  ), 0)::INTEGER
  INTO v_topup_held
  FROM public.ai_credit_reservations
  WHERE user_id = p_user_id
    AND status IN ('reserved', 'committed', 'failed_charged');

  v_included_available := GREATEST(0, v_monthly_limit - v_included_held);
  v_topup_available := GREATEST(0, v_topup_granted - v_topup_held);

  IF v_estimated > (v_included_available + v_topup_available) THEN
    RETURN jsonb_build_object(
      'status', 'insufficient_credits',
      'plan', v_effective_plan,
      'estimated_credits', v_estimated,
      'monthly_limit', v_monthly_limit,
      'included_available', v_included_available,
      'topup_available', v_topup_available
    );
  END IF;

  v_included_reserve := LEAST(v_estimated, v_included_available);
  v_topup_reserve := v_estimated - v_included_reserve;

  INSERT INTO public.ai_credit_reservations (
    user_id,
    endpoint,
    plan,
    estimated_credits,
    reserved_included_credits,
    reserved_topup_credits,
    period_start,
    period_end
  )
  VALUES (
    p_user_id,
    p_endpoint,
    v_effective_plan,
    v_estimated,
    v_included_reserve,
    v_topup_reserve,
    v_period_start,
    v_period_end
  )
  RETURNING id INTO v_reservation_id;

  RETURN jsonb_build_object(
    'status', 'reserved',
    'reservation_id', v_reservation_id,
    'plan', v_effective_plan,
    'estimated_credits', v_estimated,
    'included_credits', v_included_reserve,
    'topup_credits', v_topup_reserve,
    'monthly_limit', v_monthly_limit,
    'included_available_after', v_included_available - v_included_reserve,
    'topup_available_after', v_topup_available - v_topup_reserve,
    'period_start', v_period_start,
    'period_end', v_period_end
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_ai_credit_provider_started(
  p_reservation_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.ai_credit_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF auth.uid() IS DISTINCT FROM v_user_id
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.ai_credit_reservations
  SET
    provider_started_at = COALESCE(provider_started_at, NOW()),
    updated_at = NOW()
  WHERE id = p_reservation_id
    AND status = 'reserved';

  RETURN jsonb_build_object('status', 'provider_started');
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_ai_credit_reservation(
  p_reservation_id UUID,
  p_outcome TEXT,
  p_actual_credits INTEGER DEFAULT NULL,
  p_failure_code TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_actual INTEGER;
  v_charged_included INTEGER;
  v_charged_topup INTEGER;
  v_new_status TEXT;
BEGIN
  SELECT *
  INTO v_rec
  FROM public.ai_credit_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF auth.uid() IS DISTINCT FROM v_rec.user_id
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF v_rec.status <> 'reserved' THEN
    RETURN jsonb_build_object('status', 'already_settled', 'current_status', v_rec.status);
  END IF;

  IF p_outcome = 'release' AND v_rec.provider_started_at IS NULL THEN
    UPDATE public.ai_credit_reservations
    SET
      status = 'released',
      failure_code = p_failure_code,
      updated_at = NOW()
    WHERE id = p_reservation_id;

    RETURN jsonb_build_object(
      'status', 'released',
      'charged_included_credits', 0,
      'charged_topup_credits', 0
    );
  END IF;

  IF p_outcome NOT IN ('commit', 'failed_charged', 'release') THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'invalid outcome');
  END IF;

  v_actual := LEAST(
    GREATEST(COALESCE(p_actual_credits, v_rec.estimated_credits), 1),
    v_rec.estimated_credits
  );
  v_charged_included := LEAST(v_actual, v_rec.reserved_included_credits);
  v_charged_topup := LEAST(
    v_actual - v_charged_included,
    v_rec.reserved_topup_credits
  );
  v_new_status := CASE WHEN p_outcome = 'commit' THEN 'committed' ELSE 'failed_charged' END;

  UPDATE public.ai_credit_reservations
  SET
    status = v_new_status,
    charged_included_credits = v_charged_included,
    charged_topup_credits = v_charged_topup,
    provider_started_at = COALESCE(provider_started_at, NOW()),
    failure_code = p_failure_code,
    updated_at = NOW()
  WHERE id = p_reservation_id;

  INSERT INTO public.usage_logs (
    user_id, endpoint, plan, ai_credit_reservation_id, credits_charged, outcome
  )
  VALUES (
    v_rec.user_id,
    v_rec.endpoint,
    v_rec.plan,
    p_reservation_id,
    v_charged_included + v_charged_topup,
    v_new_status
  );

  RETURN jsonb_build_object(
    'status', v_new_status,
    'charged_included_credits', v_charged_included,
    'charged_topup_credits', v_charged_topup
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ai_monthly_credit_limit(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_minimum_credit_estimate(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_stale_ai_credit_reservations(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_ai_credit(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_ai_credit_provider_started(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_ai_credit_reservation(UUID, TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_ai_credit(UUID, TEXT, TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_ai_credit_provider_started(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.settle_ai_credit_reservation(UUID, TEXT, INTEGER, TEXT) TO authenticated, service_role;

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
  sub_limit int;
BEGIN
  SELECT status, projects_limit INTO sub_status, sub_limit
  FROM public.subscriptions
  WHERE user_id = NEW.user_id;

  IF NOT FOUND THEN
    lim := 5;
  ELSIF sub_status IS DISTINCT FROM 'active' THEN
    lim := 5;
  ELSE
    lim := COALESCE(sub_limit, 5);
  END IF;

  SELECT COUNT(*)::int INTO cnt FROM public.projects WHERE user_id = NEW.user_id;
  IF cnt >= lim THEN
    RAISE EXCEPTION 'project_limit_reached';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.subscriptions (user_id, plan, projects_limit)
  VALUES (NEW.id, 'free', 5)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
  v_projects_limit := CASE p_plan WHEN 'pro' THEN 25 WHEN 'premium' THEN 999999 ELSE 5 END;

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

-- =========================
-- 5) TRIGGERS
-- =========================

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER set_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_projects_updated_at ON public.projects;
CREATE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_ai_credit_reservations_updated_at ON public.ai_credit_reservations;
CREATE TRIGGER set_ai_credit_reservations_updated_at
  BEFORE UPDATE ON public.ai_credit_reservations
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
ALTER TABLE public.master_admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_credit_topups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_credit_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.razorpay_payments ENABLE ROW LEVEL SECURITY;

-- profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- master_admin_users: no client policies — only service_role (bypasses RLS) may read/write.

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
CREATE POLICY "Users can view their own projects"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own projects"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own projects"
  ON public.projects FOR DELETE
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

-- ai_credit_topups / ai_credit_reservations: users may inspect their own accounting;
-- reservations and settlement are only mutated through SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS "Users can view own AI credit topups" ON public.ai_credit_topups;
CREATE POLICY "Users can view own AI credit topups"
  ON public.ai_credit_topups FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own AI credit reservations" ON public.ai_credit_reservations;
CREATE POLICY "Users can view own AI credit reservations"
  ON public.ai_credit_reservations FOR SELECT
  USING (auth.uid() = user_id);

-- razorpay_payments
DROP POLICY IF EXISTS "Users can view own razorpay payments" ON public.razorpay_payments;
CREATE POLICY "Users can view own razorpay payments"
  ON public.razorpay_payments FOR SELECT
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
-- 8) STATISTICS
-- =========================
ANALYZE public.profiles;
ANALYZE public.master_admin_users;
ANALYZE public.subscriptions;
ANALYZE public.projects;
ANALYZE public.documents;
ANALYZE public.usage_logs;
ANALYZE public.ai_credit_topups;
ANALYZE public.ai_credit_reservations;
ANALYZE public.razorpay_payments;

SELECT 'Database schema created successfully!' AS status;
