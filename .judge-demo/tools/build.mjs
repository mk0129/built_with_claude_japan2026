import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const demo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(process.env.SHIORI_SOURCE_ROOT || path.join(demo, '..'));
const requireSource = createRequire(path.join(repo, 'package.json'));
const esbuild = requireSource('esbuild');
const { compile } = requireSource('@tailwindcss/node');
const { Scanner } = requireSource('@tailwindcss/oxide');
const ts = requireSource('typescript');
const src = path.join(repo, 'src');
const out = path.join(demo, 'dist');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'shiori-ui-'));
const result = path.join(work, 'dist');
const mediaExtensions = ['.png','.jpg','.jpeg','.webp','.gif','.svg','.avif','.ico','.woff','.woff2','.ttf','.otf'];

function revision() {
  const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' });
  const checkout = git.status === 0 ? git.stdout.trim() : undefined;
  const expected = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA;
  if (checkout && expected && checkout !== expected) {
    throw new Error('The checked-out revision does not match the declared deployment revision');
  }
  const commit = checkout || expected;
  if (!/^[a-f\d]{40}$/.test(commit || '')) throw new Error('A full source commit SHA is required');
  return { commit, branch: process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME || undefined };
}

// Apply only the two judge-specific hook/date changes to build-time copies. A
// conflict must fail the candidate instead of compiling stale source files.
function patchModules() {
  const modules = new Map();
  for (const name of ['live.ts', 'healthData.ts']) {
    const relative = path.join('src', 'concept-d', name);
    const original = path.join(repo, relative);
    const temporary = path.join(work, relative);
    fs.mkdirSync(path.dirname(temporary), { recursive: true });
    fs.copyFileSync(original, temporary);
    const patch = path.join(demo, 'patches', name + '.patch');
    const args = ['apply', '--whitespace=nowarn'];
    const run = (...options) => spawnSync('git', [...args, ...options, patch], { cwd: work, encoding: 'utf8' });
    if (run('--check').status === 0) {
      const applying = run();
      if (applying.status !== 0) throw new Error(applying.stderr);
    } else if (run('--reverse', '--check').status !== 0) {
      throw new Error('Cannot apply the demo compatibility patch for ' + relative + '. Reconcile ' + patch + ' with the submitted UI.');
    }
    modules.set(original, fs.readFileSync(temporary, 'utf8'));
  }
  return modules;
}

// Use the actual production layout's CSS imports, including added stylesheets
// and their declared order. Keep the actual UI sources in the submission tree.
function styleEntries() {
  const layout = path.join(src, 'app', '(concept-d)', 'layout.tsx');
  const sourceFile = ts.createSourceFile(layout, fs.readFileSync(layout, 'utf8'), ts.ScriptTarget.Latest, true);
  const entries = sourceFile.statements
    .filter(node => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier))
    .map(node => node.moduleSpecifier.text)
    .filter(spec => spec.endsWith('.css'))
    .map(spec => spec.startsWith('.') ? path.resolve(path.dirname(layout), spec) : spec);
  if (!entries.length) throw new Error('The production layout has no stylesheet entry points; update the judge build');
  return entries;
}

function copyPublicAssets() {
  // public/ contains assets intended by the submission for browser access.
  // Only visual/media resources are eligible; never distribute DBs, logs or credentials.
  const allowed = new Set(mediaExtensions);
  function copy(dir, prefix) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.name.startsWith('.') || item.isSymbolicLink()) continue;
      const file = path.join(dir, item.name);
      const rel = path.join(prefix, item.name);
      if (item.isDirectory()) copy(file, rel);
      else if (item.isFile() && allowed.has(path.extname(item.name).toLowerCase())) {
        const target = path.join(result, rel);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(file, target);
      }
    }
  }
  copy(path.join(repo, 'public'), '');
  // Only the local font subsets/licenses and immutable replay figure WebPs live here.
  fs.cpSync(path.join(demo, 'public'), result, { recursive: true });
}

