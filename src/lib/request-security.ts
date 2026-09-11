export function isTrustedMutationRequest(request: Request, requiredContentType?: string): boolean {
  const type = request.headers.get("content-type") ?? "";
  if (requiredContentType && !type.toLowerCase().startsWith(requiredContentType)) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return false;
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    const expected = process.env.APP_URL ? new URL(process.env.APP_URL).origin : new URL(request.url).origin;
    return new URL(origin).origin === expected;
  } catch { return false; }
}
