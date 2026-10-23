import { describe, expect, it, vi } from 'vitest';
import { ShadowCustodyError } from '../src/contracts';
import {
  logUnexpectedFinalizationStage,
  queueFailureFields,
} from '../src/queueDiagnostics';

describe('Cloudflare queue failure diagnostic privacy and accuracy', () => {
  it('identifies queue message and epoch for unexpected exceptions without exposing contents', () => {
    const fields = queueFailureFields({
      type: 'FINALIZE_LIVE_EPOCH',
      epochId: 'live-1792742400000',
      logicalSlot: 1792742400000,
    }, new TypeError('secret: bearer token https://provider.test/private'), 3);
    expect(fields).toEqual({
      code: 'UNEXPECTED_FAILURE',
      messageType: 'FINALIZE_LIVE_EPOCH',
      epochId: 'live-1792742400000',
      logicalSlot: 1792742400000,
      laneId: null,
      deliveryAttempt: 3,
      exceptionType: 'TypeError',
    });
    expect(JSON.stringify(fields)).not.toContain('provider.test');
    expect(JSON.stringify(fields)).not.toContain('bearer token');
  });

  it('retains known custody failure codes and the bounded acquire lane identity', () => {
    expect(queueFailureFields({
      type: 'ACQUIRE_LIVE_LANE',
      epochId: 'live-1792742400000',
      logicalSlot: 1792742400000,
      evaluationNowMs: 1792742400000,
      laneId: 'world:01:012345abcdef',
    }, new ShadowCustodyError('LANE_RETRY_CONFLICT', 'raw provider data'), 2))
      .toMatchObject({
        code: 'LANE_RETRY_CONFLICT',
        messageType: 'ACQUIRE_LIVE_LANE',
        laneId: 'world:01:012345abcdef',
        deliveryAttempt: 2,
        exceptionType: 'OTHER_ERROR',
      });
  });

  it('rejects untrusted identifiers, arbitrary error class names and raw payload data', () => {
    const bad = queueFailureFields({
      type: 'START_LIVE_EPOCH',
      epochId: 'secret\nAuthorization: Bearer token',
      logicalSlot: -1,
    }, Object.assign(new Error('private SQL credentials'), {
      name: 'token-of-a-user',
    }), 0);
    expect(bad).toMatchObject({
      epochId: 'UNRECOGNIZED',
      logicalSlot: null,
      laneId: null,
      deliveryAttempt: null,
      exceptionType: 'OTHER_ERROR',
    });
    expect(JSON.stringify(bad)).not.toContain('private SQL credentials');
    expect(JSON.stringify(bad)).not.toContain('Bearer');
    expect(JSON.stringify(bad)).not.toContain('token-of-a-user');
  });

  it('logs an allowlisted finalizer stage without changing exception or Queue retry behavior', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const failure = new RangeError('sensitive SQL and user feeds');
      logUnexpectedFinalizationStage('build_decision_evidence', 'live-1792742400000', failure);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(
        'Sections shadow finalization phase failed',
        expect.objectContaining({
          phase: 'build_decision_evidence',
          messageType: 'FINALIZE_LIVE_EPOCH',
          code: 'UNEXPECTED_FAILURE',
          exceptionType: 'RangeError',
          epochId: 'live-1792742400000',
        }),
      );
      expect(JSON.stringify(spy.mock.calls)).not.toContain('sensitive SQL');
      spy.mockClear();
      logUnexpectedFinalizationStage(
        'build_decision_evidence',
        'live-1792742400000',
        new ShadowCustodyError('EPOCH_NOT_SEALABLE', 'expected known error'),
      );
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
