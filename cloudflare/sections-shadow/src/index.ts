import {
  SHADOW_MODE,
  ShadowCustodyError,
  type ShadowQueueMessage,
} from './contracts';
import { readCurrentShadow, type CustodyEnv } from './custody';
import { timingSafeEqual } from './crypto';
import { runBundledFrozenReplay } from './frozenReplay';
import {
  acquireAndStageLiveBrowserLanes,
  acquireAndStageLiveLane,
  finalizeLiveEpoch,
  startLiveEpoch,
} from './liveAcquisition';
import { readQuotaDay } from './quota';
import { sectionsRegistryAuthority } from './registry';
import { readCommittedPreviewSnapshot } from './previewSnapshot';

const HOUR_MS = 60 * 60 * 1_000;

export interface Env extends CustodyEnv {
  SHADOW_QUEUE: Queue<ShadowQueueMessage>;
  SHADOW_MODE?: string;
  SHADOW_SCHEDULE_ENABLED?: string;
  SHADOW_FROZEN_REPLAY_TRIGGER_ENABLED?: string;
  SHADOW_LIVE_ACQUISITION_ENABLED?: string;
  SHADOW_BROWSER_FALLBACK_ENABLED?: string;
  SHADOW_BROWSER?: Pick<Cloudflare.Env['SHADOW_BROWSER'], 'fetch'>;
  SHADOW_READ_TOKEN?: string;
  SHADOW_PREVIEW_READ_ENABLED?: string;
}

type DeployedEnv = Cloudflare.Env & { SHADOW_READ_TOKEN?: string };

const PREVIEW_PATH = '/preview/sections/latest';
const PREVIEW_CORS_HEADERS = {
  'Access-Control-Allow-Headers': 'Cache-Control, Pragma',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'X-NW-Data-Source, X-NW-Epoch-Id',
} as const;

function json(payload: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

async function authorized(request: Request, env: Env): Promise<boolean> {
  if (!env.SHADOW_READ_TOKEN) return false;
  const header = request.headers.get('Authorization') ?? '';
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
  return timingSafeEqual(supplied, env.SHADOW_READ_TOKEN);
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === PREVIEW_PATH && request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: PREVIEW_CORS_HEADERS });
  }
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  if (url.pathname === '/health') {
    return json({
      status: 'ok',
      mode: env.SHADOW_MODE ?? SHADOW_MODE,
      servingAuthority: 'github_static',
      cloudflareBrowserServingAuthority: false,
      previewReadEnabled: env.SHADOW_PREVIEW_READ_ENABLED === 'true',
      shadowScheduleEnabled: env.SHADOW_SCHEDULE_ENABLED === 'true',
      liveAcquisitionEnabled: env.SHADOW_LIVE_ACQUISITION_ENABLED === 'true',
      browserFallbackEnabled: env.SHADOW_BROWSER_FALLBACK_ENABLED === 'true',
      evidenceStore: 'd1',
      sourceRegistryVersion: sectionsRegistryAuthority.sourceRegistryVersion,
      sourceLaneCount: sectionsRegistryAuthority.laneCount,
      writeSurface: 'queue_only',
    });
  }
  if (url.pathname === PREVIEW_PATH) {
    if (env.SHADOW_PREVIEW_READ_ENABLED !== 'true') {
      return json({ error: 'preview_read_disabled' }, 503, PREVIEW_CORS_HEADERS);
    }
    try {
      const snapshot = await readCommittedPreviewSnapshot(env);
      const preview = snapshot.preview as { epochId?: string } | undefined;
      return json(snapshot, 200, {
        ...PREVIEW_CORS_HEADERS,
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=300',
        'X-NW-Data-Source': 'cloudflare-preview',
        'X-NW-Epoch-Id': preview?.epochId || '',
      });
    } catch (error) {
      console.warn('Cloudflare Sections Preview read unavailable', {
        code: error instanceof ShadowCustodyError ? error.code : 'UNEXPECTED_FAILURE',
      });
      return json({ error: 'preview_snapshot_unavailable' }, 503, PREVIEW_CORS_HEADERS);
    }
  }
  if (url.pathname === '/internal/shadow/status') {
    if (!env.SHADOW_READ_TOKEN) return json({ error: 'shadow_read_not_configured' }, 503);
    if (!(await authorized(request, env))) return json({ error: 'unauthorized' }, 401);
    const nowMs = Date.now();
    const [current, quota] = await Promise.all([
      readCurrentShadow(env.SHADOW_DB),
      readQuotaDay(env, nowMs),
    ]);
    return json({
      mode: env.SHADOW_MODE ?? SHADOW_MODE,
      servingAuthority: 'github_static',
      cloudflareBrowserServingAuthority: false,
      current,
      quota,
    });
  }
  return json({ error: 'not_found' }, 404);
}

async function findLatestRecoverableLiveEpoch(
  env: Env,
  beforeLogicalSlot: number,
): Promise<{ epochId: string; logicalSlot: number; attempt: number } | null> {
  const row = await env.SHADOW_DB.prepare(`
    SELECT epoch_id, logical_slot, attempt
    FROM sections_shadow_epochs
    WHERE state = 'STAGED'
      AND acquisition_mode = 'INDEPENDENT_LIVE'
      AND terminal_lane_count = expected_lane_count
      AND logical_slot < ?
    ORDER BY logical_slot DESC
    LIMIT 1
  `).bind(beforeLogicalSlot).first<{
    epoch_id: string;
    logical_slot: number;
    attempt: number;
  }>();
  if (!row) return null;
  return {
    epochId: row.epoch_id,
    logicalSlot: Number(row.logical_slot),
    attempt: Number(row.attempt),
  };
}

