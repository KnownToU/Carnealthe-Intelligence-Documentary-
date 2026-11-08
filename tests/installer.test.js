/**
 * Tes logika installer (Node, tanpa browser).
 * Jalankan: npm test
 *
 * Yang TIDAK bisa dites di sini: import Blob URL yang sukses (Node tidak mendukung
 * import dari blob:). Bagian itu dites manual di browser. Lihat langkah tes di README/jawaban.
 */

import assert from 'node:assert/strict';

// --- localStorage tiruan (harus dipasang SEBELUM modul diimpor) ---
const data = new Map();
const ls = {
  failSet: false,
  corruptReads: false,
  get length() { return data.size; },
  key(i) { return [...data.keys()][i] ?? null; },
  getItem(k) {
    if (!data.has(k)) return null;
    return ls.corruptReads ? data.get(k) + 'X' : data.get(k);
  },
  setItem(k, v) {
    if (ls.failSet) {
      const e = new Error('quota penuh');
      e.name = 'QuotaExceededError';
      throw e;
    }
    data.set(k, String(v));
  },
  removeItem(k) { data.delete(k); },
  clear() { data.clear(); },
};
globalThis.localStorage = ls;

const storage = await import('../src/services/pluginStorage.js');
const { register, has, get } = await import('../src/core/registry.js');

let runId = 0;
// Instance service baru per skenario (state internalnya bersih). Registry dan storage tetap dipakai bersama.
const freshService = () => import(`../src/services/pluginService.js?run=${++runId}`);

const manifestOf = (id, extra = {}) =>
  JSON.stringify({ id, type: 'panel', label: `Label ${id}`, version: '1.0.0', ...extra });
const GOOD_CODE = 'export default { render() { return {}; } };';
const dataImporter = code => import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

async function rejectsCode(promiseOrFn, code) {
  try {
    await (typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn);
  } catch (e) {
    assert.equal(e.code, code, `code seharusnya ${code}, dapat ${e.code} (${e.message})`);
    return;
  }
  assert.fail(`seharusnya melempar error ${code}`);
}

let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log('PASS', name);
  } catch (e) {
    failed++;
    console.log('FAIL', name, '\n     ', e.message);
  }
}

// ============================================================
// Storage adapter
// ============================================================
await test('storage: write/read/list/remove', async () => {
  await storage.init();
  await storage.write('aaa', { manifest: { id: 'aaa' }, code: 'x' });
  assert.deepEqual(await storage.list(), ['aaa']);
  assert.equal((await storage.read('aaa')).code, 'x');
  assert.equal(await storage.remove('aaa'), true);
  assert.equal(await storage.remove('aaa'), false);
  assert.deepEqual(await storage.list(), []);
});

await test('storage: validasi id dan data', async () => {
  await rejectsCode(storage.write('Bad-Id', { manifest: { id: 'Bad-Id' }, code: 'x' }), 'INVALID_ID');
  await rejectsCode(storage.read('../hack'), 'INVALID_ID');
  await rejectsCode(storage.write('bbb', { manifest: { id: 'bbb' }, code: 1 }), 'INVALID_DATA');
  await rejectsCode(storage.write('bbb', { manifest: { id: 'zzz' }, code: 'x' }), 'INVALID_DATA');
  await rejectsCode(storage.write('bbb', null), 'INVALID_DATA');
});

await test('storage: NOT_FOUND dan CORRUPT', async () => {
  await rejectsCode(storage.read('nope'), 'NOT_FOUND');
  ls.setItem('cid:plugin:ccc', '{bukan json');
  await rejectsCode(storage.read('ccc'), 'CORRUPT');
  ls.setItem('cid:plugin:ccc', JSON.stringify({ manifest: {}, code: '' }));
  await rejectsCode(storage.read('ccc'), 'CORRUPT');
  ls.removeItem('cid:plugin:ccc');
});

