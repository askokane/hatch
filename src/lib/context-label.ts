import { db } from "./db";

// Resolves an intro-request/thread context (type + id) into a human label like
// "Role: iOS Engineer · Curbside" for pinning at the top of threads and on cards.
export async function resolveContextLabel(
  contextType: string,
  contextId: string
): Promise<string> {
  if (contextType === "ROLE") {
    const role = await db.openRole.findUnique({
      where: { id: contextId },
      select: { title: true, project: { select: { name: true } } },
    });
    return role ? `Role: ${role.title} · ${role.project.name}` : "Role";
  }
  if (contextType === "PROJECT") {
    const project = await db.project.findUnique({
      where: { id: contextId },
      select: { name: true },
    });
    return project ? `Project: ${project.name}` : "Project";
  }
  // INTENT
  const intent = await db.intent.findUnique({ where: { id: contextId }, select: { kind: true } });
  return intent ? `Intent: ${intent.kind}` : "Intent";
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
