# Phase 6 - Profile, Settings And Final Review

Status: implementation and verification in progress, not acceptance.
Mode: Operate. Preserve GMind's approved light/blue interface and inherited Segoe UI typography.
Branch: feat/phase-6-profile-settings.

## Authority And Decisions

- Canonical DOCX was extracted to `%TEMP%/gm-p6/ba-source.txt` and read in full,
  together with the implementation prompt. AUTH-04/05, UI-13, security rules and
  the entire E2E acceptance matrix remain the source of truth.
- Approved Phase 4/5 work was committed as 615c0ce and merged through PR #5:
  https://github.com/hiepndhe170796/GMind_App/pull/5
  Merge: 0c9c4a83a9ca801b28a79d36713e22a3d0e58db9.
  Local main, origin/main and the initial Phase 6 HEAD were synchronized.
- User confirmed separate /profile and /settings pages, reached from the account
  area at the bottom of the sidebar. Keep the five primary navigation entries.
- User authorized official NuGet/advisory access and compatible patch updates,
  not automatic major updates, stack changes or deployment.
- Phase 6 must remain uncommitted/unmerged until explicit review and approval.

## Existing Capability Boundaries

GET /api/me returns id, displayName, email and avatarUrl. PATCH /api/me updates
displayName and avatarUrl for the authenticated claim identity. PATCH
/api/me/password accepts currentPassword, newPassword and confirmPassword.
There is no email-change verification API, avatar upload API, user-facing
notification-preferences API or device/session-list API. A preference entity
alone does not make its controls functional.

Email is read-only. Avatar management uses an optional HTTP(S) image URL with
initials fallback, not an invented upload. URL length/format can be validated;
remote-image MIME/byte-size limits are not provided by the existing contract.
Missing AUTH-05 and NOT-04 capabilities remain explicit acceptance gaps, not
silently removed requirements or disabled pretend controls.

## Direction Contract

THESIS: a compact account workspace where a student understands what is saved,
what is editable and what changing a password does. No dashboard statistics,
decorative account cards or invented switches.

OWN-WORLD: inherit actual tailwind.config.js colors, index.css Segoe UI stack, existing
buttons/input grammar and MainLayout. Older design-tokens.md is not authority
to reintroduce Inter/purple into approved screens.

STORY: enter from the account footer, edit supported identity fields, save or
cancel, then see the same saved identity throughout GMind. Security settings
explain that a successful password change revokes sessions and needs sign-in.

FIRST VIEWPORT: standard application shell; 24px page title and brief subtitle;
two native page-navigation links; one white form panel. Profile leads with
saved avatar/name/email, followed by name and URL inputs, then save/cancel.
Settings leads with the password policy and three masked password fields.

FORM: ordinary extension of the pinned application world. Native links, forms,
labels and buttons; one column on mobile. The signature interaction is a real
save immediately updating the identity in the persistent application chrome
without losing the session or relying on a successful follow-up GET.

FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its
provenance. This extension does not replace the established visual world.

## Implementation Decisions

- Reuse ProtectedRoute's server-validated session bootstrap and its loading,
  failure/retry and logged-out behavior; do not make a duplicate profile GET.
- PATCH success updates the existing session user through updateSessionUser,
  preserving session id and token fields. Late responses from another session
  must not overwrite data or navigate the current user.
- Profile cancel restores the latest saved values. A failed save retains the
  draft; pending operations serialize submissions and disable competing edits.
- Avatar URLs: absolute HTTP(S), host required, no embedded credentials/control
  characters, maximum 500; null removes. Never fetch every partial keystroke.
- Name: trimmed, required, maximum 100. Do not invent global roles, verification
  badges or account dates absent from the DTO.
- Passwords remain masked by default, have explicit visibility controls and
  current-password/new-password autocomplete, and are never persisted or logged.
- Success clears only the captured local session and returns to Login with a
  password-changed notice, not a misleading expired-session message.

## Narrow Security Corrections

Current password mismatch currently throws 401, which the existing authenticated
Axios interceptor refreshes/replays and then treats as an invalid session.
Change this business validation failure to 400 while preserving real JWT 401
handling and every permission rule.

