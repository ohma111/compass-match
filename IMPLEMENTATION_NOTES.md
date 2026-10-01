# Implementation notes

## What was built
- **Auth**: Discord and X (OAuth 2.0, Supabase provider `x`) login via Supabase Auth, using a PKCE callback at `/auth/callback`. First login redirects to profile creation. Consent to the terms and privacy policy is required at profile creation and enforced in both zod and the DB RPC. The agreed terms version and timestamp are stored.
- **Profiles**: every field in spec §4.2. Contacts live in a separate table, `profile_contacts`, which only its owner can read under RLS. Other users can see contacts only through the `get_member_contacts()` security definer RPC. URLs are rejected in the bio, name, and characters fields.
- **Recruitments**: create, list, and detail pages. Filters: today, tomorrow, and purpose. Seat display reads "現在2/3人". Participants request to join and the owner approves, rejects, or removes them. Participants can cancel, and the owner can cancel the recruitment. Status is open / full / ended / cancelled. A recruitment is shown as ended once its end time passes, even before the cron job updates it.
- **Room code**: stored in `recruitment_secrets`, which has no RLS policy or grant. It can be read only through `get_room_code()`, which checks that the caller is the owner or an approved participant.
- **Chat**: one thread per recruitment, text only. Enforced in the DB: 1–300 characters, URLs blocked (NFKC-normalised, so full-width URLs are caught too), a rate limit of 1 message per 2 seconds and 5 per 30 seconds, and sending closes after the recruitment ends. New messages arrive live through Supabase Realtime, and RLS limits delivery to members. There are no DMs. Messages are hidden from reads once the recruitment has been over for 6 hours and are deleted by the pg_cron maintenance job.
- **Block, report, auto-hide, and BAN**:
  - Block works both ways: the other user's recruitments disappear from your view and neither side can join the other's recruitments. Blocking also removes pending or approved participations between the two users.
  - Reports on users, recruitments, and messages require a reason. A unique key on (reporter, target) means repeat reports from one person count once. The target is auto-hidden once 3 distinct, unresolved reporters have reported it, and reports from the target's owner are excluded. The threshold is stored in `app_settings`.
  - Per-reporter counts are shown to the admin and nothing acts on them automatically.
- **Admin page** (`/admin`, protected by `user_roles` plus RLS and `require_admin()` in the DB):
  - reports grouped by target, with reasons and reporter counts
  - suspend, BAN, and restore a user
  - delete a recruitment or message, or un-hide one
  - the feedback list
  - a metrics tab that counts signups, fill rate, average time to fill, and joins per `?src=` source
- **Feedback form**: linked from the footer on every page and works without login. Anonymous feedback has a global rate limit.
- **In-app notifications**: join request, approved, rejected, removed, cancellations, and new message (at most one unread notice per room).
- **"Available now"** (`/now`): off by default behind `NEXT_PUBLIC_FEATURE_AVAILABLE_NOW`. It expires after 3 hours and shows names only until the `NOW_LIST_MIN_USERS` threshold (30) is reached.
- **`?src=` tracking**: `proxy.ts` saves the first `src` in an httpOnly cookie for 30 days. The value is sanitised and stored on the profile (signup), the recruitment, and the participation.
- **Other**:
  - PWA manifest plus a minimal service worker (offline notice only, no data caching)
  - security headers
  - an open-redirect guard
  - DB error messages mapped to Japanese without leaking internal details
- **Tests**:
  - 67 Vitest tests covering validation, URL blocking, auto-hide, JST, capacity, env handling, and the flag
  - `npm run db:verify`, which applies all migrations to a throwaway local PostgreSQL 16 and runs an SQL test suite for RLS and RPC behaviour: contact and room-code secrecy, capacity, blocking, 3-reporter auto-hide, admin-only functions, chat expiry, and anonymous feedback

