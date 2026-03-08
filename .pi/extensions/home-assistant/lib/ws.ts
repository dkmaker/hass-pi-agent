/**
 * Shared Home Assistant WebSocket client.
 *
 * Lazy-connects on first command, auto-authenticates, reuses connection.
 * Auto-reconnects on disconnect. Provides a simple command interface:
 *
 *   const devices = await wsCommand<Device[]>("config/device_registry/list");
 *   const updated = await wsCommand<Device>("config/device_registry/update", {
 *     device_id: "abc123", area_id: "living_room"
 *   });
 *
 * HA WebSocket protocol:
 *   1. Connect → receive { type: "auth_required" }
 *   2. Send { type: "auth", access_token: "..." }
 *   3. Receive { type: "auth_ok" }
 *   4. Send commands { id: N, type: "...", ...data }
 *   5. Receive { id: N, type: "result", success: bool, result: ... }
 */
import WebSocket from "ws";
import { HA_URL, HA_TOKEN } from "./config.js";

// ── Types ────────────────────────────────────────────────────

interface WSMessage {
  id?: number;
  type: string;
  success?: boolean;
  result?: unknown;
  error?: { code: string; message: string };
  [key: string]: unknown;
}

interface PendingCommand {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

// ── Connection state ─────────────────────────────────────────

let ws: WebSocket | null = null;
let authenticated = false;
let connecting: Promise<void> | null = null;
let msgId = 0;
const pending = new Map<number, PendingCommand>();
const subscriptions = new Map<number, (event: unknown) => void>();

// ── WebSocket URL ────────────────────────────────────────────

function getWsUrl(): string {
  // HA_URL is like http://supervisor/core or http://10.99.0.13:8123
  // WS URL is ws://supervisor/core/websocket or ws://10.99.0.13:8123/api/websocket
  const url = HA_URL.replace(/^http/, "ws");

  // Container: http://supervisor/core → ws://supervisor/core/websocket
  if (url.includes("/core")) {
    return `${url}/websocket`;
  }

  // Direct: http://host:port → ws://host:port/api/websocket
  return `${url}/api/websocket`;
}

// ── Connect + authenticate ───────────────────────────────────

function connect(): Promise<void> {
  if (connecting) return connecting;
  if (ws && authenticated) return Promise.resolve();

  connecting = new Promise<void>((resolve, reject) => {
    if (!HA_TOKEN) {
      connecting = null;
      reject(new Error("HA_TOKEN is not set. Set the HA_TOKEN environment variable or add it to your .env."));
      return;
    }

    const url = getWsUrl();
    const socket = new WebSocket(url);
    let authResolved = false;

    const timeout = setTimeout(() => {
      if (!authResolved) {
        authResolved = true;
        socket.close();
        connecting = null;
        reject(new Error(`WebSocket connection timeout to ${url}`));
      }
    }, 10_000);

    socket.on("open", () => {
      // Wait for auth_required message
    });

    socket.on("message", (data: WebSocket.Data) => {
      let msg: WSMessage;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      // Auth handshake
      if (msg.type === "auth_required") {
        socket.send(JSON.stringify({ type: "auth", access_token: HA_TOKEN }));
        return;
      }

      if (msg.type === "auth_ok") {
        clearTimeout(timeout);
        authResolved = true;
        ws = socket;
        authenticated = true;
        msgId = 0;
        connecting = null;
        resolve();
        return;
      }

      if (msg.type === "auth_invalid") {
        clearTimeout(timeout);
        authResolved = true;
        socket.close();
        connecting = null;
        reject(new Error(`WebSocket auth failed: ${msg.message || "invalid token"}`));
        return;
      }

      // Command responses
      if (msg.type === "result" && msg.id !== undefined) {
        const cmd = pending.get(msg.id);
        if (cmd) {
          pending.delete(msg.id);
          if (msg.success) {
            cmd.resolve(msg.result);
          } else {
            cmd.reject(new Error(
              msg.error?.message || `WS command ${msg.id} failed: ${msg.error?.code || "unknown"}`
            ));
          }
        }
      }

      // Subscription event messages
      if (msg.type === "event" && msg.id !== undefined) {
        const handler = subscriptions.get(msg.id);
        if (handler) handler(msg.event);
      }
    });

    socket.on("error", (err: Error) => {
      if (!authResolved) {
        clearTimeout(timeout);
        authResolved = true;
        connecting = null;
        reject(new Error(`WebSocket error: ${err.message}`));
      }
    });

    socket.on("close", () => {
      const wasAuthenticated = authenticated;
      ws = null;
      authenticated = false;
      connecting = null;

      // Reject all pending commands
      for (const [id, cmd] of pending) {
        cmd.reject(new Error("WebSocket connection closed"));
        pending.delete(id);
      }

      if (!authResolved) {
        clearTimeout(timeout);
        authResolved = true;
        reject(new Error("WebSocket closed before auth completed"));
      }
    });
  });

  return connecting;
}

// ── Public API ───────────────────────────────────────────────

/**
 * Send a WebSocket command and return the result.
 * Auto-connects and authenticates on first call.
 *
 * @param type - Command type (e.g., "config/device_registry/list")
 * @param data - Additional command data (merged with type and id)
 * @returns The result from HA
 */
export async function wsCommand<T = unknown>(
  type: string,
  data?: Record<string, unknown>
): Promise<T> {
  // Connect if needed (handles reconnect after disconnect)
  await connect();

  if (!ws || !authenticated) {
    throw new Error("WebSocket not connected");
  }

  const id = ++msgId;
  const msg = { id, type, ...data };

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`WebSocket command timeout: ${type} (id=${id})`));
    }, 30_000);

    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timeout);
        resolve(value as T);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    });

    ws!.send(JSON.stringify(msg));
  });
}

