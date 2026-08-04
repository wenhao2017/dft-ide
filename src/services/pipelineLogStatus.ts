import * as fs from 'fs';
import * as path from 'path';

export interface PipelineStepLogError {
  fileName: string;
  lineNumber: number;
  line: string;
}

export interface PipelineStepLogInspection {
  logFiles: string[];
  errors: PipelineStepLogError[];
}

const ERROR_TOKEN = /\berror\b/i;

export function isPipelineStepLogFile(fileName: string, stepName: string): boolean {
  return fileName === `${stepName}.log`
    || (fileName.startsWith(`${stepName}__`) && fileName.endsWith('.log'));
}

export function findPipelineLogErrors(fileName: string, content: string): PipelineStepLogError[] {
  const errors: PipelineStepLogError[] = [];
  content.split(/\r?\n/).forEach((line, index) => {
    if (ERROR_TOKEN.test(line)) {
      errors.push({ fileName, lineNumber: index + 1, line: line.trim() });
    }
  });
  return errors;
}

export async function inspectPipelineStepLogs(
  projectRoot: string,
  flow: string,
  runId: string,
  stepName: string,
): Promise<PipelineStepLogInspection> {
  const logDirectory = path.join(
    projectRoot,
    '.dft-ide',
    'local-state',
    'history',
    flow,
    runId,
  );

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(logDirectory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { logFiles: [], errors: [] };
    }
    throw error;
  }

  const logFiles = entries
    .filter((entry) => entry.isFile() && isPipelineStepLogFile(entry.name, stepName))
    .map((entry) => entry.name)
    .sort();
  const errors: PipelineStepLogError[] = [];
  for (const fileName of logFiles) {
    const content = await fs.promises.readFile(path.join(logDirectory, fileName), 'utf-8');
    errors.push(...findPipelineLogErrors(fileName, content));
  }
  return { logFiles, errors };
}
