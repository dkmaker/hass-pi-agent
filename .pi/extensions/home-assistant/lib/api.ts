/**
 * Shared Home Assistant REST API helpers.
 *
 * Centralizes auth token checks, GET/POST requests, and service calls
 * so tool files don't duplicate this logic.
 */
import { HA_URL, HA_TOKEN } from "./config.js";

/**
 * Throw if no API token is configured.
 */
export function requireToken(): void {
  if (!HA_TOKEN) {
    throw new Error(
      "HA_TOKEN is not set. Set the HA_TOKEN environment variable or add it to your .env."
    );
  }
}

/**
 * GET request to the HA REST API.
 */
export async function apiGet<T>(path: string): Promise<T> {
  requireToken();
  const resp = await fetch(`${HA_URL}${path}`, {
    headers: { Authorization: `Bearer ${HA_TOKEN}` },
  });
  if (!resp.ok) throw new Error(`HA API ${resp.status}: ${await resp.text()}`);
  return resp.json() as Promise<T>;
}

/**
 * POST request to the HA REST API.
 */
export async function apiPost<T = unknown>(path: string, data?: unknown): Promise<T> {
  requireToken();
  const resp = await fetch(`${HA_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HA_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });
  if (!resp.ok) throw new Error(`HA API ${resp.status}: ${await resp.text()}`);
  return resp.json() as Promise<T>;
}

/**
 * Call a HA service. Handles connection resets gracefully (expected during restart).
 */
export async function callService(
  domain: string,
  service: string,
  data?: Record<string, unknown>
): Promise<string> {
  requireToken();
  try {
    const resp = await fetch(`${HA_URL}/api/services/${domain}/${service}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HA_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    if (resp.ok || resp.status === 504) {
      return "✅";
    }
    throw new Error(`Unexpected status ${resp.status}: ${await resp.text()}`);
  } catch (err: any) {
    // Connection reset = HA restarted mid-request (expected for restart)
    if (
      err.code === "ECONNRESET" ||
      err.code === "ECONNREFUSED" ||
      err.cause?.code === "ECONNRESET" ||
      err.cause?.code === "ECONNREFUSED"
    ) {
      return "✅";
    }
    throw err;
  }
}
