import * as Sentry from "@sentry/nextjs"
import { scrubSentryEvent } from "@/infrastructure/observability/sentry-scrub"

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    debug: false,
    beforeSend: scrubSentryEvent,
  })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
