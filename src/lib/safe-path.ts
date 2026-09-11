export function safeLocalPath(value: unknown, fallback = "/discover"): string {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) return fallback;
  try {
    const url = new URL(value, "http://local.invalid");
    return url.origin === "http://local.invalid" ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}
