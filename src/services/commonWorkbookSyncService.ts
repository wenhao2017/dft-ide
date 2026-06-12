import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as XLSX from 'xlsx';

export interface CommonSyncArtifactInput {
  label: string;
  sourcePath: string;
  targetPath: string;
}

export interface CommonSyncArtifact {
  key: 'designTree' | 'normTable';
  label: string;
  source: string;
  target: string;
  exists: boolean;
}

export function buildCommonSyncArtifacts(repoRoot: string, inputs: CommonSyncArtifactInput[], projectRoot?: string): CommonSyncArtifact[] {
  const artifacts: CommonSyncArtifact[] = [];
  inputs.forEach((input, index) => {
    const source = input.sourcePath.trim();
    if (!source) {
      return;
    }
    const resolvedSource = resolveCommonSyncSource(source, projectRoot);
    const target = resolveCommonSyncTarget(repoRoot, input.targetPath, resolvedSource);
    artifacts.push({
      key: index === 0 ? 'designTree' : 'normTable',
      label: input.label,
      source: resolvedSource,
      target,
      exists: fs.existsSync(target),
    });
  });
  return artifacts;
}

function resolveCommonSyncSource(sourcePath: string, projectRoot?: string): string {
  const resolved = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.resolve(projectRoot ?? '.', sourcePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Source file does not exist: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    throw new Error(`Source must be an XLS/XLSX file: ${resolved}`);
  }
  if (!isSpreadsheetFile(resolved)) {
    throw new Error(`Source must be an .xls or .xlsx file: ${resolved}`);
  }
  return resolved;
}

function resolveCommonSyncTarget(repoRoot: string, targetPath: string, sourcePath: string): string {
  const sourceName = path.basename(sourcePath);
  const trimmed = targetPath.trim();
  if (!trimmed) {
    return path.join(repoRoot, sourceName);
  }
  const resolved = path.isAbsolute(trimmed) ? trimmed : path.resolve(repoRoot, trimmed);
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    return path.join(resolved, sourceName);
  }
  if (!path.extname(resolved)) {
    return path.join(resolved, sourceName);
  }
  if (!isSpreadsheetFile(resolved)) {
    throw new Error(`Target file must be an .xls or .xlsx file, or a directory: ${resolved}`);
  }
  return resolved;
}

export function isSpreadsheetFile(filePath: string): boolean {
  return /\.xlsx?$/i.test(path.extname(filePath));
}

export interface CommonSyncDiffItem {
  id: string;
  fileType: 'designTree' | 'normTable';
  fileName: string;
  sheetName: string;
  key: string;
  fieldName: string;
  type: 'sourceAdded' | 'targetRedundant' | 'fieldDifferent' | 'fieldAnomaly' | 'sheetAdded' | 'sheetRedundant';
  sourceVal: string;
  targetVal: string;
}

interface WorkbookSheetModel {
  name: string;
  rows: string[][];
  headers: string[];
  rowKeys: string[];
  rowEntries: WorkbookRowEntry[];
  rowByKey: Map<string, WorkbookRowModel>;
}

interface WorkbookRowModel {
  rowIndex: number;
  values: string[];
  signature: string;
}

type WorkbookRowEntry =
  | { kind: 'data'; key: string; rowIndex: number }
  | { kind: 'blank'; rowIndex: number };

type MergedWorkbookRowEntry =
  | { kind: 'sourceData'; key: string }
  | { kind: 'targetData'; key: string }
  | { kind: 'sourceBlank'; rowIndex: number };

const workbookReadOptions: XLSX.ParsingOptions = {
  cellDates: false,
  cellFormula: true,
  cellHTML: false,
  cellStyles: false,
};

export function areSpreadsheetFilesIdentical(sourcePath: string, targetPath: string): boolean {
  if (!fs.existsSync(sourcePath) || !fs.existsSync(targetPath)) {
    return false;
  }

  const sourceStat = fs.statSync(sourcePath);
  const targetStat = fs.statSync(targetPath);
  if (!sourceStat.isFile() || !targetStat.isFile() || sourceStat.size !== targetStat.size) {
    return false;
  }

  return hashFile(sourcePath) === hashFile(targetPath);
}

