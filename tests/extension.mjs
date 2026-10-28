// Integration smoke test in a new, disposable Chrome profile. No personal browser data is used.
import { createRequire } from 'node:module';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const profile = await mkdtemp(path.join(tmpdir(), 'iconpack-chrome-'));
const extension = path.resolve('extension');
const options = { headless: true, args: ['--enable-unsafe-extension-debugging', '--window-size=1440,1000'], ignoreDefaultArgs: ['--disable-extensions'], acceptDownloads: true, viewport: null };
if (process.env.CHROME_PATH) options.executablePath = process.env.CHROME_PATH;
let context;
try {
  context = await chromium.launchPersistentContext(profile, options);
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: extension });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`chrome-extension://${id}/workspace.html?cid=33`);
  await page.waitForFunction(() => !document.getElementById('loading-state').hidden || !!document.getElementById('collection-title').textContent);
  await page.locator('#loading-state').waitFor({ state: 'hidden', timeout: 35000 });
  assert.equal(await page.locator('#collection-title').innerText(), '手机淘宝图标库', await page.locator('#notice-text').innerText());
  assert.equal(await page.locator('.icon-card').count(), 434);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/extension-live.png' });
  // Exercise every real icon through PNG rasterization, then validate the archive independently.
  await page.locator('#export-details>summary').click();
  await page.locator('[data-format=png]').click();
  await page.locator('#archive-name').fill('Iconpack 导出测试');
  const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
  await page.locator('#download').click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'Iconpack 导出测试.zip');
  await download.saveAs('test-results/live-collection-png.zip');
  assert((await page.locator('#notice-text').innerText()).includes('434'));
  // Reload the extension tab to verify persisted export settings.
  await page.reload(); await page.waitForFunction(() => document.querySelectorAll('.icon-card').length === 434, undefined, { timeout: 35000 });
  assert.equal(await page.locator('[data-format=png]').getAttribute('aria-pressed'), 'true');
  // Test the launcher and background service worker together on the real site.
  const website = await context.newPage();
  await website.goto('https://www.iconfont.cn/collections/detail?cid=33', { waitUntil: 'domcontentloaded' });
  await website.locator('#iconpack-extension-launcher').waitFor();
  const newTabPromise = context.waitForEvent('page');
  await website.evaluate(() => {
    // Closed shadow root is intentionally encapsulated. Click its visible host using coordinates below.
    document.getElementById('iconpack-extension-launcher').scrollIntoView();
  });
  const box = await website.locator('#iconpack-extension-launcher').boundingBox();
  await website.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const workspace = await newTabPromise;
  workspace.on('console', msg => { if (msg.type() === 'warning') console.log(msg.text()); });
  await workspace.waitForURL(`chrome-extension://${id}/workspace.html?cid=33&panel=1`);
  await workspace.waitForFunction(() => sessionStorage.getItem('window-sized') === '1');
  const bounds = await workspace.evaluate(async () => {
    const win = await chrome.windows.getCurrent();
    return { type: win.type, state: win.state, width: win.width, height: win.height, availWidth: screen.availWidth, availHeight: screen.availHeight };
  });
  assert.equal(bounds.type, 'popup'); assert.equal(bounds.state, 'normal');
  assert.equal(bounds.width, Math.min(bounds.availWidth - 24, Math.max(360, Math.round(bounds.availWidth / 3))));
  assert.equal(bounds.height, Math.min(bounds.availHeight - 24, Math.max(400, Math.round(bounds.availHeight * .75))));
  assert.deepEqual(errors, []);
  console.log(`Live extension loaded (${id}); real API, 434 PNG downloads, saved settings and page launcher passed.`);
} finally { if (context) await context.close(); await rm(profile, { recursive: true, force: true }); }
