import * as vscode from 'vscode';

export type DftIdeEnvironment = 'production' | 'development';

const buildEnvironment = process.env.DFT_IDE_BUILD_ENV;

export const DFT_IDE_ENV: DftIdeEnvironment =
  buildEnvironment === 'development' ? 'development' : 'production';

const ENVIRONMENT_DEFAULTS = {
  production: {
    apiBase: 'http://pandas.hisi.huawei.com/dft-ide-server/',
    gitlabHost: 'http://code-dg.hisi.huawei.com/DFT_IDE_PROJECTS',
    obs: {
      page: 'http://pandas.hisi.huawei.com',
      apiBasePath: '/file-system-server-dft',
      aesKey: '3WB4oEodiKFUreBi',
      aesIv: 'aQ5TOzDq4XsumbOn',
    },
  },
  development: {
    apiBase: 'http://10.67.146.169:8000/',
    gitlabHost: 'http://7.227.4.70/test11',
    obs: {
      page: 'https://dmas-beta.hisi.huawei.com',
      apiBasePath: '/file-system-server',
      aesKey: 'lTjLZawOljWaX7VU',
      aesIv: '6IExw50E8lK6qCUa',
    },
  },
} as const;

export const environmentDefaults = ENVIRONMENT_DEFAULTS[DFT_IDE_ENV];

/**
 * Returns an explicitly configured value before the environment default.
 * VS Code's contributed package default is intentionally skipped so a dev
 * build can use development defaults without rewriting package.json.
 */
export function getEnvironmentSetting<T>(
  section: string,
  key: string,
  environmentDefault: T
): T {
  const configuration = vscode.workspace.getConfiguration(section);
  const inspected = configuration.inspect<T>(key);
  const explicitValue =
    inspected?.workspaceFolderValue ??
    inspected?.workspaceValue ??
    inspected?.globalValue;

  return explicitValue ?? environmentDefault;
}
