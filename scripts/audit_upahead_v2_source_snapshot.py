#!/usr/bin/env python3
"""Pinned, read-only replay of the full UpAhead v1 published source on issue #200.

No merge, mutating publisher command, Cloudflare activation or Planner edits.
"""
import argparse
import json
import sys
from pathlib import Path

from upahead_identity.source_audit import load_frozen_snapshot, audit_full_source_snapshot, read_pinned_git_blob


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default="public/data/up_ahead.json")
    parser.add_argument("--from-pinned-git-blob", action="store_true",
                        help="Read exact historical blob from Git (CI with full history)")
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--expected-git-blob", required=True)
    parser.add_argument("--source-commit", required=True)
    args = parser.parse_args(argv)
    try:
        source = (read_pinned_git_blob(Path(__file__).resolve().parents[1], git_blob=args.expected_git_blob)
                  if args.from_pinned_git_blob else Path(args.input))
        data = load_frozen_snapshot(source, sha256=args.expected_sha256,
                                    git_blob=args.expected_git_blob)
        report = audit_full_source_snapshot(data, source_sha256=args.expected_sha256,
                                            source_git_blob=args.expected_git_blob,
                                            source_commit=args.source_commit)
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        print("UpAhead v2 source audit HOLD: " + str(exc).split("\n")[0][:140], file=sys.stderr)
        return 1
    print(json.dumps(report, sort_keys=True, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