export function scheduledStatus(env: Env): {
  status: 'SHADOW_SCHEDULE_DISABLED' | 'LIVE_ACQUISITION_DISABLED' | 'LIVE_ACQUISITION_READY';
  enqueued: false;
} {
  if (env.SHADOW_SCHEDULE_ENABLED !== 'true') {
    return { status: 'SHADOW_SCHEDULE_DISABLED', enqueued: false };
  }
  if (env.SHADOW_LIVE_ACQUISITION_ENABLED !== 'true') {
    return { status: 'LIVE_ACQUISITION_DISABLED', enqueued: false };
  }
  return { status: 'LIVE_ACQUISITION_READY', enqueued: false };
}

export async function runScheduledDispatch(
  controller: ScheduledController,
  env: Env,
): Promise<{
  status: 'SHADOW_SCHEDULE_DISABLED' | 'FROZEN_REPLAY_ENQUEUED' |
    'LIVE_ACQUISITION_DISABLED' | 'LIVE_EPOCH_ENQUEUED';
  enqueued: boolean;
}> {
  if (env.SHADOW_SCHEDULE_ENABLED !== 'true') {
    return { status: 'SHADOW_SCHEDULE_DISABLED', enqueued: false };
  }
  if (env.SHADOW_FROZEN_REPLAY_TRIGGER_ENABLED === 'true') {
    await env.SHADOW_QUEUE.send({
      type: 'RUN_FROZEN_REPLAY',
      epochId: `frozen-${controller.scheduledTime}`,
      logicalSlot: controller.scheduledTime,
      attempt: 1,
    });
    return { status: 'FROZEN_REPLAY_ENQUEUED', enqueued: true };
  }
  if (env.SHADOW_LIVE_ACQUISITION_ENABLED !== 'true') {
    return { status: 'LIVE_ACQUISITION_DISABLED', enqueued: false };
  }
  const logicalSlot = Math.floor(controller.scheduledTime / HOUR_MS) * HOUR_MS;
  const recoverable = await findLatestRecoverableLiveEpoch(env, logicalSlot);
  if (recoverable) {
    await env.SHADOW_QUEUE.send({
      type: 'FINALIZE_LIVE_EPOCH',
      epochId: recoverable.epochId,
      logicalSlot: recoverable.logicalSlot,
      attempt: recoverable.attempt,
    });
  }
  await env.SHADOW_QUEUE.send({
    type: 'START_LIVE_EPOCH',
    epochId: `live-${logicalSlot}`,
    logicalSlot,
    attempt: 1,
  });
  return { status: 'LIVE_EPOCH_ENQUEUED', enqueued: true };
}

async function consumeMessage(message: Message<ShadowQueueMessage>, env: Env): Promise<void> {
  const body = message.body;
  if (
    !body ||
    !body.epochId ||
    !Number.isInteger(body.logicalSlot) ||
    body.logicalSlot < 0
  ) {
    console.error('Rejected invalid Sections shadow control message');
    message.ack();
    return;
  }
  try {
    switch (body.type) {
      case 'RUN_FROZEN_REPLAY':
        await runBundledFrozenReplay(env, body);
        break;
      case 'START_LIVE_EPOCH':
        await startLiveEpoch(env, body);
        break;
      case 'ACQUIRE_LIVE_LANE':
        if (!body.laneId || !Number.isInteger(body.evaluationNowMs) || body.evaluationNowMs < 0) {
          console.error('Rejected invalid live lane message');
          message.ack();
          return;
        }
        await acquireAndStageLiveLane(env, body, fetch, message.attempts);
        break;
      case 'ACQUIRE_LIVE_BROWSER_LANES':
        if (!Number.isInteger(body.evaluationNowMs) || body.evaluationNowMs < 0) {
          console.error('Rejected invalid browser lane message');
          message.ack();
          return;
        }
        await acquireAndStageLiveBrowserLanes(env, body, message.attempts);
        break;
      case 'FINALIZE_LIVE_EPOCH':
        await finalizeLiveEpoch(env, body);
        break;
      default:
        console.error('Rejected unknown Sections shadow message type');
        message.ack();
        return;
    }
    message.ack();
  } catch (error) {
    if (error instanceof ShadowCustodyError && error.code === 'RETRYABLE_SOURCE_RESPONSE') {
      console.warn('Sections shadow source response will receive one bounded retry', { code: error.code });
      message.retry({ delaySeconds: 20 });
      return;
    }
    if (error instanceof ShadowCustodyError && error.code.startsWith('FREE_TIER_')) {
      console.warn('Sections shadow epoch paused', { code: error.code });
      message.ack();
      return;
    }
    console.error('Sections shadow replay failed', {
      code: error instanceof ShadowCustodyError ? error.code : 'UNEXPECTED_FAILURE',
    });
    message.retry({ delaySeconds: 60 });
  }
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
  async scheduled(controller, env) {
    const status = await runScheduledDispatch(controller, env);
    console.log('Sections shadow scheduled event', status);
  },
  async queue(batch, env) {
    for (const message of batch.messages) await consumeMessage(message, env);
  },
} satisfies ExportedHandler<DeployedEnv, ShadowQueueMessage>;
