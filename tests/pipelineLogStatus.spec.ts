import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  findPipelineLogErrors,
  inspectPipelineStepLogs,
  isPipelineStepLogFile,
} from '../src/services/pipelineLogStatus';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    fs.promises.rm(directory, { recursive: true, force: true })
  )));
});

describe('pipeline log status', () => {
  it('matches the exact step log and parameterized verification logs', () => {
    expect(isPipelineStepLogFile('run_atpg.log', 'run_atpg')).toBe(true);
    expect(isPipelineStepLogFile('run_atpg__group_a__tc_1.log', 'run_atpg')).toBe(true);
    expect(isPipelineStepLogFile('run_atpg_extra.log', 'run_atpg')).toBe(false);
    expect(isPipelineStepLogFile('other.log', 'run_atpg')).toBe(false);
  });

  it('finds Error tokens case-insensitively and reports their lines', () => {
    expect(findPipelineLogErrors('run_atpg.log', 'ready\nERROR: failed\nscript error here')).toEqual([
      { fileName: 'run_atpg.log', lineNumber: 2, line: 'ERROR: failed' },
      { fileName: 'run_atpg.log', lineNumber: 3, line: 'script error here' },
    ]);
  });

  it('reads all matching logs from the execution directory only', async () => {
    const projectRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dft-ide-log-status-'));
    temporaryDirectories.push(projectRoot);
    const logDirectory = path.join(
      projectRoot,
      '.dft-ide',
      'local-state',
      'history',
      'verification',
      'exec_1_1',
    );
    await fs.promises.mkdir(logDirectory, { recursive: true });
    await fs.promises.writeFile(path.join(logDirectory, 'run_atpg.log'), 'completed\n');
    await fs.promises.writeFile(path.join(logDirectory, 'run_atpg__group_a.log'), 'Error: backend failed\n');
    await fs.promises.writeFile(path.join(logDirectory, 'other.log'), 'Error: unrelated\n');

    await expect(inspectPipelineStepLogs(
      projectRoot,
      'verification',
      'exec_1_1',
      'run_atpg',
    )).resolves.toEqual({
      logFiles: ['run_atpg.log', 'run_atpg__group_a.log'],
      errors: [{
        fileName: 'run_atpg__group_a.log',
        lineNumber: 1,
        line: 'Error: backend failed',
      }],
    });
  });
});
