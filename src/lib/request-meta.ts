import { headers } from "next/headers";

// Best-effort client IP for rate limiting. In local dev there is no proxy, so
// this typically resolves to "local" — which is fine; the limiter still works
// per-email. In production behind a proxy, x-forwarded-for is honored.
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const trustedProxy = process.env.VERCEL === "1" || process.env.TRUST_PROXY_HEADERS === "true";
  if (!trustedProxy) return "untrusted-proxy";
  const vercel = h.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0]!.trim().slice(0, 64);
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim().slice(0, 64);
  return (h.get("x-real-ip") ?? "unknown").slice(0, 64);
}
