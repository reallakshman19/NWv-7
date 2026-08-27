import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
  EXPECTED_SECTIONS_LANE_COUNT,
  ShadowCustodyError,
  type ShadowQueueMessage,
} from '../src/contracts';
import {
  attachDecisionObject,
  commitEpoch,
  readCurrentShadow,
  readEpoch,
  sealEpoch,
  stageDecisionEvidence,
  stageLaneEvidence,
  startEpoch,
  type CustodyEnv,
} from '../src/custody';
import { sha256Text } from '../src/crypto';
import {
  pruneExpiredD1Evidence,
  putImmutableD1EvidenceObject,
  readD1EvidenceUsage,
} from '../src/evidenceStore';
import { stageLiveLaneResult } from '../src/liveStore';
import { evaluateBundledFrozenReplay, runBundledFrozenReplay } from '../src/frozenReplay';
import { handleRequest, runScheduledDispatch, scheduledStatus, type Env } from '../src/index';
import {
  acquireAndStageLiveLane,
  finalizeLiveEpoch,
  startLiveEpoch,
  type LiveAcquisitionEnv,
} from '../src/liveAcquisition';
import { buildShadowLaneDefinitions, sectionsRegistryAuthority } from '../src/registry';
import {
  LIVE_MAX_FEED_BYTES,
  LIVE_MAX_ITEMS_PER_FEED,
  acquireLiveLane,
  buildBoundedBrowserFeedXml,
  parseLiveFeedText,
} from '../../../scripts/sections-live/sectionsLiveAuthority.mjs';
import { classifySectionsLiveParity } from '../../../scripts/sections-live/sectionsLiveParity.mjs';
import { qualifySectionsShadow } from '../../../scripts/sections-live/sectionsShadowQualification.mjs';

const NOW_MS = 1_800_000_000_000;
const DIGEST = 'a'.repeat(64);

class RecordingQueue implements Queue<ShadowQueueMessage> {
  readonly sent: ShadowQueueMessage[] = [];
  readonly batchRequests: MessageSendRequest<ShadowQueueMessage>[] = [];

  async metrics(): Promise<QueueMetrics> {
    return { backlogCount: this.sent.length, backlogBytes: 0 };
  }

  async send(message: ShadowQueueMessage): Promise<QueueSendResponse> {
    this.sent.push(message);
    return { metadata: { metrics: { backlogCount: this.sent.length, backlogBytes: 0 } } };
  }

  async sendBatch(messages: Iterable<MessageSendRequest<ShadowQueueMessage>>): Promise<QueueSendBatchResponse> {
    for (const message of messages) {
      this.batchRequests.push(message);
      this.sent.push(message.body);
    }
    return { metadata: { metrics: { backlogCount: this.sent.length, backlogBytes: 0 } } };
  }
}

function custodyEnv(overrides: Partial<CustodyEnv> = {}): CustodyEnv {
  const base = env as unknown as CustodyEnv;
  return {
    SHADOW_DB: base.SHADOW_DB,
    SHADOW_MAX_EPOCHS_PER_DAY: base.SHADOW_MAX_EPOCHS_PER_DAY,
    SHADOW_MAX_QUEUE_OPERATIONS_PER_DAY: base.SHADOW_MAX_QUEUE_OPERATIONS_PER_DAY,
    SHADOW_MAX_D1_READS_PER_DAY: base.SHADOW_MAX_D1_READS_PER_DAY,
    SHADOW_MAX_D1_WRITES_PER_DAY: base.SHADOW_MAX_D1_WRITES_PER_DAY,
    SHADOW_MAX_D1_EVIDENCE_BYTES: base.SHADOW_MAX_D1_EVIDENCE_BYTES,
    SHADOW_MAX_WORKER_INVOCATIONS_PER_DAY: base.SHADOW_MAX_WORKER_INVOCATIONS_PER_DAY,
    ...overrides,
  };
}

function liveEnv(queue = new RecordingQueue()): LiveAcquisitionEnv {
  return { ...custodyEnv(), SHADOW_QUEUE: queue };
}

async function startLive(target: LiveAcquisitionEnv, epochId: string, logicalSlot: number): Promise<void> {
  await startEpoch(target, {
    epochId,
    logicalSlot,
    scheduledAtMs: logicalSlot,
    evaluationNowMs: logicalSlot,
    attempt: 1,
    acquisitionMode: 'INDEPENDENT_LIVE',
    expectedLaneCount: EXPECTED_SECTIONS_LANE_COUNT,
    sourceRegistryVersion: sectionsRegistryAuthority.sourceRegistryVersion,
    sourceRegistryDigest: sectionsRegistryAuthority.sourceRegistryDigest,
    nowMs: logicalSlot,
  });
}

