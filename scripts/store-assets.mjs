// Render store artwork from the actual compact extension UI, using an API fixture.
import { createRequire } from 'node:module';
import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
if (!process.env.ICONFONT_FIXTURE) throw new Error('Set ICONFONT_FIXTURE to a collection API response JSON file.');
const fixture = await readFile(process.env.ICONFONT_FIXTURE, 'utf8');
const root = path.resolve('extension');
await mkdir('store/assets', { recursive: true });
const server = createServer(async (req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type }); res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const options = { headless: true };
if (process.env.CHROME_PATH) options.executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch(options);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await page.route('https://www.iconfont.cn/api/collection/detail.json?*', route => route.fulfill({ contentType: 'application/json', body: fixture }));
  await page.setContent(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#f1f4fc;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#27324a}body:before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 80% 40%,#e1e8ff,transparent 65%)}.copy{position:absolute;top:150px;left:82px;width:460px}.brand{font-size:23px;font-weight:750;letter-spacing:-1px;color:#3d63e9;margin-bottom:50px}h1{font-size:43px;letter-spacing:-1.5px;line-height:1.45;font-weight:650;margin:0 0 20px}.sub{font-size:15px;line-height:1.9;color:#8b97ae;margin-bottom:35px}.chips{display:flex;gap:10px}.chips span{background:white;border:1px solid #dfe5f6;padding:9px 13px;border-radius:8px;font-size:12px;color:#6478a5}.foot{margin-top:70px;font-size:11px;letter-spacing:1px;color:#98a5bf}.window{position:absolute;right:100px;top:36px;border:1px solid #d9e1f5;border-radius:12px;overflow:hidden;box-shadow:0 20px 65px #5a77bb20;width:482px;background:#fff}.bar{height:28px;display:flex;align-items:center;gap:5px;padding:0 11px;background:#fff;border-bottom:1px solid #e8ecf5}.bar i{width:7px;height:7px;border-radius:50%;background:#dde3f0}.bar span{font-size:9px;color:#a0abc0;margin-left:150px}iframe{display:block;width:480px;height:696px;border:0}</style><div class="copy"><div class="brand">▦ Iconpack.</div><h1>小窗口，<br>整库带走。</h1><div class="sub">iconfont 图标库批量下载<br>选择你需要的图标，一次打包。</div><div class="chips"><span>SVG / PNG</span><span>自由选择</span><span>本地 ZIP</span></div><div class="foot">COMPACT WORKSPACE. COMPLETE COLLECTION.</div></div><div class="window"><div class="bar"><i></i><i></i><i></i><span>Iconpack</span></div><iframe id="preview" src="${base}/workspace.html?cid=33"></iframe></div></html>`);
  const frame = page.frameLocator('#preview');
  await frame.locator('#collection-title').filter({ hasText: '手机淘宝' }).waitFor();
  await frame.locator('.icon-card').first().waitFor();
  await page.screenshot({ path: 'store/assets/screenshot-01.png' });
  await frame.locator('#export-details>summary').click();
  await frame.locator('[data-format=png]').click(); await frame.locator('#size').selectOption('256');
  await frame.locator('#archive-name').fill('项目图标资源');
  await page.locator('h1').evaluate(el => { el.innerHTML = '按你的规格，<br>导出每一个。'; });
  await page.locator('.sub').evaluate(el => { el.innerHTML = '格式、尺寸、颜色、压缩包名称<br>一处设置，批量导出。'; });
  await page.screenshot({ path: 'store/assets/screenshot-02.png' });
  await page.setViewportSize({ width: 440, height: 280 });
  await page.setContent('<style>*{box-sizing:border-box}body{margin:0;width:440px;height:280px;background:#3d63e9;color:white;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;padding:37px}b{display:block;font-size:24px;letter-spacing:-1px;margin-bottom:24px}h1{font-size:28px;margin:0 0 18px;letter-spacing:-.5px}p{font-size:12px;opacity:.7;letter-spacing:1px}</style><b>▦ Iconpack.</b><h1>图标库，一键打包。</h1><p>SVG / PNG · 自定义规格 · ZIP</p>');
  await page.screenshot({ path: 'store/assets/promo-440x280.png' });
  await copyFile('extension/icons/128.png', 'store/assets/icon-128.png');
  console.log('Store assets generated: 2 screenshots (1280×800), promo (440×280), icon (128×128).');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
