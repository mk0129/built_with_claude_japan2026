import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { checkBundle, checkMarker, checkPageRevision, entryBundles } from './verify-dist.mjs';

const [address, expectedSha, expectedDirectory] = process.argv.slice(2);
if (!address || !expectedSha) throw new Error('Usage: node verify-live.mjs <public-url> <expected-commit> [local-dist]');
assert.match(expectedSha, /^[a-f0-9]{40}$/);
const origin = new URL(address);
const nonce = Date.now().toString();
async function fetchFile(name) {
  const url = new URL('/' + name, origin);
  url.searchParams.set('verify', expectedSha + '-' + nonce);
  const response = await fetch(url, {redirect:'error', cache:'no-store', signal:AbortSignal.timeout(20000)});
  assert.equal(response.status, 200, 'public response for ' + name);
  return Buffer.from(await response.arrayBuffer());
}

checkMarker(JSON.parse((await fetchFile('judge-release.json')).toString('utf8')), expectedSha);
const html = (await fetchFile('')).toString('utf8');
checkPageRevision(html, expectedSha);
const bundles = entryBundles(html);
if (expectedDirectory) {
  const localHtml = await readFile(path.join(expectedDirectory, 'index.html'), 'utf8');
  assert.deepEqual(bundles, entryBundles(localHtml), 'the public page is serving a different build');
}
for (const name of bundles) checkBundle(name, await fetchFile(name));
console.log('Verified anonymous public release ' + expectedSha + ' at ' + origin.origin);
