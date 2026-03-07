#!/usr/bin/env python3
"""
Extract storage schemas from Home Assistant core source code.

Parses the ha-core/ checkout to generate JSON schema files that describe
every .storage file HA can create. Output goes to the Pi extension's
schemas/ directory for use by the generic storage tools.

Usage:
    python3 tools/extract-schemas.py [--ha-core PATH] [--output PATH]

Defaults:
    --ha-core  ./ha-core
    --output   .pi/extensions/home-assistant/schemas
"""

import argparse
import ast
import json
import os
import re
import sys
from pathlib import Path


# ── Constants ────────────────────────────────────────────────

COMPONENTS_REL = "homeassistant/components"
HELPERS_REL = "homeassistant/helpers"
CONST_REL = "homeassistant/const.py"


# ── Constant resolver ────────────────────────────────────────

def load_global_consts(ha_core: Path) -> dict[str, str]:
    """Load CONF_* constants from homeassistant/const.py."""
    consts = {}
    const_file = ha_core / CONST_REL
    if not const_file.exists():
        print(f"WARNING: {const_file} not found", file=sys.stderr)
        return consts
    for line in const_file.read_text().splitlines():
        m = re.match(r'^(CONF_\w+):\s*Final\s*=\s*"([^"]+)"', line)
        if m:
            consts[m.group(1)] = m.group(2)
    return consts


def load_local_consts(comp_dir: Path) -> dict[str, object]:
    """Load local constants from a component directory."""
    local: dict[str, object] = {}
    for fname in ["__init__.py", "const.py", "config_flow.py"]:
        fpath = comp_dir / fname
        if not fpath.exists():
            continue
        for line in fpath.read_text().splitlines():
            # CONF_X = "value"
            m = re.match(r'^(CONF_\w+)\s*=\s*"([^"]+)"', line)
            if m:
                local[m.group(1)] = m.group(2)
                continue
            # TAG_ID = "tag_id" etc (non-CONF constants used as field keys)
            m = re.match(r'^(TAG_ID|DEVICE_ID|LAST_SCANNED)\s*=\s*"([^"]+)"', line)
            if m:
                local[m.group(1)] = m.group(2)
                continue
            # MODE_X = "value", DEFAULT_X = value
            m = re.match(r'^(MODE_\w+|DEFAULT_\w+|CONF_MIN_VALUE|CONF_MAX_VALUE|MAX_LENGTH_\w+)\s*=\s*(.+)', line)
            if m:
                val = m.group(2).strip()
                try:
                    local[m.group(1)] = ast.literal_eval(val)
                except (ValueError, SyntaxError):
                    local[m.group(1)] = val
            # DOMAIN = "xxx"
            m = re.match(r'^DOMAIN\s*[:=]\s*.*"([^"]+)"', line)
            if m:
                local["DOMAIN"] = m.group(1)
    return local


def resolve_const(name: str, all_consts: dict) -> object:
    """Resolve a constant name to its value."""
    if name in all_consts:
        return all_consts[name]
    # Try stripping quotes if it's a literal string in source
    if name.startswith('"') and name.endswith('"'):
        return name[1:-1]
    return name


# ── Schema block extractor ───────────────────────────────────

def extract_block(content: str, block_name: str) -> str | None:
    """Extract a { ... } block assigned to block_name."""
    pattern = rf'^{re.escape(block_name)}[^{{]*\{{'
    match = re.search(pattern, content, re.MULTILINE)
    if not match:
        return None
    brace_start = content.index('{', match.start())
    depth = 0
    i = brace_start
    while i < len(content):
        if content[i] == '{':
            depth += 1
        elif content[i] == '}':
            depth -= 1
            if depth == 0:
                return content[brace_start:i + 1]
        i += 1
    return None


# ── Validator type mapper ────────────────────────────────────

