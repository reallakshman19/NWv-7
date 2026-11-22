#!/usr/bin/env python3
"""Offline, SHA-pinned UpAhead v2 immutable generation builder (SHADOW ONLY).

Does not fetch upstreams, update public/data/up_ahead.json, configure Cloudflare,
or rewrite Planner. Input hashes are *custody pins*, not independent authority.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from upahead_identity.generation import commit_generation, read_current, resolve_and_build

MAX_INPUT_BYTES = 8_000_000


def checked_json(path: str, digest: str):
    if not digest.startswith("sha256:") or len(digest) != 71 or any(c not in "0123456789abcdef" for c in digest[7:]):
        raise ValueError("Input SHA-256 pin required in sha256:<64-lowercase-hex> format")
    raw = Path(path).read_bytes()
    if len(raw) > MAX_INPUT_BYTES:
        raise ValueError("Input exceeds eight MB shadow cap")
    actual = "sha256:" + hashlib.sha256(raw).hexdigest()
    if actual != digest:
        raise ValueError("Input SHA-256 mismatch; abort without generation write")
    data = json.loads(raw)
    return data


def build_from_args(args) -> dict:
    observations = checked_json(args.observations, args.observations_sha256)
    if not isinstance(observations, list) or any(not isinstance(r, dict) for r in observations):
        raise ValueError("Observations must be a JSON array of objects")
    if bool(args.bindings) != bool(args.bindings_sha256):
        raise ValueError("A binding registry and its SHA-256 must be provided together")
    bindings = {}
    if args.bindings:
        registry = checked_json(args.bindings, args.bindings_sha256)
        if not isinstance(registry, dict) or registry.get("schemaVersion") != "upahead-bindings/v2-shadow":
            raise ValueError("Wrong binding registry schema")
        bindings = registry.get("bindings")
        if not isinstance(bindings, dict):
            raise ValueError("Binding registry must contain a map of source aliases")
        # A hash pinned by the operator prevents silent file substitution. It
        # does not independently verify the source issuer or reviewer.
    previous = read_current(args.output)
    previous_id = previous["manifest"]["generationId"] if previous else None
    if previous_id != args.expected_current:
        raise ValueError("Expected current generation missing or stale; fail closed")
    generation = resolve_and_build(observations, source_commit=args.source_commit,
            published_at=args.published_at_ms, observed_at=args.observed_at_ms,
            trusted_bindings=bindings, prior_ledger=previous["ledger"] if previous else None)
    if not args.dry_run:
        commit_generation(args.output, generation, expected_current_generation=args.expected_current)
    return {"mode": "SHADOW_ONLY", "wrote": not args.dry_run,
            "generationId": generation["manifest"]["generationId"],
            "semanticDigest": generation["manifest"]["semanticDigest"],
            "recordCounts": generation["manifest"]["recordCounts"],
            "quarantineCount": len(generation["payload"]["quarantine"]),
            "bindingAuthority": "UNVERIFIED_OPERATOR_PIN_NOT_AN_ISSUER_SIGNATURE"}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--observations", required=True)
    parser.add_argument("--observations-sha256", required=True)
    parser.add_argument("--bindings")
    parser.add_argument("--bindings-sha256")
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--observed-at-ms", type=int, required=True)
    parser.add_argument("--published-at-ms", type=int, required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--expected-current", default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    try:
        print(json.dumps(build_from_args(args), sort_keys=True))
    except (ValueError, OSError, RuntimeError, TypeError, json.JSONDecodeError) as exc:
        # Never echo raw source URLs, tokens, or path contents in a failure log.
        print("UpAhead v2 SHADOW generation refused: " + str(exc).split("\n")[0][:180], file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
