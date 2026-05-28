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
  source: 'mock' | 'real';
  accounts: DonauAccount[];
  queues: DonauQueue[];
  fallbackReason?: string;
  error?: string;
  cancelled?: boolean;
}

const mockAccounts: DonauAccount[] = [
  { name: 'root', submitName: 'root', runningJobsLimit: -1, runningJobsCount: 82590, pendingJobsLimit: -1, pendingJobsCount: 22627, sstoppedJobsCount: 0 },
  { name: 'root.ug_5031', submitName: 'ug_5031', runningJobsLimit: -1, runningJobsCount: 1379, pendingJobsLimit: -1, pendingJobsCount: 299, sstoppedJobsCount: 0 },
  { name: 'root.ug_5031.HIS-PandasV200-COTS', submitName: 'ug_5031.HIS-PandasV200-COTS', runningJobsLimit: -1, runningJobsCount: 35, pendingJobsLimit: -1, pendingJobsCount: 181, sstoppedJobsCount: 0 },
  { name: 'root.ug_5031.flowxSClass', submitName: 'ug_5031.flowxSClass', runningJobsLimit: -1, runningJobsCount: 7, pendingJobsLimit: -1, pendingJobsCount: 1, sstoppedJobsCount: 0 },
  { name: 'root.ug_cot', submitName: 'ug_cot', runningJobsLimit: -1, runningJobsCount: 286, pendingJobsLimit: -1, pendingJobsCount: 1, sstoppedJobsCount: 0 },
  { name: 'root.ug_cot.HIS-ASIC-DFT-staff-WS', submitName: 'ug_cot.HIS-ASIC-DFT-staff-WS', runningJobsLimit: -1, runningJobsCount: 5, pendingJobsLimit: -1, pendingJobsCount: 1, sstoppedJobsCount: 0 },
  { name: 'root.ug_dft', submitName: 'ug_dft', runningJobsLimit: -1, runningJobsCount: 3584, pendingJobsLimit: -1, pendingJobsCount: 558, sstoppedJobsCount: 0 },
  { name: 'root.ug_dft.HIS-HIS-ASIC-HISC-DFT-PLAT-WS', submitName: 'ug_dft.HIS-HIS-ASIC-HISC-DFT-PLAT-WS', runningJobsLimit: -1, runningJobsCount: 279, pendingJobsLimit: -1, pendingJobsCount: 10, sstoppedJobsCount: 0 },
  { name: 'root.ug_dft.PLAT_SClass', submitName: 'ug_dft.PLAT_SClass', runningJobsLimit: -1, runningJobsCount: 5, pendingJobsLimit: -1, pendingJobsCount: 0, sstoppedJobsCount: 0 },
];

const mockQueues: DonauQueue[] = [
  { name: 'root.short', submitName: 'short', status: 'OPEN,ACTIVE', runningJobsLimit: 60000, runningJobsCount: 13482, pendingJobsCount: 23366, sstoppedJobsCount: 0, description: 'short queue, suitable for short jobs' },
  { name: 'root.normal', submitName: 'normal', status: 'OPEN,ACTIVE', runningJobsLimit: 80000, runningJobsCount: 57049, pendingJobsCount: 11281, sstoppedJobsCount: 0, description: 'normal queue, suitable for common jobs' },
  { name: 'root.middle', submitName: 'middle', status: 'OPEN,ACTIVE', runningJobsLimit: 90000, runningJobsCount: 4191, pendingJobsCount: 9812, sstoppedJobsCount: 0, description: 'middle queue, suitable for longer jobs' },
  { name: 'root.long', submitName: 'long', status: 'OPEN,ACTIVE', runningJobsLimit: 90000, runningJobsCount: 2841, pendingJobsCount: 1242, sstoppedJobsCount: 0, description: 'long queue, suitable for very long jobs' },
  { name: 'root.bigmem', submitName: 'bigmem', status: 'OPEN,ACTIVE', runningJobsLimit: 90000, runningJobsCount: 3880, pendingJobsCount: 802, sstoppedJobsCount: 0, description: 'big memory queue' },
  { name: 'root.hugemem', submitName: 'hugemem', status: 'OPEN,ACTIVE', runningJobsLimit: 90000, runningJobsCount: 605, pendingJobsCount: 72, sstoppedJobsCount: 0, description: 'huge memory queue' },
  { name: 'root.debug', submitName: 'debug', status: 'OPEN,ACTIVE', runningJobsLimit: 90000, runningJobsCount: 23, pendingJobsCount: 0, sstoppedJobsCount: 0, description: 'debug queue' },
  { name: 'root.formal', submitName: 'formal', status: 'OPEN,ACTIVE', runningJobsLimit: 90000, runningJobsCount: 73, pendingJobsCount: 0, sstoppedJobsCount: 0, description: 'formal queue' },
  { name: 'root.gpu', submitName: 'gpu', status: 'OPEN,ACTIVE', runningJobsLimit: 90000, runningJobsCount: 0, pendingJobsCount: 0, sstoppedJobsCount: 0, description: 'gpu queue' },
  { name: 'root.nile', submitName: 'nile', status: 'OPEN,ACTIVE', runningJobsLimit: 90000, runningJobsCount: 0, pendingJobsCount: 0, sstoppedJobsCount: 0, description: 'nile queue' },
  { name: 'root.normal_send', submitName: 'normal_send', status: 'OPEN,ACTIVE', runningJobsLimit: 80000, runningJobsCount: 0, pendingJobsCount: 0, sstoppedJobsCount: 0, description: 'normal send queue' },
  { name: 'root.short_kill', submitName: 'short_kill', status: 'OPEN,ACTIVE', runningJobsLimit: 120000, runningJobsCount: 0, pendingJobsCount: 0, sstoppedJobsCount: 0, description: 'short kill queue' },
];

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
  const config = vscode.workspace.getConfiguration('dftIde');
  const mode = config.get<'mock' | 'real' | 'auto'>('donau.mode', 'mock');

  if (mode === 'mock') {
    return getMockResources();
  }

  try {
    return await getRealResources();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isCommandUnavailable(message) || mode === 'auto') {
      vscode.window.showWarningMessage(`Donau commands are unavailable; using mock resources. ${message}`);
      return getMockResources(message);
    }
    vscode.window.showErrorMessage(message);
    return { success: false, source: 'real', accounts: [], queues: [], error: message };
  }
}

function getMockResources(fallbackReason?: string): DonauResourcesResult {
  return {
    success: true,
    source: 'mock',
    accounts: mockAccounts,
    queues: mockQueues,
    fallbackReason,
  };
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
      vscode.window.showErrorMessage(error);
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

function isCommandUnavailable(message: string): boolean {
  return /enoent|not recognized|command not found|no such file/i.test(message);
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

  return accounts.length > 0 ? accounts : mockAccounts;
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

  return queues.length > 0 ? queues : mockQueues;
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
