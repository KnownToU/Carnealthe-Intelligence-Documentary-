/**
 * Tes regresi: capabilities harus ikut kesimpen di Registry.
 * Ini niru alur ASLI (register -> get -> buildCtx), bukan manggil buildCtx
 * langsung — supaya bug "capabilities ke-drop di registry.js" ketangkep lagi
 * kalau suatu saat balik lagi.
 *
 * Taruh di tests/registryCapabilities.manual.js, jalankan:
 *   node tests/registryCapabilities.manual.js
 */
import assert from 'node:assert/strict';

const data = new Map();
globalThis.localStorage = {
  get length() { return data.size; },
  key(i) { return [...data.keys()][i] ?? null; },
  getItem(k) { return data.has(k) ? data.get(k) : null; },
  setItem(k, v) { data.set(k, String(v)); },
  removeItem(k) { data.delete(k); },
  clear() { data.clear(); },
};

const { register, get, MODULE_TYPES } = await import('../src/core/registry.js');
const { buildCtx } = await import('../src/core/capabilities.js');

// Niru persis yang dilakuin loader.js: register tool dengan capabilities.
register({
  id: 'fakeToolBuatTes',
  type: MODULE_TYPES.TOOL,
  label: 'Fake Tool',
  capabilities: ['saveToCase'],
  module: { render() { return document; } }, // isinya nggak penting buat tes ini
});

// Niru persis yang dilakuin shell.js: ambil balik dari Registry, bukan dari
// objek yang tadi dikirim ke register().
const def = get('fakeToolBuatTes');
assert.deepEqual(def.capabilities, ['saveToCase'], 'capabilities harus ikut kesimpen & kebaca balik');
console.log('[OK] capabilities ikut kesimpen di Registry');

const ctx = buildCtx(def.capabilities, def.source);
assert.equal(typeof ctx.saveToCase, 'function', 'ctx.saveToCase harus function lewat alur register->get->buildCtx');
console.log('[OK] alur register -> get -> buildCtx ngasih ctx.saveToCase beneran');

console.log('\nSEMUA TES LOLOS. Bug capabilities ke-drop di Registry udah kebenerin.');