## Deliberately left out
- Playwright end-to-end tests. They need a live Supabase and OAuth, and the DB-level SQL tests cover the security-critical flows instead.
- Web Push, Discord DM, and Discord bot posting (spec §7, §10).
  - The recruitments table can still support a bot later: poll `recruitments`, or add a trigger or webhook.
- Anything under the spec's "later" list: calendar, favourites, friends, gender filters, billing, and DMs. No `plan` column exists; add a separate table when needed.
- Account self-deletion UI. The privacy policy tells users to ask through feedback, and the operator deletes the auth user from the Supabase dashboard (cascades).
- Generated Supabase TypeScript types. Queries are typed by hand in `src/lib/types.ts`.

## Deviations and interpretation choices (safer or simpler option chosen)
1. **Contacts are narrower than in the spec.** The spec says approved participants can see contacts. I implemented owner ↔ approved participant disclosure only: the owner sees each approved participant's contacts and a participant sees only the owner's. Participants do not see each other's contacts. This is safer for minors, and coordination between participants can happen in the chat room.
2. **Schema split.** `contact_*` moved from `profiles` to `profile_contacts`, and `room_code` moved from `recruitments` to `recruitment_secrets`. Postgres RLS works per row, not per column, so separate tables were the robust way to enforce secrecy.
3. **Column renames.** `profiles.roles[]` is `play_roles[]`, to avoid confusion with admin `user_roles`. `vc` holds yes, listen, or no in profiles and on, any, or off in recruitments.
4. **Extra columns and tables** not in spec §6:
   - `profiles.hidden_at` and `suspended_at` (needed for auto-hide and suspend)
   - `recruitments.approved_count`, `src`, `filled_at`, `cancelled_at` (capacity locking and metrics)
   - `participations.src`
   - `reports.resolved_at`
   - `notifications` (spec §5.6)
   - `app_settings`
5. **Capacity includes the owner.** Capacity 3 means the owner plus 2 approved participants, which matches the spec's "現在2/3人". It must be 2–6, and a recruitment can run at most 6 hours.
6. **Other limits I chose:**
   - display name ≤20, title ≤40, and note ≤200 characters
   - start time from 30 minutes in the past up to 7 days ahead
   - at most 3 active recruitments per user
   - rejected users cannot re-apply to the same recruitment; users who cancelled can
7. **Unauthenticated access.** Visitors who are not logged in can browse recruitment lists and details, so links shared outside the guild work. Anonymous visitors can read only three columns of `profiles` (id, display_name, rank_band), which the list needs to show the owner's name. Joining, full profiles, and everything else require login. Auto-hidden recruitments and ones owned by restricted users are hidden from everyone except the owner, members, and the admin.
8. **What "suspend" does.** It blocks creating, joining, and chatting, and hides the profile. BAN also cancels the user's active recruitments. Restore clears all flags and resolves the user's reports.
9. **URL blocking is heuristic.** It catches schemes, `data:image`, and `name.tld` for common TLDs, after NFKC normalisation. Obfuscations such as "example dot com" are not caught. The same regex runs in TypeScript and in SQL.
10. **Rate limits are enforced only in the DB** (count queries inside the RPCs). This is sufficient at the expected scale and needs no Redis or KV (no extra cost). `RATE_LIMITS` in TypeScript is documentation only.
11. **Next.js 16 conventions.** The spec does not name a version; npm latest was 16.3.7. `middleware.ts` is called `proxy.ts` in Next 16, and all routes render dynamically because every page depends on the session.
12. **Terms and privacy pages** are templates with visible "雛形" warnings. The operator must review them before launch (spec §8).

---

# v2 redesign (REDESIGN.md)

