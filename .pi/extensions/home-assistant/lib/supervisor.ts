/**
 * Shared Supervisor API helper.
 *
 * All Supervisor endpoints are accessed via the WebSocket `supervisor/api` proxy.
 * This helper wraps that pattern and auto-unwraps the `{data: ...}` wrapper.
 */
import { wsCommand } from "./ws.js";

export async function supervisorApi<T = unknown>(
  endpoint: string,
  method: "get" | "post" | "delete" = "get",
  data?: Record<string, unknown>
): Promise<T> {
  const msg: Record<string, unknown> = { endpoint, method };
  if (data !== undefined) msg.data = data;

  const result = await wsCommand<unknown>("supervisor/api", msg);

  // Supervisor wraps responses in { data: ... } — unwrap if present
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
