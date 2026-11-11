/**
 * evidenceUpload.js
 * Jembatan antara `File` (konsep browser/DOM) dan evidenceStorage.js (yang
 * cuma kenal Uint8Array generik, nggak kenal File/Blob sama sekali).
 *
 * Dipisah dari evidenceStorage.js sengaja (SRP): evidenceStorage ngurusin
 * "simpen bytes ke disk", modul ini ngurusin "gimana cara motong File jadi
 * bytes". Dipisah dari panel (SRP juga): panel cuma manggil
 * uploadEvidenceFile() dan render hasil/errornya, nggak tau soal slicing.
 *
 * STATUS: happy path doang. BELUM ada: cancel upload di tengah jalan
 * (kalau mau batalin, satu-satunya cara sekarang nunggu sampe selesai atau
 * reload app — sama kelasnya kayak gap abortEvidence di evidenceStorage.js).
 */
import { beginEvidence, appendEvidence, finishEvidence, RECOMMENDED_CHUNK_SIZE } from './evidenceStorage.js';

/**
 * Upload satu File browser sebagai evidence milik sebuah Case, dipotong
 * jadi chunk biar nggak nelen seluruh file ke RAM sekaligus sebelum dikirim
 * (percuma storage-nya streaming kalau sisi sini masih baca sekali gede).
 *
 * @param {string} caseId
 * @param {File} file
 * @returns {Promise<object>} record evidence (sama bentuknya kayak hasil finishEvidence)
 */
export async function uploadEvidenceFile(caseId, file) {
  const sessionId = await beginEvidence(caseId, { name: file.name, mimeType: file.type });

  let offset = 0;
  while (offset < file.size) {
    const slice = file.slice(offset, offset + RECOMMENDED_CHUNK_SIZE);
    const buffer = await slice.arrayBuffer();
    await appendEvidence(sessionId, new Uint8Array(buffer));
    offset += RECOMMENDED_CHUNK_SIZE;
  }
  // file.size === 0 (file kosong) -> loop di atas nggak jalan sama sekali,
  // finishEvidence tetap dipanggil, hasilnya evidence 0 byte (gap yang udah
  // dicatat di evidenceStorage.js, bukan kejutan baru).

  return finishEvidence(sessionId);
}
