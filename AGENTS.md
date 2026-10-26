# GMind — Instructions for AI Coding Agents

## 1. Read the source of truth first
- Before planning or changing code, read both source requirements in `docs/requirements/`:
  - `GMind_Business_Analysis_Specification_v1.0.docx`
  - `GMind_AI_Implementation_Prompt.txt`
- Preserve the meaning, terminology, and feature scope in those documents. Do not silently remove requirements.
- If the documents conflict, or if a business rule is undefined, record it in `docs/decisions/OPEN_QUESTIONS.md`, explain the impact, and choose a conservative, clearly documented assumption only when progress requires it.
- Treat requirements described as untested, uncertain, optional, or future-phase as needing explicit planning; do not claim they are implemented until working code and tests verify them.

## 2. Product and implementation goals
- Product: GMind, a group-project and task-management application for student teams.
- The BA proposes React + TypeScript for the frontend and ASP.NET Core Web API + Entity Framework Core + SQL Server for the backend/database by default. Confirm this against the repository and requirements before locking in the architecture. Do not change the stack without documenting the reason and trade-offs.
- Build real end-to-end functionality: UI -> API -> validation/authorization -> database. Do not replace required functionality with static screens, hard-coded sample data, TODO placeholders, or fake API responses outside tests/demo fixtures.
- Keep the interface responsive, accessible, consistent, and usable on desktop and mobile. Include loading, empty, error, validation, and success states.

## 3. Engineering rules
- Inspect the existing repository, README, architecture, dependency versions, and tests before modifying anything. Preserve working code and established patterns unless a change is justified.
- Prefer small, cohesive changes and reusable components/services. Avoid unnecessary rewrites, speculative abstractions, and duplicated business logic.
- Use database migrations for schema changes. Never delete or reset real user data as a shortcut.
- Validate all user input on the server. Enforce role and resource authorization on the server, not only by hiding UI controls. A Member must not gain Leader permissions by modifying a request.
- Use secure password handling and established authentication practices. Do not expose secrets, tokens, passwords, connection strings, or private user data in logs or source control.
- Store secrets in environment variables or the platform's secret manager. Keep `.env`, local secret files, and real credentials out of Git; maintain an appropriate `.gitignore`.
- Use UTC for stored timestamps and handle display time zones consistently. Clearly define date/deadline comparisons and test boundary cases.
- Add useful logging and user-safe error messages. Do not swallow exceptions silently.
- Do not add paid services, third-party integrations, or external APIs without documenting the dependency, configuration, cost, and fallback behavior.

## 4. Business-rule discipline
- Follow the Leader/Member permission matrix defined by the BA.
- Implement task status transitions and the Submit -> Review -> Approve -> Complete flow consistently across UI, API, and database.
- Marketplace actions (Need Help, Transfer, Swap) must follow the specified approval process; do not reassign ownership or alter contribution points without an authorized, recorded action.
- Calculate progress and contribution points from documented rules. If the formula is not defined, document the proposed formula and mark it as an assumption rather than presenting it as an approved requirement.
- Notifications, deadline reminders, stale-task warnings, and file operations must be implemented securely and must respect user/group/project access controls.
- Maintain activity/history records for important business changes where required.

## 5. Git workflow and boundaries
- Never commit directly to `main`/the default branch. Work on a focused feature branch and open a pull request for review.
- Do not merge a pull request, deploy to production, delete branches/data, or perform destructive operations without explicit approval.
- Before editing, summarize the intended scope and list files/modules likely to change for substantial tasks.
- Do not overwrite user changes. Inspect `git status` and the diff before making or reverting changes.

## 6. Required verification before marking work complete
For each milestone:
1. Run the relevant formatter/linter and static checks.
2. Build the frontend and backend with the repository's actual commands.
3. Run unit and integration tests; add tests for new behavior and bug fixes.
4. Test authorization, invalid input, empty states, failures, and deadline/status edge cases where relevant.
5. Verify database migrations and document how to initialize a clean development database.
6. For UI changes, verify responsive layouts and the important user flow; report any visual/browser checks that could not be performed.
7. Review the final diff for secrets, accidental deletions, unrelated changes, and unfinished placeholders.

Never claim a build, test, database connection, or browser flow succeeded unless the command or check was actually executed and its result inspected. If something cannot be run in the environment, state the exact blocker and provide reproducible commands.

## 7. Delivery format
At the end of each milestone, report:
- What changed and which requirements it satisfies.
- Files/modules changed.
- Commands actually run and their pass/fail results.
- Tests added and test coverage limitations.
- Known bugs, assumptions, unfinished items, and required human decisions.
- How to run the application locally, including environment variables and database setup, without exposing secrets.

Work incrementally. Do not attempt to implement the entire product in one enormous change.

## 8. Verified commands (A0)
- Backend dev run: `dotnet run --project GMind-Backend/GMind.API --launch-profile http` (API at http://localhost:5194; HTTPS redirect is disabled in Development only).
- Health: `GET /api/health/live`, `GET /api/health/ready` (200 only when SQL Server connects); via frontend proxy `http://localhost:5173/api/health/ready`.
- Backend tests: `dotnet test GMind-Backend/GMind.Tests/GMind.Tests.csproj --filter FullyQualifiedName~<TestClass>`.
- Frontend: `npm --prefix GMind-Frontend run dev|lint|build`; unit tests `npm --prefix GMind-Frontend run test -- --run <file>`.
- Frontend project build: `dotnet build GMind-Frontend/GMind-Frontend.esproj` (JS SDK runs `npm run build` -> `dist/`).
- Visual Studio configuration: open `GMind.slnx`, select startup profile `GMind - API + Frontend` (`GMind.slnLaunch`) for API (`http`) + Vite and http://localhost:5173. Project builds and proxy/login were verified; the actual GUI Run/F5 flow still needs confirmation.
