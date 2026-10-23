import {
  LIVE_MAX_ITEMS_PER_FEED,
  LIVE_MAX_PUBLISHED_AT_CHARS,
  LIVE_MAX_SUMMARY_CHARS,
  LIVE_MAX_TITLE_CHARS,
  LIVE_MAX_URL_CHARS,
  acquireLiveLane,
  buildBoundedBrowserFeedXml,
} from '../../../scripts/sections-live/sectionsLiveAuthority.mjs';
import {
  buildSectionsLiveEvidence,
  compactSectionsLiveEvidence,
} from '../../../scripts/sections-live/sectionsLiveEvidence.mjs';
import {
  EXPECTED_SECTIONS_LANE_COUNT,
  ShadowCustodyError,
  type AcquireLiveBrowserLanesQueueMessage,
  type AcquireLiveLaneQueueMessage,
  type DecisionEvidenceRow,
  type FinalizeLiveEpochQueueMessage,
  type ShadowQueueMessage,
  type StartLiveEpochQueueMessage,
} from './contracts';
import { recordBrowserUsage, reserveBrowserCapacity } from './browserQuota';
import {
  attachDecisionObject,
  attachLiveInputDigest,
  commitEpoch,
  readCurrentShadow,
  readEpoch,
  sealEpoch,
  stageDecisionEvidenceBatch,
  startEpoch,
  type CustodyEnv,
} from './custody';
import { sha256Text } from './crypto';
import { logUnexpectedFinalizationStage } from './queueDiagnostics';
import { putImmutableD1EvidenceObject } from './evidenceStore';
import { readLiveLaneResults, stageLiveLaneResult, type StoredLiveLaneResult } from './liveStore';
import { buildShadowLaneDefinitions, sectionsRegistryAuthority } from './registry';

const DAY_MS = 24 * 60 * 60 * 1_000;
const GOOGLE_LANE_STAGGER_SECONDS = 4;
const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);
const BROWSER_FEED_EXTRACTION_LIMITS = Object.freeze({
  maxItems: LIVE_MAX_ITEMS_PER_FEED,
  maxTitleChars: LIVE_MAX_TITLE_CHARS,
  maxSummaryChars: LIVE_MAX_SUMMARY_CHARS,
  maxUrlChars: LIVE_MAX_URL_CHARS,
  maxPublishedAtChars: LIVE_MAX_PUBLISHED_AT_CHARS,
});
const BROWSER_FEED_EXTRACTION_EXPRESSION = `(() => {
  const limits = ${JSON.stringify(BROWSER_FEED_EXTRACTION_LIMITS)};
  const sourceRoot = document.querySelector('#webkit-xml-viewer-source-xml') || document;
  const elements = Array.from(sourceRoot.querySelectorAll('*'));
  const localName = element => String(element.localName || '').toLowerCase();
  const entryNodes = elements
    .filter(element => ['item', 'entry'].includes(localName(element)))
    .slice(0, limits.maxItems);
  const recognized = entryNodes.length > 0 || elements.some(element =>
    ['rss', 'rdf', 'feed', 'channel'].includes(localName(element))
  );
  const field = (entry, names, maxChars) => {
    const candidate = Array.from(entry.querySelectorAll('*'))
      .find(element => names.includes(localName(element)));
    return String(candidate?.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, maxChars);
  };
  return {
    recognized,
    entries: entryNodes.map(entry => {
      const linkElement = Array.from(entry.querySelectorAll('*'))
        .find(element => localName(element) === 'link');
      const atomHref = linkElement?.getAttribute('href') || '';
      return {
        title: field(entry, ['title'], limits.maxTitleChars),
        summary: field(entry, ['description', 'summary', 'content', 'encoded'], limits.maxSummaryChars),
        url: String(atomHref || linkElement?.textContent || '')
          .replace(/\\s+/g, ' ').trim().slice(0, limits.maxUrlChars),
        publishedAt: field(entry, ['pubdate', 'published', 'updated', 'date'], limits.maxPublishedAtChars),
      };
    }),
  };
})()`;

interface BrowserFeedExtraction {
  recognized: boolean;
  entries: Array<{ title: string; summary: string; url: string; publishedAt: string }>;
}

export interface LiveAcquisitionEnv extends CustodyEnv {
  SHADOW_QUEUE: Queue<ShadowQueueMessage>;
  SHADOW_BROWSER?: Pick<Cloudflare.Env['SHADOW_BROWSER'], 'fetch'>;
  SHADOW_BROWSER_FALLBACK_ENABLED?: string;
}

function isBrowserLane(sourceGroup: string): boolean {
  return sourceGroup.startsWith('google_news');
}

