import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockAdapter } from '../../src/platform/mock';
import { Platform } from '../../src/platform/platform';

describe('platform gameplay state machine', () => {
  afterEach(() => vi.useRealTimers());

  it('is idempotent and never sends SDK toggles closer than 1 s', () => {
    vi.useFakeTimers();
    const a = new MockAdapter();
    const calls: string[] = [];
    a.gameplayStart = () => void calls.push('start');
    a.gameplayStop = () => void calls.push('stop');
    const p = new Platform(a);
    p.gameplayStart();
    p.gameplayStart();
    expect(calls).toEqual(['start']);
    // popup closes and the next opens immediately: stop → start → stop within one second
    p.gameplayStop();
    p.gameplayStart();
    p.gameplayStop();
    expect(calls).toEqual(['start']);
    vi.advanceTimersByTime(1200);
    expect(calls).toEqual(['start', 'stop']);
    // quick stop/start pair cancels out
    vi.advanceTimersByTime(2000);
    p.gameplayStart();
    p.gameplayStop();
    vi.advanceTimersByTime(2000);
    expect(calls).toEqual(['start', 'stop', 'start', 'stop']);
  });
});
