# Phase 4 - Calendar

Mode: Operate. Status: redesigned and verified; awaiting user review.

Current redesign contract and new evidence: `calendar-redesign.md`.
The results below describe the previous implementation, not approval of its
visual quality. The redesign results and current test evidence are in
`calendar-redesign.md`.

## Scope And Verified Contract

- Keep the approved light GMind system: pale slate canvas, white surfaces,
  blue active/primary controls, existing UI type, 24px page title, 44px controls.
- Use only `GET /api/dashboard/my-tasks`, as the incumbent Calendar does.
  This returns active, assigned-to-me tasks in active memberships, excluding
  completed tasks and archived projects/groups. Do not change that API or the
  Dashboard/MyTasks semantics to populate Calendar.
- There is no independent event API, event creation, drag/drop rescheduling,
  completed-task history, or week scheduling contract. Do not fabricate them.
- Display instants with the existing `presentation.ts` Asia/Ho_Chi_Minh helpers.
  A timestamp without an explicit offset is UTC, matching the API convention.
  Calendar arithmetic uses civil date keys in UTC, never the browser timezone.
- Monday-first six-week month, today's marker, selected-day treatment, keyboard
  date navigation and deadline dots follow the approved MiniCalendar.
  Preserve the MiniCalendar implementation and its existing tests.

## Direction Contract

THESIS: See the month, choose a day, and read the actual deadlines without
forcing task titles into phone-sized calendar cells.

FIRST VIEWPORT: Page title and scope/timezone explanation; a restrained filter
toolbar; month navigation and a Month/List view control; the calendar as the
primary work surface. No ornamental statistics or unrelated group widgets.

LAYOUT: Desktop month grid with at most two task previews per date and a
selected-day agenda alongside; compact date/count grid on small screens with
the full selected-day list below. The List view groups the month's tasks by
deadline date. Undated work is a separate disclosure, never a fake date/event.

SIGNATURE INTERACTION: Selecting any date, including an adjacent-month date,
updates the same selected-day agenda and shareable URL. Opening a task and
returning restores month, date, view and committed filters, with Calendar active
in the sidebar.

CONTROLS: Today, previous/next month, a labeled month input, Month/List, search
committed only on Enter/Tìm, project/status/priority filters, overdue-only and
clear filters. Typing never resets the URL or visible calendar per keystroke.
Filters use only available fields and retain the true task status alongside
the independently derived overdue label.

STATES: Structural skeleton, no assigned work, no dated work, empty month,
no matching filters, empty selected day, error/retry, refresh-in-progress and
stale-on-refresh-failure warning. 403/404 clears private data; route/session
changes and late responses cannot restore stale work. Refresh after returning
from TaskDetail must reflect status/completion and changed deadlines.

## Implementation Boundary

- Calendar page, scoped calendar CSS and focused calendar date/model/view
  components/tests.
- MainLayout/TaskDetail only for safe `/calendar[?...]` return navigation.
- Reuse existing Card/Button/Badge/Icon and date/deadline presentation helpers.
- No new dependency, API, migration, environment variable or Phase 5 work.

## Required Verification

- Date grouping across UTC+7 midnight; offsetless UTC; leap day; Monday-first
  42 cells; Jan31 to Feb clamping; Dec/Jan transitions; invalid URL values.
- Month/Today/date input/date selection; adjacent-month dates; arrows,
  Home/End/PageUp/PageDown with one roving date tab stop and visible focus.
- Combined filters, draft search without URL churn/refetch, reset, dense-day
  overflow and complete agenda; undated tasks never appear in date cells.
- Calendar -> TaskDetail -> explicit return and browser Back with preserved
  state and Calendar navigation; safe return URL rejection tests.
- Loading/empty/error/retry, retained data on ordinary refresh failure, private
  clearing on 403/404, stale requests after route/user change, latest reload.
- Real API task links and data comparison; adverse-state fixtures labeled
  test-only. No mutations of existing user data.
- Render 1440/768/390/320px, long titles/project names, dense dates, keyboard,
  no page overflow, and the same calendar dates in different browser timezones.
- One final regression gate for frontend and relevant backend authorization,
  builds/lint, diff review, one Impeccable detector scan after UI is finished.

## Results

Phase 3 and the approved search fix merged through PR #4 (`8b6f00e`).
Phase 4 stays uncommitted on `feat/phase-4-calendar`. No Phase 5 work.

### Implemented

- Responsive Month/List views, selected-day agenda, Today/month navigation,
  strict month input, Monday-first grid, adjacent-month counts and safe year
  boundaries. Date buttons have a 44px minimum height; keyboard movement updates
  selection and actual focus. Task links and date buttons are siblings.
- Project filters use IDs, including projects with identical names. Search is
  applied on Enter/Tìm, not keystrokes; clear and Back/Forward synchronize it.
  Status, priority and overdue combine without additional API calls.
