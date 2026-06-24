import { parentPort } from 'worker_threads';
import {
  buildWorkbookDiffItems,
  copyWorkbookArtifactIfChanged,
  mergeWorkbookArtifact,
  type CommonSyncArtifact,
  type CommonSyncDiffItem,
} from './commonWorkbookSyncService';

type WorkbookWorkerRequest =
  | { id: number; action: 'buildDiffItems'; artifact: CommonSyncArtifact }
  | { id: number; action: 'copyWorkbookArtifactIfChanged'; artifact: CommonSyncArtifact }
  | {
      id: number;
      action: 'mergeWorkbookArtifact';
      artifact: CommonSyncArtifact;
      strategy: string;
      decisions: Array<{ id: string; choice: 'source' | 'target' | 'custom'; customValue?: string }>;
    };

type WorkbookWorkerResponse =
  | { id: number; ok: true; result: CommonSyncDiffItem[] | boolean }
  | { id: number; ok: false; error: string; stack?: string };

function toWorkerError(error: unknown): { error: string; stack?: string } {
  if (error instanceof Error) {
    return { error: error.message, stack: error.stack };
  }
  return { error: String(error) };
}

parentPort?.on('message', async (request: WorkbookWorkerRequest) => {
  try {
    let result: CommonSyncDiffItem[] | boolean;
    if (request.action === 'buildDiffItems') {
      result = buildWorkbookDiffItems(request.artifact);
    } else if (request.action === 'copyWorkbookArtifactIfChanged') {
      result = copyWorkbookArtifactIfChanged(request.artifact);
    } else {
      result = await mergeWorkbookArtifact(request.artifact, request.strategy, request.decisions);
    }

    parentPort?.postMessage({ id: request.id, ok: true, result } satisfies WorkbookWorkerResponse);
  } catch (error) {
    parentPort?.postMessage({ id: request.id, ok: false, ...toWorkerError(error) } satisfies WorkbookWorkerResponse);
  }
});