await test('storage: quota jadi error QUOTA', async () => {
  ls.failSet = true;
  await rejectsCode(storage.write('ddd', { manifest: { id: 'ddd' }, code: 'x' }), 'QUOTA');
  ls.failSet = false;
  assert.deepEqual(await storage.list(), []);
});

// ============================================================
// Validasi input
// ============================================================
await test('validasi: input valid, field asing dibuang', async () => {
  const svc = await freshService();
  const { manifest } = svc.validatePluginInput(manifestOf('okPlugin', { evil: 'x', entry: 'index.js' }), GOOD_CODE);
  assert.equal(manifest.id, 'okPlugin');
  assert.equal(manifest.evil, undefined);
});

await test('validasi: penolakan', async () => {
  const svc = await freshService();
  const v = (m, c = GOOD_CODE) => () => svc.validatePluginInput(m, c);
  await rejectsCode(v('{bukan json'), 'INVALID_MANIFEST');
  await rejectsCode(v(manifestOf('okPlugin', { type: 'tool' })), 'INVALID_MANIFEST');
  await rejectsCode(v(manifestOf('Bad-Id')), 'INVALID_MANIFEST');
  await rejectsCode(v(manifestOf('okPlugin', { entry: '../x.js' })), 'INVALID_MANIFEST');
  await rejectsCode(v(manifestOf('okPlugin', { entry: 'other.js' })), 'INVALID_ENTRY');
  await rejectsCode(v(manifestOf('okPlugin'), '   '), 'EMPTY_CODE');
  await rejectsCode(v(manifestOf('okPlugin'), 'a'.repeat(512 * 1024 + 1)), 'TOO_LARGE');
  await rejectsCode(v('x'.repeat(512 * 1024 + 1)), 'TOO_LARGE');
  assert.ok(svc.validatePluginInput(manifestOf('okPlugin'), 'a'.repeat(512 * 1024)).manifest); // tepat 512 KB boleh
});

// ============================================================
// Install + rollback
// ============================================================
await test('install: sukses, tersimpan, kode TIDAK dijalankan', async () => {
  const svc = await freshService();
  globalThis.__pluginRan = false;
  const code = 'globalThis.__pluginRan = true; export default { render() {} };';
  const res = await svc.install({ manifestText: manifestOf('instOne'), codeText: code });
  assert.equal(res.id, 'instOne');
  assert.equal((await storage.read('instOne')).code, code);
  assert.equal(globalThis.__pluginRan, false, 'kode plugin dieksekusi saat install!');
  assert.equal(has('instOne'), false, 'install tidak boleh langsung meregister');
  await storage.remove('instOne');
});

await test('install: ID bentrok ditolak (plugin lain & panel bawaan)', async () => {
  const svc = await freshService();
  await svc.install({ manifestText: manifestOf('dupOne'), codeText: GOOD_CODE });
  await rejectsCode(svc.install({ manifestText: manifestOf('dupOne'), codeText: GOOD_CODE }), 'ID_CONFLICT');

  register({ id: 'builtinOne', type: 'panel', module: { render() {} } });
  await rejectsCode(svc.install({ manifestText: manifestOf('builtinOne'), codeText: GOOD_CODE }), 'ID_CONFLICT');
  assert.equal((await storage.list()).includes('builtinOne'), false);
  await storage.remove('dupOne');
});

await test('install: rollback saat storage penuh', async () => {
  const svc = await freshService();
  ls.failSet = true;
  await rejectsCode(svc.install({ manifestText: manifestOf('rollA'), codeText: GOOD_CODE }), 'INSTALL_FAILED');
  ls.failSet = false;
  assert.equal((await storage.list()).includes('rollA'), false);
});

await test('install: rollback saat verifikasi baca-ulang gagal', async () => {
  const svc = await freshService();
  ls.corruptReads = true;
  await rejectsCode(svc.install({ manifestText: manifestOf('rollB'), codeText: GOOD_CODE }), 'INSTALL_FAILED');
  ls.corruptReads = false;
  assert.equal((await storage.list()).includes('rollB'), false, 'sisa data tidak dibersihkan');
});