def resolve_validator_type(v: str, all_consts: dict) -> dict:
    """Map a voluptuous validator string to a type descriptor."""
    v = v.strip().rstrip(',')
    result: dict = {}

    # cv.* validators
    if v in ("cv.string", "cv.icon"):
        result["type"] = "string"
    elif v == "cv.boolean":
        result["type"] = "boolean"
    elif v == "cv.positive_int":
        result["type"] = "integer"
        result["minimum"] = 0
    elif v == "cv.time_period":
        result["type"] = "string"
        result["format"] = "time_period"
    elif v == "cv.datetime":
        result["type"] = "string"
        result["format"] = "datetime"
    elif v == "cv.latitude":
        result["type"] = "number"
        result["format"] = "latitude"
    elif v == "cv.longitude":
        result["type"] = "number"
        result["format"] = "longitude"
    # vol.Coerce
    elif "vol.Coerce(float)" in v:
        result["type"] = "number"
        # Check for Range
        range_m = re.search(r'vol\.Range\((?:min=([^,)]+))?(?:,\s*max=([^)]+))?\)', v)
        if range_m:
            if range_m.group(1):
                try:
                    result["minimum"] = float(range_m.group(1))
                except ValueError:
                    pass
            if range_m.group(2):
                try:
                    result["maximum"] = float(range_m.group(2))
                except ValueError:
                    pass
    elif "vol.Coerce(int)" in v:
        result["type"] = "integer"
        range_m = re.search(r'vol\.Range\(([^)]+)\)', v)
        if range_m:
            parts = range_m.group(1).split(',')
            for part in parts:
                part = part.strip()
                if part.startswith('min='):
                    try:
                        result["minimum"] = int(part[4:])
                    except ValueError:
                        pass
                elif part.startswith('max='):
                    try:
                        result["maximum"] = int(part[4:])
                    except ValueError:
                        pass
                elif '=' not in part:
                    # positional: Range(0, 255)
                    try:
                        if "minimum" not in result:
                            result["minimum"] = int(part)
                        else:
                            result["maximum"] = int(part)
                    except ValueError:
                        pass
    # vol.All(str, vol.Length(...))
    elif re.match(r'vol\.All\(\s*(?:str|cv\.string)', v):
        result["type"] = "string"
        len_m = re.search(r'vol\.Length\((?:min=(\d+))?\)', v)
        if len_m and len_m.group(1):
            result["min_length"] = int(len_m.group(1))
    # vol.In([...])
    elif "vol.In(" in v:
        m = re.search(r'vol\.In\(\[([^\]]+)\]', v)
        if m:
            raw_vals = m.group(1).split(',')
            values = []
            for rv in raw_vals:
                rv = rv.strip()
                resolved = resolve_const(rv, all_consts)
                values.append(resolved)
            result["type"] = "string"
            result["enum"] = values
    # vol.Any(str, None) or vol.Any(None, vol.Coerce(int))
    elif "vol.Any(" in v:
        if "None" in v and ("str" in v or "cv.string" in v):
            result["type"] = ["string", "null"]
        elif "None" in v and "vol.Coerce(int)" in v:
            result["type"] = ["integer", "null"]
        elif "None" in v and "vol.Coerce(float)" in v:
            result["type"] = ["number", "null"]
        else:
            result["type"] = "unknown"
            result["raw"] = v
    # cv.ensure_list
    elif "cv.ensure_list" in v:
        result["type"] = "array"
        if "cv.string" in v or "[cv.string]" in v:
            result["items"] = {"type": "string"}
        elif "cv.entities_domain" in v:
            result["items"] = {"type": "string", "format": "entity_id"}
    # bool
    elif v == "bool":
        result["type"] = "boolean"
    # Bare string type
    elif v in ("str", "cv.string"):
        result["type"] = "string"
    # MODE_STORAGE literal
    elif v.startswith("MODE_"):
        resolved = resolve_const(v, all_consts)
        result["type"] = "string"
        result["const"] = resolved
    # Selector-based (config_flow)
    elif "selector." in v:
        result.update(resolve_selector_type(v))
    else:
        result["type"] = "unknown"
        result["raw"] = v

    return result


def resolve_selector_type(v: str) -> dict:
    """Map HA selector to a type descriptor."""
    result: dict = {}
    if "TextSelector" in v:
        result["type"] = "string"
    elif "NumberSelector" in v:
        result["type"] = "number"
        m = re.search(r'min=([^,)]+)', v)
        if m:
            try:
                result["minimum"] = float(m.group(1))
            except ValueError:
                pass
        m = re.search(r'max=([^,)]+)', v)
        if m:
            try:
                result["maximum"] = float(m.group(1))
            except ValueError:
                pass
    elif "BooleanSelector" in v:
        result["type"] = "boolean"
    elif "EntitySelector" in v:
        result["type"] = "string"
        result["format"] = "entity_id"
    elif "DeviceSelector" in v:
        result["type"] = "string"
        result["format"] = "device_id"
    elif "DurationSelector" in v:
        result["type"] = "object"
        result["format"] = "duration"
    elif "TimeSelector" in v:
        result["type"] = "string"
        result["format"] = "time"
    elif "SelectSelector" in v:
        result["type"] = "string"
        result["format"] = "select"
    elif "ActionSelector" in v:
        result["type"] = "object"
        result["format"] = "action"
    elif "TemplateSelector" in v:
        result["type"] = "string"
        result["format"] = "template"
    elif "AttributeSelector" in v:
        result["type"] = "string"
        result["format"] = "attribute"
    else:
        result["type"] = "unknown"
        result["raw"] = v
    return result


