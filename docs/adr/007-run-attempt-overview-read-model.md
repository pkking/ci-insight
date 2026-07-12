# ADR-007: Run Attempt Overview Read Model

**Status**: Proposed  
**Date**: 2026-07-12  
**Context**: Run-centric dashboard redesign

## Context

The current homepage derives repository and PR-level aggregates and then renders daily trends. The redesigned primary view needs a different access pattern: one chart point per workflow run attempt in a selected repository and date range, plus a newest-first paginated table over the same filtered population.

The storage model already separates stable GitHub run metadata in `runs` from execution attempts in `workflow_attempts`, keyed by `run_id + run_attempt` under ADR-005. It also stores attempt-level queue, runtime, total duration, workflow file/ref, status, and conclusion. PR associations are represented by `pr_workflow_attempts` and `pr_metrics`.

Loading the existing fully nested `Run[]` model for this view would fetch jobs and steps that the chart and table do not need. Client-side pagination would also require transferring every row before showing the first table page.

## Decision

Add a dedicated, server-side Run Overview read model sourced from `workflow_attempts` joined to `runs`, with an optional PR number resolved through `pr_workflow_attempts` and `pr_metrics`.

Put the read model behind a repository-scoped database provider rather than calling a Turso-specific client directly. The provider resolves the backend as follows:

- Local development: open `etl/data/<owner>-<repo>.db` through libSQL's local `file:` transport.
- Production: use the configured remote Turso client.

Backend selection must be explicit and server-only, using a configuration such as `DASHBOARD_DATA_SOURCE=sqlite|turso`. Local development may default to `sqlite` and production may default to `turso`, but an explicit setting takes precedence. Production must reject `sqlite` selection unless an intentional deployment mode is added later. A missing database, Git LFS pointer stub, missing Turso credentials, or schema mismatch produces a clear error; there is no silent cross-backend fallback.

The execution identity is `run_id + run_attempt`. Reruns are separate samples even though the UI does not display an attempt column. The read model exposes at least:

- run id and display name
- workflow file basename and optional workflow ref
- status and conclusion
- creation timestamp
- queue, execution, and total duration in seconds
- GitHub run URL
- PR number or `null`

Provide two server operations over the same filter contract:

1. An overview query returns all matching lightweight points for the chart, ordered oldest to newest.
2. A page query returns matching lightweight rows ordered newest to oldest, with total count and page metadata.

Both operations accept repository, inclusive date range, and optional workflow file/ref. Repository choices continue to come from the existing tracked/readable repository source. Workflow identity follows ADR-005: file basename plus optional ref, never workflow display name.

The SQL and row mapping are shared across both backends. Backend-specific code is limited to client creation, repository-to-database resolution, and connection validation. Because local SQLite is split per repository while Turso may use a repository registry, the provider owns that difference and exposes a repository-scoped query client to the read model.

The API validates repository membership, ISO date inputs, workflow filters, and page size. Supported page sizes are `20`, `50`, and `100`; the default is `20`. A page outside the valid range returns an empty page or a normalized valid page consistently, as selected during implementation and covered by tests.

## Duration Semantics

The read model uses the persisted attempt timing fields as authoritative:

- `queueSeconds`: run creation until the earliest job start
- `executionSeconds`: earliest job start until the latest job completion
- `totalSeconds`: persisted attempt total; if absent, use the sum of available queue and execution values

Missing components remain distinguishable from measured zero in the server model. The UI may render a partial bar for available timing and must not imply that missing timing is a measured zero. Negative or otherwise invalid timing samples are clamped or excluded according to the existing ETL timing rules, not recomputed differently in the browser.

## Rationale

- The view is attempt-centric, so it must not collapse reruns by `run_id`.
- A small purpose-built read model avoids loading nested jobs and steps for every chart point.
- Server-side table pagination bounds response size and keeps total counts authoritative.
- Separate chart and page operations allow the chart to represent the whole selected period while the table remains paginated.
- Reusing persisted timing values keeps the dashboard aligned with ETL and PR artifact calculations.
- A repository-scoped provider lets local UI development read locally collected SQLite data while production reads Turso without duplicating dashboard query logic.

## Consequences

### Positive

- Chart and table share one filter vocabulary and one execution identity.
- Reruns remain visible as separate CI cost and latency samples.
- Table payloads remain bounded at 20, 50, or 100 rows.
- Existing PR, workflow, job, and step analysis can remain below the new primary view without changing its data contract.

### Negative

- The chart operation can still return many lightweight rows for a long or busy period.
- Two requests are required for the primary view unless the API later adds a combined response.
- Optional PR lookup adds join/subquery cost and requires explicit handling of runs associated with multiple PR artifacts.
- SQLite and Turso schema/query behavior must remain compatible and be tested through the same read-model contract.

## Constraints

- Do not fetch jobs or steps for the Run Overview chart or table.
- Do not deduplicate attempts that share a run id.
- Do not use workflow display name as a filter key.
- Keep chart ordering oldest-first and table ordering newest-first.
- Reset table page to 1 when repository, workflow, or date range changes.
- Preserve repository, workflow, date range, page, and page size in URL state.
- Keep data-source configuration on the server; never expose Turso credentials or local filesystem paths to the browser.
- Do not silently fall back between SQLite and Turso.
- Validate local database files before opening them so Git LFS pointer stubs produce an actionable error.
- Add query and API tests for empty data, reruns, missing PRs, missing timing, workflow filtering, ordering, and pagination boundaries.
- Run the same read-model contract tests against local SQLite and a Turso/libSQL-compatible test client.

## Alternatives Considered

1. **Reuse the existing nested `fetchRuns` response** - rejected because it transfers and constructs job/step detail unnecessary to the primary view.
2. **Paginate only in the browser** - rejected because the full table payload grows with the selected period and makes total-count behavior client-dependent.
3. **Use one paginated response for both chart and table** - rejected because the chart must cover all runs in the period, not only the visible table page.
4. **Aggregate by day** - rejected because the requested y-axis sample is each individual run attempt.
5. **Collapse reruns by run id** - rejected because it hides real queue and execution cost and conflicts with ADR-005.

## Related

- [ADR-005](005-workflow-file-attempt-scoped-collection.md)
- [ADR-004](004-sqlite-db-lfs-storage.md)
- [Run-centric dashboard redesign plan](../plans/2026-07-12-001-feat-run-centric-dashboard-redesign-plan.md)
