/* Forma canônica do JSON e SHA-256 (código de integridade dos arquivos). */
// Formato estável (versão 2). A "integridade" é um SHA-256 do conteúdo: o gerente vê se o arquivo foi alterado ou corrompido.
const EXPORT_FORMAT = 'ponto-collina/entregas';
function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}
async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
