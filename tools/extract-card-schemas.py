#!/usr/bin/env python3
"""
Extract Lovelace card schemas from Home Assistant frontend source code.

Parses the ha-frontend/ checkout to generate a JSON schema catalog describing
all card types with their fields and types.

Two extraction sources (merged, editor structs take priority):
  1. TypeScript interfaces in cards/types.ts — comprehensive field definitions
  2. Superstruct schemas in editor config-elements — validated field definitions

Usage:
    python3 tools/extract-card-schemas.py [--frontend PATH] [--output PATH]

Defaults:
    --frontend  ./ha-frontend
    --output    .pi/extensions/home-assistant/schemas/card-schemas.json
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


# ── Constants ────────────────────────────────────────────────

CARDS_TYPES = "src/panels/lovelace/cards/types.ts"
CARD_EDITORS = "src/panels/lovelace/editor/config-elements"

# Base fields on every card (from baseLovelaceCardConfig + LovelaceCardConfig)
BASE_CARD_FIELDS = {
    "type", "view_layout", "layout_options", "grid_options",
    "visibility", "disabled", "index", "view_index",
}

# Map from TypeScript interface name → card type string
INTERFACE_TO_CARD_TYPE = {
    "AlarmPanelCardConfig": "alarm-panel",
    "AreaCardConfig": "area",
    "ButtonCardConfig": "button",
    "CalendarCardConfig": "calendar",
    "ClockCardConfig": "clock",
    "ConditionalCardConfig": "conditional",
    "DiscoveredDevicesCardConfig": "discovered-devices",
    "DistributionCardConfig": "distribution",
    "EmptyStateCardConfig": "empty-state",
    "EntitiesCardConfig": "entities",
    "EntityCardConfig": "entity",
    "EntityFilterCardConfig": "entity-filter",
    "GaugeCardConfig": "gauge",
    "GlanceCardConfig": "glance",
    "GridCardConfig": "grid",
    "HeadingCardConfig": "heading",
    "HistoryGraphCardConfig": "history-graph",
    "HomeSummaryCard": "home-summary",
    "HumidifierCardConfig": "humidifier",
    "IframeCardConfig": "iframe",
    "LightCardConfig": "light",
    "LogbookCardConfig": "logbook",
    "MapCardConfig": "map",
    "MarkdownCardConfig": "markdown",
    "MediaControlCardConfig": "media-control",
    "PictureCardConfig": "picture",
    "PictureElementsCardConfig": "picture-elements",
    "PictureEntityCardConfig": "picture-entity",
    "PictureGlanceCardConfig": "picture-glance",
    "PlantStatusCardConfig": "plant-status",
    "RepairsCardConfig": "repairs",
    "SensorCardConfig": "sensor",
    "StackCardConfig": "horizontal-stack",  # also vertical-stack, same config
    "StatisticCardConfig": "statistic",
    "StatisticsGraphCardConfig": "statistics-graph",
    "ThermostatCardConfig": "thermostat",
    "TileCardConfig": "tile",
    "TodoListCardConfig": "todo-list",
    "ToggleGroupCardConfig": "toggle-group",
    "UpdatesCardConfig": "updates",
    "WeatherForecastCardConfig": "weather-forecast",
}

# Cards that share the StackCardConfig
STACK_TYPES = ["horizontal-stack", "vertical-stack", "grid"]

# Energy cards — simpler, extract separately
ENERGY_CARD_INTERFACES = {
    "EnergyDistributionCardConfig": "energy-distribution",
    "EnergyUsageGraphCardConfig": "energy-usage-graph",
    "EnergySolarGraphCardConfig": "energy-solar-graph",
    "EnergyGasGraphCardConfig": "energy-gas-graph",
    "EnergyWaterGraphCardConfig": "energy-water-graph",
    "EnergyDevicesGraphCardConfig": "energy-devices-graph",
    "EnergyDevicesDetailGraphCardConfig": "energy-devices-detail-graph",
    "EnergySourcesTableCardConfig": "energy-sources-table",
    "EnergySolarGaugeCardConfig": "energy-solar-consumed-gauge",
    "EnergySelfSufficiencyGaugeCardConfig": "energy-self-sufficiency-gauge",
    "EnergyGridNeutralityGaugeCardConfig": "energy-grid-neutrality-gauge",
    "EnergyCarbonGaugeCardConfig": "energy-carbon-consumed-gauge",
    "EnergySankeyCardConfig": "energy-sankey",
    "WaterSankeyCardConfig": "water-sankey",
    "WaterFlowSankeyCardConfig": "water-flow-sankey",
    "PowerSourcesGraphCardConfig": "power-sources-graph",
    "PowerSankeyCardConfig": "power-sankey",
}

CARD_DESCRIPTIONS = {
    "alarm-panel": "Alarm panel control card with arm/disarm buttons",
    "area": "Shows area with entities, sensors, and alerts",
    "button": "A single button to trigger an action",
    "calendar": "Calendar view showing events from calendar entities",
    "clock": "Analog or digital clock display",
    "conditional": "Shows a card only when conditions are met",
    "discovered-devices": "Shows recently discovered devices",
    "distribution": "Distribution chart for entity values",
    "empty-state": "Placeholder card with icon, title, and message",
    "entities": "List of entity rows with optional header/footer",
    "entity": "Single entity display with optional graph",
    "entity-filter": "Filtered list of entities based on state conditions",
    "gauge": "Circular gauge showing a numeric entity value",
    "glance": "Compact grid of entity states",
    "grid": "Grid layout container for cards with configurable columns",
    "heading": "Section heading with optional icon and badges",
    "history-graph": "History graph for one or more entities",
    "home-summary": "Summary card for home status",
    "horizontal-stack": "Horizontal row of cards",
    "humidifier": "Humidifier control card",
    "iframe": "Embedded webpage via iframe",
    "light": "Light control card with brightness slider",
    "logbook": "Logbook entries for entities",
    "map": "Map showing entity locations",
    "markdown": "Rendered Markdown/Jinja2 content",
    "media-control": "Media player control card",
    "picture": "Static image with optional tap action",
    "picture-elements": "Image with positioned interactive elements",
    "picture-entity": "Entity with state-dependent image",
    "picture-glance": "Image with entity state icons overlay",
    "plant-status": "Plant monitor status card",
    "repairs": "Shows repair issues",
    "sensor": "Single sensor with optional graph",
    "statistic": "Long-term statistics display",
    "statistics-graph": "Statistics graph over time",
    "thermostat": "Thermostat control card",
    "tile": "Modern compact entity card with features",
    "todo-list": "Todo/shopping list card",
    "toggle-group": "Group of toggle buttons",
    "updates": "Shows available updates",
    "vertical-stack": "Vertical column of cards",
    "weather-forecast": "Weather with optional forecast display",
}


# ── TypeScript interface parser ──────────────────────────────

def parse_ts_interfaces(filepath: Path) -> dict[str, dict]:
    """Parse TypeScript interfaces from a file, returning {name: {fields, extends}} dict."""
    text = filepath.read_text()
    interfaces = {}

    pattern = re.compile(
        r'(?:export\s+)?interface\s+(\w+)'
        r'(?:\s+extends\s+([\w\s,<>]+?))?'
        r'\s*\{',
        re.DOTALL
    )

    for m in pattern.finditer(text):
        name = m.group(1)
        extends = m.group(2)
        start = m.end()
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

        for line in body.split('\n'):
            line = line.strip()
            if not line or line.startswith('//') or line.startswith('/*') or line.startswith('*'):
                continue
            # Check for @deprecated
            deprecated = '@deprecated' in line
            fm = re.match(r'(?:\/\*\*.*?\*\/\s*)?(\w+)(\??)\s*:\s*(.+?)\s*;?\s*$', line)
            if fm:
                fname = fm.group(1)
                optional = fm.group(2) == "?"
                ftype = fm.group(3).strip().rstrip(';')
                ftype = re.sub(r'\s+', ' ', ftype)
                field_info: dict[str, Any] = {
                    "type": ftype,
                    "required": not optional,
                }
                if deprecated:
                    field_info["deprecated"] = True
                fields[fname] = field_info

        interfaces[name] = {
            "fields": fields,
            "extends": parents,
        }

    return interfaces


def resolve_interface(name: str, all_interfaces: dict, cache: dict = None) -> dict:
    """Resolve an interface's fields including inherited ones."""
    if cache is None:
        cache = {}
    if name in cache:
        return cache[name]

    iface = all_interfaces.get(name)
    if not iface:
        return {}

    fields = {}
    for parent in iface.get("extends", []):
        parent_name = re.sub(r'<.*>', '', parent).strip()
        parent_fields = resolve_interface(parent_name, all_interfaces, cache)
        fields.update(parent_fields)

    fields.update(iface["fields"])
    cache[name] = fields
    return fields