# ── Field parser ─────────────────────────────────────────────

def parse_vol_fields(block: str, all_consts: dict) -> list[dict]:
    """Parse vol.Required/Optional fields from a schema block."""
    fields = []

    # Join continuation lines (lines starting with whitespace after vol. lines)
    lines = block.split('\n')
    joined: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('vol.Required') or stripped.startswith('vol.Optional'):
            joined.append(stripped)
        elif joined and not stripped.startswith('}') and not stripped.startswith('#'):
            # Continuation of previous line
            joined[-1] += ' ' + stripped
        else:
            joined.append(stripped)

    for line in joined:
        line = line.strip().rstrip(',')
        if not line.startswith('vol.'):
            continue

        # Match: vol.Required(CONST) or vol.Optional(CONST, default=X): validator
        # Also handle: vol.Optional(CONST, "default_str"): validator
        m = re.match(
            r'vol\.(Required|Optional)\(\s*(\w+)(?:\s*,\s*(?:default\s*=\s*)?([^)]*))?\s*\)\s*:\s*(.+)',
            line
        )
        if not m:
            continue

        required = m.group(1) == "Required"
        const_name = m.group(2)
        default_raw = m.group(3)
        validator_raw = m.group(4).strip().rstrip(',')

        # Resolve field name
        field_name = resolve_const(const_name, all_consts)
        if isinstance(field_name, str) and field_name == const_name:
            # Unresolved - try common patterns
            field_name = const_name.lower().replace('conf_', '')

        # Resolve default
        default = None
        if default_raw is not None:
            default_raw = default_raw.strip()
            if default_raw in all_consts:
                default = all_consts[default_raw]
            else:
                try:
                    default = ast.literal_eval(default_raw)
                except (ValueError, SyntaxError):
                    default = default_raw

        # Resolve validator to type
        type_info = resolve_validator_type(validator_raw, all_consts)

        field: dict = {
            "field": field_name,
            "required": required,
        }
        field.update(type_info)
        if default is not None:
            field["default"] = default

        fields.append(field)

    return fields


# ── Dataclass parser (for core registries) ───────────────────

def parse_dataclass_fields(content: str, class_name: str) -> list[dict]:
    """Parse fields from a @dataclass or attrs class."""
    # Find the class body (handles both `class Foo(Base):` and `class Foo:`)
    pattern = rf'class {re.escape(class_name)}\b[^:]*:\s*"""[^"]*"""(.*?)(?=\n(?:class |@attr|@dataclass)|\Z)'
    match = re.search(pattern, content, re.DOTALL)
    if not match:
        return []

    body = match.group(1)
    fields = []
    for line in body.strip().split('\n'):
        line = line.strip()
        # Stop at methods/properties
        if line.startswith('def ') or line.startswith('@property') or \
           line.startswith('@under_cached') or line.startswith('@cached'):
            break
        # Skip non-field lines
        if not line or line.startswith('#') or line.startswith('_') or \
           line.startswith('@') or line.startswith('"""'):
            continue

        # Pattern 1: plain dataclass: field_name: Type = default
        # Pattern 2: attrs: field_name: Type = attr.ib(default=X, ...)
        m = re.match(r'^(\w+):\s*(.+?)(?:\s*=\s*(.+))?$', line)
        if not m:
            continue

        name = m.group(1)
        type_str = m.group(2).strip()
        default_str = m.group(3)

        field: dict = {"field": name}

        # Map Python types to JSON-like types
        type_lower = type_str.lower()
        if 'set[tuple[str, str]]' in type_str:
            field["type"] = "array"
            field["items"] = {"type": "array", "items": {"type": "string"}}
        elif 'set[str]' in type_str or 'list[str]' in type_str:
            field["type"] = "array"
            field["items"] = {"type": "string"}
        elif 'dict' in type_str:
            field["type"] = "object"
        elif 'datetime' in type_str:
            field["type"] = "string"
            field["format"] = "datetime"
        elif 'str' in type_str and 'None' in type_str:
            field["type"] = ["string", "null"]
        elif 'str' in type_str:
            field["type"] = "string"
        elif 'int' in type_str and 'None' in type_str:
            field["type"] = ["integer", "null"]
        elif 'int' in type_str:
            field["type"] = "integer"
        elif 'float' in type_str:
            field["type"] = "number"
        elif 'bool' in type_str:
            field["type"] = "boolean"
        else:
            field["type"] = "unknown"
            field["python_type"] = type_str

        # Parse default from attr.ib() or plain assignment
        if default_str:
            default_str = default_str.strip()
            # attrs: attr.ib(default=X, ...)
            attr_m = re.search(r'attr\.ib\(.*?default=([^,)]+)', default_str)
            if attr_m:
                dval = attr_m.group(1).strip()
                try:
                    field["default"] = ast.literal_eval(dval)
                except (ValueError, SyntaxError):
                    if dval == "None":
                        field["default"] = None
                field["required"] = False
            elif "attr.ib(" in default_str:
                # attr.ib with factory but no default = has a default (empty)
                field["required"] = False
            elif "field(" in default_str:
                field["required"] = False
            else:
                try:
                    field["default"] = ast.literal_eval(default_str)
                    field["required"] = False
                except (ValueError, SyntaxError):
                    if default_str == "None":
                        field["default"] = None
                        field["required"] = False
                    else:
                        field["required"] = False
        else:
            field["required"] = True

        fields.append(field)

    return fields


