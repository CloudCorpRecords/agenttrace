import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { summarizeTrace } from "../src/agenttrace.js";

/**
 * All tests are pure local computation over inline trace
 * events: no recording, no filesystem, no network. Every
 * pinned judgement call in the spec is covered: the
 * 4-decimal error-rate rounding (per-tool and overall),
 * the Math.round average duration, first-appearance tool
 * order, the wall-clock computation, the error echo (null
 * when absent), the token sums with absent counting as 0,
 * the pinned output key orders, and every validation path.
 */

type E = Record<string, unknown>;

const ev = (over: E = {}): E => ({
  tool: "search",
  started_at_ms: 1000,
  duration_ms: 100,
  status: "ok",
  input_tokens: 10,
  output_tokens: 5,
  ...over,
});

const sum = (events: unknown) => summarizeTrace({ events });

describe("summarizeTrace — single event and output shape", () => {
  it("a single ok event gives one tool entry, no errors, and full totals", () => {
    assert.deepEqual(sum([ev()]), {
      tools: [
        {
          tool: "search",
          calls: 1,
          errors: 0,
          error_rate: 0,
          total_duration_ms: 100,
          avg_duration_ms: 100,
          max_duration_ms: 100,
          input_tokens: 10,
          output_tokens: 5,
        },
      ],
      errors: [],
      totals: {
        total_events: 1,
        distinct_tools: 1,
        total_errors: 0,
        overall_error_rate: 0,
        total_duration_ms: 100,
        wall_clock_ms: 100,
        total_input_tokens: 10,
        total_output_tokens: 5,
      },
    });
  });

  it("top-level keys are in the order {tools, errors, totals}", () => {
    assert.deepEqual(Object.keys(sum([ev()])), ["tools", "errors", "totals"]);
  });

  it("tool entry keys are in the pinned order", () => {
    assert.deepEqual(Object.keys(sum([ev()]).tools[0]), [
      "tool",
      "calls",
      "errors",
      "error_rate",
      "total_duration_ms",
      "avg_duration_ms",
      "max_duration_ms",
      "input_tokens",
      "output_tokens",
    ]);
  });

  it("totals keys are in the pinned order", () => {
    assert.deepEqual(Object.keys(sum([ev()]).totals), [
      "total_events",
      "distinct_tools",
      "total_errors",
      "overall_error_rate",
      "total_duration_ms",
      "wall_clock_ms",
      "total_input_tokens",
      "total_output_tokens",
    ]);
  });

  it("error entry keys are in the order {index, tool, error}", () => {
    const out = sum([ev({ status: "error", error: "boom" })]);
    assert.deepEqual(Object.keys(out.errors[0]), ["index", "tool", "error"]);
  });
});

describe("summarizeTrace — per-tool aggregation and first-appearance order", () => {
  it("tools are listed in first-appearance order, not alphabetical or frequency order", () => {
    const out = sum([
      ev({ tool: "zeta" }),
      ev({ tool: "alpha" }),
      ev({ tool: "zeta" }),
      ev({ tool: "mid" }),
      ev({ tool: "alpha" }),
      ev({ tool: "zeta" }),
    ]);
    assert.deepEqual(
      out.tools.map((t) => t.tool),
      ["zeta", "alpha", "mid"],
    );
    assert.deepEqual(
      out.tools.map((t) => t.calls),
      [3, 2, 1],
    );
    assert.equal(out.totals.distinct_tools, 3);
  });

  it("interleaved events aggregate into their own tool's entry", () => {
    const out = sum([
      ev({ tool: "a", duration_ms: 10, input_tokens: 1, output_tokens: 2 }),
      ev({ tool: "b", duration_ms: 20, input_tokens: 3, output_tokens: 4 }),
      ev({ tool: "a", duration_ms: 30, input_tokens: 5, output_tokens: 6, status: "error", error: "x" }),
    ]);
    assert.deepEqual(out.tools[0], {
      tool: "a",
      calls: 2,
      errors: 1,
      error_rate: 0.5,
      total_duration_ms: 40,
      avg_duration_ms: 20,
      max_duration_ms: 30,
      input_tokens: 6,
      output_tokens: 8,
    });
    assert.deepEqual(out.tools[1], {
      tool: "b",
      calls: 1,
      errors: 0,
      error_rate: 0,
      total_duration_ms: 20,
      avg_duration_ms: 20,
      max_duration_ms: 20,
      input_tokens: 3,
      output_tokens: 4,
    });
  });

  it("max_duration_ms is the largest duration for that tool only", () => {
    const out = sum([
      ev({ tool: "a", duration_ms: 50 }),
      ev({ tool: "b", duration_ms: 900 }),
      ev({ tool: "a", duration_ms: 70 }),
      ev({ tool: "a", duration_ms: 60 }),
    ]);
    assert.equal(out.tools[0].max_duration_ms, 70);
    assert.equal(out.tools[1].max_duration_ms, 900);
  });

  it("tool names are case-sensitive: differing case is a distinct tool", () => {
    const out = sum([ev({ tool: "Search" }), ev({ tool: "search" })]);
    assert.deepEqual(
      out.tools.map((t) => t.tool),
      ["Search", "search"],
    );
    assert.equal(out.totals.distinct_tools, 2);
  });
});

