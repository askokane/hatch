import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/context-label";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function AdminReportsPage() {
  const session = await requireSession("/admin/reports");
  // Gate: admins only. Non-admins (and unauthenticated, handled by requireSession)
  // are redirected — never shown report contents.
  if (!session.isAdmin) redirect("/discover");

  const reports = await db.report.findMany({
    include: { reporter: { select: { handle: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <p className="label-mono">[ admin · reports ]</p>
      <h1 className="mt-2 text-xl font-600">Reports</h1>
      <p className="mt-1 text-xs text-ink-muted">{reports.length} total</p>

      <div className="mt-6">
        {reports.length === 0 ? (
          <EmptyState title="No reports" body="Reports filed by users will appear here with their reason and detail." />
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="label-mono py-2 pr-3">date</th>
                <th className="label-mono py-2 pr-3">subject</th>
                <th className="label-mono py-2 pr-3">reason</th>
                <th className="label-mono py-2 pr-3">detail</th>
                <th className="label-mono py-2 pr-3">reporter</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b border-hairline align-top">
                  <td className="py-2 pr-3 text-ink-muted">{formatDate(r.createdAt)}</td>
                  <td className="py-2 pr-3">
                    <span className="mono text-2xs">{r.subjectType}</span>
                    <span className="mono block text-2xs text-ink-muted">{r.subjectId}</span>
                  </td>
                  <td className="py-2 pr-3">{r.reason}</td>
                  <td className="py-2 pr-3 text-ink-muted">{r.detail || "—"}</td>
                  <td className="py-2 pr-3 mono text-2xs">@{r.reporter.handle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
