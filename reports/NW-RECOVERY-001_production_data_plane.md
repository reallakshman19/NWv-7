# NW-RECOVERY-001 — Production data plane recovery

## Status

Implementation branch only. No merge, scheduler activation, remote producer execution, or production data publication is claimed by this report.

## Production incident

The GitHub Pages application shell is deployable from `main/docs`, but the bytes served from `docs/newsdata` and `docs/data` can remain indefinitely stale. Current `main` has only `ci.yml` and `deploy.yml`; the producer workflows referenced by `deploy.yml` were deleted on 2026-07-21. The last committed Sections epoch is from that same period.

This is an authority-chain failure, not a ranking-threshold defect. The browser is correctly rejecting stale data.

## Recovery contract

NW-RECOVERY-001 adds one scheduler-independent production data command with four explicit domains:

```text
news
market
weather
travel
```

The command copies the repository producer inputs into a temporary staging directory and runs existing producer/validator logic there. Production paths are not mutated while collection or validation is in progress.

```text
repository inputs
      ↓
temporary staging tree
      ↓
producer commands
      ↓
domain validators + freshness gates
      ↓
PASS only
      ↓
public/<output> + docs/<output>
      ↓
SHA-256 parity verification
      ↓
public/_nw/production-data-manifest.json
docs/_nw/production-data-manifest.json
```

Dry-run is the default. Publication requires an explicit `--publish` / `npm run production:data:publish` invocation.

## Domain freshness gates

The initial recovery limits are operational publication limits, not ranking policy:

- news: 3 hours
- market: 8 hours
- weather: 8 hours
- travel: 8 hours

They only decide whether a generated snapshot is safe to publish. They do not alter browser story-age policy, Top Stories weights, source policy, or editorial ranking.

## Travel collector defect corrected

The existing RSS item parser used:

```js
/<item>([sS]*?)<\/item>/g
```

which does not mean "any character including newline" and can silently parse zero RSS items. Recovery changes it to:

```js
/<item>([\s\S]*?)<\/item>/g
```

The production travel gate refuses to publish zero-story snapshots for the four configured travel locations.

## Commands

```bash
npm run production:data:plan
npm run production:data:refresh
npm run production:data:publish
npm run production:data:verify
npm run test:production-data-recovery
```

Domain-scoped execution is supported directly:

```bash
node scripts/refresh_production_data.mjs --domain news
node scripts/refresh_production_data.mjs --domain news --publish
```

## Publication safety

- collection happens outside canonical `public/` and served `docs/`
- all selected domain outputs must exist and pass structural checks
- required freshness timestamps must be within the domain publication SLA
- `public/` and `docs/` receive identical bytes from the staged output
- both copies are SHA-256 checked after publication
- publication writes use temporary sibling files followed by rename
- a write failure triggers best-effort rollback of already touched targets
- the production manifest records source commit, domains, validation evidence, file hashes and byte counts

## Explicitly unchanged

- Top Stories ranking weights, thresholds and taxonomy
- source registry and publisher-family policy
- browser freshness limits
- Cloudflare Sections authority state
- Daily Digest Worker/D1 implementation
- Up Ahead Worker implementation
- `.github/workflows/**`
- generated production JSON in this implementation PR

## Validation performed in the implementation environment

PASS:

- Node syntax checks for all new recovery scripts
- functional temporary-directory publication test
- public/docs hash parity test on fixture data
- manifest publication test on fixture data
- travel parser guard
- `--plan` command produces the expected four-domain contract

NOT_RUN:

- live network producer acquisition
- real market/weather/news/travel refresh
- authenticated GitHub or external scheduler run
- real production publication
- full repository lint/unit/build

The first real data epoch remains a post-implementation operational gate. It must be run with valid network access and dependencies before production recovery is claimed.
