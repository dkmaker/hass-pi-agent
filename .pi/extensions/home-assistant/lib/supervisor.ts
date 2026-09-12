/**
 * Shared Supervisor API helper.
 *
 * In the add-on the Supervisor API is called DIRECTLY over http://supervisor with
 * the add-on's SUPERVISOR_TOKEN — the HA Core WebSocket `supervisor/api` proxy is
 * NOT authorized for the add-on token (it returns "Unauthorized"). In local dev
 * there is no http://supervisor, so we fall back to the WS proxy (which works with
 * the admin token in .env). Both paths auto-unwrap the `{data: ...}` envelope.
 */
import { wsCommand } from "./ws.js";

const SUPERVISOR_BASE = "http://supervisor";

export async function supervisorApi<T = unknown>(
  endpoint: string,
  method: "get" | "post" | "delete" = "get",
  data?: Record<string, unknown>
): Promise<T> {
  const superTok = process.env.SUPERVISOR_TOKEN;

  // Add-on context: call Supervisor directly.
  if (superTok) {
    const res = await fetch(`${SUPERVISOR_BASE}${endpoint}`, {
      method: method.toUpperCase(),
      headers: {
        Authorization: `Bearer ${superTok}`,
        ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
    let body: unknown = null;
    try { body = await res.json(); } catch { /* non-JSON / empty */ }
    const b = body as { result?: string; message?: string; data?: unknown } | null;
    if (!res.ok || b?.result === "error") {
      throw new Error(b?.message || `Supervisor ${endpoint} failed (HTTP ${res.status})`);
    }
    return (b && typeof b === "object" && "data" in b ? b.data : body) as T;
  }

  // Local dev: go through the HA Core WS `supervisor/api` proxy (admin token).
  const msg: Record<string, unknown> = { endpoint, method };
  if (data !== undefined) msg.data = data;
  const result = await wsCommand<unknown>("supervisor/api", msg);
  if (
    result &&
    typeof result === "object" &&
    !Array.isArray(result) &&
    "data" in (result as Record<string, unknown>) &&
    Object.keys(result as Record<string, unknown>).length === 1
  ) {
    return (result as Record<string, unknown>).data as T;
  }
  return result as T;
}
