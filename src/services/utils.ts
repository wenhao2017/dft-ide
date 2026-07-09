import * as vscode from 'vscode';
import { exec, execFile } from 'child_process';

export async function executeFileCommand(command: string, args: string[], workDir?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = workDir ? { cwd: workDir } : {};
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      if (stderr && stderr.toLowerCase().includes('error')) {
        reject(new Error(stderr));
        return;
      }
      resolve(stdout);
    });
  });
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
    const parsed = JSON.parse(Buffer.from(bytes).toString('utf-8'));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const getFileNameAndExtension = (filePath: string) => {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const fileName = normalizedPath.split('/').pop();
  if (!fileName) {
    return { name: '', extension: '' };
  }

  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return { name: fileName, extension: '' };
  }

  return {
    name: fileName.substring(0, lastDotIndex),
    extension: fileName.substring(lastDotIndex + 1),
  };
};

export const getDirectory = (filePath: string) => {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const lastSlashIndex = normalizedPath.lastIndexOf('/');
  if (lastSlashIndex === -1) return '';
  return filePath.substring(0, lastSlashIndex);
};
