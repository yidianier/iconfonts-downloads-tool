import { parseCollectionId, normalizeCollection, archiveFilename, iconFilename } from './lib/core.js';
import { prepareSvg, svgDataUrl, renderPng } from './lib/svg.js';
import { createZip } from './lib/zip.js';

const $ = id => document.getElementById(id);
function updateLayout() { document.body.classList.toggle('compact', new URLSearchParams(location.search).has('panel') || innerWidth <= 1100); }
updateLayout();
window.addEventListener('resize', updateLayout);
if (new URLSearchParams(location.search).has('panel')) document.querySelector('.brand').href = 'workspace.html?panel=1';
const state = { collection: null, selected: new Set(), query: '', selectedOnly: false, format: 'svg', size: 128, colorMode: 'original', color: '#3d63e9', loading: false, exporting: false, failed: [] };
let loadController, exportController;
const previews = new Map();
const idle = () => new Promise(resolve => setTimeout(resolve, 0));
const color = () => state.colorMode === 'custom' ? state.color : null;

function notice(message, type = '', retry = false) {
  $('notice').hidden = !message;
  $('notice').className = `notice ${type}`;
  $('notice-text').textContent = message;
  $('retry-failed').hidden = !retry;
}
function filteredIcons() {
  return (state.collection?.icons || []).filter(icon => (!state.selectedOnly || state.selected.has(icon.id)) && (!state.query || `${icon.name} ${icon.id}`.toLocaleLowerCase().includes(state.query)));
}
function updateSummary() {
  const count = state.selected.size;
  $('selection-number').textContent = count;
  $('selected-filter-count').textContent = count;
  $('export-summary').textContent = `${state.format.toUpperCase()} · ${state.size} px · ${state.colorMode === 'original' ? '保留原色' : state.color.toUpperCase()}`;
  $('settings-preview').textContent = `${state.format.toUpperCase()} · ${state.size} px`;
  $('archive-name').placeholder = state.collection ? archiveFilename('', state.collection, state.format).replace(/\.zip$/, '') : '自动使用图标库名称';
  $('download').disabled = !count || state.loading || state.exporting;
  $('download-label').textContent = state.exporting ? '正在打包…' : count ? `下载 ${count} 个图标` : '下载所选图标';
  const visible = filteredIcons();
  const chosen = visible.filter(icon => state.selected.has(icon.id)).length;
  $('select-all').checked = visible.length > 0 && chosen === visible.length;
  $('select-all').indeterminate = chosen > 0 && chosen < visible.length;
  $('select-all').disabled = !visible.length || state.loading || state.exporting;
  $('results-count').textContent = `${visible.length} 个图标${state.collection && visible.length !== state.collection.icons.length ? ` / 共 ${state.collection.icons.length} 个` : ''}`;
  for (const id of ['invert', 'clear', 'refresh', 'search', 'selected-only', 'source-input', 'example']) $(id).disabled = state.loading || state.exporting;
  for (const control of document.querySelectorAll('.settings button, .settings select, .settings input')) control.disabled = state.exporting;
  $('load-button').disabled = state.loading || state.exporting;
  $('load-button').firstChild.textContent = state.loading ? '正在读取…' : '读取图标库';
}

function preview(icon) {
  const key = `${icon.id}:${color()}`;
  if (!previews.has(key)) {
    try { previews.set(key, svgDataUrl(prepareSvg(icon, { size: 64, color: color() }))); }
    catch { previews.set(key, null); }
  }
  return previews.get(key);
}

function renderGrid() {
  const icons = filteredIcons();
  const fragment = document.createDocumentFragment();
  for (const icon of icons) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `icon-card${state.selected.has(icon.id) ? ' chosen' : ''}`;
    button.dataset.id = icon.id; button.setAttribute('aria-pressed', String(state.selected.has(icon.id)));
    button.setAttribute('aria-label', `${icon.name}，ID ${icon.id}`); button.title = `${icon.name} · ${icon.id}`;
    const check = document.createElement('span'); check.className = 'card-check'; check.setAttribute('aria-hidden', 'true');
    check.innerHTML = '<svg><use href="#i-check"/></svg>';
    const url = preview(icon);
    let image;
    if (url) { image = new Image(); image.src = url; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; }
    else { image = document.createElement('span'); image.className = 'invalid-preview'; image.textContent = '◇'; button.title += ' · SVG 无效，导出时会报告失败'; }
    const name = document.createElement('span'); name.className = 'icon-name'; name.textContent = icon.name;
    button.append(check, image, name); fragment.append(button);
  }
  $('icon-grid').replaceChildren(fragment);
  $('no-results').hidden = !state.collection || icons.length > 0 || state.loading;
  updateSummary();
}

