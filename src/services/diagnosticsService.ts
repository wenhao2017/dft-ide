import * as vscode from 'vscode';
import * as path from 'path';
import { LOCAL_STATE_DIR_NAME, LOCAL_STATE_SUBDIR } from './constants';
import { pathExists } from './utils';
import {
  resolveProjectRoot,
  ensureLocalConfigDirectory,
  ensureLocalStateIgnored,
} from './workspaceService';

export type DftFlowKind = 'hibist' | 'sailor' | 'verification';

export interface DftDiagnosticParseOptions {
  flow: DftFlowKind;
  tool: 'hibist' | 'sailor' | 'lander' | 'unknown';
}

export interface DftDiagnosticParseResult {
  logPath: string;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  totalCount: number;
}

export interface ParsedDftLogIssue {
  severity: vscode.DiagnosticSeverity;
  severityLabel: string;
  filePath?: string;
  line?: number;
  column?: number;
  message: string;
  logLine: number;
}

export const dftDiagnostics = vscode.languages.createDiagnosticCollection('dft-ide');

export function inferDftFlow(title: string, command: string): DftFlowKind {
  const value = `${title} ${command}`.toLowerCase();
  return value.includes('verification') || value.includes('sim') || value.includes('plan')
    ? 'verification'
    : 'hibist';
}

export function inferDftTool(
  title: string,
  command: string,
  flow: DftFlowKind
): DftDiagnosticParseOptions['tool'] {
  const value = `${title} ${command}`.toLowerCase();
  if (value.includes('hibist')) {
    return 'hibist';
  }
  if (value.includes('sailor')) {
    return 'sailor';
  }
  if (value.includes('lander')) {
    return 'lander';
  }
  return flow === 'verification' ? 'lander' : 'sailor';
}

export async function runDftLogDiagnosticsDemo(
  title: string,
  command: string
): Promise<DftDiagnosticParseResult | undefined> {
  const projectRoot = resolveProjectRoot();
  if (!projectRoot) {
    return undefined;
  }

  const flow = inferDftFlow(title, command);
  const tool = inferDftTool(title, command, flow);
  const logPath = await writeDftDiagnosticsDemoFiles(projectRoot, flow, tool);
  const result = await parseDftExecutionLog(logPath, { flow, tool });

  void vscode.commands.executeCommand('workbench.actions.view.problems');
  vscode.window.showInformationMessage(
    `DFT IDE parsed demo ${tool}.log: ${result.errorCount} errors, ${result.warningCount} warnings.`
  );

  return result;
}

export async function parseDftExecutionLog(
  logPath: string,
  options: DftDiagnosticParseOptions
): Promise<DftDiagnosticParseResult> {
  const logUri = vscode.Uri.file(logPath);
  const raw = await vscode.workspace.fs.readFile(logUri);
  const content = Buffer.from(raw).toString('utf-8');
  const issues = parseDftLogContent(content);
  const diagnosticsByFile = new Map<string, { uri: vscode.Uri; diagnostics: vscode.Diagnostic[] }>();

  dftDiagnostics.clear();

  for (const issue of issues) {
    const targetUri = await resolveDiagnosticTargetUri(issue, logUri);
    const range = createDiagnosticRange(issue, targetUri.toString() === logUri.toString() ? issue.logLine : undefined);
    const diagnostic = new vscode.Diagnostic(
      range,
      `[${options.tool}/${options.flow}] ${issue.message}`,
      issue.severity
    );
    diagnostic.source = 'DFT IDE';
    diagnostic.code = options.tool;
    diagnostic.relatedInformation = [
      new vscode.DiagnosticRelatedInformation(
        new vscode.Location(logUri, new vscode.Position(Math.max(issue.logLine - 1, 0), 0)),
        `Parsed from ${path.basename(logPath)} line ${issue.logLine}`
      ),
    ];

    const key = targetUri.toString();
    const bucket = diagnosticsByFile.get(key) ?? { uri: targetUri, diagnostics: [] };
    bucket.diagnostics.push(diagnostic);
    diagnosticsByFile.set(key, bucket);
  }

  for (const bucket of diagnosticsByFile.values()) {
    dftDiagnostics.set(bucket.uri, bucket.diagnostics);
  }

  const errorCount = issues.filter((issue) => issue.severity === vscode.DiagnosticSeverity.Error).length;
  const warningCount = issues.filter((issue) => issue.severity === vscode.DiagnosticSeverity.Warning).length;
  const infoCount = issues.filter((issue) => issue.severity === vscode.DiagnosticSeverity.Information).length;

  return {
    logPath,
    errorCount,
    warningCount,
    infoCount,
    totalCount: issues.length,
  };
}

export function parseDftLogContent(content: string): ParsedDftLogIssue[] {
  const lines = content.split(/\r?\n/);
  const issues: ParsedDftLogIssue[] = [];

  lines.forEach((line, index) => {
    const parsed = parseDftLogLine(line, index + 1);
    if (parsed) {
      issues.push(parsed);
    }
  });

  return issues;
}

