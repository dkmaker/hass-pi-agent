#!/usr/bin/env python3
"""
Extract automation element schemas from Home Assistant frontend source code.

Parses the ha-frontend/ checkout to generate a JSON schema catalog describing
all trigger, condition, and action types with their fields, types, and defaults.

Usage:
    python3 tools/extract-automation-schemas.py [--frontend PATH] [--output PATH]

Defaults:
    --frontend  ./ha-frontend
    --output    .pi/extensions/home-assistant/schemas/automation-elements.json

Sources parsed:
    ha-frontend/src/data/automation.ts   — trigger + condition interfaces
    ha-frontend/src/data/script.ts       — action interfaces
    ha-frontend/src/data/trigger.ts      — trigger UI groups
    ha-frontend/src/data/condition.ts    — condition UI groups + building blocks
    ha-frontend/src/panels/config/automation/trigger/types/*.ts   — trigger defaultConfig
    ha-frontend/src/panels/config/automation/condition/types/*.ts  — condition defaultConfig
    ha-frontend/src/panels/config/automation/action/types/*.ts     — action defaultConfig
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

# ── Constants ────────────────────────────────────────────────

DATA_DIR = "src/data"
TRIGGER_EDITORS = "src/panels/config/automation/trigger/types"
CONDITION_EDITORS = "src/panels/config/automation/condition/types"
ACTION_EDITORS = "src/panels/config/automation/action/types"

# Base fields inherited by all triggers (from BaseTrigger interface)
BASE_TRIGGER_FIELDS = {
    "alias": {"type": "string", "required": False, "description": "Optional display name"},
    "id": {"type": "string", "required": False, "description": "Trigger ID for trigger conditions"},
    "variables": {"type": "Record<string, unknown>", "required": False, "description": "Variables to set when trigger fires"},
    "enabled": {"type": "boolean", "required": False, "description": "Enable/disable this trigger"},
}

# Base fields inherited by all conditions (from BaseCondition interface)
BASE_CONDITION_FIELDS = {
    "alias": {"type": "string", "required": False, "description": "Optional display name"},
    "enabled": {"type": "boolean", "required": False, "description": "Enable/disable this condition"},
}

# Base fields inherited by all actions (from BaseAction interface)
BASE_ACTION_FIELDS = {
    "alias": {"type": "string", "required": False, "description": "Optional display name"},
    "continue_on_error": {"type": "boolean", "required": False, "description": "Continue automation if this action errors"},
    "enabled": {"type": "boolean", "required": False, "description": "Enable/disable this action"},
}


# ── TypeScript interface parser ──────────────────────────────

def parse_ts_interfaces(filepath: Path) -> dict[str, dict]:
    """Parse TypeScript interfaces from a file, returning {name: {fields}} dict."""
    text = filepath.read_text()
    interfaces = {}

    # Match: export interface Name extends Base { ... }
    # Also: interface Name extends Base { ... }
    # Use a brace-counting approach for the body
    pattern = re.compile(
        r'(?:export\s+)?interface\s+(\w+)'
        r'(?:\s+extends\s+([\w\s,<>]+?))?'
        r'\s*\{',
        re.DOTALL
    )

    for m in pattern.finditer(text):
        name = m.group(1)
        extends = m.group(2)
        # Extract body by counting braces
        start = m.end()  # position after the opening {
        depth = 1
        pos = start
        while pos < len(text) and depth > 0:
            if text[pos] == '{':
                depth += 1
            elif text[pos] == '}':
                depth -= 1
            pos += 1
        body = text[start:pos - 1]

        fields = {}
        parents = []
        if extends:
            parents = [p.strip() for p in extends.split(",")]

        # Parse fields line by line to handle complex types
        for line in body.split('\n'):
            line = line.strip()
            # Skip comments, empty lines
            if not line or line.startswith('//') or line.startswith('/*') or line.startswith('*'):
                continue
            # Match: name?: type; or name: type;
            fm = re.match(r'(?:\/\*\*.*?\*\/\s*)?(\w+)(\??)\s*:\s*(.+?)\s*;?\s*$', line)
            if fm:
                fname = fm.group(1)
                optional = fm.group(2) == "?"
                ftype = fm.group(3).strip().rstrip(';')
                # Clean up multiline types
                ftype = re.sub(r'\s+', ' ', ftype)
                fields[fname] = {
                    "type": ftype,
                    "required": not optional,
                }

        interfaces[name] = {
            "fields": fields,
            "extends": parents,
        }

    return interfaces


def resolve_interface(name: str, all_interfaces: dict[str, dict], resolved_cache: dict = None) -> dict:
    """Resolve an interface's fields including inherited ones."""
    if resolved_cache is None:
        resolved_cache = {}
    if name in resolved_cache:
        return resolved_cache[name]

    iface = all_interfaces.get(name)
    if not iface:
        return {}

    fields = {}
    # Resolve parent interfaces first
    for parent in iface.get("extends", []):
        parent_name = parent.strip()
        # Strip generic params
        parent_name = re.sub(r'<.*>', '', parent_name).strip()
        parent_fields = resolve_interface(parent_name, all_interfaces, resolved_cache)
        fields.update(parent_fields)

    # Own fields override parents
    fields.update(iface["fields"])
    resolved_cache[name] = fields
    return fields


