---
title: "feat: Redesign dashboard around workflow runs"
type: feat
status: draft
date: 2026-07-12
origin: user design review inspired by vllm-dashboard
adr: docs/adr/007-run-attempt-overview-read-model.md
---

# Plan: Run-Centric Dashboard Redesign

## Outcome

Redesign the homepage primary area to follow the information hierarchy of `vllm-dashboard`: compact top navigation and filters, a dominant run-duration chart, then a paginated runs table. Preserve the existing PR/workflow/job analysis sections below this new primary view.

This is an information-architecture reference, not a code or visual clone. Action Insight keeps its own data model, tracked repository rules, metrics, and detailed analysis capabilities.

## Why Both a Plan and an ADR

This plan owns product behavior, layout, implementation slices, and acceptance criteria. ADR-007 separately records the durable cross-module decision to introduce an attempt-scoped Run Overview read model and paginated API contract. Theme colors, component placement, tooltip formatting, and responsive styling remain in this plan because they are reversible UI decisions rather than architecture.

## Confirmed Product Decisions

### Page Hierarchy

From top to bottom:

1. Header with product identity, project selector, and light/dark theme toggle.
2. Filter row with date range and workflow selector.
3. Run duration chart covering all matching runs in the selected period.
4. Paginated runs table.
5. Existing repository, PR, workflow, job, step, timeline, and cluster analysis sections, retained below the new primary view.

The top controls should be compact and visually aligned with `vllm-dashboard`, while preserving the established Action Insight visual language and Tailwind implementation.

### Project Selection

- “Project” means an existing tracked/readable GitHub repository, not a new database entity.
- Reuse the current repository source and `owner` / `repo` URL state.
- The selector is a dropdown in the top area.
- Changing project refreshes chart and table data and resets table page to 1.
- Existing lower analysis sections follow the same selected repository.

### Workflow Filtering

- Default selection is all workflows.
- Options are scoped to the selected project and available date-range data.
- Workflow identity is `workflowFile` basename plus optional `workflowRef`, following ADR-005.
- Display labels should make refs distinguishable when the same file appears on multiple refs.
- Changing workflow resets table page to 1.
- Do not filter by mutable workflow display name.

### Date Range

- Reuse the existing preset and custom date-range behavior unless implementation review finds a concrete incompatibility.
- The selected range applies to both chart and table.
- Changing the range resets table page to 1.
- Start and end dates are inclusive and represented in URL state.

## Run Duration Chart

### Data Population

- One bar represents one workflow run attempt.
- Reruns remain separate bars even though no attempt field is shown in the table.
- The chart includes all runs matching project, workflow, and date filters; table pagination does not limit it.
- X-axis order is chronological, oldest to newest.
- Y-axis represents duration for each individual run, not a daily aggregate.

### Stacked Timing

Each bar is stacked from:

- Queue: amber `#f59e0b`
- Execution: blue `#2563eb`

Timing semantics come from persisted `workflow_attempts` values as defined by ADR-007. The chart must distinguish unavailable timing from a measured zero and show a clear empty state when no runs match.

### Responsive Density

- The chart uses the available container width and does not introduce horizontal scrolling.
- Bar width shrinks as the number of runs grows; very large result sets may render as narrow lines.
- Maintain a small minimum visible width where practical, but do not drop, sample, group, or aggregate runs silently.
- Axis labels may be thinned independently from bars to avoid unreadable text.
- Mobile layout keeps the chart usable without forcing a desktop-width canvas.

### Tooltip and Navigation

Hovering or keyboard-focusing a bar shows:

- run id/number
- workflow file and ref when available
- queue duration
- execution duration
- total duration
- status/conclusion
- PR number, or `-` when absent

Clicking a bar opens the corresponding GitHub Actions run URL. The interaction must be keyboard accessible and must not activate when no valid URL exists.

## Runs Table

### Columns

The first implementation should include:

- Run
- Workflow
- PR
- Status
- Queue
- Execution
- Total
- Created

The table does not include an attempt column. PR displays `#<number>` when available and `-` otherwise. Run and PR values should link to their external or existing detail targets when a valid target exists.

### Ordering and Pagination

- Sort newest to oldest.
- Server-side pagination is required.
- Supported page sizes are 20, 50, and 100.
- Default page size is 20.
- Show current page, total pages or total rows, previous/next controls, and page-size selection.
- Disable impossible navigation states.
- Preserve `page` and `pageSize` in the URL.
- Reset `page` to 1 when project, workflow, or date changes.

## Theme

- Support explicit light and dark theme switching.
- Default to the operating-system preference on first visit.
- Persist an explicit user choice in `localStorage`.
- Apply the resolved theme before or at initial paint to avoid a visible flash where practical.
- All new Tailwind styles must include dark-mode equivalents.
- Charts, tooltips, focus states, empty states, loading states, and table borders must remain legible in both themes.

## URL State

The primary view is shareable and reload-safe. Preserve these parameters:

- `owner`
- `repo`
- existing date-range parameters
- `workflowFile`
- `workflowRef` when applicable
- `page`
- `pageSize`

