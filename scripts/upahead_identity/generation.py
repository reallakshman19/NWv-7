"""Fail-closed, shadow-only immutable UpAhead v2 generation publisher.

Issue #200. Explicitly NOT wired to the existing production publisher.
The caller must provide independently verified bindings and a pinned source commit.
This module proves deterministic generation/atomic recovery, NOT organizer authority.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any, Mapping

from .resolver import SCHEMA as LEDGER_SCHEMA, resolve_observations

SHA40 = re.compile(r"^[0-9a-f]{40}$")
SHA256 = re.compile(r"^sha256:[0-9a-f]{64}$")
GENERATION = re.compile(r"^gen:v2:[0-9a-f]{40}$")
ALLOWED_CLASSES = frozenset({"events", "movies", "shopping", "airlines", "alerts",
                             "weather_alerts", "civic", "festivals", "sports"})
SORTED_COLLECTIONS = ("items", "pendingItems", "retiredOccurrences", "retiredRevisions", "sourceAliases")
LEDGER_VERSION = "upahead-occurrence-ledger/v2-shadow"
MAX_PENDING_DAYS = 180
DAY_MS = 86_400_000
MAX_ROWS = 2_000  # shadow safety ceiling; production limits remain independently governed


def _safe_json(value: Any) -> str:
    """Matches Worker stableJson for our intentional ASCII-key, JSON scalar contract.

    Restrict numbers to safe integers; JS may serialize floats, exponents and -0
    differently. Unpaired surrogates/non-string keys are rejected explicitly.
    """
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if type(value) is int and abs(value) <= 2**53 - 1:
        return str(value)
    if type(value) is str:
        value.encode("utf-8")
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(map(_safe_json, value)) + "]"
    if isinstance(value, dict):
        if any(not isinstance(key, str) for key in value):
            raise ValueError("JSON object keys must be strings")
        # Payload schema keys are ASCII; prohibit non-ASCII keys to avoid Python
        # codepoint-vs-JS UTF-16 key ordering ambiguity.
        if any(not key.isascii() for key in value):
            raise ValueError("Non-ASCII object key needs separately versioned canonicalization")
        return "{" + ",".join(f"{_safe_json(key)}:{_safe_json(value[key])}" for key in sorted(value)) + "}"
    raise ValueError("Payload contains unsupported JS noncanonical scalar")


def _sha(value: Any) -> str:
    return "sha256:" + hashlib.sha256(_safe_json(value).encode("utf-8")).hexdigest()


def canonical_generation_payload(payload: Mapping[str, Any]) -> str:
    """Same row-set ordering as the Worker v2 shadow verifier (for unique IDs)."""
    if not isinstance(payload, dict):
        raise ValueError("Expected payload object")
    clone = {k: v for k, v in payload.items() if k != "manifest"}
    for key in SORTED_COLLECTIONS:
        if key in clone:
            if not isinstance(clone[key], list):
                raise ValueError("Expected row list: " + key)
            clone[key] = sorted(clone[key], key=lambda row: (
                str(row.get("canonicalOccurrenceId") or row.get("occurrenceId")
                    or row.get("alias") or row.get("identity") or ""),
                _safe_json(row)))
    return _safe_json(clone)


def _milliseconds(value: Any, name: str) -> int:
    if type(value) is not int or value <= 0 or value > 2**53 - 1:
        raise ValueError("Missing/invalid verified millisecond clock: " + name)
    return value


def _record(row: Mapping[str, Any], *, published_at: int) -> dict[str, Any]:
    if row.get("decision") != "VERIFIED_BINDING":
        raise ValueError("Only bound and explicitly adjudicated occurrences may publish")
    observed = row.get("representativeObservation")
    if not isinstance(observed, dict):
        raise ValueError("Missing representative observation")
    category = str(row.get("contentClass") or "")
    if category not in ALLOWED_CLASSES or observed.get("category") != category:
        raise ValueError("Unsupported or contradictory occurrence category")
    identifier = str(row.get("canonicalOccurrenceId") or "")
    if not identifier.startswith("occ:v2:") or len(identifier) != 39:
        raise ValueError("Malformed canonical occurrence ID")
    if not row.get("sourceAliases") or not row.get("evidenceRefs"):
        raise ValueError("Missing source membership/evidence")
    expiry = _milliseconds(observed.get("expiryAt"), "expiryAt")
    start = observed.get("eventStartAt")
    if start is not None:
        start = _milliseconds(start, "eventStartAt")
    if start is not None and expiry < start:
        raise ValueError("Expiry before start")
    title = observed.get("title")
    if not isinstance(title, str) or not title.strip():
        raise ValueError("Missing source title")
    output = {"canonicalOccurrenceId": identifier, "category": category,
              "title": title.strip(), "expiryAt": expiry,
              "sourceAliases": sorted(set(map(str, row["sourceAliases"]))),
              "sourceDigests": sorted(set(map(str, row["sourceDigests"]))),
              "evidenceRefs": sorted(set(map(str, row["evidenceRefs"]))),
              "status": str(row.get("status") or ""),
              "identityVersion": 2}
    if start is not None:
        output["eventStartAt"] = start
    if row.get("firstVisibleAt") is not None:
        output["firstVisibleAt"] = _milliseconds(row["firstVisibleAt"], "firstVisibleAt")
    if row.get("lastVerifiedAt") is not None:
        output["lastVerifiedAt"] = _milliseconds(row["lastVerifiedAt"], "lastVerifiedAt")
    # Never infer a fresh observation/verification clock from publisher refresh.
    return output


def build_generation(resolved: Mapping[str, Any], *, source_commit: str,
                     published_at: int, observed_at: int,
                     retention_policy_version: str = "upahead-retention-v2") -> dict[str, Any]:
    """Construct a deterministic, edge-verifiable shadow generation.

    Resolver entries without trusted bindings are quarantined, not silently
    promoted. All historical ledger identities persist separately.
    """
    if not isinstance(resolved, dict) or resolved.get("schemaVersion") != LEDGER_SCHEMA:
        raise ValueError("Invalid resolved occurrence state")
    if not SHA40.fullmatch(source_commit):
        raise ValueError("Source commit must be a pinned 40-digit lower-case SHA")
    published_at = _milliseconds(published_at, "publishedAt")
    observed_at = _milliseconds(observed_at, "observedAt")
    if observed_at > published_at:
        raise ValueError("Observation clock later than publication")
    if not retention_policy_version or not isinstance(retention_policy_version, str):
        raise ValueError("Missing retention policy version")
    ledger = resolved.get("ledger")
    if not isinstance(ledger, dict) or ledger.get("schemaVersion") != LEDGER_SCHEMA:
        raise ValueError("Missing/malformed durable occurrence ledger")
    all_occurrences = ledger.get("occurrences")
    current = resolved.get("occurrences")
    if not isinstance(all_occurrences, list) or not isinstance(current, list):
        raise ValueError("Invalid occurrence collections")
    ids = [r.get("canonicalOccurrenceId") for r in all_occurrences if isinstance(r, dict)]
    if len(ids) != len(all_occurrences) or len(ids) != len(set(ids)) or any(not x for x in ids):
        raise ValueError("Corrupt duplicate identity in ledger")
    if len(ids) > MAX_ROWS:
        raise ValueError("Shadow ledger limit exceeded")
    current_by_id = {r.get("canonicalOccurrenceId"): r for r in current}
    if len(current_by_id) != len(current) or not set(current_by_id).issubset(set(ids)):
        raise ValueError("Current identities do not match durable ledger")
    if any(current_by_id.get(r.get("canonicalOccurrenceId")) != r for r in all_occurrences
           if r.get("canonicalOccurrenceId") in current_by_id):
        raise ValueError("Ledger does not match current resolver output")

    items, pending, retired, quarantine, aliases = [], [], [], [], []
    # Include sticky historical cancellation/expiration tombstones, but NOT
    # untrusted historical ACTIVE items: stale source must never resurrect them.
    for row in sorted(all_occurrences, key=lambda r: r["canonicalOccurrenceId"]):
        cid = row["canonicalOccurrenceId"]
        decision = row.get("decision")
        if decision != "VERIFIED_BINDING":
            quarantine.append({"canonicalOccurrenceId": cid, "reason": decision or "UNVERIFIED"})
            continue
        try:
            record = _record(row, published_at=published_at)
        except ValueError as exc:
            # A malformed verified occurrence must block publication entirely,
            # not be reclassified silently as a benign empty result.
            raise ValueError(f"Verified occurrence {cid} rejected: {exc}") from exc
        if record["status"] == "CANCELLED" or record["expiryAt"] <= published_at:
            retired.append({"canonicalOccurrenceId": cid,
                            "status": "CANCELLED" if record["status"] == "CANCELLED" else "EXPIRED",
                            "expiryAt": record["expiryAt"]})
        elif cid not in current_by_id:
            # Historical still-valid entities are non-active until independently
            # reverified; hold them for explicit lifecycle review.
            quarantine.append({"canonicalOccurrenceId": cid, "reason": "MISSING_CURRENT_VERIFICATION"})
            continue
        elif record.get("eventStartAt", 0) > published_at + 7 * DAY_MS:
            if record["eventStartAt"] > published_at + MAX_PENDING_DAYS * DAY_MS:
                quarantine.append({"canonicalOccurrenceId": cid, "reason": "BEYOND_PENDING_HORIZON"})
                continue
            pending.append(record)
        else:
            items.append(record)
        # Include aliases only for active/pending/retired entries, matching Worker contract.
        if cid in {r["canonicalOccurrenceId"] for r in items + pending + retired}:
            aliases.extend({"alias": alias, "canonicalOccurrenceId": cid} for alias in record["sourceAliases"])
    seen_aliases = set()
    for a in aliases:
        if a["alias"] in seen_aliases:
            raise ValueError("One source alias cannot belong to multiple canonical occurrences")
        seen_aliases.add(a["alias"])
    payload = {"schemaVersion": 2, "items": items, "pendingItems": pending,
               "retiredOccurrences": retired, "retiredRevisions": [],
               "sourceAliases": aliases, "quarantine": quarantine}
    ledger_digest = _hash_bytes(_bytes(ledger))
    generation_id = "gen:v2:" + _sha({"sourceCommit": source_commit,
                "publishedAt": published_at, "observedAt": observed_at,
                "ledgerDigest": ledger_digest, "payload": payload})[7:47]
    payload["generationId"] = generation_id
    counts = {"active": len(items), "pending": len(pending), "retired": len(retired),
              "aliases": len(aliases)}
    manifest = {"schemaVersion": 2, "generationId": generation_id,
                "sourceCommit": source_commit, "identityVersion": 2,
                "retentionPolicyVersion": retention_policy_version,
                "ledgerVersion": LEDGER_VERSION, "ledgerDigest": ledger_digest,
                "publishedAt": published_at, "observedAt": observed_at,
                "recordCounts": counts,
                "semanticDigest": "sha256:" + hashlib.sha256(
                    canonical_generation_payload(payload).encode("utf-8")).hexdigest()}
    return {"manifest": manifest, "payload": payload, "ledger": ledger}


def _bytes(record: Any) -> bytes:
    return (json.dumps(record, sort_keys=True, ensure_ascii=False, allow_nan=False,
                       separators=(",", ":")) + "\n").encode("utf-8")


def _hash_bytes(record: bytes) -> str:
    return "sha256:" + hashlib.sha256(record).hexdigest()


def _atomic_write(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".stage-")
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def _read_object(path: Path) -> dict:
    with path.open("rb") as f:
        obj = json.load(f)
    if not isinstance(obj, dict):
        raise ValueError("Expected JSON object: " + path.name)
    return obj


def _generation_directory(root: Path, generation_id: str) -> Path:
    # A validated wire ID contains colons, which Windows paths cannot use.
    directory = root / "generations"
    portable = directory / generation_id.replace(":", "-")
    if os.name != "nt" and not portable.exists():
        legacy = directory / generation_id
        if legacy.exists():
            return legacy
    return portable


def read_current(directory: Path | str) -> dict | None:
    """Read only pointer-approved generation. No fallback on corruption."""
    root = Path(directory)
    pointer = root / "current.json"
    if not pointer.exists():
        return None
    current = _read_object(pointer)
    gen_id = current.get("generationId")
    if not isinstance(gen_id, str) or not GENERATION.fullmatch(gen_id):
        raise ValueError("Invalid generation pointer")
    target = _generation_directory(root, gen_id)
    files = {}
    for name in ("manifest", "payload", "ledger"):
        artifact = target / (name + ".json")
        data = artifact.read_bytes()
        if _hash_bytes(data) != current.get(name + "Digest"):
            raise ValueError("Generation pointer has mismatched " + name)
        files[name] = json.loads(data)
    if files["manifest"].get("generationId") != gen_id or files["payload"].get("generationId") != gen_id:
        raise ValueError("Pointer/manifest/payload generation mismatch")
    if files["manifest"].get("ledgerDigest") != _hash_bytes(_bytes(files["ledger"])):
        raise ValueError("Ledger digest mismatch")
    if files["manifest"].get("semanticDigest") != "sha256:" + hashlib.sha256(
            canonical_generation_payload(files["payload"]).encode("utf-8")).hexdigest():
        raise ValueError("Payload digest mismatch")
    return files


def commit_generation(directory: Path | str, generation: Mapping, *,
                      expected_current_generation: str | None = None,
                      inject_failure: str | None = None) -> str:
    """Durably stage 3 immutable artifacts; switch ONE atomic pointer last.

    No deletion of old generations. Expected-generation fencing prohibits stale
    writers from replacing a newer generation; a single writer lock prevents
    races, including separate processes.
    """
    root = Path(directory)
    root.mkdir(parents=True, exist_ok=True)
    lock_file = root / ".generation-writer.lock"
    try:
        fd = os.open(lock_file, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as exc:
        raise RuntimeError("Concurrent or interrupted publisher lock; manual recovery required") from exc
    try:
        os.close(fd)
        previous = read_current(root)
        previous_id = previous["manifest"]["generationId"] if previous else None
        if previous_id != expected_current_generation:
            raise ValueError("Generation fencing mismatch: refusing stale writer")
        if not isinstance(generation, Mapping) or not isinstance(generation.get("manifest"), dict):
            raise ValueError("Invalid generation envelope")
        gen_id = generation["manifest"].get("generationId")
        if not isinstance(gen_id, str) or not GENERATION.fullmatch(gen_id):
            raise ValueError("Invalid generation ID")
        if generation.get("payload", {}).get("generationId") != gen_id:
            raise ValueError("Manifest/payload generation mismatch")
        if generation["manifest"].get("ledgerDigest") != _hash_bytes(_bytes(generation.get("ledger"))):
            raise ValueError("Invalid ledger digest")
        if generation["manifest"].get("semanticDigest") != "sha256:" + hashlib.sha256(
                canonical_generation_payload(generation["payload"]).encode("utf-8")).hexdigest():
            raise ValueError("Invalid payload digest")
        target = _generation_directory(root, gen_id)
        target.mkdir(parents=True, exist_ok=True)
        receipts = {}
        for name in ("ledger", "payload", "manifest"):
            data = _bytes(generation[name])
            artifact = target / (name + ".json")
            if artifact.exists():
                if artifact.read_bytes() != data:
                    raise ValueError("Immutable generation artifact already exists with different bytes")
            else:
                _atomic_write(artifact, data)
            receipts[name + "Digest"] = _hash_bytes(data)
            if inject_failure == "after-" + name:
                raise RuntimeError("Injected publisher failure: " + name)
        pointer = {"generationId": gen_id, **receipts}
        _atomic_write(root / "current.json", _bytes(pointer))
        return gen_id
    finally:
        lock_file.unlink(missing_ok=True)


def resolve_and_build(observations: list[dict], *, source_commit: str,
                      published_at: int, observed_at: int, trusted_bindings: Mapping | None = None,
                      prior_ledger: Mapping | None = None) -> dict:
    """Explicitly shadow, not hooked to fetch_upahead_events.py."""
    resolved = resolve_observations(observations, trusted_bindings=trusted_bindings,
                                     prior_ledger=prior_ledger)
    return build_generation(resolved, source_commit=source_commit,
                            published_at=published_at, observed_at=observed_at)
