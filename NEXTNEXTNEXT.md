# NEXT: Activity, History & Event Tools

## Goal

Add tools for querying entity history, the logbook, long-term statistics, and live event capture — high-value for debugging, reporting, and building informed automations.

## Tools to Add

### 1. `ha_history` — Entity State History

Query historical state changes for entities over a time period.

**API:** `GET /api/history/period/<timestamp>?filter_entity_id=<id>&end_time=<ts>&minimal_response`

**Actions:**
- `get` — Get state history for one or more entities over a time range
- `stats` — Get statistics (min/max/mean/sum) for sensor entities

**Parameters:**
- `entity_id` (required) — single entity or comma-separated list
- `start` — ISO timestamp or relative like "1h", "24h", "7d" (default: 24h ago)
- `end` — ISO timestamp (default: now)
- `minimal` — boolean, return only state+timestamp (default: true, much faster)

**Use cases:**
- "When was the front door last opened?"
- "What was the temperature in the bedroom overnight?"
- "How many times did the motion sensor trigger today?"

### 2. `ha_logbook` — Event Logbook

Query the logbook for human-readable activity entries.

**API:** `GET /api/logbook/<timestamp>?entity=<id>&end_time=<ts>`

**Actions:**
- `get` — Get logbook entries, optionally filtered by entity/time

**Parameters:**
- `entity_id` — filter to specific entity
- `start` — ISO timestamp or relative (default: 24h ago)
- `end` — ISO timestamp (default: now)
- `limit` — max entries to return (default: 50)

**Use cases:**
- "What happened in the house today?"
- "Show me all activity for the garage door this week"
- "What triggered automation X?"

### 3. `ha_stats` — Long-Term Statistics

Query the long-term statistics database for sensor data (hourly/daily/monthly aggregates).

**API:** `WS type: recorder/statistics_during_period`

**Actions:**
- `get` — Get statistics for entities over a period
- `list` — List entities that have long-term statistics available

**Parameters:**
- `entity_id` — single or list
- `start` / `end` — time range
- `period` — `5minute`, `hour`, `day`, `week`, `month`
- `stat_types` — array of `mean`, `min`, `max`, `sum`, `state`, `change`

**Use cases:**
- "What was my average energy usage per day this month?"
- "Show me hourly temperature trends for the past week"
- "How much water did I use last month vs this month?"

### 4. `ha_events` — Live Event Listener

Subscribe to the HA event bus via WebSocket, capture events during a window, then query/filter the captured results. Designed for the troubleshooting loop: start listening, do the thing, see what happened.

**API:** `WS type: subscribe_events` (optionally filtered by event_type)

**Actions:**
- `listen` — Start capturing events (optional: event_type filter, duration in seconds, max count)
- `stop` — Stop an active listener early
- `get` — Return captured events from the last session, with optional filters
- `types` — List all event types that have fired recently

**Parameters:**
- `event_type` — filter to specific type (e.g., `state_changed`, `automation_triggered`, `call_service`, `zwave_js_value_notification`)
- `duration` — how long to listen in seconds (default: 30, max: 300)
- `max_events` — stop after N events captured (default: 500)
- `entity_id` — post-filter captured events by entity
- `search` — text search across event data

**Workflow — the troubleshooting loop:**
1. `ha_events listen event_type=state_changed duration=30` — starts capturing
2. User performs the action (presses a button, triggers a sensor, etc.)
3. Events are captured in memory with timestamps
4. Listener auto-stops after duration/max_events
5. `ha_events get` — shows what was captured
6. `ha_events get entity_id=switch.problem_switch` — filter to what matters

**Use cases:**
- "Listen for events while I press this Zigbee button, then show me what came through"
- "What service calls happen when this automation runs?"
- "Capture all state changes for 60 seconds while I test this scene"
- "Is this device sending any events at all?"

**Implementation notes:**
- WebSocket subscription runs in background, buffers events in memory
- Only one active listener at a time (simple)
- Events stored as array with timestamp + event_type + data
- `get` summarizes: "Captured 47 events in 30s: 38 state_changed, 6 call_service, 3 automation_triggered" then shows filtered detail
- Session data is ephemeral — cleared on next `listen`

## Implementation Notes

- History/logbook APIs are REST, statistics and events are WebSocket
- Relative time parsing ("1h", "7d") should be a shared utility in `lib/format.ts`
- Responses can be large — truncate/summarize intelligently
- Minimal response mode is important for history — full responses include all attributes per state change

## File Structure

```
tools/
├── ha-history.ts      # History + logbook (both REST, related)
├── ha-stats.ts        # Long-term statistics (WebSocket)
└── ha-events.ts       # Live event listener (WebSocket)
```

## Output Formatting

For history, summarize rather than dump raw data:
- State changes: count, first/last change, duration in each state
- Sensors: min/max/mean/current over the period
- Binary sensors: total on-time, number of triggers, last trigger

For logbook, show as a simple timeline:
```
10:32 AM  motion_sensor_hallway  detected motion
10:33 AM  light.hallway          turned on (by automation: Motion Lights)
10:48 AM  light.hallway          turned off
```

For events, summarize then detail:
```
Captured 47 events in 30s:
  38 state_changed
   6 call_service
   3 automation_triggered

Filtered to switch.problem_switch (3 events):
  10:32:01  state_changed  off → on
  10:32:01  call_service   switch.turn_on
  10:32:15  state_changed  on → off
```