# ── Default config extractor ─────────────────────────────────

def extract_default_configs(editor_dir: Path) -> dict[str, Any]:
    """Extract defaultConfig from editor component files."""
    defaults = {}

    if not editor_dir.exists():
        return defaults

    for ts_file in sorted(editor_dir.glob("*.ts")):
        text = ts_file.read_text()

        # Extract type name from filename: ha-automation-trigger-state.ts → state
        fname = ts_file.stem
        # Pattern: ha-automation-{category}-{type}
        parts = fname.split("-")
        if len(parts) >= 4:
            # ha-automation-trigger-state → state
            # ha-automation-action-wait_template → wait_template
            # ha-automation-condition-numeric_state → numeric_state
            type_name = "-".join(parts[3:])  # handle multi-part names
            # But HA uses underscores not hyphens in type names
            # Actually the filenames already use underscores for multi-word: wait_template
            # The dash split might break on "device_id" → just use everything after 3rd dash
            type_name = fname.replace(f"{parts[0]}-{parts[1]}-{parts[2]}-", "")
        else:
            continue

        # Find defaultConfig using brace counting
        dc_start = re.search(
            r'static\s+get\s+defaultConfig\(\)[^{]*\{[^r]*return\s*',
            text,
            re.DOTALL
        )
        if dc_start:
            # Find the opening { of the return value
            ret_start = dc_start.end()
            # Skip whitespace to find {
            while ret_start < len(text) and text[ret_start] in ' \t\n\r':
                ret_start += 1
            if ret_start < len(text) and text[ret_start] == '{':
                # Count braces to find matching }
                depth = 0
                pos = ret_start
                while pos < len(text):
                    if text[pos] == '{':
                        depth += 1
                    elif text[pos] == '}':
                        depth -= 1
                        if depth == 0:
                            break
                    pos += 1
                raw = text[ret_start:pos + 1]
                default_obj = parse_ts_object_literal(raw)
                defaults[type_name] = default_obj

    return defaults


def parse_ts_object_literal(raw: str) -> Any:
    """Best-effort parse of a TypeScript object literal to Python dict."""
    # Remove type assertions: "start" as HassTrigger["event"] → "start"
    raw = re.sub(r'\s+as\s+\w+(?:\[.*?\])?(?:\[".*?"\])?', '', raw)

    # Remove spread operators: ...DEFAULT_METHODS → (skip)
    raw = re.sub(r'\.\.\.\w+', '', raw)

    # Replace single quotes with double quotes
    raw = raw.replace("'", '"')

    # Quote unquoted keys: trigger: → "trigger":
    raw = re.sub(r'(\{|,)\s*(\w+)\s*:', r'\1 "\2":', raw)

    # Remove trailing commas before } or ]
    raw = re.sub(r',\s*\}', '}', raw)
    raw = re.sub(r',\s*\]', ']', raw)

    # Handle [...CONST] → [] (we can't resolve constants)
    raw = re.sub(r'\[\s*\]', '[]', raw)

    # Remove TS comments
    raw = re.sub(r'//.*', '', raw)

    # Replace remaining constant references with null (can't resolve)
    raw = re.sub(r'(?<=[,:])\s*[A-Z][A-Z_0-9]+(?=\s*[,}])', ' null', raw)

    # Normalize whitespace
    raw = re.sub(r'\s+', ' ', raw).strip()

    # Try to parse as JSON
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Return raw string for manual inspection
        return {"_raw": raw.strip()}


# ── Trigger schema builder ───────────────────────────────────

# Map from interface name to trigger type string
TRIGGER_INTERFACE_MAP = {
    "StateTrigger": "state",
    "NumericStateTrigger": "numeric_state",
    "TimeTrigger": "time",
    "TimePatternTrigger": "time_pattern",
    "SunTrigger": "sun",
    "ZoneTrigger": "zone",
    "HassTrigger": "homeassistant",
    "EventTrigger": "event",
    "TemplateTrigger": "template",
    "WebhookTrigger": "webhook",
    "TagTrigger": "tag",
    "CalendarTrigger": "calendar",
    "ConversationTrigger": "conversation",
    "PersistentNotificationTrigger": "persistent_notification",
    "GeoLocationTrigger": "geo_location",
    "MqttTrigger": "mqtt",
}