export async function startLiveEpoch(
  env: LiveAcquisitionEnv,
  input: StartLiveEpochQueueMessage,
): Promise<{ status: string; enqueuedLanes: number }> {
  const nowMs = Date.now();
  const existing = await readEpoch(env.SHADOW_DB, input.epochId);
  if (existing?.state === 'SHADOW_COMMITTED' || existing?.state === 'ABORTED' || existing?.state === 'REJECTED') {
    return { status: existing.state, enqueuedLanes: 0 };
  }
  if (existing?.state === 'SEALED') {
    await env.SHADOW_QUEUE.send({
      type: 'FINALIZE_LIVE_EPOCH',
      epochId: input.epochId,
      logicalSlot: input.logicalSlot,
      attempt: input.attempt ?? 1,
    });
    return { status: 'FINALIZER_REENQUEUED', enqueuedLanes: 0 };
  }
  const useBrowserFallback = env.SHADOW_BROWSER_FALLBACK_ENABLED === 'true';
  if (useBrowserFallback && !env.SHADOW_BROWSER) {
    throw new ShadowCustodyError('BROWSER_BINDING_MISSING', 'Browser fallback is enabled without a binding');
  }
  if (useBrowserFallback && !existing) await reserveBrowserCapacity(env, nowMs);

  const epoch = await startEpoch(env, {
    epochId: input.epochId,
    logicalSlot: input.logicalSlot,
    scheduledAtMs: input.logicalSlot,
    evaluationNowMs: input.logicalSlot,
    attempt: input.attempt ?? 1,
    acquisitionMode: 'INDEPENDENT_LIVE',
    expectedLaneCount: EXPECTED_SECTIONS_LANE_COUNT,
    sourceRegistryVersion: sectionsRegistryAuthority.sourceRegistryVersion,
    sourceRegistryDigest: sectionsRegistryAuthority.sourceRegistryDigest,
    nowMs,
  });
  const lanes = await buildShadowLaneDefinitions();
  const directLanes = useBrowserFallback ? lanes.filter(lane => !isBrowserLane(lane.sourceGroup)) : lanes;
  let googleLaneOrdinal = 0;
  const requests: MessageSendRequest<ShadowQueueMessage>[] = directLanes.map(lane => {
    const googleDelaySeconds = lane.sourceGroup.startsWith('google_news')
      ? googleLaneOrdinal++ * GOOGLE_LANE_STAGGER_SECONDS
      : 0;
    return {
      body: {
        type: 'ACQUIRE_LIVE_LANE' as const,
        epochId: epoch.epoch_id,
        logicalSlot: epoch.logical_slot,
        evaluationNowMs: epoch.evaluation_now_ms,
        laneId: lane.laneId,
        attempt: epoch.attempt,
      },
      contentType: 'json' as const,
      ...(googleDelaySeconds > 0 ? { delaySeconds: googleDelaySeconds } : {}),
    };
  });
  if (useBrowserFallback) {
    requests.push({
      body: {
        type: 'ACQUIRE_LIVE_BROWSER_LANES',
        epochId: epoch.epoch_id,
        logicalSlot: epoch.logical_slot,
        evaluationNowMs: epoch.evaluation_now_ms,
        attempt: epoch.attempt,
      },
      contentType: 'json',
    });
  }
  await env.SHADOW_QUEUE.sendBatch(requests);
  return { status: 'LIVE_LANES_ENQUEUED', enqueuedLanes: lanes.length };
}