# ── Config flow schema parser ────────────────────────────────

def parse_config_flow_fields(content: str, all_consts: dict) -> dict:
    """Parse config and options schemas from a config_flow.py."""
    result = {}

    # Strategy: extract ALL vol.Required/Optional fields from the entire file,
    # then split into create (config) vs update (options) based on context.
    #
    # We try to find specific schema blocks first, then fall back to parsing
    # the whole file.

    config_fields = []
    options_fields = []

    # ── Find options schema (usually the larger one) ──────────
    # Pattern 1: OPTIONS_SCHEMA = vol.Schema({...})
    options_block = extract_block(content, "OPTIONS_SCHEMA")
    # Pattern 2: async def _get_options_dict(...): return {... }
    if not options_block:
        m = re.search(r'(?:async )?def _get_options_dict\b.*?\breturn\s*(\{)', content, re.DOTALL)
        if m:
            # Find the matching brace from return {
            start = m.start(1)
            depth = 0
            i = start
            while i < len(content):
                if content[i] == '{':
                    depth += 1
                elif content[i] == '}':
                    depth -= 1
                    if depth == 0:
                        options_block = content[start:i + 1]
                        break
                i += 1
    # Pattern 3: _get_options_schema that wraps _get_options_dict
    if not options_block:
        m = re.search(r'(?:async )?def _get_options_schema\b.*?\breturn\s*vol\.Schema\(\s*(\{)', content, re.DOTALL)
        if m:
            start = m.start(1)
            depth = 0
            i = start
            while i < len(content):
                if content[i] == '{':
                    depth += 1
                elif content[i] == '}':
                    depth -= 1
                    if depth == 0:
                        options_block = content[start:i + 1]
                        break
                i += 1

    # ── Find config schema ────────────────────────────────────
    config_block = extract_block(content, "CONFIG_SCHEMA")
    if not config_block:
        m = re.search(r'(?:async )?def _get_config_schema\b.*?\breturn\s*vol\.Schema\(\s*(\{)', content, re.DOTALL)
        if m:
            start = m.start(1)
            depth = 0
            i = start
            while i < len(content):
                if content[i] == '{':
                    depth += 1
                elif content[i] == '}':
                    depth -= 1
                    if depth == 0:
                        config_block = content[start:i + 1]
                        break
                i += 1

    # Parse found blocks
    if options_block:
        options_fields = parse_vol_fields(options_block, all_consts)
    if config_block:
        config_fields = parse_vol_fields(config_block, all_consts)

    # If we only found config but it references **options, merge
    if config_fields and not options_fields and "**options" in (config_block or ""):
        # Config just adds name to options — extract options from whole file
        options_fields = parse_vol_fields(content, all_consts)
        # Remove the name field from options (it's config-only)
        options_fields = [f for f in options_fields if f["field"] != "name"]

    # Fallback: parse entire file if we found nothing specific
    if not config_fields and not options_fields:
        all_fields = parse_vol_fields(content, all_consts)
        if all_fields:
            # Deduplicate by field name, keeping first occurrence
            seen = set()
            deduped = []
            for f in all_fields:
                if f["field"] not in seen:
                    seen.add(f["field"])
                    deduped.append(f)
            result["fields"] = deduped
        return result

    # Build combined create_fields: config fields + options fields (deduped)
    if config_fields or options_fields:
        # Create = config + options (config usually just adds 'name')
        all_create = list(config_fields)
        seen = {f["field"] for f in all_create}
        for f in options_fields:
            if f["field"] not in seen:
                all_create.append(f)
                seen.add(f["field"])
        if all_create:
            result["create_fields"] = all_create
        if options_fields:
            result["update_fields"] = options_fields

    return result


