import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCollectionId, normalizeCollection, safeName, iconFilename, archiveFilename } from '../extension/lib/core.js';

test('accepts arbitrary collection IDs and both supported detail routes', () => {
  for (const id of ['33', '123456', '907']) {
    assert.equal(parseCollectionId(` https://www.iconfont.cn/collections/detail?spm=a&cid=${id} `), id);
    assert.equal(parseCollectionId(`https://www.iconfont.cn/plus/collections/detail?cid=${id}`), id);
    assert.equal(parseCollectionId(id), id);
  }
});
test('rejects other origins, pages, missing IDs and injection attempts', () => {
  for (const input of ['https://www.iconfont.cn.evil.com/collections/detail?cid=33', 'https://example.com/?cid=33', 'http://www.iconfont.cn/collections/detail?cid=33', 'https://www.iconfont.cn:444/collections/detail?cid=33', 'https://www.iconfont.cn/search?cid=33', 'https://www.iconfont.cn/collections/detail', 'https://www.iconfont.cn/collections/detail?cid=../1', 'javascript:alert(1)', 'abc']) assert.throws(() => parseCollectionId(input));
});
test('normalizes library metadata, removes duplicate IDs and retains malformed SVG for reporting', () => {
  const collection = normalizeCollection({ code: 200, data: { collection: { name: '测试库', icons_count: 2 }, creator: { nickname: '作者' }, icons: [{ id: 1, name: '测试', show_svg: '<svg/>' }, { id: 1 }, { id: 2 }] } }, '900');
  assert.equal(collection.icons.length, 2);
  assert.equal(collection.icons[1].svg, '');
  assert.equal(collection.creator, '作者');
  assert.equal(collection.source, 'https://www.iconfont.cn/collections/detail?cid=900');
});
test('does not silently export incomplete, unauthorized or malformed libraries', () => {
  assert.throws(() => normalizeCollection({ code: 200, data: { collection: { icons_count: 20 }, icons: [{ id: 1 }] } }, '1'), /1 \/ 20/);
  for (const payload of [null, { code: 403 }, { code: 200, data: {} }]) assert.throws(() => normalizeCollection(payload, '1'));
  assert.deepEqual(normalizeCollection({ code: 200, data: { collection: {}, icons: [] } }, '1').icons, []);
});
test('generates portable names without path traversal or duplicate-name collisions', () => {
  assert.equal(safeName('../../a\\b:?. '), '-..-a-b--');
  assert.equal(safeName('CON.txt'), 'icon');
  assert.equal(safeName('...'), 'icon');
  assert.equal(iconFilename({ id: '12', name: '图标/星' }, 'svg'), '图标-星-12.svg');
  assert.notEqual(iconFilename({ id: '12', name: '重复' }, 'png'), iconFilename({ id: '13', name: '重复' }, 'png'));
});

test('custom archive names sanitize paths, avoid double extensions and fall back to collection metadata', () => {
  const library = { name: '测试库', id: '42' };
  assert.equal(archiveFilename('', library, 'svg'), '测试库-42-svg.zip');
  assert.equal(archiveFilename('设计图标.ZIP', library, 'png'), '设计图标.zip');
  assert.equal(archiveFilename('../设计/图标', library, 'png'), '-设计-图标.zip');
  assert.equal(archiveFilename('CON', library, 'png'), '测试库-42-png.zip');
  assert.equal(archiveFilename(' .zip ', library, 'png'), '测试库-42-png.zip');
});