CONDITION_INTERFACE_MAP = {
    "StateCondition": "state",
    "NumericStateCondition": "numeric_state",
    "SunCondition": "sun",
    "ZoneCondition": "zone",
    "TimeCondition": "time",
    "TemplateCondition": "template",
    "TriggerCondition": "trigger",
    "LogicalCondition": "and",  # also or, not — handled specially
}

ACTION_INTERFACE_MAP = {
    "ServiceAction": "service",
    "DelayAction": "delay",
    "WaitAction": "wait_template",
    "WaitForTriggerAction": "wait_for_trigger",
    "EventAction": "event",
    "ChooseAction": "choose",
    "IfAction": "if",
    "RepeatAction": "repeat",
    "SequenceAction": "sequence",
    "ParallelAction": "parallel",
    "StopAction": "stop",
    "VariablesAction": "variables",
    "SetConversationResponseAction": "set_conversation_response",
    "DeviceAction": "device",
}


def simplify_type(ts_type: str) -> str:
    """Simplify TS type annotations to readable strings."""
    # Common simplifications
    ts_type = ts_type.strip()

    # Record<string, unknown> → object
    ts_type = re.sub(r'Record<\s*string\s*,\s*\w+\s*>', 'object', ts_type)

    # Partial<X> → object
    ts_type = re.sub(r'Partial<\w+>', 'object', ts_type)

    # HassServiceTarget → object
    ts_type = ts_type.replace('HassServiceTarget', 'object')

    # Trigger | Trigger[] → Trigger[]
    ts_type = re.sub(r'Trigger\s*\|\s*Trigger\[\]', 'Trigger[]', ts_type)
    ts_type = re.sub(r'Condition\s*\|\s*Condition\[\]', 'Condition[]', ts_type)
    ts_type = re.sub(r'Action\s*\|\s*Action\[\]', 'Action[]', ts_type)

    # ManualScriptConfig | Action | (ManualScriptConfig | Action)[] → Action[]
    if 'ManualScriptConfig' in ts_type:
        ts_type = 'Action[]'

    # Option | Option[] | null → Option[]
    ts_type = re.sub(r'Option\s*\|\s*Option\[\]\s*\|\s*null', 'Option[]', ts_type)

    # CountRepeat | WhileRepeat | UntilRepeat | ForEachRepeat → RepeatConfig
    if 'CountRepeat' in ts_type:
        ts_type = 'RepeatConfig'

    # string | number | ForDict → duration
    if 'ForDict' in ts_type:
        ts_type = 'duration'

    # "sunrise" | "sunset" → enum
    enum_match = re.findall(r'"(\w+)"', ts_type)
    if enum_match and '|' in ts_type and not any(c in ts_type for c in ['string', 'number', 'boolean']):
        ts_type = f"enum({','.join(enum_match)})"

    # string | string[] → string|string[]
    ts_type = re.sub(r'\s*\|\s*', '|', ts_type)

    # WeekdayShort | WeekdayShort[] → string|string[]
    ts_type = re.sub(r'WeekdayShort(?:\[\])?(?:\|WeekdayShort(?:\[\])?)*', 'string|string[]', ts_type)

    return ts_type


def build_type_fields(
    iface_name: str,
    all_interfaces: dict,
    base_fields: dict,
    discriminator_field: str,
    discriminator_value: str,
) -> dict:
    """Build field schema for a type, excluding base and discriminator fields."""
    resolved = resolve_interface(iface_name, all_interfaces)
    fields = {}

    skip_fields = set(base_fields.keys()) | {discriminator_field, "platform", "options"}

    for fname, finfo in resolved.items():
        if fname in skip_fields:
            continue
        fields[fname] = {
            "type": simplify_type(finfo["type"]),
            "required": finfo["required"],
        }

    return fields


