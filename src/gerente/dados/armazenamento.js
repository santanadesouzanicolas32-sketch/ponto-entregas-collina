/* Gerência: estado e armazenamento (IndexedDB, com plano B no localStorage). */
/* ============================================================
   Sistema do gerente - dados: armazenamento, importação, validação e métricas.
   Todos os entregadores são medidos pelas MESMAS regras. Os números vêm só dos arquivos de fechamento enviados.
   ============================================================ */
const RCOLORS = { pedro: '#e0a84a', bruno: '#4cc3b0', joao: '#ee7468', kaua: '#a596f5', nicolas: '#5fb4ee', equipe: '#a89c8a' };
const STALE_DAYS = 2;                         // arquivo mais velho que isso = "desatualizado"
const MIN_NET_FOR_RATE = 4 * 3600;            // menos de 4 h líquidas no período: "poucos dados"
const MIN_TEAM_HOURS = 2 * 3600;              // faixa horária só vira referência com 2 h de equipe
const MIN_EXPECTED = 5;                       // índice ajustado só com pelo menos 5 entregas esperadas

const novoEstado = () => ({ v: 1, riders: {}, ignorados: {} });
// riders[id] = { id, nome, exportadoEm, turnos: [...] }; ignorados['rid|idDoTurno'] = { em, motivo }
let ST = novoEstado();
let MPERSIST = true;
const SAVE_ERROR_HOOKS = [];                  // a tela se registra aqui para avisar quando não foi possível gravar

/* ---------------- armazenamento (IndexedDB, com plano B no localStorage) ---------------- */
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('ponto-gerente', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function mLoad() {
  try {
    const db = await idbOpen();
    const v = await new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get('st'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    if (v && v.riders) ST = v;
  } catch {
    try { const raw = localStorage.getItem('ponto-gerente'); if (raw) ST = JSON.parse(raw); } catch { /* sem dados salvos */ }
  }
  if (!ST.riders) ST = novoEstado();
  if (!ST.ignorados) ST.ignorados = {};
  MC = null;
}
async function mSave() {
  MC = null;
  if (!MPERSIST) return;
  try {
    const db = await idbOpen();
    await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(ST, 'st'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  } catch {
    try { localStorage.setItem('ponto-gerente', JSON.stringify(ST)); } catch { for (const f of SAVE_ERROR_HOOKS) f('Não consegui salvar neste navegador.'); }
  }
}

/* ---------------- turnos ignorados (ex.: nome trocado por engano, turno de teste) ----------------
   Nada é apagado: o turno continua guardado e pode ser restaurado; só deixa de entrar nas análises. */
const ignKey = (rid, sid) => `${rid}|${sid}`;
const isIgnored = (rid, sid) => !!ST.ignorados?.[ignKey(rid, sid)];
const activeTurnos = (rid) => (ST.riders[rid]?.turnos || []).filter((s) => !isIgnored(rid, s.id));
async function ignoreShift(rid, sid, motivo) { (ST.ignorados ||= {})[ignKey(rid, sid)] = { em: now(), motivo: str(motivo, 60) }; await mSave(); }
async function restoreShift(rid, sid) { if (ST.ignorados) delete ST.ignorados[ignKey(rid, sid)]; await mSave(); }
function ignoredList() {
  const out = [];
  for (const r of ROSTER) for (const s of ST.riders[r.id]?.turnos || []) {
    const i = ST.ignorados?.[ignKey(r.id, s.id)];
    if (i) out.push({ rid: r.id, sid: s.id, data: s.data, entregas: s.entregas.filter((e) => !e.excluida).length, motivo: i.motivo, em: i.em });
  }
  return out.sort((a, b) => b.em - a.em);
}
