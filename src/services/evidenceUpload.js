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
 * STATUS: BELUM ada tombol "batalin" manual dari UI (user belum bisa
 * motong upload yang lagi jalan sendiri). Tapi kalau upload-nya GAGAL
 * sendiri di tengah jalan (disk penuh, dll), sesinya sekarang dibersihin
 * pake abortEvidence() -- lihat catatan di dalam fungsi.
 */
import { beginEvidence, appendEvidence, finishEvidence, abortEvidence, RECOMMENDED_CHUNK_SIZE } from './evidenceStorage.js';

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

  try {
    let offset = 0;
    while (offset < file.size) {
      const slice = file.slice(offset, offset + RECOMMENDED_CHUNK_SIZE);
      const buffer = await slice.arrayBuffer();
      await appendEvidence(sessionId, new Uint8Array(buffer));
      offset += RECOMMENDED_CHUNK_SIZE;
    }
    // file.size === 0 (file kosong) -> loop di atas nggak jalan sama sekali,
    // finishEvidence tetap dipanggil, hasilnya evidence 0 byte (gap yang
    // udah dicatat di evidenceStorage.js, bukan kejutan baru).
  } catch (err) {
    // appendEvidence gagal di tengah jalan -> sesi masih nyangkut di memory
    // DAN folder evidence/{id} separuh jalan masih ada di disk kalau nggak
    // dibersihin. abortEvidence nutup dua-duanya. Kalau abort-nya sendiri
    // gagal, biarin aja -- yang paling penting error ASLI (penyebab upload
    // gagal) tetep nyampe ke pemanggil, bukan error dari cleanup.
    try {
      await abortEvidence(sessionId);
    } catch {
      // non-fatal, lihat alasan di atas.
    }
    throw err;
  }

  return finishEvidence(sessionId);
}
