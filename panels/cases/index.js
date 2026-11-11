/**
 * Panel Cases.
 * Langkah 1: list case + bikin case baru.
 * Langkah 2: klik satu case -> tampilin detail + notes-nya (getCase udah
 *   mengembalikan notes sekalian, jadi nggak perlu panggil listNotes terpisah).
 *
 * Pola sama persis kayak panels/settingsModules/index.js: panel ini CUMA
 * render + event, logika data (validasi, simpan) semua di caseStorage.js.
 * Teks dari user (title/note) selalu lewat textContent, bukan innerHTML —
 * aman XSS.
 *
 * Nggak ada "router" buat pindah list <-> detail: cuma dua fungsi
 * (showList/showDetail) yang gantian ngisi `body` yang sama. Lebih simpel
 * daripada daftarin panel/hash baru buat sekadar tampilan sub-view.
 */
import { listCases, createCase, getCase, addNote } from '../../src/services/caseStorage.js';
import { listEvidence, readEvidence } from '../../src/services/evidenceStorage.js';
import { uploadEvidenceFile } from '../../src/services/evidenceUpload.js';
import { downloadEvidence } from '../../src/services/evidenceDownload.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Format ukuran byte jadi teks gampang dibaca (B/KB/MB/GB). */
function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '? B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

/**
 * Download isi evidence ke user lewat <a download>.
 *
 * PENTING (soal security, jangan diubah tanpa diskusi eksplisit):
 * Blob SELALU dipaksa type 'application/octet-stream' apa pun
 * meta.mimeType aslinya, dan isinya SELALU lewat <a download> (bukan
 * window.open / iframe). meta.mimeType itu data gak terpercaya (asal dari
 * file upload user) — kalau dipercaya buat nentuin cara render dan sampe
 * dirender sebagai HTML aktif di WebView yang sama dengan app, itu nembus
 * ke jembatan Capacitor. mimeType cuma boleh ditampilin sebagai teks info.
 */
