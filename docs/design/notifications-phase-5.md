# Phase 5 - Notifications

Status: ready for review. Implementation, rendered refinement and final gates
are complete. No commit/merge and no Phase 6 work.
Mode: Operate. Preserve the approved light/blue GMind identity and type scale.
Branch: `feat/phase-5-notifications`. No commit/merge or Phase 6.

## Baseline And Product Truth

- Sources: BA v1.0 UI-09, notification/reminder/access rules, and the AI
  implementation prompt. Vietnamese UI, UTC storage, Asia/Ho_Chi_Minh display.
- Existing surfaces: Notifications page, header bell link/badge, sidebar link.
  There is NO dropdown/panel. Do not invent one or add notification preferences,
  email/push, mark-unread, delete, undo or realtime endpoints.
- Existing APIs: GET `/api/notifications?unreadOnly=false&take=100`;
  GET `/api/notifications/unread-count`; POST `/api/notifications/{id}/read`;
  POST `/api/notifications/read-all`. The backend caps take at 100 and has no
  offset/cursor. Count is authoritative over all visible unread notifications,
  not just the loaded list. Mark-all covers all visible unread notifications.
- Backend visibility requires the current recipient to be active and to retain
  active group membership, except MemberRemoved notices remain visible.
- Current problems: repeated padded Cards; opacity reduces read-item contrast;
  browser-local timestamps; no filtering/resource navigation; read failures
  erase the list; duplicate mutations/stale requests are unguarded. Bell count
  only loads on pathname changes and does not reflect read actions promptly.
- Real baseline screenshots show populated notifications. The initial capture
  script's zero-item report used an unsuitable selector and is NOT evidence
  that the real inbox was empty.
- Local checkout has approved but uncommitted Phase 4 changes despite the user's
  statement that it was merged. Preserve them. `%TEMP%\gm-p5\pre-phase5`,
  `git-diff.patch` and `git-status.txt` capture the starting point; compare
  Phase 5 against that baseline, not by attributing every dirty file to this work.

## Design Contract

THESIS: A compact, readable inbox, not a stack of disconnected cards. Distinguish
new work without making previously read information hard to read.

- Compact 24px page heading + real unread summary and Refresh. One white,
  bordered 16px workspace, constrained to a comfortable reading width.
- Workspace toolbar: Tất cả / Chưa đọc, using native pressed buttons with a
  labeled group; mark-all action. At mobile these reflow deliberately rather
  than squeezing labels or producing horizontal overflow.
- Date groups: Hôm nay, Hôm qua, otherwise a Vietnamese calendar date, all based
  on Vietnam civil days. Small clear group headings, flat rows and subtle rules.
- Each row: supported-type icon, title, body, explicit Chưa đọc/Đã đọc status,
  timestamp, known-resource link and an accessible 44px individual read action.
  Unread uses a subtle blue surface/dot and stronger title weight. Read retains
  normal high-contrast text, NEVER whole-row opacity.
- Icons use existing SVG names only; no invented sender avatars/names.
  Task/reminder/group/marketplace tones reflect the existing notification type;
  unknown types use a neutral bell and still show their real content.
- Bodies <=200 characters display in full. Longer bodies have a three-line
  preview and an accessible Xem thêm/Thu gọn control; full content stays
  available on mobile. Titles wrap, strings use overflow-wrap:anywhere.
- Exact `<time>` values use UTC-safe parsing and Vietnam display; never rely on
  browser-local timezone. Invalid dates get neutral notification-specific copy.
- Existing header bell remains a LINK. Page, bell and optional sidebar badge
  share one authoritative count, including the same unknown/stale semantics.
- Marking read is an explicit action, not an implicit side effect of opening
  a resource. No fake undo. Mark-all uses the existing ConfirmationDialog:
  explain that it applies to all unread, including rows outside the loaded 100.
  Confirm/cancel/busy/failure/focus-return states must work.
- Individual read actions restore meaningful focus to the current/next row or
  active filter if the unread row disappears. Successful bulk action restores
  the active filter if the now-disabled opener cannot receive focus.
- Loading skeleton mirrors rows, not dashboard statistic cards. Distinguish
  initial error, quiet refresh failure retaining data, empty All, empty Unread,
  mutation error retaining items, and success feedback.