function rssResponse(storyKey: string, nowMs = NOW_MS): Response {
  const published = new Date(nowMs - 60_000).toUTCString();
  return new Response(`<?xml version="1.0"?><rss><channel><item>
    <title>Government issues public safety alert ${storyKey}</title>
    <description>Authorities announced an urgent public safety measure.</description>
    <link>https://stories.example/${storyKey}</link>
    <pubDate>${published}</pubDate>
  </item></channel></rss>`, {
    status: 200,
    headers: { 'content-type': 'application/rss+xml' },
  });
}

async function start(epochId: string, logicalSlot: number, overrides: Partial<CustodyEnv> = {}) {
  const target = custodyEnv(overrides);
  await startEpoch(target, {
    epochId,
    logicalSlot,
    scheduledAtMs: logicalSlot,
    evaluationNowMs: NOW_MS,
    attempt: 1,
    acquisitionMode: 'FROZEN_REPLAY',
    expectedLaneCount: EXPECTED_SECTIONS_LANE_COUNT,
    sourceRegistryVersion: sectionsRegistryAuthority.sourceRegistryVersion,
    sourceRegistryDigest: sectionsRegistryAuthority.sourceRegistryDigest,
    inputEvidenceDigest: DIGEST,
    nowMs: NOW_MS,
  });
  return target;
}

async function fillAndSeal(target: CustodyEnv, epochId: string): Promise<void> {
  const lanes = await buildShadowLaneDefinitions();
  for (const lane of lanes) {
    await stageLaneEvidence(target, {
      epochId,
      laneId: lane.laneId,
      sectionKey: lane.sectionKey,
      sourceGroup: lane.sourceGroup,
      sourceName: lane.sourceName,
      feedUrlDigest: lane.feedUrlDigest,
      disposition: 'EMPTY',
      itemCount: 0,
      evidenceDigest: await sha256Text(`${epochId}:${lane.laneId}`),
      attemptCount: 1,
      observedAtMs: NOW_MS,
    });
  }
  const decisionJson = JSON.stringify({ identity: `${epochId}:candidate` });
  await stageDecisionEvidence(target, {
    epochId,
    candidateIdentity: `${epochId}:candidate`,
    authoritativeRank: 1,
    selectedPosition: 1,
    displayedPosition: 1,
    evidenceDigest: await sha256Text(decisionJson),
    evidenceJson: decisionJson,
  });
  const decisionOutputDigest = await sha256Text(`${epochId}:output`);
  const objectText = JSON.stringify({ decisionOutputDigest, candidateCount: 1 });
  const objectDigest = await sha256Text(objectText);
  const objectKey = `normalized/test/${epochId}/${objectDigest}.json`;
  await putImmutableD1EvidenceObject(target, {
    objectKey,
    epochId,
    body: objectText,
    schemaVersion: 'test-v1',
    decisionOutputDigest,
    createdAtMs: NOW_MS,
    expiresAtMs: NOW_MS + 7 * 24 * 60 * 60 * 1_000,
  });
  await attachDecisionObject(target, {
    epochId,
    objectKey,
    objectDigest,
    decisionOutputDigest,
    expectedDecisionCount: 1,
  });
  await sealEpoch(target, epochId, NOW_MS + 1);
}

describe('Sections shadow deterministic authority', () => {
  it('reproduces the frozen PR-A decision digest exactly', async () => {
    const evidence = await evaluateBundledFrozenReplay();
    expect(evidence.decisionOutputDigest).toBe(
      '74a012724be58b1c834c88f699d0627eb3e82a2d24721a279ca70e6eff429fe2',
    );
    expect(evidence.candidateCount).toBe(evidence.candidateEvidence.length);
    expect(evidence.selectedIds).toEqual([
      'case-j-trichy-backfill',
      'case-c-google-alias',
      'case-g-exact-12h',
    ]);
  });

  it('runs the bundled replay through 41-lane custody and commits it', async () => {
    const result = await runBundledFrozenReplay(custodyEnv(), {
      epochId: 'frozen-001',
      logicalSlot: NOW_MS,
    });
    expect(result.epoch.state).toBe('SHADOW_COMMITTED');
    expect(result.epoch.terminal_lane_count).toBe(EXPECTED_SECTIONS_LANE_COUNT);
    expect(result.pointer.epoch_id).toBe('frozen-001');
    expect(result.epoch.decision_output_digest).toBe(
      '74a012724be58b1c834c88f699d0627eb3e82a2d24721a279ca70e6eff429fe2',
    );
    expect(await readD1EvidenceUsage(custodyEnv().SHADOW_DB)).toMatchObject({ objectCount: 1 });
  });
});

