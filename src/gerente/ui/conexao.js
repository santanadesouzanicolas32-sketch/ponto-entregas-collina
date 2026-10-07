/* Interface do gerente: conexão automática (configurar, link para os entregadores, atualizar). */
function connectCard() {
  const cfg = syncConfig();
  if (cfg) {
    return `<div class="card"><h2>Conexão automática</h2>
      <div class="issue ${PULL.err ? 'warn' : ''}"><i style="background:${PULL.err ? 'var(--bad)' : 'var(--ok)'}"></i><span>${PULL.err ? esc(PULL.err) : `Conectado a <b>${esc(cfg.repo)}</b>${PULL.at ? ` · conferido às ${fmtTime(PULL.at)}` : ''}`}<br><span class="note">Os registros dos entregadores chegam sozinhos (confere a cada minuto com esta página aberta).</span></span></div>
      <div class="grid2" style="margin-top:10px"><button class="btn sm gold" data-act="m-pull">Atualizar agora</button><button class="btn sm" data-act="m-link">Link para os entregadores</button></div>
      <button class="linkbtn" data-act="m-unlink" style="margin-top:8px">Desconectar este navegador</button></div>`;
  }
  return `<div class="card"><h2>Conexão automática</h2>
    <p class="note" style="margin:0 0 8px">Receba os registros dos entregadores sem trocar arquivos. Configuração única, uns 3 minutos:</p>
    <ol class="note" style="margin:0 0 10px;padding-left:20px;line-height:1.6">
      <li>Abra <a class="gold" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a> (conta dona do repositório).</li>
      <li>Nome: <b>ponto-collina</b> · validade: 1 ano · <b>Only select repositories</b> → <b>ponto-dados</b>.</li>
      <li>Em <b>Repository permissions</b>, ponha <b>Contents: Read and write</b>. Clique em <b>Generate token</b> e copie.</li>
      <li>Cole abaixo e toque em Conectar.</li></ol>
    <label for="cRepo">Repositório</label><input id="cRepo" value="${esc(SYNC_DEFAULT_REPO)}" autocomplete="off" autocapitalize="off" spellcheck="false">
    <label for="cTok">Token (chave de acesso)</label><input id="cTok" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_…">
    <p id="cErr" class="lerr" role="alert" style="text-align:left;margin:8px 0 0"></p>
    <button class="btn gold" id="cGo" style="margin-top:10px">Conectar</button></div>`;
}
function bindConnect() {
  const go = $('cGo');
  if (!go) return;
  go.onclick = () => busy(go, async () => {
    const err = (m) => { $('cErr').textContent = m || ''; };
    err('');
    const repo = $('cRepo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, ''), token = $('cTok').value.trim();
    if (!validRepo(repo)) return err('Escreva o repositório assim: dono/nome.');
    if (!validToken(token)) return err('Cole o token inteiro (começa com github_pat_ ou ghp_).');
    try {
      const info = await ghCheck({ repo, token });
      setSyncConfig({ repo, token });
      PULL.err = null;
      toast(info.private ? 'Conectado' : 'Conectado (atenção: este repositório é público)', 3500);
      await syncPull({ force: true });
      mRender();
      showLink();
    } catch (e) { err(e instanceof SyncErr ? e.message : 'Não consegui conectar.'); }
  });
}
/** Link que o gerente manda aos entregadores. */
function showLink() {
  const base = new URL('./', location.href).href, link = syncLink(base);
  if (!link) return;
  sheet(`<h3>Link para os entregadores</h3>
    <p class="mut" style="font-size:14px">Mande para cada entregador abrir <b>uma vez</b> no celular dele. A conexão fica guardada e os registros passam a chegar sozinhos.</p>
    <textarea id="lnk" readonly rows="4" style="width:100%;font-size:12px">${esc(link)}</textarea>
    <p class="note">O link leva a chave de acesso do repositório: envie só aos entregadores, no privado.</p>
    <div class="grid2" style="margin-top:12px"><button class="btn gold" id="lnkCopy">Copiar</button><button class="btn" id="lnkClose">Fechar</button></div>`);
  $('lnkClose').onclick = closeSheet;
  $('lnkCopy').onclick = async () => {
    try { if (navigator.share) { await navigator.share({ title: 'Ponto de Entregas Collina', text: 'Abra este link uma vez no seu celular:', url: link }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(link); toast('Link copiado'); } catch { $('lnk').select(); toast('Selecione e copie o link'); }
  };
}
actions['m-link'] = showLink;
actions['m-pull'] = (el) => busy(el, async () => {
  const r = await syncPull();
  if (!r) return toast('Sem conexão configurada');
  if (PULL.err) toast(PULL.err, 4500); else toast(r.changed ? 'Dados atualizados' : 'Nada de novo', 2500);
  if (!sheetOpen()) mRender();
});
actions['m-unlink'] = (el) => {
  if (!el.dataset.sure) { el.dataset.sure = '1'; el.textContent = 'Toque de novo para desconectar'; return; }
  setSyncConfig(null); ETAGS = {}; saveEtags(); PULL.at = null; PULL.err = null; mRender(); toast('Desconectado (os dados já baixados continuam aqui)');
};
/** Confere a nuvem de tempos em tempos enquanto a página está aberta. */
async function pullTick() {
  if (!syncConfig() || document.hidden) return;
  const r = await syncPull();
  if (!r) return;
  if (!sheetOpen() && (r.changed || PULL.err)) mRender();
  else $('topSub').textContent = $('topSub').textContent.replace(/ · ✓ .*$/, '') + ` · ✓ ${fmtTime(PULL.at)}`;
}
