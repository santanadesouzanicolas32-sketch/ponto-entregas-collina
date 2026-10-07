/* Entregador: envia o próprio fechamento ao repositório do gerente (usa o banco do aparelho). */
/* ---------------- entregador: envia o próprio fechamento ---------------- */
const exportIntegrity = (text) => { try { return JSON.parse(text).integridade || null; } catch { return null; } };
/** Envia tudo o que há neste aparelho, somado ao que já está na nuvem (nunca apaga o que o gerente já recebeu). */
async function syncPush() {
  const cfg = syncConfig();
  if (!cfg || SYNC.off || !riderById(DB.user?.id)) return false;
  if (SYNC.running) { SYNC.again = true; return false; }
  SYNC.running = true; syncSet({ busy: true });
  const file = `entregas/${DB.user.id}.json`;
  let done = false;
  try {
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      const remote = await ghGetFile(cfg, file);
      let extra = [];
      if (remote.status === 200) { try { const o = JSON.parse(remote.text); if (o?.entregador?.id === DB.user.id && Array.isArray(o.turnos)) extra = o.turnos; } catch { /* arquivo ilegível: será refeito */ } }
      const exp = await buildExport(DB, now(), extra);
      if (!exp.turnos.length) { syncSet({ busy: false, ok: true, err: null }); return true; }       // nada para enviar ainda
      const unchanged = remote.status === 200 && exportIntegrity(remote.text) === exp.integridade;
      if (!unchanged || exp.turnos.some((s) => s.saida == null)) {                                  // turno aberto: renova a hora do envio
        try { await ghPutFile(cfg, file, JSON.stringify(exp), remote.status === 200 ? remote.sha : null, `${exp.entregador.nome} · ${fmtDateTime(now())}`); }
        catch (e) { if (e.status === 409 && attempt < 2) continue; throw e; }
      }
      done = true;
    }
    syncSet({ busy: false, ok: true, at: now(), err: null });
    return true;
  } catch (e) {
    syncSet({ busy: false, ok: false, err: e instanceof SyncErr ? e.message : 'Não consegui enviar agora.' });
    return false;
  } finally {
    SYNC.running = false;
    if (SYNC.again) { SYNC.again = false; syncSoon(1000); }
  }
}
/** Agenda o envio logo depois da última alteração (junta várias alterações seguidas em um só envio). */
function syncSoon(ms = 4000) {
  if (SYNC.off || !syncConfig()) return;
  clearTimeout(SYNC.timer);
  SYNC.timer = setTimeout(() => { syncPush(); }, ms);
}
SAVE_HOOKS.push(() => syncSoon());          // cada gravação agenda um envio