describe("summarizeTrace — error_rate rounding (4 decimal places, pinned)", () => {
  const rateFor = (errors: number, calls: number) => {
    const events = Array.from({ length: calls }, (_, i) =>
      ev({ status: i < errors ? "error" : "ok", error: "e" }),
    );
    return sum(events).tools[0].error_rate;
  };

  it("1 of 3 rounds to 0.3333", () => {
    assert.equal(rateFor(1, 3), 0.3333);
  });

  it("2 of 3 rounds to 0.6667 (rounds up at the 4th place)", () => {
    assert.equal(rateFor(2, 3), 0.6667);
  });

  it("1 of 6 rounds to 0.1667", () => {
    assert.equal(rateFor(1, 6), 0.1667);
  });

  it("1 of 7 rounds to 0.1429", () => {
    assert.equal(rateFor(1, 7), 0.1429);
  });

  it("exact rates stay exact: 0, 0.5, and 1", () => {
    assert.equal(rateFor(0, 4), 0);
    assert.equal(rateFor(2, 4), 0.5);
    assert.equal(rateFor(4, 4), 1);
  });

  it("overall_error_rate uses the same 4-decimal rounding", () => {
    const out = sum([
      ev({ tool: "a", status: "error", error: "e" }),
      ev({ tool: "b" }),
      ev({ tool: "c" }),
    ]);
    assert.equal(out.totals.overall_error_rate, 0.3333);
    assert.equal(out.totals.total_errors, 1);
  });

  it("overall_error_rate is computed over events, not averaged from per-tool rates", () => {
    // Tool a: 1/1 = 1; tool b: 0/3 = 0. Averaging rates would give 0.5;
    // the pinned total is 1/4 = 0.25.
    const out = sum([
      ev({ tool: "a", status: "error", error: "e" }),
      ev({ tool: "b" }),
      ev({ tool: "b" }),
      ev({ tool: "b" }),
    ]);
    assert.equal(out.totals.overall_error_rate, 0.25);
    assert.equal(out.tools[0].error_rate, 1);
    assert.equal(out.tools[1].error_rate, 0);
  });
});

describe("summarizeTrace — avg_duration_ms rounding (Math.round, pinned)", () => {
  const avgFor = (durations: number[]) =>
    sum(durations.map((d) => ev({ duration_ms: d }))).tools[0].avg_duration_ms;

  it("an exact mean stays exact", () => {
    assert.equal(avgFor([100, 200]), 150);
  });

  it("a .5 mean rounds up (Math.round, not truncation or banker's rounding)", () => {
    assert.equal(avgFor([100, 101]), 101);
    assert.equal(avgFor([0, 1]), 1);
  });

  it("a mean just below .5 rounds down", () => {
    // (100 + 100 + 101) / 3 = 100.333...
    assert.equal(avgFor([100, 100, 101]), 100);
    // (0 + 0 + 1) / 3 = 0.333...
    assert.equal(avgFor([0, 0, 1]), 0);
  });

  it("a mean just above .5 rounds up", () => {
    // (100 + 101 + 101) / 3 = 100.666...
    assert.equal(avgFor([100, 101, 101]), 101);
  });

  it("total_duration_ms is the unrounded sum even when the average rounds", () => {
    const out = sum([ev({ duration_ms: 100 }), ev({ duration_ms: 101 })]);
    assert.equal(out.tools[0].total_duration_ms, 201);
    assert.equal(out.tools[0].avg_duration_ms, 101);
    assert.equal(out.totals.total_duration_ms, 201);
  });
});

