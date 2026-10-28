// Run with Playwright installed locally, or set PLAYWRIGHT_MODULE to its absolute entry path.
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve('extension');
const output = path.resolve('test-results');
await mkdir(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try { const data = await readFile(file); res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(data); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const launchOptions = { headless: true };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" style="width:1em;height:1em;fill:currentColor"><path d="M128 128h768v768H128z" fill="#ff6600"/></svg>';
const fixture = { code: 200, data: { collection: { name: '通用测试库', icons_count: 3 }, creator: { nickname: '测试作者' }, icons: [{ id: 1, name: 'star', show_svg: svg }, { id: 2, name: '重复/图标', show_svg: svg }, { id: 3, name: '重复/图标', show_svg: svg }] } };
const real = process.env.ICONFONT_FIXTURE ? JSON.parse(await readFile(process.env.ICONFONT_FIXTURE, 'utf8')) : fixture;
await page.route('https://www.iconfont.cn/api/collection/detail.json?*', async route => {
  const id = new URL(route.request().url()).searchParams.get('id');
  let data = fixture;
  if (id === '33') data = real;
  if (id === '902') data = { code: 200, data: { collection: { name: '空库' }, icons: [] } };
  if (id === '903') data = { code: 200, data: { collection: { icons_count: 10 }, icons: [] } };
  if (id === '904') { await route.fulfill({ body: '<html>验证</html>' }); return; }
  if (id === '905') { await new Promise(resolve => setTimeout(resolve, 1500)); }
  if (id === '906') data = { code: 200, data: { ...fixture.data, icons: [...fixture.data.icons.slice(0, 2), { id: 3, name: '损坏的图标', show_svg: '<svg' }] } };
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
});
async function waitText(selector, text) { await page.waitForFunction(({ selector, text }) => document.querySelector(selector)?.textContent.includes(text), { selector, text }); }
async function openDetails(id) { if (!await page.locator(`#${id}`).evaluate(el => el.open)) await page.locator(`#${id}>summary`).click(); }
async function load(id) { await openDetails('source-details'); await page.locator('#source-input').fill(id); await page.locator('#load-button').click(); await page.locator('#loading-state').waitFor({ state: 'hidden' }); }
async function download(name) { const pending = page.waitForEvent('download'); await page.locator('#download').click(); const file = await pending; const saved = path.join(output, name); await file.saveAs(saved); return saved; }

try {
  await page.goto(`${base}/workspace.html`);
  assert(await page.locator('#empty-state').isVisible());
  assert(await page.locator('#download').isDisabled());
  await load('https://example.com/collections/detail?cid=900'); await waitText('#notice-text', 'iconfont');
  await load('900'); await waitText('#collection-title', '通用测试库');
  assert.equal(await page.locator('.icon-card').count(), 3);
  assert.equal(await page.locator('#selection-number').innerText(), '3');
  await page.locator('#clear').click(); assert(await page.locator('#download').isDisabled());
  await page.locator('#search').fill('star'); assert.equal(await page.locator('.icon-card').count(), 1);
  await page.locator('#select-all').check(); assert.equal(await page.locator('#selection-number').innerText(), '1');
  await page.locator('#search').fill(''); await page.locator('#invert').click(); assert.equal(await page.locator('#selection-number').innerText(), '2');
  await page.locator('#selected-only').check(); assert.equal(await page.locator('.icon-card').count(), 2);
  await page.locator('#selected-only').uncheck(); await page.locator('#select-all').check();
  const svgArchive = await download('test-svg.zip');
  execFileSync('python3', ['-c', 'import sys,zipfile,json; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; m=json.loads(z.read("manifest.json")); assert m["exportedCount"]==3; assert len(z.namelist())==5; s=z.read("icons/star-1.svg").decode(); import xml.etree.ElementTree as ET; assert ET.fromstring(s).get("width")=="128" and "1em" not in s; assert "#ff6600" in s', svgArchive]);
  await openDetails('export-details');
  await page.locator('[data-format=png]').click(); await page.locator('#size').selectOption('256');
  await page.locator('#color-mode').selectOption('custom');
  await page.locator('#archive-name').fill('我的图标包.zip');
  const pngArchive = await download('test-png.zip');
  execFileSync(process.env.PIL_PYTHON || 'python3', ['-c', 'import sys,zipfile,io; from PIL import Image; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; im=Image.open(io.BytesIO(z.read("icons/star-1.png"))).convert("RGBA"); assert im.size==(256,256); assert im.getpixel((0,0))[3]==0; assert im.getpixel((128,128))==(61,99,233,255)', pngArchive]);
  // Exercise the XML sanitization and preservation paths in a real browser DOM.
  const sanitation = await page.evaluate(async () => {
    const { prepareSvg } = await import('./lib/svg.js');
    const input = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" onload="alert(1)"><script>alert(1)</script><foreignObject/><image href="https://evil.example/img"/><defs><linearGradient id="a"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><path fill="url(#a)" d="M0 0h24v24z"/><use xlink:href="https://evil.example"/><path style="fill:green;stroke:none" d="M1 1h2v2z"/></svg>';
    return prepareSvg({ svg: input });
  });
  assert(!/script|onload|foreignObject|evil\.example/.test(sanitation)); assert(sanitation.includes('linearGradient')); assert(sanitation.includes('fill="green"'));
  await load('906');
  await openDetails('export-details');
  await page.locator('[data-format=svg]').click();
  const partialArchive = await download('test-partial.zip'); await waitText('#notice-text', '失败 1');
  execFileSync('python3', ['-c', 'import sys,zipfile,json; z=zipfile.ZipFile(sys.argv[1]); m=json.loads(z.read("manifest.json")); assert m["exportedCount"]==2; assert len(m["failures"])==1', partialArchive]);
  await page.locator('#retry-failed').click(); assert.equal(await page.locator('#selection-number').innerText(), '1');
  await load('903'); await waitText('#notice-text', '0 / 10'); await waitText('#collection-title', '通用测试库');
  await load('904'); await waitText('#notice-text', '验证');
  await openDetails('source-details'); await page.locator('#source-input').fill('905'); await page.locator('#load-button').click(); await page.locator('#cancel-load').click(); await waitText('#notice-text', '已取消读取');
  await load('902'); assert(await page.locator('#download').isDisabled());
  await load('900');
  await openDetails('export-details');
  await page.locator('#size').selectOption('1024'); await page.locator('[data-format=png]').click();
  await page.locator('#download').click(); await page.locator('#cancel-export').click(); await waitText('#notice-text', '已取消导出');
  await load('33'); await openDetails('export-details'); await page.locator('[data-format=svg]').click(); await page.locator('#color-mode').selectOption('original'); await page.locator('#size').selectOption('128');
  await page.locator('#archive-name').fill('');
  await page.locator('#export-details>summary').click();
  const count = real.data.icons.length;
  assert.equal(await page.locator('.icon-card').count(), count);
  await page.waitForFunction(() => [...document.images].filter(im => im.loading !== 'lazy' || im.getBoundingClientRect().top < innerHeight).every(im => im.complete));
  assert.equal(await page.locator('.icon-card img').evaluateAll(images => images.filter(im => im.complete && !im.naturalWidth).length), 0);
  await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: false });
  const realArchive = await download('real-collection-svg.zip');
  execFileSync('python3', ['-c', `import sys,zipfile,json; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; m=json.loads(z.read("manifest.json")); assert m["exportedCount"]==${count}; assert len(z.namelist())==${count + 2}`, realArchive]);
  await page.setViewportSize({ width: 480, height: 720 }); await page.locator('#notice-close').click();
  await page.screenshot({ path: path.join(output, 'compact.png') });
  assert(await page.locator('#download').isVisible());
  const gridColumns = await page.locator('#icon-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  assert(gridColumns >= 5);
  await openDetails('export-details');
  await page.screenshot({ path: path.join(output, 'compact-settings.png') });
  await page.setViewportSize({ width: 360, height: 540 }); await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log(`Browser checks passed, including ${count} real-data icons. Screenshots and ZIP archives: ${output}`);
} finally { await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve)); }