export function buildWorkbookDiffItems(artifact: CommonSyncArtifact): CommonSyncDiffItem[] {
  if (areSpreadsheetFilesIdentical(artifact.source, artifact.target)) {
    return [];
  }

  const sourceBook = readWorkbookFile(artifact.source);
  const targetBook = fs.existsSync(artifact.target)
    ? readWorkbookFile(artifact.target)
    : XLSX.utils.book_new();
  const sourceSheetSignatures = buildWorkbookSheetSignatures(sourceBook);
  const targetSheetSignatures = buildWorkbookSheetSignatures(targetBook);
  const items: CommonSyncDiffItem[] = [];
  const sheetNames = new Set([...sourceBook.SheetNames, ...targetBook.SheetNames]);

  for (const sheetName of sheetNames) {
    const sourceWorksheet = sourceBook.Sheets[sheetName];
    const targetWorksheet = targetBook.Sheets[sheetName];
    if (sourceWorksheet && !targetWorksheet) {
      items.push(makeWorkbookDiffItem(artifact, sheetName, sheetName, '', 'sheetAdded', 'Sheet exists', ''));
      continue;
    }
    if (!sourceWorksheet && targetWorksheet) {
      items.push(makeWorkbookDiffItem(artifact, sheetName, sheetName, '', 'sheetRedundant', '', 'Sheet exists'));
      continue;
    }
    if (!sourceWorksheet || !targetWorksheet) {
      continue;
    }
    if (sourceSheetSignatures.get(sheetName) === targetSheetSignatures.get(sheetName)) {
      continue;
    }

    const sourceSheet = buildWorkbookSheetModel(sheetName, sourceWorksheet);
    const targetSheet = buildWorkbookSheetModel(sheetName, targetWorksheet);
    const rowKeys = new Set([...sourceSheet.rowByKey.keys(), ...targetSheet.rowByKey.keys()]);
    for (const rowKey of rowKeys) {
      const sourceRow = sourceSheet.rowByKey.get(rowKey);
      const targetRow = targetSheet.rowByKey.get(rowKey);
      if (sourceRow && !targetRow) {
        items.push(makeWorkbookDiffItem(artifact, sheetName, rowKey, '', 'sourceAdded', rowToDisplay(sourceRow.values), ''));
        continue;
      }
      if (!sourceRow && targetRow) {
        items.push(makeWorkbookDiffItem(artifact, sheetName, rowKey, '', 'targetRedundant', '', rowToDisplay(targetRow.values)));
        continue;
      }
      if (!sourceRow || !targetRow) {
        continue;
      }

      const maxColumns = Math.max(sourceRow.values.length, targetRow.values.length, sourceSheet.headers.length, targetSheet.headers.length);
      if (sourceRow.signature === targetRow.signature) {
        continue;
      }
      for (let columnIndex = 0; columnIndex < maxColumns; columnIndex += 1) {
        const sourceVal = sourceRow.values[columnIndex] ?? '';
        const targetVal = targetRow.values[columnIndex] ?? '';
        if (sourceVal === targetVal) {
          continue;
        }
        const fieldName = sourceSheet.headers[columnIndex] || targetSheet.headers[columnIndex] || `Column ${columnIndex + 1}`;
        items.push(makeWorkbookDiffItem(
          artifact,
          sheetName,
          `${rowKey}::${columnIndex}`,
          fieldName,
          'fieldDifferent',
          sourceVal,
          targetVal
        ));
      }
    }
  }

  return items;
}