# ── Main ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Extract automation element schemas from HA frontend")
    parser.add_argument("--frontend", default="./ha-frontend", help="Path to ha-frontend checkout")
    parser.add_argument("--output", default=".pi/extensions/home-assistant/schemas/automation-elements.json",
                        help="Output JSON file")
    args = parser.parse_args()

    frontend = Path(args.frontend)
    if not frontend.exists():
        print(f"ERROR: Frontend source not found at {frontend}", file=sys.stderr)
        sys.exit(1)

    # ── Parse interfaces ──────────────────────────────────────

    automation_ts = frontend / DATA_DIR / "automation.ts"
    script_ts = frontend / DATA_DIR / "script.ts"

    if not automation_ts.exists():
        print(f"ERROR: {automation_ts} not found", file=sys.stderr)
        sys.exit(1)

    all_interfaces = {}
    all_interfaces.update(parse_ts_interfaces(automation_ts))
    if script_ts.exists():
        all_interfaces.update(parse_ts_interfaces(script_ts))

    print(f"Parsed {len(all_interfaces)} interfaces from frontend source")

    # ── Extract default configs ───────────────────────────────

    trigger_defaults = extract_default_configs(frontend / TRIGGER_EDITORS)
    condition_defaults = extract_default_configs(frontend / CONDITION_EDITORS)
    action_defaults = extract_default_configs(frontend / ACTION_EDITORS)

    print(f"Extracted defaults: {len(trigger_defaults)} triggers, {len(condition_defaults)} conditions, {len(action_defaults)} actions")

    # ── Build trigger schemas ─────────────────────────────────

    triggers = {}
    for iface_name, trigger_type in TRIGGER_INTERFACE_MAP.items():
        if iface_name not in all_interfaces:
            print(f"  WARNING: Interface {iface_name} not found, skipping trigger '{trigger_type}'", file=sys.stderr)
            continue

        fields = build_type_fields(iface_name, all_interfaces, BASE_TRIGGER_FIELDS, "trigger", trigger_type)

        entry = {
            "description": get_trigger_description(trigger_type),
            "fields": fields,
        }

        if trigger_type in trigger_defaults:
            entry["default"] = trigger_defaults[trigger_type]

        triggers[trigger_type] = entry

    # ── Build condition schemas ───────────────────────────────

    conditions = {}
    for iface_name, cond_type in CONDITION_INTERFACE_MAP.items():
        if iface_name not in all_interfaces:
            print(f"  WARNING: Interface {iface_name} not found, skipping condition '{cond_type}'", file=sys.stderr)
            continue

        fields = build_type_fields(iface_name, all_interfaces, BASE_CONDITION_FIELDS, "condition", cond_type)

        entry = {
            "description": get_condition_description(cond_type),
            "fields": fields,
        }

        if cond_type in condition_defaults:
            entry["default"] = condition_defaults[cond_type]

        conditions[cond_type] = entry

    # Handle logical conditions (and/or/not share the same interface)
    if "LogicalCondition" in all_interfaces:
        for logical_type in ["and", "or", "not"]:
            if logical_type not in conditions:
                fields = build_type_fields("LogicalCondition", all_interfaces, BASE_CONDITION_FIELDS, "condition", logical_type)
                conditions[logical_type] = {
                    "description": get_condition_description(logical_type),
                    "fields": fields,
                    "default": condition_defaults.get(logical_type, {"condition": logical_type, "conditions": []}),
                }

    # ── Build action schemas ──────────────────────────────────

    actions = {}
    for iface_name, action_type in ACTION_INTERFACE_MAP.items():
        if iface_name not in all_interfaces:
            print(f"  WARNING: Interface {iface_name} not found, skipping action '{action_type}'", file=sys.stderr)
            continue

        fields = build_type_fields(iface_name, all_interfaces, BASE_ACTION_FIELDS, "action", action_type)

        entry = {
            "description": get_action_description(action_type),
            "fields": fields,
        }

        # Map default config names (editor filenames) to action types
        default_key = action_type
        if action_type == "service":
            default_key = "service"
        if default_key in action_defaults:
            entry["default"] = action_defaults[default_key]

        actions[action_type] = entry

    # ── Build repeat sub-schemas ──────────────────────────────

    repeat_variants = {}
    for variant_name, variant_iface in [
        ("count", "CountRepeat"),
        ("while", "WhileRepeat"),
        ("until", "UntilRepeat"),
        ("for_each", "ForEachRepeat"),
    ]:
        if variant_iface in all_interfaces:
            resolved = resolve_interface(variant_iface, all_interfaces)
            fields = {}
            for fname, finfo in resolved.items():
                if fname in BASE_ACTION_FIELDS:
                    continue
                fields[fname] = {
                    "type": simplify_type(finfo["type"]),
                    "required": finfo["required"],
                }
            repeat_variants[variant_name] = {"fields": fields}

    # ── Assemble output ───────────────────────────────────────

    output = {
        "_generated": "Auto-generated from ha-frontend source. Do not edit manually.",
        "_source": "tools/extract-automation-schemas.py",
        "_frontend_path": str(frontend),
        "base_fields": {
            "trigger": BASE_TRIGGER_FIELDS,
            "condition": BASE_CONDITION_FIELDS,
            "action": BASE_ACTION_FIELDS,
        },
        "triggers": triggers,
        "conditions": conditions,
        "actions": actions,
        "repeat_variants": repeat_variants,
        "automation_modes": {
            "single": "Only one instance runs at a time. New triggers ignored while running.",
            "restart": "Running instance is stopped and restarted on new trigger.",
            "queued": "Runs queue up. Use 'max' to limit queue depth (default 10).",
            "parallel": "Multiple instances run simultaneously. Use 'max' to limit (default 10).",
        },
        "duration_format": {
            "description": "Duration can be: string 'HH:MM:SS', number (seconds), or object {days, hours, minutes, seconds, milliseconds}",
            "examples": ["00:05:00", 300, {"minutes": 5}],
        },
        "target_format": {
            "description": "Target for service calls: {entity_id, device_id, area_id, floor_id, label_id} — each can be string or string[]",
            "examples": [
                {"entity_id": "light.kitchen"},
                {"area_id": "living_room"},
                {"entity_id": ["light.a", "light.b"]},
            ],
        },
    }

    # ── Write output ──────────────────────────────────────────

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2) + "\n")

    # ── Summary ───────────────────────────────────────────────

    print(f"\nWritten to {output_path}")
    print(f"  {len(triggers)} trigger types")
    print(f"  {len(conditions)} condition types")
    print(f"  {len(actions)} action types")
    print(f"  {len(repeat_variants)} repeat variants")

    # List any types without defaults
    for category, schemas, defaults in [
        ("triggers", triggers, trigger_defaults),
        ("conditions", conditions, condition_defaults),
        ("actions", actions, action_defaults),
    ]:
        missing = [t for t in schemas if "default" not in schemas[t]]
        if missing:
            print(f"  ⚠ {category} without defaults: {', '.join(missing)}")


