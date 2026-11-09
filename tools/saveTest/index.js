/**
 * saveTest — Tool SEMENTARA buat verifikasi ctx.saveToCase lewat UI beneran.
 * Hapus folder ini (+ jalankan `npm run scan`) begitu panel Cases udah ada
 * tombol "Buat Case" sendiri.
 *
 * CATATAN arsitektur: tool ini import caseStorage.js langsung buat tombol
 * "Buat case dummy" — itu BUKAN lewat ctx, karena belum ada capability resmi
 * buat createCase. Boleh di sini karena ini tool builtin (trusted, sama kayak
 * kode app sendiri), tapi JANGAN dicontoh buat tool permanen yang nyimpen
 * data biasa — nyimpen data harus lewat ctx.saveToCase, bukan import langsung.
 */
import { createCase } from '../../src/services/caseStorage.js';

export default {
  render(ctx) {
    const root = document.createElement('div');
    root.className = 'panel';

    root.innerHTML = `
      <div class="panel__header">
        <h2 class="panel__title">Save Test</h2>
        <p class="panel__subtitle">Tes ctx.saveToCase — sementara</p>
      </div>
      <div class="panel__body" style="display:flex;flex-direction:column;gap:1rem;">
        <button id="st-new-case" class="btn btn--secondary">Buat case dummy</button>
        <p id="st-case-id" style="font-size:.8rem;color:var(--color-text-muted);"></p>

        <input id="st-case-input" placeholder="caseId (hasil dari tombol di atas)"
          style="background:var(--color-surface);color:var(--color-text);border:1px solid var(--color-secondary);border-radius:6px;padding:.6rem;font-size:.85rem;" />
        <textarea id="st-text" rows="3" placeholder="Teks yang mau disimpan ke case..."
          style="background:var(--color-surface);color:var(--color-text);border:1px solid var(--color-secondary);border-radius:6px;padding:.75rem;font-size:.9rem;"></textarea>
        <button id="st-save" class="btn btn--primary">Simpan ke Case (ctx.saveToCase)</button>

        <pre id="st-result" style="white-space:pre-wrap;word-break:break-all;background:var(--color-surface);padding:.75rem;border-radius:6px;font-size:.8rem;border:1px solid var(--color-secondary);"></pre>
      </div>
    `;

    const caseIdLabel = root.querySelector('#st-case-id');
    const caseInput = root.querySelector('#st-case-input');
    const textInput = root.querySelector('#st-text');
    const result = root.querySelector('#st-result');

    root.querySelector('#st-new-case').addEventListener('click', async () => {
      try {
        const kasus = await createCase('Case dummy buat tes saveToCase');
        caseIdLabel.textContent = `Dibuat: ${kasus.id}`;
        caseInput.value = kasus.id;
      } catch (err) {
        caseIdLabel.textContent = `Error bikin case: ${err.message}`;
      }
    });

    root.querySelector('#st-save').addEventListener('click', async () => {
      result.textContent = '...';
      try {
        if (typeof ctx.saveToCase !== 'function') {
          throw new Error('ctx.saveToCase bukan function — cek capability gating / manifest.');
        }
        const note = await ctx.saveToCase(caseInput.value.trim(), textInput.value);
        result.textContent = 'OK:\n' + JSON.stringify(note, null, 2);
      } catch (err) {
        result.textContent = 'ERROR: ' + err.message;
      }
    });

    return root;
  },
};
