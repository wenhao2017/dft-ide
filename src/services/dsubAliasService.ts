import { readFile } from 'fs/promises';
import {
  buildCustomDsubCommand,
  DsubAliasOption,
  migrateLegacyClusterSubmission,
  normalizeDsubCommand,
  ResolvedClusterSubmission,
} from '../shared/clusterSubmission';

const ALIAS_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export async function getDsubAliases(projectCshrcPath: string): Promise<DsubAliasOption[]> {
  const content = await readFile(projectCshrcPath, 'utf8');
  return parseProjectCshrc(content);
}

function joinContinuedLines(content: string): string[] {
  const lines: string[] = [];
  let current = '';
  for (const line of content.split(/\r?\n/)) {
    const continued = /\\\s*$/.test(line);
    current += (current ? ' ' : '') + line.replace(/\\\s*$/, '').trim();
    if (!continued) {
      lines.push(current);
      current = '';
    }
  }
  if (current) lines.push(current);
  return lines;
}

function unwrapAliasDefinition(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === "'" || quote === '"') && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function stripCshComment(line: string): string {
  let quote: "'" | '"' | undefined;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === '#') return line.slice(0, index).trimEnd();
  }
  return line;
}

export function parseProjectCshrc(content: string): DsubAliasOption[] {
  const aliasOutput = joinContinuedLines(content)
    .map((line) => stripCshComment(line).trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const match = line.match(/^alias\s+([A-Za-z_][A-Za-z0-9_]*)\s+([\s\S]+)$/);
      if (!match) return '';
      return `${match[1]} ${unwrapAliasDefinition(match[2])}`;
    })
    .filter(Boolean)
    .join('\n');
  return parseCshAliasOutput(aliasOutput);
}

export function parseCshAliasOutput(output: string): DsubAliasOption[] {
  const aliases: DsubAliasOption[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+([\s\S]+)$/);
    if (!match) continue;
    const [, name, definition] = match;
    try {
      const normalized = normalizeDsubCommand(definition);
      aliases.push({
        name,
        definition,
        command: normalized.command,
        originallyInteractive: normalized.originallyInteractive,
      });
    } catch {
      // Only simple, static aliases containing a real `dsub` token are exposed.
    }
  }
  return aliases.sort((left, right) => left.name.localeCompare(right.name));
}

export async function resolveDsubAlias(
  aliasName: string,
  projectCshrcPath: string,
): Promise<ResolvedClusterSubmission> {
  const normalizedName = aliasName.trim();
  if (!ALIAS_NAME_PATTERN.test(normalizedName)) {
    throw new Error('请选择有效的 dsub Alias。');
  }
  const aliases = await getDsubAliases(projectCshrcPath);
  const alias = aliases.find((item) => item.name === normalizedName);
  if (!alias) {
    throw new Error(`Alias “${normalizedName}” 不存在，或它不是受支持的 dsub Alias。`);
  }
  const normalized = normalizeDsubCommand(alias.definition);
  return {
    command: normalized.command,
    group: normalized.group,
    source: 'alias',
    aliasName: normalizedName,
  };
}

export async function attachResolvedClusterSubmission(
  flowConfig: Record<string, unknown> | null,
  legacyModuleConfig: Record<string, unknown> | null,
  scopeKey: string,
  projectCshrcPath: string,
): Promise<Record<string, unknown>> {
  const flowStep2 = flowConfig?.step2 && typeof flowConfig.step2 === 'object'
    ? flowConfig.step2 as Record<string, unknown>
    : undefined;
  const flowTask = flowStep2?.step2Task && typeof flowStep2.step2Task === 'object'
    ? flowStep2.step2Task as Record<string, unknown>
    : undefined;
  const legacyStep2 = legacyModuleConfig?.step2 && typeof legacyModuleConfig.step2 === 'object'
    ? legacyModuleConfig.step2 as Record<string, unknown>
    : undefined;
  const legacyTask = legacyStep2?.step2Task && typeof legacyStep2.step2Task === 'object'
    ? legacyStep2.step2Task as Record<string, unknown>
    : undefined;
  const scopedOverrides = flowStep2?.scopedOverrides && typeof flowStep2.scopedOverrides === 'object'
    ? flowStep2.scopedOverrides as Record<string, unknown>
    : undefined;
  const scopedOverride = scopedOverrides?.[scopeKey] && typeof scopedOverrides[scopeKey] === 'object'
    ? scopedOverrides[scopeKey] as Record<string, unknown>
    : undefined;
  const taskConfig = {
    ...(flowTask ?? {}),
    ...(legacyTask ?? {}),
    ...(scopedOverride ?? {}),
  };
  const cluster = migrateLegacyClusterSubmission(scopedOverride)
    ?? migrateLegacyClusterSubmission(legacyTask)
    ?? migrateLegacyClusterSubmission(flowTask);
  if (!cluster) {
    throw new Error('尚未配置 Donau 集群提交策略，请先进入“工具与集群”完成配置并保存，再运行流水线。');
  }
  if (cluster.mode === 'alias' && !cluster.aliasName.trim()) {
    throw new Error('尚未配置 Donau 集群提交策略，请先进入“工具与集群”选择项目 Alias 并保存，再运行流水线。');
  }

  const resolved = cluster.mode === 'alias'
    ? await resolveDsubAlias(cluster.aliasName, projectCshrcPath)
    : buildCustomDsubCommand(cluster);
  return {
    ...(flowConfig ?? {}),
    step2: {
      ...(flowStep2 ?? {}),
      step2Task: {
        ...(taskConfig ?? {}),
        cluster,
        resolvedDsubCommand: resolved.command,
        resolvedDonauGroup: resolved.group,
      },
    },
  };
}
