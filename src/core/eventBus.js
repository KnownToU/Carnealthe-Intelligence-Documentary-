/**
 * eventBus.js
 * Sistem komunikasi antarmodul.
 *
 * Modul tidak boleh saling import langsung — mereka bicara lewat sini.
 * Seperti radio: ada yang siaran, ada yang dengerin, mereka tidak perlu kenal satu sama lain.
 */

const listeners = new Map();

/**
 * Daftarkan listener untuk sebuah event.
 *
 * @param {string} event  - Nama event, misalnya "panel:open"
 * @param {Function} fn   - Fungsi yang dipanggil saat event terjadi
 * @returns {Function}    - Fungsi unsubscribe (panggil ini untuk berhenti dengerin)
 */
export function on(event, fn) {
  if (!listeners.has(event)) {
    listeners.set(event, []);
  }

  listeners.get(event).push(fn);

  // Return unsubscribe function.
  // Belum wajib dipakai sekarang, tapi sudah tersedia kalau nanti butuh.
  return function unsubscribe() {
    const fns = listeners.get(event);
    if (!fns) return;

    const index = fns.indexOf(fn);
    if (index !== -1) fns.splice(index, 1);
  };
}

/**
 * Kirim event ke semua listener yang terdaftar.
 *
 * @param {string} event  - Nama event
 * @param {*} data        - Data yang dikirim (opsional)
 */
export function emit(event, data) {
  const fns = listeners.get(event);
  if (!fns || fns.length === 0) return;

  // Salin array dulu sebelum loop.
  // Supaya kalau listener unsubscribe di tengah loop, tidak merusak iterasi.
  [...fns].forEach(fn => fn(data));
}

/**
 * Hanya dengerin event satu kali, lalu otomatis berhenti.
 *
 * @param {string} event
 * @param {Function} fn
 */
export function once(event, fn) {
  const unsub = on(event, function handler(data) {
    fn(data);
    unsub();
  });
}
