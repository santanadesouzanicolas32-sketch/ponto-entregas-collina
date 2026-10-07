/* Interface do gerente: Dados, conexão e início. */
/* ---------------- DADOS (importação e qualidade) ---------------- */
/** Turnos que o gerente tirou das análises (com opção de restaurar). */
function ignoredCard() {
  const l = ignoredList();
  if (!l.length) return '';
  return `<div class="card"><h2>Turnos ignorados nas análises</h2>${l.map((i) => `<div class="issue"><i></i><span>${rlabel(i.rid)} · ${ymdToDm(i.data)} · ${i.entregas} entregas<br><span class="note">${esc(i.motivo || '')} · ${fmtDateTime(i.em)}</span></span><button class="linkbtn" data-act="m-restore" data-r="${i.rid}" data-s="${esc(i.sid)}">Restaurar</button></div>`).join('')}</div>`;
}
actions['m-restore'] = async (el) => { await restoreShift(el.dataset.r, el.dataset.s); mRender(); toast('Turno restaurado'); };

function renderDados(el) {
  const q = dataQuality();
  el.innerHTML = connectCard() + `<div class="card"><h2>Importar fechamentos</h2>
      <div class="drop" id="drop" data-act="m-import" role="button" tabindex="0">Toque aqui ou arraste os arquivos <b>.json</b> dos entregadores<br><span style="font-size:12px">Pode importar vários de uma vez. Reimportar não duplica: vale o arquivo mais recente de cada turno.</span></div></div>
    <div class="card"><h2>Situação por entregador</h2><div class="scroll"><table class="mtable"><tr><th>Entregador</th><th>Último envio</th><th>Turnos</th><th>Entregas</th><th>Situação</th></tr>
      ${ROSTER.map((r) => { const x = ST.riders[r.id]; if (!x) return `<tr><td>${rlabel(r.id)}</td><td class="low" colspan="3">nenhum arquivo importado</td><td><span class="statpill warn">sem dados</span></td></tr>`;
        const fr = freshness(x), tt = activeTurnos(r.id), n = tt.reduce((a, s) => a + s.entregas.filter((e) => !e.excluida).length, 0);
        return `<tr><td>${rlabel(r.id)}</td><td>${fmtDateTime(x.exportadoEm)}</td><td>${tt.length}</td><td>${n}</td><td><span class="statpill ${fr.cls}">${fr.text}</span></td></tr>`; }).join('')}</table></div></div>
    ${ignoredCard()}
    <div class="card"><h2>Pontos de atenção</h2>${q.length ? q.map((i) => `<div class="issue ${i.level}"><i></i><span>${esc(i.text)}</span></div>`).join('') : '<div class="empty">Nada a destacar.</div>'}</div>
    <div class="card"><h2>Sobre os dados</h2><p class="note" style="margin:0">Os números vêm exclusivamente dos arquivos que cada entregador enviou pelo aplicativo (<b>Ajustes → Enviar fechamento ao gerente</b>). Cada arquivo tem um código de integridade: se for alterado depois de gerado, a importação recusa. Os dados ficam só neste navegador. <button class="linkbtn" data-act="m-method">Como a comparação é feita</button></p></div>
    <div class="card"><h2>Manutenção</h2><div class="grid2"><button class="btn sm" data-act="m-export">Baixar tudo (consolidado)</button><button class="btn sm" data-act="m-rmex">Remover dados de exemplo</button></div>
      <button class="btn sm red" data-act="m-wipe" style="width:100%;margin-top:8px">Apagar todos os dados</button></div>`;
  bindConnect();
  const drop = $('drop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); handleFiles([...e.dataTransfer.files]); });
}
async function handleFiles(files) {
  if (!files.length) return;
  const texts = [];
  for (const f of files) texts.push({ name: f.name, text: f.size > 20 * 1024 * 1024 ? '' : await f.text() });
  const rep = await importTexts(texts);
  mRender();
  const ok = rep.filter((r) => r.ok).length;
  sheet(`<h3>${ok} de ${rep.length} arquivo(s) importado(s)</h3>${rep.map((r) => r.ok
    ? `<div class="issue"><i style="background:var(--ok)"></i><span><b>${esc(r.entregador)}</b> · ${esc(r.nome)}<br>${r.novos} turno(s) novo(s), ${r.atualizados} atualizado(s)${r.mantidos ? `, ${r.mantidos} mantido(s) (versão mais antiga ignorada)` : ''}${r.descartadas ? `<br><span class="warnc">${r.descartadas} registro(s) inválido(s) descartado(s)</span>` : ''}${r.exemplo ? '<br><span class="warnc">Dados de EXEMPLO.</span>' : ''}</span></div>`
    : `<div class="issue warn"><i style="background:var(--bad)"></i><span><b>${esc(r.nome)}</b><br>${esc(r.erro)}</span></div>`).join('')}
    <button class="btn gold" id="mClose" style="margin-top:14px">Ok</button>`);
  $('mClose').onclick = closeSheet;
}
$('mfile').addEventListener('change', (e) => { const f = [...e.target.files]; e.target.value = ''; handleFiles(f); });
actions['m-export'] = async () => { const c = await buildConsolidated(); download(`consolidado-${ymdOf(now())}.json`, JSON.stringify(c), 'application/json'); toast('Arquivo consolidado gerado'); };
actions['m-rmex'] = async () => {
  let n = 0;
  for (const x of Object.values(ST.riders)) { const before = x.turnos.length; x.turnos = x.turnos.filter((s) => !s._ex); n += before - x.turnos.length; }
  for (const id of Object.keys(ST.riders)) if (!ST.riders[id].turnos.length) delete ST.riders[id];
  await mSave(); mRender(); toast(`${n} turno(s) de exemplo removido(s)`);
};
actions['m-wipe'] = async (el) => {
  if (!el.dataset.sure) { el.dataset.sure = '1'; el.textContent = 'Toque de novo para apagar TUDO'; return; }
  ST = novoEstado(); ETAGS = {}; saveEtags(); await mSave(); mRender(); toast('Dados apagados deste navegador');
};

async function mgrBoot() {
  document.querySelectorAll('img[data-logo]').forEach((i) => { i.src = LOGO; });
  $('ico').href = LOGO; $('ico2').href = LOGO;
  await mLoad();
  buildMNav(); $('boot').classList.add('hide'); $('app').classList.remove('hide');
  const first = ROSTER.find((r) => ST.riders[r.id]); if (first && !ST.riders[MG.rider]) MG.rider = first.id;
  mRender();
  pullTick();
  setInterval(pullTick, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pullTick(); });
}
