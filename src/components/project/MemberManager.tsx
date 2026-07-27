"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  inviteMemberAction,
  removeMemberAction,
  transferOwnershipAction,
} from "@/actions/projects";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/ToastProvider";

type Member = { profileId: string; handle: string; name: string; role: string; isOwner: boolean };

export function MemberManager({
  projectId,
  members,
}: {
  projectId: string;
  members: Member[];
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [handle, setHandle] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.ok) {
      notify(success, "success");
      router.refresh();
    } else {
      notify(res.error ?? "Something went wrong.", "error");
    }
  }

  return (
    <div className="border border-hairline bg-white p-4">
      <p className="label-mono">[ manage team ]</p>
      <ul className="mt-3 flex flex-col gap-2">
        {members.map((m) => (
          <li key={m.profileId} className="flex items-center justify-between gap-2 text-xs">
            <span>
              <span className="mono">@{m.handle}</span> · {m.role}
              {m.isOwner && <span className="mono ml-1 text-pine">[owner]</span>}
            </span>
            <span className="flex gap-1">
              {!m.isOwner && (
                <>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      run(() => transferOwnershipAction(projectId, m.profileId), "Ownership transferred.")
                    }
                  >
                    Make owner
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => run(() => removeMemberAction(projectId, m.profileId), "Member removed.")}
                  >
                    Remove
                  </Button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>

      <form
        className="mt-4 flex flex-wrap items-end gap-2 border-t border-hairline pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          run(() => inviteMemberAction(projectId, { handle: handle.trim().toLowerCase(), role: role.trim() }), "Member added.").then(
            () => {
              setHandle("");
              setRole("");
            }
          );
        }}
      >
        <Input label="Invite by handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="handle" />
        <Input label="Role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Engineer" />
        <Button type="submit" disabled={busy || !handle.trim() || !role.trim()}>
          Add
        </Button>
      </form>
      {error && <p className="mt-2 text-2xs text-brick">{error}</p>}
    </div>
  );
}
