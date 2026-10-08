import Ajv from "ajv";
import { isAllowedTool } from "./tool-catalog.ts";
import { isObject, RequestError, type Context } from "./security.ts";
import type { McpTool } from "./mcp";

const ajv = new Ajv({ strict: false, allErrors: false, coerceTypes: false, removeAdditional: false });
const ticketTools = new Set(["get_one_ticket", "add_note_to_ticket", "action_ticket", "get_matches", "apply_suggestion"]);

export function authorizedTool(tool: McpTool, context: Context): boolean {
  return context.tools.includes(tool.name) && isAllowedTool(tool.name, tool);
}

export function prepareArgs(tool: McpTool, value: unknown, context: Context): Record<string, unknown> {
  if (!authorizedTool(tool, context) || !isObject(value)) throw new RequestError(403, "The tool is not authorized.");
  function inspect(value: unknown, depth: number): void {
    if (depth > 15) throw new RequestError(400, "Tool arguments are too deeply nested.");
    if (!value || typeof value !== "object") return;
    for (const [name, child] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(name)) throw new RequestError(400, "Invalid tool arguments.");
      if (/ticket.*ids?|ids?.*ticket/i.test(name)) {
        if (depth !== 0 || name !== "ticket_id" || String(child) !== context.ticketId) throw new RequestError(403, "The operation targeted a different ticket.");
      }
      inspect(child, depth + 1);
    }
  }
  inspect(value, 0);
  const args = { ...value };
  if (ticketTools.has(tool.name) || tool.name.startsWith("CF_")) args.ticket_id = Number(context.ticketId);
  try {
    if (!tool.inputSchema || !ajv.validate(tool.inputSchema, args)) throw new RequestError(400, "Tool arguments do not match the deployed schema.");
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, "The deployed tool schema is invalid.");
  } finally {
    // Tool schemas are fetched anew; keep Ajv's cache bounded across requests.
    if (tool.inputSchema) ajv.removeSchema(tool.inputSchema);
  }
  return args;
}
