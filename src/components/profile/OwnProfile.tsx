"use client";

import { useState } from "react";
import { ProfileView, type ProfileViewData } from "./ProfileView";
import { ProfileEditForm, type ProfileEditInitial } from "./ProfileEditForm";
import { Button } from "@/components/ui/Button";
import { ShareButton } from "@/components/share/ShareButton";

// Own profile: view by default, inline edit on toggle.
//
// `postsSlot` arrives already rendered on the server (composer + feed list) and
// is only passed through. Editing replaces the whole view, so the timeline is
// deliberately absent from that branch — the edit form is a focused task, not a
// page to browse your own posts from.
export function OwnProfile({
  data,
  profileId,
  editInitial,
  postsSlot,
}: {
  data: ProfileViewData;
  /** Own profile id — the share sheet addresses a profile by id, not by handle. */
  profileId: string;
  editInitial: ProfileEditInitial;
  postsSlot?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div>
        <p className="label-mono">[ editing profile ]</p>
        <div className="mt-4">
          <ProfileEditForm initial={editInitial} onDone={() => setEditing(false)} />
        </div>
      </div>
    );
  }

  return (
    <ProfileView
      data={data}
      isOwn
      postsSlot={postsSlot}
      actionSlot={
        <div className="flex gap-2">
          {/* Sharing your own profile is the case the feature was named after —
              handing someone your account rather than a URL. */}
          <ShareButton kind="PROFILE" targetId={profileId} targetLabel="your profile" />
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit profile
          </Button>
        </div>
      }
    />
  );
}