describe("summarizeTrace — wall_clock_ms (pinned)", () => {
  it("a single event's wall clock is exactly its duration", () => {
    const out = sum([ev({ started_at_ms: 5000, duration_ms: 250 })]);
    assert.equal(out.totals.wall_clock_ms, 250);
  });

  it("sequential non-overlapping events span first start to last end", () => {
    const out = sum([
      ev({ started_at_ms: 1000, duration_ms: 120 }),
      ev({ started_at_ms: 1120, duration_ms: 450 }),
      ev({ started_at_ms: 1600, duration_ms: 90 }),
    ]);
    // min start 1000, max end 1690.
    assert.equal(out.totals.wall_clock_ms, 690);
  });

  it("the latest end need not be the last event in the list", () => {
    const out = sum([
      ev({ started_at_ms: 0, duration_ms: 1000 }),
      ev({ started_at_ms: 100, duration_ms: 10 }),
    ]);
    assert.equal(out.totals.wall_clock_ms, 1000);
  });

  it("the earliest start need not be the first event in the list", () => {
    const out = sum([
      ev({ started_at_ms: 500, duration_ms: 100 }),
      ev({ started_at_ms: 100, duration_ms: 100 }),
    ]);
    // min start 100, max end 600.
    assert.equal(out.totals.wall_clock_ms, 500);
  });

  it("overlapping parallel calls are not summed: wall clock is the span, not the total", () => {
    const out = sum([
      ev({ started_at_ms: 0, duration_ms: 300 }),
      ev({ started_at_ms: 0, duration_ms: 300 }),
      ev({ started_at_ms: 0, duration_ms: 300 }),
    ]);
    assert.equal(out.totals.wall_clock_ms, 300);
    assert.equal(out.totals.total_duration_ms, 900);
  });

  it("a zero-duration event at a later start extends the span to that start", () => {
    const out = sum([
      ev({ started_at_ms: 0, duration_ms: 50 }),
      ev({ started_at_ms: 200, duration_ms: 0 }),
    ]);
    assert.equal(out.totals.wall_clock_ms, 200);
  });

  it("only differences are used: shifting every start by a constant changes nothing", () => {
    const base = sum([
      ev({ started_at_ms: 0, duration_ms: 100 }),
      ev({ started_at_ms: 300, duration_ms: 100 }),
    ]);
    const shifted = sum([
      ev({ started_at_ms: 86400000, duration_ms: 100 }),
      ev({ started_at_ms: 86400300, duration_ms: 100 }),
    ]);
    assert.equal(base.totals.wall_clock_ms, 400);
    assert.equal(shifted.totals.wall_clock_ms, 400);
  });
});

describe("summarizeTrace — errors list (pinned)", () => {
  it("holds one entry per error event, in input order, with 0-based indices", () => {
    const out = sum([
      ev({ tool: "a", status: "error", error: "first" }),
      ev({ tool: "b" }),
      ev({ tool: "c", status: "error", error: "second" }),
      ev({ tool: "a" }),
      ev({ tool: "b", status: "error", error: "third" }),
    ]);
    assert.deepEqual(out.errors, [
      { index: 0, tool: "a", error: "first" },
      { index: 2, tool: "c", error: "second" },
      { index: 4, tool: "b", error: "third" },
    ]);
    assert.equal(out.totals.total_errors, 3);
  });

  it("error echoes the event's error string verbatim", () => {
    const msg = "  Weird CASE: 'quoted' \"text\" \n preserved  ";
    const out = sum([ev({ status: "error", error: msg })]);
    assert.equal(out.errors[0].error, msg);
  });

  it("error is null when a failed event carries no error field (pinned)", () => {
    const { error: _drop, ...rest } = ev({ status: "error" });
    // ev() carries no error by default; build the event explicitly.
    const out = sum([
      { tool: "search", started_at_ms: 0, duration_ms: 10, status: "error" },
    ]);
    assert.deepEqual(out.errors, [{ index: 0, tool: "search", error: null }]);
    void rest;
    void _drop;
  });

  it("an empty-string error echoes as the empty string, not null", () => {
    const out = sum([ev({ status: "error", error: "" })]);
    assert.equal(out.errors[0].error, "");
    assert.notEqual(out.errors[0].error, null);
  });

  it("an error string on an ok event is not listed and does not count", () => {
    const out = sum([ev({ status: "ok", error: "stale note" })]);
    assert.deepEqual(out.errors, []);
    assert.equal(out.totals.total_errors, 0);
    assert.equal(out.tools[0].errors, 0);
  });

  it("a trace with no failures has an empty errors list", () => {
    assert.deepEqual(sum([ev(), ev({ tool: "b" })]).errors, []);
  });

  it("a trace where every call failed lists every event", () => {
    const out = sum([
      ev({ status: "error", error: "a" }),
      ev({ status: "error" }),
    ]);
    assert.equal(out.errors.length, 2);
    assert.equal(out.errors[1].error, null);
    assert.equal(out.totals.overall_error_rate, 1);
  });
});