// ============================================================
// loadInstalled + uninstall
// ============================================================
const svc = await freshService();
ls.clear();

await svc.install({ manifestText: manifestOf('goodOne'), codeText: GOOD_CODE });
await svc.install({ manifestText: manifestOf('throwsOne'), codeText: "throw new Error('boom'); export default { render() {} };" });
await svc.install({ manifestText: manifestOf('noRender'), codeText: 'export default {};' });
await svc.install({ manifestText: manifestOf('hangsOne'), codeText: 'await new Promise(() => {}); export default { render() {} };' });
await svc.install({ manifestText: manifestOf('conflictOne'), codeText: GOOD_CODE });
ls.setItem('cid:plugin:corruptOne', 'garbage');
// Panel bawaan baru muncul belakangan dengan ID yang sama dengan plugin terinstal:
register({ id: 'conflictOne', type: 'panel', module: { render() {} } });

let loaded;
await test('loadInstalled: plugin rusak tidak menggagalkan yang lain', async () => {
  loaded = await svc.loadInstalled({ importer: dataImporter, timeoutMs: 200 });
  const by = Object.fromEntries(loaded.map(p => [p.id, p]));

  assert.equal(by.goodOne.status, 'active');
  assert.equal(by.throwsOne.status, 'failed');
  assert.match(by.throwsOne.error, /boom/);
  assert.equal(by.noRender.status, 'failed');
  assert.equal(by.hangsOne.status, 'failed');
  assert.match(by.hangsOne.error, /timeout/);
  assert.equal(by.corruptOne.status, 'failed');
  assert.equal(by.conflictOne.status, 'conflict');

  assert.equal(get('goodOne').source, 'plugin');
  assert.equal(has('throwsOne'), false);
  assert.equal(get('conflictOne').source, 'builtin', 'panel bawaan tertimpa plugin!');
});

await test('loadInstalled: panggilan kedua tidak registrasi ganda', async () => {
  const again = await svc.loadInstalled({ importer: dataImporter });
  assert.equal(again, loaded);
});

await test('getInstalled: semua plugin tampil dengan status', async () => {
  const items = await svc.getInstalled();
  assert.equal(items.length, 6);
  assert.equal(items.find(p => p.id === 'goodOne').status, 'active');
});

await test('uninstall: hapus data + registrasi plugin', async () => {
  assert.equal(await svc.uninstall('goodOne'), true);
  assert.equal(has('goodOne'), false);
  assert.equal((await storage.list()).includes('goodOne'), false);
});

await test('uninstall: tidak menghapus panel bawaan ber-ID sama', async () => {
  assert.equal(await svc.uninstall('conflictOne'), true);
  assert.equal(has('conflictOne'), true);
  assert.equal(get('conflictOne').source, 'builtin');
});

await test('uninstall: plugin rusak/corrupt tetap bisa dihapus; id ngawur ditolak', async () => {
  assert.equal(await svc.uninstall('corruptOne'), true);
  assert.equal(await svc.uninstall('tidakAda'), false);
  await rejectsCode(svc.uninstall('../x'), 'INVALID_ID');
});

// ============================================================
// Lifecycle Blob URL
// ============================================================
await test('Blob URL selalu di-revoke (1 dibuat = 1 di-revoke)', async () => {
  const created = [];
  const revoked = [];
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  URL.createObjectURL = b => { const u = origCreate.call(URL, b); created.push(u); return u; };
  URL.revokeObjectURL = u => { revoked.push(u); return origRevoke.call(URL, u); };
  try {
    ls.clear();
    const s = await freshService();
    await s.install({ manifestText: manifestOf('blobOne'), codeText: GOOD_CODE });
    await s.loadInstalled({ timeoutMs: 1000 }); // importer bawaan (Blob URL)
    assert.equal(created.length, 1);
    assert.deepEqual(revoked, created);
  } finally {
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  }
});

console.log(failed === 0 ? '\nSEMUA TES LULUS' : `\n${failed} TES GAGAL`);
process.exit(failed === 0 ? 0 : 1);
