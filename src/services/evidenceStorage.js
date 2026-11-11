/**
 * evidenceStorage.js
 * Penyimpanan Evidence (file biner milik sebuah Case).
 *
 * Kenapa dipisah dari caseStorage.js: caseStorage ngurusin TEKS
 * (title/notes), ukurannya kecil, seluruh case ditulis ulang tiap
 * perubahan. Evidence itu BINER dan bisa gede — pola baca/tulisnya beda
 * banget, jadi dipisah (SRP).
 *
 * STATUS: streaming ke disk per chunk (Step 6, bagian 3). Backend Capacitor
 * nulis tiap chunk LANGSUNG ke data.bin (Filesystem.appendFile), bukan
 * nampung di RAM — biar upload evidence gede nggak bikin WebView OOM.
 * Backend localStorage (dipakai npm test doang, bukan device beneran) tetep
 * buffer penuh di memory lalu tulis sekali pas finish — localStorage nggak
 * punya append murah dan kuotanya kecil, jadi nggak masalah buat sesi tes.
 *
 * BELUM ada (sengaja, menyusul step terpisah — jangan buru-buru nutup):
 *   - abortEvidence. Kalau proses begin/append keputus (app ditutup paksa,
 *     dsb): backend Capacitor sekarang BISA ninggalin folder evidence/{id}
 *     dengan data.bin separuh jalan tanpa meta.json (karena nulisnya udah
 *     progresif sejak chunk pertama, bukan nunggu finish lagi). Non-fatal:
 *     nggak ngerusak evidence lain, nggak kebaca listEvidence (butuh
 *     meta.json buat muncul), cuma makan storage nganggur. Cleanup-nya
 *     nyusul bareng abortEvidence.
 *   - readEvidence (baca isi file-nya), deleteEvidence.
 *   - hash. DITUNDA jadi null, bukan dihapus — sha256Hex() di bawah masih
 *     ada tapi sengaja nggak dipanggil. Alasan: hash versi lama cuma bisa
 *     dihitung dari buffer UTUH (Web Crypto nggak punya mode incremental),
 *     yang justru lawan dari tujuan streaming ini. Belum ada satu pun fitur
 *     yang baca/verifikasi hash (readEvidence belum ada), jadi nggak ada
 *     yang rusak. Hash beneran (incremental) nyusul bareng readEvidence.
 *   - link ke Case. Record evidence TIDAK otomatis muncul di
 *     caseStorage.getCase() — caseId cuma disimpen di metadata evidence,
 *     arah baliknya (case -> daftar evidence-nya) nyusul step lain.
 *   - validasi caseId benar-benar ada di caseStorage. Sengaja dilewatin
 *     dulu biar modul ini nggak gantung ke caseStorage sama sekali.
 *     Efeknya: evidence bisa nunjuk ke caseId yang nggak ada (yatim).
 *     Non-fatal buat MVP, dicatat buat dibenerin nanti.
 *   - finishEvidence tanpa appendEvidence sama sekali -> evidence 0 byte
 *     tetap kesimpen, nggak ditolak. Non-fatal, nyusul kalau kepake.
 *
 * Pola backend sama persis kayak caseStorage.js/pluginStorage.js:
 * Capacitor Filesystem (Directory.Data) kalau tersedia, fallback
 * localStorage kalau tidak (browser dev, `npm test`).
 */

const PREFIX = 'cid:evidence:';   // dipakai backend localStorage
const EVIDENCE_DIR = 'evidence';  // dipakai backend Capacitor
const FS_DIRECTORY = 'DATA';      // Directory.Data, sama alasan kayak caseStorage/pluginStorage

/**
 * Ukuran chunk yang disaranin buat pemanggil appendEvidence (mis. kode yang
 * motong-motong File jadi potongan). Modul ini sendiri nggak maksa ukuran
 * chunk apa pun (appendEvidence terima Uint8Array berapa pun gede/kecilnya),
 * ini cuma satu angka rujukan biar nggak ada dua angka beda yang kebetulan
 * sama di dua file.
 */
export const RECOMMENDED_CHUNK_SIZE = 1024 * 1024; // 1MB

export class EvidenceStorageError extends Error {
  /**
   * @param {string} code - UNAVAILABLE | INVALID_DATA | NOT_FOUND | IO_ERROR | QUOTA
   */
  constructor(code, message) {
    super(message);
    this.name = 'EvidenceStorageError';
    this.code = code;
  }
}

function generateEvidenceId() {
  const rand = Math.random().toString(36).slice(2, 10);
  return `ev_${Date.now().toString(36)}${rand}`;
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
    throw new EvidenceStorageError('UNAVAILABLE', `Penyimpanan evidence tidak tersedia: ${err.message}`);
  }
  ready = true;
}

// sessionId -> { id, caseId, meta: {name, mimeType}, bytesWritten, fallbackChunks }
// Sengaja di memory doang, bukan storage — sesi yang belum "finish" memang
// belum boleh dianggap data beneran (meski backend Capacitor udah nulis
// data.bin progresif, meta.json-nya baru ada pas finishEvidence berhasil).
const sessions = new Map();
let sessionCounter = 0;

