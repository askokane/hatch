// Registration email policy.
//
// By default HATCH accepts ANY valid email address. Setting REQUIRE_EDU_EMAIL=true
// re-enables the school-only gate (.edu domains, plus anything in
// DEV_EMAIL_ALLOWLIST when not running in production).

function parseAllowlist(): string[] {
  return (process.env.DEV_EMAIL_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isEduOnlyMode(): boolean {
  return process.env.REQUIRE_EDU_EMAIL === "true";
}

export function isAllowedRegistrationEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const atIdx = normalized.lastIndexOf("@");
  if (atIdx === -1) return false;
  const domain = normalized.slice(atIdx + 1);

  // Open registration (default): any syntactically valid address is fine. Shape
  // is already validated by zod's .email() before this is called.
  if (!isEduOnlyMode()) return domain.length > 0;

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