- When 100 rows are returned disclose the latest-100 limit. Do not promise
  older pagination, invent load-more, or derive total/unread count from that cap.

## Exact Implementation Seams

### API Contract

MarketplaceRequest notifications store their group but omit it from the DTO;
the supported UI route requires `/groups/:groupId/marketplace`. Add the existing
nullable field, not a new endpoint, schema, policy or permission:

```csharp
public record NotificationDto(Guid Id, string Type, string Title, string Body,
    string? RelatedEntityType, Guid? RelatedEntityId, bool IsRead, DateTime CreatedAt,
    Guid? GroupId = null);
```

The existing GetMyAsync projection becomes exactly:

```csharp
.Select(n => new NotificationDto(n.Id, n.Type.ToString(), n.Title, n.Body,
    n.RelatedEntityType, n.RelatedEntityId, n.ReadAt != null, n.CreatedAt, n.GroupId))
```

Keep VisibleTo, count, mark-read and mark-all queries unchanged. Frontend DTO
adds `groupId?: string | null`; relatedEntity fields also accept null.
Service list explicitly requests take=100.

### Shared Count And Lifecycle

- Add `NotificationCountProvider` and `useNotificationCount` under
  `components/notifications/`. Interface: count:number|null, loading:boolean,
  error:string, refresh(force?:boolean):Promise<void>, clear():void.
- MainLayout wraps its existing shell/children with ONE provider keyed by the
  current user ID. Header/sidebar and NotificationsWorkspace consume that same
  context, not independent count fetches or a global cross-user cache.
- Provider performs count GET on mount, focus/visible return and every 60 seconds
  while visible. Deduplicate normal in-flight refresh; forced refresh after a
  mutation invalidates older count results with request versions.
- Count failure is not zero. Ordinary failure retains last known count with
  stale/error semantics; 403/404 clears it. Clear/unmount invalidates requests.
- NotificationsWorkspace is keyed by current user, owns the list, and uses
  `?unread=1` for the supported unread filter. Query changes preserve the inbox.
  Extend the existing ProtectedRoute Calendar-only UI-query exception to
  `/notifications` as well; other route/auth validation remains unchanged.
- List GET on mount/filter, focus/visible return and 60-second visible refresh.
  Request versions reject old filters/users/unmount results; no duplicate initial
  fetch. Refresh stays quiet with existing rows and reports a failure honestly.
- Serialize read mutations. Invalidate old list loads before POST; block duplicate
  mutation/refresh/filter operations until it settles. Apply local read DTOs only
  AFTER success, then reload list (refill unread cap) and force count refresh.
  An ordinary reload failure cannot undo a successfully saved local read state.
- 403/404 from list or mutation clears private rows, count and dialog state.
  Ordinary mutation failure retains rows, permits retry and does not announce
  success. Ignore all old-user completions. No timeouts/global focus hacks.

### Safe Navigation

- Whitelist GUID IDs and entity kinds, never parse titles/bodies into URLs.
- Task -> `/tasks/:id`; Project -> `/projects/:id`; Group -> `/groups/:id`;
  MarketplaceRequest -> `/groups/:groupId/marketplace` when groupId is valid.
- MemberRemoved is informational, not a link into a group the user cannot access.
  Missing/unknown targets are readable informational rows, not dead buttons.
- Link labels promise the supported destination (e.g. Xem Marketplace), not an
  unsupported request-details page. Target pages still enforce resource access
  and handle stale/deleted resources.
- Task links carry navigationSection `/notifications` and an exact local
  returnTo `/notifications[?query]`. Extend MainLayout/TaskDetail safe return
  handling and regression cases only; do not rewrite resource pages.

## Verification Plan

- Frontend model: UTC+7 today/yesterday/year boundary and offsetless UTC;
  invalid dates; every safe target; malicious/unknown targets; MemberRemoved;
  Marketplace groupId; deterministic newest-first grouping.
