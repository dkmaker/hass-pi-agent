#!/usr/bin/env python3
"""Fail if addon-beta/config.yaml's config surface drifts from addon/config.yaml.

The beta tile (addon-beta/config.yaml) is a near-clone of the stable add-on
config: Home Assistant reads it for the beta add-on's options + schema, while the
runtime image is built from addon/. If a new config option is added to
addon/config.yaml but not mirrored here, the beta add-on silently won't expose it
(this exact bug hid the web_search config from the beta channel).

Only the identity fields may differ; everything else (options, schema, map, arch,
*_api flags, startup, ingress…) must be identical.
"""
import sys
import yaml

IDENTITY = {"name", "slug", "image", "version", "description", "panel_title"}


def surface(path: str) -> dict:
    with open(path) as fh:
        data = yaml.safe_load(fh)
    return {k: v for k, v in data.items() if k not in IDENTITY}


def main() -> int:
    stable = surface("addon/config.yaml")
    beta = surface("addon-beta/config.yaml")
    if stable == beta:
        print("OK: addon-beta/config.yaml surface matches addon/config.yaml.")
        return 0
    keys = sorted(set(stable) | set(beta))
    print("DRIFT: addon-beta/config.yaml is out of sync with addon/config.yaml.\n")
    for k in keys:
        if stable.get(k) != beta.get(k):
            print(f"  [{k}]")
            print(f"    stable: {stable.get(k)!r}")
            print(f"    beta:   {beta.get(k)!r}")
    print("\nMirror the change into addon-beta/config.yaml (keep the identity fields).")
    return 1


if __name__ == "__main__":
    sys.exit(main())