## What changed
- **Navigation**: bottom tab bar on every page (ホーム / ＋募集する / 通知 with unread badge / マイページ). The top header is only the short site name and never wraps. The ＋ button sits at the true center of the screen (the left cell is as wide as the two right cells).
- **Home = recruitment feed**: purpose chips (すべて/ランク/エンジョイ/大会練習/カスタム) and a 「今すぐ」 toggle (starts within 30 min or already running), via `?purpose=` and `?soon=1`. Cards show a purpose-coloured badge, a live countdown (「あと12分」「開催中」「22:00〜」「明日 01:00〜」, refreshed every 30s, first render uses the server time to avoid hydration mismatch), slot dots (●●○), owner name/rank, VC icon, mood tags, join mode, and a large 参加する button (満員 when full). Ended/cancelled recruitments are not listed; order is nearest start first. `/recruitments` now redirects to `/`.
- **Tap-based one-screen creation** (`/recruitments/new`): purpose tiles, start chips (今すぐ / 30分後 / 21:00 / 22:00 / 23:00 / その他→time picker), 「あと1人/あと2人」 (custom: あと1〜5人), ⚡早い者勝ち (default) / ✋承認制, and a collapsed optional section (rank condition, VC, tags, ひとこと ≤40, room code). The end time input is gone: end = start + 1 hour. Empty ひとこと → auto title like 「ランク S4〜 あと1人」. The last choices are stored in localStorage (`cm_last_recruit`). The submit button is fixed above the tab bar. After onboarding, posting is 2 taps with the defaults (＋募集する → 募集する), 3 if the purpose is changed.
- **Start-time chips are resolved on the server** (`src/lib/recruit.ts`): the client sends only the chip key (`now|in30|h21|h22|h23|custom`) and the server recomputes the time from its own clock in JST. Passed fixed-hour chips are hidden, not rolled to tomorrow; a chip submitted up to 30 min late is still accepted (same grace as the DB). **Interpretation**: a time picked with 「その他」 that is more than 30 min in the past is treated as tomorrow, so a 0:30 session can be posted at 22:00.
- **Join mode** per recruitment. Instant joins become `approved` immediately (seat count, `full`, `filled_at` updated inside `request_join` with the recruitment row locked), and the owner gets a `joined` notification. Approval mode works as before.
- **Onboarding** (`/welcome`, one screen): display name prefilled from Discord `custom_claims.global_name` → `full_name` → `name` (X: `name` / `user_name`), rank chips, optional roles, consent, はじめる. The other profile fields and contacts are optional and live in マイページ → 編集. `requireViewer` and the OAuth callback now send users without a profile to `/welcome`.
- **Browsing without login**: home, detail and the create screen open without login. Pressing 参加する / 募集する while logged out stores an *intent* in localStorage (`src/lib/intent.ts`, 15-minute TTL) and goes to login → onboarding → back to the page, where the action runs automatically (join via `IntentRunner`; post restores the draft and auto-submits). The intent is only written by the user's own click, never read from the URL, so a shared link cannot make someone join or post.
- **Detail page**: member slots (owner with crown, confirmed participants, dashed empty seats; anonymous visitors see only anonymous filled seats because participations are not readable by `anon`), a large room code with a copy button for members, inline room-code editing for the owner, contacts, chat (members only, as before), approve/decline for approval mode, 「外す」 for the owner (reuses `decide_participation 'rejected'`), cancel, and 「Xで共有」 (opens the X post intent with `?src=x`; no API).
- **Design**: dark theme with neon accents, purpose colours (ランク=cyan, エンジョイ=green, 大会練習=orange, カスタム=purple), M PLUS 1p via `next/font/google`, lucide-react icons, 44px+ touch targets, text contrast ≥ 4.5:1 on the dark surfaces, `prefers-reduced-motion` respected. Checked at 375px with no horizontal scroll.
- **Removed v1 code**: `RecruitmentForm`, `RoomCodeEditor`, the day filter, `DURATION_OPTIONS_MIN`, `parseJstLocalInput` / `toJstLocalInput` / `relativeStart`, `PurposeChip` / `StatusBadge` / `RankText` / `VcText`, and the `isNew` path of the profile form.

