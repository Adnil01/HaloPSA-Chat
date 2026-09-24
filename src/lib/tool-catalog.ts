import type { McpTool } from "./mcp";

const object = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
});

const number = (description: string) => ({ type: "number", description });
const string = (description: string) => ({ type: "string", description });

/**
 * Built-in Halo tools supplied in the MCP export. Keeping this small catalog
 * locally means the assistant can still advertise the tools when a particular
 * MCP deployment does not include them in listTools(). The live MCP schema wins
 * whenever the server returns one.
 */
export const BUILT_IN_TOOLS: McpTool[] = [
  { name: "get_user_info", description: "Check the currently logged-in user's name and email address.", inputSchema: object({}), readOnly: true },
  { name: "get_knowledge", description: "Search the HaloPSA knowledge base.", inputSchema: object({ search: string("The search term."), page_number: { type: "integer", description: "Optional result page." } }, ["search"]), readOnly: true },
  { name: "log_service_request", description: "Search service catalogue requests available to the user.", inputSchema: object({ search: string("The search term."), page_number: { type: "integer", description: "Optional result page." } }, ["search"]) },
  { name: "get_assigned_tickets", description: "Retrieve tickets assigned to the current user.", inputSchema: object({ page_number: { type: "integer", description: "Optional result page." } }), readOnly: true },
  { name: "search_tickets", description: "Search tickets by a search term.", inputSchema: object({ search: string("The search term."), open_only: { type: "boolean", description: "Only return open tickets." }, page_number: { type: "integer", description: "Optional result page." } }, ["search"]), readOnly: true },
  { name: "get_one_ticket", description: "Retrieve a specific ticket, including history, available actions, and suggestions.", inputSchema: object({ ticket_id: number("The numeric ticket ID.") }), readOnly: true },
  { name: "add_note_to_ticket", description: "Add a public note to a ticket.", inputSchema: object({ ticket_id: number("The numeric ticket ID."), note: string("The public note text.") }, ["ticket_id", "note"]) },
  { name: "action_ticket", description: "Perform an available action on a ticket. First use get_one_ticket to identify the action ID.", inputSchema: object({ ticket_id: number("The numeric ticket ID."), action_id: number("The action ID from the ticket.") }, ["ticket_id", "action_id"]) },
  { name: "get_matches", description: "Refresh matched tickets, knowledge articles, and suggestions for a ticket.", inputSchema: object({ ticket_id: number("The numeric ticket ID.") }, ["ticket_id"]) },
  { name: "apply_suggestion", description: "Apply one or more ticket suggestions.", inputSchema: object({ ticket_id: number("The numeric ticket ID."), suggestion_ids: string("Comma-separated suggestion IDs.") }, ["ticket_id", "suggestion_ids"]) },
  { name: "assign_to_me", description: "Assign a ticket to the current user.", inputSchema: object({ ticket_id: number("The numeric ticket ID.") }, ["ticket_id"]) },
  { name: "create_ticket", description: "Create a new ticket for a user.", inputSchema: object({ user_email: string("The user's email."), summary: string("The ticket summary, maximum 70 characters."), description: string("The issue description."), ticket_type: string("Optional ticket type.") }, ["user_email", "summary", "description"]) },
  { name: "log_time", description: "Add time to the current user's timesheet.", inputSchema: object({ hours: number("Decimal hours."), note: string("The time-entry description.") }, ["hours", "note"]) },
  { name: "get_one_article", description: "Retrieve a specific knowledge article.", inputSchema: object({ article_id: number("The article ID.") }), readOnly: true },
  { name: "get_users", description: "Search users.", inputSchema: object({ search: string("The search term."), page_number: { type: "integer", description: "Optional result page." } }, ["search"]), readOnly: true },
  { name: "get_one_user", description: "Retrieve a specific user.", inputSchema: object({ user_id: number("The user ID.") }, ["user_id"]), readOnly: true },
  { name: "get_sites", description: "Search sites.", inputSchema: object({ search: string("The search term."), page_number: { type: "integer", description: "Optional result page." } }, ["search"]), readOnly: true },
  { name: "get_one_site", description: "Retrieve a specific site.", inputSchema: object({ site_id: { type: "integer", description: "The site ID." } }), readOnly: true },
  { name: "get_clients", description: "Search clients.", inputSchema: object({ search: string("The search term."), page_number: { type: "integer", description: "Optional result page." } }, ["search"]), readOnly: true },
  { name: "get_one_client", description: "Retrieve a specific client.", inputSchema: object({ client_id: { type: "integer", description: "The client ID." } }), readOnly: true },
  { name: "get_assets", description: "Search assets or devices.", inputSchema: object({ search: string("The search term."), page_number: { type: "integer", description: "Optional result page." } }), readOnly: true },
  { name: "get_one_asset", description: "Retrieve a specific asset.", inputSchema: object({ asset_id: number("The asset ID.") }, ["asset_id"]), readOnly: true },
];