/**
 * Subscribe to events and collect them for a duration.
 * Returns collected events after the timeout expires.
 */
export async function wsSubscribe<T = unknown>(
  type: string,
  data: Record<string, unknown> = {},
  timeoutMs: number = 10_000,
  maxEvents: number = 200
): Promise<T[]> {
  await connect();
  if (!ws || !authenticated) throw new Error("WebSocket not connected");

  const id = ++msgId;
  const msg = { id, type, ...data };
  const collected: T[] = [];

  return new Promise<T[]>((resolve, reject) => {
    const timer = setTimeout(() => {
      subscriptions.delete(id);
      // Unsubscribe
      if (ws && authenticated) {
        const unsubId = ++msgId;
        ws.send(JSON.stringify({ id: unsubId, type: "unsubscribe_events", subscription: id }));
      }
      resolve(collected);
    }, timeoutMs);

    // Handle subscription result (success/failure)
    pending.set(id, {
      resolve: () => {
        // Subscription confirmed — events will come via the handler
      },
      reject: (err) => {
        clearTimeout(timer);
        subscriptions.delete(id);
        reject(err);
      },
    });

    // Handle incoming events
    subscriptions.set(id, (event: unknown) => {
      collected.push(event as T);
      if (collected.length >= maxEvents) {
        clearTimeout(timer);
        subscriptions.delete(id);
        if (ws && authenticated) {
          const unsubId = ++msgId;
          ws.send(JSON.stringify({ id: unsubId, type: "unsubscribe_events", subscription: id }));
        }
        resolve(collected);
      }
    });

    ws!.send(JSON.stringify(msg));
  });
}

/**
 * Close the WebSocket connection. Called on shutdown.
 */
export function wsClose(): void {
  if (ws) {
    ws.close();
    ws = null;
    authenticated = false;
    connecting = null;
  }
}

/**
 * Check if the WebSocket is currently connected and authenticated.
 */
export function wsConnected(): boolean {
  return ws !== null && authenticated;
}
