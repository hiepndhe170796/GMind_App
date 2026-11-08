# Calendar Redesign - Phase 4

Status: implemented and visually refined; verified and awaiting user review.
Mode: Operate. World: the approved light, blue GMind product system.
This replaces the rejected Calendar composition, not GMind's global identity.

## Diagnosis

The old calendar gave `.cal-cellbox` a minimum height while styling only its
44px date button as a bordered box. Event links were siblings below that box.
They belonged to the date in the DOM, but not inside its visible boundary.
Automatic grid rows grew differently for dense days; the unused part of each
minimum-height cell looked like a large gap between weeks. Repeated rounded
date buttons, padded Cards and separate agenda Cards reinforced the fragmentation.
Multiple independent toolbars and 24px vertical gaps pushed the mobile calendar
below most of the first viewport.

The earlier review verified functionality and overflow but accepted a visibly
weak composition. This pass must judge the rendered whole, not just those tests.

## Composition Contract

THESIS: One continuous planning surface, with deadlines visibly anchored inside
their dates and a contextual day agenda that belongs to the same workspace.

FIRST VIEWPORT: Compact page title/scope and refresh; one white workspace;
month heading/picker, previous/Today/next, Month/List; search and a collapsible
filter control; the calendar itself. No duplicate month heading or standalone
statistics row. Blue is selection/action, not decoration.

```
Workspace header: month/picker + navigation          Month | List
Search + Tìm                                  Bộ lọc (active)
Optional inline filters: project / status / priority / overdue
----------------------------------------------------------------
 T2 | T3 | T4 | T5 | T6 | T7 | CN    | Selected-day heading
----------------------------------- | Task / project / status
 Continuous grid of real day cells  | Task / project / status
 Date and chips share each cell     | Empty-day guidance
----------------------------------------------------------------
 Chưa đặt hạn (N) - expandable, inside the workspace footer
```

- One outer 16px radius/border. No Card inside Card, no padded calendar shell.
  Grid lines are single 1px slate rules; day cells have no separate rounded box.
- Use seven exact equal columns with zero inter-cell gaps. Weekday columns align
  exactly with date columns. Fixed equal rows: 112px at desktop, 104px tablet,
  64px compact mobile. The existing six-week date projection remains unchanged.
- Each date cell has one full-cell date-selection button as a background sibling
  of foreground task links. Date numeral sits near the upper-left corner.
  No interactive nesting. Chips, overflow and focus marks stay inside that cell.
- Two 22px task chips plus a compact overflow control fit inside desktop/tablet
  cells. Text truncates only in these previews. Each chip uses supported task
  status tone/dot and an accessible full title/status/overdue label.
  Show time only where the cell is wide enough; full details remain in the agenda.
- Today: solid blue date circle. Selected day: subtle blue cell wash/inset line;
  selected non-today numeral has a clear outline. Outside-month cells use a
  muted background/text. Weekends have a barely tinted neutral background.
- Desktop >=1280px: calendar and 280px day agenda form one joined workspace with
  a single divider, not detached cards. At 1920px Calendar uses the available
  content width rather than inheriting the default 1440px cap.
- At ~768px the full grid remains readable and the day agenda moves below it.
  At ~390px use date/count/deadline indicators INSIDE the 64px cells, not
  illegible 2-character event chips; readable task rows are immediately below.
- Search remains visible; project/status/priority/overdue move into a labeled,
  inline expandable filter panel. Preserve all controls, URL state and active
  filter count. Expanding is not an API operation.
- Native month input remains keyboard accessible and directly selectable; the
  visible period is Vietnamese. Do not duplicate the OS month text as another
  large date control. Controls keep 44px touch targets.
- List view is an intentional dated agenda inside the same workspace. Undated
  tasks remain separate and never acquire a fabricated date.

## Implementation Boundary

- Calendar presentation, CalendarMonth, scoped calendar CSS and UI regression
  tests. A small MainLayout `contentWidth?: 'standard' | 'fluid'` option is allowed:
  default preserves every other page; only Calendar opts into fluid width.
- Preserve the current model, UTC+7 rules, real my-tasks endpoint, fetch guards,
  filters, Month/List, keyboard navigation, safe TaskDetail return and permissions.
- No API, event type, dependency, database write/migration, new global font or
  Phase 5. No commit/merge. Existing dirty Phase 4 work is retained.

## Acceptance Evidence

- Capture initial redesign and refined renders in a real authenticated Edge
  session at 1920x1080, 1440x1000, 768x1024 and 390x844; 320px is an extra guard.
  Real API captures and clearly named synthetic stress fixtures stay separate.
- Review screenshots after the first implementation; name concrete remaining
  defects, correct them, then capture a second round. Do not finish after round 1.
- Check all seven column widths/alignment, equal row heights, zero week gaps and
  every event/overflow rectangle contained by its own date cell. Assert this on
  dense days and long task/project titles, not merely on the single live task.
- Check 0/1/2/6 tasks per date, multiple statuses, overdue, outside-month tasks,
  today versus selected non-today, empty/loading/failure and active filters.
