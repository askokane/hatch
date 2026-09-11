import test from "node:test";
import assert from "node:assert/strict";
import { safeLocalPath } from "../src/lib/safe-path";
import { passwordSchema } from "../src/lib/validation/auth.schema";
import { updateProfileSchema } from "../src/lib/validation/profile.schema";
import { validateFileBytes } from "../src/lib/file-signature";
import { parseFeedCursor } from "../src/lib/feed-queries";
import { toClientRelationship } from "../src/lib/relationship";

test("return paths stay on this origin", () => {
  assert.equal(safeLocalPath("/messages?tab=1"), "/messages?tab=1");
  for (const unsafe of ["//evil.test", "/\\evil.test", "https://evil.test", "/ok\r\nLocation: x"]) assert.equal(safeLocalPath(unsafe), "/discover");
});

test("new passwords reject bcrypt-truncated UTF-8 input", () => {
  assert.equal(passwordSchema.safeParse("a".repeat(72)).success, true);
  assert.equal(passwordSchema.safeParse("a".repeat(73)).success, false);
  assert.equal(passwordSchema.safeParse("🙂".repeat(19)).success, false);
});

test("profile inputs reject unsafe links and duplicate identities", () => {
  const base = { name: "A", handle: "alice", school: "School", gradYear: 2030, basedIn: "", bio: "", links: [], skillTagIds: ["1", "2", "3"], learningTagIds: ["4"], intents: [{ kind: "MENTOR", note: "" }], isDiscoverable: true };
  assert.equal(updateProfileSchema.safeParse({ ...base, links: [{ label: "x", url: "javascript:alert(1)" }] }).success, false);
  assert.equal(updateProfileSchema.safeParse({ ...base, skillTagIds: ["1", "1", "1"] }).success, false);
  assert.equal(updateProfileSchema.safeParse({ ...base, intents: [...base.intents, ...base.intents] }).success, false);
});

test("media signatures must match their declared type", () => {
  assert.equal(validateFileBytes(Buffer.from("not an image"), "image/png"), false);
  const png = Buffer.alloc(24); Buffer.from("89504e470d0a1a0a", "hex").copy(png); png.writeUInt32BE(10, 16); png.writeUInt32BE(10, 20);
  assert.equal(validateFileBytes(png, "image/png"), true);
});

test("compound feed cursors reject timestamp-only and malformed cursors", () => {
  assert.equal(parseFeedCursor("2026-01-01T00:00:00.000Z"), null);
  assert.deepEqual(parseFeedCursor("2026-01-01T00:00:00.000Z~POST~abc"), { date: new Date("2026-01-01T00:00:00.000Z"), kind: "POST", id: "abc" });
});

test("client relationships omit the private block direction", () => {
  const dto = toClientRelationship({ targetProfileId: "b", self: false, connection: "NONE", threadId: null, viewerBlockedThem: false, theyBlockedViewer: true, canRequestIntro: false });
  assert.equal("theyBlockedViewer" in dto, false);
});
