/**
 * agenttrace types.
 *
 * agenttrace summarizes a caller-supplied agent tool-call
 * trace. For each event the caller supplies the tool that
 * was called, when the call started, how long it ran, and
 * whether it succeeded or failed, and optionally an error
 * message and the input / output token counts. From that
 * data alone, as pure local computation, agenttrace
 * reports:
 *
 *   - one statistics entry per distinct tool, in
 *     first-appearance order: its call count, error count,
 *     error rate, total / average / maximum duration, and
 *     token sums
 *   - the list of failed calls, in input order, each with
 *     its 0-based index, its tool, and its error message
 *     (null when the event carries no error)
 *   - trace totals: the event count, the distinct-tool
 *     count, the total error count and overall error rate,
 *     the summed duration, the wall-clock span, and the
 *     token totals
 *
 * Nothing is recorded, proxied, or fetched.
 */

/** Per-tool statistics for one distinct tool name. */
export interface ToolStats {
  /** Tool name, echoed from the input. */
  tool: string;
  /** Number of calls to this tool. */
  calls: number;
  /** Number of calls to this tool whose status is "error". */
  errors: number;
  /** errors / calls, rounded to 4 decimal places. */
  error_rate: number;
  /** Sum of duration_ms across this tool's calls. */
  total_duration_ms: number;
  /** total_duration_ms / calls, rounded to the nearest integer. */
  avg_duration_ms: number;
  /** Largest duration_ms among this tool's calls. */
  max_duration_ms: number;
  /** Sum of input_tokens across this tool's calls (absent counts as 0). */
  input_tokens: number;
  /** Sum of output_tokens across this tool's calls (absent counts as 0). */
  output_tokens: number;
}

/** One failed call, in input order. */
export interface TraceError {
  /** The event's 0-based position in `events`. */
  index: number;
  /** Name of the tool that was called. */
  tool: string;
  /** The event's error string verbatim, or null when absent. */
  error: string | null;
}

/** Trace-wide totals. */
export interface TraceTotals {
  /** Number of events in the trace. */
  total_events: number;
  /** Number of distinct tool names in the trace. */
  distinct_tools: number;
  /** Number of events whose status is "error". */
  total_errors: number;
  /** total_errors / total_events, rounded to 4 decimal places. */
  overall_error_rate: number;
  /** Sum of duration_ms across all events. */
  total_duration_ms: number;
  /** max(started_at_ms + duration_ms) minus min(started_at_ms). */
  wall_clock_ms: number;
  /** Sum of input_tokens across all events (absent counts as 0). */
  total_input_tokens: number;
  /** Sum of output_tokens across all events (absent counts as 0). */
  total_output_tokens: number;
}

/** The full trace summary. */
export interface AgenttraceResult {
  /** One statistics entry per distinct tool, in first-appearance order. */
  tools: ToolStats[];
  /** One entry per failed call, in input order. */
  errors: TraceError[];
  /** Trace-wide totals. */
  totals: TraceTotals;
}
