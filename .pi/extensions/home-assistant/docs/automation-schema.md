# Home Assistant Automation Schema Reference

Complete reference for building automations via the `ha_automations` tool.
An automation config has: `alias`, `description`, `triggers[]`, `conditions[]`, `actions[]`, `mode`.

## Automation Modes

| Mode | Description |
|------|-------------|
| `single` | (default) Only one instance runs at a time. New triggers ignored while running. |
| `restart` | Running instance is stopped and restarted on new trigger. |
| `queued` | Runs queue up. Use `max` to limit queue depth (default 10). |
| `parallel` | Multiple instances run simultaneously. Use `max` to limit (default 10). |

---

## Triggers

Each trigger object requires `trigger` (the type). Optional common fields: `alias`, `id` (for trigger conditions), `variables`, `enabled`.

### state
Entity state changes.
```json
{ "trigger": "state", "entity_id": ["light.living_room"], "from": "off", "to": "on", "for": "00:05:00" }
```
| Field | Type | Description |
|-------|------|-------------|
| entity_id | string/string[] | **Required.** Entity ID(s) to watch |
| attribute | string | Watch a specific attribute instead of state |
| from | string/string[]/null | Previous state (null = any state ignoring attributes) |
| to | string/string[]/null | New state (null = any state ignoring attributes) |
| for | string/number/ForDict | How long state must be held (e.g., `"00:05:00"` or `{"minutes": 5}`) |

### numeric_state
Entity numeric value crosses a threshold.
```json
{ "trigger": "numeric_state", "entity_id": ["sensor.temperature"], "above": 25, "below": 30 }
```
| Field | Type | Description |
|-------|------|-------------|
| entity_id | string/string[] | **Required.** Entity ID(s) |
| attribute | string | Watch attribute instead of state |
| above | number | Trigger when value goes above this |
| below | number | Trigger when value goes below this |
| value_template | string | Template to compute the value |
| for | string/number/ForDict | Hold duration |

### time
Trigger at a specific time.
```json
{ "trigger": "time", "at": "07:30:00" }
{ "trigger": "time", "at": {"entity_id": "input_datetime.wake_up"} }
```
| Field | Type | Description |
|-------|------|-------------|
| at | string/object | **Required.** Time string `"HH:MM:SS"` or `{"entity_id": "...", "offset": "..."}` |
| weekday | string/string[] | Restrict to days: `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun` |

### time_pattern
Trigger on a recurring pattern.
```json
{ "trigger": "time_pattern", "minutes": "/5" }
```
| Field | Type | Description |
|-------|------|-------------|
| hours | number/string | Hour pattern (e.g., `/2` for every 2 hours) |
| minutes | number/string | Minute pattern (e.g., `/5` for every 5 minutes) |
| seconds | number/string | Second pattern |

### sun
Trigger at sunrise or sunset.
```json
{ "trigger": "sun", "event": "sunset", "offset": "-00:30:00" }
```
| Field | Type | Description |
|-------|------|-------------|
| event | string | **Required.** `"sunrise"` or `"sunset"` |
| offset | number/string | Offset from event (e.g., `"-00:30:00"` for 30 min before) |

### zone
Entity enters or leaves a zone.
```json
{ "trigger": "zone", "entity_id": "person.john", "zone": "zone.home", "event": "enter" }
```
| Field | Type | Description |
|-------|------|-------------|
| entity_id | string | **Required.** Person or device_tracker entity |
| zone | string | **Required.** Zone entity ID |
| event | string | **Required.** `"enter"` or `"leave"` |

### homeassistant
HA starts or shuts down.
```json
{ "trigger": "homeassistant", "event": "start" }
```
| Field | Type | Description |
|-------|------|-------------|
| event | string | **Required.** `"start"` or `"shutdown"` |

### event
Custom event fired.
```json
{ "trigger": "event", "event_type": "my_custom_event", "event_data": {"key": "value"} }
```
| Field | Type | Description |
|-------|------|-------------|
| event_type | string | **Required.** Event type name |
| event_data | object | Match specific event data |
| context | object | Match context: `{context_id, parent_id, user_id}` |

