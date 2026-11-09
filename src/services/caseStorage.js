/**
 * caseStorage.js
 * Penyimpanan Case + Note. SUBSET dari src/contract/storageContract.js.
 *
 * BELUM diimplementasi di sini (menyusul step terpisah):
 *   updateCase, deleteCase, updateNote, deleteNote,
 *   beginEvidence, appendEvidence, finishEvidence, abortEvidence,
 *   listEvidence, getEvidenceMeta, readEvidence, deleteEvidence
 * Karena itu sengaja TIDAK dipanggil assertStorage() di sini — bakal gagal
 * (dan memang harus gagal) karena belum lengkap. Jangan buru-buru nutup gap itu.
 *
 * Pola sama persis kayak pluginStorage.js: Capacitor Filesystem (Directory.Data)
 * kalau tersedia, fallback localStorage kalau tidak (browser dev, `npm test`).
 *
 * Bentuk 1 case = 1 "file" (manifest.json kalau Capacitor, 1 key kalau localStorage):
 *   { id, title, createdAt, notes: [{ id, text, createdAt }] }
 *
 * Penulisan notes TIDAK atomik secara per-note: seluruh case ditulis ulang tiap
 * addNote(). Cukup buat MVP; kalau case-nya gede banget nanti baru dipikirin ulang.
 */

import { register, MODULE_TYPES } from '../core/registry.js';

const PREFIX = 'cid:case:';       // dipakai backend localStorage
const CASES_DIR = 'cases';        // dipakai backend Capacitor
const FS_DIRECTORY = 'DATA';      // Directory.Data, ditulis manual (sama alasan kayak pluginStorage)

export class CaseStorageError extends Error {
  /**
   * @param {string} code - UNAVAILABLE | INVALID_ID | INVALID_DATA | NOT_FOUND | CORRUPT | IO_ERROR
   */
  constructor(code, message) {
    super(message);
    this.name = 'CaseStorageError';
    this.code = code;
  }
}

// ID case BUKAN camelCase kayak id modul/plugin — ini digenerate, bukan ditulis manusia.
const CASE_ID_PATTERN = /^case_[a-z0-9]+$/;

function isValidCaseId(id) {
  return typeof id === 'string' && id.length <= 60 && CASE_ID_PATTERN.test(id);
}

function generateCaseId() {
  const rand = Math.random().toString(36).slice(2, 10);
  return `case_${Date.now().toString(36)}${rand}`;
}

