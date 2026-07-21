import { describe, expect, it } from 'vitest';
import { mergeLatestSnapshot } from '../src/webview/store/pipelineRuntimeMerge';

describe('mergeLatestSnapshot', () => {
  it('keeps a newer live runtime when an older bootstrap snapshot arrives later', () => {
    const live = { updatedAt: 200, state: 'running' };
    const snapshots = { 'verification:mode-a': live };

    const result = mergeLatestSnapshot(
      snapshots,
      'verification:mode-a',
      { updatedAt: 100, state: 'idle' },
    );

    expect(result).toBe(snapshots);
    expect(result['verification:mode-a']).toBe(live);
  });

  it('accepts an equally new or newer runtime update', () => {
    const snapshots = {
      'hibist:module-a': { updatedAt: 100, state: 'running' },
    };
    const completed = { updatedAt: 101, state: 'completed' };

    const result = mergeLatestSnapshot(snapshots, 'hibist:module-a', completed);

    expect(result).not.toBe(snapshots);
    expect(result['hibist:module-a']).toBe(completed);
  });
});