- Provider/UI: one shared count, late count invalidation, unknown/stale count,
  focus dedupe, session/unmount safety; filter URL and stale-response switching;
  read-one success/persistence presentation; mutation failure retaining rows;
  saved-success + reload failure; unread removal/refill; mark-all cancel/no POST,
  duplicate locks and confirmation/focus; 403/404 privacy clearing; body expansion;
  safe TaskDetail return. Exercise real components, not source-string assertions.
- Backend tests follow existing authenticated WebApplicationFactory/InMemory
  patterns: current-recipient filtering, other-user 404/no mutation, inactive
  users/members and archived groups, MemberRemoved exception, GroupId contract,
  read timestamp persistence/idempotence, unread filtering/count and take cap.
  ExecuteUpdate mark-all is relational: prove it on approved isolated local SQL
  test accounts, not by pretending EF InMemory supports ExecuteUpdate.
- Browser: REAL running API/SQL app at 1440x1000, 768x1024, 390x844; capture first
  pass, visually inspect, fix issues, capture refined pass. Existing account is
  READ ONLY. New local test accounts exercise real writes, reload persistence,
  page/bell count equality, All/Unread, resource navigation, bulk dialog keyboard
  and bounds. No mock notification responses outside unit tests.
- Browser adverse states use delayed/aborted network requests, not invented
  response payloads. Keep errors separate from real success-flow console results.
- Scoped tests first; one final full frontend gate, relevant backend tests,
  lint, frontend/API builds and final diff review. No dependencies or migrations.

## Authorized Local E2E Recipe

The user explicitly approved creation of TWO new local test accounts, a separate
group/invite/project/tasks, task assignment/submission/review and read/read-all
only for those accounts. No real-user inbox mutation, email or deletion.

- Register two unique `p5-notifications-...@example.test` accounts through
  POST `/api/auth/register` with displayName/email/password/confirmPassword.
  Generate passwords in the process; never print credentials/tokens.
  Login using POST `/api/auth/login`; keep secrets only in local temp storage.
- Leader POST `/api/groups` with name `P5 Notifications - Test`, then
  POST `/api/groups/{id}/invites` with `{}`; Member POST `/api/groups/join`
  with the returned code. POST `/api/groups/{id}/projects` with a clearly labeled
  test project name, description and no deadline.
- Leader POST `/api/projects/{projectId}/tasks` for four named test tasks,
  assigneeUserId=NEW Member ID, priority=2, future UTC deadline=now+14days.
- Member POST `/api/tasks/{taskA}/status` with status 2 then 3; Leader with
  status 4/comment; Member 2 then 3; Leader 5/comment. These are real supported
  enum values and produce genuine notifications. Do not insert notifications.
- Use the new accounts' GET `/api/notifications?unreadOnly=false&take=100` and
  GET `/api/notifications/unread-count`. UI mark-one must persist after reload;
  new count equals previous count minus one. All/Unread/page/bell agree.
- Confirm mark-all ONLY in the new Member inbox. POST read-all affected count
  equals that user's before-count, count afterward is zero; a second read-all
  affects zero. NEW Leader inbox remains unchanged by Member's read actions.
- Attempt Member POST read on NEW Leader notification -> 404, no read change.
  Use normal UI links and browser Back to verify exact filter return.
- One additional task may generate a fresh unread notification after the bulk
  case so the demonstration does not end with only read rows. Keep all labeled
  test data; no cleanup/deletion was authorized. Stop/report any schema surprise.

## Verification Checkpoint

The implementation uses separate NotificationItem, useNotificationInbox,
NotificationCountProvider/context/hook and scoped CSS. Backend changes remain
only the two lead-authored DTO/projection lines.

Initial source review rejected a provider placed below its consumer, a count
deduplication/version bug, unsafe invalid-date formatting, invented icon type
names, missing success feedback and incomplete read/error/focus lifecycles.
These were fixed before browser acceptance; compiler success alone was not
treated as completion.

Actual retained evidence: `%TEMP%\gm-p5`. Secrets in `p5-creds.json` are private
local test credentials: do not print, upload or commit that file. IDs, setup
and proof files are separate. Two authorized test accounts, one group/project,
four tasks and the submitted/reviewed workflow produced real SQL notifications.
No existing-user inbox was mutated and no notifications were inserted by hand.

### First Render And SQL Pass

