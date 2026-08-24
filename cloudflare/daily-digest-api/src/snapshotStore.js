function bind(db, sql, values) {
  return db.prepare(sql).bind(...values);
}

function selectionStatements(db, snapshot) {
  return Object.entries(snapshot.selections || {}).map(([slot, selected]) => bind(db, `
    INSERT INTO daily_digest_selections (
      snapshot_id, slot, initial_canonical_id, effective_canonical_id,
      selection_reason, replacement_reason
    ) VALUES (?, ?, ?, ?, ?, NULL)
  `, [snapshot.snapshotId, slot, selected.canonicalId, selected.canonicalId, selected.selectionReason]));
}

function candidateStatements(db, snapshot) {
  return (snapshot.candidates || []).map(candidate => bind(db, `
    INSERT INTO daily_digest_candidates (
      snapshot_id, canonical_id, publisher_family, product, edition, role,
      qualification_state, schedule_state, acquisition_state, edition_state,
      accessibility_state, role_fit_class, significance_class, breadth_class,
      diversity_class, provenance_class, decision, decision_reason,
      publisher_published_at, observed_at, quality_evidence_version,
      quality_evidence_state, quality_integrity_class, quality_item_count,
      quality_topic_count, quality_core_topic_count,
      quality_dominant_topic_share_bps, quality_topic_counts_json,
      title, canonical_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    snapshot.snapshotId, candidate.canonicalId, candidate.publisherFamily, candidate.product,
    candidate.edition, candidate.role, candidate.qualificationState, candidate.scheduleState,
    candidate.acquisitionState, candidate.editionState, candidate.accessibilityState,
    candidate.roleFitClass, candidate.significanceClass, candidate.breadthClass,
    candidate.diversityClass, candidate.provenanceClass, candidate.decision,
    candidate.decisionReason, candidate.publisherPublishedAt || null, candidate.observedAt,
    candidate.qualityEvidenceVersion || null, candidate.qualityEvidenceState || null,
    candidate.qualityIntegrityClass || null, candidate.qualityItemCount ?? null,
    candidate.qualityTopicCount ?? null, candidate.qualityCoreTopicCount ?? null,
    candidate.qualityDominantTopicShareBps ?? null, candidate.qualityTopicCountsJson || null,
    candidate.title || null, candidate.canonicalUrl || null,
  ]));
}

export function buildSnapshotStatements(db, snapshot) {
  const snapshotInsert = bind(db, `
    INSERT INTO daily_digest_snapshots (
      snapshot_id, digest_date, schema_version, policy_version, registry_version,
      decision_timezone, collection_started_at, frozen_at, snapshot_revision,
      composition_state, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    snapshot.snapshotId, snapshot.digestDate, snapshot.schemaVersion, snapshot.policyVersion,
    snapshot.registryVersion, snapshot.decisionTimezone, snapshot.collectionStartedAt || null,
    snapshot.frozenAt, snapshot.snapshotRevision, snapshot.compositionState,
    snapshot.createdAt, snapshot.updatedAt,
  ]);
  return [snapshotInsert, ...selectionStatements(db, snapshot), ...candidateStatements(db, snapshot)];
}

export async function writeSnapshot(db, snapshot) {
  const statements = buildSnapshotStatements(db, snapshot);
  const results = await db.batch(statements);
  return { statementCount: statements.length, results };
}

function rowsFrom(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function selectionMap(rows, field) {
  return Object.fromEntries(rows.map(row => [row.slot, row[field]]));
}

const SLOT_ORDER = Object.freeze({ I1: 1, I2: 2, I3: 3, G1: 4 });

function orderSelections(rows) {
  return [...rows].sort((a, b) => (
    (SLOT_ORDER[a.slot] || 99) - (SLOT_ORDER[b.slot] || 99)
  ));
}

function buildPublicCards(selections, candidates) {
  const byId = new Map(candidates.map(row => [row.canonical_id, row]));
  return orderSelections(selections).map(selection => {
    const candidate = byId.get(selection.effective_canonical_id);
    if (!candidate) return null;
    return {
      slot: selection.slot,
      canonicalId: selection.effective_canonical_id,
      publisherFamily: candidate.publisher_family,
      product: candidate.product,
      edition: candidate.edition,
      role: candidate.role,
      title: candidate.title || null,
      canonicalUrl: candidate.canonical_url || null,
      selectionReason: selection.selection_reason,
      replacementReason: selection.replacement_reason || null,
    };
  }).filter(Boolean);
}

async function readSnapshotRows(db, snapshotId) {
  const selections = rowsFrom(await bind(db,
    'SELECT * FROM daily_digest_selections WHERE snapshot_id = ?',
    [snapshotId],
  ).all());
  const candidates = rowsFrom(await bind(db, `
    SELECT canonical_id, publisher_family, product, edition, role, title, canonical_url
    FROM daily_digest_candidates WHERE snapshot_id = ?
  `, [snapshotId]).all());
  return { selections: orderSelections(selections), candidates };
}

export async function readSnapshot(db, digestDate = null) {
  const query = digestDate
    ? 'SELECT * FROM daily_digest_snapshots WHERE digest_date = ? LIMIT 1'
    : 'SELECT * FROM daily_digest_snapshots ORDER BY digest_date DESC LIMIT 1';
  const prepared = digestDate ? bind(db, query, [digestDate]) : db.prepare(query);
  const snapshot = await prepared.first();
  if (!snapshot) return null;
  const rows = await readSnapshotRows(db, snapshot.snapshot_id);
  return {
    schemaVersion: snapshot.schema_version,
    snapshotId: snapshot.snapshot_id,
    digestDate: snapshot.digest_date,
    policyVersion: snapshot.policy_version,
    registryVersion: snapshot.registry_version,
    decisionTimezone: snapshot.decision_timezone,
    frozenAt: snapshot.frozen_at,
    snapshotRevision: snapshot.snapshot_revision,
    compositionState: snapshot.composition_state,
    initialSelection: selectionMap(rows.selections, 'initial_canonical_id'),
    effectiveSelection: selectionMap(rows.selections, 'effective_canonical_id'),
    cards: buildPublicCards(rows.selections, rows.candidates),
  };
}

export async function replaceSelectionSameSlot(db, change) {
  const occurredAt = change.occurredAt || new Date().toISOString();
  const statements = [
    bind(db, `
      INSERT INTO daily_digest_selection_events (
        snapshot_id, snapshot_revision, slot, event_type, prior_canonical_id,
        next_canonical_id, reason, occurred_at
      )
      SELECT s.snapshot_id, d.snapshot_revision + 1, s.slot, 'HEALTH_FAILOVER',
        s.effective_canonical_id, ?, ?, ?
      FROM daily_digest_selections s
      JOIN daily_digest_snapshots d ON d.snapshot_id = s.snapshot_id
      WHERE s.snapshot_id = ? AND s.slot = ?
    `, [change.nextCanonicalId, change.reason, occurredAt, change.snapshotId, change.slot]),
    bind(db, `
      UPDATE daily_digest_selections
      SET effective_canonical_id = ?, replacement_reason = ?
      WHERE snapshot_id = ? AND slot = ?
    `, [change.nextCanonicalId, change.reason, change.snapshotId, change.slot]),
    bind(db, `
      UPDATE daily_digest_snapshots
      SET snapshot_revision = snapshot_revision + 1, updated_at = ?
      WHERE snapshot_id = ?
        AND EXISTS (
          SELECT 1 FROM daily_digest_selections
          WHERE snapshot_id = ? AND slot = ?
        )
    `, [occurredAt, change.snapshotId, change.snapshotId, change.slot]),
  ];
  return db.batch(statements);
}
