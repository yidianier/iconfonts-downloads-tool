import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { crc32, createZip } from '../extension/lib/zip.js';

test('CRC-32 matches the standard vector', () => { assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926); });
test('ZIP is readable by an independent implementation with unicode names and binary contents', async () => {
  const zip = createZip([{ name: 'icons/测试-1.svg', data: '<svg xmlns="http://www.w3.org/2000/svg"/>' }, { name: 'icons/binary.png', data: new Uint8Array([0, 255, 128, 64, 0]) }]);
  const output = execFileSync('python3', ['-c', 'import io,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; assert z.read("icons/测试-1.svg").startswith(b"<svg"); assert z.read("icons/binary.png")==bytes([0,255,128,64,0]); print(len(z.namelist()))'], { input: Buffer.from(await zip.arrayBuffer()), encoding: 'utf8' });
  assert.equal(output.trim(), '2');
});
test('empty ZIP archives are valid and invalid data is rejected', async () => {
  assert.equal(createZip([]).size, 22);
  assert.throws(() => createZip([{ name: 'bad', data: {} }]), /无效/);
});
