"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TagBadge } from "@/components/ui/TagBadge";
import { Button } from "@/components/ui/Button";
import { IntroRequestDialog } from "@/components/requests/IntroRequestDialog";
import { closeRoleAction } from "@/actions/projects";
import { useToast } from "@/components/ui/ToastProvider";
import { COMMITMENT_LABELS, ROLE_STATUS_LABELS } from "@/lib/constants";

export function ProjectRoleCard({
  role,
  ownerProfileId,
  ownerName,
  viewerMatchedTagIds,
  canRequest,
  canManage,
}: {
  role: { id: string; title: string; description: string; commitment: string; status: string; tags: { id: string; label: string }[] };
  ownerProfileId: string;
  ownerName: string;
  viewerMatchedTagIds: string[];
  canRequest: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [introOpen, setIntroOpen] = useState(false);
  const matched = new Set(viewerMatchedTagIds);

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
      <div className="mt-3 flex gap-2">
        {role.status === "OPEN" && canRequest && (
          <Button onClick={() => setIntroOpen(true)}>Request intro</Button>
        )}
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
