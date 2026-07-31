import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  buildCustomDsubCommand,
  DsubAliasOption,
  migrateLegacyClusterSubmission,
  normalizeDsubCommand,
  ResolvedClusterSubmission,
} from '../shared/clusterSubmission';

const execFileAsync = promisify(execFile);
const ALIAS_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export async function getDsubAliases(shellPath = 'csh'): Promise<DsubAliasOption[]> {
  const { stdout } = await execFileAsync(shellPath, ['-c', 'alias'], {
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
    encoding: 'utf8',
  });
  return parseCshAliasOutput(stdout);
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
  shellPath = 'csh',
): Promise<ResolvedClusterSubmission> {
  const normalizedName = aliasName.trim();
  if (!ALIAS_NAME_PATTERN.test(normalizedName)) {
    throw new Error('请选择有效的 dsub Alias。');
  }
  const aliases = await getDsubAliases(shellPath);
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
  shellPath = 'csh',
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
  const taskConfig = {
    ...(legacyTask ?? {}),
    ...(flowTask ?? {}),
  };
  const cluster = migrateLegacyClusterSubmission(flowTask)
    ?? migrateLegacyClusterSubmission(legacyTask);
  if (!cluster) {
    throw new Error('尚未配置 Donau 集群提交策略，请先进入“工具与集群”完成配置并保存，再运行流水线。');
  }
  if (cluster.mode === 'alias' && !cluster.aliasName.trim()) {
    throw new Error('尚未配置 Donau 集群提交策略，请先进入“工具与集群”选择个人 Alias 并保存，再运行流水线。');
  }

  const resolved = cluster.mode === 'alias'
    ? await resolveDsubAlias(cluster.aliasName, shellPath)
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
