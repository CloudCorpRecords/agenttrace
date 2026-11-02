/**
 * agenttrace core: summarize a caller-supplied agent
 * tool-call trace.
 *
 *   summarizeTrace(args) -> { tools, errors, totals }
 *
 * Per-tool statistics aggregate every event with that
 * tool name. The tools list is in FIRST-APPEARANCE order
 * (the order distinct tool names first occur in events).
 *
 * Rounding (pinned): `error_rate` is errors / calls
 * rounded to 4 decimal places
 * (Math.round(x * 10000) / 10000). `avg_duration_ms` is
 * total_duration_ms / calls rounded to the nearest
 * integer (Math.round). `overall_error_rate` in totals
 * uses the same 4-decimal rounding.
 *
 * The errors list holds one {index, tool, error} per
 * event whose status is "error", in input order; index
 * is the event's 0-based position in `events`; error
 * echoes the event's `error` string verbatim, or null
 * when the event carries no `error`.
 *
 * `wall_clock_ms` is max(started_at_ms + duration_ms)
 * minus min(started_at_ms) across all events.
 *
 * Token totals are plain sums; an absent token field
 * counts as 0.
 *
 * Output key order (pinned): each tools entry is
 * {tool, calls, errors, error_rate, total_duration_ms,
 * avg_duration_ms, max_duration_ms, input_tokens,
 * output_tokens}; totals is {total_events,
 * distinct_tools, total_errors, overall_error_rate,
 * total_duration_ms, wall_clock_ms, total_input_tokens,
 * total_output_tokens}.
 *
 * Validation is strict and path-naming: any malformed
 * input throws an Error naming the offending path and
 * no partial result is produced. Unknown extra fields
 * are ignored, including inside items; a non-object
 * top-level argument is treated as {}.
 */
import type {
  AgenttraceResult,
  ToolStats,
  TraceError,
  TraceTotals,
} from "./types.js";

export const VERSION = "0.1.0";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

interface EventFacts {
  tool: string;
  startedAtMs: number;
  durationMs: number;
  status: "ok" | "error";
  error: string | null;
  inputTokens: number;
  outputTokens: number;
}

function parseEvent(item: unknown, index: number): EventFacts {
  const at = `events[${index}]`;
  if (!isRecord(item)) throw new Error(`${at} must be an object`);

  if (item.tool === undefined) throw new Error(`${at}.tool is required`);
  if (typeof item.tool !== "string" || item.tool.length === 0) {
    throw new Error(`${at}.tool must be a non-empty string`);
  }

  if (item.started_at_ms === undefined) {
    throw new Error(`${at}.started_at_ms is required`);
  }
  if (
    typeof item.started_at_ms !== "number" ||
    !Number.isInteger(item.started_at_ms) ||
    item.started_at_ms < 0
  ) {
    throw new Error(`${at}.started_at_ms must be an integer >= 0`);
  }

  if (item.duration_ms === undefined) {
    throw new Error(`${at}.duration_ms is required`);
  }
  if (
    typeof item.duration_ms !== "number" ||
    !Number.isInteger(item.duration_ms) ||
    item.duration_ms < 0
  ) {
    throw new Error(`${at}.duration_ms must be an integer >= 0`);
  }

  if (item.status === undefined) throw new Error(`${at}.status is required`);
  if (item.status !== "ok" && item.status !== "error") {
    throw new Error(`${at}.status must be "ok" or "error"`);
  }

  let error: string | null = null;
  if (item.error !== undefined) {
    if (typeof item.error !== "string") {
      throw new Error(`${at}.error must be a string`);
    }
    error = item.error;
  }

  let inputTokens = 0;
  if (item.input_tokens !== undefined) {
    if (
      typeof item.input_tokens !== "number" ||
      !Number.isInteger(item.input_tokens) ||
      item.input_tokens < 0
    ) {
      throw new Error(`${at}.input_tokens must be an integer >= 0`);
    }
    inputTokens = item.input_tokens;
  }

  let outputTokens = 0;
  if (item.output_tokens !== undefined) {
    if (
      typeof item.output_tokens !== "number" ||
      !Number.isInteger(item.output_tokens) ||
      item.output_tokens < 0
    ) {
      throw new Error(`${at}.output_tokens must be an integer >= 0`);
    }
    outputTokens = item.output_tokens;
  }

  return {
    tool: item.tool,
    startedAtMs: item.started_at_ms,
    durationMs: item.duration_ms,
    status: item.status,
    error,
    inputTokens,
    outputTokens,
  };
}

/** Summarize a caller-supplied agent tool-call trace. */
export function summarizeTrace(args: unknown): AgenttraceResult {
  const raw: Record<string, unknown> = isRecord(args) ? args : {};

  if (raw.events === undefined) throw new Error("events is required");
  if (!Array.isArray(raw.events) || raw.events.length === 0) {
    throw new Error("events must be a non-empty array");
  }

  const facts = raw.events.map((item, i) => parseEvent(item, i));

  const order: string[] = [];
  const byTool = new Map<
    string,
    {
      calls: number;
      errors: number;
      totalDurationMs: number;
      maxDurationMs: number;
      inputTokens: number;
      outputTokens: number;
    }
  >();
  const errors: TraceError[] = [];

  let totalDurationMs = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalErrors = 0;
  let minStart = Infinity;
  let maxEnd = -Infinity;

  for (let i = 0; i < facts.length; i++) {
    const f = facts[i];
    let agg = byTool.get(f.tool);
    if (!agg) {
      agg = {
        calls: 0,
        errors: 0,
        totalDurationMs: 0,
        maxDurationMs: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
      byTool.set(f.tool, agg);
      order.push(f.tool);
    }
    agg.calls += 1;
    if (f.status === "error") {
      agg.errors += 1;
      totalErrors += 1;
      errors.push({ index: i, tool: f.tool, error: f.error });
    }
    agg.totalDurationMs += f.durationMs;
    if (f.durationMs > agg.maxDurationMs) agg.maxDurationMs = f.durationMs;
    agg.inputTokens += f.inputTokens;
    agg.outputTokens += f.outputTokens;

    totalDurationMs += f.durationMs;
    totalInputTokens += f.inputTokens;
    totalOutputTokens += f.outputTokens;
    if (f.startedAtMs < minStart) minStart = f.startedAtMs;
    const end = f.startedAtMs + f.durationMs;
    if (end > maxEnd) maxEnd = end;
  }

  const tools: ToolStats[] = order.map((tool) => {
    const agg = byTool.get(tool)!;
    return {
      tool,
      calls: agg.calls,
      errors: agg.errors,
      error_rate: round4(agg.errors / agg.calls),
      total_duration_ms: agg.totalDurationMs,
      avg_duration_ms: Math.round(agg.totalDurationMs / agg.calls),
      max_duration_ms: agg.maxDurationMs,
      input_tokens: agg.inputTokens,
      output_tokens: agg.outputTokens,
    };
  });

  const totals: TraceTotals = {
    total_events: facts.length,
    distinct_tools: order.length,
    total_errors: totalErrors,
    overall_error_rate: round4(totalErrors / facts.length),
    total_duration_ms: totalDurationMs,
    wall_clock_ms: maxEnd - minStart,
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
  };

  return { tools, errors, totals };
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