describe('Sections independent live acquisition', () => {
  it('parses bounded RSS evidence and rejects oversized feed bodies', async () => {
    const [lane] = await buildShadowLaneDefinitions();
    const parsed = parseLiveFeedText(await rssResponse('parser').text(), lane, NOW_MS);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({
      sourceGroup: lane.sourceGroup,
      timestampConfidence: 'high',
      publishedAtSource: 'feed_timestamp',
    });

    const oversized = await acquireLiveLane(lane, {
      nowMs: NOW_MS,
      fetchImpl: async () => new Response('not-read', {
        status: 200,
        headers: { 'content-length': String(LIVE_MAX_FEED_BYTES + 1) },
      }),
    });
    expect(oversized).toMatchObject({
      disposition: 'POLICY_BLOCKED',
      errorCode: 'FEED_BODY_TOO_LARGE',
      items: [],
    });
  });

  it('turns Browser Run extraction into a capped and escaped feed contract', () => {
    const entries = Array.from({ length: LIVE_MAX_ITEMS_PER_FEED + 5 }, (_, index) => ({
      title: `Safety & response <${index}>`,
      summary: `Authority says "ready" ${'x'.repeat(1_000)}`,
      url: `https://stories.example/browser-${index}?a=1&b=2`,
      publishedAt: new Date(NOW_MS - 60_000).toUTCString(),
    }));
    const xml = buildBoundedBrowserFeedXml({ recognized: true, entries });
    expect((xml.match(/<item>/g) || [])).toHaveLength(LIVE_MAX_ITEMS_PER_FEED);
    expect(xml).toContain('Safety &amp; response &lt;0&gt;');
    expect(xml).toContain('?a=1&amp;b=2');
    expect(parseLiveFeedText(xml, { sourceName: 'Browser', sourceGroup: 'google_news', sectionKey: 'topStories', laneId: 'browser' }, NOW_MS).items)
      .toHaveLength(LIVE_MAX_ITEMS_PER_FEED);
    expect(buildBoundedBrowserFeedXml({ recognized: false, entries })).toBe('');
  });

  it('fans one authenticated control message into exactly 41 bounded lane jobs', async () => {
    const queue = new RecordingQueue();
    const target = liveEnv(queue);
    await expect(startLiveEpoch(target, {
      type: 'START_LIVE_EPOCH',
      epochId: 'live-fanout',
      logicalSlot: NOW_MS,
      attempt: 1,
    })).resolves.toEqual({ status: 'LIVE_LANES_ENQUEUED', enqueuedLanes: 41 });
    expect(queue.sent).toHaveLength(41);
    expect(queue.sent.every(message => message.type === 'ACQUIRE_LIVE_LANE')).toBe(true);
    const lanes = await buildShadowLaneDefinitions();
    const googleLaneIds = new Set(lanes
      .filter(lane => lane.sourceGroup.startsWith('google_news'))
      .map(lane => lane.laneId));
    const googleDelays = queue.batchRequests
      .filter(request => request.body.type === 'ACQUIRE_LIVE_LANE' && googleLaneIds.has(request.body.laneId))
      .map(request => request.delaySeconds ?? 0);
    expect(googleDelays).toEqual(googleDelays.map((_, index) => index * 4));
    expect((await readEpoch(target.SHADOW_DB, 'live-fanout'))?.state).toBe('STAGED');
  });

  it('uses one budgeted Browser Run job for Google lanes when the disabled fallback is explicitly enabled', async () => {
    const queue = new RecordingQueue();
    const target: LiveAcquisitionEnv = {
      ...liveEnv(queue),
      SHADOW_BROWSER_FALLBACK_ENABLED: 'true',
      SHADOW_BROWSER: {
        fetch: async () => new Response(),
      },
    };
    await expect(startLiveEpoch(target, {
      type: 'START_LIVE_EPOCH',
      epochId: 'live-browser-fanout',
      logicalSlot: NOW_MS,
      attempt: 1,
    })).resolves.toEqual({ status: 'LIVE_LANES_ENQUEUED', enqueuedLanes: 41 });
    expect(queue.sent.filter(message => message.type === 'ACQUIRE_LIVE_LANE')).toHaveLength(30);
    expect(queue.sent.filter(message => message.type === 'ACQUIRE_LIVE_BROWSER_LANES')).toHaveLength(1);
    const quota = await target.SHADOW_DB.prepare(`
      SELECT epochs_reserved, browser_ms_reserved
      FROM sections_shadow_browser_quota_daily
    `).first<{ epochs_reserved: number; browser_ms_reserved: number }>();
    expect(quota).toMatchObject({ epochs_reserved: 1, browser_ms_reserved: 20_000 });
  });

  it('retries a transient source once before recording its terminal disposition', async () => {
    const target = liveEnv();
    await startLive(target, 'live-transient-retry', NOW_MS);
    const [lane] = await buildShadowLaneDefinitions();
    const message = {
      type: 'ACQUIRE_LIVE_LANE' as const,
      epochId: 'live-transient-retry',
      logicalSlot: NOW_MS,
      evaluationNowMs: NOW_MS,
      laneId: lane.laneId,
      attempt: 1,
    };
    const unavailable = async () => new Response('temporarily unavailable', { status: 503 });

    await expect(acquireAndStageLiveLane(target, message, unavailable, 1))
      .rejects.toMatchObject({ code: 'RETRYABLE_SOURCE_RESPONSE' });
    expect((await readEpoch(target.SHADOW_DB, 'live-transient-retry'))?.terminal_lane_count).toBe(0);

    await expect(acquireAndStageLiveLane(target, message, unavailable, 2))
      .resolves.toMatchObject({ disposition: 'HTTP_ERROR', httpStatus: 503, attemptCount: 2 });
    expect((await readEpoch(target.SHADOW_DB, 'live-transient-retry'))?.terminal_lane_count).toBe(1);
    const staged = await target.SHADOW_DB.prepare(`
      SELECT attempt_count FROM sections_shadow_lane_evidence
      WHERE epoch_id = 'live-transient-retry' AND lane_id = ?
    `).bind(lane.laneId).first<{ attempt_count: number }>();
    expect(Number(staged?.attempt_count)).toBe(2);
  });

  it('accepts identical live lane retries and rejects changed normalized evidence', async () => {
    const target = liveEnv();
    await startLive(target, 'live-retry', NOW_MS);
    const [lane] = await buildShadowLaneDefinitions();
    const message = {
      type: 'ACQUIRE_LIVE_LANE' as const,
      epochId: 'live-retry',
      logicalSlot: NOW_MS,
      evaluationNowMs: NOW_MS,
      laneId: lane.laneId,
      attempt: 1,
    };
    await acquireAndStageLiveLane(target, message, async () => rssResponse('stable-live'));
    await expect(acquireAndStageLiveLane(
      target,
      message,
      async () => rssResponse('stable-live'),
    )).resolves.toMatchObject({ disposition: 'OK' });
    await expect(acquireAndStageLiveLane(
      target,
      message,
      async () => rssResponse('changed-live'),
    )).rejects.toMatchObject({ code: 'LANE_RETRY_CONFLICT' });
  });

  it('acquires all 41 lanes, ranks shared evidence, and commits only after finalization', async () => {
    const queue = new RecordingQueue();
    const target = liveEnv(queue);
    await startLive(target, 'live-001', NOW_MS);
    const lanes = await buildShadowLaneDefinitions();
    const fetchImpl: typeof fetch = async input => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return rssResponse(await sha256Text(url).then(value => value.slice(0, 16)));
    };
    for (const lane of lanes) {
      await acquireAndStageLiveLane(target, {
        type: 'ACQUIRE_LIVE_LANE',
        epochId: 'live-001',
        logicalSlot: NOW_MS,
        evaluationNowMs: NOW_MS,
        laneId: lane.laneId,
        attempt: 1,
      }, fetchImpl);
    }
    expect((await readEpoch(target.SHADOW_DB, 'live-001'))?.state).toBe('STAGED');
    expect(queue.sent.filter(message => message.type === 'FINALIZE_LIVE_EPOCH')).toHaveLength(1);

    const committed = await finalizeLiveEpoch(target, {
      type: 'FINALIZE_LIVE_EPOCH',
      epochId: 'live-001',
      logicalSlot: NOW_MS,
      attempt: 1,
    });
    expect(committed.epoch).toMatchObject({
      state: 'SHADOW_COMMITTED',
      terminal_lane_count: 41,
      evidence_verified: 1,
      acquisition_mode: 'INDEPENDENT_LIVE',
    });
    expect(committed.epoch.actual_decision_count).toBeGreaterThan(0);
    const payloadCount = await target.SHADOW_DB.prepare(`
      SELECT COUNT(*) AS count FROM sections_shadow_lane_payloads WHERE epoch_id = 'live-001'
    `).first<{ count: number }>();
    expect(Number(payloadCount?.count)).toBe(41);
  });

  it('classifies the first live divergence boundary', async () => {
    const target = liveEnv();
    await startLive(target, 'live-parity', NOW_MS);
    const lanes = await buildShadowLaneDefinitions();
    const laneResults = [];
    for (const lane of lanes) {
      laneResults.push(await acquireLiveLane(lane, {
        nowMs: NOW_MS,
        fetchImpl: async () => rssResponse(lane.feedUrlDigest.slice(0, 16)),
      }));
    }
    const { buildSectionsLiveEvidence, compactSectionsLiveEvidence } = await import('../../../scripts/sections-live/sectionsLiveEvidence.mjs');
    const reference = compactSectionsLiveEvidence(buildSectionsLiveEvidence({
      laneResults,
      nowMs: NOW_MS,
      sourceRegistryVersion: sectionsRegistryAuthority.sourceRegistryVersion,
      sourceRegistryDigest: sectionsRegistryAuthority.sourceRegistryDigest,
    }));
    expect(reference.safety).toEqual({
      displayedDecisionCount: reference.displayedIds.length,
      staleAdmissionCount: 0,
      policyViolationCount: 0,
      falsePublisherCorroborationCount: 0,
    });
    expect(classifySectionsLiveParity(reference, structuredClone(reference))).toMatchObject({
      classification: 'MATCH',
      firstDivergentStage: null,
    });
    const changed = structuredClone(reference);
    changed.acquisition[0].itemCount += 1;
    expect(classifySectionsLiveParity(reference, changed)).toMatchObject({
      classification: 'ACQUISITION_DRIFT',
      firstDivergentStage: 'acquisition',
    });
  });
});

