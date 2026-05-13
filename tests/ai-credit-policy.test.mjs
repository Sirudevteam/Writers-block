import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)
const policy = require("../lib/ai-credit-policy-core.js")

test("included credit reservations count pending reservations before allowing more spend", () => {
  const first = policy.allocateAiCredits(2, {
    monthlyLimit: 3,
    includedCommitted: 0,
    includedReserved: 1,
    topupGranted: 0,
    topupCommitted: 0,
    topupReserved: 0,
  })

  assert.equal(first.ok, true)
  assert.equal(first.includedCredits, 2)
  assert.equal(first.includedAvailableAfter, 0)

  const concurrent = policy.allocateAiCredits(1, {
    monthlyLimit: 3,
    includedCommitted: 0,
    includedReserved: 3,
    topupGranted: 0,
    topupCommitted: 0,
    topupReserved: 0,
  })

  assert.equal(concurrent.ok, false)
  assert.equal(concurrent.reason, "insufficient_credits")
  assert.equal(concurrent.includedAvailable, 0)
})

test("reservations spill to top-up credits only after monthly included credits are reserved", () => {
  const allocation = policy.allocateAiCredits(3, {
    monthlyLimit: 10,
    includedCommitted: 9,
    includedReserved: 0,
    topupGranted: 5,
    topupCommitted: 1,
    topupReserved: 0,
  })

  assert.equal(allocation.ok, true)
  assert.equal(allocation.includedCredits, 1)
  assert.equal(allocation.topupCredits, 2)
  assert.equal(allocation.includedAvailableAfter, 0)
  assert.equal(allocation.topupAvailableAfter, 2)
})

test("paid-only rewrite endpoints reject Free users, including batch variants", () => {
  for (const endpoint of ["rewrite-style", "batch-rewrite", "batch-rewrite-style", "rewrite-batch"]) {
    assert.equal(policy.isAiEndpointAllowedForPlan(endpoint, "free"), false)
    assert.equal(policy.isAiEndpointAllowedForPlan(endpoint, "pro"), true)
    assert.equal(policy.isAiEndpointAllowedForPlan(endpoint, "premium"), true)
  }
})

test("provider failures after start charge the reserved estimate", () => {
  const settlement = policy.settleAiCreditAllocation({
    reservedIncludedCredits: 1,
    reservedTopupCredits: 2,
    estimatedCredits: 3,
    providerStarted: true,
    completed: false,
  })

  assert.equal(settlement.status, "failed_charged")
  assert.equal(settlement.chargedIncludedCredits, 1)
  assert.equal(settlement.chargedTopupCredits, 2)
  assert.equal(settlement.releasedTopupCredits, 0)
})

test("failures before provider start release the reservation", () => {
  const settlement = policy.settleAiCreditAllocation({
    reservedIncludedCredits: 1,
    reservedTopupCredits: 2,
    estimatedCredits: 3,
    providerStarted: false,
    completed: false,
  })

  assert.equal(settlement.status, "released")
  assert.equal(settlement.chargedIncludedCredits, 0)
  assert.equal(settlement.chargedTopupCredits, 0)
  assert.equal(settlement.releasedIncludedCredits, 1)
  assert.equal(settlement.releasedTopupCredits, 2)
})

test("SQL reservation function locks the user subscription and charges stale provider-started reservations", () => {
  const sql = readFileSync(resolve(root, "supabase/database.sql"), "utf8")

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.reserve_ai_credit/)
  assert.match(sql, /WHERE user_id = p_user_id\s+FOR UPDATE/)
  assert.match(sql, /status IN \('reserved', 'committed', 'failed_charged'\)/)
  assert.match(sql, /status = 'failed_charged'/)
  assert.match(sql, /reservation_expired_after_provider/)
  assert.match(sql, /INSERT INTO public\.usage_logs/)
})
