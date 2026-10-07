/* Interface do entregador: envio ao gerente e Ajustes. */
/* ---------------- envio ao gerente ---------------- */
const riderOptions = (sel) => `<option value="">Escolha o seu nome</option>${ROSTER.map((r) => `<option value="${r.id}" ${r.id === sel ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}`;
/** Gera o arquivo de fechamento e abre o compartilhamento do aparelho (WhatsApp etc.); sem compartilhamento, baixa o arquivo. */
async function sendToManager() {
  try {
    const exp = await buildExport(DB);
    const name = `entregas-${exp.entregador.id}-${ymdOf(now())}.json`;
    const file = new File([JSON.stringify(exp)], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Fechamento de entregas', text: `Fechamento de ${exp.entregador.nome} · ${ymdToDm(ymdOf(now()))}` }); toast('Fechamento enviado'); return; }
      catch (e) { if (e && e.name === 'AbortError') return; /* sem compartilhamento: cai no download */ }
    }
    download(name, JSON.stringify(exp), 'application/json');
    toast('Arquivo gerado: envie ao gerente');
  } catch (e) { if (e instanceof AppErr) toast(e.message, 4500); else { console.error(e); toast('Não consegui gerar o arquivo.', 3500); } }
}
/** Quem já usava o site com outro nome precisa dizer quem é (o gerente identifica pelo nome da equipe). */
function askIdentity() {
  sheet(`<h3>Quem é você?</h3><p class="mut" style="font-size:14px">Escolha o seu nome para o gerente reconhecer os seus registros.</p>
    <div class="chips" id="idChips">${ROSTER.map((r) => `<button type="button" class="chip" data-r="${r.id}">${esc(r.nome)}</button>`).join('')}</div>`);
  $('idChips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    const r = riderById(c.dataset.r); DB.user = { ...DB.user, name: r.nome, id: r.id }; const n = applyLancamentos(); save(); closeSheet(); render(); toast(n ? `Olá, ${r.nome}. ${n} entrega(s) lançada(s) no seu histórico` : `Olá, ${r.nome}`, 4500);
  });
}

/* ---------------- ajustes ---------------- */
/** Com turnos registrados o nome fica fixo: trocar levaria o histórico de uma pessoa para o arquivo de outra. */
const identityLocked = () => !!DB.user?.id && DB.shifts.length > 0;
actions.settings = () => {
  sheet(`<h3>${esc(DB.user.name)}</h3><p class="mut" style="margin:0 0 4px;font-size:13px">Seus dados ficam só neste aparelho.</p>
    ${identityLocked()
      ? `<label>Quem é você?</label><p class="note" style="margin:0 0 6px"><b>${esc(DB.user.name)}</b> · o nome não pode ser trocado depois de registrar turnos, para não misturar os dados de duas pessoas. Se escolheu o nome errado, fale com o gerente.</p>`
      : `<label for="sName">Quem é você?</label><select id="sName">${riderOptions(DB.user.id)}</select>`}
    <label for="sGoal">Meta de entregas por turno</label><input type="number" id="sGoal" min="1" max="1000" inputmode="numeric" value="${DB.user.goal}">
    <label class="chk"><input type="checkbox" id="sAuto" ${DB.prefs.autoPhoto ? 'checked' : ''}> Registrar sozinho quando a leitura da foto for segura (com “Desfazer”)</label>
    <p id="sErr" class="lerr" style="text-align:left"></p>
    <button class="btn gold" id="sSave">Salvar</button>
    <h2 style="margin:22px 0 8px">Gerente</h2>
    ${syncConfig()
      ? `<div class="issue"><i id="sDot" style="background:var(--ok)"></i><span id="sStat"></span></div>
    <button class="btn gold" id="sSync" style="margin-top:8px">Enviar agora</button>
    <p class="mut" style="font-size:12px;margin:8px 0 12px">Seus registros vão sozinhos para o gerente a cada alteração. Se estiver sem internet, seguem quando voltar.</p>
    <button class="btn sm" id="sSend" style="width:100%">Enviar por arquivo (alternativa)</button>`
      : `<p class="mut" style="font-size:13px;margin:0 0 10px">Sem conexão automática. Peça ao gerente o link de conexão e abra-o neste aparelho; depois disso tudo vai sozinho.</p>
    <button class="btn" id="sSend">Enviar fechamento ao gerente</button>
    <p class="mut" style="font-size:12px;margin:8px 0 0">Gera um arquivo com os seus turnos e entregas (horários, pedidos e valores) para o gerente acompanhar. No celular, abre direto o compartilhamento (WhatsApp).</p>`}
    <h2 style="margin:22px 0 8px">Dados</h2>
    <div class="grid2"><button class="btn sm" id="sExport">Salvar backup</button><button class="btn sm" id="sImport">Restaurar backup</button></div>
    <button class="btn sm red" id="sWipe" style="width:100%;margin-top:8px">Apagar tudo</button>
    <p class="mut" style="font-size:12px;margin:12px 0 0">Faça backup de vez em quando: se limpar os dados do navegador, o que não tiver backup se perde. No celular, use “Adicionar à tela inicial” no menu do navegador para abrir como aplicativo.</p>
    <button class="btn" id="sClose" style="margin-top:16px">Fechar</button>`);
  $('sClose').onclick = closeSheet;
  $('sSave').onclick = () => {
    const rider = identityLocked() ? riderById(DB.user.id) : riderById($('sName').value), goal = Number($('sGoal').value);
    if (!rider) return ($('sErr').textContent = 'Escolha o seu nome na lista.');
    if (!Number.isInteger(goal) || goal < 1 || goal > 1000) return ($('sErr').textContent = 'A meta precisa ser um número de 1 a 1000.');
    DB.user = { name: rider.nome, id: rider.id, goal }; DB.prefs.autoPhoto = $('sAuto').checked; save(); closeSheet(); toast('Salvo'); render();
  };
  $('sSend').onclick = () => busy($('sSend'), sendToManager);
  if ($('sSync')) {
    const paint = () => { if (!$('sStat')) return; $('sStat').textContent = syncText(); $('sDot').style.background = SYNC.state.err ? 'var(--bad)' : 'var(--ok)'; };
    paint(); SYNC.listeners.push(paint);
    $('sSync').onclick = () => busy($('sSync'), async () => { const ok = await syncPush(); paint(); toast(ok ? 'Enviado ao gerente' : SYNC.state.err || 'Não foi possível enviar', ok ? 2500 : 4500); });
  }
  $('sExport').onclick = () => { download(`backup-ponto-${ymdOf(now())}.json`, JSON.stringify(DB), 'application/json'); toast('Backup salvo'); };
  $('sImport').onclick = () => $('importFile').click();
  $('sWipe').onclick = () => {
    const b = $('sWipe');
    if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Toque de novo para apagar TUDO'; return; }
    const user = DB.user; DB = emptyDb(); DB.user = user; save(); closeSheet(); toast('Dados apagados'); render();
  };
};
$('importFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    if (f.size > 8 * 1024 * 1024) throw new Error('Arquivo grande demais.');
    const imported = sanitizeDb(JSON.parse(await f.text()));
    assertSameRider(DB.user, imported.user);
    const ok = await confirmSheet({ title: 'Restaurar backup?', text: `Isto substitui os dados atuais por ${imported.shifts.length} turno(s) do backup.`, ok: 'Restaurar', danger: true });
    if (!ok) return;
    DB = imported; if (!DB.user) DB.user = { name: 'Entregador', goal: 60 };
    save(); toast('Backup restaurado'); render();
  } catch (err) { toast(err instanceof AppErr || (err.message && err.message.includes('inválido')) ? err.message : 'Não consegui ler esse arquivo de backup.', 4000); }
});