/** Recommended parameter contracts for the custom runbooks. */
export const CUSTOM_ACTION_TOOLS: McpTool[] = [
  {
    name: "CF_sendemail",
    description: "Send an email through the configured HaloPSA runbook. Ask for confirmation before sending.",
    inputSchema: object({
      ticket_id: number("The current ticket ID."),
      to: string("Recipient email address or comma-separated addresses."),
      subject: string("Email subject."),
      body: string("Email body."),
    }, ["ticket_id", "to", "subject", "body"]),
    write: true,
  },
  {
    name: "CF_Post_Private_Note",
    description: "Post a private/internal note to the current ticket. Ask for confirmation before posting.",
    inputSchema: object({ ticket_id: number("The current ticket ID."), note: string("The private note text.") }, ["ticket_id", "note"]),
    write: true,
  },
  {
    name: "CF_Reassign_Ticket",
    description: "Reassign the current ticket to another technician or team. Ask for confirmation before changing ownership.",
    inputSchema: object({ ticket_id: number("The current ticket ID."), agent_id: number("The destination agent ID."), team_id: number("Optional destination team/section ID."), reason: string("Optional reason for the reassignment.") }, ["ticket_id", "agent_id"]),
    write: true,
  },
  {
    name: "CF_Resolve_Ticket",
    description: "Resolve or close the current ticket using the configured HaloPSA runbook. Ask for confirmation before resolving.",
    inputSchema: object({ ticket_id: number("The current ticket ID."), resolution_note: string("The resolution or closure note."), resolution_code: string("Optional resolution code or outcome."), status_id: number("Optional HaloPSA status ID if the runbook requires it.") }, ["ticket_id", "resolution_note"]),
    write: true,
  },
  {
    name: "CF_Escalate_Ticket",
    description: "Escalate the current ticket to the configured team or technician. Ask for confirmation before escalating.",
    inputSchema: object({ ticket_id: number("The current ticket ID."), reason: string("The escalation reason."), target_team_id: number("Optional destination team/section ID."), target_agent_id: number("Optional destination agent ID."), priority: string("Optional escalation priority.") }, ["ticket_id", "reason"]),
    write: true,
  },
];

export function mergeMcpTools(liveTools: McpTool[]): McpTool[] {
  const byName = new Map<string, McpTool>();
  for (const tool of [...BUILT_IN_TOOLS, ...CUSTOM_ACTION_TOOLS, ...liveTools]) byName.set(tool.name, tool);
  return [...byName.values()];
}

export function isWriteTool(toolName: string, tool?: McpTool): boolean {
  if (tool?.write === true) return true;
  if (tool?.readOnly === true || tool?.annotations?.readOnlyHint === true) return false;
  const configured = (process.env.CF_ALLOWED_WRITE_TOOLS || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  return [
    "add_note_to_ticket", "action_ticket", "get_matches", "apply_suggestion", "assign_to_me",
    "create_ticket", "log_time", "log_service_request",
  ].includes(toolName) || toolName === "CF_sendemail" || /^CF_(Post_Private_Note|Reassign_Ticket|Resolve_Ticket|Escalate_Ticket)$/i.test(toolName) || configured.includes(toolName.toLowerCase());
}

export function isAllowedTool(toolName: string, tool?: McpTool): boolean {
  if (toolName.startsWith("CF_")) {
    const configured = (process.env.CF_ALLOWED_WRITE_TOOLS || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
    return CUSTOM_ACTION_TOOLS.some(t => t.name.toLowerCase() === toolName.toLowerCase()) || configured.includes(toolName.toLowerCase()) || tool?.readOnly === true || tool?.annotations?.readOnlyHint === true;
  }
  return BUILT_IN_TOOLS.some(t => t.name === toolName);
}