# ── Superstruct parser ───────────────────────────────────────

def extract_struct_fields(editor_path: Path) -> dict[str, list[dict]]:
    """Extract cardConfigStruct fields from editor files."""
    results = {}

    for ts_file in sorted(editor_path.glob("hui-*-card-editor.ts")):
        # Extract card type from filename
        fname = ts_file.stem  # hui-button-card-editor
        m = re.match(r'hui-(.+)-card-editor', fname)
        if not m:
            continue
        card_type = m.group(1)

        text = ts_file.read_text()

        # Find cardConfigStruct = assign(baseLovelaceCardConfig, object({ ... }))
        # or cardConfigStruct = object({ ... })
        struct_match = re.search(
            r'(?:const\s+)?cardConfigStruct\s*=\s*(?:assign\s*\(\s*\w+\s*,\s*)?object\s*\(\s*\{',
            text
        )
        if not struct_match:
            continue

        # Find the opening { of the object
        start = struct_match.end() - 1  # position of {
        depth = 1
        pos = start + 1
        while pos < len(text) and depth > 0:
            if text[pos] == '{':
                depth += 1
            elif text[pos] == '}':
                depth -= 1
            pos += 1
        body = text[start + 1:pos - 1]

        # Parse struct fields: name: optional(string()), or name: array(string())
        fields = []
        for line in body.split('\n'):
            line = line.strip().rstrip(',')
            if not line or line.startswith('//') or line.startswith('/*'):
                continue

            fm = re.match(r'(\w+)\s*:\s*(.+)$', line)
            if fm:
                field_name = fm.group(1)
                field_def = fm.group(2).strip()

                if field_name in BASE_CARD_FIELDS:
                    continue

                is_optional = 'optional(' in field_def
                field_type = parse_struct_type(field_def)

                field_info: dict[str, Any] = {
                    "name": field_name,
                    "type": field_type,
                    "required": not is_optional,
                }
                fields.append(field_info)

        if fields:
            results[card_type] = fields

    return results


