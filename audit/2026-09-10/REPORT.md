# HATCH security, efficiency, and data-integrity audit

**Date:** September 10, 2026. **Revision:** `21682f6db60712a6657edef436b549eda9af9074`. **Scope:** application source, server actions and route handlers, database schema and migrations, build/test tooling, installed dependencies, and aggregate read-only checks of the database configured in this checkout. Application source was not modified.

**Assessment:** The application has useful access-control foundations and a passing functional suite, but it has material security and integrity defects. Prioritize the still-valid documented demo administrator credential, dependency patches, account recovery/session revocation, media authorization, account deletion, and stable introduction references. Then fix concurrency and message-delivery correctness before increasing traffic. Passing the present suite is not evidence that those cases are safe.

This report contains **32 primary findings and 9 additional hardening or product-contract observations**. Some findings are related; severity counts should not be treated as independent probabilities of compromise. “High” identifies a serious application or operational impact; “Medium” identifies a bounded security/correctness problem or an important scaling risk; “Low” identifies hardening or smaller functional impact. Upstream package severity is distinguished from demonstrated exploitability in HATCH.

**Evidence levels:** “Observed” means a read-only database/build observation. “Reproduced” means the real application function or hook was exercised with synthetic data and mocked I/O; concurrency probes demonstrate an allowed interleaving, not a load test against production PostgreSQL. “Source-confirmed” means the code establishes the behavior but it was not exercised end to end. “Conditional” means deployment or product assumptions affect impact.

**Verification completed**

| Check | Result |
|---|---|
| TypeScript, no emit, incremental disabled | Passed |
| Prisma schema validation | Passed; Prisma package configuration deprecation warning |
| Production Next.js build, without migration wrapper | Passed; lint deliberately skipped by project configuration |
| Existing full Playwright suite | **41/41 passed**, 3.5 minutes |
| Browser-test isolation | Fresh randomly named audit schema; all migrations and seed ran there; schema removed afterward |
| Existing image-metadata unit scenario | Passed separately without database/browser setup; also passed in full suite |
| Synthetic audit probes | **15/15 confirmed the recorded behaviors**; these are defect demonstrations, not passing regression tests for fixes |
| npm dependency audit | **7 vulnerable package entries: 1 critical, 6 high**; includes propagated dependency findings, not seven independent exploitable endpoints |
| Existing database security audit | Passed anonymous/schema/table-access checks |
| Aggregate integrity audit | Found dangling intent references and account-deletion blockers; details below |

**What the configured database currently shows**

| Observation | Result |
|---|---|
| Application scale | 31 users, 10 projects, 38 direct messages, 2 team messages, 18 posts |
| Documented demo credentials | Both documented account passwords match stored hashes; one matching account is an administrator |
| Requests referencing missing intents | **2** |
| Distinct project creators affected by deletion restriction | **10** |
| Ownerless projects / multiple-owner projects | 0 / 0 at the snapshot |
| Duplicate pending pairs / users above five pending outbound | 0 / 0 at the snapshot |
| Invalid thread member counts / accepted requests missing a thread / threads without accepted requests | 0 / 0 / 0 |
| Duplicate connected pairs | 0 |
| Open roles on closed projects | 0 |
| Pending uploads / orphan avatars / media-owner mismatch / avatar-owner mismatch / byte-size mismatch / empty posts | All 0 |
| Expired sessions / login-attempt rows older than 30 days / expired-or-used reset tokens | 5 / 6 / 2 |
| Migrations | 12 finished, 0 unfinished |
| RLS and public REST roles | All application tables have RLS; no policies; `anon` and `authenticated` lack public schema usage and table grants |
| Runtime database identity | `postgres`, table owner, `rolbypassrls=true`; not a superuser |
| TLS observations | Both configured URLs request TLS. Database-side `pg_stat_ssl` reports false; with a pooler this may describe its backend connection rather than the client connection. This does **not** prove an unencrypted Internet connection. |

No live user messages, media, reset tokens, password hashes, or connection credentials are included in this report. Live checks were read-only. The full browser suite wrote only to the audit-owned disposable schema. Small current row counts do not establish capacity at larger scale.

**Highest-priority actions**

1. Disable or rotate the documented demo credentials and invalidate their sessions if this database serves real users. Audit their historical use. No credential or account was changed as part of this analysis.
2. Patch Next.js and review the remaining vulnerable transitive dependencies; rebuild and redeploy. Check whether deployed versions match this checkout.
3. Make password reset, password update, token invalidation, and session revocation one coherent transaction/lifecycle.
4. Fix media ownership/visibility checks and remove private block state from browser props.
5. Fix creator-account deletion and stop recreating unchanged intent identities. Repair the two existing dangling references using history or an explicit unavailable-context state, never an arbitrary guess.
6. Enforce concurrency invariants in the database and correct message synchronization before scaling.

---

**Security findings**

**S01 — Documented demo credentials are still valid, including an administrator. High; observed, deployment-dependent.**

The read-only audit compared the two publicly documented demo passwords with their stored hashes without logging in. Both matched, and one account has `isAdmin=true`. Anyone who knows the README can authenticate as those accounts if the corresponding application is reachable. The present admin screen exposes moderation reports; this does not imply that the admin flag provides a database administration API or unrestricted access to every user's messages. The demo accounts' own messages and any future moderation reports remain exposed.

The seed intentionally creates predictable credentials, so the issue is deployment of that dataset alongside real users, not the existence of a development seed. Separate demo and production data. Disable/reset demo credentials, revoke their sessions, and add a deployment check that rejects known demo accounts in production. Restrict the seed to explicitly designated test/demo databases.

Evidence: [seed account creation](C:/Users/athar/Documents/hatch/prisma/seed.ts:1223), [admin authorization](C:/Users/athar/Documents/hatch/src/app/admin/reports/page.tsx:11), [aggregate credential check](C:/Users/athar/Documents/hatch/audit/2026-09-10/db-results.json).

**S02 — Installed dependencies contain current security advisories. Critical upstream severity; observed versions, conditional application reachability.**

