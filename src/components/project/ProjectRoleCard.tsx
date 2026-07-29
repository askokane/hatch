"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TagBadge } from "@/components/ui/TagBadge";
import { Button } from "@/components/ui/Button";
import { IntroRequestDialog } from "@/components/requests/IntroRequestDialog";
import { closeRoleAction } from "@/actions/projects";
import { useToast } from "@/components/ui/ToastProvider";
import { COMMITMENT_LABELS, ROLE_STATUS_LABELS } from "@/lib/constants";
import type { Relationship } from "@/lib/relationship";

export function ProjectRoleCard({
  role,
  ownerProfileId,
  ownerName,
  viewerMatchedTagIds,
  relationship,
  projectOpen,
  isMember,
  canManage,
}: {
  role: { id: string; title: string; description: string; commitment: string; status: string; tags: { id: string; label: string }[] };
  ownerProfileId: string;
  ownerName: string;
  viewerMatchedTagIds: string[];
  /** The viewer's standing with the project owner — the single source of truth. */
  relationship: Relationship;
  projectOpen: boolean;
  isMember: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [introOpen, setIntroOpen] = useState(false);
  const matched = new Set(viewerMatchedTagIds);

  // This used to be a bare `!isMember && !closed` check, so a pair who had
  // already connected and were mid-conversation still saw "Request intro" here.
  // The button is now only one of several states the relationship can produce.
  const showActions = role.status === "OPEN" && projectOpen && !isMember && !relationship.self;

  return (
    <article className="border border-hairline bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-base font-600">{role.title}</h4>
        <span className="mono text-2xs text-ink-muted">
          {role.status === "OPEN" ? COMMITMENT_LABELS[role.commitment] : ROLE_STATUS_LABELS[role.status]}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-muted">{role.description}</p>
      <div className="mt-3 flex flex-wrap gap-1">
        {role.tags.map((t) => (
          <TagBadge key={t.id} label={t.label} matched={matched.has(t.id)} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {showActions &&
          (relationship.connection === "CONNECTED" && relationship.threadId ? (
            <Link
              href={`/messages/${relationship.threadId}`}
              className="mono border border-pine bg-pine px-3 py-1.5 text-xs text-paper hover:bg-[#255c41]"
            >
              Message {ownerName}
            </Link>
          ) : relationship.connection === "PENDING_OUTBOUND" ? (
            <Link
              href="/requests?tab=sent"
              className="mono border border-hairline px-3 py-1.5 text-xs text-ink-muted hover:border-ink hover:text-ink"
            >
              Request sent · pending
            </Link>
          ) : relationship.connection === "PENDING_INBOUND" ? (
            <Link
              href="/requests"
              className="mono border border-pine bg-pine px-3 py-1.5 text-xs text-paper hover:bg-[#255c41]"
            >
              Respond to their request
            </Link>
          ) : relationship.viewerBlockedThem ? (
            <span className="mono text-2xs text-brick">You blocked {ownerName}.</span>
          ) : relationship.canRequestIntro ? (
            <Button onClick={() => setIntroOpen(true)}>Request intro</Button>
          ) : (
            // Neutral wording — a blocked viewer reaches this branch and must
            // not be able to tell it apart from any other unavailable state.
            <span className="mono text-2xs text-ink-muted">
              You can&apos;t request an intro right now.
            </span>
          ))}

        {canManage && role.status === "OPEN" && (
          <Button
            variant="ghost"
            onClick={async () => {
              const res = await closeRoleAction(role.id);
              if (res.ok) {
                notify("Role closed.", "success");
                router.refresh();
              } else {
                notify(res.error, "error");
              }
            }}
          >
            Close role
          </Button>
        )}
      </div>

      {introOpen && (
        <IntroRequestDialog
          targetProfileId={ownerProfileId}
          targetName={ownerName}
          contexts={{ roles: [{ id: role.id, label: `Role: ${role.title}` }], projects: [], intents: [] }}
          presetContext={{ type: "ROLE", id: role.id }}
          onClose={() => setIntroOpen(false)}
        />
      )}
    </article>
  );
}
