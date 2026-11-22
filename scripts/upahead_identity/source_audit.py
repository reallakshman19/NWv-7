"""Read-only, full published-source custody replay for UpAhead issue #200.

The audit does NOT infer physical occurrence identity from article titles. Review
clusters are leads for original issuer verification, never canonical bindings.
It neither writes the public dataset nor mutates source/Planner/edge state.
"""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Mapping

from .generation import resolve_and_build
from .resolver import binding_alias

MAX_INPUT_BYTES = 8_000_000
MAX_INPUT_RECORDS = 2_000
SHA256 = re.compile(r"^[0-9a-f]{64}$")
GIT_BLOB = re.compile(r"^[0-9a-f]{40}$")


def _hash_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _blob_sha(raw: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()



def read_pinned_git_blob(repo_root: str | Path, *, git_blob: str) -> bytes:
    """Read the historical original from Git without trusting today's moving snapshot.

    CI checks out full repository history; this keeps the regression baseline
    immutable after subsequent refresh-workflow commits to public/data.
    """
    if not GIT_BLOB.fullmatch(git_blob):
        raise ValueError("Invalid pinned Git blob SHA")
    try:
        result = subprocess.run(["git", "cat-file", "blob", git_blob],
                                cwd=repo_root, capture_output=True, check=False,
                                timeout=10)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ValueError("Historical Git blob unavailable for audit") from exc
    if result.returncode != 0 or _blob_sha(result.stdout) != git_blob:
        raise ValueError("Historical Git blob missing or inconsistent")
    return result.stdout

def load_frozen_snapshot(source: str | Path | bytes, *, sha256: str, git_blob: str) -> dict:
    """Require byte-exact source pins; never accept a transformed Docs export."""
    if not SHA256.fullmatch(sha256) or not GIT_BLOB.fullmatch(git_blob):
        raise ValueError("Explicit exact SHA-256 and Git blob pins are mandatory")
    raw = source if isinstance(source, bytes) else Path(source).read_bytes()
    if not raw or len(raw) > MAX_INPUT_BYTES:
        raise ValueError("Snapshot missing or exceeds bounded source size")
    if _hash_bytes(raw) != sha256 or _blob_sha(raw) != git_blob:
        raise ValueError("Snapshot bytes differ from both pinned source identities")
    data = json.loads(raw)
    if not isinstance(data, dict) or data.get("schemaVersion") != 1:
        raise ValueError("Expected published UpAhead source v1 snapshot")
    stamp = data.get("fetchedAt")
    if type(stamp) is not int or stamp <= 0:
        raise ValueError("Snapshot has no usable source observation clock")
    for field in ("items", "pendingItems", "retiredRevisions"):
        if not isinstance(data.get(field), list):
            raise ValueError("Missing published source collection: " + field)
    if len(data["items"]) + len(data["pendingItems"]) > MAX_INPUT_RECORDS:
        raise ValueError("Snapshot exceeds source-audit safety ceiling")
    rows = data["items"] + data["pendingItems"]
    if any(not isinstance(item, dict) for item in rows):
        raise ValueError("Malformed source observation")
    if any(not isinstance(row.get("id"), str) or not row["id"].strip()
           or not isinstance(row.get("title"), str) or not row["title"].strip()
           for row in rows):
        raise ValueError("Missing source record identity or title")
    ids = [row["id"] for row in rows]
    aliases = [binding_alias(row) for row in rows]
    if len(set(ids)) != len(ids) or len(set(aliases)) != len(aliases):
        raise ValueError("Duplicate source ID or source-scoped alias in active/pending snapshot")
    retired_keys = set()
    current_keys = {(row["category"], row["id"]) for row in rows}
    for record in data["retiredRevisions"]:
        if not isinstance(record, dict) or not isinstance(record.get("identity"), list) or len(record["identity"]) != 2:
            raise ValueError("Malformed legacy retired revision identity")
        identity = tuple(record["identity"])
        if not all(isinstance(x, str) and x.strip() for x in identity):
            raise ValueError("Malformed legacy retired revision identity")
        if identity in retired_keys:
            raise ValueError("Duplicate retired revision identity")
        if identity in current_keys:
            raise ValueError("Retired legacy identity unexpectedly present in current source")
        retired_keys.add(identity)
    return data


def review_title_key(value: str) -> str:
    """A conservative *review-index* only; never an occurrence merger."""
    text = unicodedata.normalize("NFKC", value).casefold()
    text = text.replace("&", " and ")
    text = re.sub(r"\b(?:2|two)\s*[-\s]*days?\b", " ", text)
    text = re.sub(r"\bworkshops?\b", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def potential_review_clusters(rows: list[dict]) -> list[dict]:
    """Detect candidate duplicate descriptions without changing identity.

    Exact category, source group, city and start time are gates to *investigate*
    possible paraphrases, never evidence that two sessions are the same.
    Distinct explicit session IDs are a negative control, even for review leads.
    """
    groups = defaultdict(list)
    for row in rows:
        if row.get("category") != "events":
            continue
        title = row.get("title")
        if not isinstance(title, str) or "workshop" not in title.casefold():
            continue
        key = review_title_key(title)
        if not key or not row.get("eventStartAt"):
            continue
        groups[(row.get("category"), row.get("sourceGroup"), row.get("city"),
                row.get("eventStartAt"), key)].append(row)
    candidates = []
    for key, members in sorted(groups.items(), key=lambda p: str(p[0])):
        if len(members) < 2:
            continue
        sessions = {str(r.get("sessionId") or "").strip() for r in members}
        known = {sid for sid in sessions if sid}
        if len(known) > 1:
            continue
        candidates.append({
            "titleKey": key[-1], "category": key[0], "sourceGroup": key[1],
            "city": key[2], "eventStartAt": key[3],
            "sourceIds": sorted(r["id"] for r in members),
            "count": len(members),
            "status": "REVIEW_ONLY_UNCONFIRMED_SOURCE_EQUIVALENCE",
            "requiredProof": "original_organizer_event_and_session_identifiers",
        })
    return candidates


def audit_full_source_snapshot(data: Mapping[str, Any], *, source_sha256: str,
                               source_git_blob: str, source_commit: str) -> dict:
    """Exercise the *real* resolver and publisher with zero external bindings.

    No claimed source authority is upgraded to an authenticated event binding.
    Historical v1 retired revisions are inventoried, not interpreted as v2
    cancellation tombstones or silently reanimated.
    """
    if not isinstance(data, Mapping):
        raise ValueError("Missing source snapshot")
    rows = list(data["items"]) + list(data["pendingItems"])
    snapshot_at = data["fetchedAt"]
    if snapshot_at >= 2**53 - 2:
        raise ValueError("Snapshot clock too large for portable JS millisecond precision")
    generation = resolve_and_build(rows, source_commit=source_commit,
                                   observed_at=snapshot_at, published_at=snapshot_at + 1,
                                   trusted_bindings={})
    quarantine = generation["payload"]["quarantine"]
    if (generation["manifest"]["recordCounts"] !=
            {"active": 0, "pending": 0, "retired": 0, "aliases": 0}
            or len(quarantine) != len(rows)
            or any(entry["reason"] != "UNVERIFIED" for entry in quarantine)):
        raise ValueError("Source-only snapshot promoted or dropped an untrusted occurrence")
    if len(generation["ledger"]["occurrences"]) != len(rows):
        raise ValueError("Snapshot resolver lost a source observation")
    review = potential_review_clusters(rows)
    return {
        "mode": "READ_ONLY_SHADOW_EVIDENCE_NOT_RELEASE_AUTHORIZATION",
        "sourceCommit": source_commit,
        "sourceGitBlob": source_git_blob,
        "sourceSha256": "sha256:" + source_sha256,
        "snapshotFetchedAt": snapshot_at,
        "inputCounts": {
            "active": len(data["items"]), "pending": len(data["pendingItems"]),
            "retiredRevisionMetadata": len(data["retiredRevisions"]),
            "totalReplayed": len(rows),
        },
        "sourceCategoryCounts": dict(sorted(Counter(r["category"] for r in rows).items())),
        "unverifiedObservationCount": len(quarantine),
        "verifiedActive": len(generation["payload"]["items"]),
        "verifiedPending": len(generation["payload"]["pendingItems"]),
        "identityMergeCount": 0,
        "reviewOnlyClusters": review,
        "missingSessionIdCount": sum(not r.get("sessionId") for r in rows),
        "missingVerifiedClockCount": sum(not r.get("lastVerifiedAt") for r in rows),
        "shadowGenerationId": generation["manifest"]["generationId"],
        "shadowDigest": generation["manifest"]["semanticDigest"],
        "authorization": "WITHHELD_UNTIL_ORIGINAL_ISSUER_EVIDENCE_AND_INDEPENDENT_ADJUDICATION",
    }
