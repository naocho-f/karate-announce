import * as Sentry from "@sentry/nextjs";
import { isLikelyBotUserAgent, isServiceWorkerRegistrationError } from "@/lib/sentry-filters";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],
    beforeSend(event) {
      const ua = typeof navigator !== "undefined" ? navigator.userAgent : event.request?.headers?.["User-Agent"];
      if (isLikelyBotUserAgent(ua)) return null;
      const message = event.exception?.values?.[0]?.value;
      if (isServiceWorkerRegistrationError(message)) return null;
      return event;
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
