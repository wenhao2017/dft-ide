import * as vscode from 'vscode';
import { OBS_READONLY_SCHEME } from './constants';

export const obsReadonlyDocuments = new Map<string, string>();

export async function openObsReadonlyDocument(
  context: vscode.ExtensionContext,
  obsPath: string
): Promise<void> {
  if (!obsPath.startsWith('obs://')) {
    throw new Error('Invalid OBS path.');
  }

  const fileName = decodeURIComponent(obsPath.split('/').pop() || 'obs-object.txt');
  const safeFileName = fileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') || 'obs-object.txt';
  const cacheDir = vscode.Uri.joinPath(context.globalStorageUri, 'obs-cache');
  await vscode.workspace.fs.createDirectory(cacheDir);

  const cacheUri = vscode.Uri.joinPath(cacheDir, safeFileName);
  const content = [
    `OBS readonly preview`,
    ``,
    `Source: ${obsPath}`,
    `Cached: ${cacheUri.fsPath}`,
    `Mode: read-only`,
    ``,
    `This mock represents an OBS object that was downloaded to a local cache before opening.`,
    `Direct edits are disabled for OBS files in the current workflow.`,
    ``,
  ].join('\n');
  await vscode.workspace.fs.writeFile(cacheUri, Buffer.from(content, 'utf-8'));

  const readonlyUri = vscode.Uri.from({
    scheme: OBS_READONLY_SCHEME,
    path: `/${safeFileName}`,
    query: `source=${encodeURIComponent(obsPath)}&cache=${encodeURIComponent(cacheUri.fsPath)}`,
  });
  obsReadonlyDocuments.set(readonlyUri.toString(), content);

  const document = await vscode.workspace.openTextDocument(readonlyUri);
  await vscode.window.showTextDocument(document, {
    viewColumn: vscode.ViewColumn.Active,
    preview: false,
  });
}

export async function cleanupObsReadonlyDocument(uri: vscode.Uri): Promise<void> {
  obsReadonlyDocuments.delete(uri.toString());

  const cachePath = new URLSearchParams(uri.query).get('cache');
  if (!cachePath) {
    return;
  }

  try {
    await vscode.workspace.fs.delete(vscode.Uri.file(cachePath));
  } catch {
    // Cache cleanup is best-effort; the file may have already been removed.
  }
}
