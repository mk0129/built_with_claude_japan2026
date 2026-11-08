// 公開デモのサーバー関数（api-src/studio.ts）を、依存ごと 1 ファイルに束ねて api/_bundle/studio.cjs に出す。
// Vercel の buildCommand から build.mjs の前に実行する。
import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const demo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = await esbuild.build({
  entryPoints: [path.join(demo, 'api-src', 'studio.ts')],
  outfile: path.join(demo, 'api', '_bundle', 'studio.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: false,
  minify: false,
  legalComments: 'none',
  logLevel: 'warning',
  metafile: true,
});
const bytes = Object.values(result.metafile.outputs).reduce((n, o) => n + o.bytes, 0);
console.log('Bundled judge API function: api/_bundle/studio.cjs (' + Math.round(bytes / 1024) + ' KB)');
