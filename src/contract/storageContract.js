export const storageMethods = [
  // lifecycle
  'init', 'open', 'close',
  // cases
  'createCase', 'getCase', 'listCases', 'updateCase', 'deleteCase',
  // notes
  'addNote', 'listNotes', 'updateNote', 'deleteNote',
  // evidence write (sesi)
  'beginEvidence', 'appendEvidence', 'finishEvidence', 'abortEvidence',
  // evidence read & delete
  'listEvidence', 'getEvidenceMeta', 'readEvidence', 'deleteEvidence',
];

// Cek implementasi punya semua method. Dipanggil Registry saat storage didaftarkan.
export function assertStorage(impl) {
  const missing = storageMethods.filter((m) => typeof impl[m] !== 'function');
  if (missing.length > 0) {
    throw new Error('storage kurang method: ' + missing.join(', '));
  }
  return impl;
}

/**
 * Semua method async.
 *
 * open()                     -> buang temp evidence yatim (aturan cleanup V1)
 * beginEvidence(caseId, meta)-> sessionId
 * appendEvidence(sessionId, chunk: Uint8Array) -> void
 * finishEvidence(sessionId)  -> record { id, caseId, hash, size, ... }
 *                               (hash dihitung Storage, bukan pemanggil)
 * abortEvidence(sessionId)   -> void
 * readEvidence(id)           -> AsyncIterable<Uint8Array>
 * deleteEvidence(id)         -> file fisik dihapus hanya kalau
 *                               record terakhir yang nunjuk hash itu hilang
 */