describe('Sections shadow qualification gate', () => {
  it('requires the full evidence window and rejects unknown critical drift', () => {
    const startMs = Date.parse('2026-08-24T00:00:00Z');
    const reports = Array.from({ length: 200 }, (_, index) => ({
      schemaVersion: 'nw-sections-live-parity-report/v1',
      referenceNowMs: startMs + index * 60 * 60 * 1_000,
      shadowNowMs: startMs + index * 60 * 60 * 1_000,
      shadowEpochId: `qualification-${index}`,
      shadowEvidenceVerified: true,
      classification: 'ACQUISITION_DRIFT',
      firstDivergentStage: 'acquisition',
      detail: {},
      metrics: {
        referenceLaneCount: 41,
        shadowLaneCount: 41,
        displayedOverlap: 10,
        displayedReferenceCount: 10,
        displayedShadowCount: 10,
        staleAdmissionCount: 0,
        policyViolationCount: 0,
        falsePublisherCorroborationCount: 0,
      },
    }));
    expect(qualifySectionsShadow(reports, { generatedAtMs: NOW_MS })).toMatchObject({
      status: 'QUALIFIED',
      metrics: {
        comparableEpochCount: 200,
        calendarDayCount: 9,
        weekendObserved: true,
        canonicalReferenceCoverage: 1,
        shadowPrecision: 1,
        top10OverlapRate: 1,
        unknownCriticalDriftCount: 0,
      },
    });

    const withUnknown = structuredClone(reports);
    withUnknown[199].classification = 'UNKNOWN_DRIFT';
    expect(qualifySectionsShadow(withUnknown, { generatedAtMs: NOW_MS })).toMatchObject({
      status: 'NOT_QUALIFIED',
      metrics: { comparableEpochCount: 199, unknownCriticalDriftCount: 1 },
    });
  });
});

