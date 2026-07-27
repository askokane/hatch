// Registration requires a .edu email. A dev-only allowlist (DEV_EMAIL_ALLOWLIST)
// lets seed/demo/e2e accounts through even if their domain is not a real .edu.
// The bypass is only honored outside production.

function parseAllowlist(): string[] {
  return (process.env.DEV_EMAIL_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedRegistrationEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const atIdx = normalized.lastIndexOf("@");
  if (atIdx === -1) return false;
  const domain = normalized.slice(atIdx + 1);

  if (domain.endsWith(".edu")) return true;

  if (process.env.NODE_ENV !== "production") {
    const allow = parseAllowlist();
    for (const entry of allow) {
      if (entry.startsWith("@")) {
        if (domain === entry.slice(1)) return true;
      } else if (entry === normalized) {
        return true;
      }
    }
  }

  return false;
}
