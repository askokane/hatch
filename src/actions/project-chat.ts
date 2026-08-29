"use server";

import { revalidatePath } from "next/cache";
import { requireSession, requireProfile } from "@/lib/session";
import {
  getChatForProject,
  requireChatMember,
  sendProjectChatMessageCore,
  setChatTypingCore,
  markChatReadCore,
  type ProjectChatMessageDTO,
} from "@/lib/project-chat-core";
import { ok, type ActionResult } from "@/lib/action-result";

// Thin session-bound wrappers, exactly as actions/messages.ts is. Every export
// here is a callable endpoint, so none of them accepts a profile ID — it is
// always derived from the session, and the chat id is always re-checked against
// the project's team. The logic lives in lib/project-chat-core.ts.

export type { ProjectChatMessageDTO, ProjectChatPresence } from "@/lib/project-chat-core";

export async function sendProjectChatMessageAction(
  chatId: string,
  body: string
): Promise<ActionResult<ProjectChatMessageDTO>> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  const ctx = await requireChatMember(chatId, profileId);
  const res = await sendProjectChatMessageCore(ctx, profileId, body);
  if (res.ok) revalidatePath(`/p/${ctx.projectSlug}/chat`);
  return res;
}

// Mark the chat read up to now (own membership row only). This is what clears the
// unread badge on the project and in the nav.
export async function markProjectChatReadAction(chatId: string): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  const ctx = await requireChatMember(chatId, profileId);
  await markChatReadCore(ctx, profileId);
  return ok(undefined);
}

export async function setProjectChatTypingAction(
  chatId: string,
  typing: boolean
): Promise<ActionResult> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  const ctx = await requireChatMember(chatId, profileId);
  await setChatTypingCore(ctx, profileId, typing);
  return ok(undefined);
}

// Resolves (and, on first open, creates) a project's chat. Used by the project
// page's "team chat" link so the id is known before the chat page is reached.
export async function openProjectChatAction(
  projectId: string
): Promise<ActionResult<{ chatId: string }>> {
  const session = await requireSession();
  const profileId = await requireProfile(session);
  const ctx = await getChatForProject(projectId, profileId);
  return ok({ chatId: ctx.chatId });
}
