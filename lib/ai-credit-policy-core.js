const PLAN_MONTHLY_AI_CREDITS = {
  free: 150,
  pro: 1500,
  premium: 6000,
}

const AI_CREDIT_ESTIMATE_BY_ENDPOINT = {
  generate: 1,
  documents: 1,
  "generate-next": 1,
  "improve-dialogue": 1,
  "rewrite-style": 2,
  shots: 1,
  "movie-references": 1,
  "batch-rewrite": 5,
  "batch-rewrite-style": 5,
  "rewrite-batch": 5,
}

const PAID_ONLY_ENDPOINTS = new Set([
  "rewrite-style",
  "batch-rewrite",
  "batch-rewrite-style",
  "rewrite-batch",
])

function getAiMonthlyIncludedCredits(plan) {
  return PLAN_MONTHLY_AI_CREDITS[plan] ?? PLAN_MONTHLY_AI_CREDITS.free
}

function estimateAiCredits(endpoint) {
  return AI_CREDIT_ESTIMATE_BY_ENDPOINT[endpoint] ?? 1
}

function isPaidOnlyAiEndpoint(endpoint) {
  return PAID_ONLY_ENDPOINTS.has(endpoint)
}

function isAiEndpointAllowedForPlan(endpoint, plan) {
  return plan !== "free" || !isPaidOnlyAiEndpoint(endpoint)
}

function allocateAiCredits(requestedCredits, snapshot) {
  const estimatedCredits = Math.max(1, Math.floor(requestedCredits))
  const includedAvailable = Math.max(
    0,
    snapshot.monthlyLimit - snapshot.includedCommitted - snapshot.includedReserved
  )
  const topupAvailable = Math.max(
    0,
    snapshot.topupGranted - snapshot.topupCommitted - snapshot.topupReserved
  )

  if (estimatedCredits > includedAvailable + topupAvailable) {
    return {
      ok: false,
      reason: "insufficient_credits",
      estimatedCredits,
      includedAvailable,
      topupAvailable,
    }
  }

  const includedCredits = Math.min(estimatedCredits, includedAvailable)
  const topupCredits = estimatedCredits - includedCredits

  return {
    ok: true,
    estimatedCredits,
    includedCredits,
    topupCredits,
    includedAvailableAfter: includedAvailable - includedCredits,
    topupAvailableAfter: topupAvailable - topupCredits,
  }
}

function settleAiCreditAllocation(params) {
  const reservedIncludedCredits = Math.max(0, Math.floor(params.reservedIncludedCredits))
  const reservedTopupCredits = Math.max(0, Math.floor(params.reservedTopupCredits))

  if (!params.providerStarted) {
    return {
      status: "released",
      chargedIncludedCredits: 0,
      chargedTopupCredits: 0,
      releasedIncludedCredits: reservedIncludedCredits,
      releasedTopupCredits: reservedTopupCredits,
    }
  }

  const reservedTotal = reservedIncludedCredits + reservedTopupCredits
  const estimatedCredits = Math.max(1, Math.floor(params.estimatedCredits))
  const requestedActualCredits = Math.max(
    1,
    Math.floor(params.actualCredits ?? estimatedCredits)
  )
  const chargeableCredits = Math.min(requestedActualCredits, reservedTotal)
  const chargedIncludedCredits = Math.min(chargeableCredits, reservedIncludedCredits)
  const chargedTopupCredits = Math.min(
    chargeableCredits - chargedIncludedCredits,
    reservedTopupCredits
  )

  return {
    status: params.completed ? "committed" : "failed_charged",
    chargedIncludedCredits,
    chargedTopupCredits,
    releasedIncludedCredits: reservedIncludedCredits - chargedIncludedCredits,
    releasedTopupCredits: reservedTopupCredits - chargedTopupCredits,
  }
}

module.exports = {
  AI_CREDIT_ESTIMATE_BY_ENDPOINT,
  PLAN_MONTHLY_AI_CREDITS,
  allocateAiCredits,
  estimateAiCredits,
  getAiMonthlyIncludedCredits,
  isAiEndpointAllowedForPlan,
  isPaidOnlyAiEndpoint,
  settleAiCreditAllocation,
}