When updating one parameter, retain unrelated supported parameters. Normalize invalid repository, workflow, date, page, and page-size values without leaving the UI and URL in contradictory states.

## Loading, Empty, and Error States

- Project list loading must not render a misleading default project.
- Chart and table may load independently, but controls should not trigger duplicate requests for identical state.
- Chart loading should reserve enough height to avoid large layout shifts.
- No matching runs: show a single clear empty-state message and an obvious way to broaden filters.
- Table page with no rows after filters/count change: normalize the page or return to page 1.
- API errors identify the affected project and provide retry behavior without clearing valid filter state.
- Existing lower analysis sections keep their current loading and empty-state behavior unless directly affected by shared filter changes.

## Data and API Contract

Implement ADR-007 with two lightweight operations over a shared filter contract:

```text
project + inclusive date range + optional workflow file/ref
  -> chart overview: all matching attempts, oldest first
  -> table page: matching attempts, newest first, total count
```

The frontend must not fetch jobs or steps for the chart or table. Existing detailed fetches remain responsible for lower analysis sections and drill-down views.

### Environment-Specific Read Backend

- Local development reads the per-repository SQLite files produced by local ETL under `etl/data/<owner>-<repo>.db`.
- Production deployment reads Turso.
- Introduce a server-only, repository-scoped database provider shared by Run Overview and the retained dashboard reads that must follow the selected project.
- Use explicit backend configuration such as `DASHBOARD_DATA_SOURCE=sqlite|turso`; default local development to SQLite and production to Turso, with explicit configuration taking precedence.
- Do not use `ENABLE_SQLITE_FALLBACK` for frontend selection; it remains an ETL recovery switch.
- Do not silently fail over between backends. Missing local files, LFS pointer stubs, missing Turso credentials, and schema incompatibility must return actionable errors.
- Keep SQL and row mapping shared wherever SQLite/libSQL compatibility permits. Isolate differences in client creation and repository resolution.
- Ensure the repository selector only offers a local project when its SQLite database is readable, while production continues to use the configured tracked/readable Turso repository source.

No Turso credential, backend selector, or local filesystem path may be sent to the browser.

PR number is optional. If one attempt links to multiple PR artifacts, implementation must choose and test a deterministic display rule, preferably the lowest linked PR number unless the existing domain model provides a stronger canonical association.

## Component Boundaries

The implementation should reduce pressure on the existing large `DashboardClient` rather than adding all new behavior directly to it.

Expected boundaries:

- Shared Run Overview types with no server-only imports.
- Server query functions for chart and paginated rows.
- API request validation and response serialization.
- Client API helpers.
- A client-owned primary Run Overview component for filters, chart, table, pagination, and local interaction state.
- A small theme controller/toggle with persisted preference.
- Existing `DashboardClient` remains the composition point for retained lower sections until a separate refactor is justified.

Exact filenames may change during implementation, but server data access, transport types, and UI state should remain separable and testable.

## Implementation Units

- [x] **Unit 0: Protect the working state and establish the feature branch**

  - Review the existing uncommitted `src/lib/data-fetcher.ts` draft before editing.
  - Do not discard user changes.
  - Before any commit, synchronize `main` as allowed by the environment and create a new `feat/run-centric-dashboard`-style branch.
  - Keep documentation and implementation in the same PR unless the user requests a docs-only PR.

- [x] **Unit 1: Define and test the Run Overview read model**

  - Add shared chart-point and table-page types.
  - Query `workflow_attempts` and `runs` at `run_id + run_attempt` granularity.
  - Resolve an optional PR number without duplicating attempts.
  - Support inclusive date and workflow file/ref filters.
  - Test reruns, missing timing, missing PR, multiple PR links, ordering, and empty data.

- [x] **Unit 1A: Add the repository-scoped database provider**

  - Add a server-only backend selector for local SQLite and production Turso.
  - Resolve local repositories to validated `etl/data/<owner>-<repo>.db` paths without allowing path traversal.
  - Detect missing files and Git LFS pointer stubs before querying.
  - Keep repository lookup differences out of the shared read-model SQL.
  - Add provider tests for explicit selection, environment defaults, invalid configuration, missing credentials/files, and repository path validation.
  - Run shared query contract tests against both SQLite and a Turso/libSQL-compatible client.

- [x] **Unit 2: Add validated API operations**

  - Add chart overview and table page actions to the existing same-origin data API or introduce focused routes if that yields clearer validation.
  - Validate tracked repository membership, dates, workflow keys, page, and supported page sizes.
  - Add route tests for malformed and boundary inputs.

- [x] **Unit 3: Add client API helpers and URL state**

  - Add typed request helpers without importing server-only modules into client bundles.
  - Extend URL synchronization to preserve project, date, workflow, page, and page size.
  - Reset page on filter changes and prevent stale responses from replacing newer state.

- [x] **Unit 4: Build the primary chart**

  - Render one responsive stacked bar per attempt.
  - Add tooltip/focus details and click-through behavior.
  - Implement loading, empty, error, high-density, and mobile states.
  - Verify accessibility semantics and keyboard navigation.