- `R1-scoped.log`: 95/95 across model, provider, Notifications page, route guard
  and TaskDetail access/navigation tests.
- `R1-backend.log`: 11/11 NotificationAuthorizationTests, including recipient
  IDOR, inactive authentication, membership revocation, archived-group rules,
  MemberRemoved exceptions, GroupId DTO, take clamp and persistent/idempotent
  individual read. This suite uses isolated EF InMemory, not the app database.
- `v1-api-build.log`: build succeeds, zero errors, six existing warnings.
  Running API was restarted and SQL readiness returned 200.
- `r1-proof.json`: real count 4 -> 3 after individual read, persisted on reload;
  bulk read -> zero and remains zero after reload; repeated bulk read affects
  zero; Member attempting to read the new Leader's notification returns 404.
  Header badge agrees with the actual count API.
- `r1-live-{1440,768,390}-vp.png`: actual application reviewed at all three
  widths, six genuine rows with read/unread contrast; no horizontal overflow or
  nested interactive controls, 44px read buttons.
- `r1-bulk-dialog-{1440,390}.png`: native dialog in viewport, clear all-scope/no
  undo explanation, cancel performs no POST.

The first visual pass was NOT accepted as final: mobile toolbar took two rows
and full timestamps pushed task links to a separate row. The refinement reduces
bulk-action padding/type while retaining its full label and 44px hit area.
Visible timestamps now show HH:mm within their date group; their exact UTC value
and full Vietnam datetime remain in dateTime/title/accessible labels.

R1 raw proof retains a failed task-link probe because it ran in the now-empty
Unread filter after bulk read; the real return journey is pending a fresh
authorized task notification. Its deliberate IDOR request also records an
expected 404 console resource error; do not classify that as an application
failure or claim all collected console output was empty.

The nine new R1 lint warnings were addressed without disabling rules: context
is split from the component export, finally does not override control flow,
test captures happen in layout effects, filter resets are scheduled, denial
closes confirmation through its async callback, and focus sync uses refs.
Re-run results belong to the refined/final pass, not this checkpoint.

## Final Review And Evidence

Three rendered passes were inspected in Edge. The final refinement replaces the
200-character expansion heuristic with actual paragraph overflow observation:
the same genuine 220-character notification needs no toggle on desktop/tablet,
but offers expansion on mobile. Short content never acquires an inert control.

Canonical final evidence is `lead-final-proof.json` and
`lead-final-live-{1440,768,390}.png` in `%TEMP%\gm-p5`:

- Actual final screenshot sizes: 1440x1000, 768x1024 and 390x844.
- Seven real API rows; the full-label bulk action stays beside filters at 390.
  Normal metadata no longer pushes the resource link onto an extra line.
- Exact row-level overflow checks: zero expansion buttons at 1440/768, one at
  390, matching the actual scrollHeight/clientHeight of the same content.
- Unread -> actual TaskDetail -> browser Back -> reload returns exactly to
  `/notifications?unread=1`, retaining one unread row and API count one.
  A separate visit -> explicit `Về Thông báo` -> reload proves the same result.
  Opening the resource does not mutate ReadAt.
- Native dialog Tab/Shift+Tab stay on its controls; a programmatic background
  focus attempt is blocked. Escape closes it without any notification POST.
- Count-only network abort retains the known count one, qualifies it as stale
  instead of showing zero, and its own retry restores the authoritative count.
- List network abort displays the actual alert/retry, not a false empty inbox;
  retry recovers the genuine unread row. Normal-flow console/page errors: zero.
  Deliberately aborted requests are recorded separately, not hidden as a pass.

Earlier broad harness collectors are not the final acceptance source:
R2's case-sensitive error-text selector missed a rendered alert, and its
Back/reload sample was on TaskDetail rather than the inbox. R3's generic toggle
and combined-console counts likewise did not prove row overflow or a clean
normal flow. The exact final recipe above replaces those assertions; historical
raw artifacts remain unchanged.

Additional real, read-only existing-user evidence:
`r3-old-user-{1440,390}.png` shows six historical date groups;
`r3-proof.json` verifies a genuine Marketplace notification's GroupId and its
matching `/groups/{groupId}/marketplace` href. This did not mark existing items
read. Task/Project/Group/Marketplace whitelist and malformed/unknown metadata
are also covered by unit tests.

