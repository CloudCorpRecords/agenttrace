# agenttrace — Build Report

MCP Rebuild 1000, Batch 19. Original program build from the
packages-100 plan (cluster C #29), built from the spec in
`~/workspace/mcp-rebuild-100/specs-batch19/agenttrace.md`
(read first). There is no external original; the tool surface
is the program's defined spec. Local build only — nothing
pushed or published.

Identity: repo `agenttrace`, npm `@reneturcios/agenttrace`,
MCP name `io.github.CloudCorpRecords/agenttrace`, version
`0.1.0`, bin `agenttrace` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json`, `server.json` (description "Summarize a
  supplied agent tool-call trace: per-tool stats, the error
  list, and totals." — 87 chars, verified by count; npm entry
  carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/agenttrace:0.1.0` carries **no**
  `version` field), `Dockerfile` (node:20-alpine two-stage,
  label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/agenttrace"`),
  `tsconfig.json` (byte-identical to the reference, verified
  by byte comparison), `.gitignore`, `LICENSE` (MIT,
  Copyright (c) 2026 Rene Turcios), `README.md` (fresh text),
  `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27),
  `package-lock.json` (Route 3, see below)
- `src/index.ts`, `src/cli.ts` (`summarize --input <args.json>`
  where the file holds the full arguments object, `mcp`,
  `--version`; exit 2 usage / 1 runtime error, argument
  validation before any file read), `src/mcp.ts`,
  `src/types.ts`, `src/agenttrace.ts` (core,
  `VERSION = "0.1.0"`, `summarizeTrace`, `formatPayload`)
- `test/agenttrace.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (publish-container `IMAGE = ghcr.io/cloudcorprecords/agenttrace`,
  smoke-test server-name assertion `agenttrace`; the other
  three workflows are byte-identical to the reference,
  verified by diff)

Plus the parity fixture at
`harness/fixtures/agenttrace-tools-original.json`, labelled
as a program spec from the packages-100 plan cluster C #29.

## Tools implemented (1)

- `summarize_trace` — arguments: `events` (array, required,
  at least 1 item). Each event item: `tool` (string,
  required, non-empty), `started_at_ms` (integer, required,
  >= 0), `duration_ms` (integer, required, >= 0), `status`
  (string, required, exactly "ok" or "error"), `error`
  (string, optional), `input_tokens` (integer, optional,
  >= 0, absent means 0), and `output_tokens` (integer,
  optional, >= 0, absent means 0). Required is exactly
  `["events"]` at the top level and `["tool",
  "started_at_ms", "duration_ms", "status"]` per item.

  Returns `{tools, errors, totals}`, where `tools` holds
  one `{tool, calls, errors, error_rate,
  total_duration_ms, avg_duration_ms, max_duration_ms,
  input_tokens, output_tokens}` (keys in that order) per
  distinct tool in first-appearance order; `errors` holds
  one `{index, tool, error}` per event whose status is
  "error", in input order, with `index` the event's
  0-based position and `error` echoing the event's error
  string verbatim or `null` when absent; and `totals` is
  `{total_events, distinct_tools, total_errors,
  overall_error_rate, total_duration_ms, wall_clock_ms,
  total_input_tokens, total_output_tokens}` in that key
  order.

  Pinned computations: `error_rate` is errors / calls
  rounded to 4 decimal places
  (Math.round(x * 10000) / 10000) and
  `overall_error_rate` uses the same rounding over the
  whole trace; `avg_duration_ms` is total_duration_ms /
  calls rounded with Math.round; `wall_clock_ms` is
  max(started_at_ms + duration_ms) minus
  min(started_at_ms) across all events; token totals are
  plain sums with an absent token field counting as 0.

  The fixture literal
  (`harness/fixtures/agenttrace-tools-original.json`) and
  the `src/mcp.ts` literal are identical in content, with
  no `$schema` and no `additionalProperties` — confirmed
  by the parity run below.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with an
  explicit inputSchema literal exactly matching the
  fixture, per the standing fleet rule (no McpServer/zod
  schema conversion). Every `tools/call` is validated by
  the core itself, so the MCP and CLI paths share one
  validation implementation; the core takes the full
  arguments object.
- Validation is path-naming and total: `events` missing,
  not an array, or empty; an item that is not an object;
  `tool` missing, empty, or non-string; `started_at_ms`
  or `duration_ms` missing, non-integer, or < 0; `status`
  missing, non-string, or not exactly "ok"/"error";
  `error` present but not a string; or
  `input_tokens`/`output_tokens` present but non-integer
  or < 0 throws an Error naming the offending path (e.g.
  `events[2].status must be "ok" or "error"`) and produces
  no partial result (MCP: `isError`; CLI: exit 1). Unknown
  extra fields are ignored, including inside items; a
  non-object top-level argument is treated as {}.

## Verification (foreground, this session)

- `npm test` (`tsx --test test/*.test.ts`): **56 tests,
  56 pass, 0 fail** — the single-event shape with the
  pinned top-level, tool-entry, error-entry, and totals
  key orders; per-tool aggregation across interleaved
  events with first-appearance tool order (including a
  case-sensitivity check: "Search" and "search" are
  distinct tools); per-tool `max_duration_ms`; the
  4-decimal `error_rate` rounding (1/3 → 0.3333, 2/3 →
  0.6667, 1/6 → 0.1667, 1/7 → 0.1429, exact 0 / 0.5 / 1)
  and the same rounding for `overall_error_rate`,
  including a case proving the overall rate is computed
  over events rather than averaged from per-tool rates;
  the Math.round `avg_duration_ms` rounding (.5 rounds
  up, just below .5 down, just above .5 up, total left
  unrounded); `wall_clock_ms` (single event equals its
  duration, sequential span, latest end not the last
  event, earliest start not the first event, overlapping
  parallel calls spanning rather than summing, a
  zero-duration late event extending the span, and
  epoch-shift invariance); the errors list (input order
  with 0-based indices, verbatim echo, `null` when the
  error field is absent, empty-string error echoing as
  "" rather than null, an error string on an ok event
  neither listed nor counted, empty list on a clean
  trace, every event listed on a fully failed trace);
  token totals (absent counts as 0, explicit zero valid,
  per-tool and overall sums); a hand-checked mixed trace
  matching in full; 0 valid for `started_at_ms`,
  `duration_ms`, and both token fields; and every
  validation path (events missing / non-array / empty /
  null, non-object items, tool missing / empty /
  non-string, started_at_ms and duration_ms missing /
  negative / fractional / string / boolean / null / array
  / object, status missing and not exactly "ok"/"error"
  including case and whitespace variants at the spec's
  example index, error non-string — including on an ok
  event — input_tokens and output_tokens negative /
  fractional / string / boolean / null / array / object,
  non-object top-level treated as {}, unknown extras
  ignored, no partial result).
- `npx tsc --noEmit` → exit 0; `npm run build` produced
  `dist/` with all 15 outputs.
- `node dist/cli.js --version` → `0.1.0`; unknown command
  exits 2 with usage; `summarize` with no `--input` exits
  2; `summarize --input <valid file>` exits 0 and prints
  the hand-checked summary for the input
  `{"events": [{"tool": "search", "started_at_ms": 1000,
  "duration_ms": 120, "status": "ok", "input_tokens": 300,
  "output_tokens": 80}, {"tool": "fetch",
  "started_at_ms": 1120, "duration_ms": 450, "status":
  "error", "error": "connection timed out",
  "input_tokens": 120, "output_tokens": 0}, {"tool":
  "search", "started_at_ms": 1600, "duration_ms": 90,
  "status": "ok", "input_tokens": 280, "output_tokens":
  64}]}` — search (2 calls, 210 total / 105 avg / 120 max
  duration, 580 / 144 tokens) before fetch (1 call, error
  rate 1), errors `[{index: 1, tool: "fetch", error:
  "connection timed out"}]`, totals 3 events, 2 distinct
  tools, 1 error, overall rate 0.3333, 660 total duration,
  690 wall clock, 700 / 144 tokens;
  `summarize --input <invalid file>` (third event's
  `status` the string "failed") exits 1 with
  `error: events[2].status must be "ok" or "error"` — the
  spec's own example message at the spec's example index.
  (Smoke invocations use `node dist/cli.js`, as the
  reference build's `dist/cli.js` is likewise not
  chmod +x; the parity harness invokes it the same way.)
- Parity: `harness/parity.py` vs
  `harness/fixtures/agenttrace-tools-original.json` →
  **PASS, parity 100.0, identical_tools 1/1** (run with
  the rebuild path as an absolute path; the harness does
  not expand a `~` inside the quoted stdio command
  string). Report saved under `parity-out/`.

## Lockfile status

`package-lock.json` generated clean via Route 3 (in the
build directory with no `node_modules` present, offline
`npm install --package-lock-only --ignore-scripts
--offline`), verified: parses, name
`@reneturcios/agenttrace`, **128 package entries**. The
subsequent offline `npm install --ignore-scripts
--offline`, build, tests, and parity all ran against
this lockfile's tree.

## Gaps / honest notes

- **Pinned judgement calls** (each with a dedicated test
  where applicable): (1) error-message wording follows
  the fleet's path-naming pattern, distinguishing a
  missing field (`events[0].status is required`) from a
  malformed one (`events[2].status must be "ok" or
  "error"`, the spec's example); a missing `tool`,
  `started_at_ms`, or `duration_ms` likewise reports
  "is required" while an empty or wrongly typed value
  reports the "must be …" form; (2) an `error` field
  present on an `ok` event is still validated (it must
  be a string, per the spec's unqualified "error present
  but not a string" rule) but is never listed in the
  errors list and never counted — only status "error"
  events are listed or counted; (3) an empty-string
  `error` on a failed call echoes as "" rather than
  null: null means the field was absent, exactly the
  spec's "or null when the event carries no error";
  (4) tool names are distinct by exact string match, so
  names differing only in case are different tools (the
  spec aggregates "every event with that tool name" and
  pins no case folding); (5) unknown extra fields are
  ignored rather than rejected, at the top level and
  inside items (the spec says so); (6) a non-object
  top-level arguments value is treated as an empty
  object, so it fails as `events is required`. No other
  spec ambiguity was found in the core behaviour.
- Container build not exercised locally; the
  publish-container workflow smoke-tests the image at
  publish time.
- Nothing pushed or published; this is a local build only.
