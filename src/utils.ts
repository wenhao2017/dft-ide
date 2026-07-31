export function formatTime(time: Date): string {
    const hours = time.getHours().toString().padStart(2, '0');
    const minutes = time.getMinutes().toString().padStart(2, '0');
    const seconds = time.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

export function getVersionFromModuleName(moduleKey: string): string[] {
  let oriModuleKey = '';
  let version = '';
  if (moduleKey.includes('@')) {
    const lastAtPos = moduleKey.lastIndexOf('@');
    oriModuleKey = moduleKey.slice(0, lastAtPos).trim();
    version = moduleKey.slice(lastAtPos + 1).trim();
  }
  return [oriModuleKey, version];
}

export function modifyModuleCfgByVersion(
  flow: 'hibist' | 'sailor' | 'verification',
  content: string,
): string[] {
  let lines = content.split('\n');
  const targetPattern = /^set\s+VERSION\s+\$env\(VERSION\)$/;
  const lineExists = lines.some(line => targetPattern.test(line.trim()));
  if (!lineExists) {
    lines.unshift('set VERSION     $env(VERSION)');
  }
  if (flow !== 'verification') {
    lines = lines.map(line => {
      const workPathRegex = /(-work_path\s+)(\S+)/;
      if (workPathRegex.test(line)) {
        return line.replace(workPathRegex, (match, p1, p2) => {
          if (p2.includes('/$VERSION')) {
            return match;
          }
          const pathWithVersion = p2.replace(/\/?$/, '/$VERSION');
          return `${p1}${pathWithVersion}`;
        });
      }
      return line;
    });
  }
  return lines;
}
