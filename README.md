# HaloPSA AI Chat Integration

Next.js ticket assistant embedded in a HaloPSA Custom Tab. The API uses a Halo service identity, so technician permissions must be enforced by the trusted launch backend and this app.

## Security migration: configure before deployment

This version rejects old unsigned `ticket_id`/`agent_id` launch URLs. `REQUIRE_SIGNED_CONTEXT=false`, the legacy signature, and browser-supplied context no longer grant access. A static Halo Custom Tab URL cannot authenticate a technician.

1. Set the server environment values in `.env.example`. Use Node 24. Set `APP_ORIGIN` to the exact assistant origin and `FRAME_ANCESTORS` to your exact Halo tenant origin.
2. Generate independent random secrets for `IFRAME_CONTEXT_SECRET` and `CONFIRMATION_SECRET`, e.g. `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Never put these in browser code, `NEXT_PUBLIC_*` variables, URLs, tickets, or the repository.
3. Configure a shared Redis REST service (e.g. Upstash) using `SECURITY_REDIS_REST_URL` and `SECURITY_REDIS_REST_TOKEN`. Its credential needs atomic `SET ... EX ... NX` and `EVAL`/`INCR`/`EXPIRE`. All app instances must use the same store. An unavailable store blocks requests. `SECURITY_STORE=memory` works only outside production.
4. Integrate a trusted launch backend with the authenticated Halo technician session. Before issuing a launch, verify the technician's identity, current ticket access, and allowed operations. Derive `agentId` from that session; never sign arbitrary browser-supplied identity/ticket/tool lists. The launch backend must enforce its own request limits and HTTPS.
5. Call the server-only helper in `src/lib/launch.ts` **after authorization**:

   ```ts
   const iframeUrl = issueAuthorizedLaunch({
     ticketId: authorizedTicketId,
     agentId: authenticatedAgentId,
     tools: operationsGrantedByYourPolicy,
   });
   ```

   The helper requires `APP_ORIGIN` and `IFRAME_CONTEXT_SECRET`. It issues a 15-minute bearer capability bound to audience, agent, ticket, session, and exact tool names. This repository supplies the helper, **not your authenticated Halo launch backend**. Configure the Custom Tab to obtain its iframe URL from that backend.
6. Test the authenticated launch and denied ticket/tool permissions in staging before merging/deploying. Reopening the tab obtains a fresh capability. Rotate the signing secret to invalidate all existing capabilities. Removing agent access takes effect at expiry (at most 15 minutes); immediate per-session revocation requires additional issuer/store integration.

Launch tokens use the URL fragment, which the client removes from browser history. They stay in memory and travel as `Authorization: Bearer ...` to the API. Fragments are not HTTP query parameters. Do not log complete launch URLs on the issuer. Signed conversation tokens are authenticated, **not encrypted**: they contain conversation text. Treat both token types as sensitive and exclude them from analytics/storage.

## Tools and confirmations

The server policy and the signed capability must both permit a tool. Only live MCP tools are exposed; local schemas cannot invent undeployed tools. Defaults cover the current ticket, knowledge lookups, ticket actions, and documented CF runbooks. Broader tenant searches need an exact `MCP_ALLOWED_TOOLS` entry and a matching grant from the launch backend. Grant these only after checking corresponding tenant permissions. Review configured custom tools for aliases and indirect resource selection; the app cannot infer a runbook's internal authorization from its schema.

`CF_sendemail`, `CF_Post_Private_Note`, `CF_Reassign_Ticket`, `CF_Resolve_Ticket`, and `CF_Escalate_Ticket` require confirmation. Live schemas define their real parameters; the catalog documents recommended contracts. Known writes and unknown tools remain writes even if MCP labels them read-only. Service-identity operations such as `assign_to_me`, `log_time`, `get_user_info`, `get_assigned_tickets`, unscoped ticket creation, and service requests are disabled. Use explicit-agent runbooks for technician attribution.

The app injects the authenticated `ticket_id` for ticket tools and CF runbooks, rejects conflicting/nested ticket selectors, and validates against the live JSON schema. The confirmation displays the complete arguments, including recipients and body. Signatures bind the exact action, arguments, conversation, agent, ticket, and session. Redis consumes each nonce atomically **before** execution. Concurrent requests and other workers cannot reuse it. If a write times out, the approval stays consumed: check Halo before requesting a new action. A new, separately approved action can still duplicate an earlier uncertain operation.

The browser submits only its latest text and server-signed history. Arbitrary browser `messages`, ticket IDs, agent IDs, summaries, and descriptions cannot replace authenticated context/history. Ticket/tool content remains untrusted model input; model instructions never grant permissions. Rate limits use the authenticated agent across tickets/sessions and ignore forwarded IP headers. Bodies are limited during streaming regardless of `Content-Length`. MCP/OAuth redirects are rejected, upstream calls have timeouts, and logs omit sensitive upstream errors.

## Validation

```sh
npm ci
npm test
npm run typecheck
npm run build
npm audit --audit-level=high
```

Direct dependencies are pinned; the committed lockfile freezes transitive dependencies. A PostCSS override updates Next.js's vulnerable transitive dependency without requiring a framework major upgrade. CI installs the patched versions, tests authentication/authorization, replay, history tampering, schemas and body limits, and runs the build and audit. Dependabot checks npm and action updates weekly. No live Halo/OpenAI credentials are needed for tests or builds.

Exact-tenant framing and per-request CSP script nonces require dynamic rendering. Frame origins must be HTTPS without paths/wildcards. For development use `APP_ORIGIN=http://localhost:3000` and the memory store; signed launches remain mandatory.

## Operational items outside this repository

These changes do not alter Vercel/Halo account settings. Configure the launch backend, shared store and deployment secrets; review the service account's allowed API operations/data scope; rotate credentials known to have been exposed; and configure provider-side limits for unauthenticated traffic. Set GitHub required checks/branch protection, secret scanning and production audit logging in their services. Repository tests do not establish that a live deployment or its credentials have never been compromised.