function setLoading(loading) {
  state.loading = loading;
  $('loading-state').hidden = !loading;
  $('empty-state').hidden = loading || !!state.collection;
  for (const id of ['collection-card', 'library-toolbar', 'selection-toolbar', 'license-note']) $(id).hidden = loading || !state.collection;
  $('icon-grid').hidden = loading;
  $('no-results').hidden = true;
  updateSummary();
}

async function loadCollection(input) {
  if (state.exporting || state.loading) return;
  let id;
  try { id = parseCollectionId(input); }
  catch (error) { notice(error.message, 'error'); $('source-input').focus(); return; }
  notice(''); setLoading(true);
  loadController = new AbortController();
  const timeout = setTimeout(() => loadController.abort('timeout'), 25000);
  try {
    const response = await fetch(`https://www.iconfont.cn/api/collection/detail.json?id=${encodeURIComponent(id)}`, { credentials: 'include', signal: loadController.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`读取失败（HTTP ${response.status}），请稍后重试。`);
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { throw new Error('网站返回了验证页面。请先在 iconfont 中完成验证，再重新读取。'); }
    const collection = normalizeCollection(payload, id);
    state.collection = collection;
    state.selected = new Set(collection.icons.map(icon => icon.id));
    state.failed = []; state.query = ''; state.selectedOnly = false; previews.clear();
    $('search').value = ''; $('selected-only').checked = false;
    $('source-input').value = collection.source;
    $('collection-title').textContent = collection.name;
    $('collection-meta').textContent = `由 ${collection.creator} 创建 · ${collection.icons.length} 个图标 · 库 ID ${id}`;
    $('collection-source').href = collection.source;
    $('source-details').open = false;
    document.title = `${collection.name} · Iconpack`;
    const url = new URL(location.href); url.searchParams.set('cid', id); history.replaceState(null, '', url);
    if (!collection.icons.length) notice('这个图标库暂时没有图标。');
  } catch (error) {
    if (loadController.signal.aborted) notice(loadController.signal.reason === 'timeout' ? '读取超时，请检查网络或在 iconfont 完成验证后重试。' : '已取消读取。原有图标和选择已保留。', loadController.signal.reason === 'timeout' ? 'error' : '');
    else notice(error instanceof TypeError ? '网络连接失败，请检查网络，并确认可以打开 iconfont 网站。' : error.message, 'error');
  } finally {
    clearTimeout(timeout); setLoading(false); renderGrid();
  }
}

async function saveSettings() {
  try { await globalThis.chrome?.storage?.local.set({ settings: { format: state.format, size: state.size, colorMode: state.colorMode, color: state.color } }); }
  catch { /* Settings are optional; export still works when storage is unavailable. */ }
}
function applySettings() {
  for (const button of document.querySelectorAll('[data-format]')) {
    const active = button.dataset.format === state.format;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  }
  $('size').value = state.size; $('color-mode').value = state.colorMode; $('color').value = state.color;
  $('color-hex').textContent = state.color;
  $('color-setting').hidden = state.colorMode !== 'custom';
  $('size-note').textContent = state.format === 'svg' ? 'SVG 保持矢量，尺寸可继续缩放' : 'PNG 使用透明背景，单位为像素';
  renderGrid();
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  // Give Chrome time to consume the Blob, including when the save dialog is open.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function exportSelected() {
  if (state.exporting || state.loading || !state.selected.size) return;
  const icons = state.collection.icons.filter(icon => state.selected.has(icon.id));
  const collection = state.collection;
  const settings = { format: state.format, size: state.size, color: color() };
  const filename = archiveFilename($('archive-name').value, collection, settings.format);
  $('export-details').open = false;
  state.exporting = true; state.failed = []; exportController = new AbortController();
  document.body.classList.add('busy'); $('export-progress').hidden = false; $('zip-hint').hidden = true;
  $('progress').value = 0; $('progress-label').textContent = `准备 ${icons.length} 个图标…`; notice(''); updateSummary();
  const files = [], successes = [], failures = [];
  let totalBytes = 0;
  try {
    for (let i = 0; i < icons.length; i++) {
      const icon = icons[i];
      exportController.signal.throwIfAborted();
      try {
        const svg = prepareSvg(icon, { size: settings.size, color: settings.color });
        const data = settings.format === 'png' ? await renderPng(svg, settings.size, exportController.signal) : new TextEncoder().encode(svg);
        totalBytes += data.length;
        if (totalBytes > 450 * 1024 * 1024) throw new RangeError('导出数据超过 450 MB，请减少图标数量或 PNG 尺寸。');
        const filename = iconFilename(icon, settings.format);
        files.push({ name: `icons/${filename}`, data }); successes.push({ id: icon.id, name: icon.name, file: `icons/${filename}` });
      } catch (error) {
        if (exportController.signal.aborted || error instanceof RangeError) throw error;
        failures.push({ id: icon.id, name: icon.name, reason: error.message });
      }
      $('progress').value = Math.round((i + 1) / icons.length * 95);
      $('progress-label').textContent = `正在处理 ${i + 1} / ${icons.length}`;
      if (i % 8 === 0) await idle();
    }
    state.failed = failures.map(icon => icon.id);
    if (!successes.length) { notice('所选图标均未能导出，请重新读取图标库后重试。', 'error', failures.length > 0); return; }
    $('progress-label').textContent = '正在打包 ZIP…'; await idle(); exportController.signal.throwIfAborted();
    const metadata = { collection: { id: collection.id, name: collection.name, creator: collection.creator, source: collection.source, license: collection.license }, exportedAt: new Date().toISOString(), archiveName: filename, settings, requestedCount: icons.length, exportedCount: successes.length, icons: successes, failures };
    files.push({ name: 'manifest.json', data: JSON.stringify(metadata, null, 2) });
    files.push({ name: 'README.txt', data: `Iconpack · iconfont 图标库导出\n\n图标库：${collection.name}\n作者：${collection.creator}\n来源：${collection.source}\n格式：${settings.format.toUpperCase()}\n尺寸：${settings.size} × ${settings.size}\n颜色：${settings.color || '保留原色'}\n成功：${successes.length} / ${icons.length}\n失败：${failures.length}\n\nicons/ 内为图标文件；manifest.json 包含来源、文件对应关系和失败详情。\n图标版权归原作者所有，请前往原图标库确认授权。本工具不赋予额外使用权。\n` });
    const archive = createZip(files);
    exportController.signal.throwIfAborted();
    triggerDownload(archive, filename);
    $('progress').value = 100;
    notice(failures.length ? `已提交 ZIP 下载：成功 ${successes.length} 个，失败 ${failures.length} 个。失败详情已附在 manifest.json 中。` : `已提交 ZIP 下载，包含 ${successes.length} 个图标。可在 Chrome 下载记录中查看。`, failures.length ? '' : 'success', failures.length > 0);
  } catch (error) {
    notice(exportController.signal.aborted ? '已取消导出，可以调整选择后重新下载。' : `导出失败：${error.message}`, exportController.signal.aborted ? '' : 'error');
  } finally {
    state.exporting = false; document.body.classList.remove('busy'); $('export-progress').hidden = true; $('zip-hint').hidden = false; updateSummary();
  }
}

$('source-form').addEventListener('submit', event => { event.preventDefault(); loadCollection($('source-input').value); });
$('example').addEventListener('click', () => { $('source-input').value = '33'; loadCollection('33'); });
$('refresh').addEventListener('click', () => loadCollection(state.collection.id));
$('cancel-load').addEventListener('click', () => loadController?.abort());
$('notice-close').addEventListener('click', () => notice(''));
$('search').addEventListener('input', event => { state.query = event.target.value.trim().toLocaleLowerCase(); renderGrid(); });
$('selected-only').addEventListener('change', event => { state.selectedOnly = event.target.checked; renderGrid(); });
$('reset-search').addEventListener('click', () => { state.query = ''; state.selectedOnly = false; $('search').value = ''; $('selected-only').checked = false; renderGrid(); });
$('icon-grid').addEventListener('click', event => {
  const button = event.target.closest('[data-id]'); if (!button || state.exporting || state.loading) return;
  const id = button.dataset.id;
  state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
  if (state.selectedOnly) { renderGrid(); $('selected-only').focus(); }
  else { button.classList.toggle('chosen', state.selected.has(id)); button.setAttribute('aria-pressed', String(state.selected.has(id))); updateSummary(); }
});
$('select-all').addEventListener('change', event => { for (const icon of filteredIcons()) event.target.checked ? state.selected.add(icon.id) : state.selected.delete(icon.id); renderGrid(); });
$('invert').addEventListener('click', () => { for (const icon of filteredIcons()) state.selected.has(icon.id) ? state.selected.delete(icon.id) : state.selected.add(icon.id); renderGrid(); });
$('clear').addEventListener('click', () => { state.selected.clear(); renderGrid(); });
for (const button of document.querySelectorAll('[data-format]')) button.addEventListener('click', () => { state.format = button.dataset.format; applySettings(); saveSettings(); });
$('size').addEventListener('change', event => { state.size = Number(event.target.value); updateSummary(); saveSettings(); });
$('color-mode').addEventListener('change', event => { state.colorMode = event.target.value; previews.clear(); applySettings(); saveSettings(); });
$('color').addEventListener('input', event => { state.color = event.target.value; previews.clear(); applySettings(); });
$('color').addEventListener('change', saveSettings);
$('download').addEventListener('click', exportSelected);
$('cancel-export').addEventListener('click', () => exportController?.abort());
$('retry-failed').addEventListener('click', () => { state.selected = new Set(state.failed); state.query = ''; state.selectedOnly = true; $('search').value = ''; $('selected-only').checked = true; renderGrid(); notice('已选中上次导出失败的图标，可重新下载。'); });
document.addEventListener('keydown', event => {
  if (event.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && state.collection && !state.loading && !state.exporting) { event.preventDefault(); $('search').focus(); }
});
window.addEventListener('beforeunload', event => { if (state.exporting) { event.preventDefault(); event.returnValue = ''; } });

async function init() {
  // Size a dedicated popup to one third of the active monitor, three quarters high.
  // Do this once per window so a user can freely resize it afterwards.
  if (new URLSearchParams(location.search).has('panel') && !sessionStorage.getItem('window-sized')) {
    try {
      const current = await chrome.windows.getCurrent();
      if (current.type === 'popup') {
        const width = Math.min(screen.availWidth - 24, Math.max(360, Math.round(screen.availWidth / 3)));
        const height = Math.min(screen.availHeight - 24, Math.max(400, Math.round(screen.availHeight * .75)));
        if (current.state !== 'normal') await chrome.windows.update(current.id, { state: 'normal' });
        try {
          await chrome.windows.update(current.id, { width, height, left: Math.round((screen.availLeft || 0) + screen.availWidth - width - 16), top: Math.round((screen.availTop || 0) + (screen.availHeight - height) / 2) });
        } catch {
          // A monitor may move or disconnect while the popup opens. Let Chrome
          // retain its valid position while still applying the requested size.
          await chrome.windows.update(current.id, { width, height });
        }
        sessionStorage.setItem('window-sized', '1');
      }
    } catch (error) { console.warn('Iconpack window sizing:', error); /* Keep the initial popup size. */ }
  }
  try {
    const stored = (await globalThis.chrome?.storage?.local.get('settings'))?.settings;
    if (stored) {
      if (['svg', 'png'].includes(stored.format)) state.format = stored.format;
      if ([32, 64, 128, 256, 512, 1024].includes(stored.size)) state.size = stored.size;
      if (['original', 'custom'].includes(stored.colorMode)) state.colorMode = stored.colorMode;
      if (/^#[0-9a-f]{6}$/i.test(stored.color || '')) state.color = stored.color;
    }
  } catch { /* Use defaults if storage cannot be read. */ }
  applySettings();
  const id = new URLSearchParams(location.search).get('cid');
  if (id) { $('source-input').value = id; await loadCollection(id); }
}
init();
