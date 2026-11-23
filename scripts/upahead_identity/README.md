# UpAhead occurrence identity v2 — shadow engine

Source of authority: [NW-UPAHEAD-IDENTITY-V2 #200](https://github.com/reallakshman19/NWv-7/issues/200).

The first implementation separates **source record aliases** from **verified real-world occurrences**. All operations are pure deterministic Python; it does not modify `up_ahead.json`, the production publisher or user Planner state. It is intentionally safe to run against frozen input in shadow mode.

Usage:

```python
from upahead_identity import binding_alias, resolve_observations

observations = [
    {"id": "source-1", "title": "Sample workshop", "category": "events",
     "source": "Example Calendar", "url": "https://example.org/s1"},
]
# No merger is implied by a matching title. Only independent, review-custodied
# evidence can become trusted_bindings.
result = resolve_observations(observations)
assert result["occurrences"][0]["decision"] == "UNVERIFIED"
```

A trusted external binding requires `authorityRole`, `authorityNamespace`, `authorityOccurrenceId`, `evidenceRefs` (nonempty public URLs), and `adjudicatedBy`. Merely satisfying those fields does not mean the claim is genuinely verified; a later approved registry and authority checks must control who can write them. Never populate bindings directly from RSS/Google News titles or self-reported flags.

`aliasRedirectProposals` are evidence for a future Planner migration and **must not** be applied to user storage without readback, rollback and idempotent migration tests.

Exit status: **P1/P2 shadow only; NOT a live duplicate fix; no stage-2 acceptance.**
