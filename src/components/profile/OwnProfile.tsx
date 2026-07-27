"use client";

import { useState } from "react";
import { ProfileView, type ProfileViewData } from "./ProfileView";
import { ProfileEditForm, type ProfileEditInitial } from "./ProfileEditForm";
import { Button } from "@/components/ui/Button";

// Own profile: view by default, inline edit on toggle.
export function OwnProfile({
  data,
  editInitial,
}: {
  data: ProfileViewData;
  editInitial: ProfileEditInitial;
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
      actionSlot={
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Edit profile
        </Button>
      }
    />
  );
}
