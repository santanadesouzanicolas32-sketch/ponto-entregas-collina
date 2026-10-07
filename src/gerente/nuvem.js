/* ============================================================
   Gerência: conexão automática - busca o que os entregadores enviaram (repositório privado do GitHub).
   ============================================================ */
let ETAGS = {};
try { ETAGS = JSON.parse(localStorage.getItem('ponto-gerente:etags') || '{}') || {}; } catch { ETAGS = {}; }
const saveEtags = () => { if (!MPERSIST) return; try { localStorage.setItem('ponto-gerente:etags', JSON.stringify(ETAGS)); } catch { /* ignore */ } };
const PULL = { busy: false, at: null, err: null, report: [] };

/** Baixa o arquivo de cada entregador (só os que mudaram), confere a integridade e junta à base. */
async function syncPull({ force = false } = {}) {
  const cfg = syncConfig();
  if (!cfg || PULL.busy) return null;
  PULL.busy = true; PULL.err = null;
  const report = []; let changed = 0;
  try {
    for (const r of ROSTER) {
      const g = await ghGetFile(cfg, `entregas/${r.id}.json`, force || !ST.riders[r.id] ? null : ETAGS[r.id]);       // sem dado guardado, baixa de novo
      if (g.status === 304) { report.push({ id: r.id, estado: 'igual' }); continue; }
      if (g.status === 404) { report.push({ id: r.id, estado: 'sem arquivo' }); continue; }
      let dono = null;
      try { dono = JSON.parse(g.text)?.entregador?.id; } catch { /* importTexts explica */ }
      if (dono && dono !== r.id) { report.push({ id: r.id, estado: 'erro', erro: 'O arquivo desta pasta pertence a outro entregador.' }); continue; }
      const x = (await importTexts([{ name: `nuvem · ${r.nome}`, text: g.text }]))[0];
      if (x && x.ok) { ETAGS[r.id] = g.etag; changed++; report.push({ id: r.id, estado: 'atualizado', ...x }); }
      else report.push({ id: r.id, estado: 'erro', erro: x ? x.erro : 'Arquivo ilegível.' });
    }
    saveEtags();
    if (changed) await mSave();
    PULL.at = Date.now();
  } catch (e) {
    PULL.err = e instanceof SyncErr ? e.message : 'Não consegui atualizar agora.';
  } finally { PULL.busy = false; PULL.report = report; }
  return { changed, report };
}