async function build() {
  const release = revision();
  const patches = patchModules();
  const scan = new Scanner({ sources: [
    { base: src, pattern: '**/*.{js,jsx,ts,tsx}', negated: false },
    { base: path.join(demo, 'app'), pattern: '**/*.{css,js,jsx,ts,tsx,html}', negated: false }
  ]});
  const candidates = scan.scan();
  fs.mkdirSync(result, { recursive: true });
  const imports = [...styleEntries(), './app/main.tsx', './app/judge.css'];
  const bundle = await esbuild.build({
    absWorkingDir: demo,
    stdin: { contents: imports.map(entry => 'import ' + JSON.stringify(entry) + ';').join('\n'), resolveDir: demo, sourcefile: 'judge-entry.ts' },
    outfile: path.join(result, 'judge.js'), bundle: true, platform: 'browser',
    target: 'es2020', charset: 'utf8', minify: true, legalComments: 'none', jsx: 'automatic',
    nodePaths: [path.join(repo, 'node_modules')], write: false,
    loader: Object.fromEntries(mediaExtensions.map(extension => [extension, 'file'])),
    assetNames: 'assets/ui/[name]-[hash]', publicPath: '/',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'submission-judge', setup(build) {
      build.onResolve({filter: /^@\/lib\/api$/}, () => ({ path: path.join(demo, 'app/judge-api.ts') }));
      build.onResolve({filter: /^@judge\/patient-api$/}, () => ({ path: path.join(demo, 'app/judge-patient-api.ts') }));
      build.onResolve({filter: /^@\//}, args => build.resolve(path.join(src, args.path.slice(2)), {kind:args.kind, resolveDir: repo}));
      build.onResolve({filter:/^\//}, args => {
        if (args.kind === 'url-token') return { path: args.path, external: true };
      });
      build.onLoad({filter: /[\\/]src[\\/]concept-d[\\/](live|healthData)\.ts$/}, args => {
        if (patches.has(args.path)) return { contents: patches.get(args.path), loader: 'ts', resolveDir: path.dirname(args.path) };
      });
      build.onLoad({filter: /\.css$/}, async args => {
        let css = fs.readFileSync(args.path, 'utf8');
        // The same fonts are bundled locally to keep the anonymous demo self-contained.
        css = css.replace(/^@import\s+url\(['"]?https:\/\/fonts\.googleapis\.com\/css2\?[^)]+\)\s*;\s*/gm, '');
        if (/@(?:import[^;]*tailwindcss|theme\b|apply\b|utility\b|reference\b)/.test(css)) {
          const compiler = await compile(css, { base: path.dirname(args.path), from: args.path, onDependency(){} });
          css = compiler.build(candidates);
        }
        return { contents: css, loader: args.path.endsWith('.module.css') ? 'local-css' : 'css', resolveDir: path.dirname(args.path) };
      });
    }}]
  });
  // Imports from TSX and relative url() references in CSS are fingerprinted
  // independently of the submission's public/ directory.
  const names = {};
  for (const file of bundle.outputFiles) {
    const ext = path.extname(file.path);
    const relative = path.relative(result, file.path);
    if (relative.startsWith('assets/ui/') && mediaExtensions.includes(ext.toLowerCase())) {
      fs.mkdirSync(path.dirname(file.path), { recursive: true });
      fs.writeFileSync(file.path, file.contents);
      continue;
    }
    if (!['.js','.css'].includes(ext) || path.basename(file.path) !== 'judge'+ext) throw new Error('Unexpected output: '+file.path);
    const stamp = createHash('sha256').update(file.contents).digest('hex').slice(0,12);
    names[ext] = 'judge-' + stamp + ext;
    fs.writeFileSync(path.join(result, names[ext]), file.contents);
  }
  if (!names['.js'] || !names['.css']) throw new Error('Judge client bundles are incomplete');
  const html = fs.readFileSync(path.join(demo, 'app/index.html'), 'utf8')
    .replace('/judge.js', '/'+names['.js']).replace('/judge.css', '/'+names['.css']);
  fs.writeFileSync(path.join(result, 'index.html'), html);
  fs.writeFileSync(path.join(result, 'judge-release.json'), JSON.stringify(release)+'\n');
  copyPublicAssets();
  fs.mkdirSync(path.join(result, 'fixtures'), { recursive:true });
  fs.copyFileSync(path.join(demo, 'app/fixtures/periods.json'), path.join(result, 'fixtures/periods.json'));
  fs.mkdirSync(path.join(result, 'licenses'), { recursive:true });
  fs.copyFileSync(path.join(demo, 'tools/NOTICE.txt'), path.join(result, 'licenses/NOTICE.txt'));
  fs.mkdirSync(out, {recursive:true});
  // out is confined to .judge-demo/dist. Publish only the candidate that built successfully.
  for (const old of fs.readdirSync(out)) fs.rmSync(path.join(out,old), {recursive:true,force:true});
  fs.cpSync(result,out,{recursive:true});
  console.log('Built judge UI from', release.commit, names);
}

try { await build(); } finally { fs.rmSync(work,{recursive:true,force:true}); }
