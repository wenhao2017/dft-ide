import { describe, expect, it } from 'vitest';
import { classifyFriendlyRepoState } from '../src/services/syncService';

const connected = {
  upstream: 'origin/main',
  remoteChecked: true,
};

describe('classifyFriendlyRepoState', () => {
  it('uses plain synchronized and checking states', () => {
    expect(classifyFriendlyRepoState(connected).state).toBe('synced');
    expect(classifyFriendlyRepoState({ upstream: 'origin/main', remoteChecked: false }).state).toBe('checking');
    expect(classifyFriendlyRepoState({ remoteChecked: true }).state).toBe('noRemote');
  });

  it('distinguishes cloud, working-copy, and uploaded-history changes', () => {
    expect(classifyFriendlyRepoState({ ...connected, behind: 2 }).state).toBe('cloudUpdates');
    expect(classifyFriendlyRepoState({ ...connected, hasChanges: true }).state).toBe('localChanges');
    expect(classifyFriendlyRepoState({ ...connected, ahead: 3 }).state).toBe('localCommits');
  });

  it('routes changes on both sides into guided handling', () => {
    expect(classifyFriendlyRepoState({ ...connected, ahead: 1, behind: 1 }).state).toBe('bothChanged');
    expect(classifyFriendlyRepoState({ ...connected, hasChanges: true, behind: 1 }).state).toBe('bothChanged');
  });

  it('gives conflicts and unfinished operations priority over normal states', () => {
    expect(classifyFriendlyRepoState({ ...connected, conflictCount: 2, operationInProgress: true }).state).toBe('conflict');
    expect(classifyFriendlyRepoState({ ...connected, operationInProgress: true, behind: 2 }).state).toBe('operationInProgress');
  });
});
