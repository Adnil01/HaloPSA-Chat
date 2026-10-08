function findContextValue(value: unknown, keys: string[]): unknown {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) { const result = findContextValue(item, keys); if (result !== undefined) return result; }
    return undefined;
  }
  for (const [key, child] of Object.entries(value)) {
    if (keys.includes(key.toLowerCase()) && (typeof child === "string" || typeof child === "number")) return child;
    const result = findContextValue(child, keys);
    if (result !== undefined) return result;
  }
  return undefined;
}

export function firstName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned.includes("@")) return undefined;
  return cleaned.split(" ")[0].replace(/[^\p{L}\p{M}'-]/gu, "");
}

function extractText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const content = (value as { content?: unknown }).content;
  if (!Array.isArray(content)) return JSON.stringify(value);
  return content.map(item => typeof item === "object" && item && "text" in item ? String((item as { text: unknown }).text) : JSON.stringify(item)).join("\n");
}
export function findMcpContextValue(value: unknown, keys: string[]): unknown {
  const direct = findContextValue(value, keys);
  if (direct !== undefined) return direct;
  const text = extractText(value);
  try { return findContextValue(JSON.parse(text), keys); } catch { return undefined; }
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function formatEmailBody(value: string): string {
  const lines = value.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\n").replaceAll("\r", "").split("\n");
  const output: string[] = [];
  let inOrderedList = false;
  const closeList = () => { if (inOrderedList) { output.push("</ol>", "<br />"); inOrderedList = false; } };
  for (const line of lines) {
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (numbered) {
      if (!inOrderedList) { output.push("<ol>"); inOrderedList = true; }
      output.push(`<li>${escapeHtml(numbered[1])}</li>`);
    } else if (!line.trim()) {
      closeList();
      output.push("<br />");
    } else {
      closeList();
      output.push(escapeHtml(line.trim()), "<br />");
    }
  }
  closeList();
  return output.join("\n").replace(/(?:<br \/>\n?)+$/i, "");
}
function applyEmailConventions(value: string, endUserFirstName?: string, agentFirstName?: string): string {
  if (!endUserFirstName || !agentFirstName) return value;
  let content = value.replace(/^\s*(?:hi|hello|dear)\s+[^,\n]+,\s*/i, "");
  content = content.replace(/\s*(?:kind regards|best regards|regards|sincerely),?\s*[\r\n]+[^\r\n]*\s*$/i, "").trim();
  return `Hi ${endUserFirstName},\n\n${content}\n\nRegards,\n${agentFirstName}`;
}
export function normaliseToolArguments(toolName: string, args: Record<string, unknown>, endUserFirstName?: string, agentFirstName?: string): Record<string, unknown> {
  if (toolName.toLowerCase() === "cf_sendemail") {
    const formatted = { ...args };
    if (typeof formatted.note_html === "string") formatted.note_html = formatEmailBody(applyEmailConventions(formatted.note_html, endUserFirstName, agentFirstName));
    if (typeof formatted.body === "string") formatted.body = formatEmailBody(applyEmailConventions(formatted.body, endUserFirstName, agentFirstName));
    return formatted;
  }
  if (toolName.toLowerCase() === "cf_resolve_ticket" && typeof args.resolution_note === "string") {
    return { ...args, resolution_note: applyEmailConventions(args.resolution_note, endUserFirstName, agentFirstName) };
  }
  return args;
}
