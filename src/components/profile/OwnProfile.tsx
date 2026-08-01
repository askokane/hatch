"use client";

import { useState } from "react";
import { ProfileView, type ProfileViewData } from "./ProfileView";
import { ProfileEditForm, type ProfileEditInitial } from "./ProfileEditForm";
import { Button } from "@/components/ui/Button";

// Own profile: view by default, inline edit on toggle.
//
// `postsSlot` arrives already rendered on the server (composer + feed list) and
// is only passed through. Editing replaces the whole view, so the timeline is
// deliberately absent from that branch — the edit form is a focused task, not a
// page to browse your own posts from.
export function OwnProfile({
  data,
  editInitial,
  postsSlot,
}: {
  data: ProfileViewData;
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
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Edit profile
        </Button>
      }
    />
  );
}
