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

export type ContextRef = { contextType: string; contextId: string };

// Batched form of the above, for the list surfaces (/messages, /requests) that
// render one label per row. Calling the single-item version in a loop meant a
// query per row, so the cost of opening those pages scaled with how socially
// active the viewer was — the exact users you least want to make expensive.
//
// This issues at most three queries regardless of row count, one per context kind,
// and returns a lookup keyed by `${contextType}:${contextId}`. Labels are produced
// by the same expressions as the single-item path so the two cannot drift.
export async function resolveContextLabels(
  refs: ContextRef[]
): Promise<Map<string, string>> {
  const key = (type: string, id: string) => `${type}:${id}`;
  const out = new Map<string, string>();
  if (refs.length === 0) return out;

  const roleIds: string[] = [];
  const projectIds: string[] = [];
  const intentIds: string[] = [];
  for (const r of refs) {
    if (r.contextType === "ROLE") roleIds.push(r.contextId);
    else if (r.contextType === "PROJECT") projectIds.push(r.contextId);
    else intentIds.push(r.contextId);
  }

  const [roles, projects, intents] = await Promise.all([
    roleIds.length
      ? db.openRole.findMany({
          where: { id: { in: roleIds } },
          select: { id: true, title: true, project: { select: { name: true } } },
        })
      : Promise.resolve([]),
    projectIds.length
      ? db.project.findMany({
          where: { id: { in: projectIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    intentIds.length
      ? db.intent.findMany({
          where: { id: { in: intentIds } },
          select: { id: true, kind: true },
        })
      : Promise.resolve([]),
  ]);

  for (const r of roles) out.set(key("ROLE", r.id), `Role: ${r.title} · ${r.project.name}`);
  for (const p of projects) out.set(key("PROJECT", p.id), `Project: ${p.name}`);
  for (const i of intents) out.set(key("INTENT", i.id), `Intent: ${i.kind}`);

  // A context whose subject was deleted still needs a label; fall back to the bare
  // kind exactly as the single-item path does.
  for (const r of refs) {
    const k = key(r.contextType, r.contextId);
    if (!out.has(k)) {
      out.set(
        k,
        r.contextType === "ROLE" ? "Role" : r.contextType === "PROJECT" ? "Project" : "Intent"
      );
    }
  }

  return out;
}

export function contextLabelKey(ref: ContextRef): string {
  return `${ref.contextType}:${ref.contextId}`;
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
