export function parseCollectionId(input) {
  const value = String(input).trim();
  if (/^\d+$/.test(value)) return value;
  let url;
  try { url = new URL(value); } catch { throw new Error('请输入完整的 iconfont 图标库链接，或纯数字库 ID。'); }
  if (url.protocol !== 'https:' || url.hostname !== 'www.iconfont.cn' || url.port || !/^\/(plus\/)?collections\/detail\/?$/.test(url.pathname)) {
    throw new Error('请使用 iconfont 的图标库详情链接（collections/detail?cid=…）。');
  }
  const id = url.searchParams.get('cid');
  if (!/^\d+$/.test(id || '')) throw new Error('链接中缺少有效的图标库 ID（cid）。');
  return id;
}

export function normalizeCollection(payload, id) {
  if (Number(payload?.code) !== 200 || !payload.data?.collection || !Array.isArray(payload.data.icons)) {
    throw new Error('暂时无法读取此图标库，请在 iconfont 中确认访问权限或完成登录验证后重试。');
  }
  const { collection, creator, icons } = payload.data;
  const unique = new Map();
  for (const icon of icons) {
    if (icon.id == null || unique.has(String(icon.id))) continue;
    unique.set(String(icon.id), { id: String(icon.id), name: String(icon.name || `icon-${icon.id}`), svg: typeof icon.show_svg === 'string' ? icon.show_svg : '', width: icon.width, height: icon.height });
  }
  const result = [...unique.values()];
  const expected = Number(collection.icons_count) || result.length;
  if (expected > result.length) throw new Error(`接口仅返回 ${result.length} / ${expected} 个图标。为避免整库下载缺失，请稍后重试。`);
  return { id: String(id), name: String(collection.name || `图标库 ${id}`), creator: String(creator?.nickname || '未知作者'), description: String(collection.description || ''), icons: result, source: `https://www.iconfont.cn/collections/detail?cid=${id}`, license: collection.license_description || collection.license || null };
}

export function safeName(value, fallback = 'icon') {
  const name = String(value).normalize('NFC').replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '-').replace(/^[. ]+|[. ]+$/g, '').slice(0, 100);
  return !name || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(name) ? fallback : name;
}

export function iconFilename(icon, format) {
  return `${safeName(icon.name)}-${safeName(icon.id)}.${format}`;
}

export function archiveFilename(customName, collection, format) {
  const custom = String(customName || '').trim().replace(/\.zip$/i, '').trim();
  const fallback = `${safeName(collection.name, 'iconfont')}-${collection.id}-${format}`;
  return `${custom ? safeName(custom, fallback) : fallback}.zip`;
}
