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