Authenticated password change currently revokes refresh/access sessions but
leaves a prior unexpired password-reset token usable. Clear reset token and
expiry in the same save. The baseline diff establishes the old implementation;
new tests verify token rejection afterwards. Red-before-fix was not executed
and is not claimed.

Microsoft advisories GHSA-846f-f764-76mx and GHSA-2fmv-rv2c-59x7 list Pkcs
9.0.0-9.0.20 as affected and 9.0.21 as patched. Use a direct Infrastructure
9.0.21 security pin for the vulnerable 9.0.11 transitive dependency, without
upgrading major versions. Check the restored vulnerability JSON, not just the
command exit code.

https://github.com/dotnet/runtime/security/advisories/GHSA-846f-f764-76mx
https://github.com/dotnet/runtime/security/advisories/GHSA-2fmv-rv2c-59x7
https://www.nuget.org/packages/System.Security.Cryptography.Pkcs/9.0.21

## Verification Plan

- Targeted frontend account/service/auth/guard tests and backend account,
  reset-token and session authorization tests before the final full-suite gate.
- Real API/database profile save, reload, avatar remove/fallback, cancel,
  validation, password mismatch, password change, revoked credentials and
  sign-in with the new password on isolated test accounts only.
- Profile/Settings visual refinement at 1440, 768 and 390, then all major
  authenticated/public surfaces at 1440, 1920, 768 and 390.
- No JSON API substitutes outside unit tests. Delaying/aborting a real request
  is allowed to exercise recovery; classify its expected errors separately.
- Never record passwords, tokens, Authorization headers, auth response bodies
  or password-reset URL query/fragments. Screenshots use empty/masked fields.
- Preserve approved pages; audit findings need rendered/source evidence before
  fixes. Final scoring/acceptance judgments remain separate from raw collection.

Baseline: `%TEMP%/gm-p6/pre-phase6`, baseline screenshots and base-events.json.
API :5194 and Vite :5173 were ready; keep existing runtime processes unless code
requires restarting the owned API. No schema change or database reset is planned.

## Application Audit Fixes

- `ProtectedRoute` validation scope is `{ sessionId, pathname, attempt }`, so
  query/hash-only filter changes keep the page mounted (focus kept, no repeated
  requests); real path, session or retry changes still revalidate.
- Dashboard/MyTasks use `ResponsiveFilters`: search stays visible, other filters
  collapse behind a 44px `Bộ lọc (N)` toggle below `md`.
- Long task titles clamp to two lines (conflicting `block` removed) with the full
  title in `title`; GroupDetail header/member actions wrap and align on mobile.
- Frontend `follow-redirects` (via axios) pinned to 1.16.2 through `overrides`
  for GHSA-mrwp-f3q8-3g9p (1.16.3 was under 7 days old and not used).

## Final Verification (2026-11-09)

| Check | Result |
|---|---|
| `npm --prefix GMind-Frontend run lint` | 0 warnings/errors |
| `npm --prefix GMind-Frontend run test -- --run` | 273/273, 21 files |
| `npm --prefix GMind-Frontend run build` | pass |
| `dotnet test GMind-Backend/GMind.Tests/GMind.Tests.csproj` | 89/89 |
| `dotnet build GMind-Backend/GMind.API` | 0 errors, 2 existing NU1510 warnings |
| `dotnet list package --vulnerable --include-transitive` (API, Infrastructure) | none |
| `npm --prefix GMind-Frontend audit --omit=dev` | 0 vulnerabilities |
| `git diff --check` | clean |

Browser evidence (Edge via Playwright, real API/database, isolated accounts):
`%TEMP%/gm-p6/r0-*`, `r1-*`, `r2-*` (Profile/Settings), `e2e-*`, `audit-*`,
`r3-*` and `r4-L-group-*` at 1440, 1920, 768 and 390px; no console errors in
the final captures and no horizontal overflow at the measured widths.

Known limitations: no email change, avatar upload, reminder preferences or
device/session list (no backend support); avatar is an optional HTTP(S) URL with
initials fallback.