## DB (`20261001000005_join_mode.sql`)
- `recruitments.join_mode text not null`, check `in ('instant','approval')`. The column is added with default `'approval'` (so existing rows keep their approval semantics) and the default is then switched to `'instant'`.
- `notifications_kind_chk` gains `'joined'`.
- `create_recruitment` is dropped and recreated with `p_join_mode text default 'instant'` appended (the existing argument order is unchanged, so v1 calls still work). It also rejects capacity > 3 for non-custom purposes. The DB does not add a table constraint for this because existing v1 rows (e.g. enjoy with 6) would then fail on unrelated updates. Execute is revoked from `anon`/`public` and granted to `authenticated`.
- `request_join` is replaced with the same signature, so its grants are kept. It now locks the recruitment row.
- RLS, contact disclosure (owner ↔ confirmed participant only), reports, blocks and rate limits are unchanged. The script is idempotent.
- `supabase/tests/10_rls_test.sql` section 14 covers:
  - the defaults
  - the check constraint
  - anonymous users being unable to create
  - the per-purpose capacity limit
  - an invalid join mode
  - an instant join leading to approved, the `joined` notice and room-code access
  - idempotent re-joins
  - filling to full
  - a full recruitment rejecting new joins
  - cancel then rejoin
  - owner removal, after which the removed user cannot rejoin and loses the room code
  - approval mode staying pending

  The seed sets `join_mode` explicitly.

## Known gaps
- Instant joins are not announced to other participants in real time. Pages update on navigation or refresh.
- The countdown uses the device clock after the first render.
- The ひとこと length check in zod counts UTF-16 units, while the DB counts code points. Emoji-heavy titles may be rejected a little early.

---

# v3 (REDESIGN_V3.md)

## 1. Bug: registered users sent back to /welcome
- **Cause** (as stated in the spec, confirmed): `getViewer()` and `/users/[id]` ran `profiles.select('*')`. `signup_src` has no column privilege for `authenticated`, so PostgREST returned a permission error, `data` was `null`, and the code read that as "no profile" → redirect to `/welcome`.
- **Fix**: one column list, `src/lib/profile-columns.ts` (`PROFILE_COLUMNS` / `PROFILE_SELECT`), used everywhere profiles are read. Errors are no longer treated as "no profile": `getViewer()` throws `ProfileLoadError` (shown by the error boundary with a reload button), `getViewerSafe()` no longer swallows errors (only the layout header does), and the OAuth callback / `onboardAction` / `saveProfileAction` check `error` before deciding a profile is missing.
- **Audit**: every `.select()` in `src/` was checked against the grants. Only the two `select('*')` calls were wrong; embeds of `profiles` use columns inside the `authenticated` grant (and `anon` only reads `id, display_name, rank_band`).
- **Regression tests**: `db:verify` section 0 runs, as `authenticated`, `select * from profiles` (must fail) and `select <PROFILE_SELECT>` (must succeed). `scripts/db-verify.sh` reads `PROFILE_SELECT` from the TS file with `node --experimental-strip-types` and passes it to psql, so the SQL test uses the same constant as the app. `tests/profile-columns.test.ts` checks the list against the grant parsed from the migration and fails if any source file uses `select('*')`.

## 2. Auth: user ID + password
- **How it works**: Supabase Auth email/password with a synthetic address `<login_id lowercased>@example.edu` (`src/lib/account.ts`). The app never stores or hashes passwords; GoTrue does.
- **Why `example.edu`** (checked against github.com/supabase/auth at commit `ce9a8ee`, 2026-09-22):
  - Sign-up/admin create only call `checkmail.ValidateFormat` (`internal/api/mail.go` `validateEmail`) → format check only. The address passes the same regex (unit-tested).
  - The extended validator (`internal/mailer/validateclient/validateclient.go`, used only when GoTrue sends mail) rejects the suffixes `.test .example .invalid .local .localhost` and the hosts `example.com/.net/.org`, `test.com`, `email.com`, etc., then requires DNS (MX or A) and checks blocked MX hosts. `example.edu` is not on any list and resolves.
  - `example.edu` publishes a Null MX (`MX 0 .`, RFC 7505) and `v=spf1 -all`, served by the same IANA-style Cloudflare setup as `example.com` → no mail can be delivered to anyone. (`.invalid` etc. would also be undeliverable, but fail the extended validator, which the spec asks us to pass.)
  - With "Confirm email" OFF and users created with `email_confirm: true`, no mail is ever attempted anyway.
