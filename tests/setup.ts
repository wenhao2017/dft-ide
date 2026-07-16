import { vi } from 'vitest';
import * as path from 'path';

// Mock workspace state & global state
export const mockWorkspaceState = new Map<string, any>();
export const mockGlobalState = new Map<string, any>();

// In-memory mock filesystem
export const mockFilesystem = new Map<string, string>();

// Clean filesystem helper
export function resetMockFilesystem() {
  mockFilesystem.clear();
  mockWorkspaceState.clear();
  mockGlobalState.clear();
}

// Simple mock for vscode
const vscodeMock = {
  Uri: {
    file: (fsPath: string) => ({
      fsPath: path.resolve(fsPath),
      path: path.resolve(fsPath),
      scheme: 'file',
      toString: () => `file://${path.resolve(fsPath)}`
    }),
    parse: (url: string) => {
      const parts = url.split('://');
      const fsPath = parts[1] || url;
      return {
        scheme: parts[0] || 'file',
        path: fsPath,
        fsPath: fsPath,
        toString: () => url
      };
    }
  },
  FileType: {
    Unknown: 0,
    File: 1,
    Directory: 2,
    SymbolicLink: 64
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3
  },
  workspace: {
    workspaceFolders: [
      {
        uri: { fsPath: '/mock/project/root/common', path: '/mock/project/root/common', scheme: 'file' },
        name: 'common',
        index: 0
      },
      {
        uri: { fsPath: '/mock/project/root/hibist', path: '/mock/project/root/hibist', scheme: 'file' },
        name: 'hibist',
        index: 1
      },
      {
        uri: { fsPath: '/mock/project/root/sailor', path: '/mock/project/root/sailor', scheme: 'file' },
        name: 'sailor',
        index: 2
      },
      {
        uri: { fsPath: '/mock/project/root/verification', path: '/mock/project/root/verification', scheme: 'file' },
        name: 'verification',
        index: 3
      }
    ],
    name: 'mock-workspace',
    getConfiguration: (section?: string) => {
      const store = new Map<string, any>([
        ['dftIde.obs.page', 'https://obs.test.com'],
        ['dftIde.obs.groupName', 'test-group'],
        ['dftIde.obs.aesKey', '1234567890123456'],
        ['dftIde.obs.aesIv', '1234567890123456'],
        ['dftIde.obs.getSpaceTokenPath', '/api/token'],
        ['dftIde.obs.viewerUrlTemplate', '{obsPage}?spaceName={spaceName}&spaceToken={spaceToken}&w3id={w3id}'],
        ['dftIde.obs.w3id', 'w3-test-id'],
        ['dftIde.obs.spaceName', ''],
        ['dftIde.layout.hideMenuBar', true],
        ['dftIde.layout.hideActivityBar', true]
      ]);
      return {
        get: (key: string, defaultValue?: any) => {
          const fullKey = section ? `${section}.${key}` : key;
          return store.has(fullKey) ? store.get(fullKey) : defaultValue;
        },
        update: vi.fn(async (key: string, value: any) => {
          const fullKey = section ? `${section}.${key}` : key;
          store.set(fullKey, value);
        }),
        inspect: (key: string) => {
          const fullKey = section ? `${section}.${key}` : key;
          return {
            globalValue: store.get(fullKey)
          };
        }
      };
    },
    fs: {
      createDirectory: vi.fn(async () => {}),
      stat: vi.fn(async (uri: any) => {
        const filePath = path.resolve(uri.fsPath);
        // If it exists as a file key or directory key
        if (mockFilesystem.has(filePath)) {
          const content = mockFilesystem.get(filePath)!;
          return {
            type: 1, // File
            mtime: Date.now(),
            size: Buffer.byteLength(content)
          };
        }
        // Check if there are keys starting with filePath + '/' (indicating a directory exists)
        const prefix = filePath.endsWith(path.sep) ? filePath : filePath + path.sep;
        const existsAsDir = [...mockFilesystem.keys()].some(k => k.startsWith(prefix));
        if (existsAsDir) {
          return {
            type: 2, // Directory
            mtime: Date.now(),
            size: 0
          };
        }
        throw new Error('File not found: ' + filePath);
      }),
      readFile: vi.fn(async (uri: any) => {
        const filePath = path.resolve(uri.fsPath);
        if (!mockFilesystem.has(filePath)) {
          throw new Error('File not found: ' + filePath);
        }
        const content = mockFilesystem.get(filePath)!;
        return Buffer.from(content, 'utf-8');
      }),
      writeFile: vi.fn(async (uri: any, content: Uint8Array) => {
        const filePath = path.resolve(uri.fsPath);
        mockFilesystem.set(filePath, Buffer.from(content).toString('utf-8'));
      }),
      readDirectory: vi.fn(async (uri: any) => {
        const dirPath = path.resolve(uri.fsPath);
        const prefix = dirPath.endsWith(path.sep) ? dirPath : dirPath + path.sep;
        
        const children = new Map<string, number>(); // name -> type (1 for file, 2 for dir)
        for (const k of mockFilesystem.keys()) {
          if (k.startsWith(prefix)) {
            const relative = k.slice(prefix.length);
            const part = relative.split(path.sep)[0];
            if (part) {
              if (relative.includes(path.sep)) {
                children.set(part, 2); // Directory
              } else {
                children.set(part, 1); // File
              }
            }
          }
        }
        return [...children.entries()];
      }),
      rename: vi.fn(async (source: any, target: any) => {
        const srcPath = path.resolve(source.fsPath);
        const tgtPath = path.resolve(target.fsPath);
        if (!mockFilesystem.has(srcPath)) {
          throw new Error('Source file not found: ' + srcPath);
        }
        mockFilesystem.set(tgtPath, mockFilesystem.get(srcPath)!);
        mockFilesystem.delete(srcPath);
      }),
      delete: vi.fn(async (uri: any) => {
        const filePath = path.resolve(uri.fsPath);
        mockFilesystem.delete(filePath);
      })
    }
  },
  window: {
    showInformationMessage: vi.fn(async (msg: string) => msg),
    showWarningMessage: vi.fn(async (msg: string) => msg),
    showQuickPick: vi.fn(async (items: string[]) => items[0]),
    createTerminal: vi.fn((name: string) => ({
      show: vi.fn(),
      sendText: vi.fn()
    }))
  },
  env: {
    clipboard: {
      writeText: vi.fn(async (text: string) => {
        mockGlobalState.set('clipboard', text);
      })
    },
    openExternal: vi.fn(async (uri: any) => true)
  },
  languages: {
    createDiagnosticCollection: vi.fn(() => ({
      clear: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      forEach: vi.fn(),
      get: vi.fn(),
      has: vi.fn(),
      dispose: vi.fn(),
    }))
  },
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3
  },
  commands: {
    executeCommand: vi.fn(async (command: string, ...args: any[]) => {})
  }
};

vi.mock('vscode', () => vscodeMock);