The installed Next.js version is **15.5.22**, below the **15.5.24** patch release for the August 25 security advisories. The two critical advisories concern AVIF processing in the image optimizer and certain Windows-hosted applications using both routers. HATCH is App Router-only in its application source, the documented hosted deployment is Vercel, uploads do not explicitly allow AVIF, and the UI uses ordinary image elements. I did not establish a remotely reachable RCE chain. Those observations narrow exposure; they do not make a vulnerable dependency version an acceptable long-term state. Default framework endpoints and transitive native image handling require attention even when an application does not import the image component. [Next.js security release](https://nextjs.org/blog/august-2026-security-release), [Windows advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36), [AVIF advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4).

The npm audit reported:

| Package entry | Installed/relevant path | Reported severity | HATCH exposure assessment |
|---|---|---|---|
| next | 15.5.22 | Critical | Framework runtime; exact critical exploit prerequisites not demonstrated |
| sharp | 0.34.5 | High | Native image dependency; includes libvips/libheif findings |
| postcss | Next.js nested copy | High | CSS/source-map processing; no user-supplied CSS processing found in HATCH |
| nanoid | Transitive copy | High | Custom-generator zero-size loop; no relevant application call found |
| deepmerge-ts | Through Prisma config | High | Recursive-object merge issue in tooling dependency; no public application input path found |
| @prisma/config | Through Prisma CLI | High, propagated | Same dependency chain, not a separate public endpoint |
| prisma | 6.19.3 CLI | High, propagated | Build/migration tooling; do not infer the generated database client has the same exposure |

Upgrade to at least the maintained patched Next.js release, update the lockfile and rebuild, then re-audit both production and development dependency trees. Evaluate compatible Prisma/config dependency updates and native image updates explicitly. Avoid an unreviewed `audit fix --force` across major versions. React is installed at 19.2.8; do not mislabel it as the vulnerable original 19.0.0 simply because package.json allows `^19.0.0`.

Evidence: [dependency declarations](C:/Users/athar/Documents/hatch/package.json:27), [lockfile](C:/Users/athar/Documents/hatch/package-lock.json). Advisory names and npm classifications are a September 10 snapshot.

**S03 — Password changes do not revoke existing sessions or outstanding reset links. High; reproduced/source-confirmed.**

`changePasswordAction` verifies the current password and updates the hash, but never deletes any sessions. A stolen cookie continues working after the owner changes their password. The imported all-session revocation helper is used only in the reset path. Neither a change nor a successful reset invalidates every outstanding reset token for the user, so another unexpired link can remain usable after the password has changed.

There is also an authentication race to consider: a login may verify an old hash, then create a session after a concurrent password reset has deleted existing sessions. A transaction around reset alone does not address that login interleaving. Add a credential/session version or coordinate login issuance against the current credential version. On password change, atomically update the password, invalidate reset credentials, revoke sessions, and optionally issue a fresh session to the reauthenticated current user. [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).

Evidence: [password change](C:/Users/athar/Documents/hatch/src/actions/auth.ts:165), [login issuance](C:/Users/athar/Documents/hatch/src/actions/auth.ts:100), [session creation](C:/Users/athar/Documents/hatch/src/lib/session.ts:39). Probe confirmed zero revocation calls after a successful change.

**S04 — Reset-token consumption is not atomic, and token use is separated from password update. High; reproduced.**

The code reads a token, checks `usedAt`/expiry, and then updates it by ID without a `usedAt IS NULL` predicate. Two concurrent submissions both pass the read and both consume the token. Both can subsequently write different passwords. A database or hashing failure after consumption also burns the link before completing recovery.

Hash the proposed password before the critical transaction. Claim an unexpired unused token with a conditional update, check the affected count, update the user, invalidate all outstanding reset tokens, and revoke/version sessions in one transaction. Account for the login race described in S03. A replay after success must fail, and injected failure midway must roll everything back. [OWASP reset-token guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

Evidence: [token consumption](C:/Users/athar/Documents/hatch/src/lib/email-verify.ts:33), [reset action](C:/Users/athar/Documents/hatch/src/actions/auth.ts:142). Probe allowed two successful consumptions of one synthetic token.

**S05 — Production password recovery is log-only and logs the bearer credential. Medium; source-confirmed.**

`sendPasswordResetEmail` does not send mail; it prints a usable reset URL and email address to server logs with no development-only guard. The interface nevertheless says a link was sent. Real users cannot recover their accounts through their inbox, while anyone with access to those logs can use an unexpired reset link. This is explicitly documented as a development implementation, but the function runs in production too.

Connect an actual delivery channel, or clearly disable recovery until one exists. Never log full reset tokens in production. Limit log access and retention; revoke outstanding logged links when deploying the fix. Generic responses should remain consistent without falsely asserting successful delivery.

Evidence: [reset logging](C:/Users/athar/Documents/hatch/src/lib/email-verify.ts:44), [recovery UI](<C:/Users/athar/Documents/hatch/src/app/(auth)/forgot-password/ForgotForm.tsx:13>).

**S06 — Media retrieval has authentication but no object-level authorization. High; reproduced, known-ID prerequisite.**

After checking for a session/profile, `GET /api/media/[id]` reads bytes solely by ID. It does not select the owner, associated post, avatar status, or block relationships. A logged-in person who obtains a media ID can retrieve another user's unposted upload or a blocked user's media. This is not an anonymous download vulnerability, and I did not demonstrate guessing CUIDs. The missing authorization is still real; possession of an ID should not grant access to a draft.

Authorize from metadata first. Pending non-avatar uploads should be owner-only. Published assets and avatars should follow an explicit visibility/block policy. Fetch bytes only after that check. The current one-year immutable private cache also lets the same browser reuse downloaded content without another authorization check after logout/account switching. Choose a revalidation policy for protected assets. No cache policy can retroactively erase content someone already downloaded; this recommendation concerns future server access and browser reuse.

Evidence: [media lookup and caching](C:/Users/athar/Documents/hatch/src/app/api/media/[id]/route.ts:60). Probe returned another owner's synthetic draft with HTTP 200 and the immutable cache header.

**S07 — The browser receives the private block-direction flag. Medium; source-confirmed.**

The `Relationship` object contains `theyBlockedViewer`, and the public profile passes the entire object to the `"use client"` `ProfileActions` component. React's server-to-client payload must serialize that prop, even though the UI avoids displaying it. Project role cards similarly receive the full relationship. A blocked viewer can inspect the payload to learn the exact block state.

Keep internal relationship state server-only. Send a deliberately restricted client DTO containing only permitted UI state. Test serialized HTML/RSC responses, not merely text visible on the page. The existing block-asymmetry browser scenario passing is therefore not sufficient coverage.

Evidence: [private field](C:/Users/athar/Documents/hatch/src/lib/relationship.ts:31), [client boundary](C:/Users/athar/Documents/hatch/src/app/u/[handle]/page.tsx:73), [client component](C:/Users/athar/Documents/hatch/src/components/profile/ProfileActions.tsx:1), [project card props](C:/Users/athar/Documents/hatch/src/app/p/[slug]/page.tsx:185).

**S08 — An exported membership helper is an unauthenticated Server Action. Medium; reproduced and build-confirmed.**

`guardMembershipOrRedirect(projectId, profileId)` lives in a `"use server"` file and accepts both IDs from its caller. It never establishes the caller's identity. The completed production build's server-reference manifest includes this exported function, so it is not merely unreachable dead source. It answers whether an arbitrary profile belongs to an arbitrary project and provides an unauthenticated database-query surface. This is an information/abuse issue, not a demonstrated ability to write as another user; project rosters are otherwise visible to signed-in users.

Move the helper outside the Server Action module, or require a session and derive the profile ID from it. Audit emitted action exports as a build check. Do not rely on a helper being absent from the visible UI.

Evidence: [exported helper](C:/Users/athar/Documents/hatch/src/actions/projects.ts:274). The probe returned `true` with zero authentication calls. The manifest was checked without relying on the action ID as a security secret.

**S09 — Abuse controls are incomplete and the login limiter races. High for public deployment; source-confirmed.**

Only failed login attempts have a rate limit. Signup can repeatedly run cost-12 bcrypt and create users; reset requests can create tokens/log entries; posting, messaging, reporting, tag creation, project creation, and avatar replacement have no server-side frequency or total-storage budget. The five-pending-intro rule and the pending-upload quota are not request-rate limits. Completing posts releases the upload quota while preserving the bytes indefinitely.

The login limiter reads two counts before password work and records failure afterward. Concurrent requests can all pass the check. Successful attempts are excluded entirely. A malicious user can also repeatedly lock out a known email for the 15-minute window. IP attribution trusts the first `x-forwarded-for` item; whether spoofing is possible depends on the reverse proxy overwriting that header. For unknown emails no dummy bcrypt comparison runs, contrary to the code comment, producing a timing difference. Signup already intentionally reveals email existence, so this timing distinction is secondary rather than a standalone serious enumeration flaw.

Add atomic budgets for attempted auth operations, signup, recovery, writes, and uploaded bytes, with both account and trusted-source dimensions. Apply body limits before expensive work. Use verified platform IP handling, bounded retention, and a fixed dummy hash for failed unknown-account comparisons. Avoid a design where an attacker can indefinitely deny a victim all login attempts.

Evidence: [limiter](C:/Users/athar/Documents/hatch/src/lib/rate-limit.ts:12), [IP extraction](C:/Users/athar/Documents/hatch/src/lib/request-meta.ts:6), [login comparison](C:/Users/athar/Documents/hatch/src/actions/auth.ts:100), [upload quota](C:/Users/athar/Documents/hatch/src/app/api/media/route.ts:63).

**S10 — Upload content is not validated, and metadata stripping fails open. Medium; reproduced/source-confirmed.**

The upload routes trust the submitted MIME string. Invalid or differently encoded bytes can be accepted under a permitted image/video type. The metadata parser deliberately returns original bytes on parse failure; GIFs and video pass through. Its JPEG parser stops examining markers at the first scan, so it is not a complete guarantee against all metadata locations. No server-side dimension/pixel limit or actual avatar resizing is enforced; browser resizing is an optimization a custom client can bypass.

The present response MIME allowlist and `nosniff` are useful, and I did not establish an XSS or native-decoder exploit from this behavior. The confirmed impacts are malformed uploads, incomplete metadata/privacy guarantees, and uncontrolled decoded dimensions. Validate file signatures and structure, set dimensions/pixel budgets, and use a maintained decoder/re-encoder for formats where stripping is promised. If unsupported metadata cannot be removed safely, reject or clearly narrow the promise rather than silently returning the original. Include malformed, mislabeled, progressive-image, and oversized-dimension fixtures.

Evidence: [media acceptance](C:/Users/athar/Documents/hatch/src/app/api/media/route.ts:38), [avatar acceptance](C:/Users/athar/Documents/hatch/src/app/api/avatar/route.ts:41), [fallback](C:/Users/athar/Documents/hatch/src/lib/image-metadata.ts:161), [JPEG scan handling](C:/Users/athar/Documents/hatch/src/lib/image-metadata.ts:60). Probe confirmed invalid JPEG content passes through unchanged.

**S11 — Multi-owner role results can disclose an owner excluded by the visibility check. Medium; source-confirmed, no current multi-owner rows.**

Discovery/feed queries accept a project if **some** owner is discoverable and not blocked. The selected owner membership is then unrestricted, and the code uses its first element. With one allowed owner and one blocked/non-discoverable owner, the returned card can name the excluded person. The first membership is not consistently ordered, so relationship actions and ranking can also target a different owner between surfaces.

Filter the selected owner with the same viewer predicate used to qualify the project, and apply a deterministic ownership/contact rule. Alternatively, model a primary contact explicitly. Do not let an existential visibility check justify returning every related person.

Evidence: [discovery filter/owner selection](C:/Users/athar/Documents/hatch/src/lib/discover-queries.ts:94), [discovery first owner](C:/Users/athar/Documents/hatch/src/lib/discover-queries.ts:175), [feed selection](C:/Users/athar/Documents/hatch/src/lib/feed-queries.ts:188). Current database has zero multi-owner projects; the owner-management action can create them.

**S12 — Login return-path validation permits a backslash-based external URL. Medium; reproduced validation bypass.**

Checking only `startsWith('/') && !startsWith('//')` accepts a slash followed by a backslash and a host. The standard URL parser normalizes that into an external origin. A successful login can therefore hand an unsafe destination to Next's redirect machinery. The audit demonstrated acceptance and external URL resolution with a reserved synthetic host; it did not send a user to an external site or demonstrate credential-cookie exfiltration. A destination on another host does not receive HATCH's host cookie merely because of a redirect.

Parse against a fixed trusted application origin, reject any different origin, reject backslashes/control characters, and return only the normalized relative path/query. Use the same helper for login and `requireSession`.

Evidence: [login return path](C:/Users/athar/Documents/hatch/src/actions/auth.ts:110), [session return-path helper](C:/Users/athar/Documents/hatch/src/lib/session.ts:121).

---

**Data-integrity and correctness findings**

**D01 — Project creators cannot delete their accounts; the action logs them out before failing. High; observed constraint/source-confirmed behavior.**

The UI promises deletion of the account and owned projects. `deleteAccountAction` instead deletes the current session, then deletes the user. User deletion cascades to the profile, but `Project.createdById` references that profile with `ON DELETE RESTRICT`. Any creator with a remaining project hits a foreign-key failure after being logged out. **Ten distinct creators are currently affected.** Promoting another member does not change `createdById`, so “transfer ownership” does not resolve the restriction.

Specify what happens to shared projects: require transfer, anonymize the creator with a nullable reference, or delete projects only under an explicit policy. Handle it transactionally and clear the browser session only after success. Also protect sole owners who are not original creators: their deletion can cascade their membership and leave a project ownerless. Add tests for creator/non-creator, sole/co-owner, and transferred ownership.

Evidence: [delete action](C:/Users/athar/Documents/hatch/src/actions/auth.ts:204), [restricting relation](C:/Users/athar/Documents/hatch/prisma/schema.prisma:292), [UI promise](C:/Users/athar/Documents/hatch/src/app/settings/DeleteAccountForm.tsx:25).

**D02 — Every profile edit deletes and recreates intent identities, breaking existing introductions. High; observed and source-confirmed.**

The profile transaction deletes all `Intent` rows and inserts replacements even when intent kinds are unchanged. Introduction requests and threads keep their old `contextId` strings, without a foreign key or snapshot. Editing a biography can therefore invalidate the stable context of a pending or accepted introduction. **Two introduction requests already reference missing intents.** The audit did not attribute those specific historical rows to a particular edit, but this code path is a direct mechanism for creating them.

Upsert existing intents by `(profileId, kind)` so unchanged intent IDs survive. Archive/remove intents through an explicit lifecycle. For historical context, keep a validated snapshot or typed relation that tolerates deliberate deletion. Do not silently associate an old request with a newly created, semantically different intent. Backfill only when an unambiguous mapping is available.

Evidence: [intent replacement](C:/Users/athar/Documents/hatch/src/actions/profile.ts:94), [request context fields](C:/Users/athar/Documents/hatch/prisma/schema.prisma:390), [thread context fields](C:/Users/athar/Documents/hatch/prisma/schema.prisma:407).

**D03 — Intro uniqueness and the five-pending limit are not concurrency-safe; connected pairs can re-request. Medium; reproduced.**

Pair and count checks run independently before `create`. Two requests from a sender with four pending requests both succeed, leaving six. Simultaneous opposite-direction/same-pair requests can also both succeed. The schema has no normalized-pair pending uniqueness constraint. After acceptance, the action only checks for another **pending** request; it never checks for an existing connection. A direct action call can create another request and, if accepted, another two-person thread for the same pair.

Use an unordered-pair key with a partial unique index for pending requests, a stable unique connection record if the product permits only one connection per pair, and a serialized sender quota transaction with retry handling. PostgreSQL's observed default is Read Committed; merely wrapping count-then-insert in a default transaction is insufficient. Current data has no duplicate pairs or over-limit senders, which does not eliminate the reproducible race.

Evidence: [checks and insertion](C:/Users/athar/Documents/hatch/src/actions/intro-requests.ts:78), [request indexes](C:/Users/athar/Documents/hatch/prisma/schema.prisma:400). Probes produced six pending requests and permitted an additional request for a synthetic connected pair.

**D04 — Last-owner protection races, and owner permissions are checked before writes. High; reproduced/source-confirmed.**

Two co-owners can both observe an owner count of two and remove owner memberships, leaving none. Ownership checks also occur outside metadata/member mutation transactions; a user whose owner status is revoked between check and write may still complete a mutation. Similar check/write windows exist in membership-gated posting. A normal database foreign key checks that a profile/project exists, not that the writer is still its member or owner.

Serialize ownership changes on the project, check current authorization inside the protected transaction, and enforce at least one owner at commit (for example through a suitable deferred constraint trigger plus application coordination). Make account deletion respect the same invariant. Be explicit that `transferOwnershipAction` currently promotes a co-owner; it does not remove the caller or change the original creator.

Evidence: [last-owner check](C:/Users/athar/Documents/hatch/src/actions/projects.ts:228), [promotion](C:/Users/athar/Documents/hatch/src/actions/projects.ts:250). The concurrency probe reduced two synthetic owners to zero. No ownerless project was observed in the configured database.

**D05 — Concurrent avatar replacements/removal can leak orphan assets or undo a newer upload. Medium; source-confirmed.**

Each upload transaction reads the old avatar, creates a new asset, updates the profile, and deletes the old ID. Under Read Committed, concurrent transactions can both read the same old ID before either updates the profile. The later update wins, but the earlier new asset remains `isAvatar=true` and is exempt from ordinary cleanup. Removal reads the ID outside its transaction and can clear a pointer written by a concurrent upload while deleting only the older asset.

Lock the profile before reading/modifying avatar state, or use versioned compare-and-swap with cleanup on conflict. Make removal conditional on the pointer it actually intends to remove. Add concurrent upload/upload and upload/remove tests, plus an orphan sweep. Current database has no orphan avatar rows.

Evidence: [upload transaction](C:/Users/athar/Documents/hatch/src/app/api/avatar/route.ts:73), [removal](C:/Users/athar/Documents/hatch/src/actions/profile.ts:119).

**D06 — Creating one post deletes pending uploads belonging to other open composers. Medium; source-confirmed.**

After attaching selected media, `createPostAction` deletes **all** unposted non-avatar assets for that profile. A second tab/composer's upload is indistinguishable from abandoned data and is destroyed. Even a text-only post can clear uploads someone is still preparing elsewhere. Meanwhile, the quota response tells users to discard uploads, but no server-side discard operation exists; removing an item from the composer alone does not release database quota.

Associate assets with a draft/composer ID. Clean up only that draft on submission, or sweep genuinely expired pending assets using an age threshold. Add an owner-authorized discard endpoint and make quota reservation atomic. Test two simultaneous composers and abandoned uploads.

Evidence: [blanket sweep](C:/Users/athar/Documents/hatch/src/actions/posts.ts:127), [pending quota response](C:/Users/athar/Documents/hatch/src/app/api/media/route.ts:63).

**D07 — Appending one's own sent message advances the fetch cursor past unseen messages. Medium; reproduced.**

Both polling hooks set `cursorRef` to a newly sent own message immediately. Suppose the client last fetched T0, another person sends at T1, then the client sends at T2 before the next poll. Appending T2 makes the next request ask for messages after T2; T1 is never delivered to that open transcript. The database row remains present and can reappear on reload, so this is client-visible omission, not physical database loss. It also compounds false read receipts.

Separate the last fully fetched server cursor from locally acknowledged messages. Merge by ID, order deterministically, and advance the fetch cursor only after fetching the complete interval. Apply one shared transport-state implementation to both chat types while keeping their authorization rules separate.

Evidence: [direct-message append](C:/Users/athar/Documents/hatch/src/components/messages/useThreadPolling.ts:41), [group-chat append](C:/Users/athar/Documents/hatch/src/components/project/useProjectChatPolling.ts:47). Probe observed `after=T2` while T1 was unseen.

**D08 — Timestamp-only pagination loses equal-timestamp rows. Medium; reproduced.**

Message history uses `createdAt < before`, live tails use `createdAt > after`, and ordering has no unique tie-breaker. At a page boundary, other rows with the same millisecond are excluded forever by the next cursor. The feed attempts to include the whole boundary timestamp group, but only among already-fetched candidates. If one source has more than its 40-candidate cap at that timestamp, the remaining rows are still skipped.

Use compound cursors `(createdAt, id)` for each transcript and an ordering key that also distinguishes feed sources. Match the query predicate and ordering exactly, and signal whether a live tail has more pages. Tests should place more than a full page at the same timestamp. Probes exposed 50 of 51 equal-timestamp messages and 40 of 45 feed posts. Current live message data has no timestamp collisions; bulk import/concurrent activity can create them.

Evidence: [message history](C:/Users/athar/Documents/hatch/src/app/api/threads/[threadId]/messages/route.ts:52), [group history](C:/Users/athar/Documents/hatch/src/app/api/project-chats/[chatId]/messages/route.ts:63), [feed boundary logic](C:/Users/athar/Documents/hatch/src/lib/feed-queries.ts:279).

**D09 — Read watermarks mark unseen messages as seen; group receipts count hidden messages. Medium; source-confirmed.**

The read actions write the current server time, not the newest message actually displayed. A message committed after the latest fetch but before the read action is incorrectly marked read. Catch-up batches and D07 make the gap larger. In the group chat, receipts count every member whose watermark passes the newest own message, including a member for whom a block filter prevented delivery. A newcomer initialized with a current watermark can likewise be counted against older messages they never viewed. The initial watermark makes sense for unread-count suppression, but that is not the same fact as having seen the content.

Send the last visible message ID with read acknowledgment, validate its chat membership and ordering on the server, and advance watermarks monotonically to that message. Distinguish “no unread backlog before joining” from “actually read.” Exclude ineligible/blocked recipients when calculating receipt counts. Consider tab visibility and in-flight response handling before marking read.

Evidence: [thread read action](C:/Users/athar/Documents/hatch/src/actions/messages.ts:29), [group read](C:/Users/athar/Documents/hatch/src/lib/project-chat-core.ts:273), [group receipt count](C:/Users/athar/Documents/hatch/src/lib/project-chat-core.ts:328), [client acknowledgment](C:/Users/athar/Documents/hatch/src/components/messages/ThreadView.tsx:59).

**D10 — Sends can duplicate, and auxiliary-write failure can report a persisted message as failed. Medium; source-confirmed.**

The textarea Enter handler calls `send` even when a send is in progress; disabling the button does not disable this path, and `send` has no early busy/ref guard. The server accepts duplicate bodies with no idempotency key. After inserting a message, it clears typing in a separate write; if that write fails, the action throws even though the message is already durable. A retry then inserts another copy. Shares and group messages use the same pattern.

Use a stable client-generated send ID with a database unique constraint per sender/conversation. Prevent overlapping UI sends with a synchronous in-flight guard. Either make auxiliary state updates transactional with insertion or ensure their failure cannot turn a successful send into an ambiguous error. Test a committed insertion followed by typing-clear failure and a dropped network response.

Evidence: [send and Enter handler](C:/Users/athar/Documents/hatch/src/components/messages/ThreadView.tsx:101), [message then typing write](C:/Users/athar/Documents/hatch/src/lib/messages-core.ts:137), [group writes](C:/Users/athar/Documents/hatch/src/lib/project-chat-core.ts:243).

**D11 — Closed-project/open-context rules are enforced inconsistently. Medium; reproduced/source-confirmed.**

The UI hides update and role composers for closed projects, but `postUpdateAction` and `createOpenRoleAction` never check `closedAt`. Closing a project only stamps that field and leaves role statuses OPEN. The ranked discovery query lacks the `closedAt: null` condition used by the general feed. Intro validation checks ownership but not role status or whether the project is closed. A caller can therefore reference a closed role or continue updating a supposedly closed project.

Define the closed-state contract centrally. Enforce it in every mutation and query, atomically close open roles if that is the desired lifecycle, and reject closed/filled contexts on new requests. Re-check relevant state on acceptance if closure should invalidate pending requests. A synthetic CLOSED role on a closed project was accepted by the current action.

Evidence: [close/update/role actions](C:/Users/athar/Documents/hatch/src/actions/projects.ts:124), [discovery query](C:/Users/athar/Documents/hatch/src/lib/discover-queries.ts:94), [context validation](C:/Users/athar/Documents/hatch/src/actions/intro-requests.ts:14).

**D12 — Renaming resets the purported seven-day-from-creation handle window. Low; source-confirmed.**

The guard compares the current time to `handleChangedAt`, then updates that timestamp every time the handle changes. Renaming once within each seven-day period extends the window indefinitely, contradicting the error text that handles can only change within seven days of creation. This also increases the window for stale links and handle recycling.

Compare against `Profile.createdAt` for a creation-based limit, or explicitly adopt/document a cooldown policy. Add boundary tests using a controlled clock.

Evidence: [handle check](C:/Users/athar/Documents/hatch/src/actions/profile.ts:44), [timestamp reset](C:/Users/athar/Documents/hatch/src/actions/profile.ts:84).

**D13 — The standard seed and test guards can target production data. High; source-confirmed, operator/configuration-dependent.**

`npm run seed` deletes every application's table contents with no environment/target confirmation. `E2E_SCHEMA` is accepted without validation; choosing `public` routes the standard test setup's migrations and seed to application data. The server guard merely checks whether a URL string contains `schema=`, so `schema=public` passes. It also does not validate both datasource URLs as the same isolated target. The wrapper forcibly changes port 5432, which assumes the hosting layout and breaks custom Postgres ports.

This is not a remotely accessible end-user deletion endpoint. It is a severe operator footgun because the scripts are documented as safe isolation. The audit used a separate wrapper that generated a fresh namespace, verified nonexistence, rewrote and checked both URLs, and removed only the namespace it created.

Require a dedicated test database or an allowlisted generated test namespace, reject `public`/system schemas and empty values, validate both datasource targets, and put an explicit destructive-seed opt-in inside the seed itself. Avoid sharing a database with production for heavy tests. Preserve an explicitly configured host/port rather than guessing.

Evidence: [seed wipe](C:/Users/athar/Documents/hatch/prisma/seed.ts:1080), [schema override](C:/Users/athar/Documents/hatch/scripts/with-e2e-db.mjs:19), [weak server guard](C:/Users/athar/Documents/hatch/e2e/server-control.ts:18).

---

**Efficiency, reliability, and maintainability findings**

**E01 — Media range requests fetch and copy the entire database blob. Medium now; substantial scaling/cost risk.**

The media query selects all bytes before parsing the Range header. A request for a small video segment therefore transfers the entire asset from PostgreSQL, creates a Buffer copy, and creates another typed-array response representation. Even invalid ranges pay the database fetch. Every image/video/avatar request also performs session resolution. Browser caching reduces repeated downloads, but the current protected-cache tradeoff is described in S06.

Short term: fetch metadata first, authorize, validate ranges, and query only the required byte slice with a parameterized database operation. Avoid unnecessary copies and add byte/egress budgets. Longer term: move media to object storage with access-controlled delivery if the project's no-new-service constraint is relaxed. Database blobs are an intentional constraint choice, not inherently a bug, but they should not drive repeated full-row transfers for seeking.

Evidence: [full blob read](C:/Users/athar/Documents/hatch/src/app/api/media/[id]/route.ts:66), [range slicing](C:/Users/athar/Documents/hatch/src/app/api/media/[id]/route.ts:91).

**E02 — Several list screens and related queries are unbounded. Medium; source-confirmed.**

`/messages` loads every direct thread and team membership. `/requests` loads the entire sent and received histories even though only one tab renders. Project pages load every update, role, and member. The admin page loads every report. Public profile intro-context lists are unbounded. Relationship/mention helpers load all of the viewer's thread IDs before narrowing them. A fixed number of database calls is not a fixed amount of work or a bounded response size.

Add cursor pagination at the parent list and bound nested collections. Fetch only the active requests tab, using counts for badges. Query relationships directly for the requested counterpart set. For latest-per-chat previews, compare indexed lateral/top-one queries with the current `DISTINCT ON` plan at realistic volume; the current query can scan/sort substantial history even though it returns one row per chat. Cap rendered transcript/feed nodes or virtualize long sessions.

Evidence: [messages](C:/Users/athar/Documents/hatch/src/app/messages/page.tsx:99), [requests](C:/Users/athar/Documents/hatch/src/app/requests/page.tsx:21), [project detail](C:/Users/athar/Documents/hatch/src/app/p/[slug]/page.tsx:26), [reports](C:/Users/athar/Documents/hatch/src/app/admin/reports/page.tsx:13), [relationship thread scan](C:/Users/athar/Documents/hatch/src/lib/relationship.ts:75).

**E03 — Polling amplifies query and connection load; team presence scales with roster size. Medium; source-confirmed scaling risk.**

Each visible client polls nav counts every ten seconds; an open conversation polls every three seconds. Nav polling alone performs a session lookup plus three database aggregate operations. For 1,000 visible tabs, that is roughly 100 nav HTTP requests per second and at least 400 database operations per second before ORM relation expansion, chat polling, typing, or read-acknowledgment writes. This is a traffic-model estimate, not a load-test result. Prisma `include` may generate several SQL queries per operation depending on relation loading.

Team polling fetches the entire other-member roster and a newest-own-message query each time. Its current message index is `(chatId, createdAt, authorProfileId)`, while newest-own queries filter `(chatId, authorProfileId)` and order by time; an index with author before time is a better candidate for that access pattern. Check plans before adding a second write-maintained index. Session loading includes the whole user row, including a password hash the session DTO does not need.

Preserve the good existing hidden-tab suspension and non-overlapping loops. Batch server reads, select only required columns, throttle server-side presence writes, fetch compact aggregate presence, and establish concurrency budgets. Use SSE or another event mechanism if measurements justify it. Do not reduce password hashing cost to compensate for unrelated polling pressure.

Evidence: [poll cadence](C:/Users/athar/Documents/hatch/src/lib/constants.ts:55), [nav queries](C:/Users/athar/Documents/hatch/src/app/api/nav-counts/route.ts:41), [team presence](C:/Users/athar/Documents/hatch/src/lib/project-chat-core.ts:297), [session include](C:/Users/athar/Documents/hatch/src/lib/session.ts:64).

**E04 — Search is scan-heavy, and candidate truncation precedes relevance ordering. Medium; source-confirmed.**

People search ORs substring matches across name, handle, school, location, bio, and tag label. Ordinary B-tree indexes do not generally accelerate these leading-wildcard searches. It then selects only the most recently updated 240 matching profiles and ranks them in memory; an older exact name/handle match can be excluded before scoring. School/mention search similarly takes alphabetical subsets before prefix ranking. Tag autocomplete reads up to 2,000 aliased tags and scans JSON aliases on every request. Ranked roles retrieve up to two sets of 300 records with relations, overlapping in many cases.

Prioritize exact/prefix matches in the database, add appropriate trigram/full-text indexes after measuring plans, and normalize tag aliases into an indexed relation when needed. Consider caching the curated alias catalog with explicit invalidation. Treat these bounded search results as limited suggestions, or implement real pagination for discovery. Relevance should not silently depend on unrelated profile-edit recency. The current 31-user database is too small to benchmark the future problem credibly.

Evidence: [people matching/ranking](C:/Users/athar/Documents/hatch/src/lib/discover-queries.ts:261), [candidate bound](C:/Users/athar/Documents/hatch/src/lib/discover-queries.ts:330), [tag alias scan](C:/Users/athar/Documents/hatch/src/actions/tags.ts:55), [school ranking](C:/Users/athar/Documents/hatch/src/actions/schools.ts:22).

**E05 — Expired authentication rows and abandoned assets lack a durable retention policy. Low currently; observed/source-confirmed.**

There is no scheduled cleanup of expired sessions, old login attempts, used/expired reset tokens, or aged pending assets. Pending-upload cleanup happens only when that owner posts; orphan avatars are explicitly exempt. The current database already retains five expired sessions, six login attempts older than thirty days, and two expired/used reset tokens. These counts are small, but each class grows with use and some contain personal identifiers.

Define retention windows and batch cleanup by indexed timestamps. Separate operational security logs from forever-retained login attempts. Add an expiry index for reset tokens if cleanup volume warrants it, and an asset lifecycle/age index for sweeps. Avoid indiscriminate cleanup of fresh drafts as in D06.

Evidence: [session model](C:/Users/athar/Documents/hatch/prisma/schema.prisma:112), [reset model](C:/Users/athar/Documents/hatch/prisma/schema.prisma:124), [attempt model](C:/Users/athar/Documents/hatch/prisma/schema.prisma:138), [observed retention](C:/Users/athar/Documents/hatch/audit/2026-09-10/db-results.json).

**E06 — Quality gates do not cover the most important invariants. Medium; observed/source-confirmed.**

The build explicitly ignores lint; the repository has no committed lint configuration/ESLint dependency or CI workflow in the inspected tree. The Playwright suite is useful and passed, but its scenarios do not verify reset replay, password-change session revocation, creator deletion, concurrent owner/quota updates, equal-timestamp cursors, client-RSC disclosure, or overlapping send/fetch. Some test descriptions promise server enforcement while exercising UI affordances or sequential behavior, which explains how these defects survive.

Add a reproducible CI pipeline for dependency audit, types, lint, schema/migration checks, isolated browser tests, and focused invariant tests. Turn the audit's defect demonstrations into conventional regression assertions after fixing the code. Use PostgreSQL concurrency tests for database races, not only mocked probes. Pin a supported Node runtime in project/deployment configuration; this audit ran under Node 25.1.0, while no project `engines` requirement is present. Production build success does not assert deployed configuration or runtime parity.

Evidence: [lint skip](C:/Users/athar/Documents/hatch/next.config.ts:5), [scripts](C:/Users/athar/Documents/hatch/package.json:5), [browser configuration](C:/Users/athar/Documents/hatch/playwright.config.ts:8), [audit probes](C:/Users/athar/Documents/hatch/audit/2026-09-10/probes.cjs).

**E07 — Network failures can leave stale UI, stuck controls, and needless polling. Medium; source-confirmed.**

The polling hooks do not abort outstanding fetches on unmount, have no request deadline, swallow non-OK/error responses, and resume the same cadence after persistent failures. The non-overlap guard prevents accumulation but a request that never resolves can stall updates indefinitely. A removed group-chat member can retain already-rendered messages and keep polling 403 responses without an explicit revoked state. Several form handlers set busy and then await actions without `try/finally`; an action exception leaves controls stuck. Appended feed history can retain deleted or newly blocked items when the first-page signature does not change.

Add abort/deadline handling, bounded backoff, a visible connection state, and explicit handling of 401/403. Reset busy in `finally`; preserve the user's unsent draft on error. Use fetch-generation tokens when filters/routes change to ignore old responses. Refresh or remove locally cached content when a visibility/deletion policy changes. Previously downloaded content cannot be “unread,” but future fetches and active UI should reflect revocation consistently.

Evidence: [poll loop](C:/Users/athar/Documents/hatch/src/components/messages/useThreadPolling.ts:148), [group poll](C:/Users/athar/Documents/hatch/src/components/project/useProjectChatPolling.ts:142), [send busy state](C:/Users/athar/Documents/hatch/src/components/messages/ThreadView.tsx:101), [feed append/signature](C:/Users/athar/Documents/hatch/src/components/feed/FeedList.tsx:37).

---

**Additional hardening and product-contract observations**

These are useful follow-ups, not claims of independently demonstrated critical exploitation.

| ID | Observation, impact, and recommendation | Evidence |
|---|---|---|
| H01 | **Medium — bcrypt silently truncates after 72 bytes while password validation allows 200 characters.** Two synthetic passwords sharing the first 72 bytes compared equal. Unicode reaches the byte limit sooner. Enforce a UTF-8 byte-aware maximum for bcrypt or migrate deliberately to a password scheme that supports longer inputs; preserve compatibility for existing hashes. This does not make bcrypt's salt or cost invalid. | [password schema](C:/Users/athar/Documents/hatch/src/lib/validation/auth.schema.ts:5), [hashing](C:/Users/athar/Documents/hatch/src/lib/password.ts:5), [bcrypt maintainer documentation](https://github.com/dcodeIO/bcrypt.js/) |
| H02 | **Medium — share-card links use historical handles instead of immutable target identity.** If the original user changes handles and someone else takes the old handle, a card with the original name can open the new person's profile. The message already stores `shareTargetId`, but it is omitted from the DTO/link. Resolve a stable target ID through an authorized redirect or reserve handle history; deleted targets should show unavailable. | [snapshot/target storage](C:/Users/athar/Documents/hatch/src/lib/share-core.ts:158), [link derivation](C:/Users/athar/Documents/hatch/src/lib/share-display.ts:9) |
| H03 | **Medium — runtime validation is inconsistent.** Tag/learning/intent arrays lack maximum sizes and duplicate rejection; duplicate entries can pass minimum counts and then fail unique constraints. Many public action parameters rely on TypeScript types only; malformed query enums are cast `as never` and can throw Prisma errors. Profile/project links accept arbitrary URL schemes and have no URL-length bound. A synthetic `javascript:` URL passed validation, but React 19 blocks such hrefs, so this is not a demonstrated stored-XSS exploit. Use bounded shared schemas, distinct IDs/kinds, explicit enum validation and an http/https protocol allowlist. | [profile arrays/links](C:/Users/athar/Documents/hatch/src/lib/validation/profile.schema.ts:32), [filter enum casts](C:/Users/athar/Documents/hatch/src/lib/discover-queries.ts:324), [tag input](C:/Users/athar/Documents/hatch/src/actions/tags.ts:78) |
| H04 | **Medium, conditional — route handlers lack explicit Origin/Fetch-Metadata enforcement.** Server Actions have framework protections, and SameSite=Lax blocks ordinary cross-site POST cookies. That does not protect against every same-site, cross-origin sibling-host scenario. A simple multipart or text/plain request to custom POST routes can matter if an attacker controls a sibling origin under the same site. Validate trusted origins/content types, and establish frame/CSP/referrer policies. No cross-site exploit was run and deployed headers were not verified. | [media POST](C:/Users/athar/Documents/hatch/src/app/api/media/route.ts:21), [message POST](C:/Users/athar/Documents/hatch/src/app/api/threads/[threadId]/messages/route.ts:105), [cookie options](C:/Users/athar/Documents/hatch/src/lib/cookies.ts:15), [Next config](C:/Users/athar/Documents/hatch/next.config.ts:3) |
| H05 | **Medium — the runtime database role owns tables and bypasses RLS.** Live anonymous-access restrictions are good, but they do not constrain an application compromise using its own connection. Separate migration and runtime roles, grant only required DML, and keep schema creation/grants out of runtime credentials. Both URLs specify `sslmode=require`; make certificate verification explicit where supported. Prisma v6 documentation describes `sslaccept` settings, but the audit did not independently test certificate-chain validation or the provider's pooler backend TLS. Do not treat `pg_stat_ssl=false` alone as proof that the client used plaintext. | [database identity/options](C:/Users/athar/Documents/hatch/audit/2026-09-10/db-results.json), [Prisma connector documentation](https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql) |
| H06 | **Low/Medium — report and catalog provenance is weak.** Reports accept any subject ID without confirming existence or caller visibility, and lack deduplication/rate limits, making the moderation queue easy to pollute. Tag creation and its provenance insert are separate writes. `TagSuggestion.suggestedBy`/`resolvedTagId` are plain strings without relations, and school creation happens before the profile transaction. Failures can leave inaccurate provenance or unused catalog rows. Validate accessible report subjects, budget reports/catalog additions, and use transactions or deliberately best-effort logging with clear semantics. | [report insertion](C:/Users/athar/Documents/hatch/src/actions/safety.ts:70), [tag provenance](C:/Users/athar/Documents/hatch/src/actions/tags.ts:122), [school creation before profile save](C:/Users/athar/Documents/hatch/src/actions/profile.ts:70), [provenance model](C:/Users/athar/Documents/hatch/prisma/schema.prisma:245) |
| H07 | **Product decision — signup stamps `emailVerifiedAt` without mailbox proof.** Open registration and no verification are intentional. The column must not later be trusted as proof of email ownership, and `.edu` syntax alone cannot verify enrollment. Group “invites” directly create memberships without acceptance or connection/block checks, allowing unsolicited team-room placement; there is no general self-service leave action. Decide whether that fits the product's consent/context promise. Direct profile visibility and UNLISTED project access by URL are also intentional discovery settings, not automatically private resources. Public profile role-context queries nevertheless expose UNLISTED project names/role IDs, which should be reconciled with the promise of keeping them out of discovery surfaces. | [signup stamp](C:/Users/athar/Documents/hatch/src/actions/auth.ts:64), [immediate membership](C:/Users/athar/Documents/hatch/src/actions/projects.ts:197), [profile role-context query](C:/Users/athar/Documents/hatch/src/app/u/[handle]/page.tsx:38) |
| H08 | **Low — session sliding expiry has a cookie/DB mismatch.** A server-component render may extend database expiry but fail to set the cookie; the later mutable request sees the new long DB expiry and skips the renewal branch. The comment promising that the cookie will catch up is therefore not generally true. The user can be logged out at the original cookie expiry while the token remains valid server-side longer. Separate renewal intent from successful cookie refresh and test component→route renewal. Handle concurrent renewal versus logout without surfacing a raw missing-row error. | [renewal branch](C:/Users/athar/Documents/hatch/src/lib/session.ts:85) |
| H09 | **Medium operational — migrations, audit verdicts, and historical assurance need stronger boundaries.** Building before migration avoids changing the database for a failed compilation, but migrations still happen while the old release is live; a later deploy failure does not reverse schema changes. Use expand/contract migrations and tested backup/restore procedures. The DB audit's verdict ignores some effective privilege/TLS/default-owner cases even though it prints them, so its “OK” is narrower than a complete security verdict. The current checkout ignores secret files and backups, but this audit did not exhaustively scan all Git-history blobs, production logs, provider IAM, backup policies, or a deployed URL. | [deployment wrapper](C:/Users/athar/Documents/hatch/scripts/migrate-then-build.mjs:145), [audit verdict](C:/Users/athar/Documents/hatch/scripts/audit-db-security.ts:170), [ignored files](C:/Users/athar/Documents/hatch/.gitignore:6) |

**Further database invariants to encode after the concrete fixes**

The schema already has many useful unique/FK constraints, but several cross-row rules are only conventions: two members per direct thread, membership of message authors, all-or-none share attachment fields, media ownership matching its post/profile, nonempty post-or-media, nonnegative byte sizes/positions, and preservation of one project owner. Choose appropriate CHECK constraints, composite relations, unique indexes, deferred triggers, or serialized transactions. Not every invariant can be represented by a simple CHECK. Do not add a foreign key from historical messages to current team membership if removing a member should preserve their messages. Distinguish “allowed to write at creation time” from “must still be a member forever.” No existing mismatch was observed for the specific aggregate checks listed earlier.

**Existing protections worth preserving**

- Sessions use random 32-byte credentials, hashed token storage, HTTP-only cookies, production Secure cookies, and server-side expiry; logout deletes its session row.
- Most server actions derive the actor from the session; thread and project-chat endpoints check membership before returning transcripts.
- Normal application SQL uses Prisma or parameterized tagged SQL. The `queryRawUnsafe` calls found in operational scripts use fixed, developer-owned SQL; their names alone are not proof of SQL injection. No user-controlled raw SQL execution was found in application code.
- React escapes text. The SVG avatar generator derives geometry/colors from a hash rather than interpolating profile text into SVG markup. No demonstrated arbitrary HTML injection was found.
- Post media attachment uses a conditional ownership/unattached claim inside a transaction and rolls back if any claim fails. This is stronger than the quota implementation.
- Accept/decline uses conditional pending-state updates; successful acceptance creates thread members transactionally. Preserve that pattern when fixing request creation.
- Group-chat membership reuses project membership, avoiding a second stale roster. Blocks are filtered inside group transcript queries and unread queries rather than dropped after pagination.
- Existing migrations effectively close anonymous public-schema access in the configured database, with RLS as a second layer.
- Hidden-tab suspension, serialized poll loops, bounded transcript page sizes, selected media metadata in feeds, and batched context resolution are useful foundations.

**Remediation sequence and proof required**

| Order | Work package | Completion evidence |
|---|---|---|
| Immediate | Demo credential containment; patch runtime dependencies; confirm deployed versions | Known demo credential no longer works on real-user deployment; sessions revoked; reviewed clean/accepted dependency report; rebuilt/redeployed artifact |
| 1 | Auth/recovery lifecycle (S03–S05, H01, H08), abuse budgets (S09), redirect validation (S12) | Concurrent reset replay rejected; old sessions/tokens invalidated; recovery failure rolls back; old-password login race handled; redirect stays same-origin |
| 2 | Privacy boundaries (S06–S08, S10–S11, H04/H07) | Owner-only draft access; blocked-media policy tested; private block flag absent from RSC; helper absent from public exports; uploads validated; multi-owner exclusion consistent |
| 3 | Data identity/ownership (D01–D06, D11–D13, H02/H06) | Creator deletion matches policy; intent IDs stable; no dangling references; concurrent quotas/ownership/avatar updates preserve invariants; drafts isolated; test tools reject production targets |
| 4 | Message correctness (D07–D10) | Unseen messages survive local sends; all equal-timestamp records retrievable; read receipts acknowledge only displayed content; retry returns the same send ID |
| 5 | Efficiency/operability (E01–E07, H05/H09) | Bounded pages and response sizes; representative query plans; media range bytes bounded; traffic/load tests at an agreed concurrency; CI/security gates; restore drill |

Avoid collapsing all of this into a broad rewrite. The defects are concentrated at clear boundaries and can be corrected in reviewed work packages with regression tests.

**Limits of this audit**

This is a source and local-build audit with read-only checks of the configured database, not a production penetration test or proof of absence of vulnerabilities. No RCE payloads, brute-force campaigns, destructive operations on application data, or high-volume traffic were used. Deployed routing/headers, public reachability of the configured database's application, provider-level credentials/IAM, secret history, backup recoverability, malware scanning, and load capacity remain unverified. Findings dependent on those conditions are labeled accordingly. The 41 passing browser tests validate their current scenarios, not the untested security and concurrency cases described above.

**Evidence files**

- [Aggregate database results](C:/Users/athar/Documents/hatch/audit/2026-09-10/db-results.json)
- [Synthetic probe results](C:/Users/athar/Documents/hatch/audit/2026-09-10/probe-results.json)
- [Full-suite status](C:/Users/athar/Documents/hatch/audit/2026-09-10/e2e-status.json)
- [Verification summary](C:/Users/athar/Documents/hatch/audit/2026-09-10/verification.json)
- [Read-only database audit code](C:/Users/athar/Documents/hatch/audit/2026-09-10/db-readonly.cjs)
- [Reproducible synthetic probes](C:/Users/athar/Documents/hatch/audit/2026-09-10/probes.cjs)
- [Isolated full-suite runner](C:/Users/athar/Documents/hatch/audit/2026-09-10/run-e2e.cjs)

The audit scripts/results are new artifacts under the audit directory. No remediation was applied to application code or live accounts.
