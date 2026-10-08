import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseToolArguments, findMcpContextValue, firstName } from "../src/lib/communication.ts";

test("MCP JSON text supplies communication style and real first names", () => {
  const value = { content: [{ type: "text", text: JSON.stringify({ CFTechnicianCommunicationStyle: "concise", first_name: "Alex Merchant" }) }] };
  assert.equal(findMcpContextValue(value, ["cftechniciancommunicationstyle"]), "concise");
  assert.equal(firstName(findMcpContextValue(value, ["first_name"])), "Alex");
});

test("email paragraphs, list numbering and greetings survive safe HTML formatting", () => {
  const result = normaliseToolArguments("CF_sendemail", { ticket_id: 2186, note_html: "Hello Bob,\n\nPlease follow these steps:\n1. Open Outlook\n2. Sign in\n\nRegards,\nOld Agent" }, "Bob", "Alex");
  assert.equal(result.ticket_id, 2186);
  assert.match(String(result.note_html), /^Hi Bob,/);
  assert.match(String(result.note_html), /<ol>\n<li>Open Outlook<\/li>\n<li>Sign in<\/li>/);
  assert.match(String(result.note_html), /Regards,\s*<br \/>\s*Alex\s*$/);
  assert.ok(!String(result.note_html).includes("Old Agent"));
});

test("model-supplied HTML cannot inject scripts, images or active links into Halo", () => {
  const result = normaliseToolArguments("CF_sendemail", { note_html: '<img src=x onerror=alert(1)><script>alert(1)</script><a href="javascript:alert(1)">click</a>' }, "Bob", "Alex");
  assert.ok(!/<(?:script|img|a)\b/.test(String(result.note_html)));
  assert.match(String(result.note_html), /&lt;script&gt;/);
});