# ── Schema builders ──────────────────────────────────────────

def build_collection_schema(comp: str, comp_dir: Path, global_consts: dict) -> dict | None:
    """Build schema for a DictStorageCollection component."""
    init_file = comp_dir / "__init__.py"
    const_file = comp_dir / "const.py"
    if not init_file.exists():
        return None

    content = init_file.read_text()

    # Check if it uses DictStorageCollection
    if "DictStorageCollection" not in content and "StorageCollection" not in content:
        # Also check other files
        found = False
        for f in comp_dir.iterdir():
            if f.suffix == '.py' and "DictStorageCollection" in f.read_text():
                found = True
                content = f.read_text()
                break
        if not found:
            return None

    local_consts = load_local_consts(comp_dir)
    all_consts = {**global_consts, **local_consts}

    # Determine storage key
    storage_key = None
    m = re.search(r'STORAGE_KEY\s*=\s*(?:DOMAIN|"([^"]+)")', content)
    if m:
        storage_key = m.group(1) if m.group(1) else local_consts.get("DOMAIN", comp)
    # Check const.py too
    if not storage_key and const_file.exists():
        const_content = const_file.read_text()
        m = re.search(r'STORAGE_KEY\s*=\s*(?:DOMAIN|"([^"]+)")', const_content)
        if m:
            storage_key = m.group(1) if m.group(1) else local_consts.get("DOMAIN", comp)

    if not storage_key:
        storage_key = comp

    # Find STORAGE_VERSION
    version = 1
    m = re.search(r'STORAGE_VERSION\s*=\s*(\d+)', content)
    if m:
        version = int(m.group(1))

    minor_version = 1
    m = re.search(r'STORAGE_VERSION_MINOR\s*=\s*(\d+)', content)
    if m:
        minor_version = int(m.group(1))

    # Also search in const.py
    if const_file.exists():
        const_content = const_file.read_text()
        # Search for schemas defined in const.py
        for block_name in ["STORAGE_FIELDS", "CREATE_FIELDS", "UPDATE_FIELDS",
                           "STORAGE_DASHBOARD_CREATE_FIELDS", "STORAGE_DASHBOARD_UPDATE_FIELDS",
                           "RESOURCE_CREATE_FIELDS", "RESOURCE_UPDATE_FIELDS"]:
            block = extract_block(const_content, block_name)
            if block:
                content += "\n" + f"{block_name}: VolDictType = {block}"

    schema: dict = {
        "domain": comp,
        "storage_key": storage_key,
        "storage_type": "collection",
        "storage_version": version,
        "storage_minor_version": minor_version,
    }

    # Try different field block names
    fields_found = False

    # STORAGE_FIELDS (single schema for create and update)
    block = extract_block(content, "STORAGE_FIELDS")
    if block:
        fields = parse_vol_fields(block, all_consts)
        if fields:
            schema["fields"] = fields
            fields_found = True

    # CREATE_FIELDS / UPDATE_FIELDS (separate schemas)
    create_block = extract_block(content, "CREATE_FIELDS")
    update_block = extract_block(content, "UPDATE_FIELDS")
    if create_block:
        create_fields = parse_vol_fields(create_block, all_consts)
        if create_fields:
            schema["create_fields"] = create_fields
            fields_found = True
    if update_block:
        update_fields = parse_vol_fields(update_block, all_consts)
        if update_fields:
            schema["update_fields"] = update_fields
            fields_found = True

    # STORAGE_DASHBOARD_CREATE_FIELDS etc. (lovelace)
    for prefix in ["STORAGE_DASHBOARD_", "RESOURCE_"]:
        create_block = extract_block(content, f"{prefix}CREATE_FIELDS")
        update_block = extract_block(content, f"{prefix}UPDATE_FIELDS")
        if create_block:
            fields = parse_vol_fields(create_block, all_consts)
            if fields:
                key = prefix.lower().rstrip('_')
                schema[f"{key}_create_fields"] = fields
                fields_found = True
        if update_block:
            fields = parse_vol_fields(update_block, all_consts)
            if fields:
                key = prefix.lower().rstrip('_')
                schema[f"{key}_update_fields"] = fields
                fields_found = True

    # BASE_SCHEMA (schedule)
    if not fields_found:
        base_block = extract_block(content, "BASE_SCHEMA")
        if base_block:
            fields = parse_vol_fields(base_block, all_consts)
            if fields:
                schema["fields"] = fields
                fields_found = True
                # Add schedule-specific day fields
                if comp == "schedule":
                    days = ["monday", "tuesday", "wednesday", "thursday",
                            "friday", "saturday", "sunday"]
                    for day in days:
                        schema["fields"].append({
                            "field": day,
                            "required": False,
                            "type": "array",
                            "default": [],
                            "items": {
                                "type": "object",
                                "properties": {
                                    "from": {"type": "string", "format": "time"},
                                    "to": {"type": "string", "format": "time"},
                                    "data": {"type": "object"}
                                }
                            }
                        })

    if not fields_found:
        return None

    # Get manifest info
    manifest_file = comp_dir / "manifest.json"
    if manifest_file.exists():
        manifest = json.loads(manifest_file.read_text())
        schema["name"] = manifest.get("name", comp)
        schema["integration_type"] = manifest.get("integration_type", "integration")
        schema["documentation"] = manifest.get("documentation", "")

    return schema