export async function mergeWorkbookArtifact(
  artifact: CommonSyncArtifact,
  strategy: string,
  decisions: Array<{ id: string; choice: 'source' | 'target' | 'custom'; customValue?: string }>
): Promise<boolean> {
  if (areSpreadsheetFilesIdentical(artifact.source, artifact.target)) {
    return false;
  }

  if (!fs.existsSync(artifact.target)) {
    fs.mkdirSync(path.dirname(artifact.target), { recursive: true });
    await vscode.workspace.fs.copy(vscode.Uri.file(artifact.source), vscode.Uri.file(artifact.target), { overwrite: true });
    return true;
  }

  const sourceBook = readWorkbookFile(artifact.source);
  const targetBook = fs.existsSync(artifact.target)
    ? readWorkbookFile(artifact.target)
    : XLSX.utils.book_new();
  const sourceSheetSignatures = buildWorkbookSheetSignatures(sourceBook);
  const targetSheetSignatures = buildWorkbookSheetSignatures(targetBook);
  const decisionMap = new Map(decisions.map((decision) => [decision.id, decision]));
  const sheetNames = new Set([...sourceBook.SheetNames, ...targetBook.SheetNames]);
  const mergedBook = createMergedWorkbook(sourceBook);

  for (const sheetName of sheetNames) {
    const sourceWorksheet = sourceBook.Sheets[sheetName];
    const targetWorksheet = targetBook.Sheets[sheetName];
    const sheetAddedId = makeWorkbookDiffId(artifact.key, sheetName, sheetName, '');
    const sheetRedundantId = makeWorkbookDiffId(artifact.key, sheetName, sheetName, '');

    if (sourceWorksheet && !targetWorksheet) {
      const choice = resolveWorkbookChoice(strategy, decisionMap.get(sheetAddedId), 'source');
      if (choice === 'source') {
        appendWorksheet(mergedBook, sheetName, cloneWorksheet(sourceWorksheet));
      }
      continue;
    }

    if (!sourceWorksheet && targetWorksheet) {
      const choice = resolveWorkbookChoice(strategy, decisionMap.get(sheetRedundantId), 'source');
      if (choice === 'target') {
        appendWorksheet(mergedBook, sheetName, cloneWorksheet(targetWorksheet));
      }
      continue;
    }

    if (!sourceWorksheet || !targetWorksheet) {
      continue;
    }

    if (sourceSheetSignatures.get(sheetName) === targetSheetSignatures.get(sheetName)) {
      appendWorksheet(mergedBook, sheetName, cloneWorksheet(sourceWorksheet));
      continue;
    }

    const sourceSheet = buildWorkbookSheetModel(sheetName, sourceWorksheet);
    const targetSheet = buildWorkbookSheetModel(sheetName, targetWorksheet);
    const mergedSheet = mergeSheetWorksheet(
      artifact,
      sheetName,
      sourceWorksheet,
      targetWorksheet,
      sourceSheet,
      targetSheet,
      strategy,
      decisionMap
    );
    appendWorksheet(mergedBook, sheetName, mergedSheet);
  }

  if (mergedBook.SheetNames.length === 0) {
    throw new Error(`Merge produced an empty workbook for ${artifact.target}`);
  }
  fs.mkdirSync(path.dirname(artifact.target), { recursive: true });
  XLSX.writeFile(mergedBook, artifact.target, { bookType: getWorkbookBookType(artifact.target) });
  return true;
}

function readWorkbookFile(filePath: string): XLSX.WorkBook {
  return XLSX.readFile(filePath, workbookReadOptions);
}

function hashFile(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function buildWorkbookSheetSignatures(workbook: XLSX.WorkBook): Map<string, string> {
  const signatures = new Map<string, string>();
  for (const sheetName of workbook.SheetNames) {
    signatures.set(sheetName, createSheetSignature(workbook.Sheets[sheetName]));
  }
  return signatures;
}

function createSheetSignature(worksheet: XLSX.WorkSheet): string {
  const hash = crypto.createHash('sha256');
  hash.update(String(worksheet['!ref'] ?? ''));
  const cellAddresses = Object.keys(worksheet)
    .filter((key) => !key.startsWith('!'))
    .sort();
  for (const address of cellAddresses) {
    const cell = (worksheet as Record<string, XLSX.CellObject | undefined>)[address];
    hash.update('\0');
    hash.update(address);
    hash.update('\0');
    hash.update(normalizeCellValue(cell?.v));
  }
  return hash.digest('hex');
}

function createMergedWorkbook(sourceBook: XLSX.WorkBook): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const sourceRecord = sourceBook as unknown as Record<string, unknown>;
  const workbookRecord = workbook as unknown as Record<string, unknown>;

  for (const key of ['Props', 'Custprops', 'SSF', 'vbaraw']) {
    const value = sourceRecord[key];
    if (value !== undefined) {
      workbookRecord[key] = cloneWorkbookValue(value);
    }
  }

  return workbook;
}

