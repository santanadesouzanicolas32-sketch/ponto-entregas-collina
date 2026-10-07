/* ============================================================
   Conexão automática entre o aplicativo dos entregadores e a gerência.
   Os dados vão para um repositório PRIVADO do GitHub (um arquivo por entregador: entregas/<id>.json),
   usando uma chave de acesso (token) limitada a esse repositório. Cada envio é um commit: fica o histórico.
   Sem conexão configurada, nada disto roda e continua valendo o envio por arquivo.
   ============================================================ */
const SYNC_CFG_KEY = 'ponto-collina:sync';
const SYNC_DEFAULT_REPO = 'santanadesouzanicolas32-sketch/ponto-dados';
const SYNC = { cfg: undefined, fetch: null, off: false, timer: null, running: false, again: false, listeners: [], state: { busy: false, ok: false, at: null, err: null } };
class SyncErr extends Error { constructor(msg, status = 0) { super(msg); this.status = status; } }

/* ---------------- configuração (fica só neste aparelho) ---------------- */
const validRepo = (r) => typeof r === 'string' && /^[\w.-]{1,100}\/[\w.-]{1,100}$/.test(r);
const validToken = (t) => typeof t === 'string' && /^[\w-]{20,255}$/.test(t);
function syncConfig() {
  if (SYNC.cfg !== undefined) return SYNC.cfg;
  let c = null;
  try { const o = JSON.parse(localStorage.getItem(SYNC_CFG_KEY) || 'null'); if (o && validRepo(o.repo) && validToken(o.token)) c = { repo: o.repo, token: o.token }; } catch { /* sem configuração */ }
  return (SYNC.cfg = c);
}
function setSyncConfig(c) {
  SYNC.cfg = c && validRepo(c.repo) && validToken(c.token) ? { repo: c.repo, token: c.token } : null;
  try { if (SYNC.cfg) localStorage.setItem(SYNC_CFG_KEY, JSON.stringify(SYNC.cfg)); else localStorage.removeItem(SYNC_CFG_KEY); } catch { /* ignore */ }
  return SYNC.cfg;
}
const b64url = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => new TextDecoder().decode(Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
/** Link que o gerente manda aos entregadores: leva a conexão no trecho depois do # (não vai para nenhum servidor). */
function syncLink(base, cfg = syncConfig()) { return cfg ? `${base}#sync=${b64url(JSON.stringify({ r: cfg.repo, t: cfg.token }))}` : null; }
function parseSyncHash(hash = location.hash) {
  const m = /^#sync=([\w-]+)$/.exec(hash || '');
  if (!m) return null;
  try { const o = JSON.parse(unb64url(m[1])); return validRepo(o.r) && validToken(o.t) ? { repo: o.r, token: o.t } : null; } catch { return null; }
}
/* ---------------- GitHub (contents API) ---------------- */
async function ghReq(cfg, path, { method = 'GET', accept = 'application/vnd.github+json', headers = {}, body } = {}) {
  try {
    return await (SYNC.fetch || fetch)(`https://api.github.com${path}`, {
      method, cache: 'no-store', body,
      headers: { Authorization: `Bearer ${cfg.token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    });
  } catch { throw new SyncErr('Sem internet agora.', 0); }
}
function ghFail(r) {
  if (r.status === 401) return new SyncErr('A chave de acesso (token) é inválida ou venceu. Gere outra e conecte de novo.', 401);
  if (r.status === 403) return new SyncErr(r.headers.get('x-ratelimit-remaining') === '0' ? 'O GitHub pediu uma pausa. Tente de novo em alguns minutos.' : 'A chave de acesso não tem permissão neste repositório (precisa de Contents: leitura e escrita).', 403);
  if (r.status === 404) return new SyncErr('Repositório não encontrado para esta chave de acesso.', 404);
  if (r.status === 409 || r.status === 422) return new SyncErr('Conflito de versão.', 409);
  return new SyncErr(`O GitHub respondeu com erro ${r.status}.`, r.status);
}
/** Confere repositório e permissão de escrita. Devolve o nome completo do repositório. */
async function ghCheck(cfg) {
  const r = await ghReq(cfg, `/repos/${cfg.repo}`);
  if (!r.ok) throw ghFail(r);
  const j = await r.json();
  if (j.permissions && j.permissions.push === false) throw new SyncErr('Esta chave de acesso só consegue ler. Ela precisa de Contents: leitura e escrita.', 403);
  return { name: j.full_name || cfg.repo, private: j.private !== false };
}
/** Lê um arquivo do repositório. 304 = igual ao que você já tinha (etag). */
async function ghGetFile(cfg, file, etag = null) {
  const r = await ghReq(cfg, `/repos/${cfg.repo}/contents/${file}`, { accept: 'application/vnd.github.raw+json', headers: etag ? { 'If-None-Match': etag } : {} });
  if (r.status === 304) return { status: 304 };
  if (r.status === 404) return { status: 404 };
  if (!r.ok) throw ghFail(r);
  const tag = r.headers.get('etag') || '';
  return { status: 200, text: await r.text(), etag: tag, sha: tag.replace(/^W\//, '').replace(/"/g, '') };
}
function utf8ToB64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function ghPutFile(cfg, file, text, sha, message) {
  const r = await ghReq(cfg, `/repos/${cfg.repo}/contents/${file}`, { method: 'PUT', body: JSON.stringify({ message, content: utf8ToB64(text), ...(sha ? { sha } : {}) }) });
  if (!r.ok) throw ghFail(r);
  const j = await r.json();
  return j.content?.sha || null;
}

/* ---------------- estado e avisos para a tela ---------------- */
function syncSet(patch) { Object.assign(SYNC.state, patch); for (const f of SYNC.listeners) { try { f(SYNC.state); } catch { /* tela fora */ } } }
const syncText = () => {
  const s = SYNC.state;
  if (!syncConfig()) return 'Sem conexão automática';
  if (s.busy) return 'Enviando…';
  if (s.err) return s.err;
  return s.at ? `Enviado às ${fmtTime(s.at)}` : 'Conectado';
};