`contrast-review.json` uses actual computed foregrounds and complete background
ancestor chains from the final DOM, compositing alpha before the WCAG luminance
calculation. All seven sampled normal-text styles pass 4.5:1: body/metadata
7.28:1, unread label/link 7.20:1, warning 4.84:1, error 6.47:1. This is scoped
notification-surface checking, not a claim of app-wide accessibility certification.

### Final Gates

- `final-frontend.log`: `npm --prefix GMind-Frontend run test -- --run`,
  224/224 across 18 files.
- `final-backend.log`: `dotnet test GMind-Backend/GMind.Tests/GMind.Tests.csproj`,
  75/75, zero skipped. Includes the 11 new notification authorization cases.
- `R3-scoped.log`: 97/97 focused tests, including fits/resize overflow cases.
- `final-lint.log`: `npm --prefix GMind-Frontend run lint`, zero warnings/errors.
- `final-build.log`: `npm --prefix GMind-Frontend run build`, TypeScript/Vite
  succeeds. Existing large-chunk and bundler-timing hints remain.
- `v1-api-build.log`: API build to `%TEMP%\gm-p5\api-build` succeeds after the
  DTO change, zero errors; six existing dependency/pruning warnings.
- `git diff --check` is clean. Full relevant source/diffs were reviewed; no
  application credentials/tokens or accidental deletions were introduced.
- `calendar-integrity.json`: Calendar page, both page tests and all four
  calendar component/model/CSS files are byte-identical to the Phase 5 baseline.
  Existing uncommitted Phase 4/tooling files are preserved, not reverted.

### Changed Files

Frontend paths below are relative to `GMind-Frontend/src/`:

- `pages/Notifications.tsx`
- `components/notifications/NotificationItem.tsx`
- `components/notifications/useNotificationInbox.ts`
- `components/notifications/NotificationCountProvider.tsx`
- `components/notifications/notification-count-context.ts`
- `components/notifications/useNotificationCount.ts`
- `components/notifications/notifications.css`
- `services/notifications.ts`
- `layouts/MainLayout.tsx` (provider/bell and notification navigation hint only)
- `components/ProtectedRoute.tsx` (notification query changes retain the leaf)
- `pages/TaskDetail.tsx` (safe notification return URL/label only)
- `services/notifications.test.ts`
- `components/notifications/NotificationCountProvider.test.tsx`
- `pages/notifications.test.tsx`
- `components/ProtectedRoute.test.tsx`
- `pages/workspace-access.test.tsx`

Backend: `GMind.Application/Services/Notifications/NotificationService.cs`
(GroupId DTO/projection only), and `GMind.Tests/NotificationAuthorizationTests.cs`.
Documentation: this brief and `docs/decisions/OPEN_QUESTIONS.md`.

### Running And Remaining Limits

API and Vite remain running at localhost:5194 and localhost:5173. Normal commands:

```text
dotnet run --project GMind-Backend/GMind.API --launch-profile http
npm --prefix GMind-Frontend run dev
```

No new configuration or migration is required. For a clean development database,
use the existing README setup and existing migrations:

```text
dotnet ef database update --project GMind-Backend/GMind.Infrastructure --startup-project GMind-Backend/GMind.API
```

Keep ConnectionStrings__DefaultConnection and Jwt__Secret in the existing
environment/User Secrets configuration, not tracked appsettings. No database
reset, deletion or migration was performed for this UI phase. Two isolated test
accounts and their labeled group/project/five tasks remain for review; local
test credentials stay outside the repository.

No blocking notification UI defect remains in the verified scope. The API still
caps a filtered list at 100 without older-page pagination and has no unread/undo
operation. Counts refresh after actions, on focus and every 60 visible seconds,
not via realtime push. There was no notification dropdown to redesign; the bell
remains a link to the center. Reminder-generation policy was not changed, and
this UI phase does not re-certify every background reminder milestone. Existing
System.Security.Cryptography.Pkcs 9.0.11 advisory and .NET preview/toolchain
considerations remain outside this change; Visual Studio GUI F5 remains unverified.