export async function acquireAndStageLiveBrowserLanes(
  env: LiveAcquisitionEnv,
  input: AcquireLiveBrowserLanesQueueMessage,
  deliveryAttempt = 1,
): Promise<{ laneCount: number; terminalLaneCount: number; durationMs: number }> {
  if (!env.SHADOW_BROWSER) throw new ShadowCustodyError('BROWSER_BINDING_MISSING', 'Browser binding is unavailable');
  const epoch = await readEpoch(env.SHADOW_DB, input.epochId);
  if (!epoch) throw new ShadowCustodyError('EPOCH_NOT_FOUND', `Unknown epoch ${input.epochId}`);
  if (
    epoch.acquisition_mode !== 'INDEPENDENT_LIVE' ||
    epoch.logical_slot !== input.logicalSlot ||
    epoch.evaluation_now_ms !== input.evaluationNowMs ||
    epoch.attempt !== (input.attempt ?? 1)
  ) {
    throw new ShadowCustodyError('EPOCH_RETRY_CONFLICT', 'Browser lane message changed epoch contract');
  }
  if (epoch.state !== 'STAGED') {
    return { laneCount: 0, terminalLaneCount: epoch.terminal_lane_count, durationMs: 0 };
  }

  const lanes = (await buildShadowLaneDefinitions()).filter(lane => isBrowserLane(lane.sourceGroup));
  const startedAtMs = Date.now();
  let browser: Awaited<ReturnType<typeof import('@cloudflare/playwright')['launch']>> | null = null;
  let terminalLaneCount = epoch.terminal_lane_count;
  let results: StoredLiveLaneResult[] = [];
  try {
    const { launch } = await import('@cloudflare/playwright');
    browser = await launch(env.SHADOW_BROWSER, {
      keep_alive: 10_000,
      guardrails: { allowedDomains: ['news.google.com'] },
    });
    const context = await browser.newContext({ locale: 'en-IN' });
    results = await Promise.all(lanes.map(async lane => {
      const page = await context.newPage();
      try {
        const result = await acquireLiveLane(lane, {
          nowMs: epoch.evaluation_now_ms,
          fetchImpl: async () => {
            try {
              const response = await page.goto(lane.feedUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 10_000,
              });
              if (!response) throw new Error('Browser navigation returned no response');
              const status = response.status();
              if (status < 200 || status >= 300) return new Response(null, { status });
              const extraction = await page.evaluate<BrowserFeedExtraction>(BROWSER_FEED_EXTRACTION_EXPRESSION);
              const body = buildBoundedBrowserFeedXml(extraction);
              const headers = response.headers();
              return new Response(body, {
                status,
                headers: {
                  'content-type': headers['content-type'] || 'application/xml',
                  'content-length': String(new TextEncoder().encode(body).byteLength),
                },
              });
            } catch (error) {
              if (error instanceof Error && error.name === 'TimeoutError') {
                throw new DOMException('Browser navigation timed out', 'AbortError');
              }
              throw error;
            }
          },
        });
        return { ...result, attemptCount: deliveryAttempt } as StoredLiveLaneResult;
      } finally {
        await page.close();
      }
    }));
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        console.warn('Browser Run session close returned an error');
      }
    }
    await recordBrowserUsage(env.SHADOW_DB, startedAtMs, Date.now());
  }
  for (const result of results) terminalLaneCount = await stageLiveLaneResult(env, epoch, result);
  if (terminalLaneCount === EXPECTED_SECTIONS_LANE_COUNT) {
    await env.SHADOW_QUEUE.send({
      type: 'FINALIZE_LIVE_EPOCH',
      epochId: epoch.epoch_id,
      logicalSlot: epoch.logical_slot,
      attempt: epoch.attempt,
    });
  }
  return { laneCount: results.length, terminalLaneCount, durationMs: Date.now() - startedAtMs };
}

export async function acquireAndStageLiveLane(
  env: LiveAcquisitionEnv,
  input: AcquireLiveLaneQueueMessage,
  fetchImpl: typeof fetch = fetch,
  deliveryAttempt = 1,
): Promise<StoredLiveLaneResult> {
  const epoch = await readEpoch(env.SHADOW_DB, input.epochId);
  if (!epoch) throw new ShadowCustodyError('EPOCH_NOT_FOUND', `Unknown epoch ${input.epochId}`);
  if (epoch.acquisition_mode !== 'INDEPENDENT_LIVE') {
    throw new ShadowCustodyError('ACQUISITION_MODE_MISMATCH', `${input.epochId} is not a live epoch`);
  }
  if (
    epoch.logical_slot !== input.logicalSlot ||
    epoch.evaluation_now_ms !== input.evaluationNowMs ||
    epoch.attempt !== (input.attempt ?? 1)
  ) {
    throw new ShadowCustodyError('EPOCH_RETRY_CONFLICT', `Live lane message changed epoch contract`);
  }
  const definitions = await buildShadowLaneDefinitions();
  const lane = definitions.find(candidate => candidate.laneId === input.laneId);
  if (!lane) throw new ShadowCustodyError('UNKNOWN_SOURCE_LANE', `Unknown source lane ${input.laneId}`);

  const acquired = {
    ...await acquireLiveLane(lane, {
      nowMs: epoch.evaluation_now_ms,
      fetchImpl,
    }),
    attemptCount: deliveryAttempt,
  } as StoredLiveLaneResult;
  if (
    deliveryAttempt <= 1 &&
    acquired.httpStatus !== null &&
    RETRYABLE_HTTP_STATUSES.has(acquired.httpStatus)
  ) {
    throw new ShadowCustodyError(
      'RETRYABLE_SOURCE_RESPONSE',
      `${lane.laneId} returned transient HTTP ${acquired.httpStatus}`,
    );
  }
  const terminalCount = await stageLiveLaneResult(env, epoch, acquired);
  if (terminalCount === EXPECTED_SECTIONS_LANE_COUNT) {
    await env.SHADOW_QUEUE.send({
      type: 'FINALIZE_LIVE_EPOCH',
      epochId: epoch.epoch_id,
      logicalSlot: epoch.logical_slot,
      attempt: epoch.attempt,
    });
  }
  return acquired;
}

