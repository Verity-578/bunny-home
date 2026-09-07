import path from 'node:path';

import { build } from 'esbuild';

const root = process.cwd();

await build({
  entryPoints: [path.join(root, 'netlify/functions/api.js')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: path.join(root, 'netlify-build/api.cjs'),
  alias: {
    'node:sqlite': path.join(root, 'netlify/empty-sqlite.cjs'),
  },
});

console.log('netlify function bundled');
