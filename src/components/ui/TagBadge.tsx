// A tag chip. When `matched` is true it renders in the accent to signal a
// discovery match; when `removable` it shows an x and calls onRemove.
export function TagBadge({
  label,
  matched = false,
  learning = false,
  onRemove,
}: {
  label: string;
  matched?: boolean;
  learning?: boolean;
  onRemove?: () => void;
}) {
  const tone = matched
    ? "border-pine bg-pine-soft text-pine"
    : learning
      ? "border-hairline bg-transparent text-ink-muted"
      : "border-hairline bg-white text-ink";
  return (
    <span
      className={`mono inline-flex items-center gap-1 border px-2 py-0.5 text-2xs ${tone}`}
    >
      {learning && <span aria-hidden>↗</span>}
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="ml-0.5 text-ink-muted hover:text-brick"
        >
          ×
        </button>
      )}
    </span>
  );
}