- Exercise month picker, Dec/Jan/leap clamps, arrows/PageUp/Down actual focus,
  chip -> correct TaskDetail, overflow -> complete day agenda, search commit,
  filters, Month/List, Back/Forward and exact return query preservation.
- One final frontend regression gate, lint/build and diff review. Existing
  backend is unchanged; do not re-run unrelated backend suites.
- Retain raw logs, screenshots and geometry evidence. Report any tool limitations
  honestly; no claim of DOM/visual verification from a regex-only source scan.


## Round 1 (rejected during self-review)
- Rewrote presentation per contract: one `.gcal-workspace` (rounded-16, integrated header prev/VN-month/next/Today/month-input + Month/List, toolbar search + collapsible filter panel with active-count badge), continuous grid + joined 280px day pane (>=xl, below at <xl), undated <details> footer.
- CalendarMonth: [data-cal-cell] plane cells (7 equal cols, 0 gap, 1px rules, 64/104/112px rows mobile/tablet/desktop), full-cell `.gcal-day-btn` background, date pill (today filled blue, selected ring), foreground `.gcal-events` (pointer-events none / links auto), [data-event-id] links, [data-cal-overflow] +N real button, mobile dots; no nested interactive.
- MainLayout gained `contentWidth?: 'standard'|'fluid'` (default preserves all pages; Calendar opts fluid).
- Identified a route remount during query navigation. The initial module-level
  focus variable/timer workaround was rejected and fully removed in Round 2.
  The actual cause was `ProtectedRoute`, not a need for delayed focus retries.
- Scoped: 55/55 (closure logs); lint 0; build pass; diff check clean.
- Evidence: Temp/gm-p4-redesign/r1-*.png (real month 1920/1440/768/390/320, list 1440/390, filters 768/390, fx-dense all widths) + r1-proof.json (geometry: cols<=1px, rows<=1px, weekGap~0, containment, no overflow, no nested) — all PASS; only console-404 from /api/tasks/fx0 fixture-fetch = harness artifact, not app bug.


## Round 2 (root fix retained; mobile header needed further refinement)
- **Root cause**: `ProtectedRoute` keyed on `location.key` — every search-params change remounted the route (proved `mainSame:false`). Fix: `routeKey = location.pathname === '/calendar' ? location.pathname : location.key` — query-only changes no longer revalidate/remount; all other routes unchanged. Probed: `mainSame:true`, arrow focus lands on new-day button with clean component refs (pendingFocusDate hack removed).
- Cell-level flags (data-today/selected/weekend/outside), explicit row heights 64/104/112, status-colored chips (data-status -> ToDo slate / InProgress blue / Submitted amber / ChangesRequested rose) with status dot, mobile real count + deadline dots (hidden >=768), joined day pane (month view only — list fills workspace), header: icon-only prev/next + one VN period picker (VN heading + chevron overlaid by transparent native month input), agenda block rows (line-clamp-2 title, project secondary, badges+deadline), filter panel minmax widths, chevron-down rotate-180 (no missing chevron-up), undated chevron affordance.
- Tests: 2 new ProtectedRoute routeKey cases (query-change keeps leaf mounted + validate count 1; path-change revalidates) -> 18/18; scoped 73/73; lint 0; build pass.
- R2 geometry checks passed. Its raw today-color assertion failed because the
  probe expected Tailwind's default blue instead of GMind's configured primary.
  The exact expected color was corrected in R3; R2 is not a clean final report.

## Final Render Review And Results

Three rendered rounds were inspected, not only generated. R1 exposed missing
selection styles, the duplicated/clipped native month field and unstyled event
labels. R2 exposed the still-wrapped mobile Today button and excessive form
chrome. R3 fixes those: title/refresh share a row; a single Vietnamese native
period picker leads the header; mobile period/arrows and Today/view form two
deliberate rows; search and filters share a row from 360px upward.

The final small refinements add a real ellipsis span inside flex-based chips,
Vietnamese status in their accessible names/tooltips, and one full-width empty
state instead of a second empty day pane when no work is assigned.

### Browser Evidence

Retained on the review machine: `%TEMP%\gm-p4-redesign`.

- `r3-real-month-{1920,1440,768,390,320}.png`: real personal-task API data.
  Desktop `-vp.png` files preserve first-viewport captures as well.
- `r3-fx-busy-{1920,1440,768,390,320}.png`: synthetic busy-month stress data,
  deliberately kept separate from real API captures. No fixture was added to
  production code or persisted in the database.
- `r3-real-list-{1440,390}.png` and `r3-real-filters-{768,390}.png`: the full-width
  List view and expanded filters. The default collapsed filters keep the
  calendar itself prominent on mobile.
- `r3-proof.json`: equal seven-column widths within subpixel rounding, equal
  112/104/64px day heights, zero gaps between weeks, visible chips and overflow
  contained inside their own date cells, no nested interactive controls and no
  document overflow. At 390px, weekday labels begin at 365px from the page top.
- Today uses GMind primary `rgb(47,102,196)` with white numerals; selected
  non-today cells use `rgb(238,244,253)` and a distinct numeral outline.
