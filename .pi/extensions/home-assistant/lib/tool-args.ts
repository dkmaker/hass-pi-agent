/**
 * Tool-argument normalization shim.
 *
 * Some model providers deliver an object-typed tool parameter (e.g. `config`,
 * `data`) as a JSON *string* instead of a JSON object — especially for large or
 * deeply-nested values. Our tools declare those params as object schemas, so
 * without normalization the SDK's schema validation rejects the string with
 * "<param> must be object" before `execute` ever runs.
 *
 * `ToolDefinition.prepareArguments` runs BEFORE schema validation for exactly
 * this purpose. Each tool wires `prepareArguments: (a) => coerceJsonParams(a, [...])`
 * naming its object-typed params.
 *
 * Safety: `JSON.parse` rejects truncated/malformed JSON, so a *successful* parse
 * proves the payload was complete — a partial object never slips through. A
 * *failed* parse throws a clear, actionable error instead of a cryptic one.
 */
export function coerceJsonParams<T = Record<string, unknown>>(args: unknown, keys: string[]): T {
  if (!args || typeof args !== "object") return args as T;
  const out = { ...(args as Record<string, unknown>) };
  for (const key of keys) {
    const v = out[key];
    if (typeof v !== "string") continue;
    const s = v.trim();
    // Only touch values that are clearly a JSON object/array literal.
    if (!(s.startsWith("{") || s.startsWith("["))) continue;
    try {
      out[key] = JSON.parse(s);
    } catch (e) {
      throw new Error(
        `Tool parameter '${key}' arrived as a malformed/truncated JSON string ` +
          `(${v.length} chars) and could not be parsed: ${(e as Error).message}. ` +
          `Retry the call; if it persists, split the change into smaller updates.`,
      );
    }
  }
  return out as T;
}