- [x] **Unit 5: Build the paginated runs table**

  - Render the agreed columns without attempt.
  - Add 20/50/100 page-size selection and navigation controls.
  - Show PR number or `-`.
  - Verify newest-first ordering and page normalization.

- [x] **Unit 6: Recompose the homepage**

  - Replace the current top information hierarchy with project selector, filters, chart, and runs table.
  - Preserve existing analysis sections below.
  - Ensure shared project/date state does not regress current PR and workflow drill-down behavior.

- [x] **Unit 7: Add light/dark theme switching**

  - Use system preference by default and persist explicit choice.
  - Apply both themes to all new UI states and chart colors.
  - Check initial-paint behavior and hydration safety.

- [x] **Unit 8: Regression and acceptance verification**

  - Add data-fetcher, API, component, URL-state, pagination, theme, and interaction tests.
  - Run `npm run lint` and `npm test`.
  - Run the production build or type-check command used by CI if it is not already covered.
  - Manually verify desktop and mobile widths in both themes with sparse and dense run data.

## Acceptance Criteria

- [ ] Top project dropdown selects an existing tracked/readable repository.
- [ ] Local development reads the selected project's local ETL SQLite database.
- [ ] Production reads Turso and does not access repository-local SQLite files.
- [ ] Backend failures are explicit; no silent SQLite/Turso fallback occurs.
- [ ] Workflow filter defaults to all and supports file/ref filtering for the selected project.
- [ ] Chart renders one oldest-to-newest stacked bar per matching run attempt.
- [ ] Queue and execution are visually distinct and use the agreed amber/blue colors.
- [ ] Dense periods fit the available width without horizontal scrolling or silent aggregation.
- [ ] Tooltip/focus content includes timing, run, status, workflow, and PR or `-`.
- [ ] Clicking or keyboard-activating a bar opens the corresponding GitHub run.
- [ ] Runs table is newest-first and paginates at 20, 50, or 100 rows, defaulting to 20.
- [ ] Table contains no attempt column and shows PR number or `-`.
- [ ] Project, date, workflow, page, and page size survive reload through URL state.
- [ ] Filter changes reset the table to page 1.
- [ ] Light and dark themes both work; explicit preference persists.
- [ ] Loading, empty, error, missing timing, and missing PR states are clear.
- [ ] Existing lower analysis sections remain available and functional.
- [ ] Relevant automated tests, `npm run lint`, and `npm test` pass before commit.

## Risks and Mitigations

- **Large chart payloads**: keep each point lightweight, avoid nested jobs/steps, and measure realistic maximum periods before considering explicit caps or virtualization.
- **Chart density and accessibility**: thin labels rather than data, provide focusable bars or an equivalent navigable summary, and retain the table as an exact textual representation.
- **Timing ambiguity**: use persisted attempt metrics and visibly distinguish missing values from zero.
- **Duplicate PR joins**: aggregate or select PR association deterministically before joining to the attempt row.
- **Stale async responses**: key requests by the complete filter state and ignore/cancel superseded requests.
- **Large component growth**: isolate the new primary view instead of extending `DashboardClient` with another monolithic block.
- **Existing draft query**: the current uncommitted SQL places joins after a `WHERE` fragment and must be reviewed rather than treated as production-ready.
- **SQLite/Turso drift**: use one query contract and run parity tests against both backends; fail clearly on schema mismatch.
- **LFS pointer files**: validate the SQLite file header before opening and explain how to fetch/materialize the database.

## Non-Goals

- Replacing or deleting existing PR/workflow/job/step analysis.
- Introducing a new project table or project-management UI.
- Grouping chart points by day, week, workflow name, or run id.
- Displaying or filtering by run attempt number in the first UI.
- Horizontal scrolling, silent sampling, or aggregation of dense chart data.
- Editing tracked repository/workflow configuration from the dashboard.
- Reproducing `vllm-dashboard` implementation details or persistence choices.
- Replicating or synchronizing local SQLite writes to Turso as part of a dashboard request.

## Documentation Impact

- ADR-007 must be accepted or revised with the implementation PR.
- ADR-004 is revised by this plan to distinguish local dashboard reads from ETL fallback behavior.
- README architecture/data model should be updated only when the new API/read path is implemented, not while this plan remains draft.
- The completed 2026-04-18 daily-timeseries plan remains historical context; this redesign supersedes its homepage information hierarchy but does not erase its delivered functionality from retained lower sections.

## Related Documents

- [ADR-005: Workflow File and Attempt Scoped Collection](../adr/005-workflow-file-attempt-scoped-collection.md)
- [ADR-004: SQLite Database Files Stored via Git LFS](../adr/004-sqlite-db-lfs-storage.md)
- [ADR-007: Run Attempt Overview Read Model](../adr/007-run-attempt-overview-read-model.md)
- [Completed overview timeseries plan](2026-04-18-001-feat-overview-timeseries-dashboard-plan.md)
- [Repository selection design](../superpowers/specs/2026-04-10-repo-selection-panel-design.md)