### template
Template evaluates to true.
```json
{ "trigger": "template", "value_template": "{{ states('sensor.temp') | float > 25 }}" }
```
| Field | Type | Description |
|-------|------|-------------|
| value_template | string | **Required.** Jinja2 template |
| for | string/number/ForDict | Hold duration |

### webhook
HTTP webhook received.
```json
{ "trigger": "webhook", "webhook_id": "my_hook", "allowed_methods": ["POST"], "local_only": true }
```
| Field | Type | Description |
|-------|------|-------------|
| webhook_id | string | **Required.** Unique webhook ID |
| allowed_methods | string[] | HTTP methods (default: `["POST", "PUT"]`) |
| local_only | boolean | Only accept local network requests |

### tag
NFC tag scanned.
```json
{ "trigger": "tag", "tag_id": "abc123", "device_id": "phone_1" }
```
| Field | Type | Description |
|-------|------|-------------|
| tag_id | string | **Required.** Tag ID |
| device_id | string | Specific device that scanned |

### calendar
Calendar event starts or ends.
```json
{ "trigger": "calendar", "entity_id": "calendar.work", "event": "start", "offset": "-00:15:00" }
```
| Field | Type | Description |
|-------|------|-------------|
| entity_id | string | **Required.** Calendar entity |
| event | string | **Required.** `"start"` or `"end"` |
| offset | string | Offset from event |

### conversation
Voice/text command matched.
```json
{ "trigger": "conversation", "command": ["turn on the lights", "lights on"] }
```
| Field | Type | Description |
|-------|------|-------------|
| command | string/string[] | **Required.** Sentence(s) to match |

### persistent_notification
Notification created/updated/removed.
```json
{ "trigger": "persistent_notification", "update_type": ["added"] }
```
| Field | Type | Description |
|-------|------|-------------|
| notification_id | string | Specific notification ID |
| update_type | string[] | `"added"`, `"removed"`, `"current"`, `"updated"` |

### geo_location
Geo-location source enters/leaves a zone.
```json
{ "trigger": "geo_location", "source": "earthquake", "zone": "zone.home", "event": "enter" }
```
| Field | Type | Description |
|-------|------|-------------|
| source | string | **Required.** Geo-location source |
| zone | string | **Required.** Zone entity ID |
| event | string | **Required.** `"enter"` or `"leave"` |

### device
Device-specific trigger (integration-dependent).
```json
{ "trigger": "device", "device_id": "abc123", "domain": "zwave_js", "type": "value_updated" }
```
Fields depend on the device integration.

---

## Conditions

Each condition requires `condition` (the type). Optional common fields: `alias`, `enabled`.

### state
```json
{ "condition": "state", "entity_id": "light.kitchen", "state": "on" }
{ "condition": "state", "entity_id": "climate.living", "attribute": "hvac_mode", "state": "heat" }
```
| Field | Type | Description |
|-------|------|-------------|
| entity_id | string | **Required.** Entity to check |
| state | string/number/string[] | **Required.** Expected state value(s) |
| attribute | string | Check attribute instead of state |
| for | string/number/ForDict | State must have been held for this duration |
| match | string | `"all"` or `"any"` when multiple states given |

### numeric_state
```json
{ "condition": "numeric_state", "entity_id": "sensor.temperature", "above": 20, "below": 30 }
```
| Field | Type | Description |
|-------|------|-------------|
| entity_id | string | **Required.** Entity to check |
| above | string/number | Value must be above this |
| below | string/number | Value must be below this |
| attribute | string | Check attribute instead of state |
| value_template | string | Template to compute value |

### time
```json
{ "condition": "time", "after": "22:00:00", "before": "06:00:00", "weekday": ["mon", "tue", "wed", "thu", "fri"] }
```
| Field | Type | Description |
|-------|------|-------------|
| after | string | After this time |
| before | string | Before this time |
| weekday | string/string[] | Day(s): `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun` |

### sun
```json
{ "condition": "sun", "after": "sunset", "after_offset": "-01:00:00", "before": "sunrise" }
```
| Field | Type | Description |
|-------|------|-------------|
| after | string | `"sunrise"` or `"sunset"` |
| before | string | `"sunrise"` or `"sunset"` |
| after_offset | number/string | Offset after the after event |
| before_offset | number/string | Offset before the before event |

