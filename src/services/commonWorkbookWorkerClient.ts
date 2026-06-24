import * as fs from 'fs';
import * as path from 'path';
import { Worker } from 'worker_threads';
import type {
  CommonSyncArtifact,
  CommonSyncDiffItem,
} from './commonWorkbookSyncService';

type WorkbookWorkerRequest =
  | { action: 'buildDiffItems'; artifact: CommonSyncArtifact }
  | { action: 'copyWorkbookArtifactIfChanged'; artifact: CommonSyncArtifact }
  | {
      action: 'mergeWorkbookArtifact';
      artifact: CommonSyncArtifact;
      strategy: string;
      decisions: Array<{ id: string; choice: 'source' | 'target' | 'custom'; customValue?: string }>;
    };

type WorkbookWorkerResponse<T> =
  | { id: number; ok: true; result: T }
  | { id: number; ok: false; error: string; stack?: string };

let nextRequestId = 0;

export function buildWorkbookDiffItemsInWorker(artifact: CommonSyncArtifact): Promise<CommonSyncDiffItem[]> {
  return runWorkbookWorker<CommonSyncDiffItem[]>({ action: 'buildDiffItems', artifact });
}

export function copyWorkbookArtifactIfChangedInWorker(artifact: CommonSyncArtifact): Promise<boolean> {
  return runWorkbookWorker<boolean>({ action: 'copyWorkbookArtifactIfChanged', artifact });
}

export function mergeWorkbookArtifactInWorker(
  artifact: CommonSyncArtifact,
  strategy: string,
  decisions: Array<{ id: string; choice: 'source' | 'target' | 'custom'; customValue?: string }>
): Promise<boolean> {
  return runWorkbookWorker<boolean>({ action: 'mergeWorkbookArtifact', artifact, strategy, decisions });
}

function runWorkbookWorker<T>(request: WorkbookWorkerRequest): Promise<T> {
  const id = nextRequestId += 1;
  const workerPath = getWorkbookWorkerPath();
  if (!fs.existsSync(workerPath)) {
    return Promise.reject(new Error(`Workbook worker bundle is missing: ${workerPath}`));
  }

  const worker = new Worker(workerPath);
  let settled = false;

  return new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      worker.removeAllListeners();
      void worker.terminate();
    };

    worker.once('message', (response: WorkbookWorkerResponse<T>) => {
      if (response.id !== id) {
        return;
      }

      settled = true;
      cleanup();
      if (response.ok) {
        resolve(response.result);
        return;
      }

      const error = new Error(response.error);
      if (response.stack) {
        error.stack = response.stack;
      }
      reject(error);
    });

    worker.once('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    });

    worker.once('exit', (code) => {
      if (settled || code === 0) {
        return;
      }
      settled = true;
      cleanup();
      reject(new Error(`Workbook worker exited with code ${code}.`));
    });

    worker.postMessage({ id, ...request });
  });
}

function getWorkbookWorkerPath(): string {
  return path.join(__dirname, 'commonWorkbookWorker.js');
}
