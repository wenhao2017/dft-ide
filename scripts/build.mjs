import * as esbuild from 'esbuild';

const args = new Set(process.argv.slice(2));
const environment = args.has('--env=development') ? 'development' : 'production';
const watch = args.has('--watch');
const requestedTarget = [...args]
  .find((arg) => arg.startsWith('--target='))
  ?.slice('--target='.length);

const targets = {
  ext: {
    entryPoints: ['src/extension.ts'],
    outfile: 'out/extension.js',
    format: 'cjs',
    platform: 'node',
    external: ['vscode'],
  },
  webview: {
    entryPoints: ['src/webview/main.tsx'],
    outfile: 'out/webview.js',
    format: 'iife',
    platform: 'browser',
    loader: { '.tsx': 'tsx', '.ts': 'tsx' },
  },
  worker: {
    entryPoints: ['src/services/commonWorkbookWorker.ts'],
    outfile: 'out/commonWorkbookWorker.js',
    format: 'cjs',
    platform: 'node',
  },
};

const selectedTargets = requestedTarget
  ? [[requestedTarget, targets[requestedTarget]]]
  : Object.entries(targets);

if (selectedTargets.some(([, options]) => !options)) {
  throw new Error(`Unknown build target: ${requestedTarget}`);
}

const sharedOptions = {
  bundle: true,
  sourcemap: true,
  define: {
    'process.env.DFT_IDE_BUILD_ENV': JSON.stringify(environment),
  },
};

if (watch) {
  const contexts = await Promise.all(
    selectedTargets.map(([, options]) => esbuild.context({ ...sharedOptions, ...options }))
  );
  await Promise.all(contexts.map((context) => context.watch()));
  console.log(`[DFT IDE] Watching ${environment} build...`);
} else {
  await Promise.all(
    selectedTargets.map(([, options]) => esbuild.build({ ...sharedOptions, ...options }))
  );
}