/**
 * Mulai sesi tulis evidence baru.
 *
 * @param {string} caseId - BELUM divalidasi exist-nya. Lihat catatan di atas file.
 * @param {{name?: string, mimeType?: string}} [meta]
 * @returns {Promise<string>} sessionId, dipakai di appendEvidence/finishEvidence
 */
export async function beginEvidence(caseId, meta = {}) {
  await init();

  if (typeof caseId !== 'string' || !caseId.trim()) {
    throw new EvidenceStorageError('INVALID_DATA', 'caseId wajib teks, tidak boleh kosong.');
  }

  const sessionId = `sess_${++sessionCounter}_${Math.random().toString(36).slice(2, 8)}`;
  // id digenerate di SINI (bukan di finishEvidence) karena backend Capacitor
  // butuh nama folder/file yang fix sejak chunk pertama ditulis.
  const id = generateEvidenceId();
  sessions.set(sessionId, {
    id,
    caseId,
    meta: {
      name: typeof meta.name === 'string' && meta.name.trim() ? meta.name.trim() : 'evidence',
      mimeType: typeof meta.mimeType === 'string' && meta.mimeType.trim() ? meta.mimeType.trim() : 'application/octet-stream',
    },
    bytesWritten: 0,
    fallbackChunks: [], // cuma dipakai backend localStorage, lihat appendEvidence
  });
  return sessionId;
}

/**
 * Tambah satu chunk data ke sesi yang sedang berjalan. Bisa dipanggil
 * berkali-kali sebelum finishEvidence().
 *
 * @param {string} sessionId
 * @param {Uint8Array} chunk
 */
export async function appendEvidence(sessionId, chunk) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new EvidenceStorageError('NOT_FOUND', `Sesi evidence "${sessionId}" tidak ditemukan (sudah selesai, atau salah ID).`);
  }
  if (!(chunk instanceof Uint8Array)) {
    throw new EvidenceStorageError('INVALID_DATA', 'chunk harus berupa Uint8Array.');
  }

  if (hasCapacitor()) {
    const Filesystem = window.Capacitor.Plugins.Filesystem;
    try {
      await Filesystem.appendFile({
        path: `${EVIDENCE_DIR}/${session.id}/data.bin`,
        data: uint8ToBase64(chunk), // tanpa 'encoding': dianggap base64 biner apa adanya
        directory: FS_DIRECTORY,
        recursive: true,
      });
    } catch (err) {
      throw new EvidenceStorageError('IO_ERROR', `Gagal menulis chunk evidence "${session.id}": ${err.message}`);
    }
    session.bytesWritten += chunk.length;
    return;
  }

  // Backend localStorage (dipakai npm test doang): nggak ada append murah
  // dan kuotanya kecil, jadi tetep buffer di memory sampai finish.
  session.fallbackChunks.push(chunk);
}

/**
 * Selesaikan sesi: gabung semua chunk, hitung hash, simpan ke storage.
 * Sesi dihapus dari memory setelah dipanggil, sukses maupun gagal — sesi
 * yang udah coba di-finish tidak boleh dipakai lagi.
 *
 * @param {string} sessionId
 * @returns {Promise<{id, caseId, name, mimeType, size, hash, createdAt}>}
 */
export async function finishEvidence(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new EvidenceStorageError('NOT_FOUND', `Sesi evidence "${sessionId}" tidak ditemukan (sudah selesai, atau salah ID).`);
  }
  sessions.delete(sessionId);

  if (hasCapacitor()) {
    // data.bin udah selesai nulis sendiri-sendiri dari appendEvidence,
    // tinggal tulis meta.json-nya.
    const record = {
      id: session.id,
      caseId: session.caseId,
      name: session.meta.name,
      mimeType: session.meta.mimeType,
      size: session.bytesWritten,
      hash: null, // ditunda, lihat catatan di atas file
      createdAt: new Date().toISOString(),
    };
    await writeEvidenceMeta(session.id, record);
    return record;
  }

  // Backend localStorage (npm test): belum ada apa pun di disk, semua masih
  // di fallbackChunks -> gabung & tulis sekali kayak sebelumnya.
  const bytes = concatChunks(session.fallbackChunks);
  const record = {
    id: session.id,
    caseId: session.caseId,
    name: session.meta.name,
    mimeType: session.meta.mimeType,
    size: bytes.length,
    hash: null, // ditunda, lihat catatan di atas file
    createdAt: new Date().toISOString(),
  };
  await writeEvidence(session.id, record, bytes);
  return record;
}

/**
 * Ambil semua evidence milik satu Case (metadata doang, bukan isi file).
 *
 * Desain sengaja: caseId yang bentuknya valid (teks, nggak kosong) tapi
 * nggak exist di caseStorage BUKAN error di sini — modul ini nggak gantung
 * ke caseStorage (lihat catatan di atas file), jadi "nggak ketemu case"
 * dan "ketemu case tapi evidence-nya nol" hasilnya sama: array kosong.
 * Error cuma buat caseId yang secara bentuk aja salah.
 *
 * @param {string} caseId
 * @returns {Promise<Array<object>>} metadata evidence, urut dari yang paling lama
 */
