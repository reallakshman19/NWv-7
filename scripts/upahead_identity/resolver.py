"""Evidence-gated, deterministic occurrence resolution for UpAhead shadow comparisons.

This module is intentionally NOT wired into the live publisher. Bindings are
separately adjudicated evidence; raw feed fields cannot authorize a merge.
Unbound observations stay separate. No fuzzy/title/venue matching is performed.
"""
from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from collections.abc import Mapping, Sequence
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

SCHEMA = "upahead-occurrence-ledger/v2-shadow"
TRUSTED_ROLES = frozenset({"organizer", "official_issuer", "retailer", "release_platform", "editorial_verifier"})


def _canon(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


def _hash(value: object) -> str:
    return hashlib.sha256(_canon(value).encode("utf8")).hexdigest()


def _url(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        return ""
    try:
        p = urlsplit(value.strip())
        if p.scheme.lower() not in ("http", "https") or not p.netloc:
            return ""
        query = urlencode(sorted((k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
                                 if not k.lower().startswith("utm_") and k.lower() not in {"fbclid", "gclid"}))
        return urlunsplit((p.scheme.lower(), p.netloc.lower(), p.path.rstrip("/") or "/", query, ""))
    except ValueError:
        return ""


def binding_alias(row: Mapping) -> str:
    """Article alias is source-scoped; it is NOT the physical occurrence ID."""
    category = str(row.get("category") or "").strip().lower()
    source = str(row.get("sourceGroup") or row.get("source") or "").strip().lower()
    link = _url(row.get("url"))
    identifier = str(row.get("id") or "").strip()
    if not category or not source or not (link or identifier):
        raise ValueError("category, source and url/id required for identity custody")
    return "src:v2:" + _hash((category, source, link or "", identifier,
                              str(row.get("sourceRecordId") or ""),
                              str(row.get("sessionId") or "")))[:32]


def _adjudicated(binding: object) -> tuple[str, str, str, tuple[str, ...]] | None:
    """Only separately supplied and evidence-custodied match bindings qualify."""
    if not isinstance(binding, Mapping):
        return None
    role = str(binding.get("authorityRole") or "").strip()
    namespace = str(binding.get("authorityNamespace") or "").strip()
    occurrence = str(binding.get("authorityOccurrenceId") or "").strip()
    evidence = binding.get("evidenceRefs")
    if role not in TRUSTED_ROLES or not namespace or not occurrence or not isinstance(evidence, list):
        return None
    urls = tuple(sorted(set(u for value in evidence if (u := _url(value)))))
    if not urls or not str(binding.get("adjudicatedBy") or "").strip():
        return None
    return role, namespace, occurrence, urls


def _version(row: Mapping) -> tuple:
    def integer(key):
        try:
            return max(0, int(row.get(key) or 0))
        except (ValueError, TypeError, OverflowError):
            return 0
    # Full digest is the immutable tie breaker; never depend on list position.
    return (integer("revisionAt") or integer("updatedAt") or integer("publishedAt"),
            integer("lastVerifiedAt"), _hash(row))


def _status(row: Mapping) -> str:
    return "CANCELLED" if str(row.get("status") or "").upper() in {"CANCELLED", "CANCELED", "WITHDRAWN"} else "ACTIVE"


def resolve_observations(observations: Sequence[Mapping], *,
                         trusted_bindings: Mapping[str, Mapping] | None = None,
                         prior_ledger: Mapping | None = None) -> dict:
    """Return a deterministic *shadow* projection, never mutate caller inputs.

    trusted_bindings is an external curator/authority register keyed by
    binding_alias(observation). No raw verified flag or occurrenceId is trusted.
    Future publisher integration MUST independently verify custody of bindings.
    """
    trusted_bindings = trusted_bindings or {}
    prior_ledger = prior_ledger or {}
    if prior_ledger and prior_ledger.get("schemaVersion") != SCHEMA:
        raise ValueError("Unsupported ledger; fail closed rather than discarding state")
    prior = {r["canonicalOccurrenceId"]: r for r in prior_ledger.get("occurrences", [])}
    by_alias: dict[str, list[dict]] = defaultdict(list)
    for original in observations:
        if not isinstance(original, Mapping):
            raise ValueError("Observation is not a mapping")
        row = dict(original)
        alias = binding_alias(row)
        by_alias[alias].append(row)

    current: list[dict] = []
    for alias, rows in sorted(by_alias.items()):
        # One source alias may have revised title/body; a contradictory explicit
        # time slot is not a routine revision without independent lineage proof.
        slots = {(str(r.get("eventStartAt") or ""), str(r.get("eventEndAt") or "")) for r in rows}
        if len(slots) > 1 and not _adjudicated(trusted_bindings.get(alias)):
            raise ValueError("Conflicting source slots for one alias; require revision custody")
        latest = max(rows, key=_version)
        current.append({"alias": alias, "row": latest, "observationDigest": _hash(latest),
                        "allDigests": sorted({_hash(row) for row in rows}),
                        "binding": _adjudicated(trusted_bindings.get(alias))})

    candidates: dict[tuple, list[dict]] = defaultdict(list)
    for obs in current:
        b = obs["binding"]
        if b is None:
            key = ("UNBOUND", obs["alias"])
        else:
            role, namespace, occurrence, _ = b
            key = ("BOUND", str(obs["row"]["category"]).lower(), role, namespace, occurrence)
        candidates[key].append(obs)

    grouped: list[tuple[tuple, list[dict], str]] = []
    review: list[dict] = []
    for key, items in sorted(candidates.items()):
        if key[0] == "UNBOUND":
            grouped.append((key, items, "UNVERIFIED"))
            continue
        sessions = {str(item["row"].get("sessionId") or "").strip() for item in items}
        # Unknown is NOT a wildcard session. Mixed/contradictory identity must
        # not silently collapse physical occurrences.
        if len(sessions) > 1:
            review.append({"reason": "SESSION_SCOPE_CONFLICT", "bindingKey": list(key),
                           "sourceAliases": sorted(item["alias"] for item in items)})
            for item in items:
                grouped.append((("REVIEW", item["alias"]), [item], "REVIEW"))
        else:
            grouped.append((key, items, "VERIFIED_BINDING"))

    next_rows: list[dict] = []
    alias_redirects: list[dict] = []
    prior_by_alias = {a: r["canonicalOccurrenceId"] for r in prior.values() for a in r.get("sourceAliases", [])}
    for key, items, decision in sorted(grouped):
        if key[0] == "BOUND":
            identifier = ("bound", *key[1:])
        else:
            identifier = ("observation", items[0]["alias"])
        cid = "occ:v2:" + _hash(identifier)[:32]
        # Exact source membership is retained, while representative is chosen
        # using complete deterministic ordering rather than collector arrival.
        rows = [x["row"] for x in items]
        representative = max(rows, key=lambda r: (
            {"official": 4, "organizer": 3, "event_listing": 2, "news_report": 1}.get(str(r.get("sourceAuthority") or ""), 0),
            len([x for x in (r.get("eventStartAt"), r.get("eventEndAt"), r.get("expiryAt"), r.get("venue")) if x]),
            *_version(r)))
        aliases = sorted(x["alias"] for x in items)
        previous = prior.get(cid, {})
        old_status = previous.get("status")
        # Cancellation is sticky: a lower-trust recollection cannot resurrect.
        status = "CANCELLED" if old_status == "CANCELLED" or any(_status(r) == "CANCELLED" for r in rows) else "ACTIVE"
        evidence = sorted({url for x in items if x["binding"] for url in x["binding"][3]})
        old_first = previous.get("firstVisibleAt")
        first = old_first if old_first is not None else min((int(r["firstVisibleAt"]) for r in rows
                                                  if isinstance(r.get("firstVisibleAt"), int) and r["firstVisibleAt"] > 0), default=None)
        old_verified = previous.get("lastVerifiedAt") or 0
        verified = max([old_verified] + [int(r["lastVerifiedAt"]) for r in rows
                                            if isinstance(r.get("lastVerifiedAt"), int) and r["lastVerifiedAt"] > 0])
        item = {"canonicalOccurrenceId": cid, "identityVersion": 2,
                "contentClass": str(representative.get("category")), "decision": decision,
                "status": status, "sourceAliases": aliases,
                "evidenceRefs": evidence, "firstVisibleAt": first, "lastVerifiedAt": verified or None,
                "representativeObservation": representative,
                "sourceDigests": sorted({digest for x in items for digest in x["allDigests"]})}
        next_rows.append(item)
        for alias in aliases:
            previous_id = prior_by_alias.get(alias)
            if previous_id and previous_id != cid:
                alias_redirects.append({"sourceAlias": alias, "oldCanonicalOccurrenceId": previous_id,
                                        "proposedCanonicalOccurrenceId": cid,
                                        "status": "NEEDS_PLANNER_MIGRATION_REVIEW"})

    # Keep old identities as history for explicit migration and anti-resurrection.
    active_ids = {r["canonicalOccurrenceId"] for r in next_rows}
    history = [r for cid, r in sorted(prior.items()) if cid not in active_ids]
    ledger = {"schemaVersion": SCHEMA,
              "occurrences": sorted(next_rows + history, key=lambda x: x["canonicalOccurrenceId"])}
    return {"schemaVersion": SCHEMA, "occurrences": sorted(next_rows, key=lambda x: x["canonicalOccurrenceId"]),
            "reviewCandidates": sorted(review, key=_canon), "aliasRedirectProposals": sorted(alias_redirects, key=_canon),
            "ledger": ledger,
            "semanticDigest": _hash({"current": next_rows, "review": review, "redirects": alias_redirects})}