### zone
```json
{ "condition": "zone", "entity_id": "person.john", "zone": "zone.home" }
```
| Field | Type | Description |
|-------|------|-------------|
| entity_id | string | **Required.** Person/device_tracker |
| zone | string | **Required.** Zone entity |

### template
```json
{ "condition": "template", "value_template": "{{ is_state('light.kitchen', 'on') }}" }
```
| Field | Type | Description |
|-------|------|-------------|
| value_template | string | **Required.** Must evaluate to true |

### trigger
Check which trigger fired (use trigger `id` field).
```json
{ "condition": "trigger", "id": "motion_detected" }
```
| Field | Type | Description |
|-------|------|-------------|
| id | string | **Required.** Trigger ID to match |

### and / or / not
Logical grouping of conditions.
```json
{ "condition": "and", "conditions": [
  { "condition": "state", "entity_id": "light.kitchen", "state": "on" },
  { "condition": "time", "after": "22:00:00" }
]}
```
| Field | Type | Description |
|-------|------|-------------|
| conditions | Condition[] | **Required.** List of sub-conditions |

---

## Actions

Actions are the most diverse. The type is determined by which key is present.

### Call a service/action
The most common action type.
```json
{ "action": "light.turn_on", "target": {"entity_id": "light.living_room"}, "data": {"brightness_pct": 80} }
```
| Field | Type | Description |
|-------|------|-------------|
| action | string | **Required.** Service to call (e.g., `"light.turn_on"`) |
| target | object | Target: `{entity_id, device_id, area_id}` (string or string[]) |
| data | object | Service data fields |
| response_variable | string | Store service response in a variable |

### delay
```json
{ "delay": "00:05:00" }
{ "delay": {"minutes": 5} }
```
| Field | Type | Description |
|-------|------|-------------|
| delay | string/number/object | **Required.** Duration: `"HH:MM:SS"`, seconds, or `{hours, minutes, seconds}` |

### wait_template
Wait until a template evaluates to true.
```json
{ "wait_template": "{{ is_state('light.kitchen', 'off') }}", "timeout": 300, "continue_on_timeout": true }
```
| Field | Type | Description |
|-------|------|-------------|
| wait_template | string | **Required.** Jinja2 template |
| timeout | number | Timeout in seconds |
| continue_on_timeout | boolean | Continue if timeout expires (default: true) |

### wait_for_trigger
Wait for a trigger to fire.
```json
{ "wait_for_trigger": [{"trigger": "state", "entity_id": "binary_sensor.door", "to": "off"}], "timeout": 120 }
```
| Field | Type | Description |
|-------|------|-------------|
| wait_for_trigger | Trigger[] | **Required.** Trigger(s) to wait for |
| timeout | number/string/object | Timeout duration |
| continue_on_timeout | boolean | Continue if timeout expires |

### event
Fire a custom event.
```json
{ "event": "my_custom_event", "event_data": {"key": "value"} }
```
| Field | Type | Description |
|-------|------|-------------|
| event | string | **Required.** Event type to fire |
| event_data | object | Event data payload |

### choose
Select action branch based on conditions (like switch/case).
```json
{
  "choose": [
    {
      "conditions": [{"condition": "state", "entity_id": "light.kitchen", "state": "on"}],
      "sequence": [{"action": "light.turn_off", "target": {"entity_id": "light.kitchen"}}]
    },
    {
      "conditions": [{"condition": "state", "entity_id": "light.kitchen", "state": "off"}],
      "sequence": [{"action": "light.turn_on", "target": {"entity_id": "light.kitchen"}}]
    }
  ],
  "default": [{"action": "notify.notify", "data": {"message": "Fallback"}}]
}
```
| Field | Type | Description |
|-------|------|-------------|
| choose | Option[] | **Required.** List of `{conditions: [], sequence: []}` branches |
| default | Action[] | Actions if no branch matches |