export async function listEvidence(caseId) {
  await init();
  if (typeof caseId !== 'string' || !caseId.trim()) {
    throw new EvidenceStorageError('INVALID_DATA', 'caseId wajib teks, tidak boleh kosong.');
  }
  const all = await readAllMeta();
  return all
    .filter((m) => m.caseId === caseId)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

/**
 * Ambil metadata SATU evidence by id, lintas case (nggak perlu tau caseId-nya).
 *
 * @param {string} id
 * @returns {Promise<object>} metadata evidence
 */
export async function getEvidenceMeta(id) {
  await init();
  if (typeof id !== 'string' || !id.trim()) {
    throw new EvidenceStorageError('INVALID_DATA', 'id wajib teks, tidak boleh kosong.');
  }
  const all = await readAllMeta();
  const found = all.find((m) => m.id === id);
  if (!found) {
    throw new EvidenceStorageError('NOT_FOUND', `Evidence "${id}" tidak ditemukan.`);
  }
  return found;
}

// --- Internal ---

/**
 * Baca metadata SEMUA evidence yang pernah di-finish, lintas case.
 * Satu folder/entry yang korup atau nggak lengkap di-skip, bukan
 * menjatuhkan seluruh list — satu evidence rusak nggak boleh bikin
 * fitur "lihat daftar evidence" ikut mati.
 */
async function readAllMeta() {
  if (hasCapacitor()) {
    const Filesystem = window.Capacitor.Plugins.Filesystem;
    let entries;
    try {
      const res = await Filesystem.readdir({ path: EVIDENCE_DIR, directory: FS_DIRECTORY });
      entries = res.files ?? [];
    } catch {
      // Folder 'evidence' belum pernah dibuat (belum ada evidence sama sekali sejak install).
      return [];
    }

    const metas = [];
    for (const entry of entries) {
      const name = typeof entry === 'string' ? entry : entry.name;
      try {
        const metaRes = await Filesystem.readFile({
          path: `${EVIDENCE_DIR}/${name}/meta.json`,
          directory: FS_DIRECTORY,
          encoding: 'utf8',
        });
        metas.push(JSON.parse(metaRes.data));
      } catch {
        // meta.json hilang/korup untuk satu id -> skip entry ini saja.
      }
    }
    return metas;
  }

  const store = getStore();
  const metas = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key || !key.startsWith(PREFIX)) continue;
    try {
      const parsed = JSON.parse(store.getItem(key));
      if (parsed?.meta) metas.push(parsed.meta);
    } catch {
      // Satu key korup -> skip, jangan jatuhin semua list.
    }
  }
  return metas;
}

function concatChunks(chunks) {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Uint8Array -> base64. Dipotong per-chunk biar nggak overflow call stack buat data gede. */
function uint8ToBase64(bytes) {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Tulis meta.json doang buat backend Capacitor. data.bin udah selesai
 * ditulis progresif lewat appendEvidence (chunk demi chunk), jadi di sini
 * cuma nutup sesi dengan metadatanya.
 */
async function writeEvidenceMeta(id, record) {
  const Filesystem = window.Capacitor.Plugins.Filesystem;
  const base = `${EVIDENCE_DIR}/${id}`;
  try {
    await Filesystem.writeFile({
      path: `${base}/meta.json`,
      data: JSON.stringify(record),
      directory: FS_DIRECTORY,
      encoding: 'utf8',
      recursive: true,
    });
  } catch (err) {
    // Rollback: data.bin (dari appendEvidence) sudah ada tapi meta.json
    // gagal -> hapus seluruh folder biar nggak nyangkut yatim.
    try {
      await Filesystem.rmdir({ path: base, directory: FS_DIRECTORY, recursive: true });
    } catch {
      // Rollback gagal pun nggak fatal buat sesi ini.
    }
    throw new EvidenceStorageError('IO_ERROR', `Gagal menulis metadata evidence "${id}": ${err.message}`);
  }
}

/**
 * Backend localStorage doang (dipakai npm test, bukan device beneran).
 * Path Capacitor TIDAK lewat sini lagi -- lihat appendEvidence +
 * writeEvidenceMeta.
 */
async function writeEvidence(id, record, bytes) {
  const base64 = uint8ToBase64(bytes);
  const payload = JSON.stringify({ meta: record, dataBase64: base64 });
  guard(() => getStore().setItem(PREFIX + id, payload));
}

function getStore() {
  const store = globalThis.localStorage;
  if (!store) throw new Error('localStorage tidak ada di lingkungan ini');
  return store;
}

function guard(fn) {
  try {
    return fn();
  } catch (err) {
    if (err instanceof EvidenceStorageError) throw err;
    const isQuota = err?.name === 'QuotaExceededError' || err?.code === 22 || err?.code === 1014;
    throw new EvidenceStorageError(
      isQuota ? 'QUOTA' : 'IO_ERROR',
      isQuota ? 'Penyimpanan penuh.' : `Gagal mengakses penyimpanan: ${err.message}`
    );
  }
}
