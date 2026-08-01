import * as vscode from 'vscode';
import { execFile, spawn } from 'child_process';

export interface DonauAccount {
  name: string;
  submitName: string;
  runningJobsLimit: number;
  runningJobsCount: number;
  pendingJobsLimit: number;
  pendingJobsCount: number;
  sstoppedJobsCount: number;
}

export interface DonauQueue {
  name: string;
  submitName: string;
  status: string;
  runningJobsLimit: number;
  runningJobsCount: number;
  pendingJobsCount: number;
  sstoppedJobsCount: number;
  description?: string;
}

export interface DonauResourcesResult {
  success: boolean;
  source: 'real';
  accounts: DonauAccount[];
  queues: DonauQueue[];
  error?: string;
  cancelled?: boolean;
}

export function submitJob(payload: unknown): string {
  const jobId = `Job-${Math.floor(1000 + Math.random() * 9000)}`;
  console.log('[DonauService] submitJob received:', JSON.stringify(payload, null, 2));
  console.log(`[DonauService] mock job submitted, JobID = ${jobId}`);
  return jobId;
}

export function queryJobStatus(jobId: string): {
  jobId: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  progress: number;
} {
  const progress = Math.floor(Math.random() * 100);
  const status = progress >= 100 ? 'SUCCESS' : 'RUNNING';
  return { jobId, status, progress };
}

export async function getDonauResources(): Promise<DonauResourcesResult> {
  try {
    return await getRealResources();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, source: 'real', accounts: [], queues: [], error: message };
  }
}

async function getRealResources(): Promise<DonauResourcesResult> {
  let accountOutput = await runCommand('dacct', ['-W']);

  if (isInvalidToken(accountOutput)) {
    const password = await vscode.window.showInputBox({
      prompt: 'Please enter your Donau password to run dconfig',
      password: true,
      ignoreFocusOut: true,
    });

    if (!password) {
      return {
        success: false,
        source: 'real',
        accounts: [],
        queues: [],
        cancelled: true,
        error: 'Donau password input was cancelled.',
      };
    }

    const dconfigOutput = await runDconfig(password);
    if (!/get token successfully/i.test(dconfigOutput)) {
      const error = dconfigOutput.trim() || 'dconfig failed. Check ~/.user_cre permissions with: ls -l ~/.user_cre; chmod 600 ~/.user_cre';
      return { success: false, source: 'real', accounts: [], queues: [], error };
    }

    accountOutput = await runCommand('dacct', ['-W']);
  }

  const queueOutput = await runCommand('dqueue', []);
  return {
    success: true,
    source: 'real',
    accounts: parseAccounts(accountOutput),
    queues: parseQueues(queueOutput),
  };
}

function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 30_000 }, (error, stdout, stderr) => {
      const output = `${stdout ?? ''}${stderr ? `\n${stderr}` : ''}`;
      if (error) {
        if (isInvalidToken(output)) {
          resolve(output);
          return;
        }
        reject(new Error(output.trim() || error.message));
        return;
      }
      resolve(output);
    });
  });
}

function runDconfig(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('dconfig', [], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('error', (error) => {
      reject(error);
    });
    child.on('close', () => {
      resolve(output);
    });

    child.stdin.write(`${password}\n`);
    child.stdin.end();
  });
}

function isInvalidToken(output: string): boolean {
  return /invalid token/i.test(output) && /dconfig/i.test(output);
}

function parseAccounts(output: string): DonauAccount[] {
  const accounts = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^root(?:\.|\s|$)/.test(line))
    .map((line) => {
      const parts = line.split(/\s+/);
      const name = parts[0];
      return {
        name,
        submitName: simplifyDonauName(name),
        runningJobsLimit: parseNumber(parts[1], -1),
        runningJobsCount: parseNumber(parts[2], 0),
        pendingJobsLimit: parseNumber(parts[3], -1),
        pendingJobsCount: parseNumber(parts[4], 0),
        sstoppedJobsCount: parseNumber(parts[5], 0),
      };
    });

  return accounts;
}

function parseQueues(output: string): DonauQueue[] {
  const queues = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^root(?:\.|\s|$)/.test(line))
    .map((line) => {
      const parts = line.split(/\s+/);
      const name = parts[0];
      return {
        name,
        submitName: simplifyDonauName(name),
        status: parts[1] ?? '',
        runningJobsLimit: parseNumber(parts[2], -1),
        runningJobsCount: parseNumber(parts[3], 0),
        pendingJobsCount: parseNumber(parts[4], 0),
        sstoppedJobsCount: parseNumber(parts[5], 0),
        description: parts.slice(6).join(' '),
      };
    });

  return queues;
}

function simplifyDonauName(name: string): string {
  return name.startsWith('root.') ? name.slice('root.'.length) : name;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value || value === '-') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