- **Sign-up** (`signupAction`, server): zod → per-IP limit (3/hour, 10/day; IP from Vercel's `x-forwarded-for`, stored only as HMAC-SHA256 keyed with the service-role key) → `auth.admin.createUser` (service role) → `register_account` (login ID + recovery-code hash) → `signInWithPassword` on the cookie client (session set immediately) → `save_my_profile` as the user. Any failure after the user is created deletes the user again. The recovery code is shown once, then the user continues to `next` (the saved join/post intent resumes as in v2).
- **Login** (`LoginForm`, browser): `signInWithPassword` straight from the browser, so GoTrue's per-IP limits apply to the real client IP instead of Vercel's.
- **Recovery code**: 16 chars from a 32-symbol alphabet without 0/O/1/I (80 bits), only SHA-256 stored (`accounts.recovery_hash`, not readable even by the owner). `recoverAction`: per-IP 10/hour and per-ID 5/hour limits → `verify_recovery` → `auth.admin.updateUserById` → new code issued (old one invalid) → sign in → other sessions signed out. マイページ can re-issue a code.
- **service_role** is needed for creating users without the public sign-up limiter, for setting another user's password during recovery, and for the server-only RPCs. It lives only in `SUPABASE_SERVICE_ROLE_KEY` (server), used by `src/lib/supabase/admin.ts`.
- **Discord** stays as a small「Discordでも入れる」link on login/sign-up. X is removed from the UI and from the `signInWithProvider` allow-list.
- Guests who press 参加する/募集する now go to `/signup` (with a link to `/login`) instead of `/login`.

## 3. Abuse controls (DB)
- `submit_report` counts a reporter only if, **at the time of the report**, their profile was at least 24 hours old (`reports.created_at >= profiles.created_at + 24h`). Fresh reports are still stored and shown to the admin. Profile creation time is used (always ≥ auth user creation), and the check is not retroactive. `src/lib/moderation.ts` mirrors it.
- Raw Supabase sign-ups (someone calling `/auth/v1/signup` directly with the anon key) get `provider = email` but no `accounts` row; a `before insert` trigger on `profiles` rejects them, so they cannot use the app or bypass our IP limit. Discord users and the ID flow are unaffected.

## 4. Migration `20261001000006_v3.sql`
`accounts` table (RLS, owner can read `user_id, login_id, recovery_issued_at, created_at` only), `private.auth_attempts` + `auth_rate_check`, `register_account`, `verify_recovery`, `set_recovery_hash` (execute revoked from `public/anon/authenticated`, granted to `service_role`), the profile trigger, and the new `submit_report`. Idempotent (`if not exists`, `create or replace`, `drop ... if exists`); `db-verify.sh` now applies the latest migration twice. No seed.

## 5. Design ("ロビー")
Plan, review against generic defaults, and the 6 scored rounds are in `docs/design-review.md`; final screenshots in `docs/screenshots/`. In short: light arena floor + ink + cobalt (ally) + vermilion (signal), Dela Gothic One for display and numbers, Zen Kaku Gothic New for text, chamfered sheets/buttons instead of rounded cards, and one recurring shape — the slanted 3-seat lineup (`src/components/Lineup.tsx`) used in the feed, detail, create preview and sign-up preview. Motion only when your join is confirmed (seat slides in, stamp). The soonest joinable recruitment is shown larger. Pages are split into data loaders (`src/app/(site)/...`) and views (`src/components/views/*`) so the preview can render the same views with fixtures.

## 5b. Juror round (live lobby)
After an outside review, the following changed: the tab bar is hidden on `/recruitments/new`, `/signup`, `/login` and `/welcome`. Dela Gothic is used only at 22px and above. When joined, the room number sits right under the countdown. Auto titles no longer contain the seat count (`autoTitle` → 「ランク S4〜の募集」). The stamp moved off the seats. The header follows the session. The signup order is ID → password → rank, with 「あと◯項目」 on the button. Contrast and minimum sizes were fixed, chips fade at the scroll edge, card tags show one tag plus 「+N」, the footer sits at the bottom, and the soon filter is a `role="switch"`. The detail page is now a live lobby (`LobbyLineup`): the first empty seat is a join button that shares state with the text button through `useJoin`, it refreshes every 15 s, new members get a slide-in flash, and the countdown ticks every second within the last hour.

## 5c. Second juror round
- **Shorter sign-up**: only the user ID, password and consent. The display name starts as the ID. The rank band is created as a provisional `s1_3` with `profiles.rank_confirmed = false`, set by the profile insert trigger when an `accounts` row exists. The first join or post shows `RankPrompt` (one tap, then the action continues): `useJoin`, `IntentRunner` and the create form handle the new `needs-rank` auth state, and cards send the user to the detail page to ask there. `confirm_my_rank(text)` (authenticated) sets the band and the flag. Saving the profile on マイページ also confirms it. Existing profiles default to `true`. These are part of the same, still unapplied, `20261001000006_v3.sql`.
- One filled-seat colour (cobalt); black is used only for the organizer. 大会練習 changed to ochre `#8A6100`. The recovery code is shown in 4-character groups. The stamp sits above the seats. On desktop, the submit button is at least 64px. The card button now reads 「管理する」. The login screen has a lineup panel on desktop. Detail (before joining) uses a narrow sticky side column. マイページ shows its two lists side by side.

## 5d. Final polish
Copy was rewritten in a player-to-player voice. Sentences that explain obvious UI were removed, and errors now say what happened and what to do next (`db-error.ts`). Detail on desktop is a 12-column composition: info and the room-code/locked panel on top, a full-width tall lineup (`Lineup tall`) in the middle, and contacts plus chat at the bottom. Spacing is normalised to the 4/8/12/16/24/32/48px steps.

## 6. Dev-only preview
`/dev/preview/[screen]` (`src/app/dev/**/*.dev.tsx`, fixtures in `src/lib/fixtures.ts`). `next.config.ts` adds `dev.tsx` to `pageExtensions` only when `NODE_ENV=development`; the page also checks `isPreviewEnabled()`. Guarded by `tests/preview-guard.test.ts` and by `postbuild` (`scripts/check-no-preview.mjs` fails the build if any `/dev` route exists).

## Known gaps (v3)
- **X-only accounts** from v1/v2 cannot log in from the UI any more. There is no self-service migration to an ID; the operator has to handle requests manually (or temporarily re-add the button).
- Discord users cannot add a user ID/password to their account (they keep using Discord).
- Login brute force relies on GoTrue's per-IP limits (login is browser-side on purpose); there is no per-ID lockout.
- Someone calling GoTrue's sign-up API directly can still occupy a login ID (the account is useless because it cannot create a profile, but the ID shows as taken). The operator can delete such users in the dashboard.
- The signup IP limit trusts Vercel's `x-forwarded-for`; elsewhere a proxy could share one bucket.
- Screenshots were taken with `next dev --webpack` (Turbopack's dev font fetch failed through the sandbox proxy); `npm run build` (Turbopack) succeeded.
- Other people's joins appear through polling: the detail page calls `router.refresh()` every 15 s while it is visible and the recruitment is active, which costs a few Supabase reads per open page. There is no Realtime subscription on participations.