def detect_menu_sub_types(content: str) -> list[str] | None:
    """Detect if a config flow uses SchemaFlowMenuStep with sub-types.

    Returns the list of sub-type names, or None if not a menu flow.
    """
    # Pattern: "user": SchemaFlowMenuStep(GROUP_TYPES) or SchemaFlowMenuStep([...])
    m = re.search(r'SchemaFlowMenuStep\(\s*(\w+|\[.*?\])', content, re.DOTALL)
    if not m:
        return None

    raw = m.group(1)
    if raw.startswith('['):
        # Inline list
        items = re.findall(r'"(\w+)"', raw)
        return items if items else None

    # Variable reference — find the variable definition (may span multiple lines)
    var_m = re.search(rf'^{re.escape(raw)}\s*=\s*\[([^\]]+)\]', content, re.MULTILINE | re.DOTALL)
    if var_m:
        body = var_m.group(1)
        # Try quoted strings first
        items = re.findall(r'"(\w+)"', body)
        if items:
            return items
        # Try Platform.X references
        items = re.findall(r'Platform\.(\w+)', body)
        if items:
            return [i.lower() for i in items]

    return None


def extract_sub_type_schema(content: str, sub_type: str, all_consts: dict) -> list[dict]:
    """Extract fields for a specific sub-type from a generate_schema-style function.

    Parses the `if domain == Platform.XXX:` blocks to get sub-type-specific fields,
    plus any shared fields (like _SCHEMA_STATE, common trailing fields).
    """
    fields = []

    # Find common schema blocks (like _SCHEMA_STATE)
    common_schemas: dict[str, list[dict]] = {}
    for m in re.finditer(r'^(_SCHEMA_\w+):\s*dict[^=]*=\s*(\{)', content, re.MULTILINE):
        var_name = m.group(1)
        brace_start = m.start(2)
        depth = 0
        i = brace_start
        while i < len(content):
            if content[i] == '{': depth += 1
            elif content[i] == '}':
                depth -= 1
                if depth == 0:
                    block = content[brace_start:i+1]
                    common_schemas[var_name] = parse_vol_fields(block, all_consts)
                    break
            i += 1

    # Find the generate_schema function
    gen_m = re.search(r'def generate_schema\b.*?(?=\ndef |\Z)', content, re.DOTALL)
    if not gen_m:
        return fields

    gen_body = gen_m.group(0)

    # Always include "name" from config flow_type
    fields.append({"field": "name", "required": True, "type": "string"})

    # Find the block for this sub_type: `if domain == Platform.XXX:`
    platform_name = sub_type.upper()
    pattern = rf'if domain == Platform\.{platform_name}:(.*?)(?=\n    if domain ==|\n    schema \|=\s*\{{[^}}]*\bCONF_DEVICE_ID\b|\Z)'
    block_m = re.search(pattern, gen_body, re.DOTALL)
    if block_m:
        block = block_m.group(1)

        # Check if it includes a common schema
        for var_name, var_fields in common_schemas.items():
            if var_name in block:
                fields.extend(var_fields)

        # Parse vol fields from this block
        block_fields = parse_vol_fields(block, all_consts)
        fields.extend(block_fields)

    # Add common trailing fields (device_id, availability, etc.)
    # These are outside any `if domain ==` block at the end
    trailing_m = re.search(
        r'(?:^    schema \|= \{[^}]*CONF_DEVICE_ID.*?)(?=\n    return |\Z)',
        gen_body, re.DOTALL | re.MULTILINE
    )
    if trailing_m:
        trailing_fields = parse_vol_fields(trailing_m.group(0), all_consts)
        fields.extend(trailing_fields)

    return fields


