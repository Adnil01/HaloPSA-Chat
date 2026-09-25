# HaloPSA AI Chat Integration

Secure, stateless Next.js chatbot designed to run in a HaloPSA Custom Tab iframe.

## Features

- Server-only OpenAI and HaloPSA credentials
- HaloPSA OAuth 2.0 client-credentials token flow
- Stateless chat requests; no application database
- MCP tool discovery and OpenAI function-calling loop
- Built-in HaloPSA tools plus allowlisted custom CF runbooks
- Automatic prioritisation of tools to stay within OpenAI's 128-tool limit
- Server-enforced confirmation for write operations
- Dynamic agent persona and ticket context fetched through MCP
- Strict iframe-aware security headers
- Responsive dark-mode chat UI

## Setup

1. Install Node.js 20.9+.
2. Copy `.env.example` to `.env.local` and fill in the server-side values.
3. Install dependencies and run the development server:

```bash
npm install
npm run dev
```

4. Deploy to Vercel and configure the same environment variables there.
5. Add the deployed URL as a HaloPSA Custom Tab URL:

```text
https://your-domain.example/?ticket_id=<<ticket_id>>&agent_id=<<agent_id>>&ticket_summary=<<summary>>&ticket_description=<<description>>&context_signature=<<signature>>
```

## Environment variables

Required server-side values are `OPENAI_API_KEY`, `HALOPSA_BASE_URL`, `HALO_TOKEN_URL` (or a token URL that can provide the base host), `HALOPSA_CLIENT_ID`, `HALOPSA_CLIENT_SECRET`, and `MCP_URL`. If `HALO_TOKEN_URL` does not contain a tenant query parameter, `HALOPSA_TENANT` is added automatically. `HALOPSA_TENANT_DOMAIN` is available for deployment configuration and tenant identification. The MCP endpoint must accept the resulting OAuth bearer token. The browser only needs to provide `ticket_id`; the server retrieves full ticket details and history from HaloPSA REST `/api/Tickets/{id}?includedetails=true`, while MCP remains available for assistant tools and actions.

`MCP_GET_TICKET_TOOL`, `MCP_GET_AGENT_TOOL`, and `MCP_AGENT_PERSONA_FIELD` can be changed to match your MCP server. `MCP_GET_AGENT_TOOL` is optional. The default model is `gpt-4o-mini`; use `gpt-4o` when a more capable model is required.

`CONFIRMATION_SECRET` is required for write operations. It must be a long random server-only value. The application will ask the technician to confirm before executing public notes, ticket actions, time logging, email, or custom CF runbooks. `RATE_LIMIT_MAX_REQUESTS` controls the per-minute request limit, and `TONE_CACHE_TTL_SECONDS` controls how long agent context is cached in server memory.

If your actual runbook names differ from the recommended names, add their exact comma-separated names to `CF_ALLOWED_WRITE_TOOLS`. Do not allow every `CF_*` tool as writable; the MCP export contains many read-only reports as well as action-capable runbooks.

For stronger protection, set `REQUIRE_SIGNED_CONTEXT=true` and configure `IFRAME_CONTEXT_SECRET`. The trusted parent or proxy must create an HMAC-SHA256 signature over `ticket_id|agent_id|ticket_summary|ticket_description` and provide it as `context_signature`. Without a signed context or another authenticated HaloPSA identity layer, the service account remains the authorization boundary.

## Custom runbook contracts

Configure these custom runbooks in HaloPSA with the exact tool names below. Each runbook should expose the listed parameters and pass them into the runbook using the same names:

| Tool name | Parameters | Purpose |
| --- | --- | --- |
| `CF_sendemail` | `ticket_id` (number), `to` (string), `subject` (string), `body` (string) | Send an email related to the ticket |
| `CF_Post_Private_Note` | `ticket_id` (number), `note` (string) | Add an internal/private note |
| `CF_Reassign_Ticket` | `ticket_id` (number), `agent_id` (number), `team_id` (number, optional), `reason` (string, optional) | Reassign ownership |
| `CF_Resolve_Ticket` | `ticket_id` (number), `resolution_note` (string), `resolution_code` (string, optional), `status_id` (number, optional) | Resolve or close the ticket |
| `CF_Escalate_Ticket` | `ticket_id` (number), `reason` (string), `target_team_id` (number, optional), `target_agent_id` (number, optional), `priority` (string, optional) | Escalate the ticket |

The exact HaloPSA runbook action that receives each value depends on your runbook design. The MCP tool must return the corresponding schema from `listTools`; the application uses that live schema when it is available.

## Security notes

- Do not prefix secrets with `NEXT_PUBLIC_`.
- The browser never receives credentials, MCP URLs, raw tool schemas, or API responses from HaloPSA.
- OAuth tokens are held only in server memory, reused until shortly before expiry, and never logged or serialized to the client.
- The API validates identifiers and message sizes, limits tool iterations, and does not log message contents or secrets.
- Write-capable MCP tools are allowlisted and require a short-lived, server-signed confirmation before execution.
- Every ticket-changing tool is restricted to the ticket ID supplied for the current iframe.
- The browser cannot execute arbitrary MCP tools returned by the server.
- Configure the HaloPSA tenant and deployment domain in `FRAME_ANCESTORS` if your tenant uses a hostname outside the defaults.
