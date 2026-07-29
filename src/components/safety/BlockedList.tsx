import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { UnblockButton } from "./UnblockButton";
import type { BlockedProfile } from "@/lib/relationship";

// Blocking hides someone from discovery, which also hides the only place the
// viewer could have undone it. Without this list a block would be effectively
// irreversible — you cannot find your way back to a profile you made invisible.
export function BlockedList({ blocked }: { blocked: BlockedProfile[] }) {
  if (blocked.length === 0) {
    return <p className="text-xs text-ink-muted">You haven&apos;t blocked anyone.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-hairline border border-hairline bg-white">
      {blocked.map((b) => (
        <li key={b.profileId} className="flex items-center justify-between gap-3 p-3">
          <Link href={`/u/${b.handle}`} className="flex items-center gap-2 hover:underline">
            <Avatar seed={b.avatarSeed} size={28} />
            <span className="text-xs">
              {b.name}
              <span className="mono block text-2xs text-ink-muted">@{b.handle}</span>
            </span>
          </Link>
          <UnblockButton blockedProfileId={b.profileId} blockedName={b.name} />
        </li>
      ))}
    </ul>
  );
}
