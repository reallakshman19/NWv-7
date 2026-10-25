# NWv-7 Oracle Cycle — standalone workspace

**Read [CURRENT.json](CURRENT.json) from the actual `main` branch before every Cycle.** The same file on this proposal branch is **not** an activated assignment.

- [Standalone Oracle source](https://github.com/reallakshman19/Common/blob/a9491531fb98f6fd14bc486a4cc78ee4680cb1f5/skills/agent-work/oracle-standalone/SKILL.md)
- [Oracle Cycle transport and receipt grammar](https://github.com/reallakshman19/Common/blob/a9491531fb98f6fd14bc486a4cc78ee4680cb1f5/oracle-cycles/PROTOCOL.md)
- [Append-only Cycle receipt inbox #146](https://github.com/reallakshman19/NWv-7/issues/146)
- [Original NWv-7 release PR #142](https://github.com/reallakshman19/NWv-7/pull/142)
- [Existing audit #138](https://github.com/reallakshman19/NWv-7/issues/138)

## Activation and first participant

Only a reviewed, authorized merge of this workspace's `CURRENT.json` to **NWv-7/main** can publish the proposed `ACTIVE` revision. Creating issue #146, this README or a draft pull request does not activate anything. Confirm the freshly fetched main version says `schema=oracle-cycle-current/v1`, `mode=standalone`, `activation=ACTIVE`, and has the configured receipt issue and correct chat-role label.

**After activation only**, the Owner can send this single line to the designated reviewer chat `6adc1e32`:

```text
Cycle now: https://github.com/reallakshman19/NWv-7/tree/main/oracle-cycles/nwv7
```

The reviewer must check GitHub permission and scope-specific independence. A chat display ID alone does not authorize an independent GitHub approval; `reallakshman19` is PR #142's author. If not assigned or missing proper capability, the reviewer returns `NO ACTION` or `BLOCKED` without pretending to vote.

## Release safety

No approval, branch-protection update, PR merge, deployment or Cloudflare Worker/D1/Queue change is granted by Cycle activation. The first Cycle is **read-only assessment of the repaired PR #142**; genuine unmocked World Chromium hydration is **currently FAIL** on the exact repair head despite code CI PASS and contributor-run synthetic counterexamples PASS. The latest source-of-truth gate references and limitations live in `CURRENT.json`, not this README.

Receipts to issue #146 must be public-safe; protected artifact transfer follows the selected [Common artifact relay](https://github.com/reallakshman19/Common/blob/a9491531fb98f6fd14bc486a4cc78ee4680cb1f5/skills/agent-work/ARTIFACT_RELAY.md). Progress Page changes require confirmed project mapping, actual `pp_cli.py` operations and separate Owner-reviewed publication; no automatic synchronization.