function mergeSheetWorksheet(
  artifact: CommonSyncArtifact,
  sheetName: string,
  sourceWorksheet: XLSX.WorkSheet,
  targetWorksheet: XLSX.WorkSheet,
  sourceSheet: WorkbookSheetModel,
  targetSheet: WorkbookSheetModel,
  strategy: string,
  decisionMap: Map<string, { id: string; choice: 'source' | 'target' | 'custom'; customValue?: string }>
): XLSX.WorkSheet {
  const worksheet: XLSX.WorkSheet = {};
  const header = sourceSheet.headers.length > 0 ? sourceSheet.headers : targetSheet.headers;
  const rowEntries = planMergedRowOrder(sourceSheet, targetSheet);
  const maxColumns = Math.max(
    header.length,
    getWorksheetColumnCount(sourceWorksheet),
    getWorksheetColumnCount(targetWorksheet),
    ...sourceSheet.rows.map((row) => row.length),
    ...targetSheet.rows.map((row) => row.length)
  );
  const sourceRowMap = new Map<number, number>();
  const targetRowMap = new Map<number, number>();
  let outputRowIndex = 0;

  if (sourceSheet.headers.length > 0) {
    copyWorksheetRow(sourceWorksheet, worksheet, 0, outputRowIndex, maxColumns);
    sourceRowMap.set(0, outputRowIndex);
  } else if (targetSheet.headers.length > 0) {
    copyWorksheetRow(targetWorksheet, worksheet, 0, outputRowIndex, maxColumns);
    targetRowMap.set(0, outputRowIndex);
  } else {
    writeWorksheetRowValues(worksheet, outputRowIndex, header);
  }
  copyWorksheetRowMeta(sourceWorksheet, targetWorksheet, worksheet, 0, undefined, outputRowIndex);
  outputRowIndex += 1;

  for (const rowEntry of rowEntries) {
    if (rowEntry.kind === 'sourceBlank') {
      copyWorksheetRowMeta(sourceWorksheet, targetWorksheet, worksheet, rowEntry.rowIndex, undefined, outputRowIndex);
      sourceRowMap.set(rowEntry.rowIndex, outputRowIndex);
      outputRowIndex += 1;
      continue;
    }

    const rowKey = rowEntry.key;
    const sourceRow = sourceSheet.rowByKey.get(rowKey);
    const targetRow = targetSheet.rowByKey.get(rowKey);
    const rowId = makeWorkbookDiffId(artifact.key, sheetName, rowKey, '');

    if (rowEntry.kind === 'sourceData' && sourceRow && !targetRow) {
      if (resolveWorkbookChoice(strategy, decisionMap.get(rowId), 'source') === 'source') {
        copyWorksheetRow(sourceWorksheet, worksheet, sourceRow.rowIndex, outputRowIndex, maxColumns);
        copyWorksheetRowMeta(sourceWorksheet, targetWorksheet, worksheet, sourceRow.rowIndex, undefined, outputRowIndex);
        sourceRowMap.set(sourceRow.rowIndex, outputRowIndex);
        outputRowIndex += 1;
      }
      continue;
    }

    if (rowEntry.kind === 'targetData' && !sourceRow && targetRow) {
      if (resolveWorkbookChoice(strategy, decisionMap.get(rowId), 'source') === 'target') {
        copyWorksheetRow(targetWorksheet, worksheet, targetRow.rowIndex, outputRowIndex, maxColumns);
        copyWorksheetRowMeta(sourceWorksheet, targetWorksheet, worksheet, undefined, targetRow.rowIndex, outputRowIndex);
        targetRowMap.set(targetRow.rowIndex, outputRowIndex);
        outputRowIndex += 1;
      }
      continue;
    }

    if (!sourceRow || !targetRow) {
      continue;
    }

    for (let columnIndex = 0; columnIndex < maxColumns; columnIndex += 1) {
      const sourceVal = sourceRow.values[columnIndex] ?? '';
      const targetVal = targetRow.values[columnIndex] ?? '';
      if (sourceVal === targetVal) {
        copyWorksheetCell(sourceWorksheet, worksheet, sourceRow.rowIndex, columnIndex, outputRowIndex, columnIndex);
        continue;
      }

      const fieldName = sourceSheet.headers[columnIndex] || targetSheet.headers[columnIndex] || `Column ${columnIndex + 1}`;
      const cellId = makeWorkbookDiffId(artifact.key, sheetName, `${rowKey}::${columnIndex}`, fieldName);
      const decision = decisionMap.get(cellId);
      const choice = resolveWorkbookChoice(strategy, decision, 'source');
      if (choice === 'source') {
        copyWorksheetCell(sourceWorksheet, worksheet, sourceRow.rowIndex, columnIndex, outputRowIndex, columnIndex);
      } else if (choice === 'target') {
        copyWorksheetCell(targetWorksheet, worksheet, targetRow.rowIndex, columnIndex, outputRowIndex, columnIndex);
      } else {
        writeWorksheetCellValue(
          worksheet,
          outputRowIndex,
          columnIndex,
          decision?.customValue ?? '',
          getWorksheetCell(targetWorksheet, targetRow.rowIndex, columnIndex) ?? getWorksheetCell(sourceWorksheet, sourceRow.rowIndex, columnIndex)
        );
      }
    }
    copyWorksheetRowMeta(sourceWorksheet, targetWorksheet, worksheet, sourceRow.rowIndex, targetRow.rowIndex, outputRowIndex);
    sourceRowMap.set(sourceRow.rowIndex, outputRowIndex);
    targetRowMap.set(targetRow.rowIndex, outputRowIndex);
    outputRowIndex += 1;
  }

  copyWorksheetProperties(sourceWorksheet, targetWorksheet, worksheet, sourceRowMap, targetRowMap);
  const lastRow = Math.max(0, outputRowIndex - 1);
  const lastColumn = Math.max(0, maxColumns - 1, getWorksheetColumnCount(worksheet) - 1);
  worksheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: lastColumn } });
  return worksheet;
}