describe('Sections shadow fail-closed custody', () => {
  it('keeps an incomplete epoch staged and invisible', async () => {
    const target = await start('partial-001', NOW_MS);
    const [lane] = await buildShadowLaneDefinitions();
    await stageLaneEvidence(target, {
      epochId: 'partial-001',
      laneId: lane.laneId,
      sectionKey: lane.sectionKey,
      sourceGroup: lane.sourceGroup,
      sourceName: lane.sourceName,
      feedUrlDigest: lane.feedUrlDigest,
      disposition: 'TIMEOUT',
      itemCount: 0,
      evidenceDigest: await sha256Text('partial-001'),
      attemptCount: 1,
      errorCode: 'FETCH_TIMEOUT',
      observedAtMs: NOW_MS,
    });

    await expect(sealEpoch(target, 'partial-001', NOW_MS + 1)).rejects.toMatchObject({
      code: 'INCOMPLETE_LANE_CARDINALITY',
    });
    expect((await readEpoch(target.SHADOW_DB, 'partial-001'))?.state).toBe('STAGED');
    expect(await readCurrentShadow(target.SHADOW_DB)).toBeNull();
  });

  it('accepts identical lane retries but rejects changed retry evidence', async () => {
    const target = await start('retry-001', NOW_MS);
    const [lane] = await buildShadowLaneDefinitions();
    const record = {
      epochId: 'retry-001',
      laneId: lane.laneId,
      sectionKey: lane.sectionKey,
      sourceGroup: lane.sourceGroup,
      sourceName: lane.sourceName,
      feedUrlDigest: lane.feedUrlDigest,
      disposition: 'EMPTY' as const,
      itemCount: 0,
      evidenceDigest: await sha256Text('stable-retry'),
      attemptCount: 1,
      observedAtMs: NOW_MS,
    };
    await stageLaneEvidence(target, record);
    await expect(stageLaneEvidence(target, record)).resolves.toBeUndefined();
    await expect(stageLaneEvidence(target, {
      ...record,
      evidenceDigest: await sha256Text('changed-retry'),
    })).rejects.toMatchObject({ code: 'LANE_RETRY_CONFLICT' });
  });

  it('refuses to seal when the immutable D1 object digest is corrupt', async () => {
    const target = await start('corrupt-001', NOW_MS);
    const lanes = await buildShadowLaneDefinitions();
    for (const lane of lanes) {
      await stageLaneEvidence(target, {
        epochId: 'corrupt-001',
        laneId: lane.laneId,
        sectionKey: lane.sectionKey,
        sourceGroup: lane.sourceGroup,
        sourceName: lane.sourceName,
        feedUrlDigest: lane.feedUrlDigest,
        disposition: 'EMPTY',
        itemCount: 0,
        evidenceDigest: await sha256Text(lane.laneId),
        attemptCount: 1,
        observedAtMs: NOW_MS,
      });
    }
    const evidenceJson = JSON.stringify({ identity: 'corrupt:candidate' });
    await stageDecisionEvidence(target, {
      epochId: 'corrupt-001',
      candidateIdentity: 'corrupt:candidate',
      authoritativeRank: 1,
      evidenceDigest: await sha256Text(evidenceJson),
      evidenceJson,
    });
    const objectKey = 'normalized/test/corrupt-001/object.json';
    const corruptBody = 'corrupt-after-digest';
    await target.SHADOW_DB.prepare(`
      INSERT INTO sections_shadow_evidence_objects (
        object_key, epoch_id, object_digest, schema_version,
        decision_output_digest, content_json, byte_length,
        created_at_ms, expires_at_ms
      ) VALUES (?, ?, ?, 'test-v1', ?, ?, ?, ?, ?)
    `).bind(
      objectKey,
      'corrupt-001',
      await sha256Text(corruptBody),
      await sha256Text('decision'),
      corruptBody,
      new TextEncoder().encode(corruptBody).byteLength,
      NOW_MS,
      NOW_MS + 7 * 24 * 60 * 60 * 1_000,
    ).run();
    await attachDecisionObject(target, {
      epochId: 'corrupt-001',
      objectKey,
      objectDigest: await sha256Text('original-before-corruption'),
      decisionOutputDigest: await sha256Text('decision'),
      expectedDecisionCount: 1,
    });
    await expect(sealEpoch(target, 'corrupt-001', NOW_MS + 1)).rejects.toMatchObject({
      code: 'EVIDENCE_OBJECT_DIGEST_MISMATCH',
    });
    expect(await readCurrentShadow(target.SHADOW_DB)).toBeNull();
  });

  it('atomically commits only a newer logical slot', async () => {
    const target = await start('newer-001', NOW_MS + 2);
    await fillAndSeal(target, 'newer-001');
    await commitEpoch(target, 'newer-001', NOW_MS + 3);

    await start('older-001', NOW_MS + 1);
    await fillAndSeal(target, 'older-001');
    await expect(commitEpoch(target, 'older-001', NOW_MS + 4)).rejects.toMatchObject({
      code: 'OUT_OF_ORDER_EPOCH',
    });

    const current = await readCurrentShadow(target.SHADOW_DB);
    expect(current?.epoch.epoch_id).toBe('newer-001');
    expect((await readEpoch(target.SHADOW_DB, 'older-001'))?.state).toBe('REJECTED');
  });

  it('makes duplicate commits harmless after a newer epoch becomes current', async () => {
    const target = await start('history-001', NOW_MS);
    await fillAndSeal(target, 'history-001');
    await commitEpoch(target, 'history-001', NOW_MS + 1);

    await start('history-002', NOW_MS + 2);
    await fillAndSeal(target, 'history-002');
    await commitEpoch(target, 'history-002', NOW_MS + 3);

    const retried = await commitEpoch(target, 'history-001', NOW_MS + 4);
    expect(retried.epoch.epoch_id).toBe('history-001');
    expect(retried.pointer.epoch_id).toBe('history-002');
    expect((await readCurrentShadow(target.SHADOW_DB))?.pointer.generation).toBe(2);
  });

  it('prevents a staged epoch from being installed as the shadow pointer', async () => {
    const target = await start('staged-pointer-001', NOW_MS);
    await expect(target.SHADOW_DB.prepare(`
      INSERT INTO sections_shadow_current_pointer (
        dataset_key, epoch_id, logical_slot, generation, updated_at_ms
      ) VALUES ('sections_shadow', 'staged-pointer-001', ?, 1, ?)
    `).bind(NOW_MS, NOW_MS).run()).rejects.toThrow(
      'sections_shadow_pointer_requires_committed_epoch',
    );
    expect(await readCurrentShadow(target.SHADOW_DB)).toBeNull();
  });

  it('preserves the last commit when the conservative Free envelope is full', async () => {
    const target = await start('capacity-current', NOW_MS, {
      SHADOW_MAX_EPOCHS_PER_DAY: '1',
    });
    await fillAndSeal(target, 'capacity-current');
    await commitEpoch(target, 'capacity-current', NOW_MS + 1);

    await expect(start('capacity-blocked', NOW_MS + 2, {
      SHADOW_MAX_EPOCHS_PER_DAY: '1',
    })).rejects.toEqual(expect.objectContaining<Partial<ShadowCustodyError>>({
      code: 'FREE_TIER_CAPACITY_EXHAUSTED',
    }));
    expect((await readCurrentShadow(target.SHADOW_DB))?.epoch.epoch_id).toBe('capacity-current');
    expect(await readEpoch(target.SHADOW_DB, 'capacity-blocked')).toBeNull();
  });

  it('preserves the last commit when the D1 evidence safety ceiling is full', async () => {
    const target = await start('storage-current', NOW_MS);
    await fillAndSeal(target, 'storage-current');
    await commitEpoch(target, 'storage-current', NOW_MS + 1);

    await expect(start('storage-blocked', NOW_MS + 2, {
      SHADOW_MAX_D1_EVIDENCE_BYTES: '1',
    })).rejects.toEqual(expect.objectContaining<Partial<ShadowCustodyError>>({
      code: 'FREE_TIER_STORAGE_CAPACITY_EXHAUSTED',
    }));
    expect((await readCurrentShadow(target.SHADOW_DB))?.epoch.epoch_id).toBe('storage-current');
    expect(await readEpoch(target.SHADOW_DB, 'storage-blocked')).toBeNull();
  });

  it('prunes expired non-current D1 evidence but retains current evidence', async () => {
    const target = await start('retention-old', NOW_MS);
    await fillAndSeal(target, 'retention-old');
    await commitEpoch(target, 'retention-old', NOW_MS + 1);

    await start('retention-current', NOW_MS + 2);
    await fillAndSeal(target, 'retention-current');
    await commitEpoch(target, 'retention-current', NOW_MS + 3);

    const afterExpiry = NOW_MS + 8 * 24 * 60 * 60 * 1_000;
    expect(await pruneExpiredD1Evidence(target.SHADOW_DB, afterExpiry)).toBe(1);
    expect(await readD1EvidenceUsage(target.SHADOW_DB)).toMatchObject({ objectCount: 1 });
    expect((await readCurrentShadow(target.SHADOW_DB))?.epoch.epoch_id).toBe('retention-current');
  });
});