export async function finalizeLiveEpoch(
  env: LiveAcquisitionEnv,
  input: FinalizeLiveEpochQueueMessage,
): Promise<Awaited<ReturnType<typeof commitEpoch>>> {
  const nowMs = Date.now();
  const epoch = await readEpoch(env.SHADOW_DB, input.epochId);
  if (!epoch) throw new ShadowCustodyError('EPOCH_NOT_FOUND', `Unknown epoch ${input.epochId}`);
  if (epoch.acquisition_mode !== 'INDEPENDENT_LIVE') {
    throw new ShadowCustodyError('ACQUISITION_MODE_MISMATCH', `${input.epochId} is not a live epoch`);
  }
  if (epoch.state === 'SHADOW_COMMITTED') {
    const current = await readCurrentShadow(env.SHADOW_DB);
    if (!current) throw new ShadowCustodyError('COMMITTED_POINTER_MISSING', 'No current shadow pointer exists');
    return { epoch, pointer: current.pointer };
  }
  if (epoch.state === 'SEALED') return commitEpoch(env, epoch.epoch_id, nowMs);
  if (epoch.state !== 'STAGED') {
    throw new ShadowCustodyError('EPOCH_NOT_SEALABLE', `Epoch ${epoch.epoch_id} is ${epoch.state}`);
  }

  let phase = 'read_lane_payloads';
  try {
    const laneResults = await readLiveLaneResults(env.SHADOW_DB, epoch.epoch_id);
    if (laneResults.length !== EXPECTED_SECTIONS_LANE_COUNT) {
      throw new ShadowCustodyError(
        'INCOMPLETE_LANE_CARDINALITY',
        `Epoch ${epoch.epoch_id} has ${laneResults.length}/${EXPECTED_SECTIONS_LANE_COUNT} live payloads`,
      );
    }
    const expectedLaneIds = new Set((await buildShadowLaneDefinitions()).map(lane => lane.laneId));
    if (laneResults.some(result => !expectedLaneIds.delete(result.lane.laneId)) || expectedLaneIds.size > 0) {
      throw new ShadowCustodyError('LIVE_LANE_SET_MISMATCH', 'Live epoch lane identities do not match the registry');
    }
  
    phase = 'build_decision_evidence';
    const evidence = buildSectionsLiveEvidence({
      laneResults,
      nowMs: epoch.evaluation_now_ms,
      sourceRegistryVersion: epoch.source_registry_version,
      sourceRegistryDigest: epoch.source_registry_digest,
    });
    phase = 'attach_input_digest';
    await attachLiveInputDigest(env, epoch.epoch_id, evidence.inputEvidenceDigest);
  
    phase = 'hash_candidate_evidence';
    const decisions: DecisionEvidenceRow[] = [];
    for (const candidate of evidence.decisionEvidence.candidateEvidence) {
      const evidenceJson = JSON.stringify(candidate);
      decisions.push({
        epochId: epoch.epoch_id,
        candidateIdentity: candidate.identity,
        authoritativeRank: candidate.authoritativeRank,
        selectedPosition: candidate.selectedPosition ?? undefined,
        displayedPosition: candidate.displayedPosition ?? undefined,
        evidenceDigest: await sha256Text(evidenceJson),
        evidenceJson,
      });
    }
    phase = 'stage_candidate_decisions';
    await stageDecisionEvidenceBatch(env, decisions);
  
    phase = 'compact_normalized_evidence';
    const objectText = JSON.stringify(compactSectionsLiveEvidence(evidence));
    const objectDigest = await sha256Text(objectText);
    const objectKey = `normalized/live/${epoch.epoch_id}/${objectDigest}.json`;
    phase = 'store_normalized_evidence';
    await putImmutableD1EvidenceObject(env, {
      objectKey,
      epochId: epoch.epoch_id,
      body: objectText,
      schemaVersion: evidence.schemaVersion,
      decisionOutputDigest: evidence.decisionOutputDigest,
      createdAtMs: nowMs,
      expiresAtMs: nowMs + 7 * DAY_MS,
    });
    phase = 'attach_decision_object';
    await attachDecisionObject(env, {
      epochId: epoch.epoch_id,
      objectKey,
      objectDigest,
      decisionOutputDigest: evidence.decisionOutputDigest,
      expectedDecisionCount: evidence.candidateCount,
    });
    phase = 'seal_epoch';
    await sealEpoch(env, epoch.epoch_id, nowMs);
    phase = 'commit_epoch';
    return commitEpoch(env, epoch.epoch_id, nowMs);
  } catch (error) {
    logUnexpectedFinalizationStage(phase, epoch.epoch_id, error);
    throw error;
  }
}
