import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { EXPECTED_SECTIONS_LANE_COUNT, type ShadowQueueMessage } from '../src/contracts';
import { abortEpoch, readEpoch, startEpoch } from '../src/custody';
import worker, { runScheduledDispatch, type Env } from '../src/index';
import {
  acquireAndStageLiveBrowserLanes,
  acquireAndStageLiveLane,
  finalizeLiveEpoch,
  startLiveEpoch,
  type LiveAcquisitionEnv,
} from '../src/liveAcquisition';
import { stageLiveLaneResult } from '../src/liveStore';
import { buildShadowLaneDefinitions, sectionsRegistryAuthority } from '../src/registry';

const SLOT = 1_800_000_000_000;
const HOUR_MS = 3_600_000;

function target() {
  const sent: ShadowQueueMessage[] = [];
  const queue = {
    send: async (body: ShadowQueueMessage) => { sent.push(body); },
    sendBatch: async (batch: MessageSendRequest<ShadowQueueMessage>[]) => {
      sent.push(...batch.map(message => message.body));
    },
  } as unknown as Queue<ShadowQueueMessage>;
  const live: LiveAcquisitionEnv = { SHADOW_DB: env.SHADOW_DB, SHADOW_QUEUE: queue };
  return { live, sent };
}

async function stage(
  live: LiveAcquisitionEnv,
  version = sectionsRegistryAuthority.sourceRegistryVersion,
  digest = sectionsRegistryAuthority.sourceRegistryDigest,
  slot = SLOT,
) {
  return startEpoch(live, {
    epochId: `live-${slot}`,
    logicalSlot: slot,
    scheduledAtMs: slot,
    evaluationNowMs: slot,
    attempt: 1,
    acquisitionMode: 'INDEPENDENT_LIVE',
    expectedLaneCount: EXPECTED_SECTIONS_LANE_COUNT,
    sourceRegistryVersion: version,
    sourceRegistryDigest: digest,
    nowMs: slot,
  });
}