function downloadEvidence(meta, bytes) {
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = el('a');
  link.href = url;
  link.download = meta.name || meta.id;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function itemRow(name, meta) {
  const row = el('li', 'module-row');
  const info = el('div', 'module-row__info');
  info.append(el('div', 'module-row__name', name), el('div', 'module-row__meta', meta));
  row.append(info);
  return row;
}

export default {
  render() {
    const root = el('div', 'panel panel--cases');
    const body = el('div', 'panel__body');
    root.append(el('h1', 'panel__title', 'Cases'), el('p', 'panel__subtitle', 'Daftar case'), body);

    function showList() {
      body.replaceChildren();

      const list = el('ul', 'module-list');
      const feedback = el('p', 'module-feedback');
      feedback.setAttribute('role', 'status');

      const newBtn = el('button', 'btn btn--primary', 'Case Baru');
      newBtn.type = 'button';

      function setFeedback(text, kind = 'info') {
        feedback.textContent = text;
        feedback.className = `module-feedback module-feedback--${kind}`;
      }

      function renderRow(item) {
        const row = itemRow(item.title, `${item.id} · ${new Date(item.createdAt).toLocaleString()}`);
        row.addEventListener('click', () => showDetail(item.id));
        return row;
      }

      async function refreshList() {
        list.replaceChildren();
        try {
          const items = await listCases();
          if (items.length === 0) {
            list.append(el('li', 'module-empty', 'Belum ada case.'));
            return;
          }
          items.forEach((item) => list.append(renderRow(item)));
        } catch (err) {
          setFeedback(`Gagal membaca daftar case: ${err.message}`, 'error');
        }
      }

      newBtn.addEventListener('click', async () => {
        const title = prompt('Judul case baru:');
        if (title === null) return; // user cancel

        newBtn.disabled = true;
        try {
          await createCase(title);
          setFeedback('Case dibuat.', 'success');
          await refreshList();
        } catch (err) {
          setFeedback(err.message, 'error');
        } finally {
          newBtn.disabled = false;
        }
      });

      body.append(newBtn, list, feedback);
      refreshList();
    }

    async function showDetail(caseId) {
      body.replaceChildren();

      const backBtn = el('button', 'btn btn--primary', '← Kembali');
      backBtn.type = 'button';
      backBtn.addEventListener('click', showList);

      const caseTitle = el('h2', 'panel__title', '...');

      const uploadBtn = el('button', 'btn btn--primary', 'Upload Evidence');
      uploadBtn.type = 'button';
      const fileInput = el('input');
      fileInput.type = 'file';
      fileInput.style.display = 'none';

      const evidenceSectionTitle = el('h3', 'module-section-title', 'Evidence');
      const evidenceList = el('ul', 'module-list');

      const notesList = el('ul', 'module-list');

      const noteInput = el('input', 'input');
      noteInput.type = 'text';
      noteInput.placeholder = 'Tulis catatan...';

      const addNoteBtn = el('button', 'btn btn--primary', 'Tambah Note');
      addNoteBtn.type = 'button';

      const feedback = el('p', 'module-feedback');
      feedback.setAttribute('role', 'status');

      body.append(
        backBtn,
        caseTitle,
        uploadBtn,
        fileInput,
        evidenceSectionTitle,
        evidenceList,
        notesList,
        noteInput,
        addNoteBtn,
        feedback
      );

      function setFeedback(text, kind = 'info') {
        feedback.textContent = text;
        feedback.className = `module-feedback module-feedback--${kind}`;
      }

      async function refreshNotes() {
        notesList.replaceChildren();
        const kasus = await getCase(caseId); // biar NOT_FOUND/CORRUPT ketangkep di pemanggil
        if (kasus.notes.length === 0) {
          notesList.append(el('li', 'module-empty', 'Belum ada catatan di case ini.'));
          return;
        }
        kasus.notes.forEach((note) => {
          notesList.append(itemRow(note.text, new Date(note.createdAt).toLocaleString()));
        });
      }

      function evidenceRow(item) {
        const row = el('li', 'module-row');
        const info = el('div', 'module-row__info');
        info.append(
          el('div', 'module-row__name', item.name),
          el('div', 'module-row__meta', `${formatBytes(item.size)} · ${item.mimeType}`)
        );

        const dlBtn = el('button', 'btn btn--primary', 'Download');
        dlBtn.type = 'button';
        dlBtn.addEventListener('click', async () => {
          dlBtn.disabled = true;
          dlBtn.textContent = 'Memuat...';
          try {
            const { meta, bytes } = await readEvidence(item.id);
            downloadEvidence(meta, bytes);
          } catch (err) {
            setFeedback(`Gagal mengunduh evidence: ${err.message}`, 'error');
          } finally {
            dlBtn.disabled = false;
            dlBtn.textContent = 'Download';
          }
        });

        row.append(info, dlBtn);
        return row;
      }

      async function refreshEvidence() {
        evidenceList.replaceChildren();
        try {
          const evidence = await listEvidence(caseId);
          evidenceSectionTitle.textContent = `Evidence (${evidence.length})`;
          if (evidence.length === 0) {
            evidenceList.append(el('li', 'module-empty', 'Belum ada evidence di case ini.'));
            return;
          }
          evidence.forEach((item) => evidenceList.append(evidenceRow(item)));
        } catch (err) {
          evidenceSectionTitle.textContent = 'Evidence (?)';
          setFeedback(`Gagal membaca daftar evidence: ${err.message}`, 'error');
        }
      }

      uploadBtn.addEventListener('click', () => fileInput.click());

      fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return; // user buka dialog lalu cancel

        uploadBtn.disabled = true;
        setFeedback('Mengunggah...', 'info');
        try {
          await uploadEvidenceFile(caseId, file);
          setFeedback('Evidence terunggah.', 'success');
          await refreshEvidence();
        } catch (err) {
          setFeedback(`Gagal upload evidence: ${err.message}`, 'error');
        } finally {
          uploadBtn.disabled = false;
          fileInput.value = ''; // biar file yang sama bisa dipilih ulang
        }
      });

      addNoteBtn.addEventListener('click', async () => {
        const text = noteInput.value;
        addNoteBtn.disabled = true;
        try {
          await addNote(caseId, text);
          noteInput.value = '';
          setFeedback('Note ditambahkan.', 'success');
          await refreshNotes();
        } catch (err) {
          setFeedback(err.message, 'error');
        } finally {
          addNoteBtn.disabled = false;
        }
      });

      try {
        const kasus = await getCase(caseId);
        caseTitle.textContent = kasus.title;
        await refreshNotes();
      } catch (err) {
        caseTitle.textContent = 'Case';
        setFeedback(`Gagal memuat case: ${err.message}`, 'error');
      }

      // Terpisah dari try di atas: evidence gagal dibaca nggak boleh
      // bikin notes ikut nggak ke-render.
      await refreshEvidence();
    }

    showList();
    return root;
  },
};