def parse_struct_type(definition: str) -> str:
    """Convert superstruct type definition to readable type string."""
    d = definition.strip()

    # optional(X) → recurse on X
    m = re.match(r'optional\((.+)\)$', d)
    if m:
        return parse_struct_type(m.group(1))

    # Basic types
    if d == 'string()':
        return 'string'
    if d == 'boolean()':
        return 'boolean'
    if d == 'number()':
        return 'number'
    if d == 'any()':
        return 'any'

    # array(X)
    m = re.match(r'array\((.+)\)$', d)
    if m:
        inner = parse_struct_type(m.group(1))
        return f'{inner}[]'

    # union([X, Y])
    m = re.match(r'union\(\[(.+)\]\)$', d)
    if m:
        parts = split_top_level(m.group(1))
        types = [parse_struct_type(p.strip()) for p in parts]
        return '|'.join(types)

    # enums(["a", "b"])
    m = re.match(r'enums\(\[(.+)\]\)$', d)
    if m:
        vals = re.findall(r'"([^"]+)"', m.group(1))
        return f"enum({','.join(vals)})"

    # literal("x")
    m = re.match(r'literal\("([^"]+)"\)$', d)
    if m:
        return f'"{m.group(1)}"'

    # Named structs — treat as their type name
    if re.match(r'actionConfigStruct', d):
        return 'ActionConfig'
    if re.match(r'entityNameStruct', d):
        return 'string'
    if re.match(r'entitiesConfigStruct|entitiesRowConfigStruct', d):
        return 'EntityConfig'
    if re.match(r'headerFooterConfigStructs', d):
        return 'HeaderFooterConfig'

    # object({...}) → object
    if d.startswith('object('):
        return 'object'

    # Fallback
    return d.rstrip(')')


def split_top_level(s: str) -> list[str]:
    """Split by comma at top level (respecting parens/brackets)."""
    parts = []
    depth = 0
    current = []
    for ch in s:
        if ch in '([{':
            depth += 1
        elif ch in ')]}':
            depth -= 1
        elif ch == ',' and depth == 0:
            parts.append(''.join(current).strip())
            current = []
            continue
        current.append(ch)
    if current:
        parts.append(''.join(current).strip())
    return parts


# ── Type simplifier ──────────────────────────────────────────