describe('S1 authority boundary', () => {
  it('reports GitHub/static as serving authority while qualification acquisition is scheduled', async () => {
    const response = await handleRequest(
      new Request('https://shadow.invalid/health'),
      env as unknown as Env,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      mode: 'S1_GITHUB_PRIMARY_CF_SHADOW',
      servingAuthority: 'github_static',
      cloudflareBrowserServingAuthority: false,
      previewReadEnabled: true,
      shadowScheduleEnabled: true,
      liveAcquisitionEnabled: true,
      browserFallbackEnabled: true,
      evidenceStore: 'd1',
      sourceLaneCount: 41,
      writeSurface: 'queue_only',
    });
    expect(scheduledStatus(env as unknown as Env)).toEqual({
      status: 'LIVE_ACQUISITION_READY',
      enqueued: false,
    });
  });

  it('normalizes delayed hourly Cron delivery to a stable UTC-hour epoch', async () => {
    const queue = new RecordingQueue();
    const target = {
      ...liveEnv(queue),
      SHADOW_SCHEDULE_ENABLED: 'true',
      SHADOW_LIVE_ACQUISITION_ENABLED: 'true',
      SHADOW_FROZEN_REPLAY_TRIGGER_ENABLED: 'false',
    } as Env;
    const controller = {
      scheduledTime: NOW_MS + 56_000,
      cron: '0 * * * *',
      noRetry: () => undefined,
    } as unknown as ScheduledController;
    await expect(runScheduledDispatch(controller, target)).resolves.toEqual({
      status: 'LIVE_EPOCH_ENQUEUED',
      enqueued: true,
    });
    expect(queue.sent).toContainEqual({
      type: 'START_LIVE_EPOCH',
      epochId: `live-${NOW_MS}`,
      logicalSlot: NOW_MS,
      attempt: 1,
    });
  });

  it('protects operational shadow status and exposes no HTTP write route', async () => {
    const unauthorized = await handleRequest(
      new Request('https://shadow.invalid/internal/shadow/status'),
      env as unknown as Env,
    );
    expect(unauthorized.status).toBe(401);

    const authorizedRequest = new Request('https://shadow.invalid/internal/shadow/status', {
      headers: { Authorization: 'Bearer test-shadow-token' },
    });
    expect((await handleRequest(authorizedRequest, env as unknown as Env)).status).toBe(200);
    expect((await handleRequest(
      new Request('https://shadow.invalid/internal/shadow/status', { method: 'POST' }),
      env as unknown as Env,
    )).status).toBe(405);
  });

  it('serves only the validated current live epoch through the opt-in preview read', async () => {
    const target = liveEnv();
    await startLive(target, 'live-preview-001', NOW_MS);
    const epoch = await readEpoch(target.SHADOW_DB, 'live-preview-001');
    expect(epoch).not.toBeNull();

    const lanes = await buildShadowLaneDefinitions();
    for (const lane of lanes) {
      const isPreviewLane = lane.sectionKey === 'topStories' && lane === lanes.find(
        candidate => candidate.sectionKey === 'topStories',
      );
      await stageLiveLaneResult(target, epoch!, {
        lane,
        disposition: isPreviewLane ? 'OK' : 'EMPTY',
        items: isPreviewLane ? parseLiveFeedText(
          await rssResponse('preview').text(),
          lane,
          NOW_MS,
        ).items : [],
        httpStatus: 200,
        durationMs: 10,
        errorCode: null,
        diagnostics: {},
        observedAtMs: NOW_MS,
        attemptCount: 1,
      });
    }
    await finalizeLiveEpoch(target, {
      type: 'FINALIZE_LIVE_EPOCH',
      epochId: 'live-preview-001',
      logicalSlot: NOW_MS,
      attempt: 1,
    });

    const response = await handleRequest(
      new Request('https://shadow.invalid/preview/sections/latest'),
      { ...target, SHADOW_PREVIEW_READ_ENABLED: 'true' } as Env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('x-nw-data-source')).toBe('cloudflare-preview');
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: 2,
      fetchedAt: NOW_MS,
      preview: {
        dataSource: 'cloudflare_d1',
        epochId: 'live-preview-001',
        evidenceVerified: true,
        servingAuthority: 'github_static',
      },
      sections: {
        topStories: [expect.objectContaining({ title: expect.stringContaining('public safety alert') })],
      },
    });

    const preflight = await handleRequest(
      new Request('https://shadow.invalid/preview/sections/latest', { method: 'OPTIONS' }),
      { ...target, SHADOW_PREVIEW_READ_ENABLED: 'true' } as Env,
    );
    expect(preflight.status).toBe(204);
  });
});
