/* Banco do aparelho do entregador (localStorage): validação, leitura e gravação. */
/* ---------------- armazenamento ---------------- */
const KEY = 'ponto-collina:v1';
const emptyDb = () => ({ v: 1, user: null, shifts: [], prefs: { autoPhoto: true } });
let DB = emptyDb();
let persist = true;                         // desligado nos autotestes
let storageOk = true;
const SAVE_HOOKS = [];                      // quem quiser saber que o banco foi gravado (ex.: envio ao gerente) se registra aqui


/** Valida e limpa um objeto vindo do disco/backup. Joga erro se não for um backup válido. Turnos de teste/exemplo antigos são descartados. */
function sanitizeDb(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.shifts)) throw new Error('Arquivo de backup inválido.');
  if (d.shifts.length > 5000) throw new Error('Backup grande demais.');
  const out = emptyDb();
  if (d.user && typeof d.user === 'object') {
    const goal = Number(d.user.goal);
    const nm = str(d.user.name, 60).trim() || 'Entregador', r = riderById(d.user.id) || riderByName(nm);
    out.user = { name: r ? r.nome : nm, id: r ? r.id : null, goal: Number.isInteger(goal) && goal >= 1 && goal <= 1000 ? goal : 60 };
  }
  out.prefs.autoPhoto = d.prefs?.autoPhoto !== false;
  for (const s of d.shifts) {
    if (!s || s.test || s.demo || !isNum(s.start) || !isNum(s.sched) || !isNum(s.plannedEnd) || !/^\d{4}-\d{2}-\d{2}$/.test(String(s.date))) continue;
    if (s.plannedEnd <= s.sched || (s.end != null && (!isNum(s.end) || s.end <= s.start))) continue;
    const sh = {
      id: str(s.id, 64) || uid(), date: s.date, preset: s.preset === 16 ? 16 : 15, sched: s.sched, plannedEnd: s.plannedEnd,
      start: s.start, end: s.end ?? null, closeReason: s.closeReason === 'auto' ? 'auto' : null, breaks: [], deliveries: [],
    };
    for (const b of Array.isArray(s.breaks) ? s.breaks : []) {
      if (isNum(b?.s) && (b.e == null || (isNum(b.e) && b.e > b.s))) sh.breaks.push({ s: b.s, e: b.e ?? null });
    }
    for (const x of Array.isArray(s.deliveries) ? s.deliveries : []) {
      if (!x || !isNum(x.t)) continue;
      try {
        const blk = normalizeBlock(x.block), a = normalizeApt(x.apt);
        const dd0 = { id: str(x.id, 64) || uid(), t: x.t, block: blk, apt: a.apt, floor: a.floor, review: !!x.review, source: x.source === 'photo' ? 'photo' : 'manual', del: !!x.del, v: Number.isInteger(x.v) && x.v >= 0 && x.v <= 1000000 ? x.v : null };
        const dd = sh.deliveries[sh.deliveries.push(dd0) - 1];
        if (x.rid) dd.rid = str(x.rid, 64);
        if (isNum(x.edAt)) dd.edAt = x.edAt;
        if (isNum(x.delAt)) dd.delAt = x.delAt;
        if (x.late && isNum(x.regAt)) { dd.late = true; dd.regAt = x.regAt; }
        if (x.orig && typeof x.orig === 'object') {
          try { const ob = normalizeBlock(x.orig.block), oa = normalizeApt(x.orig.apt); dd.orig = { block: ob, apt: oa.apt, v: Number.isInteger(x.orig.v) && x.orig.v >= 0 && x.orig.v <= 1000000 ? x.orig.v : null }; } catch { /* original inválido é ignorado */ }
        }
      } catch { /* entrega inválida é descartada */ }
    }
    sh.deliveries.sort((p, q) => p.t - q.t);
    out.shifts.push(sh);
  }
  // só um turno aberto
  const open = out.shifts.filter((s) => s.end == null);
  if (open.length > 1) open.slice(0, -1).forEach((s) => { s.end = Math.min(s.plannedEnd, s.start + 1000); s.closeReason = 'auto'; });
  return out;
}

/** Um backup de outra pessoa não pode substituir os dados deste aparelho. */
function assertSameRider(user, importedUser) {
  if (user?.id && importedUser?.id && user.id !== importedUser.id) throw new AppErr('OTHER_RIDER', 'Este backup é de outra pessoa. Não foi restaurado.');
}

function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); }
  catch { storageOk = false; DB = emptyDb(); return; }       // armazenamento bloqueado (modo privado)
  if (!raw) return;
  try { DB = sanitizeDb(JSON.parse(raw)); }
  catch {
    // dados ilegíveis: guarda uma cópia para recuperação em vez de apagar em silêncio
    try { localStorage.setItem(KEY + ':corrompido', raw); } catch { /* ignore */ }
    DB = emptyDb();
  }
}
function save() {
  if (!persist) return;
  try { localStorage.setItem(KEY, JSON.stringify(DB)); }
  catch { storageOk = false; }
  for (const f of SAVE_HOOKS) f();
}

/* ---------------- consultas ---------------- */
const openShift = () => DB.shifts.find((s) => s.end == null) || null;
const liveDeliveries = (s) => s.deliveries.filter((d) => !d.del);
const userGoal = () => DB.user?.goal || 60;