def simplify_type(ts_type: str) -> str:
    """Simplify TS type annotations to readable strings."""
    t = ts_type.strip()

    # Record<string, unknown> → object
    t = re.sub(r'Record<\s*string\s*,\s*\w+\s*>', 'object', t)
    # Partial<X> → object
    t = re.sub(r'Partial<\w+>', 'object', t)
    # HassServiceTarget → object
    t = t.replace('HassServiceTarget', 'object')
    # EntityNameItem | EntityNameItem[] → string
    t = re.sub(r'EntityNameItem(?:\s*\|\s*EntityNameItem\[\])?', 'string', t)
    t = re.sub(r'string\s*\|\s*string\[\]', 'string|string[]', t)
    t = re.sub(r'string\s*\|\s*string(?!\[)', 'string', t)
    # HuiImage["cameraView"] → string
    t = re.sub(r'HuiImage\["cameraView"\]', 'string', t)
    # MediaSelectorValue → object
    t = re.sub(r'MediaSelectorValue', 'object', t)
    # LovelaceCardConfig → CardConfig
    t = re.sub(r'LovelaceCardConfig', 'CardConfig', t)
    # LovelaceCardFeatureConfig → FeatureConfig
    t = re.sub(r'LovelaceCardFeatureConfig', 'FeatureConfig', t)
    # LovelaceCardFeaturePosition → string
    t = re.sub(r'LovelaceCardFeaturePosition', 'string', t)
    # LovelaceElementConfig → ElementConfig
    t = re.sub(r'LovelaceElementConfig', 'ElementConfig', t)
    # LovelaceHeaderFooterConfig → HeaderFooterConfig
    t = re.sub(r'LovelaceHeaderFooterConfig', 'HeaderFooterConfig', t)
    # LovelaceHeadingBadgeConfig → BadgeConfig
    t = re.sub(r'LovelaceHeadingBadgeConfig', 'BadgeConfig', t)
    # LovelaceRowConfig → RowConfig
    t = re.sub(r'LovelaceRowConfig', 'RowConfig', t)
    # ActionConfig → ActionConfig (keep)
    # Condition | LegacyCondition → Condition
    t = re.sub(r'(?:Legacy)?Condition', 'Condition', t)
    t = re.sub(r'Condition\s*\|\s*Condition', 'Condition', t)
    # LegacyStateFilter → object
    t = re.sub(r'LegacyStateFilter', 'object', t)
    # ForecastType → string
    t = re.sub(r'ForecastType', 'string', t)
    # FullCalendarView → string
    t = re.sub(r'FullCalendarView', 'string', t)
    # ThemeMode → string
    t = re.sub(r'ThemeMode', 'string', t)
    # TimestampRenderingFormat → string
    t = re.sub(r'TimestampRenderingFormat', 'string', t)
    # TimeFormat → string
    t = re.sub(r'TimeFormat', 'string', t)
    # HaDurationData → object
    t = re.sub(r'HaDurationData', 'object', t)
    # StatisticType | StatisticType[] → string|string[]
    t = re.sub(r'StatisticType(?:\s*\|\s*StatisticType\[\])?', 'string|string[]', t)
    # keyof X → string
    t = re.sub(r'keyof\s+\w+(?:\["[^"]+"\])?', 'string', t)
    # HomeSummary → object
    t = re.sub(r'HomeSummary', 'object', t)
    # Statistic → object
    if t == 'keyof Statistic':
        t = 'string'

    # Quoted string enums: "a" | "b" | "c"
    enum_vals = re.findall(r'"([^"]+)"', t)
    if enum_vals and '|' in t and not any(kw in t for kw in ['string', 'number', 'boolean', 'object', 'Config']):
        t = f"enum({','.join(enum_vals)})"

    # Clean up pipes
    t = re.sub(r'\s*\|\s*', '|', t)

    return t