describe("summarizeTrace — token totals", () => {
  it("absent token fields count as 0 (pinned)", () => {
    const out = sum([
      { tool: "a", started_at_ms: 0, duration_ms: 10, status: "ok" },
      { tool: "a", started_at_ms: 10, duration_ms: 10, status: "ok", input_tokens: 7 },
      { tool: "a", started_at_ms: 20, duration_ms: 10, status: "ok", output_tokens: 3 },
    ]);
    assert.equal(out.tools[0].input_tokens, 7);
    assert.equal(out.tools[0].output_tokens, 3);
    assert.equal(out.totals.total_input_tokens, 7);
    assert.equal(out.totals.total_output_tokens, 3);
  });

  it("explicit zero tokens sum as zero and are valid", () => {
    const out = sum([ev({ input_tokens: 0, output_tokens: 0 })]);
    assert.equal(out.totals.total_input_tokens, 0);
    assert.equal(out.totals.total_output_tokens, 0);
  });

  it("token sums are per-tool and overall, across interleaved tools", () => {
    const out = sum([
      ev({ tool: "a", input_tokens: 100, output_tokens: 10 }),
      ev({ tool: "b", input_tokens: 200, output_tokens: 20 }),
      ev({ tool: "a", input_tokens: 50, output_tokens: 5 }),
    ]);
    assert.equal(out.tools[0].input_tokens, 150);
    assert.equal(out.tools[0].output_tokens, 15);
    assert.equal(out.tools[1].input_tokens, 200);
    assert.equal(out.totals.total_input_tokens, 350);
    assert.equal(out.totals.total_output_tokens, 35);
  });
});

describe("summarizeTrace — totals on a mixed trace", () => {
  it("a hand-checked mixed trace matches in full", () => {
    const out = sum([
      ev({ tool: "search", started_at_ms: 1000, duration_ms: 120, input_tokens: 300, output_tokens: 80 }),
      ev({ tool: "fetch", started_at_ms: 1120, duration_ms: 450, status: "error", error: "connection timed out", input_tokens: 120, output_tokens: 0 }),
      ev({ tool: "search", started_at_ms: 1600, duration_ms: 90, input_tokens: 280, output_tokens: 64 }),
    ]);
    assert.deepEqual(out, {
      tools: [
        {
          tool: "search",
          calls: 2,
          errors: 0,
          error_rate: 0,
          total_duration_ms: 210,
          avg_duration_ms: 105,
          max_duration_ms: 120,
          input_tokens: 580,
          output_tokens: 144,
        },
        {
          tool: "fetch",
          calls: 1,
          errors: 1,
          error_rate: 1,
          total_duration_ms: 450,
          avg_duration_ms: 450,
          max_duration_ms: 450,
          input_tokens: 120,
          output_tokens: 0,
        },
      ],
      errors: [{ index: 1, tool: "fetch", error: "connection timed out" }],
      totals: {
        total_events: 3,
        distinct_tools: 2,
        total_errors: 1,
        overall_error_rate: 0.3333,
        total_duration_ms: 660,
        wall_clock_ms: 690,
        total_input_tokens: 700,
        total_output_tokens: 144,
      },
    });
  });

  it("zero is valid for started_at_ms, duration_ms, and both token fields", () => {
    const out = sum([
      ev({ started_at_ms: 0, duration_ms: 0, input_tokens: 0, output_tokens: 0 }),
    ]);
    assert.equal(out.totals.wall_clock_ms, 0);
    assert.equal(out.totals.total_duration_ms, 0);
    assert.equal(out.tools[0].avg_duration_ms, 0);
    assert.equal(out.tools[0].max_duration_ms, 0);
  });
});

