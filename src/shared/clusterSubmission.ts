export interface DsubAliasOption {
  name: string;
  definition: string;
  command: string;
  originallyInteractive: boolean;
}

export type ClusterSubmissionMode = 'alias' | 'custom';

export interface AliasClusterSubmissionConfig {
  mode: 'alias';
  aliasName: string;
}

export interface CustomClusterSubmissionConfig {
  mode: 'custom';
  group: string;
  queue: string;
  cpu: string;
  memory: string;
  extraArgs: string;
}

export type ClusterSubmissionConfig =
  | AliasClusterSubmissionConfig
  | CustomClusterSubmissionConfig;

export interface ResolvedClusterSubmission {
  command: string;
  group?: string;
  source: ClusterSubmissionMode;
  aliasName?: string;
}

export interface DonauSubmissionOverride {
  group?: string;
  queue?: string;
  cpu?: string;
  mem?: string;
}

const SAFE_SHELL_WORD = /^[A-Za-z0-9_./:@%+=,-]+$/;
const UNSAFE_UNQUOTED_CHARACTERS = new Set([';', '|', '&', '<', '>', '`', '\n', '\r']);

export function tokenizeShellWords(input: string): string[] {
  const words: string[] = [];
  let current = '';
  let quote: "'" | '"' | undefined;
  let escaped = false;
  let hasToken = false;

  for (const character of input.trim()) {
    if (escaped) {
      current += character;
      hasToken = true;
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaped = true;
      hasToken = true;
      continue;
    }
    if (quote) {
      if (character === quote) {
        quote = undefined;
      } else {
        current += character;
      }
      hasToken = true;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      hasToken = true;
      continue;
    }
    if (/\s/.test(character)) {
      if (hasToken) {
        words.push(current);
        current = '';
        hasToken = false;
      }
      continue;
    }
    if (UNSAFE_UNQUOTED_CHARACTERS.has(character)) {
      throw new Error(`不支持的 Shell 控制字符：${character}`);
    }
    current += character;
    hasToken = true;
  }

  if (escaped || quote) {
    throw new Error('命令中存在未闭合的引号或转义符。');
  }
  if (hasToken) {
    words.push(current);
  }
  return words;
}

export function renderShellWords(words: string[]): string {
  return words.map((word) => {
    if (SAFE_SHELL_WORD.test(word)) return word;
    return `'${word.replace(/'/g, `'\\''`)}'`;
  }).join(' ');
}

export function normalizeDsubCommand(definition: string): {
  command: string;
  group?: string;
  originallyInteractive: boolean;
} {
  const words = tokenizeShellWords(definition);
  const dsubIndex = words.findIndex((word) => word === 'dsub');
  if (dsubIndex !== 0) {
    throw new Error('Alias 必须以独立的 dsub 命令开头。');
  }

  const dsubWords = words.slice(dsubIndex);
  const originallyInteractive = dsubWords.includes('-I');
  if (!originallyInteractive) {
    dsubWords.splice(1, 0, '-I');
  }
  const accountIndex = dsubWords.indexOf('-A');
  const group = accountIndex >= 0 ? dsubWords[accountIndex + 1] : undefined;
  return {
    command: renderShellWords(dsubWords),
    group,
    originallyInteractive,
  };
}

export function buildCustomDsubCommand(
  config: CustomClusterSubmissionConfig,
): ResolvedClusterSubmission {
  const group = config.group.trim();
  const queue = config.queue.trim();
  if (!group) throw new Error('请选择或填写 Donau 用户组。');
  if (!queue) throw new Error('请选择或填写 Donau 队列。');

  const resources = [
    config.memory.trim() ? `mem=${config.memory.trim()}` : '',
    config.cpu.trim() ? `cpu=${config.cpu.trim()}` : '',
  ].filter(Boolean);
  const words = ['dsub', '-I', '-A', group, '-q', queue];
  if (resources.length) {
    words.push('-R', resources.join(';'));
  }
  const extraWords = tokenizeShellWords(config.extraArgs);
  words.push(...extraWords);
  return {
    command: renderShellWords(words),
    group,
    source: 'custom',
  };
}

export function applyDsubCommandOverrides(
  baseCommand: string,
  override: DonauSubmissionOverride | undefined,
): { command: string; group?: string; overridden: boolean } {
  const normalized = normalizeDsubCommand(baseCommand);
  const words = tokenizeShellWords(normalized.command);
  const values = {
    group: String(override?.group ?? '').trim(),
    queue: String(override?.queue ?? '').trim(),
    cpu: String(override?.cpu ?? '').trim(),
    mem: String(override?.mem ?? '').trim(),
  };
  const overridden = Object.values(values).some(Boolean);
  if (!overridden) {
    return {
      command: normalized.command,
      group: normalized.group,
      overridden: false,
    };
  }

  const upsertOption = (option: string, value: string) => {
    if (!value) return;
    const index = words.indexOf(option);
    if (index >= 0 && index + 1 < words.length) {
      words[index + 1] = value;
    } else {
      words.push(option, value);
    }
  };
  upsertOption('-A', values.group);
  upsertOption('-q', values.queue);

  if (values.cpu || values.mem) {
    const resourceIndex = words.indexOf('-R');
    const currentResources = resourceIndex >= 0 && resourceIndex + 1 < words.length
      ? words[resourceIndex + 1].split(';').map((item) => item.trim()).filter(Boolean)
      : [];
    const resources = currentResources.filter((item) => {
      if (values.cpu && /^cpu\s*=/.test(item)) return false;
      if (values.mem && /^mem\s*=/.test(item)) return false;
      return true;
    });
    if (values.mem) resources.push(`mem=${values.mem}`);
    if (values.cpu) resources.push(`cpu=${values.cpu}`);
    if (resourceIndex >= 0 && resourceIndex + 1 < words.length) {
      words[resourceIndex + 1] = resources.join(';');
    } else {
      words.push('-R', resources.join(';'));
    }
  }

  const accountIndex = words.indexOf('-A');
  return {
    command: renderShellWords(words),
    group: accountIndex >= 0 ? words[accountIndex + 1] : undefined,
    overridden: true,
  };
}

export function readClusterSubmissionConfig(value: unknown): ClusterSubmissionConfig | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.mode === 'alias') {
    return {
      mode: 'alias',
      aliasName: String(record.aliasName ?? '').trim(),
    };
  }
  if (record.mode === 'custom') {
    return {
      mode: 'custom',
      group: String(record.group ?? '').trim(),
      queue: String(record.queue ?? '').trim(),
      cpu: String(record.cpu ?? '').trim(),
      memory: String(record.memory ?? '').trim(),
      extraArgs: String(record.extraArgs ?? '').trim(),
    };
  }
  return undefined;
}

export function migrateLegacyClusterSubmission(
  taskConfig: Record<string, unknown> | undefined,
): ClusterSubmissionConfig | undefined {
  const current = readClusterSubmissionConfig(taskConfig?.cluster);
  if (current) return current;
  const group = String(taskConfig?.clusterGroup ?? '').trim();
  const queue = String(taskConfig?.clusterQueue ?? '').trim();
  const cpu = String(taskConfig?.cpu ?? '').trim();
  const memory = String(taskConfig?.memory ?? '').trim();
  const extraArgs = String(taskConfig?.clusterExtra ?? '').trim();
  if (!group && !queue && !cpu && !memory && !extraArgs) return undefined;
  return {
    mode: 'custom',
    group,
    queue,
    cpu,
    memory,
    extraArgs,
  };
}