- `closure-fx-long-{1440,768,390}.png`: six tasks on one date with 400-character
  task/project strings. At desktop/tablet two previews and `+4` remain within
  the cell, with actual CSS ellipsis. Mobile deliberately uses count/markers,
  and all six tasks remain available in the readable selected-day agenda.
- `closure-fx-empty-390.png` and `closure-fx-error500-390.png`: final empty and
  failure layouts. Loading, retry, stale responses and permission loss also
  have regression-test coverage.
- `closure-journey.json`, `closure-taskdetail.png`, `closure-return.png`: real
  filtered task -> TaskDetail -> exact return URL; browser Back and reload retain
  month/date/view/project/status/priority/search and the task. January 31 ->
  February input clamps to February 28. Keyboard selection/focus and query
  navigation are exercised; the main DOM node remains mounted.

The raw closure file retains two probe failures for transparency:

- Its desktop-only chip/overflow probe reports zero rectangles at 390px.
  Those elements are intentionally hidden in compact mobile view; this is not
  evidence of a missing mobile task. Count indicators and the complete day
  agenda are the mobile presentation.
- Its combined console collection includes the deliberately injected HTTP 500
  from the adverse-state fixture. Real-data flows have no console errors.

Impeccable context/craft-floor and screenshot critique informed all rounds.
The URL detector cannot inspect this authenticated route without its session;
its unauthenticated output is NOT an accessibility or Calendar pass. Manual
browser geometry/color/focus checks are genuine DOM evidence, but not a full
automated accessibility audit.

### Executed Commands

| Gate | Result | Evidence |
| --- | --- | --- |
| Full frontend regression gate | 173/173 | `final-tests.log` |
| Final affected Calendar/model/lifecycle/access/route tests | 76/76 | `closure-scoped.log` |
| Frontend lint | 0 warnings/errors | `closure-lint.log` |
| Frontend production build | Pass | `closure-build.log` |
| API build to temporary output | 0 errors, 6 existing warnings | `closure-api-build.log` |
| Diff whitespace check | Pass | Terminal output |

The full 173-test run precedes the last ellipsis/accessibility and empty-state
refinements. The final 76-test affected run covers them, including the added
empty-state case. These overlapping counts must not be added together.

```powershell
npm --prefix GMind-Frontend run test -- --run
npm --prefix GMind-Frontend run test -- --run src/components/calendar/calendar-model.test.ts src/pages/calendar.test.tsx src/pages/calendar-lifecycle.test.tsx src/pages/workspace-access.test.tsx src/components/ProtectedRoute.test.tsx
npm --prefix GMind-Frontend run lint
npm --prefix GMind-Frontend run build
dotnet build GMind-Backend/GMind.API/GMind.API.csproj -o "$env:TEMP/gm-p4-redesign/api-build"
git diff --check
```

New regressions cover combined filter counts/reset, a real overflow click from
another day showing all six tasks, status semantics/no nested controls, List
switching, the single empty state, query navigation retaining the same guarded
DOM/draft, and revalidation when navigating to a different protected path.
Existing date boundaries, UTC+7 grouping, permission loss, stale requests and
safe return-path tests remain.

### Files And Boundaries

- `src/pages/Calendar.tsx`: workspace/header/filter/agenda composition.
- `src/components/calendar/CalendarMonth.tsx` and `calendar.css`: continuous grid,
  status chips, focus, responsive date/count presentation and scoped styles.
- `src/layouts/MainLayout.tsx`: optional fluid content width; other pages keep
  their existing width. Calendar navigation hint remains.
- `src/components/ProtectedRoute.tsx`: Calendar-only query key prevents remounts;
  session changes and navigation to another path still require validation.
- `src/components/ProtectedRoute.test.tsx`, `src/pages/calendar.test.tsx` and
  the existing Phase 4 model/lifecycle/access tests: regression coverage.
- The existing Phase 4 `TaskDetail.tsx` return navigation is retained.
  Dashboard/MiniCalendar, MyTasks, Groups, backend code and the date model are
  unchanged by this redesign.

Source paths above are relative to `GMind-Frontend/`. This document and the
Phase 4 handoff are the only documentation updates.

### Limitations And Run

- Personal active assigned-task deadlines only, using
  `GET /api/dashboard/my-tasks`. No separate events, completed history, event
  creation, drag/drop or unsupported APIs have been added.
- No dependency, schema, migration, secret or environment-variable change.
  Keep the existing README database setup; no reset or test-data cleanup needed.
- API warnings are the existing NU1510 package-pruning notice and NU1902/NU1903
  advisories for `System.Security.Cryptography.Pkcs` 9.0.11. Dependency remediation
  remains outside this Calendar redesign.
- Open `http://localhost:5173/calendar`. If local services stop, use the
  `GMind - API + Frontend` startup profile in `GMind.slnx`; API is at 5194.
  Direct Visual Studio GUI F5 was not independently verified.
- Branch: `feat/phase-4-calendar`. Uncommitted/unmerged; no Phase 5 work.
