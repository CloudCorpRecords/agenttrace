# agenttrace

An agent run can fire dozens of tool calls, and afterwards
the interesting questions are simple ones: which tools did
the work, which calls failed and why, where did the time
go, and how many tokens did it all cost. agenttrace
answers those questions from a trace you already have.
You supply the events — for each call, the tool name, when
it started, how long it ran, whether it ended `ok` or in
`error`, and optionally the error message and the input
and output token counts — and agenttrace hands back the
summary. It records nothing, proxies nothing, and fetches
nothing; it computes over the facts you pass in.

The summary has three parts. First, one statistics entry
per distinct tool, in the order the tools first appear in
your trace: how many calls it took, how many of them
failed, its error rate, its total, average, and maximum
duration, and its token totals. Second, the list of failed
calls in trace order, each with its position in the trace,
its tool, and its error message — `null` when a failed
call carried no message. Third, the trace totals: the
event count, how many distinct tools ran, the total error
count and overall error rate, the summed duration, the
wall-clock span from the earliest start to the latest
finish, and the overall token totals.

Two roundings are pinned. Error rates — per tool and
overall — are rounded to four decimal places, and the
average duration is rounded to the nearest integer with
`Math.round`, so a mean of 100.5 reports as 101. Token
fields are optional; a call that omits them counts as
zero tokens. The start times can use any epoch you like,
because only their differences feed the wall-clock span.

Malformed input — a missing, empty, or non-array event
list, an event that is not an object, a missing, empty, or
non-string tool name, a negative or fractional start time,
duration, or token count, a status that is not exactly
`"ok"` or `"error"`, or a non-string error — is a
validation error naming the offending path, such as
`events[2].status must be "ok" or "error"`, with no
partial result. Unknown extra fields are ignored,
including inside events.

## CLI

```bash
npx @reneturcios/agenttrace summarize --input args.json
npx @reneturcios/agenttrace --version
```

`args.json` contains the full arguments object:

```json
{
  "events": [
    {
      "tool": "search",
      "started_at_ms": 1000,
      "duration_ms": 120,
      "status": "ok",
      "input_tokens": 300,
      "output_tokens": 80
    },
    {
      "tool": "fetch",
      "started_at_ms": 1120,
      "duration_ms": 450,
      "status": "error",
      "error": "connection timed out",
      "input_tokens": 120,
      "output_tokens": 0
    },
    {
      "tool": "search",
      "started_at_ms": 1600,
      "duration_ms": 90,
      "status": "ok",
      "input_tokens": 280,
      "output_tokens": 64
    }
  ]
}
```

The summary is printed as JSON:

```json
{
  "tools": [
    {
      "tool": "search",
      "calls": 2,
      "errors": 0,
      "error_rate": 0,
      "total_duration_ms": 210,
      "avg_duration_ms": 105,
      "max_duration_ms": 120,
      "input_tokens": 580,
      "output_tokens": 144
    },
    {
      "tool": "fetch",
      "calls": 1,
      "errors": 1,
      "error_rate": 1,
      "total_duration_ms": 450,
      "avg_duration_ms": 450,
      "max_duration_ms": 450,
      "input_tokens": 120,
      "output_tokens": 0
    }
  ],
  "errors": [
    {
      "index": 1,
      "tool": "fetch",
      "error": "connection timed out"
    }
  ],
  "totals": {
    "total_events": 3,
    "distinct_tools": 2,
    "total_errors": 1,
    "overall_error_rate": 0.3333,
    "total_duration_ms": 660,
    "wall_clock_ms": 690,
    "total_input_tokens": 700,
    "total_output_tokens": 144
  }
}
```

Exit codes: `0` on success, `1` on a runtime error
(including an unreadable or invalid input file, or
invalid input), `2` on a usage error.

## MCP server

```bash
npx -y @reneturcios/agenttrace mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "agenttrace": {
      "command": "npx",
      "args": ["-y", "@reneturcios/agenttrace", "mcp"]
    }
  }
}
```

### Tools

- `summarize_trace` — Summarize a caller-supplied agent
  tool-call trace: per-tool call, error, duration, and
  token statistics, the list of failed calls, and trace
  totals.
  - `events` (array, required, at least 1 item) — the
    tool-call events to summarize, in trace order; each
    item:
    - `tool` (string, required, non-empty) — name of the
      tool that was called
    - `started_at_ms` (integer, required, at least 0) —
      call start time in milliseconds (any epoch the
      caller chooses; only differences are used)
    - `duration_ms` (integer, required, at least 0) —
      call duration in milliseconds
    - `status` (string, required) — call outcome: exactly
      `"ok"` or `"error"`
    - `error` (string, optional) — error message for a
      failed call
    - `input_tokens` (integer, optional, at least 0) —
      input tokens consumed by the call; absent means 0
    - `output_tokens` (integer, optional, at least 0) —
      output tokens produced by the call; absent means 0

  Returns `{tools, errors, totals}`, where `tools` holds
  one `{tool, calls, errors, error_rate,
  total_duration_ms, avg_duration_ms, max_duration_ms,
  input_tokens, output_tokens}` per distinct tool in
  first-appearance order, `errors` holds one `{index,
  tool, error}` per failed call in input order, and
  `totals` is `{total_events, distinct_tools,
  total_errors, overall_error_rate, total_duration_ms,
  wall_clock_ms, total_input_tokens,
  total_output_tokens}`.

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/agenttrace
docker run --rm -v "$PWD:/w" ghcr.io/cloudcorprecords/agenttrace summarize --input /w/args.json
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (pure local, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