def build_config_entry_schema(comp: str, comp_dir: Path, global_consts: dict) -> dict | None:
    """Build schema for a config_flow-based helper."""
    cf_file = comp_dir / "config_flow.py"
    manifest_file = comp_dir / "manifest.json"

    if not cf_file.exists() or not manifest_file.exists():
        return None

    manifest = json.loads(manifest_file.read_text())
    if manifest.get("integration_type") != "helper":
        return None
    if not manifest.get("config_flow"):
        return None

    content = cf_file.read_text()
    local_consts = load_local_consts(comp_dir)
    all_consts = {**global_consts, **local_consts}

    schema: dict = {
        "domain": comp,
        "storage_key": "core.config_entries",
        "storage_type": "config_entry",
        "name": manifest.get("name", comp),
        "integration_type": "helper",
        "documentation": manifest.get("documentation", ""),
    }

    # Check for menu-based multi-sub-type config flows (e.g., template, group)
    sub_types = detect_menu_sub_types(content)
    if sub_types:
        schema["sub_type_key"] = _detect_sub_type_key(content, comp)
        sub_type_schemas = {}
        for st in sub_types:
            st_fields = extract_sub_type_schema(content, st, all_consts)
            if st_fields:
                sub_type_schemas[st] = st_fields
        if sub_type_schemas:
            schema["sub_types"] = sub_type_schemas
            return schema

    # Standard single-type config flow
    parsed = parse_config_flow_fields(content, all_consts)
    if not parsed:
        # Fallback: just extract all vol fields from the file
        fields = parse_vol_fields(content, all_consts)
        if fields:
            parsed = {"fields": fields}

    if not parsed:
        return None

    schema.update(parsed)
    return schema


def _detect_sub_type_key(content: str, comp: str) -> str:
    """Detect the options key that stores the sub-type selection."""
    # Pattern: return {"group_type": ..., or "template_type": ...
    m = re.search(rf'return\s*\{{\s*"(\w+_type)"', content)
    if m:
        return m.group(1)
    return f"{comp}_type"


def build_registry_schema(registry_name: str, helpers_dir: Path) -> dict | None:
    """Build schema for a core registry."""
    reg_file = helpers_dir / f"{registry_name}.py"
    if not reg_file.exists():
        return None

    content = reg_file.read_text()

    # Find storage key
    m = re.search(r'^STORAGE_KEY\s*=\s*"([^"]+)"', content, re.MULTILINE)
    storage_key = m.group(1) if m else f"core.{registry_name}"

    # Find the main Entry class
    # Map known registry → entry class names
    entry_class_map = {
        "entity_registry": "RegistryEntry",
        "device_registry": "DeviceEntry",
        "area_registry": "AreaEntry",
        "floor_registry": "FloorEntry",
        "label_registry": "LabelEntry",
        "category_registry": "CategoryEntry",
    }
    entry_class = entry_class_map.get(registry_name)
    if not entry_class:
        entry_classes = re.findall(r'class (\w*Entry)[:(]', content)
        for cls in entry_classes:
            if "Registry" not in cls and "Deleted" not in cls and \
               "Disabler" not in cls and "Hider" not in cls and "Type" not in cls:
                entry_class = cls
                break

    if not entry_class:
        return None

    fields = parse_dataclass_fields(content, entry_class)
    if not fields:
        return None

    # Find storage version
    version = 1
    m = re.search(r'^STORAGE_VERSION_MAJOR\s*=\s*(\d+)', content, re.MULTILINE)
    if m:
        version = int(m.group(1))
    else:
        m = re.search(r'^STORAGE_VERSION\s*=\s*(\d+)', content, re.MULTILINE)
        if m:
            version = int(m.group(1))

    minor_version = 1
    m = re.search(r'^STORAGE_VERSION_MINOR\s*=\s*(\d+)', content, re.MULTILINE)
    if m:
        minor_version = int(m.group(1))

    # Find the data key (e.g., "areas", "devices", "entities")
    data_key = registry_name.replace("_registry", "") + "s"
    # Try to find it in the save method
    m = re.search(rf'"(\w+)":\s*\[.*?for.*?in\s+self\.{registry_name.replace("_registry", "")}', content, re.DOTALL)
    if m:
        data_key = m.group(1)

    return {
        "domain": registry_name,
        "storage_key": storage_key,
        "storage_type": "registry",
        "storage_version": version,
        "storage_minor_version": minor_version,
        "data_key": data_key,
        "entry_class": entry_class,
        "fields": fields,
    }