# ── Description maps ─────────────────────────────────────────

def get_trigger_description(t: str) -> str:
    return {
        "state": "Fires when an entity's state or attribute changes",
        "numeric_state": "Fires when an entity's numeric value crosses a threshold",
        "time": "Fires at a specific time of day",
        "time_pattern": "Fires on a recurring time pattern",
        "sun": "Fires at sunrise or sunset with optional offset",
        "zone": "Fires when a person/device enters or leaves a zone",
        "homeassistant": "Fires when Home Assistant starts or shuts down",
        "event": "Fires when a specific event is fired on the event bus",
        "template": "Fires when a Jinja2 template evaluates to true",
        "webhook": "Fires when an HTTP webhook is received",
        "tag": "Fires when an NFC tag is scanned",
        "calendar": "Fires when a calendar event starts or ends",
        "conversation": "Fires when a voice/text command matches",
        "persistent_notification": "Fires when a persistent notification is created/removed",
        "geo_location": "Fires when a geo-location source enters/leaves a zone",
        "mqtt": "Fires when an MQTT message is received on a topic",
        "device": "Device-specific trigger (integration-dependent fields)",
    }.get(t, t)


def get_condition_description(c: str) -> str:
    return {
        "state": "Tests if an entity is in a specific state",
        "numeric_state": "Tests if an entity's numeric value is above/below a threshold",
        "sun": "Tests if it's before/after sunrise or sunset",
        "zone": "Tests if a person/device is in a zone",
        "time": "Tests if the current time is within a range",
        "template": "Tests if a Jinja2 template evaluates to true",
        "trigger": "Tests which trigger fired (by trigger ID)",
        "and": "All sub-conditions must be true",
        "or": "Any sub-condition must be true",
        "not": "All sub-conditions must be false",
        "device": "Device-specific condition (integration-dependent fields)",
    }.get(c, c)


def get_action_description(a: str) -> str:
    return {
        "service": "Call a Home Assistant service/action (e.g., light.turn_on)",
        "delay": "Pause execution for a specified duration",
        "wait_template": "Wait until a Jinja2 template evaluates to true",
        "wait_for_trigger": "Wait for a trigger to fire before continuing",
        "event": "Fire a custom event on the event bus",
        "choose": "Select an action branch based on conditions (like switch/case)",
        "if": "Simple conditional: if/then/else",
        "repeat": "Loop actions: count, while, until, or for_each",
        "sequence": "Run actions in order (grouping)",
        "parallel": "Run actions simultaneously",
        "stop": "Stop the automation or script",
        "variables": "Set variables for subsequent actions",
        "set_conversation_response": "Set the response text for a conversation trigger",
        "device": "Device-specific action (integration-dependent fields)",
    }.get(a, a)


if __name__ == "__main__":
    main()
