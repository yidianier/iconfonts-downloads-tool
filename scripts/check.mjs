import { readdir, readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const root = new URL('../extension/', import.meta.url);
async function walk(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), path);
    if (entry.isDirectory()) await walk(url);
    else if (entry.name.endsWith('.js')) execFileSync(process.execPath, ['--check', url.pathname], { stdio: 'inherit' });
  }
}
await walk(root);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
for (const file of [manifest.background.service_worker, ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap(script => script.js), 'workspace.html', 'workspace.css', 'compact.css', 'workspace.js']) await access(new URL(file, root));
if (manifest.manifest_version !== 3) throw new Error('Requires Manifest V3');
console.log('All extension JavaScript and manifest resources checked.');