function generateNoteId() {
  return `note_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

let ready = false;

function hasCapacitor() {
  return typeof window !== 'undefined' && !!window.Capacitor?.Plugins?.Filesystem;
}

/** Cek backend bisa dipakai. Aman dipanggil berkali-kali. */
export async function init() {
  if (ready) return;
  if (hasCapacitor()) {
    ready = true;
    return;
  }
  try {
    const store = getStore();
    const probe = `${PREFIX}__probe__`;
    store.setItem(probe, '1');
    store.removeItem(probe);
  } catch (err) {
    throw new CaseStorageError('UNAVAILABLE', `Penyimpanan case tidak tersedia: ${err.message}`);
  }
  ready = true;
}

/**
 * Bikin case baru.
 * @param {string} title
 * @returns {Promise<{id: string, title: string, createdAt: string}>}
 */
export async function createCase(title) {
  await init();

  if (typeof title !== 'string' || !title.trim()) {
    throw new CaseStorageError('INVALID_DATA', 'title wajib teks, tidak boleh kosong.');
  }

  const id = generateCaseId();
  const record = { id, title: title.trim(), createdAt: new Date().toISOString(), notes: [] };

  await writeCase(id, record);
  return { id: record.id, title: record.title, createdAt: record.createdAt };
}

/**
 * Ambil satu case lengkap (termasuk notes).
 * @param {string} id
 * @returns {Promise<{id, title, createdAt, notes: Array}>}
 */
export async function getCase(id) {
  await init();
  assertCaseId(id);
  return readCase(id);
}

/**
 * Daftar ringkas semua case (tanpa notes, biar murah buat list UI).
 * @returns {Promise<Array<{id, title, createdAt}>>}
 */
export async function listCases() {
  await init();
  const ids = await listCaseIds();

  const summaries = [];
  for (const id of ids) {
    try {
      const rec = await readCase(id);
      summaries.push({ id: rec.id, title: rec.title, createdAt: rec.createdAt });
    } catch {
      // Case rusak/korup dilewati, bukan bikin seluruh list gagal.
      // (Sama filosofi kayak loader.js: satu rusak, yang lain tetap jalan.)
    }
  }
  return summaries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Tambah note ke case.
 * @param {string} caseId
 * @param {string} text
 * @returns {Promise<{id, text, createdAt}>}
 */
export async function addNote(caseId, text) {
  await init();
  assertCaseId(caseId);

  if (typeof text !== 'string' || !text.trim()) {
    throw new CaseStorageError('INVALID_DATA', 'text wajib teks, tidak boleh kosong.');
  }

  const record = await readCase(caseId); // NOT_FOUND kalau case-nya nggak ada
  const note = { id: generateNoteId(), text: text.trim(), createdAt: new Date().toISOString() };

  record.notes.push(note);
  await writeCase(caseId, record);
  return note;
}

/**
 * Daftar semua note milik satu case.
 * @param {string} caseId
 * @returns {Promise<Array<{id, text, createdAt}>>}
 */
export async function listNotes(caseId) {
  const record = await getCase(caseId);
  return record.notes;
}

// --- Internal ---

async function listCaseIds() {
  if (hasCapacitor()) {
    const Filesystem = window.Capacitor.Plugins.Filesystem;
    let entries;
    try {
      const res = await Filesystem.readdir({ path: CASES_DIR, directory: FS_DIRECTORY });
      entries = res.files || [];
    } catch {
      // Folder cases/ belum pernah dibuat = belum ada case sama sekali.
      return [];
    }
    const ids = [];
    for (const entry of entries) {
      const name = typeof entry === 'string' ? entry : entry.name;
      const id = name.replace(/\.json$/, '');
      if (isValidCaseId(id)) ids.push(id);
    }
    return ids;
  }

  return guard(() => {
    const store = getStore();
    const ids = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key && key.startsWith(PREFIX)) {
        const id = key.slice(PREFIX.length);
        if (isValidCaseId(id)) ids.push(id);
      }
    }
    return ids;
  });
}

async function readCase(id) {
  if (hasCapacitor()) {
    const Filesystem = window.Capacitor.Plugins.Filesystem;
    let raw;
    try {
      raw = (await Filesystem.readFile({
        path: `${CASES_DIR}/${id}.json`,
        directory: FS_DIRECTORY,
        encoding: 'utf8',
      })).data;
    } catch {
      throw new CaseStorageError('NOT_FOUND', `Case "${id}" tidak ditemukan.`);
    }
    return parseRecord(id, raw);
  }

  const raw = guard(() => getStore().getItem(PREFIX + id));
  if (raw === null) {
    throw new CaseStorageError('NOT_FOUND', `Case "${id}" tidak ditemukan.`);
  }
  return parseRecord(id, raw);
}

async function writeCase(id, record) {
  const payload = JSON.stringify(record);

  if (hasCapacitor()) {
    const Filesystem = window.Capacitor.Plugins.Filesystem;
    try {
      await Filesystem.writeFile({
        path: `${CASES_DIR}/${id}.json`,
        data: payload,
        directory: FS_DIRECTORY,
        encoding: 'utf8',
        recursive: true,
      });
    } catch (err) {
      throw new CaseStorageError('IO_ERROR', `Gagal menulis case "${id}": ${err.message}`);
    }
    return;
  }

  guard(() => getStore().setItem(PREFIX + id, payload));
}

function parseRecord(id, raw) {
  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    throw new CaseStorageError('CORRUPT', `Data case "${id}" rusak (bukan JSON valid).`);
  }
  if (!record || typeof record !== 'object' || !Array.isArray(record.notes)) {
    throw new CaseStorageError('CORRUPT', `Data case "${id}" rusak (bentuk tidak sesuai).`);
  }
  return record;
}

function getStore() {
  const store = globalThis.localStorage;
  if (!store) throw new Error('localStorage tidak ada di lingkungan ini');
  return store;
}

function assertCaseId(id) {
  if (!isValidCaseId(id)) {
    throw new CaseStorageError('INVALID_ID', `caseId tidak valid: "${id}".`);
  }
}

function guard(fn) {
  try {
    return fn();
  } catch (err) {
    if (err instanceof CaseStorageError) throw err;
    throw new CaseStorageError('IO_ERROR', `Gagal mengakses penyimpanan: ${err.message}`);
  }
}

// --- Registrasi ke Registry sebagai module type STORAGE ---
// Dikumpulin jadi satu objek biar bisa ditemukan lewat
// registry.getByType(MODULE_TYPES.STORAGE) nanti (dashboard, dsb).
// CATATAN: ini BELUM lolos assertStorage() dari storageContract.js — baru subset.
export const caseStorageModule = {
  init, createCase, getCase, listCases, addNote, listNotes,
};

register({
  id: 'caseStorage',
  type: MODULE_TYPES.STORAGE,
  label: 'Case Storage',
  module: caseStorageModule,
  source: 'builtin',
});
