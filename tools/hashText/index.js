/**
 * hashText — Tool pertama CID.
 * Hash teks pakai SHA-256 / SHA-1 / MD5 (via SubtleCrypto).
 * Murni UI + logic lokal, tidak butuh ctx sama sekali.
 *
 * export default { render(ctx) } — ctx ada tapi tidak dipakai,
 * karena manifest tidak declare capabilities.
 */

async function hashWith(algorithm, text) {
  const encoded = new TextEncoder().encode(text);
  const buffer = await crypto.subtle.digest(algorithm, encoded);
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export default {
  render(ctx) {
    const root = document.createElement('div');
    root.className = 'panel';

    root.innerHTML = `
      <div class="panel__header">
        <h2 class="panel__title">Hash Text</h2>
        <p class="panel__subtitle">SHA-256 · SHA-1</p>
      </div>
      <div class="panel__body" style="display:flex;flex-direction:column;gap:1rem;">
        <textarea id="ht-input" rows="4" placeholder="Ketik teks di sini..."
          style="background:var(--color-surface);color:var(--color-text);border:1px solid var(--color-secondary);border-radius:6px;padding:.75rem;font-size:.9rem;resize:vertical;"></textarea>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
          <button id="ht-sha256" class="btn btn--primary">SHA-256</button>
          <button id="ht-sha1"   class="btn btn--secondary">SHA-1</button>
          <button id="ht-clear"  class="btn btn--ghost">Clear</button>
        </div>
        <div id="ht-result" style="display:none;">
          <p style="font-size:.75rem;color:var(--color-text-muted);margin-bottom:.25rem;" id="ht-result-label">SHA-256</p>
          <code id="ht-result-value"
            style="display:block;background:var(--color-surface);padding:.75rem;border-radius:6px;
                   word-break:break-all;font-size:.8rem;cursor:pointer;border:1px solid var(--color-secondary);"
            title="Klik untuk copy"></code>
          <p id="ht-copy-hint" style="font-size:.7rem;color:var(--color-accent);margin-top:.25rem;display:none;">Tersalin!</p>
        </div>
      </div>
    `;

    const input  = root.querySelector('#ht-input');
    const result = root.querySelector('#ht-result');
    const label  = root.querySelector('#ht-result-label');
    const value  = root.querySelector('#ht-result-value');
    const hint   = root.querySelector('#ht-copy-hint');

    async function run(algo, algoLabel) {
      const text = input.value;
      if (!text.trim()) { result.style.display = 'none'; return; }
      value.textContent = '...';
      result.style.display = 'block';
      label.textContent = algoLabel;
      try {
        value.textContent = await hashWith(algo, text);
      } catch (e) {
        value.textContent = 'Error: ' + e.message;
      }
    }

    root.querySelector('#ht-sha256').addEventListener('click', () => run('SHA-256', 'SHA-256'));
    root.querySelector('#ht-sha1').addEventListener('click',   () => run('SHA-1',   'SHA-1'));
    root.querySelector('#ht-clear').addEventListener('click',  () => {
      input.value = '';
      result.style.display = 'none';
    });

    value.addEventListener('click', async () => {
      if (!value.textContent || value.textContent === '...') return;
      try {
        await navigator.clipboard.writeText(value.textContent);
        hint.style.display = 'block';
        setTimeout(() => { hint.style.display = 'none'; }, 1500);
      } catch {}
    });

    return root;
  }
};