describe('Live registry rollout boundary', () => {
  it.each(['version', 'digest'] as const)('rejects an old %s before a lane network request or write', async kind => {
    const { live, sent } = target();
    const epoch = await stage(live,
      kind === 'version' ? 'section-source-policy-v1' : undefined,
      kind === 'digest' ? 'a'.repeat(64) : undefined);
    const [lane] = await buildShadowLaneDefinitions();
    let fetches = 0;
    await expect(acquireAndStageLiveLane(live, {
      type: 'ACQUIRE_LIVE_LANE', epochId: epoch.epoch_id, logicalSlot: SLOT,
      evaluationNowMs: SLOT, laneId: lane.laneId, attempt: 1,
    }, async () => { fetches++; return new Response('<rss><channel/></rss>'); }))
      .rejects.toMatchObject({ code: 'EPOCH_REGISTRY_MISMATCH' });
    expect(fetches).toBe(0);
    expect((await readEpoch(live.SHADOW_DB, epoch.epoch_id))?.terminal_lane_count).toBe(0);
    expect(sent).toEqual([]);
  });

  it('checks the registry before opening a browser session', async () => {
    const { live } = target();
    const epoch = await stage(live, 'section-source-policy-v1');
    let browserRequests = 0;
    await expect(acquireAndStageLiveBrowserLanes({
      ...live, SHADOW_BROWSER: { fetch: async () => { browserRequests++; throw new Error('Browser must not be opened'); } },
    }, {
      type: 'ACQUIRE_LIVE_BROWSER_LANES', epochId: epoch.epoch_id, logicalSlot: SLOT,
      evaluationNowMs: SLOT, attempt: 1,
    })).rejects.toMatchObject({ code: 'EPOCH_REGISTRY_MISMATCH' });
    expect(browserRequests).toBe(0);
  });

  it('does not reinterpret an old staged epoch in finalization', async () => {
    const { live } = target();
    const epoch = await stage(live, 'section-source-policy-v1');
    await expect(finalizeLiveEpoch(live, {
      type: 'FINALIZE_LIVE_EPOCH', epochId: epoch.epoch_id, logicalSlot: SLOT, attempt: 1,
    })).rejects.toMatchObject({ code: 'EPOCH_REGISTRY_MISMATCH' });
    expect((await readEpoch(live.SHADOW_DB, epoch.epoch_id))?.state).toBe('STAGED');
  });

  it.each(['slot', 'attempt'] as const)('rejects a changed finalizer %s before touching epoch evidence', async kind => {
    const { live } = target();
    const epoch = await stage(live);
    await expect(finalizeLiveEpoch(live, {
      type: 'FINALIZE_LIVE_EPOCH', epochId: epoch.epoch_id,
      logicalSlot: SLOT + (kind === 'slot' ? HOUR_MS : 0), attempt: kind === 'attempt' ? 2 : 1,
    })).rejects.toMatchObject({ code: 'EPOCH_RETRY_CONFLICT' });
  });

  it('does not restart an old registry epoch or enqueue its lanes', async () => {
    const { live, sent } = target();
    const epoch = await stage(live, 'section-source-policy-v1');
    await expect(startLiveEpoch(live, {
      type: 'START_LIVE_EPOCH', epochId: epoch.epoch_id, logicalSlot: SLOT, attempt: 1,
    })).rejects.toMatchObject({ code: 'EPOCH_REGISTRY_MISMATCH' });
    expect(sent).toEqual([]);
    expect((await readEpoch(live.SHADOW_DB, epoch.epoch_id))?.state).toBe('STAGED');
  });

  it('rejects acquisition of an aborted epoch before fetching a source', async () => {
    const { live } = target();
    const epoch = await stage(live);
    await abortEpoch(live, epoch.epoch_id, 'TEST_ABORT', 'No acquisition permitted', SLOT);
    const [lane] = await buildShadowLaneDefinitions();
    let fetches = 0;
    await expect(acquireAndStageLiveLane(live, {
      type: 'ACQUIRE_LIVE_LANE', epochId: epoch.epoch_id, logicalSlot: SLOT,
      evaluationNowMs: SLOT, laneId: lane.laneId, attempt: 1,
    }, async () => { fetches++; return new Response('<rss><channel/></rss>'); }))
      .rejects.toMatchObject({ code: 'EPOCH_NOT_ACQUIRABLE' });
    expect(fetches).toBe(0);
  });

  it('does not recover a fully staged epoch using an older registry', async () => {
    const { live, sent } = target();
    const epoch = await stage(live, 'section-source-policy-v1', undefined, SLOT - HOUR_MS);
    for (const lane of await buildShadowLaneDefinitions()) {
      await stageLiveLaneResult(live, epoch, {
        lane, disposition: 'EMPTY', items: [], httpStatus: 200, durationMs: 1,
        errorCode: null, diagnostics: {}, observedAtMs: epoch.logical_slot, attemptCount: 1,
      });
    }
    await runScheduledDispatch({ scheduledTime: SLOT } as ScheduledController, {
      ...live, SHADOW_SCHEDULE_ENABLED: 'true', SHADOW_LIVE_ACQUISITION_ENABLED: 'true',
    } as Env);
    expect(sent.map(body => body.type)).toEqual(['START_LIVE_EPOCH']);
  });

  it('acknowledges a mismatched delayed lane without spending retries', async () => {
    const { live } = target();
    const slot = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
    const epoch = await stage(live, 'section-source-policy-v1', undefined, slot);
    let acked = 0;
    let retried = 0;
    const body = {
      type: 'ACQUIRE_LIVE_LANE', epochId: epoch.epoch_id, logicalSlot: slot,
      evaluationNowMs: slot, laneId: 'unknown-old-lane', attempt: 1,
    };
    const batch = { messages: [{ body, attempts: 1, ack: () => { acked++; }, retry: () => { retried++; } }] };
    await worker.queue(batch as unknown as MessageBatch<ShadowQueueMessage>, live as Cloudflare.Env);
    expect({ acked, retried }).toEqual({ acked: 1, retried: 0 });
    expect((await readEpoch(live.SHADOW_DB, epoch.epoch_id))?.terminal_lane_count).toBe(0);
  });

  it('keeps ordinary same-registry start fan-out unchanged', async () => {
    const { live, sent } = target();
    await startLiveEpoch(live, { type: 'START_LIVE_EPOCH', epochId: `live-${SLOT}`, logicalSlot: SLOT });
    expect(sent).toHaveLength(EXPECTED_SECTIONS_LANE_COUNT);
    expect((await readEpoch(live.SHADOW_DB, `live-${SLOT}`))?.source_registry_digest)
      .toBe(sectionsRegistryAuthority.sourceRegistryDigest);
  });
});