### if / then / else
Simple conditional.
```json
{
  "if": [{"condition": "state", "entity_id": "binary_sensor.motion", "state": "on"}],
  "then": [{"action": "light.turn_on", "target": {"entity_id": "light.hallway"}}],
  "else": [{"action": "light.turn_off", "target": {"entity_id": "light.hallway"}}]
}
```
| Field | Type | Description |
|-------|------|-------------|
| if | Condition[] | **Required.** Conditions to evaluate |
| then | Action[] | **Required.** Actions if conditions are true |
| else | Action[] | Actions if conditions are false |

### repeat
Loop actions.
```json
{ "repeat": {"count": 3, "sequence": [{"action": "light.toggle", "target": {"entity_id": "light.kitchen"}}]} }
{ "repeat": {"while": [{"condition": "state", "entity_id": "switch.pump", "state": "on"}], "sequence": [{"delay": 10}]} }
{ "repeat": {"until": [{"condition": "state", "entity_id": "sensor.temp", "state": "25"}], "sequence": [{"delay": 60}]} }
{ "repeat": {"for_each": ["light.a", "light.b"], "sequence": [{"action": "light.turn_on", "target": {"entity_id": "{{ repeat.item }}"}}]} }
```
| Variant | Required Fields |
|---------|----------------|
| count | `count` (number) + `sequence` |
| while | `while` (Condition[]) + `sequence` |
| until | `until` (Condition[]) + `sequence` |
| for_each | `for_each` (list) + `sequence` — use `{{ repeat.item }}` in actions |

### sequence
Run actions in order (used for grouping).
```json
{ "sequence": [{"action": "light.turn_on", "target": {"entity_id": "light.a"}}, {"delay": 5}] }
```

### parallel
Run actions simultaneously.
```json
{ "parallel": [
  {"action": "light.turn_on", "target": {"entity_id": "light.a"}},
  {"action": "light.turn_on", "target": {"entity_id": "light.b"}}
]}
```

### stop
Stop the automation (optionally with error).
```json
{ "stop": "Condition not met", "error": false }
{ "stop": "Something went wrong", "error": true, "response_variable": "result" }
```

### variables
Set variables for subsequent actions.
```json
{ "variables": {"brightness": "{{ states('input_number.brightness') | int }}"} }
```

### set_conversation_response
Set response for conversation trigger.
```json
{ "set_conversation_response": "OK, I turned on the lights" }
```

### device
Device-specific action (integration-dependent).
```json
{ "type": "toggle", "device_id": "abc123", "domain": "light", "entity_id": "light.desk" }
```

---

## ForDict Duration Format

Used in `for`, `delay`, and `timeout` fields:
```json
{"days": 0, "hours": 0, "minutes": 5, "seconds": 30, "milliseconds": 0}
```
Or as a string: `"00:05:30"` or number of seconds: `330`.

## Target Format

Used in service call actions:
```json
{"entity_id": "light.kitchen"}
{"entity_id": ["light.kitchen", "light.living_room"]}
{"area_id": "living_room"}
{"device_id": "abc123"}
```
Can combine: `{"entity_id": "light.a", "area_id": "bedroom"}`.

## Complete Example

```json
{
  "alias": "Evening Lights",
  "description": "Turn on lights at sunset, off at midnight",
  "mode": "single",
  "triggers": [
    {"trigger": "sun", "event": "sunset", "offset": "-00:15:00", "id": "sunset"},
    {"trigger": "time", "at": "00:00:00", "id": "midnight"}
  ],
  "conditions": [
    {"condition": "state", "entity_id": "input_boolean.vacation_mode", "state": "off"}
  ],
  "actions": [
    {
      "choose": [
        {
          "conditions": [{"condition": "trigger", "id": "sunset"}],
          "sequence": [
            {"action": "light.turn_on", "target": {"area_id": "living_room"}, "data": {"brightness_pct": 80}},
            {"action": "light.turn_on", "target": {"area_id": "kitchen"}, "data": {"brightness_pct": 60}}
          ]
        },
        {
          "conditions": [{"condition": "trigger", "id": "midnight"}],
          "sequence": [
            {"action": "light.turn_off", "target": {"area_id": ["living_room", "kitchen"]}}
          ]
        }
      ]
    }
  ]
}
```
