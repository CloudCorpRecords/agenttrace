/**
 * agenttrace MCP server. Tools: summarize_trace.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys
 * not in this tool's defined spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schema as an explicit literal, and every
 * tools/call is validated by the core, which names the
 * offending path on invalid input.
 *
 * The computation is pure and local: no recording, no
 * fetching, no filesystem, and no network — the caller
 * supplies every event fact the summary is based on.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { formatPayload, summarizeTrace, VERSION } from "./agenttrace.js";

const TOOLS = [
  {
    name: "summarize_trace",
    description:
      "Summarize a caller-supplied agent tool-call trace: per-tool call, error, duration, and token statistics, the list of failed calls, and trace totals. Local computation only; nothing is recorded or fetched.",
    inputSchema: {
      type: "object" as const,
      properties: {
        events: {
          type: "array",
          description: "Tool-call events to summarize, in trace order",
          items: {
            type: "object",
            properties: {
              tool: {
                type: "string",
                description: "Name of the tool that was called",
              },
              started_at_ms: {
                type: "integer",
                description:
                  "Call start time in milliseconds (any epoch the caller chooses; only differences are used)",
              },
              duration_ms: {
                type: "integer",
                description: "Call duration in milliseconds",
              },
              status: {
                type: "string",
                description: "Call outcome: \"ok\" or \"error\"",
              },
              error: {
                type: "string",
                description: "Error message for a failed call (optional)",
              },
              input_tokens: {
                type: "integer",
                description: "Input tokens consumed by the call (optional)",
              },
              output_tokens: {
                type: "integer",
                description: "Output tokens produced by the call (optional)",
              },
            },
            required: ["tool", "started_at_ms", "duration_ms", "status"],
          },
        },
      },
      required: ["events"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "agenttrace", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let out: unknown;
    if (name === "summarize_trace") {
      out = summarizeTrace(args ?? {});
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
