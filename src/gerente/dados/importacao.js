/* Gerência: validação e junção dos arquivos dos entregadores. */
/* ---------------- validação e importação ---------------- */
class ImportErr extends Error {}

/** Limpa os turnos de um arquivo: descarta o que for inválido e conta o que foi descartado. */
function cleanShifts(raw, riderId) {
  if (!Array.isArray(raw)) throw new ImportErr('Arquivo sem a lista de turnos.');
  if (raw.length > 5000) throw new ImportErr('Arquivo grande demais.');
  const out = []; let dropped = 0, droppedShifts = 0;
  for (const s of raw) {
    if (!s || !isNum(s.entrada) || !isNum(s.previstoIni) || !isNum(s.previstoFim) || !/^\d{4}-\d{2}-\d{2}$/.test(String(s.data)) || s.previstoFim <= s.previstoIni
      || (s.saida != null && (!isNum(s.saida) || s.saida <= s.entrada))) { droppedShifts++; continue; }
    const sh = { id: str(s.id, 64) || `${riderId}-${s.data}-${s.entrada}`, data: s.data, preset: s.preset === 16 ? 16 : 15, previstoIni: s.previstoIni, previstoFim: s.previstoFim,
      entrada: s.entrada, entradaOriginal: isNum(s.entradaOriginal) && s.entradaOriginal > s.entrada ? s.entradaOriginal : null, saida: s.saida ?? null, saidaAutomatica: !!s.saidaAutomatica, pausas: [], entregas: [] };
    for (const p of Array.isArray(s.pausas) ? s.pausas : []) if (p && isNum(p.i) && (p.f == null || (isNum(p.f) && p.f > p.i))) sh.pausas.push({ i: p.i, f: p.f ?? null });
    for (const d of Array.isArray(s.entregas) ? s.entregas : []) {
      try {
        if (!d || !isNum(d.t)) throw new Error('t');
        const b = normalizeBlock(d.bloco), a = normalizeApt(d.apto);
        const e = { id: str(d.id, 64) || `${sh.id}-${d.t}`, t: d.t, bloco: b, apto: a.apt, andar: a.floor, valor: isInt(d.valor) && d.valor >= 0 && d.valor <= 1000000 ? d.valor : null,
          origem: d.origem === 'foto' || d.origem === 'photo' ? 'photo' : 'manual', conferir: !!d.conferir, original: null, editadaEm: isNum(d.editadaEm) ? d.editadaEm : null,
          excluida: !!d.excluida, excluidaEm: isNum(d.excluidaEm) ? d.excluidaEm : null,
          tardia: !!d.tardia && isNum(d.registradaEm), registradaEm: d.tardia && isNum(d.registradaEm) ? d.registradaEm : null };
        if (d.original && typeof d.original === 'object') {
          try { const ob = normalizeBlock(d.original.bloco), oa = normalizeApt(d.original.apto); e.original = { bloco: ob, apto: oa.apt, valor: isInt(d.original.valor) ? d.original.valor : null }; } catch { /* ignora */ }
        }
        sh.entregas.push(e);
      } catch { dropped++; }
    }
    out.push(sh);
  }
  return { shifts: out, dropped, droppedShifts };
}

/** Lê UM arquivo já convertido de JSON. Devolve uma lista de pacotes {rider, turnos, exp, ...} ou joga ImportErr. */
async function parsePackage(o) {
  if (!o || typeof o !== 'object') throw new ImportErr('Arquivo inválido.');
  if (o.formato === 'ponto-collina/consolidado' && Array.isArray(o.entregadores)) {
    const all = [];
    for (const e of o.entregadores) all.push(...await parsePackage(e));
    return all;
  }
  let riderId, turnosRaw, exp, integro = false;
  if (o.formato === EXPORT_FORMAT && o.versao === 2) {
    riderId = o.entregador?.id;
    if (!riderById(riderId)) throw new ImportErr(`Entregador desconhecido ("${str(riderId, 30)}"). Os nomes aceitos são: ${ROSTER.map((r) => r.nome).join(', ')}.`);
    turnosRaw = o.turnos;
    if (typeof o.integridade !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(o.integridade)) throw new ImportErr('Arquivo sem código de integridade.');
    const calc = 'sha256:' + await sha256hex(canonical({ entregador: riderId, turnos: turnosRaw }));
    if (calc !== o.integridade) throw new ImportErr('O conteúdo do arquivo não confere com o código de integridade (arquivo alterado ou corrompido).');
    integro = true;
    exp = isNum(o.exportadoEm) ? o.exportadoEm : 0;
  } else throw new ImportErr('Formato não reconhecido. Use o arquivo gerado por “Enviar fechamento ao gerente”.');
  const c = cleanShifts(turnosRaw, riderId);
  return [{ rider: riderId, turnos: c.shifts, exp, exemplo: !!o.exemplo, integro, descartadas: c.dropped, turnosDescartados: c.droppedShifts }];
}

/** Junta um pacote aos dados já guardados. Para o mesmo turno vale a versão do arquivo mais recente. */
function mergePackage(p) {
  const r = riderById(p.rider);
  const cur = (ST.riders[p.rider] ||= { id: r.id, nome: r.nome, exportadoEm: 0, turnos: [] });
  const map = new Map(cur.turnos.map((s) => [s.id, s]));
  let novos = 0, atualizados = 0, mantidos = 0;
  for (const s of p.turnos) {
    const sh = { ...s, _exp: p.exp, _ex: p.exemplo };
    const old = map.get(s.id);
    if (!old) { map.set(s.id, sh); novos++; }
    else if (p.exp >= (old._exp || 0)) { map.set(s.id, sh); atualizados++; }
    else mantidos++;
  }
  cur.turnos = [...map.values()].sort((a, b) => a.entrada - b.entrada);
  cur.exportadoEm = Math.max(cur.exportadoEm || 0, p.exp);
  return { novos, atualizados, mantidos };
}

/** Importa vários arquivos. Devolve um relatório por arquivo; nada é aplicado de um arquivo inválido. */
async function importTexts(files) {                 // files: [{name, text}]
  const report = [];
  for (const f of files) {
    try {
      let o;
      try { o = JSON.parse(f.text); } catch { throw new ImportErr('Não é um arquivo JSON válido.'); }
      const pkgs = await parsePackage(o);
      for (const p of pkgs) {
        const m = mergePackage(p);
        report.push({ nome: f.name, ok: true, entregador: riderById(p.rider).nome, ...m, descartadas: p.descartadas, exemplo: p.exemplo });
      }
    } catch (e) {
      report.push({ nome: f.name, ok: false, erro: e instanceof ImportErr ? e.message : 'Não consegui ler este arquivo.' });
      if (!(e instanceof ImportErr)) console.error(e);
    }
  }
  await mSave();
  return report;
}

/** Arquivo único com tudo (backup do gerente / saída do consolidar.py). */
async function buildConsolidated() {
  const entregadores = [];
  for (const r of ROSTER) {
    const x = ST.riders[r.id]; if (!x) continue;
    const turnos = activeTurnos(r.id).map(({ _exp, _ex, ...s }) => s);
    entregadores.push({ formato: EXPORT_FORMAT, versao: 2, entregador: { id: r.id, nome: r.nome }, exportadoEm: x.exportadoEm, turnos, integridade: 'sha256:' + await sha256hex(canonical({ entregador: r.id, turnos })) });
  }
  return { formato: 'ponto-collina/consolidado', versao: 2, geradoEm: now(), entregadores };
}