- True status/priority/deadline and full task titles are available in the agenda.
  Dense days show two previews plus an explicit overflow action; undated work
  has its own disclosure and does not acquire an invented calendar date.
- Structural loading, no assigned work, undated-only, empty month/day, no filter
  matches, initial error/retry and refresh failure are handled. A failed quiet
  refresh retains the last data with an honest warning; success clears it.
  403/404 clears task data and the draft. User changes invalidate old requests.
- Safe Calendar return navigation preserves month, selected date, view and all
  committed filters. TaskDetail keeps Calendar active in the sidebar.

### Files

- `GMind-Frontend/src/pages/Calendar.tsx`
- `GMind-Frontend/src/components/calendar/CalendarMonth.tsx`
- `GMind-Frontend/src/components/calendar/calendar-model.ts`
- `GMind-Frontend/src/components/calendar/calendar.css`
- `GMind-Frontend/src/components/calendar/calendar-model.test.ts`
- `GMind-Frontend/src/pages/calendar.test.tsx`
- `GMind-Frontend/src/pages/calendar-lifecycle.test.tsx`
- `GMind-Frontend/src/pages/workspace-access.test.tsx`
- `GMind-Frontend/src/layouts/MainLayout.tsx` (navigation hint only)
- `GMind-Frontend/src/pages/TaskDetail.tsx` (safe return navigation only)
- This handoff document. Dashboard/MiniCalendar and backend source are unchanged.

### Executed Gates

Evidence directory on the review machine: `%TEMP%\gm-p4`.

| Gate | Result | Retained log |
| --- | --- | --- |
| Full frontend suite at the regression gate | 156/156 | `final-frontend.log` |
| Final affected model/UI/lifecycle/access tests | 55/55 | `closure-tests.log` |
| Backend TaskAuthorizationTests | 23/23 | `final-backend.log` |
| Frontend lint | 0 warnings/errors | `closure-lint.log` |
| Frontend production build | Pass | `closure-build.log` |
| Backend API build to temporary output | 0 errors | `final-api-build.log` |
| `git diff --check` | Pass; normal LF/CRLF notices only | Terminal output |

The 156-test full run predates the final refinements and additional regression
cases; the final 55-test affected run covers them. Do not add these overlapping
counts or describe the full run as testing the newest cases.

Final affected test command:

```powershell
npm --prefix GMind-Frontend run test -- --run src/components/calendar/calendar-model.test.ts src/pages/calendar.test.tsx src/pages/calendar-lifecycle.test.tsx src/pages/workspace-access.test.tsx
```

### Browser Evidence

- `closure-e2e.json`: current Month and List at 1440/768/390/320px; no horizontal
  page overflow, no nested interactive elements, 44px date-button heights and
  search widths of 254/254/292/222px respectively. A selected non-today date
  has a distinct blue surface. Console errors: zero.
- `closure-real-{month,list}-{1440,768,390,320}.png`: final real API captures.
- `closure-fx-dense-{1440,768,390,320}.png`: clearly separate test-only fixtures,
  six tasks on one date and 400-character task/project names.
- `fx-{empty,undated-only,filtered-empty,error500,denied403}-390.png`: adverse
  states. Lifecycle tests additionally check loaded private data followed by
  403/404, real GET retry after 500, focus-load deduplication and old-user results.
- `fx-proof.json`: the same UTC boundary instant belongs to Jan 1 in both browser
  zones Asia/Ho_Chi_Minh and America/Los_Angeles, matching Vietnam display rules.
- The final real API journey uses the full month/date/view/project-ID/status/
  priority/search URL. Rendered task IDs match the API-filtered IDs. Opening
  TaskDetail, explicit return, browser Back and reload preserve the exact URL;
  Calendar remains active in the sidebar. No database writes were needed.
- Impeccable context, Operate/craft-floor and rendered review guided refinement.
  `detect-calendar.json` records the static detector's limitation: only regex
  rules ran on source files; element contrast/tiny-text rules did not. It is not
  evidence of a full DOM accessibility audit.

### Limits And Local Run

- Calendar remains a personal, active-task deadline view. The existing endpoint
  excludes completed work and archived projects/groups. It supplies no separate
  events, project-deadline feed, event creation, week scheduling or rescheduling.
- The preexisting Dashboard/MiniCalendar overflow at 320px was recorded in the
  baseline and left outside this phase; Calendar itself has no such overflow.
- Backend builds still warn about the preexisting vulnerable
  `System.Security.Cryptography.Pkcs` 9.0.11 dependency and package pruning.
  Dependencies were not changed in this UI phase.
- No migration, API, package, secret or environment variable was added. Existing
  database setup and credentials documented in README remain applicable.
- Open `GMind.slnx`, select `GMind - API + Frontend`, then run and open
  `http://localhost:5173/calendar`. API is `http://localhost:5194`; ready checks
  also work through `http://localhost:5173/api/health/ready`.
- Visual Studio GUI F5 itself remains unverified. Development processes can be
  reaped by the terminal session; restart the existing startup profile if needed.