export function parseDftLogLine(line: string, logLine: number): ParsedDftLogIssue | undefined {
  const bracketMatch = line.match(
    /\b(Error|Warning)-\[[^\]]+\]\s+(?:(.+?):(\d+)(?::(\d+))?\s*[:\-]\s*)?(.+)$/i
  );
  if (bracketMatch) {
    return {
      severity: toDiagnosticSeverity(bracketMatch[1]),
      severityLabel: bracketMatch[1].toUpperCase(),
      filePath: bracketMatch[2]?.trim(),
      line: bracketMatch[3] ? Number(bracketMatch[3]) : undefined,
      column: bracketMatch[4] ? Number(bracketMatch[4]) : undefined,
      message: bracketMatch[5].trim(),
      logLine,
    };
  }

  const genericMatch = line.match(
    /\b(ERROR|WARNING|WARN)\b[:\s-]*(?:(.+?):(\d+)(?::(\d+))?\s*[:\-]\s*)?(.+)$/i
  );
  if (genericMatch) {
    return {
      severity: toDiagnosticSeverity(genericMatch[1]),
      severityLabel: genericMatch[1].toUpperCase(),
      filePath: genericMatch[2]?.trim(),
      line: genericMatch[3] ? Number(genericMatch[3]) : undefined,
      column: genericMatch[4] ? Number(genericMatch[4]) : undefined,
      message: genericMatch[5].trim(),
      logLine,
    };
  }

  return undefined;
}

export function toDiagnosticSeverity(label: string): vscode.DiagnosticSeverity {
  const normalized = label.toLowerCase();
  if (normalized === 'error') {
    return vscode.DiagnosticSeverity.Error;
  }
  if (normalized === 'warning' || normalized === 'warn') {
    return vscode.DiagnosticSeverity.Warning;
  }
  return vscode.DiagnosticSeverity.Information;
}

export async function resolveDiagnosticTargetUri(
  issue: ParsedDftLogIssue,
  logUri: vscode.Uri
): Promise<vscode.Uri> {
  if (!issue.filePath) {
    return logUri;
  }

  const filePath = path.isAbsolute(issue.filePath)
    ? issue.filePath
    : path.resolve(path.dirname(logUri.fsPath), issue.filePath);
  const uri = vscode.Uri.file(filePath);

  try {
    const stat = await vscode.workspace.fs.stat(uri);
    return stat.type === vscode.FileType.File ? uri : logUri;
  } catch {
    return logUri;
  }
}

export function createDiagnosticRange(issue: ParsedDftLogIssue, fallbackLine?: number): vscode.Range {
  const line = Math.max((issue.line ?? fallbackLine ?? 1) - 1, 0);
  const column = Math.max((issue.column ?? 1) - 1, 0);
  return new vscode.Range(line, column, line, column + 1);
}

export async function writeDftDiagnosticsDemoFiles(
  projectRoot: string,
  flow: DftFlowKind,
  tool: DftDiagnosticParseOptions['tool']
): Promise<string> {
  const demoDir = path.join(projectRoot, LOCAL_STATE_DIR_NAME, LOCAL_STATE_SUBDIR, 'demo-logs', flow);
  const sourceDir = path.join(demoDir, 'sources');
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(sourceDir));
  await ensureLocalStateIgnored(projectRoot, path.join(projectRoot, LOCAL_STATE_DIR_NAME, LOCAL_STATE_SUBDIR));

  if (flow === 'hibist') {
    const rtlPath = path.join(sourceDir, 'top.v');
    const tclPath = path.join(sourceDir, 'dft_constraints.tcl');
    await vscode.workspace.fs.writeFile(vscode.Uri.file(rtlPath), Buffer.from(createDemoSource(60, 42, 'assign scan_out = missing_port;'), 'utf-8'));
    await vscode.workspace.fs.writeFile(vscode.Uri.file(tclPath), Buffer.from(createDemoSource(30, 18, 'set_dft_signal -type ScanEnable scan_en'), 'utf-8'));
    const logPath = path.join(demoDir, `${tool}.log`);
    const log = [
      `[INFO] ${tool} design flow started`,
      `ERROR: ${rtlPath}:42:20: port missing_port was not found in the current design`,
      `WARNING: ${tclPath}:18:5: scan enable constraint did not match any port`,
      'INFO: report summary written to ./reports/dft_summary.rpt',
      '',
    ].join('\n');
    await vscode.workspace.fs.writeFile(vscode.Uri.file(logPath), Buffer.from(log, 'utf-8'));
    return logPath;
  }

  const tbPath = path.join(sourceDir, 'scan_tb.sv');
  const casePath = path.join(sourceDir, 'smoke_test.yaml');
  await vscode.workspace.fs.writeFile(vscode.Uri.file(tbPath), Buffer.from(createDemoSource(80, 57, 'uvm_error("SCAN", "signature mismatch")'), 'utf-8'));
  await vscode.workspace.fs.writeFile(vscode.Uri.file(casePath), Buffer.from(createDemoSource(25, 9, 'pattern: stuck_at_demo'), 'utf-8'));
  const logPath = path.join(demoDir, 'lander.log');
  const log = [
    '[INFO] lander verification flow started',
    `Error-[DFT-1024] ${tbPath}:57:3: scan chain signature mismatched expected value`,
    `WARNING: ${casePath}:9:1: testcase uses a deprecated pattern option`,
    'INFO: waveform generated at ./waves/demo.fsdb',
    '',
  ].join('\n');
  await vscode.workspace.fs.writeFile(vscode.Uri.file(logPath), Buffer.from(log, 'utf-8'));
  return logPath;
}

export function createDemoSource(lineCount: number, specialLine: number, specialText: string): string {
  const lines: string[] = [];
  for (let index = 1; index <= lineCount; index++) {
    lines.push(index === specialLine ? specialText : `// demo source line ${index}`);
  }
  return `${lines.join('\n')}\n`;
}