describe("summarizeTrace — validation", () => {
  const throws = (args: unknown, message: string) =>
    assert.throws(() => summarizeTrace(args), { message });

  it("events missing is an error naming events", () => {
    throws({}, "events is required");
  });

  it("a non-object top-level argument is treated as {} and fails on events", () => {
    throws(null, "events is required");
    throws([], "events is required");
    throws("x", "events is required");
    throws(42, "events is required");
    throws(undefined, "events is required");
  });

  it("events not an array or empty names events", () => {
    throws({ events: "x" }, "events must be a non-empty array");
    throws({ events: {} }, "events must be a non-empty array");
    throws({ events: 3 }, "events must be a non-empty array");
    throws({ events: [] }, "events must be a non-empty array");
    throws({ events: null }, "events must be a non-empty array");
  });

  it("an item that is not an object names its index", () => {
    throws({ events: ["x"] }, "events[0] must be an object");
    throws({ events: [null] }, "events[0] must be an object");
    throws({ events: [[]] }, "events[0] must be an object");
    throws({ events: [ev(), 7] }, "events[1] must be an object");
  });

  it("tool missing, empty, or non-string names events[i].tool", () => {
    const { tool: _t, ...noTool } = ev();
    throws({ events: [noTool] }, "events[0].tool is required");
    throws({ events: [ev({ tool: "" })] }, "events[0].tool must be a non-empty string");
    for (const bad of [42, true, null, [], {}]) {
      throws({ events: [ev({ tool: bad })] }, "events[0].tool must be a non-empty string");
    }
    throws(
      { events: [ev(), ev({ tool: "" })] },
      "events[1].tool must be a non-empty string",
    );
  });

  it("started_at_ms missing names events[i].started_at_ms as required", () => {
    const { started_at_ms: _s, ...noStart } = ev();
    throws({ events: [noStart] }, "events[0].started_at_ms is required");
  });

  it("started_at_ms non-integer or negative names events[i].started_at_ms", () => {
    for (const bad of [-1, -100, 1.5, 0.5, "0", true, null, [], {}]) {
      throws(
        { events: [ev({ started_at_ms: bad })] },
        "events[0].started_at_ms must be an integer >= 0",
      );
    }
  });

  it("duration_ms missing names events[i].duration_ms as required", () => {
    const { duration_ms: _d, ...noDur } = ev();
    throws({ events: [ev(), noDur] }, "events[1].duration_ms is required");
  });

  it("duration_ms non-integer or negative names events[i].duration_ms", () => {
    for (const bad of [-1, 2.5, "100", false, null, [], {}]) {
      throws(
        { events: [ev({ duration_ms: bad })] },
        "events[0].duration_ms must be an integer >= 0",
      );
    }
  });

  it("status missing names events[i].status as required", () => {
    const { status: _st, ...noStatus } = ev();
    throws({ events: [noStatus] }, "events[0].status is required");
  });

  it("status not exactly \"ok\" or \"error\" names events[i].status (spec example)", () => {
    throws(
      { events: [ev(), ev(), ev({ status: "failed" })] },
      'events[2].status must be "ok" or "error"',
    );
    for (const bad of ["OK", "Error", " ok", "ok ", "", 0, 1, true, null, [], {}]) {
      throws(
        { events: [ev({ status: bad })] },
        'events[0].status must be "ok" or "error"',
      );
    }
  });

  it("error present but not a string names events[i].error", () => {
    for (const bad of [42, true, null, [], {}]) {
      throws(
        { events: [ev({ status: "error", error: bad })] },
        "events[0].error must be a string",
      );
    }
    // Also validated on ok events: the field is present, so it must be a string.
    throws({ events: [ev({ error: 42 })] }, "events[0].error must be a string");
  });

  it("input_tokens present but non-integer or negative names events[i].input_tokens", () => {
    for (const bad of [-1, 1.5, "10", true, null, [], {}]) {
      throws(
        { events: [ev({ input_tokens: bad })] },
        "events[0].input_tokens must be an integer >= 0",
      );
    }
  });

  it("output_tokens present but non-integer or negative names events[i].output_tokens", () => {
    for (const bad of [-5, 0.5, "5", false, null, [], {}]) {
      throws(
        { events: [ev(), ev({ output_tokens: bad })] },
        "events[1].output_tokens must be an integer >= 0",
      );
    }
  });

  it("unknown extra fields are ignored, including inside items", () => {
    const out = summarizeTrace({
      events: [ev({ trace_id: "t-1", attempt: 2 })],
      generated_by: "test",
    });
    assert.equal(out.totals.total_events, 1);
    assert.equal(out.tools[0].tool, "search");
  });

  it("no partial result is produced on invalid input deep in the list", () => {
    assert.throws(() =>
      sum([ev(), ev({ tool: "b" }), ev({ tool: "c", duration_ms: -1 })]),
    );
  });
});
