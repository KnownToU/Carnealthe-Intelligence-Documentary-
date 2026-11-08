// Field wajib di manifest.json setiap Tool
export const manifestFields = ['id', 'name', 'version'];

// Capability yang boleh diminta Tool
export const allowedCapabilities = ['http', 'readFile', 'saveToCase'];

// Nama harus camelCase: hashTool, domainLookup
const camelCase = /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)*$/;

// Cek manifest.json. Dipanggil Registry sebelum Tool dimuat.
export function assertManifest(manifest) {
  const missing = manifestFields.filter((f) => !manifest[f]);
  if (missing.length > 0) {
    throw new Error('manifest kurang field: ' + missing.join(', '));
  }
  if (!camelCase.test(manifest.id)) {
    throw new Error('id harus camelCase: ' + manifest.id);
  }
  const caps = manifest.capabilities || [];
  const bad = caps.filter((c) => !allowedCapabilities.includes(c));
  if (bad.length > 0) {
    throw new Error('capability tidak dikenal: ' + bad.join(', '));
  }
  return manifest;
}

// Cek index.js export run(input, ctx)
export function assertTool(module) {
  if (typeof module.run !== 'function') {
    throw new Error('tool harus export run(input, ctx)');
  }
  return module;
}

/**
 * run(input, ctx) async, input & output = objek biasa.
 *
 * ctx hanya berisi capability yang diminta manifest:
 *   ctx.http(request)       -> response
 *   ctx.readFile(ref)       -> AsyncIterable<Uint8Array>
 *   ctx.saveToCase(caseId, data) -> void
 * Tidak ada akses database langsung.
 * Di V1 ini bukan security boundary.
 */