function planMergedRowOrder(sourceSheet: WorkbookSheetModel, targetSheet: WorkbookSheetModel): MergedWorkbookRowEntry[] {
  const sourceKeys = sourceSheet.rowKeys;
  const targetKeys = targetSheet.rowKeys;
  const sourceKeySet = new Set(sourceKeys);
  const emittedDataKeys = new Set<string>();
  const targetOnlyBeforeSourceKey = new Map<string, string[]>();
  let pendingTargetOnly: string[] = [];

  for (const targetKey of targetKeys) {
    if (!sourceKeySet.has(targetKey)) {
      pendingTargetOnly.push(targetKey);
      continue;
    }
    if (pendingTargetOnly.length > 0) {
      targetOnlyBeforeSourceKey.set(targetKey, pendingTargetOnly);
      pendingTargetOnly = [];
    }
  }

  const orderedRows: MergedWorkbookRowEntry[] = [];
  const pushDataKey = (key: string, kind: 'sourceData' | 'targetData') => {
    if (!emittedDataKeys.has(key)) {
      orderedRows.push({ kind, key });
      emittedDataKeys.add(key);
    }
  };

  for (const entry of sourceSheet.rowEntries) {
    if (entry.kind === 'blank') {
      orderedRows.push({ kind: 'sourceBlank', rowIndex: entry.rowIndex });
      continue;
    }

    for (const targetOnlyKey of targetOnlyBeforeSourceKey.get(entry.key) ?? []) {
      pushDataKey(targetOnlyKey, 'targetData');
    }
    pushDataKey(entry.key, 'sourceData');
  }

  for (const targetKey of targetKeys) {
    pushDataKey(targetKey, sourceKeySet.has(targetKey) ? 'sourceData' : 'targetData');
  }

  return orderedRows;
}

function copyWorksheetRow(
  sourceWorksheet: XLSX.WorkSheet,
  targetWorksheet: XLSX.WorkSheet,
  sourceRowIndex: number,
  targetRowIndex: number,
  maxColumns: number
): void {
  for (let columnIndex = 0; columnIndex < maxColumns; columnIndex += 1) {
    copyWorksheetCell(sourceWorksheet, targetWorksheet, sourceRowIndex, columnIndex, targetRowIndex, columnIndex);
  }
}

function copyWorksheetCell(
  sourceWorksheet: XLSX.WorkSheet,
  targetWorksheet: XLSX.WorkSheet,
  sourceRowIndex: number,
  sourceColumnIndex: number,
  targetRowIndex: number,
  targetColumnIndex: number
): void {
  const cell = getWorksheetCell(sourceWorksheet, sourceRowIndex, sourceColumnIndex);
  if (!cell) {
    return;
  }
  const targetAddress = XLSX.utils.encode_cell({ r: targetRowIndex, c: targetColumnIndex });
  (targetWorksheet as Record<string, unknown>)[targetAddress] = cloneCell(cell);
}

function writeWorksheetRowValues(worksheet: XLSX.WorkSheet, rowIndex: number, values: string[]): void {
  values.forEach((value, columnIndex) => {
    writeWorksheetCellValue(worksheet, rowIndex, columnIndex, value);
  });
}

