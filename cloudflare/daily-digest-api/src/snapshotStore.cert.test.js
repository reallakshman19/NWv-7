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
    schema_version: 'daily-digest-snapshot/v1', policy_version: 'daily-digest-policy/v0.3',
    registry_version: 'daily-digest-registry/v0.5', decision_timezone: 'Asia/Kolkata',
    frozen_at: '2026-08-24T04:45:00Z', snapshot_revision: 2,
    composition_state: 'DEGRADED_GLOBAL_UNAVAILABLE',
  };
  const selections = [
    { slot: 'I2', initial_canonical_id: 'a', effective_canonical_id: 'b', selection_reason: 'initial', replacement_reason: 'health_failover' },
    { slot: 'I1', initial_canonical_id: 'c', effective_canonical_id: 'c', selection_reason: 'initial', replacement_reason: null },
  ];
  const candidates = [
    { canonical_id: 'b', publisher_family: 'INDIAN_EXPRESS', product: 'DAILY_BRIEFING', edition: 'DEFAULT', role: 'INDIA_GENERAL', title: 'Daily Briefing', canonical_url: 'https://indianexpress.com/article/live-news/daily-briefing/' },
    { canonical_id: 'c', publisher_family: 'AKASHVANI', product: 'MORNING_NEWS', edition: 'ENGLISH_NATIONAL', role: 'INDIA_GENERAL', title: 'Morning News', canonical_url: 'https://newsonair.gov.in/bulletins-detail-category/morning-news/' },
  ];
  function statement(sql) {
    return {
      async first() { return snapshotRow; },
      async all() {
        if (sql.includes('daily_digest_selections')) return { results: selections };
        if (sql.includes('daily_digest_candidates')) return { results: candidates };
        return { results: [] };
      },
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

function snapshot(candidates = []) {
  return {
    snapshotId: 'daily-digest:2026-08-24:v1', digestDate: '2026-08-24',
    schemaVersion: 'daily-digest-snapshot/v1', policyVersion: 'daily-digest-policy/v0.3',
    registryVersion: 'daily-digest-registry/v0.5', decisionTimezone: 'Asia/Kolkata',
    collectionStartedAt: '2026-08-24T04:15:00Z', frozenAt: '2026-08-24T04:45:00Z',
    snapshotRevision: 1, compositionState: 'DEGRADED_GLOBAL_UNAVAILABLE',
    createdAt: '2026-08-24T04:45:00Z', updatedAt: '2026-08-24T04:45:00Z',
    selections: { I1: { canonicalId: 'a', selectionReason: 'best_qualified_india_general' } },
    candidates,
  };
}

function qualityCandidate() {
  return {
    canonicalId: 'a', publisherFamily: 'AKASHVANI', product: 'MORNING_NEWS',
    edition: 'ENGLISH_NATIONAL', role: 'INDIA_GENERAL', qualificationState: 'QUALIFIED',
    scheduleState: 'EXPECTED', acquisitionState: 'OK', editionState: 'CURRENT',
    accessibilityState: 'UNKNOWN', roleFitClass: 'EXACT', significanceClass: 'HIGH',
    breadthClass: 'BROAD', diversityClass: 'DIVERSE', provenanceClass: 'PUBLIC_BROADCAST',
    decision: 'SELECTED', decisionReason: 'SELECTED_I1', title: 'Morning News',
    canonicalUrl: 'https://newsonair.gov.in/bulletins-detail-category/morning-news/',
    publisherPublishedAt: '2026-08-24T02:45:00Z', observedAt: '2026-08-24T04:45:00Z',
    qualityEvidenceVersion: 'daily-digest-quality/v0.1', qualityEvidenceState: 'OBSERVED',
    qualityIntegrityClass: 'SUFFICIENT', qualityItemCount: 6, qualityTopicCount: 6,
    qualityCoreTopicCount: 6, qualityDominantTopicShareBps: 1667,
    qualityTopicCountsJson: '{"COURTS":1,"ECONOMY":1}',
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

  it('persists derived quality audit plus digest-card metadata without raw bodies', () => {
    const db = fakeDb();
    const statements = buildSnapshotStatements(db, snapshot([qualityCandidate()]));
    const candidateInsert = statements.at(-1);
    expect(candidateInsert.sql).toContain('quality_evidence_version');
    expect(candidateInsert.sql).toContain('canonical_url');
    expect(candidateInsert.sql).toContain('title');
    expect(candidateInsert.sql).not.toMatch(/article_body|raw_content/i);
    expect(candidateInsert.values).toContain('Morning News');
  });

  it('reconstructs identities and ordered public cards independently', async () => {
    const result = await readSnapshot(fakeReadDb(), '2026-08-24');
    expect(result.initialSelection).toEqual({ I1: 'c', I2: 'a' });
    expect(result.effectiveSelection).toEqual({ I1: 'c', I2: 'b' });
    expect(result.snapshotRevision).toBe(2);
    expect(result.cards.map(card => card.slot)).toEqual(['I1', 'I2']);
    expect(result.cards[1]).toMatchObject({
      canonicalId: 'b',
      publisherFamily: 'INDIAN_EXPRESS',
      replacementReason: 'health_failover',
    });
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
