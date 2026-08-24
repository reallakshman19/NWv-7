import { describe, expect, it } from 'vitest';
import {
  buildSnapshotStatements,
  readSnapshot,
  replaceSelectionSameSlot,
} from './snapshotStore.js';

function fakeDb() {
  const batches = [];
  return {
    batches,
    prepare(sql) {
      return {
        bind(...values) {
          return { sql, values };
        },
      };
    },
    async batch(statements) {
      batches.push(statements);
      return statements.map(() => ({ success: true }));
    },
  };
}

function fakeReadDb() {
  const snapshotRow = {
    snapshot_id: 'daily-digest:2026-08-24:v1', digest_date: '2026-08-24',
    schema_version: 'daily-digest-snapshot/v1', policy_version: 'daily-digest-policy/v0.2',
    registry_version: 'daily-digest-registry/v0.1', decision_timezone: 'Asia/Kolkata',
    frozen_at: '2026-08-24T04:45:00Z', snapshot_revision: 2,
    composition_state: 'DEGRADED_GLOBAL_UNAVAILABLE',
  };
  const rows = [{ slot: 'I1', initial_canonical_id: 'a', effective_canonical_id: 'b' }];
  function statement(sql) {
    return {
      async first() { return snapshotRow; },
      async all() { return { results: sql.includes('daily_digest_selections') ? rows : [] }; },
    };
  }
  return {
    prepare(sql) {
      return {
        ...statement(sql),
        bind() { return statement(sql); },
      };
    },
  };
}

function snapshot() {
  return {
    snapshotId: 'daily-digest:2026-08-24:v1', digestDate: '2026-08-24',
    schemaVersion: 'daily-digest-snapshot/v1', policyVersion: 'daily-digest-policy/v0.2',
    registryVersion: 'daily-digest-registry/v0.1', decisionTimezone: 'Asia/Kolkata',
    collectionStartedAt: '2026-08-24T04:15:00Z', frozenAt: '2026-08-24T04:45:00Z',
    snapshotRevision: 1, compositionState: 'DEGRADED_GLOBAL_UNAVAILABLE',
    createdAt: '2026-08-24T04:45:00Z', updatedAt: '2026-08-24T04:45:00Z',
    selections: { I1: { canonicalId: 'a', selectionReason: 'best_qualified_india_general' } },
    candidates: [],
  };
}

describe('daily digest D1 store', () => {
  it('builds prepared bound statements for one atomic batch', () => {
    const db = fakeDb();
    const statements = buildSnapshotStatements(db, snapshot());
    expect(statements.length).toBe(2);
    statements.forEach(statement => {
      expect(statement.sql).toContain('?');
      expect(statement.values.length).toBeGreaterThan(0);
    });
  });

  it('reconstructs initial and effective identities independently', async () => {
    const result = await readSnapshot(fakeReadDb(), '2026-08-24');
    expect(result.initialSelection).toEqual({ I1: 'a' });
    expect(result.effectiveSelection).toEqual({ I1: 'b' });
    expect(result.snapshotRevision).toBe(2);
  });

  it('same-slot replacement preserves initial identity and appends evidence', async () => {
    const db = fakeDb();
    await replaceSelectionSameSlot(db, {
      snapshotId: 'daily-digest:2026-08-24:v1', slot: 'I1',
      nextCanonicalId: 'b', reason: 'health_failover', occurredAt: '2026-08-24T05:00:00Z',
    });
    const statements = db.batches[0];
    expect(statements).toHaveLength(3);
    expect(statements[0].sql).toContain('INSERT INTO daily_digest_selection_events');
    expect(statements[1].sql).toContain('SET effective_canonical_id = ?');
    expect(statements[1].sql).not.toContain('initial_canonical_id =');
    expect(statements[2].sql).toContain('snapshot_revision = snapshot_revision + 1');
    expect(statements[2].sql).toContain('EXISTS');
  });
});
