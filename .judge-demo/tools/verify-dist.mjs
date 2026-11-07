import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const bundleName = /^judge-([a-f0-9]{12})\.(js|css)$/;
// The app's public directory can gain new image/font paths as the UI evolves.
const visualAsset = /\.(?:webp|png|jpe?g|gif|svg|avif|ico|woff2?|ttf|otf)$/i;
const fontLicense = /^fonts\/[\w.-]*(?:license|ofl)[\w.-]*\.txt$/i;
const fixedFiles = new Set(['index.html', 'judge-release.json', 'fixtures/periods.json', 'licenses/NOTICE.txt']);

export function checkMarker(release, expectedSha) {
  assert.match(release.commit, /^[a-f0-9]{40}$/, 'release must name a full Git commit');
  if (expectedSha) assert.equal(release.commit, expectedSha, 'release commit does not match the checked-out revision');
}

export function checkPageRevision(html, expectedSha) {
  const match = html.match(/<meta\s+name="shiori-source-commit"\s+content="([0-9a-f]{40})"\s*\/?>/i);
  assert.equal(match?.[1], expectedSha, 'the entry page does not match the release commit');
}

export function entryBundles(html) {
  const links = [...html.matchAll(/(?:src|href)="\/(judge-[a-f0-9]{12}\.(?:css|js))"/g)].map(match => match[1]);
  assert.equal(links.filter(link => link.endsWith('.js')).length, 1, 'expected one fingerprinted script in index.html');
  assert.equal(links.filter(link => link.endsWith('.css')).length, 1, 'expected one fingerprinted stylesheet in index.html');
  return links;
}

export function checkBundle(name, data) {
  const [, expectedHash] = name.match(bundleName);
  const digest = createHash('sha256').update(data).digest('hex');
  assert.equal(digest.slice(0, 12), expectedHash, 'bundle contents do not match filename ' + name);
}

async function publishedFiles(root, directory = '') {
  const names = [];
  for (const entry of await readdir(path.join(root, directory), {withFileTypes:true})) {
    const name = [directory, entry.name].filter(Boolean).join('/');
    assert.ok(!entry.name.startsWith('.'), 'hidden publish path: ' + name);
    if (entry.isDirectory()) {
      names.push(...await publishedFiles(root, name));
    } else {
      assert.ok(entry.isFile(), 'links and special files are not distributable: ' + name);
      assert.ok(fixedFiles.has(name) || bundleName.test(name) || visualAsset.test(name) || fontLicense.test(name),
        'unexpected publish file: ' + name);
      names.push(name);
    }
  }
  return names;
}

export async function verifyDist(directory, expectedSha) {
  assert.ok((await lstat(directory)).isDirectory(), 'output must be a directory');
  const files = new Set(await publishedFiles(directory));
  for (const name of fixedFiles) assert.ok(files.has(name), 'missing public file: ' + name);
  const html = await readFile(path.join(directory, 'index.html'), 'utf8');
  const bundles = entryBundles(html);
  for (const name of files) {
    if (bundleName.test(name)) assert.ok(bundles.includes(name), 'unreferenced bundle left in output: ' + name);
  }
  for (const name of bundles) checkBundle(name, await readFile(path.join(directory, name)));

  const release = JSON.parse(await readFile(path.join(directory, 'judge-release.json'), 'utf8'));
  checkMarker(release, expectedSha);
  checkPageRevision(html, release.commit);
  const periods = JSON.parse(await readFile(path.join(directory, 'fixtures/periods.json'), 'utf8'));
  assert.ok(Object.keys(periods).some(key => /^\d{4}-\d\d-\d\d\/\d{4}-\d\d-\d\d$/.test(key)),
    'fictional consultation periods are missing');
  console.log('Verified ' + files.size + ' public artifacts for ' + release.commit);
  return { release, bundles };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [directory, expectedSha] = process.argv.slice(2);
  if (!directory) throw new Error('Usage: node verify-dist.mjs <dist-directory> [expected-commit]');
  await verifyDist(directory, expectedSha || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA);
}
