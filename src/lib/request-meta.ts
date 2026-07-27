import { headers } from "next/headers";

// Best-effort client IP for rate limiting. In local dev there is no proxy, so
// this typically resolves to "local" — which is fine; the limiter still works
// per-email. In production behind a proxy, x-forwarded-for is honored.
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "local";
}
