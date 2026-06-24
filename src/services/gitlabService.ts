export function getGitlabHost(): string | undefined {
    const configured = (window as unknown as { DFT_IDE_GITLAB_HOST?: string }).DFT_IDE_GITLAB_HOST;
    return configured?.replace(/\/+$/, '') ?? undefined;
  }