# ── Main ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Extract card schemas from HA frontend")
    parser.add_argument("--frontend", default="./ha-frontend", help="Path to ha-frontend checkout")
    parser.add_argument("--output", default=".pi/extensions/home-assistant/schemas/card-schemas.json",
                        help="Output JSON file")
    args = parser.parse_args()

    frontend = Path(args.frontend)
    if not frontend.exists():
        print(f"ERROR: Frontend source not found at {frontend}", file=sys.stderr)
        sys.exit(1)

    types_file = frontend / CARDS_TYPES
    editor_dir = frontend / CARD_EDITORS

    # ── Parse TypeScript interfaces ───────────────────────────

    all_interfaces = {}
    if types_file.exists():
        all_interfaces = parse_ts_interfaces(types_file)
        print(f"Parsed {len(all_interfaces)} interfaces from cards/types.ts")
    else:
        print(f"WARNING: {types_file} not found", file=sys.stderr)

    # ── Extract superstruct schemas from editors ──────────────

    struct_fields = {}
    if editor_dir.exists():
        struct_fields = extract_struct_fields(editor_dir)
        print(f"Extracted struct schemas from {len(struct_fields)} card editors")

    # ── Build card schemas ────────────────────────────────────

    cards = {}

    # 1. Build from TypeScript interfaces
    all_card_interfaces = {**INTERFACE_TO_CARD_TYPE, **ENERGY_CARD_INTERFACES}
    resolve_cache: dict = {}

    for iface_name, card_type in all_card_interfaces.items():
        if iface_name not in all_interfaces:
            continue

        resolved = resolve_interface(iface_name, all_interfaces, resolve_cache)
        fields = {}

        for fname, finfo in resolved.items():
            if fname in BASE_CARD_FIELDS:
                continue
            field_entry: dict[str, Any] = {
                "type": simplify_type(finfo["type"]),
                "required": finfo["required"],
            }
            if finfo.get("deprecated"):
                field_entry["deprecated"] = True
            fields[fname] = field_entry

        entry: dict[str, Any] = {
            "description": CARD_DESCRIPTIONS.get(card_type, card_type),
            "fields": fields,
            "source": "interface",
        }
        cards[card_type] = entry

    # 2. For stack cards, create vertical-stack as alias
    if "horizontal-stack" in cards:
        vs = dict(cards["horizontal-stack"])
        vs["description"] = CARD_DESCRIPTIONS.get("vertical-stack", "Vertical column of cards")
        cards["vertical-stack"] = vs

    # 3. Merge/override with editor struct schemas
    for card_type, struct_field_list in struct_fields.items():
        if card_type in cards:
            # Merge: struct fields take priority for type info
            for sf in struct_field_list:
                fname = sf["name"]
                if fname in cards[card_type]["fields"]:
                    # Update type from struct (more accurate validation type)
                    cards[card_type]["fields"][fname]["type"] = sf["type"]
                    cards[card_type]["fields"][fname]["required"] = sf["required"]
                else:
                    cards[card_type]["fields"][fname] = {
                        "type": sf["type"],
                        "required": sf["required"],
                    }
            cards[card_type]["source"] = "interface+editor"
        else:
            # Card only in editor, not in types.ts
            fields = {}
            for sf in struct_field_list:
                fields[sf["name"]] = {
                    "type": sf["type"],
                    "required": sf["required"],
                }
            cards[card_type] = {
                "description": CARD_DESCRIPTIONS.get(card_type, card_type),
                "fields": fields,
                "source": "editor",
            }

    # ── Sort by card type name ────────────────────────────────

    cards = dict(sorted(cards.items()))

    # ── Assemble output ───────────────────────────────────────

    output = {
        "_generated": "Auto-generated from ha-frontend source. Do not edit manually.",
        "_source": "tools/extract-card-schemas.py",
        "_frontend_path": str(frontend),
        "base_card_fields": {
            "type": {"type": "string", "required": True, "description": "Card type identifier"},
            "grid_options": {"type": "object", "required": False, "description": "Grid layout options (columns, rows)"},
            "visibility": {"type": "Condition[]", "required": False, "description": "Conditions to show/hide this card"},
            "disabled": {"type": "boolean", "required": False, "description": "Disable this card"},
        },
        "cards": cards,
    }

    # ── Write output ──────────────────────────────────────────

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2) + "\n")

    # ── Summary ───────────────────────────────────────────────

    interface_only = sum(1 for c in cards.values() if c["source"] == "interface")
    editor_only = sum(1 for c in cards.values() if c["source"] == "editor")
    both = sum(1 for c in cards.values() if c["source"] == "interface+editor")

    print(f"\nWritten to {output_path}")
    print(f"  {len(cards)} card types total")
    print(f"    {both} with interface + editor schema")
    print(f"    {interface_only} with interface only")
    print(f"    {editor_only} with editor only")

    # Show which cards have most fields
    by_fields = sorted(cards.items(), key=lambda x: len(x[1]["fields"]), reverse=True)
    print(f"\n  Top 10 by field count:")
    for name, info in by_fields[:10]:
        print(f"    {name}: {len(info['fields'])} fields")


if __name__ == "__main__":
    main()
