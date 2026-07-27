import Link from "next/link";

// URL-driven tabs (server-rendered): each tab is a link that sets a query param.
// Keyboard-operable by default (they're anchors), with the active tab marked.
export function Tabs({
  tabs,
  active,
  basePath,
  param = "tab",
}: {
  tabs: { value: string; label: string; count?: number }[];
  active: string;
  basePath: string;
  param?: string;
}) {
  return (
    <nav aria-label="Tabs" className="flex gap-1 border-b border-hairline">
      {tabs.map((t) => {
        const isActive = t.value === active;
        return (
          <Link
            key={t.value}
            href={`${basePath}?${param}=${t.value}`}
            aria-current={isActive ? "page" : undefined}
            className={`mono -mb-px border-b-2 px-3 py-2 text-xs ${
              isActive
                ? "border-pine text-ink"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
            {typeof t.count === "number" && t.count > 0 && (
              <span className="ml-1 text-pine">[{t.count}]</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
