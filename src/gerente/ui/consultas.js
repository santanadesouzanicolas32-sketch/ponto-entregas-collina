/* Interface do gerente: Consultas. */
/* ---------------- CONSULTAS ---------------- */
function renderCons(el) {
  if (!hasData()) { el.innerHTML = slicers(null) + emptyState(); return; }
  const q = MG.q;
  el.innerHTML = `<div class="card"><h2>Consultar registros</h2>
    <div class="bi-row" style="margin-bottom:10px">${ROSTER.map((r) => `<button class="chip2${q.riders.has(r.id) ? ' on' : ''}" data-act="m-qr" data-id="${r.id}">${rdot(r.id)}${esc(r.nome)}</button>`).join('')}</div>
    <div class="qgrid">
      <div><label for="qFrom">De (dia)</label><input type="date" id="qFrom" value="${q.from}"></div><div><label for="qTo">Até (dia)</label><input type="date" id="qTo" value="${q.to}"></div>
      <div><label for="qTF">Hora inicial</label><input type="time" id="qTF" value="${q.tFrom}"></div><div><label for="qTT">Hora final</label><input type="time" id="qTT" value="${q.tTo}"></div>
      <div><label for="qBlock">Bloco</label><select id="qBlock"><option value="">Todos</option>${CFG.blocks.map((b) => `<option ${q.block === b ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
      <div><label for="qApt">Apartamento</label><input id="qApt" maxlength="8" placeholder="ex.: 241" value="${esc(q.apt)}"></div>
      <div><label for="qVMin">Valor mínimo (R$)</label><input id="qVMin" inputmode="decimal" placeholder="0,00" value="${esc(q.vMin)}"></div><div><label for="qVMax">Valor máximo (R$)</label><input id="qVMax" inputmode="decimal" placeholder="0,00" value="${esc(q.vMax)}"></div>
      <div><label for="qSrc">Origem</label><select id="qSrc"><option value="">Todas</option><option value="photo" ${q.source === 'photo' ? 'selected' : ''}>Foto</option><option value="manual" ${q.source === 'manual' ? 'selected' : ''}>Digitado</option></select></div>
      <div><label for="qSt">Situação</label><select id="qSt"><option value="">Todas</option>${[['normal', 'Normal'], ['editada', 'Corrigida'], ['excluida', 'Excluída'], ['conferir', 'Para conferir'], ['tardia', 'Lançada depois']].map(([k, l]) => `<option value="${k}" ${q.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div class="grid2" style="margin-top:12px"><button class="btn" data-act="m-qclear">Limpar</button><button class="btn gold" data-act="m-qgo">Consultar</button></div></div>
    <div id="qres"></div>`;
  ['qFrom', 'qTo', 'qTF', 'qTT', 'qBlock', 'qSrc', 'qSt'].forEach((id) => { $(id).onchange = readQ; });
  ['qApt', 'qVMin', 'qVMax'].forEach((id) => { $(id).oninput = () => { clearTimeout(readQ.t); readQ.t = setTimeout(readQ, 250); }; });
  drawCons();
}
function readQ() {
  const q = MG.q;
  q.from = $('qFrom').value; q.to = $('qTo').value; q.tFrom = $('qTF').value; q.tTo = $('qTT').value; q.block = $('qBlock').value; q.apt = $('qApt').value;
  q.vMin = $('qVMin').value; q.vMax = $('qVMax').value; q.source = $('qSrc').value; q.status = $('qSt').value; MG.qpage = 1;
  drawCons();
}
actions['m-qr'] = (el) => { const id = el.dataset.id; MG.q.riders.has(id) ? MG.q.riders.delete(id) : MG.q.riders.add(id); MG.qpage = 1; mRender(); };
actions['m-qgo'] = () => { readQ(); };
actions['m-qclear'] = () => { MG.q = { riders: new Set(), from: '', to: '', tFrom: '', tTo: '', block: '', apt: '', vMin: '', vMax: '', source: '', status: '' }; MG.qpage = 1; mRender(); };

function qFilters() {
  const q = MG.q, num2 = (v) => { if (v === '' || v == null) return null; try { return parseMoney(v); } catch { return NaN; } };
  const vMin = num2(q.vMin), vMax = num2(q.vMax);
  return { ok: !Number.isNaN(vMin) && !Number.isNaN(vMax), f: { ...q, vMin, vMax } };
}
function drawCons() {
  const { ok, f } = qFilters(), box = $('qres');
  if (!ok) { box.innerHTML = '<div class="errbox">Valor inválido. Use o formato 52,90.</div>'; return; }
  const rows = queryDeliveries(f), k = MG.qsort.k, dir = MG.qsort.dir;
  rows.sort((a, b) => ((k === 't' ? a.t - b.t : k === 'v' ? (a.valor ?? -1) - (b.valor ?? -1) : k === 'r' ? rname(a.rid).localeCompare(rname(b.rid)) : k === 'b' ? (a.bloco + a.apto).localeCompare(b.bloco + b.apto) : 0) * dir) || b.t - a.t);
  const live = rows.filter((d) => !d.excluida), sum = live.reduce((a, d) => a + (d.valor || 0), 0), shown = rows.slice(0, MG.qpage * 40);
  const th = (kk, l, cls = '') => `<th class="${cls}" style="cursor:pointer" data-act="m-qsort" data-k="${kk}">${l}${k === kk ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  box.innerHTML = `<div class="card"><div class="row-between" style="margin-bottom:10px"><h2 style="margin:0">${rows.length} registro(s) · ${brl(sum)}</h2><button class="btn sm" data-act="m-qcsv" ${rows.length ? '' : 'disabled'}>Baixar planilha</button></div>
    ${shown.length ? `<div class="scroll"><table class="mtable"><tr>${th('r', 'Entregador')}${th('t', 'Data e hora')}${th('b', 'Pedido')}${th('v', 'Valor')}<th>Origem</th><th>Situação</th></tr>
      ${shown.map((d) => `<tr data-act="m-del" data-r="${d.rid}" data-d="${esc(d.id)}"><td>${rlabel(d.rid)}</td><td>${fmtDM(d.t)} ${fmtTimeSec(d.t)}</td><td>${esc(d.bloco)} ${esc(d.apto)}</td><td>${d.valor != null ? brl(d.valor) : '<span class="low">—</span>'}</td><td>${d.origem === 'photo' ? 'foto' : 'digitado'}</td><td>${statusOf(d)}${d.tardia ? ' · depois' : ''}</td></tr>`).join('')}</table></div>
      ${shown.length < rows.length ? '<button class="btn sm loadmore" data-act="m-qmore">Carregar mais</button>' : ''}` : '<div class="empty">Nenhum registro com esses filtros.</div>'}</div>`;
}
actions['m-qsort'] = (el) => { const k = el.dataset.k; MG.qsort = { k, dir: MG.qsort.k === k ? -MG.qsort.dir : (k === 't' || k === 'v' ? -1 : 1) }; drawCons(); };
actions['m-qmore'] = () => { MG.qpage++; drawCons(); };
actions['m-qcsv'] = () => {
  const { f } = qFilters(), rows = queryDeliveries(f).sort((a, b) => a.t - b.t);
  const head = ['Entregador', 'Data', 'Hora', 'Bloco', 'Apartamento', 'Andar', 'Valor (R$)', 'Origem', 'Situacao', 'Original', 'Corrigida em', 'Excluida em'];
  const body = rows.map((d) => [rname(d.rid), d.data, fmtTimeSec(d.t), d.bloco, d.apto, d.andar === 0 ? 'SS' : d.andar, d.valor == null ? '' : (d.valor / 100).toFixed(2).replace('.', ','), d.origem === 'photo' ? 'foto' : 'digitado', statusOf(d) + (d.tardia ? ' (lançada depois)' : ''),
    d.original ? `${d.original.bloco} ${d.original.apto} ${d.original.valor == null ? '' : (d.original.valor / 100).toFixed(2).replace('.', ',')}` : '', d.editadaEm ? fmtDateTime(d.editadaEm) : '', d.excluidaEm ? fmtDateTime(d.excluidaEm) : '']);
  download(`registros-${ymdOf(now())}.csv`, '﻿' + [head, ...body].map((r) => r.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  toast(`${rows.length} registros na planilha`);
};
