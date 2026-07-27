import type { ReactNode } from "react";

// A real, written empty state — every list uses one instead of rendering nothing.
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="border border-dashed border-hairline p-8 text-center">
      <p className="mono text-xs uppercase tracking-wide text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-xs text-ink-muted">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
