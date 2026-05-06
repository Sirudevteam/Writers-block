/**
 * Display INR amounts aligned with `src/modules/billing/domain/razorpay-pricing.ts` defaults in `.env.example`.
 * Update both when you change default paise in env.
 */

export const PRO_MONTHLY_INR = 1199
/** Effective monthly when billed annually (₹11,510/year ÷ 12). */
export const PRO_YEARLY_INR = 959
export const PREMIUM_MONTHLY_INR = 3999
export const PREMIUM_YEARLY_INR = 3199
/** (PRO_MONTHLY_INR * 12) − (annual order paise / 100) */
export const SAVINGS_PRO_ANNUAL_INR = 2878
export const SAVINGS_PREMIUM_ANNUAL_INR = 9598