# ── Main ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Extract HA storage schemas")
    parser.add_argument("--ha-core", default="./ha-core", help="Path to ha-core checkout")
    parser.add_argument("--output", default=".pi/extensions/home-assistant/schemas",
                        help="Output directory for schema files")
    args = parser.parse_args()

    ha_core = Path(args.ha_core)
    output = Path(args.output)

    if not (ha_core / CONST_REL).exists():
        print(f"ERROR: {ha_core / CONST_REL} not found. Is --ha-core correct?", file=sys.stderr)
        sys.exit(1)

    components_dir = ha_core / COMPONENTS_REL
    helpers_dir = ha_core / HELPERS_REL

    # Load global constants
    global_consts = load_global_consts(ha_core)
    print(f"Loaded {len(global_consts)} global CONF_* constants")

    # Create output directories
    collections_dir = output / "collections"
    config_entries_dir = output / "config_entries"
    registries_dir = output / "registries"

    for d in [collections_dir, config_entries_dir, registries_dir]:
        d.mkdir(parents=True, exist_ok=True)

    stats = {"collections": 0, "config_entries": 0, "registries": 0, "errors": []}

    # ── Extract collection schemas ────────────────────────────
    print("\n── Storage Collections ──")
    for comp_dir in sorted(components_dir.iterdir()):
        if not comp_dir.is_dir():
            continue
        comp = comp_dir.name
        try:
            schema = build_collection_schema(comp, comp_dir, global_consts)
            if schema:
                out_file = collections_dir / f"{schema['storage_key']}.json"
                out_file.write_text(json.dumps(schema, indent=2, default=str) + "\n")
                field_count = len(schema.get("fields", schema.get("create_fields", [])))
                print(f"  ✅ {schema['storage_key']:40s} ({field_count} fields)")
                stats["collections"] += 1
        except Exception as e:
            stats["errors"].append(f"collection/{comp}: {e}")
            print(f"  ❌ {comp}: {e}", file=sys.stderr)

    # ── Extract config entry helper schemas ───────────────────
    print("\n── Config Entry Helpers ──")
    for comp_dir in sorted(components_dir.iterdir()):
        if not comp_dir.is_dir():
            continue
        comp = comp_dir.name
        try:
            schema = build_config_entry_schema(comp, comp_dir, global_consts)
            if schema:
                out_file = config_entries_dir / f"{comp}.json"
                out_file.write_text(json.dumps(schema, indent=2, default=str) + "\n")
                field_count = len(schema.get("fields", schema.get("create_fields", [])))
                print(f"  ✅ {comp:40s} ({field_count} fields)")
                stats["config_entries"] += 1
        except Exception as e:
            stats["errors"].append(f"config_entry/{comp}: {e}")
            print(f"  ❌ {comp}: {e}", file=sys.stderr)

    # ── Extract core registry schemas ─────────────────────────
    print("\n── Core Registries ──")
    registries = [
        "area_registry", "device_registry", "entity_registry",
        "floor_registry", "label_registry", "category_registry",
    ]
    for reg in registries:
        try:
            schema = build_registry_schema(reg, helpers_dir)
            if schema:
                out_file = registries_dir / f"{schema['storage_key']}.json"
                out_file.write_text(json.dumps(schema, indent=2, default=str) + "\n")
                print(f"  ✅ {schema['storage_key']:40s} ({len(schema['fields'])} fields)")
                stats["registries"] += 1
        except Exception as e:
            stats["errors"].append(f"registry/{reg}: {e}")
            print(f"  ❌ {reg}: {e}", file=sys.stderr)

    # ── Summary ───────────────────────────────────────────────
    print(f"\n{'═' * 60}")
    print(f"  Collections:    {stats['collections']}")
    print(f"  Config entries: {stats['config_entries']}")
    print(f"  Registries:     {stats['registries']}")
    total = stats['collections'] + stats['config_entries'] + stats['registries']
    print(f"  TOTAL:          {total} schemas")
    if stats['errors']:
        print(f"  Errors:         {len(stats['errors'])}")
        for e in stats['errors']:
            print(f"    - {e}")
    print(f"{'═' * 60}")
    print(f"\nSchemas written to: {output.resolve()}")


if __name__ == "__main__":
    main()
