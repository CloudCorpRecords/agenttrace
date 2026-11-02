# Changelog

## 0.1.0 (2026-10-27)

- Initial release: `summarize_trace` MCP tool and
  `summarize` CLI command summarizing a caller-supplied
  agent tool-call trace; local computation only, nothing
  is recorded or fetched.
- Per-tool statistics in first-appearance order: calls,
  errors, `error_rate` rounded to 4 decimal places,
  total / average / maximum duration (`avg_duration_ms`
  rounded with `Math.round`), and input / output token
  sums with absent token fields counting as 0.
- Errors list with one `{index, tool, error}` per failed
  call in input order, `error` echoing the event's error
  string verbatim or `null` when absent. Totals report
  the event count, distinct tools, total errors, the
  overall error rate, the summed duration, the
  wall-clock span, and the token totals.
- Path-naming validation errors for malformed input; no
  partial results on invalid input.