function writeWorksheetCellValue(
  worksheet: XLSX.WorkSheet,
  rowIndex: number,
  columnIndex: number,
  value: string,
  template?: XLSX.CellObject
): void {
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
  const cell = template ? cloneCell(template) : {} as XLSX.CellObject;
  const mutableCell = cell as unknown as Record<string, unknown>;
  delete mutableCell.f;
  delete mutableCell.F;
  delete mutableCell.D;
  delete mutableCell.w;
  cell.v = value;
  cell.t = 's';
  (worksheet as Record<string, unknown>)[address] = cell;
}

function getWorksheetCell(worksheet: XLSX.WorkSheet, rowIndex: number, columnIndex: number): XLSX.CellObject | undefined {
  return (worksheet as Record<string, XLSX.CellObject | undefined>)[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
}

function copyWorksheetRowMeta(
  sourceWorksheet: XLSX.WorkSheet,
  targetWorksheet: XLSX.WorkSheet,
  outputWorksheet: XLSX.WorkSheet,
  sourceRowIndex: number | undefined,
  targetRowIndex: number | undefined,
  outputRowIndex: number
): void {
  const sourceRows = (sourceWorksheet as { '!rows'?: unknown[] })['!rows'];
  const targetRows = (targetWorksheet as { '!rows'?: unknown[] })['!rows'];
  const rowMeta =
    sourceRowIndex !== undefined ? sourceRows?.[sourceRowIndex] :
      targetRowIndex !== undefined ? targetRows?.[targetRowIndex] :
        undefined;
  if (!rowMeta) {
    return;
  }
  const outputRows = ((outputWorksheet as { '!rows'?: unknown[] })['!rows'] ?? []) as unknown[];
  outputRows[outputRowIndex] = cloneWorkbookValue(rowMeta);
  (outputWorksheet as { '!rows'?: unknown[] })['!rows'] = outputRows;
}

function copyWorksheetProperties(
  sourceWorksheet: XLSX.WorkSheet,
  targetWorksheet: XLSX.WorkSheet,
  outputWorksheet: XLSX.WorkSheet,
  sourceRowMap: Map<number, number>,
  targetRowMap: Map<number, number>
): void {
  const sourceRecord = sourceWorksheet as Record<string, unknown>;
  const targetRecord = targetWorksheet as Record<string, unknown>;
  const outputRecord = outputWorksheet as Record<string, unknown>;

  for (const key of ['!cols', '!margins', '!protect', '!autofilter']) {
    const value = sourceRecord[key] ?? targetRecord[key];
    if (value !== undefined) {
      outputRecord[key] = cloneWorkbookValue(value);
    }
  }

  const merges = [
    ...remapWorksheetMerges(sourceWorksheet, sourceRowMap),
    ...remapWorksheetMerges(targetWorksheet, targetRowMap),
  ];
  if (merges.length > 0) {
    outputRecord['!merges'] = dedupeWorksheetMerges(merges);
  }
}

function remapWorksheetMerges(worksheet: XLSX.WorkSheet, rowMap: Map<number, number>): XLSX.Range[] {
  const merges = (worksheet as { '!merges'?: XLSX.Range[] })['!merges'] ?? [];
  const remapped: XLSX.Range[] = [];
  for (const merge of merges) {
    const startRow = rowMap.get(merge.s.r);
    const endRow = rowMap.get(merge.e.r);
    if (startRow === undefined || endRow === undefined) {
      continue;
    }

    let canMap = true;
    for (let row = merge.s.r; row <= merge.e.r; row += 1) {
      const mappedRow = rowMap.get(row);
      if (mappedRow === undefined || mappedRow !== startRow + (row - merge.s.r)) {
        canMap = false;
        break;
      }
    }
    if (canMap) {
      remapped.push({ s: { r: startRow, c: merge.s.c }, e: { r: endRow, c: merge.e.c } });
    }
  }
  return remapped;
}

function dedupeWorksheetMerges(merges: XLSX.Range[]): XLSX.Range[] {
  const seen = new Set<string>();
  const unique: XLSX.Range[] = [];
  for (const merge of merges) {
    const key = `${merge.s.r}:${merge.s.c}:${merge.e.r}:${merge.e.c}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(merge);
    }
  }
  return unique;
}

function getWorksheetColumnCount(worksheet: XLSX.WorkSheet): number {
  const ref = worksheet['!ref'];
  if (!ref) {
    return 0;
  }
  return XLSX.utils.decode_range(ref).e.c + 1;
}

function cloneWorksheet(worksheet: XLSX.WorkSheet): XLSX.WorkSheet {
  const cloned: XLSX.WorkSheet = {};
  const sourceRecord = worksheet as Record<string, unknown>;
  const targetRecord = cloned as Record<string, unknown>;

  for (const [key, value] of Object.entries(sourceRecord)) {
    if (!key.startsWith('!')) {
      targetRecord[key] = cloneCell(value as XLSX.CellObject);
      continue;
    }

    if (key === '!ref' || key === '!type') {
      targetRecord[key] = value;
      continue;
    }

    if (key === '!merges' || key === '!cols' || key === '!rows' || key === '!margins' || key === '!protect' || key === '!autofilter') {
      targetRecord[key] = cloneWorkbookValue(value);
    }
  }

  return cloned;
}

function cloneCell(cell: XLSX.CellObject): XLSX.CellObject {
  const source = cell as unknown as Record<string, unknown>;
  const cloned: Record<string, unknown> = {};

  for (const key of ['t', 'v', 'w', 'z', 'f', 'F', 'D']) {
    const value = source[key];
    if (value !== undefined) {
      cloned[key] = value instanceof Date ? new Date(value.getTime()) : value;
    }
  }

  return cloned as unknown as XLSX.CellObject;
}

function cloneWorkbookValue<T>(value: T): T {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  const root = Array.isArray(value) ? [] : {};
  const stack: Array<{
    source: Record<string, unknown> | unknown[];
    target: Record<string, unknown> | unknown[];
    ancestors: object[];
  }> = [
    {
      source: value as Record<string, unknown> | unknown[],
      target: root as Record<string, unknown> | unknown[],
      ancestors: [value as object],
    },
  ];

  while (stack.length > 0) {
    const { source, target, ancestors } = stack.pop()!;

    for (const [key, nestedValue] of Object.entries(source)) {
      if (typeof nestedValue === 'function' || typeof nestedValue === 'symbol') {
        continue;
      }

      if (!nestedValue || typeof nestedValue !== 'object') {
        (target as Record<string, unknown>)[key] = nestedValue;
        continue;
      }

      if (nestedValue instanceof Date) {
        (target as Record<string, unknown>)[key] = new Date(nestedValue.getTime());
        continue;
      }

      const nestedObject = nestedValue as Record<string, unknown> | unknown[];
      if (ancestors.includes(nestedObject)) {
        continue;
      }

      const cloned = Array.isArray(nestedValue) ? [] : {};
      (target as Record<string, unknown>)[key] = cloned;
      stack.push({
        source: nestedObject,
        target: cloned as Record<string, unknown> | unknown[],
        ancestors: [...ancestors, nestedObject],
      });
    }
  }

  return root as T;
}

function buildWorkbookSheetModel(sheetName: string, sheet: XLSX.WorkSheet): WorkbookSheetModel {
  const extracted = extractWorksheetRows(sheet);
  if (extracted.rowIndexes.length === 0) {
    return { name: sheetName, rows: [], headers: [], rowKeys: [], rowEntries: [], rowByKey: new Map() };
  }
  const headerRowIndex = extracted.rowIndexes[0];
  const headers = getExtractedRowValues(extracted.rowsByIndex, headerRowIndex, extracted.columnCount)
    .map((value, index) => value || `Column ${index + 1}`);
  const rows = extracted.rowIndexes.map((rowIndex) => getExtractedRowValues(extracted.rowsByIndex, rowIndex, extracted.columnCount));
  const keyIndex = findKeyColumnIndex(headers);
  const rowKeys: string[] = [];
  const rowEntries: WorkbookRowEntry[] = [];
  const rowByKey = new Map<string, WorkbookRowModel>();
  for (const rowIndex of extracted.rowIndexes.slice(1)) {
    const row = getExtractedRowValues(extracted.rowsByIndex, rowIndex, extracted.columnCount);
    if (row.every((value) => value === '')) {
      rowEntries.push({ kind: 'blank', rowIndex });
      continue;
    }
    const rawKey = (row[keyIndex] || row.find((value) => value !== '') || `row-${rowIndex + 1}`).trim();
    const key = makeUniqueRowKey(rowByKey, rawKey || `row-${rowIndex + 1}`);
    rowKeys.push(key);
    rowEntries.push({ kind: 'data', key, rowIndex });
    rowByKey.set(key, { rowIndex, values: row, signature: createRowSignature(row) });
  }
  return { name: sheetName, rows, headers, rowKeys, rowEntries, rowByKey };
}

function extractWorksheetRows(sheet: XLSX.WorkSheet): {
  rowsByIndex: Map<number, Map<number, string>>;
  rowIndexes: number[];
  columnCount: number;
} {
  const rowsByIndex = new Map<number, Map<number, string>>();
  let maxColumn = -1;

  for (const key of Object.keys(sheet)) {
    if (key.startsWith('!')) {
      continue;
    }

    let address: XLSX.CellAddress;
    try {
      address = XLSX.utils.decode_cell(key);
    } catch {
      continue;
    }

    const cell = (sheet as Record<string, XLSX.CellObject | undefined>)[key];
    const row = rowsByIndex.get(address.r) ?? new Map<number, string>();
    row.set(address.c, normalizeCellValue(cell?.v));
    rowsByIndex.set(address.r, row);
    maxColumn = Math.max(maxColumn, address.c);
  }

  const rowIndexes = Array.from(rowsByIndex.keys()).sort((a, b) => a - b);
  return {
    rowsByIndex,
    rowIndexes,
    columnCount: Math.max(maxColumn + 1, getWorksheetColumnCount(sheet)),
  };
}

function getExtractedRowValues(rowsByIndex: Map<number, Map<number, string>>, rowIndex: number, columnCount: number): string[] {
  const row = rowsByIndex.get(rowIndex);
  const values: string[] = [];
  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    values.push(row?.get(columnIndex) ?? '');
  }
  return values;
}

function normalizeCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function createRowSignature(row: string[]): string {
  let lastMeaningfulColumn = row.length - 1;
  while (lastMeaningfulColumn >= 0 && row[lastMeaningfulColumn] === '') {
    lastMeaningfulColumn -= 1;
  }
  return JSON.stringify(row.slice(0, lastMeaningfulColumn + 1));
}

function findKeyColumnIndex(headers: string[]): number {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  const preferred = ['key', 'id', 'name', 'design_name', 'pin_name', 'module', 'module_name'];
  for (const key of preferred) {
    const index = normalized.indexOf(key);
    if (index >= 0) {
      return index;
    }
  }
  return 0;
}

function makeUniqueRowKey(rowByKey: Map<string, unknown>, rawKey: string): string {
  let key = rawKey;
  let suffix = 2;
  while (rowByKey.has(key)) {
    key = `${rawKey}#${suffix}`;
    suffix += 1;
  }
  return key;
}

function makeWorkbookDiffItem(
  artifact: CommonSyncArtifact,
  sheetName: string,
  key: string,
  fieldName: string,
  type: CommonSyncDiffItem['type'],
  sourceVal: string,
  targetVal: string
): CommonSyncDiffItem {
  return {
    id: makeWorkbookDiffId(artifact.key, sheetName, key, fieldName),
    fileType: artifact.key,
    fileName: path.basename(artifact.source),
    sheetName,
    key,
    fieldName,
    type,
    sourceVal,
    targetVal,
  };
}

function makeWorkbookDiffId(fileType: CommonSyncArtifact['key'], sheetName: string, key: string, fieldName: string): string {
  return `${fileType}|${encodeDiffPart(sheetName)}|${encodeDiffPart(key)}|${encodeDiffPart(fieldName)}`;
}

function encodeDiffPart(value: string): string {
  return Buffer.from(value, 'utf-8').toString('base64url');
}

function resolveWorkbookChoice(
  strategy: string,
  decision: { choice: 'source' | 'target' | 'custom'; customValue?: string } | undefined,
  autoChoice: 'source' | 'target'
): 'source' | 'target' | 'custom' {
  if (strategy === 'autoMerge') {
    return autoChoice;
  }
  return decision?.choice ?? autoChoice;
}

function rowToDisplay(row: string[]): string {
  return row.filter((value) => value !== '').join(', ');
}

function appendWorksheet(workbook: XLSX.WorkBook, sheetName: string, worksheet: XLSX.WorkSheet): void {
  XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(sheetName));
}

function sanitizeSheetName(sheetName: string): string {
  return sheetName.replace(/[:\\/?*\[\]]/g, '_').slice(0, 31) || 'Sheet1';
}

function getWorkbookBookType(filePath: string): XLSX.BookType {
  return path.extname(filePath).toLowerCase() === '.xls' ? 'xls' : 'xlsx';
}

